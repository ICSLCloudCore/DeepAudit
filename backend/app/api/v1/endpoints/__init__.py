# 向后兼容的导出
from .auth.auth import router as auth
from .auth.users import router as users
from .auth.members import router as members

from .project.projects import router as projects
from .project.project_config import router as project_config
from .project.ssh_keys import router as ssh_keys

from .audit.tasks import router as tasks
from .audit.scan import router as scan
from .audit.rules import router as rules
from .audit.database import router as database

from .agent.agents import router as agents
from .agent.agent_tasks import router as agent_tasks

from .opencode.sessions import router as opencode_sessions
from .opencode.skills import router as opencode_skills
from .opencode.mcp import router as opencode_mcp
from .opencode.audit_tasks import router as opencode_audit_tasks

from .knowledge.security_kb import router as security_kb
from .knowledge.prompts import router as prompts
from .knowledge.embedding_config import router as embedding_config

from .system.config import router as config

__all__ = [
    "auth",
    "users",
    "members",
    "projects",
    "project_config",
    "ssh_keys",
    "tasks",
    "scan",
    "rules",
    "database",
    "agents",
    "agent_tasks",
    "opencode_sessions",
    "opencode_skills",
    "opencode_mcp",
    "opencode_audit_tasks",
    "security_kb",
    "prompts",
    "embedding_config",
    "config",
]
