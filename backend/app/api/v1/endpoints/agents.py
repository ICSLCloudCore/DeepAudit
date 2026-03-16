"""
Agent Management API
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
import os

from app.db.session import get_db
from app.models import Agent, AgentType
from app.api.deps import get_current_user
from app.core.platform_config import get_opencode_agents_dir, ensure_dir_exists, delete_file_or_dir

router = APIRouter()


@router.get("")
async def list_agents(
    agent_type: Optional[str] = Query(
        None, description="Filter by agent type: system, custom, all"
    ),
    is_active: Optional[bool] = Query(None, description="Filter by active status"),
    search: Optional[str] = Query(None, description="Search by name or description"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List agents with filtering and pagination"""
    query = select(Agent)

    # Apply filters
    filters = []
    if agent_type and agent_type != "all":
        filters.append(Agent.agent_type == agent_type)
    if is_active is not None:
        filters.append(Agent.is_active == is_active)
    if search:
        filters.append(or_(Agent.name.ilike(f"%{search}%"), Agent.description.ilike(f"%{search}%")))

    if filters:
        query = query.where(and_(*filters))

    # Count total
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    # Pagination
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size).order_by(Agent.created_at.desc())

    result = await db.execute(query)
    agents = result.scalars().all()

    return {
        "items": [agent.to_dict() for agent in agents],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{agent_id}")
async def get_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get agent details"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    return agent.to_dict()


@router.post("")
async def create_agent(
    name: str,
    agent_type: str = AgentType.CUSTOM,
    version: str = "1.0.0",
    description: Optional[str] = None,
    config: Optional[dict] = None,
    tools: Optional[List[dict]] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Create a new custom agent"""
    agent = Agent(
        name=name,
        agent_type=agent_type,
        version=version,
        description=description,
        author=getattr(current_user, "username", "unknown"),
        config=config,
        tools=tools,
        is_system=False,
        is_active=True,
        created_by=current_user.id if hasattr(current_user, "id") else None,
    )

    db.add(agent)
    await db.commit()
    await db.refresh(agent)

    return agent.to_dict()


@router.put("/{agent_id}")
async def update_agent(
    agent_id: str,
    name: Optional[str] = None,
    version: Optional[str] = None,
    description: Optional[str] = None,
    config: Optional[dict] = None,
    tools: Optional[List[dict]] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update an agent"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if agent.is_system:
        raise HTTPException(status_code=403, detail="System agents cannot be modified")

    # Update fields
    if name is not None:
        agent.name = name
    if version is not None:
        agent.version = version
    if description is not None:
        agent.description = description
    if config is not None:
        agent.config = config
    if tools is not None:
        agent.tools = tools

    await db.commit()
    await db.refresh(agent)

    return agent.to_dict()


@router.delete("/{agent_id}")
async def delete_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Delete an agent"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    if agent.is_system:
        raise HTTPException(status_code=403, detail="System agents cannot be deleted")

    await db.delete(agent)
    await db.commit()

    return {"message": "Agent deleted successfully"}


@router.patch("/{agent_id}/toggle")
async def toggle_agent(
    agent_id: str,
    is_active: bool,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Toggle agent active status"""
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    agent = result.scalar_one_or_none()

    if not agent:
        raise HTTPException(status_code=404, detail="Agent not found")

    agent.is_active = is_active
    await db.commit()
    await db.refresh(agent)

    return agent.to_dict()


# ==================== Agent 文件管理端点 ====================


@router.get("/files")
async def list_agent_files(
    current_user=Depends(get_current_user),
):
    """列出所有上传的 Agent 配置文件"""
    agents_dir = get_opencode_agents_dir()
    ensure_dir_exists(agents_dir)

    files = []
    if os.path.exists(agents_dir):
        for filename in os.listdir(agents_dir):
            if filename.endswith(".md"):
                file_path = os.path.join(agents_dir, filename)
                stat = os.stat(file_path)
                files.append(
                    {
                        "filename": filename,
                        "file_size": stat.st_size,
                        "created_at": stat.st_ctime,
                        "updated_at": stat.st_mtime,
                    }
                )

    return {"files": files}


@router.post("/files/upload")
async def upload_agent_file(
    file: UploadFile = File(...),
    current_user=Depends(get_current_user),
):
    """上传 Agent 配置文件（.md 格式）"""
    # 验证文件类型
    if not file.filename.lower().endswith(".md"):
        raise HTTPException(status_code=400, detail="请上传 .md 格式的文件")

    agents_dir = get_opencode_agents_dir()
    ensure_dir_exists(agents_dir)

    # 保持原始文件名，只做路径安全检查防止路径遍历
    original_filename = file.filename or "agent.md"
    # 移除路径分隔符，只保留文件名部分
    safe_filename = os.path.basename(original_filename)
    if not safe_filename:
        safe_filename = "agent.md"
    if not safe_filename.lower().endswith(".md"):
        safe_filename += ".md"

    file_path = os.path.join(agents_dir, safe_filename)

    # 检查文件是否已存在，存在则直接失败
    if os.path.exists(file_path):
        raise HTTPException(
            status_code=400, detail=f"文件 '{safe_filename}' 已存在，请使用其他文件名或先删除原文件"
        )

    # 保存文件
    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    return {
        "message": "Agent 文件上传成功",
        "filename": os.path.basename(file_path),
        "file_size": len(content),
    }


@router.delete("/files/{filename}")
async def delete_agent_file(
    filename: str,
    current_user=Depends(get_current_user),
):
    """删除指定的 Agent 配置文件"""
    agents_dir = get_opencode_agents_dir()
    file_path = os.path.join(agents_dir, filename)

    # 安全检查：防止路径遍历攻击
    if not os.path.abspath(file_path).startswith(os.path.abspath(agents_dir)):
        raise HTTPException(status_code=400, detail="无效的文件名")

    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="文件不存在")

    if delete_file_or_dir(file_path):
        return {"message": "文件删除成功", "filename": filename}
    else:
        raise HTTPException(status_code=500, detail="文件删除失败")
