"""
Agent Management Service
"""

from typing import List, Optional
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Agent, AgentType


class AgentManagementService:
    """
    Service for managing agents
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_agents(
        self,
        agent_type: Optional[str] = None,
        is_active: Optional[bool] = None,
        search: Optional[str] = None,
        offset: int = 0,
        limit: int = 100,
    ) -> List[Agent]:
        """
        List agents with filters
        """
        query = select(Agent)

        filters = []
        if agent_type and agent_type != "all":
            filters.append(Agent.agent_type == agent_type)
        if is_active is not None:
            filters.append(Agent.is_active == is_active)
        if search:
            filters.append(
                or_(Agent.name.ilike(f"%{search}%"), Agent.description.ilike(f"%{search}%"))
            )

        if filters:
            query = query.where(and_(*filters))

        query = query.offset(offset).limit(limit).order_by(Agent.created_at.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_agent(self, agent_id: str) -> Optional[Agent]:
        """
        Get agent by ID
        """
        result = await self.db.execute(select(Agent).where(Agent.id == agent_id))
        return result.scalar_one_or_none()

    async def create_agent(
        self,
        name: str,
        agent_type: str = AgentType.CUSTOM,
        version: str = "1.0.0",
        description: Optional[str] = None,
        author: Optional[str] = None,
        config: Optional[dict] = None,
        tools: Optional[List[dict]] = None,
        created_by: Optional[str] = None,
    ) -> Agent:
        """
        Create a new agent
        """
        agent = Agent(
            name=name,
            agent_type=agent_type,
            version=version,
            description=description,
            author=author,
            config=config,
            tools=tools,
            is_system=False,
            is_active=True,
            created_by=created_by,
        )

        self.db.add(agent)
        await self.db.commit()
        await self.db.refresh(agent)

        return agent

    async def update_agent(
        self,
        agent_id: str,
        **kwargs,
    ) -> Optional[Agent]:
        """
        Update an existing agent
        """
        agent = await self.get_agent(agent_id)

        if not agent:
            return None

        if agent.is_system:
            return None

        for key, value in kwargs.items():
            if hasattr(agent, key) and value is not None:
                setattr(agent, key, value)

        await self.db.commit()
        await self.db.refresh(agent)

        return agent

    async def delete_agent(self, agent_id: str) -> bool:
        """
        Delete an agent
        """
        agent = await self.get_agent(agent_id)

        if not agent:
            return False

        if agent.is_system:
            return False

        await self.db.delete(agent)
        await self.db.commit()

        return True

    async def toggle_agent(self, agent_id: str, is_active: bool) -> Optional[Agent]:
        """
        Toggle agent active status
        """
        agent = await self.get_agent(agent_id)

        if not agent:
            return None

        agent.is_active = is_active
        await self.db.commit()
        await self.db.refresh(agent)

        return agent

    async def initialize_system_agents(self):
        """
        Initialize built-in system agents
        """
        system_agents = [
            {
                "name": "OrchestratorAgent",
                "agent_type": AgentType.SYSTEM,
                "version": "1.0.0",
                "description": "Coordinates the overall audit workflow and manages other agents",
                "is_system": True,
            },
            {
                "name": "ReconAgent",
                "agent_type": AgentType.SYSTEM,
                "version": "1.0.0",
                "description": "Performs reconnaissance on the codebase to identify attack surfaces",
                "is_system": True,
            },
            {
                "name": "AnalysisAgent",
                "agent_type": AgentType.SYSTEM,
                "version": "1.0.0",
                "description": "Analyzes code to identify potential vulnerabilities",
                "is_system": True,
            },
            {
                "name": "VerificationAgent",
                "agent_type": AgentType.SYSTEM,
                "version": "1.0.0",
                "description": "Verifies potential vulnerabilities to reduce false positives",
                "is_system": True,
            },
        ]

        for agent_data in system_agents:
            # Check if agent already exists
            result = await self.db.execute(select(Agent).where(Agent.name == agent_data["name"]))
            existing = result.scalar_one_or_none()

            if not existing:
                agent = Agent(**agent_data, is_active=True)
                self.db.add(agent)

        await self.db.commit()
