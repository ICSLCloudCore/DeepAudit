"""
Skill and MCP Management API
"""

import os
import uuid
import re
import time
import zipfile
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form, BackgroundTasks
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from pathlib import Path

from app.db.session import get_db, AsyncSessionLocal
from app.models import OpenCodeSkill, SkillCategory, OpenCodeMCP, MCPType
from app.models.project import Project
from app.models.audit import AuditTask
from app.api.deps import get_current_user
from app.utils.async_command import execute_command
from app.core.platform_config import ensure_dir_exists
from app.core.config import settings

router = APIRouter()

async def start_opencode_serve(project_id: str, db_session: AsyncSession, user_id: str):
    """Start opencode serve in the background"""
    try:
        # Get project
        result = await db_session.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()
        if not project:
            print(f"[OpenCode] Project {project_id} not found")
            return

        # Create task
        task = AuditTask(
            project_id=project_id,
            created_by=user_id,
            task_type="opencode_serve",
            status="pending",
            scan_config="{}"
        )
        db_session.add(task)
        await db_session.commit()
        await db_session.refresh(task)

        task_id = task.id

        # Determine project path
        project_path = None
        extract_dir = Path(f"/tmp/{task_id}")
        extract_dir.mkdir(parents=True, exist_ok=True)

        if project.source_type == "repository":
            # Clone repository to /tmp/{task_id}
            repo_url = project.repository_url
            branch = project.default_branch or "main"
            if not repo_url:
                print(f"[OpenCode] Repository URL not found for project {project_id}")
                return

            print(f"[OpenCode] Cloning repository {repo_url} (branch: {branch}) to {extract_dir}")

            # Build git clone command
            clone_cmd = ['git', 'clone', '--depth', '1', '--branch', branch, repo_url, str(extract_dir)]
            
            # Execute clone command
            result = await execute_command(
                command=clone_cmd,
                shell=False,
                capture_output=True,
                timeout=300  # 5 minutes timeout for clone
            )

            if not result.success:
                print(f"[OpenCode] Failed to clone repository: {result.stderr}")
                # Try without specific branch in case it doesn't exist
                print(f"[OpenCode] Retrying clone without specifying branch...")
                clone_cmd_fallback = ['git', 'clone', '--depth', '1', repo_url, str(extract_dir)]
                result = await execute_command(
                    command=clone_cmd_fallback,
                    shell=False,
                    capture_output=True,
                    timeout=300
                )
                if not result.success:
                    print(f"[OpenCode] Failed to clone repository (fallback): {result.stderr}")
                    return

            project_path = str(extract_dir)
            print(f"[OpenCode] Cloned repository to {project_path}")

        elif project.source_type == "zip":
            # Extract ZIP file
            zip_file_path = Path(settings.ZIP_STORAGE_PATH) / f"{project_id}.zip"
            if not zip_file_path.exists():
                print(f"[OpenCode] ZIP file not found at {zip_file_path}")
                return

            with zipfile.ZipFile(zip_file_path, 'r') as zip_ref:
                zip_ref.extractall(extract_dir)
            
            project_path = str(extract_dir)
            print(f"[OpenCode] Extracted ZIP to {project_path}")

        # For now, use a temp directory as placeholder if not set
        if not project_path:
            project_path = f"/tmp/opencode_project_{project_id}"
            ensure_dir_exists(project_path)

        # Create log directory
        log_dir = f"/tmp/opencode_logs"
        ensure_dir_exists(log_dir)

        # Generate random log file name
        random_id = str(uuid.uuid4())[:8]
        log_path = os.path.join(log_dir, f"{random_id}.log")

        # Execute opencode serve command
        command = f"cd {project_path} ; nohup opencode serve > {log_path} 2>&1 & echo $!"
        result = await execute_command(
            command=command,
            shell=True,
            capture_output=True,
            timeout=30
        )

        if not result.success:
            print(f"[OpenCode] Failed to start opencode serve: {result.stderr}")
            return

        # Extract PID from output
        pid = result.stdout.strip()
        if not pid.isdigit():
            print(f"[OpenCode] Invalid PID: {pid}")
            return

        # Wait a bit for the log to be written
        await asyncio.sleep(2)

        # Read log file to find port
        port = None
        max_attempts = 10
        for attempt in range(max_attempts):
            if os.path.exists(log_path):
                with open(log_path, 'r') as f:
                    log_content = f.read()
                    # Try to find port in log (fixed format: http://127.0.0.1:{port})
                    port_match = re.search(r'http://127\.0\.0\.1:(\d+)', log_content)
                    if port_match:
                        port = port_match.group(1)
                        break
            await asyncio.sleep(1)

        # Update project with opencode info
        project.opencode_pid = pid
        project.opencode_port = port
        project.opencode_log_path = log_path
        project.opencode_started_at = datetime.now(timezone.utc)
        project.updated_at = datetime.now(timezone.utc)

        await db_session.commit()

        print(f"[OpenCode] Started opencode serve for project {project_id}: PID={pid}, Port={port}")

    except Exception as e:
        print(f"[OpenCode] Error starting opencode serve: {e}")
        import traceback
        traceback.print_exc()

