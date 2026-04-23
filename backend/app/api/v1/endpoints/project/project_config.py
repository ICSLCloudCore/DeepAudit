"""
Project Configuration API
"""

from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import ProjectConfig, Project, Agent, OpenCodeSkill, OpenCodeMCP
from app.api.deps import get_current_user

router = APIRouter()


@router.get("/{project_id}/config")
async def get_project_config(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get project configuration"""
    result = await db.execute(select(ProjectConfig).where(ProjectConfig.project_id == project_id))
    config = result.scalar_one_or_none()

    if not config:
        return {
            "project_id": project_id,
            "selected_agents": [],
            "selected_skills": [],
            "selected_mcps": [],
            "created_at": None,
            "updated_at": None,
        }

    return config.to_dict()


@router.put("/{project_id}/config")
async def update_project_config(
    project_id: str,
    selected_agents: Optional[List[dict]] = None,
    selected_skills: Optional[List[dict]] = None,
    selected_mcps: Optional[List[dict]] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update project configuration"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    result = await db.execute(select(ProjectConfig).where(ProjectConfig.project_id == project_id))
    config = result.scalar_one_or_none()

    if not config:
        config = ProjectConfig(
            project_id=project_id,
            selected_agents=selected_agents or [],
            selected_skills=selected_skills or [],
            selected_mcps=selected_mcps or [],
        )
        db.add(config)
    else:
        if selected_agents is not None:
            config.selected_agents = selected_agents
        if selected_skills is not None:
            config.selected_skills = selected_skills
        if selected_mcps is not None:
            config.selected_mcps = selected_mcps

    await db.commit()
    await db.refresh(config)

    return config.to_dict()


@router.get("/{project_id}/available-resources")
async def get_available_resources(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get available agents, skills, and mcps for project configuration"""
    # Get active agents
    agents_result = await db.execute(select(Agent).where(Agent.is_active == True))
    agents = agents_result.scalars().all()

    # Get active skills
    skills_result = await db.execute(select(OpenCodeSkill).where(OpenCodeSkill.is_active == True))
    skills = skills_result.scalars().all()

    # Get active mcps
    mcps_result = await db.execute(select(OpenCodeMCP).where(OpenCodeMCP.is_active == True))
    mcps = mcps_result.scalars().all()

    return {
        "agents": [
            {
                "id": agent.id,
                "name": agent.name,
                "description": agent.description,
                "agent_type": agent.agent_type,
                "is_active": agent.is_active,
            }
            for agent in agents
        ],
        "skills": [
            {
                "id": skill.id,
                "name": skill.name,
                "description": skill.description,
                "category": skill.category,
                "is_active": skill.is_active,
            }
            for skill in skills
        ],
        "mcps": [
            {
                "id": mcp.id,
                "name": mcp.name,
                "description": mcp.description,
                "mcp_type": mcp.mcp_type,
                "is_active": mcp.is_active,
            }
            for mcp in mcps
        ],
    }
