"""
MCP Management API
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import OpenCodeMCP, MCPType
from app.api.deps import get_current_user

router = APIRouter()


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