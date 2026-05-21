from sqlalchemy.orm import as_declarative, declared_attr


@as_declarative()
class Base:
    id: str
    __name__: str

    @declared_attr
    def __tablename__(cls) -> str:
        return cls.__name__.lower() + "s"


# ========== 导入所有模型（确保注册到 Base.metadata） ==========

# 用户系统
from app.models.user.user import User
from app.models.user.user_config import UserConfig

# 项目管理
from app.models.project.project import Project, ProjectMember

# 审计系统
from app.models.audit.audit import AuditTask, AuditIssue
from app.models.audit.audit_vulnerabilities import AuditVulnerability
from app.models.audit.analysis import InstantAnalysis
from app.models.audit.audit_rule import AuditRuleSet, AuditRule

# Agent 系统
from app.models.agent.agent_task import (
    AgentTask,
    AgentEvent,
    AgentFinding,
    AgentCheckpoint,
    AgentTreeNode,
)

# OpenCode 集成
from app.models.opencode.agent import Agent
from app.models.opencode.opencode_agent import OpenCodeAgent
from app.models.opencode.opencode_skill_mcp import OpenCodeSkill, OpenCodeMCP
from app.models.opencode.opencode_project_task import ProjectConfig, TaskExecution
from app.models.opencode.opencode_session import OpenCodeSession
from app.models.opencode.opencode_interaction import OpenCodeInteraction
from app.models.opencode.opencode_message_content import OpenCodeMessageContent
from app.models.opencode.opencode_audit_task import OpenCodeAuditTask

# 知识库
from app.models.knowledge.prompt_template import PromptTemplate
from app.models.knowledge.security_kb import (
    GoVulnerabilityEntry,
    GoAttackPatternEntry,
    BusinessKbEntry,
)

# 工作流
from app.models.workflow.workflow import Workflow
