# 向后兼容的导出 - 保持 auth.router 等语法正常工作


class _RouterWrapper:
    """简单的包装类，保持 .router 属性访问向后兼容"""

    def __init__(self, router):
        self.router = router


from .auth.auth import router as _auth_router
from .auth.users import router as _users_router
from .auth.members import router as _members_router

from .project.projects import router as _projects_router
from .project.project_config import router as _project_config_router
from .project.ssh_keys import router as _ssh_keys_router

from .audit.tasks import router as _tasks_router
from .audit.scan import router as _scan_router
from .audit.rules import router as _rules_router
from .audit.database import router as _database_router

from .agent.agent_tasks import router as _agent_tasks_router

from .opencode.sessions import router as _opencode_sessions_router
from .opencode.skills import router as _opencode_skills_router
from .opencode.mcp import router as _opencode_mcp_router
from .opencode.audit_tasks import router as _opencode_audit_tasks_router
from .opencode.agent_packages import router as _opencode_agent_packages_router

from .knowledge.security_kb import router as _security_kb_router
from .knowledge.prompts import router as _prompts_router
from .knowledge.embedding_config import router as _embedding_config_router

from .system.config import router as _config_router
from .system.opencode_config import router as _opencode_config_router

# 创建包装对象
auth = _RouterWrapper(_auth_router)
users = _RouterWrapper(_users_router)
members = _RouterWrapper(_members_router)

projects = _RouterWrapper(_projects_router)
project_config = _RouterWrapper(_project_config_router)
ssh_keys = _RouterWrapper(_ssh_keys_router)

tasks = _RouterWrapper(_tasks_router)
scan = _RouterWrapper(_scan_router)
rules = _RouterWrapper(_rules_router)
database = _RouterWrapper(_database_router)

agent_tasks = _RouterWrapper(_agent_tasks_router)

opencode_sessions = _RouterWrapper(_opencode_sessions_router)
opencode_skills = _RouterWrapper(_opencode_skills_router)
opencode_mcp = _RouterWrapper(_opencode_mcp_router)
opencode_audit_tasks = _RouterWrapper(_opencode_audit_tasks_router)
opencode_agent_packages = _RouterWrapper(_opencode_agent_packages_router)

security_kb = _RouterWrapper(_security_kb_router)
prompts = _RouterWrapper(_prompts_router)
embedding_config = _RouterWrapper(_embedding_config_router)

config = _RouterWrapper(_config_router)
opencode_config = _RouterWrapper(_opencode_config_router)

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
    "agent_tasks",
    "opencode_sessions",
    "opencode_skills",
    "opencode_mcp",
    "opencode_audit_tasks",
    "opencode_agent_packages",
    "security_kb",
    "prompts",
    "embedding_config",
    "config",
    "opencode_config",
]
