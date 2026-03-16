"""
手动创建数据库表的脚本
"""

import asyncio
from app.db.session import engine
from app.db.base import Base
from app.models import (
    User,
    UserConfig,
    Project,
    ProjectMember,
    AuditTask,
    AuditIssue,
    InstantAnalysis,
    PromptTemplate,
    AuditRuleSet,
    AuditRule,
    AgentTask,
    AgentEvent,
    AgentFinding,
    Agent,
    OpenCodeSkill,
    OpenCodeMCP,
    ProjectConfig,
    TaskExecution,
)


async def create_tables():
    print("开始创建数据库表...")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("数据库表创建完成！")


if __name__ == "__main__":
    asyncio.run(create_tables())
