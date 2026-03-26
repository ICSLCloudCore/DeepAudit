"""
Skill Management API
"""

import os
import subprocess
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
from app.models import OpenCodeSkill, SkillCategory
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

        # Execute opencode serve command directly without waiting for it to finish
        
        # Start the process directly with proper path handling
        try:
            log_file = open(log_path, "w")
            proc = subprocess.Popen(
                ["opencode", "serve"],
                cwd=project_path,
                stdout=log_file,
                stderr=log_file,
                preexec_fn=os.setpgrp  # Create new process group
            )
            pid = str(proc.pid)
        except Exception as e:
            print(f"[OpenCode] Failed to start opencode serve: {e}")
            import traceback
            traceback.print_exc()
            return

        # Wait a bit for the log to be written
        import asyncio
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
    import tempfile
    from app.core.platform_config import get_opencode_skills_dir, ensure_dir_exists
    from app.core.config import settings

    file_content = await file.read()
    checksum = hashlib.sha256(file_content).hexdigest()

    # 保持原始文件名，只做基本安全检查防止路径遍历
    original_filename = file.filename or "skill"
    safe_filename = os.path.basename(original_filename)
    if not safe_filename:
        safe_filename = "skill"

    # 只接受zip格式
    if not safe_filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="只支持ZIP格式的文件")

    # 获取跨平台的OpenCode Skills目录
    opencode_skills_dir = get_opencode_skills_dir()
    ensure_dir_exists(opencode_skills_dir)

    # 确保skills zip存储目录存在
    skills_zip_dir = Path(settings.SKILLS_ZIP_STORAGE_PATH)
    skills_zip_dir.mkdir(parents=True, exist_ok=True)

    # 创建临时目录用于检查zip内容
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_zip_path = os.path.join(temp_dir, safe_filename)
        with open(temp_zip_path, "wb") as f:
            f.write(file_content)

        # 检查zip内容
        root_dirs = set()
        has_skill_md = False
        skill_dir_name = None

        try:
            with zipfile.ZipFile(temp_zip_path, "r") as zip_ref:
                # 遍历zip中的所有文件
                for info in zip_ref.infolist():
                    # 获取路径的第一部分（根目录）
                    parts = info.filename.split("/")
                    if len(parts) > 0 and parts[0]:
                        root_dirs.add(parts[0])
                        # 检查是否有SKILL.md在根目录下
                        if len(parts) == 2 and parts[1] == "SKILL.md":
                            has_skill_md = True
                            skill_dir_name = parts[0]

                # 检查是否只有一个根目录
                if len(root_dirs) != 1:
                    raise HTTPException(
                        status_code=400,
                        detail=f"ZIP格式不符：必须包含且仅包含一个根目录，当前包含 {len(root_dirs)} 个"
                    )

                # 检查是否包含SKILL.md
                if not has_skill_md:
                    raise HTTPException(
                        status_code=400,
                        detail="ZIP格式不符：根目录下必须包含SKILL.md文件"
                    )

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(
                status_code=400,
                detail=f"ZIP文件解析失败：{str(e)}"
            )

        # 检查目标目录是否已存在
        skill_dir = os.path.join(opencode_skills_dir, skill_dir_name)
        if os.path.exists(skill_dir):
            raise HTTPException(
                status_code=400,
                detail=f"技能目录 '{skill_dir_name}' 已存在，请使用其他名称或删除现有技能"
            )

        # 解压到opencode_skills_dir
        with zipfile.ZipFile(temp_zip_path, "r") as zip_ref:
            zip_ref.extractall(opencode_skills_dir)

        # 保存原始zip文件到项目upload的skills目录下
        skills_zip_file_path = skills_zip_dir / safe_filename
  
        with open(skills_zip_file_path, "wb") as f:
            f.write(file_content)

    # 创建数据库记录
    skill = OpenCodeSkill(
        name=name,
        version=version,
        description=description,
        author=getattr(current_user, "full_name", "unknown"),
        category=category,
        file_path=str(skills_zip_file_path),
        opencode_file_path=skill_dir,
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


@router.get("/skills/{skill_id}/download")
async def download_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Download a skill as a ZIP file.

    優先返回上传时保存的原始 ZIP；若原始 ZIP 不存在但 opencode_file_path 目录存在，
    则即时打包 opencode_file_path 目录并返回。
    """
    from fastapi.responses import FileResponse, StreamingResponse
    import io
    import zipfile as _zipfile

    result = await db.execute(select(OpenCodeSkill).where(OpenCodeSkill.id == skill_id))
    skill = result.scalar_one_or_none()

    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    # 优先使用上传时保存的原始 ZIP
    if skill.file_path and os.path.isfile(skill.file_path):
        filename = os.path.basename(skill.file_path)
        return FileResponse(
            path=skill.file_path,
            media_type="application/zip",
            filename=filename,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # fallback：从 opencode_file_path 目录即时打包
    if skill.opencode_file_path and os.path.isdir(skill.opencode_file_path):
        buf = io.BytesIO()
        base_dir = Path(skill.opencode_file_path)
        dir_name = base_dir.name
        with _zipfile.ZipFile(buf, "w", _zipfile.ZIP_DEFLATED) as zf:
            for file_path in base_dir.rglob("*"):
                if file_path.is_file():
                    arcname = dir_name / file_path.relative_to(base_dir)
                    zf.write(file_path, arcname)
        buf.seek(0)
        safe_name = f"{skill.name.replace(' ', '_')}-{skill.version}.zip"
        return StreamingResponse(
            buf,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
        )

    raise HTTPException(status_code=404, detail="Skill 文件不存在，无法下载")


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

    # 获取技能目录名并删除
    deleted_files = []
    if skill.opencode_file_path:
        # 按照目录名删除整个技能目录
        if delete_file_or_dir(skill.opencode_file_path):
            deleted_files.append(skill.opencode_file_path)

    # 删除原始zip文件
    if skill.file_path:
        if delete_file_or_dir(skill.file_path):
            deleted_files.append(skill.opencode_file_path)

    # 从数据库删除记录
    await db.delete(skill)
    await db.commit()

    return {"message": "Skill deleted successfully", "deleted_files": deleted_files}
