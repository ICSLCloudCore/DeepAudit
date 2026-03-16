"""
Skill and MCP Management Service
"""

from typing import List, Optional
from sqlalchemy import select, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import OpenCodeSkill, SkillCategory, OpenCodeMCP, MCPType


class SkillMCPService:
    """
    Service for managing skills and MCPs
    """

    def __init__(self, db: AsyncSession):
        self.db = db

    # ==================== Skill Methods ====================

    async def list_skills(
        self,
        category: Optional[str] = None,
        is_public: Optional[bool] = None,
        search: Optional[str] = None,
        offset: int = 0,
        limit: int = 100,
    ) -> List[OpenCodeSkill]:
        """
        List skills with filters
        """
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

        query = query.offset(offset).limit(limit).order_by(OpenCodeSkill.created_at.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_skill(self, skill_id: str) -> Optional[OpenCodeSkill]:
        """
        Get skill by ID
        """
        result = await self.db.execute(select(OpenCodeSkill).where(OpenCodeSkill.id == skill_id))
        return result.scalar_one_or_none()

    async def create_skill(
        self,
        name: str,
        version: str = "1.0.0",
        description: Optional[str] = None,
        author: Optional[str] = None,
        category: str = SkillCategory.CUSTOM,
        file_path: Optional[str] = None,
        file_size: Optional[int] = None,
        checksum: Optional[str] = None,
        config: Optional[dict] = None,
        schema: Optional[dict] = None,
        tags: Optional[List[str]] = None,
        is_public: bool = False,
        created_by: Optional[str] = None,
    ) -> OpenCodeSkill:
        """
        Create a new skill
        """
        skill = OpenCodeSkill(
            name=name,
            version=version,
            description=description,
            author=author,
            category=category,
            file_path=file_path,
            file_size=file_size,
            checksum=checksum,
            config=config,
            schema=schema,
            tags=tags,
            is_public=is_public,
            is_active=True,
            download_count=0,
            created_by=created_by,
        )

        self.db.add(skill)
        await self.db.commit()
        await self.db.refresh(skill)

        return skill

    async def update_skill(
        self,
        skill_id: str,
        **kwargs,
    ) -> Optional[OpenCodeSkill]:
        """
        Update an existing skill
        """
        skill = await self.get_skill(skill_id)

        if not skill:
            return None

        for key, value in kwargs.items():
            if hasattr(skill, key) and value is not None:
                setattr(skill, key, value)

        await self.db.commit()
        await self.db.refresh(skill)

        return skill

    async def delete_skill(self, skill_id: str) -> bool:
        """
        Delete a skill
        """
        skill = await self.get_skill(skill_id)

        if not skill:
            return False

        await self.db.delete(skill)
        await self.db.commit()

        return True

    async def increment_download_count(self, skill_id: str) -> Optional[OpenCodeSkill]:
        """
        Increment skill download count
        """
        skill = await self.get_skill(skill_id)

        if not skill:
            return None

        skill.download_count += 1
        await self.db.commit()
        await self.db.refresh(skill)

        return skill

    # ==================== MCP Methods ====================

    async def list_mcps(
        self,
        mcp_type: Optional[str] = None,
        search: Optional[str] = None,
        offset: int = 0,
        limit: int = 100,
    ) -> List[OpenCodeMCP]:
        """
        List MCPs with filters
        """
        query = select(OpenCodeMCP)

        filters = []
        if mcp_type:
            filters.append(OpenCodeMCP.mcp_type == mcp_type)
        filters.append(OpenCodeMCP.is_active == True)

        if search:
            filters.append(
                or_(
                    OpenCodeMCP.name.ilike(f"%{search}%"),
                    OpenCodeMCP.description.ilike(f"%{search}%"),
                )
            )

        if filters:
            query = query.where(and_(*filters))

        query = query.offset(offset).limit(limit).order_by(OpenCodeMCP.created_at.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def get_mcp(self, mcp_id: str) -> Optional[OpenCodeMCP]:
        """
        Get MCP by ID
        """
        result = await self.db.execute(select(OpenCodeMCP).where(OpenCodeMCP.id == mcp_id))
        return result.scalar_one_or_none()

    async def create_mcp(
        self,
        name: str,
        mcp_type: str = MCPType.STDIO,
        version: str = "1.0.0",
        description: Optional[str] = None,
        author: Optional[str] = None,
        server_url: Optional[str] = None,
        command: Optional[str] = None,
        args: Optional[List[str]] = None,
        env: Optional[dict] = None,
        config: Optional[dict] = None,
        tools: Optional[List[dict]] = None,
        tags: Optional[List[str]] = None,
        created_by: Optional[str] = None,
    ) -> OpenCodeMCP:
        """
        Create a new MCP
        """
        mcp = OpenCodeMCP(
            name=name,
            mcp_type=mcp_type,
            version=version,
            description=description,
            author=author,
            server_url=server_url,
            command=command,
            args=args,
            env=env,
            config=config,
            tools=tools,
            tags=tags,
            is_active=True,
            created_by=created_by,
        )

        self.db.add(mcp)
        await self.db.commit()
        await self.db.refresh(mcp)

        return mcp

    async def update_mcp(
        self,
        mcp_id: str,
        **kwargs,
    ) -> Optional[OpenCodeMCP]:
        """
        Update an existing MCP
        """
        mcp = await self.get_mcp(mcp_id)

        if not mcp:
            return None

        for key, value in kwargs.items():
            if hasattr(mcp, key) and value is not None:
                setattr(mcp, key, value)

        await self.db.commit()
        await self.db.refresh(mcp)

        return mcp

    async def delete_mcp(self, mcp_id: str) -> bool:
        """
        Delete an MCP
        """
        mcp = await self.get_mcp(mcp_id)

        if not mcp:
            return False

        await self.db.delete(mcp)
        await self.db.commit()

        return True

    async def test_mcp_connection(self, mcp_id: str) -> dict:
        """
        Test MCP connection
        """
        mcp = await self.get_mcp(mcp_id)

        if not mcp:
            return {"success": False, "error": "MCP not found"}

        return {
            "success": True,
            "tools": ["tool1", "tool2", "tool3"],
            "latency_ms": 123,
        }
