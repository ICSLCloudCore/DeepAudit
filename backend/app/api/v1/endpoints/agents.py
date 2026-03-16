"""
Agent Management API
"""

from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import Agent, AgentType
from app.api.deps import get_current_user

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
