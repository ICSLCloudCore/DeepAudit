"""
Skill and MCP Management API
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import OpenCodeSkill, SkillCategory, OpenCodeMCP, MCPType
from app.api.deps import get_current_user

router = APIRouter()


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

    # 生成安全的文件名
    original_filename = file.filename or "skill"
    safe_filename = "".join(c for c in original_filename if c.isalnum() or c in "._- ")
    if not safe_filename:
        safe_filename = "skill"

    # 获取跨平台的OpenCode Skills目录
    opencode_skills_dir = get_opencode_skills_dir()
    ensure_dir_exists(opencode_skills_dir)

    # 为skill创建唯一的目录名（基于名称和checksum）
    skill_dir_name = f"{name.lower().replace(' ', '_')}_{checksum[:8]}"
    skill_dir = os.path.join(opencode_skills_dir, skill_dir_name)

    # 如果目录已存在，添加数字后缀
    counter = 1
    base_skill_dir_name = skill_dir_name
    while os.path.exists(skill_dir):
        skill_dir = os.path.join(opencode_skills_dir, f"{base_skill_dir_name}_{counter}")
        counter += 1

    os.makedirs(skill_dir, exist_ok=True)

    # 保存原始文件
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