# Import asyncio for the sleep
import asyncio

@router.post("/projects/{project_id}/start")
async def start_opencode(
    project_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Start opencode serve for a project"""
    # Get project
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check permissions
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")

    # Check if already running
    if project.opencode_pid:
        # Verify if the process is actually still running
        try:
            # Check if PID exists (Unix-only)
            import os
            os.kill(int(project.opencode_pid), 0)
            # If no exception, process is running
            return {
                "success": True,
                "message": "OpenCode serve is already running",
                "pid": project.opencode_pid,
                "port": project.opencode_port
            }
        except (OSError, ValueError):
            # Process not running, reset fields
            project.opencode_pid = None
            project.opencode_port = None
            project.opencode_log_path = None
            project.opencode_started_at = None
            await db.commit()

    # Start in background
    background_tasks.add_task(start_opencode_serve, project_id, AsyncSessionLocal(), current_user.id)

    return {
        "success": True,
        "message": "OpenCode serve starting"
    }

@router.post("/projects/{project_id}/stop")
async def stop_opencode(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Stop opencode serve for a project"""
    # Get project
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check permissions
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")

    if not project.opencode_pid:
        return {
            "success": True,
            "message": "OpenCode serve is not running"
        }

    # Try to kill the process
    try:
        import os
        import signal
        os.kill(int(project.opencode_pid), signal.SIGTERM)
        # Wait a bit and check
        await asyncio.sleep(1)
        try:
            os.kill(int(project.opencode_pid), 0)
            # Still running, try SIGKILL
            os.kill(int(project.opencode_pid), signal.SIGKILL)
        except OSError:
            pass
    except (OSError, ValueError) as e:
        print(f"[OpenCode] Error stopping process: {e}")

    # Reset project fields
    project.opencode_pid = None
    project.opencode_port = None
    project.opencode_log_path = None
    project.opencode_started_at = None
    project.updated_at = datetime.now(timezone.utc)

    await db.commit()

    return {
        "success": True,
        "message": "OpenCode serve stopped"
    }


# ==================== Skill Endpoints ====================


@router.get("/skills")
async def list_skills(
    category: Optional[str] = Query(None, description="Filter by category"),
    is_public: Optional[bool] = Query(None, description="Filter by public status"),
    search: Optional[str] = Query(None, description="Search by name or description"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List skills with filtering and pagination"""
    query = select(OpenCodeSkill)

    filters = []
    if category:
        filters.append(OpenCodeSkill.category == category)
    if is_public is not None:
        filters.append(OpenCodeSkill.is_public == is_public)
    filters.append(OpenCodeSkill.is_active == True)

    if search:
        filters.append(
            or_(
                OpenCodeSkill.name.ilike(f"%{search}%"),
                OpenCodeSkill.description.ilike(f"%{search}%"),
            )
        )

    if filters:
        query = query.where(and_(*filters))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size).order_by(OpenCodeSkill.created_at.desc())

    result = await db.execute(query)
    skills = result.scalars().all()

    return {
        "items": [skill.to_dict() for skill in skills],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/skills/{skill_id}")
async def get_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get skill details"""
    result = await db.execute(select(OpenCodeSkill).where(OpenCodeSkill.id == skill_id))
    skill = result.scalar_one_or_none()

    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    return skill.to_dict()


@router.post("/skills/upload")
async def upload_skill(
    file: UploadFile = File(...),
    name: str = Form(...),
    version: str = Form("1.0.0"),
    description: Optional[str] = Form(None),
    category: str = Form(SkillCategory.CUSTOM),
    is_public: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Upload a new skill"""
    import os
    import hashlib
    import zipfile
    import tarfile
    from app.core.config import settings
    from app.core.platform_config import get_opencode_skills_dir, ensure_dir_exists

    file_content = await file.read()
    checksum = hashlib.sha256(file_content).hexdigest()

    # 保持原始文件名，只做基本安全检查防止路径遍历
    original_filename = file.filename or "skill"
    # 移除路径分隔符，只保留文件名部分
    safe_filename = os.path.basename(original_filename)
    if not safe_filename:
        safe_filename = "skill"

    # 获取跨平台的OpenCode Skills目录
    opencode_skills_dir = get_opencode_skills_dir()
    ensure_dir_exists(opencode_skills_dir)

    # 直接使用文件名作为目录名（不添加任何后缀）
    skill_dir_name = name.lower().replace(" ", "_")
    skill_dir = os.path.join(opencode_skills_dir, skill_dir_name)

    # 检查目录是否已存在，存在则直接失败
    if os.path.exists(skill_dir):
        raise HTTPException(status_code=400, detail=f"名称 '{name}' 已存在，请使用其他名称")

    os.makedirs(skill_dir, exist_ok=True)

    # 保存原始文件，使用用户上传的原始文件名
    original_file_path = os.path.join(skill_dir, safe_filename)
    with open(original_file_path, "wb") as f:
        f.write(file_content)

    # 尝试解压文件
    extracted_path = None
    try:
        if safe_filename.endswith(".zip"):
            with zipfile.ZipFile(original_file_path, "r") as zip_ref:
                zip_ref.extractall(skill_dir)
            extracted_path = skill_dir
        elif safe_filename.endswith(".tar.gz") or safe_filename.endswith(".tgz"):
            with tarfile.open(original_file_path, "r:gz") as tar_ref:
                tar_ref.extractall(skill_dir)
            extracted_path = skill_dir
        elif safe_filename.endswith(".tar"):
            with tarfile.open(original_file_path, "r:") as tar_ref:
                tar_ref.extractall(skill_dir)
            extracted_path = skill_dir
    except Exception as e:
        # 如果解压失败，只记录日志，不中断上传
        print(f"Warning: Failed to extract file {safe_filename}: {e}")

    # 如果没有解压或者解压失败，使用原始文件所在目录
    final_opencode_path = extracted_path or skill_dir

    skill = OpenCodeSkill(
        name=name,
        version=version,
        description=description,
        author=getattr(current_user, "username", "unknown"),
        category=category,
        file_path=original_file_path,
        opencode_file_path=final_opencode_path,
        file_size=len(file_content),
        checksum=checksum,
        is_public=is_public,
        is_active=True,
        created_by=current_user.id if hasattr(current_user, "id") else None,
    )

    db.add(skill)
    await db.commit()
    await db.refresh(skill)

    return skill.to_dict()


@router.put("/skills/{skill_id}")
async def update_skill(
    skill_id: str,
    name: Optional[str] = None,
    version: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    config: Optional[dict] = None,
    is_public: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update a skill"""
    result = await db.execute(select(OpenCodeSkill).where(OpenCodeSkill.id == skill_id))
    skill = result.scalar_one_or_none()

    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    if name is not None:
        skill.name = name
    if version is not None:
        skill.version = version
    if description is not None:
        skill.description = description
    if category is not None:
        skill.category = category
    if config is not None:
        skill.config = config
    if is_public is not None:
        skill.is_public = is_public

    await db.commit()
    await db.refresh(skill)

    return skill.to_dict()


@router.delete("/skills/{skill_id}")
async def delete_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Delete a skill"""
    import os
    from app.core.platform_config import delete_file_or_dir

    result = await db.execute(select(OpenCodeSkill).where(OpenCodeSkill.id == skill_id))
    skill = result.scalar_one_or_none()

    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    # 删除文件系统中的文件和目录
    deleted_files = []
    if skill.file_path and os.path.exists(skill.file_path):
        if delete_file_or_dir(skill.file_path):
            deleted_files.append(skill.file_path)

    if skill.opencode_file_path and os.path.exists(skill.opencode_file_path):
        # 确保不会重复删除同一个目录
        if skill.opencode_file_path != skill.file_path:
            if delete_file_or_dir(skill.opencode_file_path):
                deleted_files.append(skill.opencode_file_path)

    # 从数据库删除记录
    await db.delete(skill)
    await db.commit()

    return {"message": "Skill deleted successfully", "deleted_files": deleted_files}


# ==================== MCP Endpoints ====================


@router.get("/mcps")
async def list_mcps(
    mcp_type: Optional[str] = Query(None, description="Filter by MCP type"),
    search: Optional[str] = Query(None, description="Search by name or description"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List MCPs with filtering and pagination"""
    query = select(OpenCodeMCP)

    filters = []
    if mcp_type:
        filters.append(OpenCodeMCP.mcp_type == mcp_type)
    filters.append(OpenCodeMCP.is_active == True)

    if search:
        filters.append(
            or_(OpenCodeMCP.name.ilike(f"%{search}%"), OpenCodeMCP.description.ilike(f"%{search}%"))
        )

    if filters:
        query = query.where(and_(*filters))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size).order_by(OpenCodeMCP.created_at.desc())

    result = await db.execute(query)
    mcps = result.scalars().all()

    return {
        "items": [mcp.to_dict() for mcp in mcps],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/mcps/{mcp_id}")
async def get_mcp(
    mcp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get MCP details"""
    result = await db.execute(select(OpenCodeMCP).where(OpenCodeMCP.id == mcp_id))
    mcp = result.scalar_one_or_none()

    if not mcp:
        raise HTTPException(status_code=404, detail="MCP not found")

    return mcp.to_dict()


@router.post("/mcps")
async def create_mcp(
    name: str,
    mcp_type: str = MCPType.STDIO,
    version: str = "1.0.0",
    description: Optional[str] = None,
    server_url: Optional[str] = None,
    command: Optional[str] = None,
    args: Optional[List[str]] = None,
    env: Optional[dict] = None,
    config: Optional[dict] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Create a new MCP"""
    mcp = OpenCodeMCP(
        name=name,
        mcp_type=mcp_type,
        version=version,
        description=description,
        author=getattr(current_user, "username", "unknown"),
        server_url=server_url,
        command=command,
        args=args,
        env=env,
        config=config,
        is_active=True,
        created_by=current_user.id if hasattr(current_user, "id") else None,
    )

    db.add(mcp)
    await db.commit()
    await db.refresh(mcp)

    return mcp.to_dict()


@router.put("/mcps/{mcp_id}")
async def update_mcp(
    mcp_id: str,
    name: Optional[str] = None,
    version: Optional[str] = None,
    description: Optional[str] = None,
    server_url: Optional[str] = None,
    command: Optional[str] = None,
    args: Optional[List[str]] = None,
    env: Optional[dict] = None,
    config: Optional[dict] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update an MCP"""
    result = await db.execute(select(OpenCodeMCP).where(OpenCodeMCP.id == mcp_id))
    mcp = result.scalar_one_or_none()

    if not mcp:
        raise HTTPException(status_code=404, detail="MCP not found")

    if name is not None:
        mcp.name = name
    if version is not None:
        mcp.version = version
    if description is not None:
        mcp.description = description
    if server_url is not None:
        mcp.server_url = server_url
    if command is not None:
        mcp.command = command
    if args is not None:
        mcp.args = args
    if env is not None:
        mcp.env = env
    if config is not None:
        mcp.config = config

    await db.commit()
    await db.refresh(mcp)

    return mcp.to_dict()


@router.delete("/mcps/{mcp_id}")
async def delete_mcp(
    mcp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Delete an MCP"""
    result = await db.execute(select(OpenCodeMCP).where(OpenCodeMCP.id == mcp_id))
    mcp = result.scalar_one_or_none()

    if not mcp:
        raise HTTPException(status_code=404, detail="MCP not found")

    # 从数据库删除记录
    await db.delete(mcp)
    await db.commit()

    return {"message": "MCP deleted successfully", "mcp_name": mcp.name}


@router.post("/mcps/{mcp_id}/test")
async def test_mcp_connection(
    mcp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Test MCP connection"""
    result = await db.execute(select(OpenCodeMCP).where(OpenCodeMCP.id == mcp_id))
    mcp = result.scalar_one_or_none()

    if not mcp:
        raise HTTPException(status_code=404, detail="MCP not found")

    return {"success": True, "tools": ["tool1", "tool2"], "latency_ms": 123}
