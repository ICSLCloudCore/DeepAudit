"""Add DeepAudit x OpenCode integration tables

Revision ID: 007_add_opencode_integration
Revises: 006_add_agent_tables
Create Date: 2024-01-15 11:00:00.000000

"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = "007_add_opencode_integration"
down_revision = "4c280754c680"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 创建 agents 表
    op.create_table(
        "agents",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("agent_type", sa.String(50), nullable=False, default="custom"),
        sa.Column("version", sa.String(20), default="1.0.0"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("author", sa.String(255), nullable=True),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column("tools", sa.JSON(), nullable=True),
        sa.Column("is_system", sa.Boolean(), default=False),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
    )

    op.create_index("ix_agents_name", "agents", ["name"])
    op.create_index("ix_agents_is_active", "agents", ["is_active"])

    # 创建 opencode_skills 表
    op.create_table(
        "opencode_skills",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("version", sa.String(20), default="1.0.0"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("author", sa.String(255), nullable=True),
        sa.Column("category", sa.String(100), default="custom"),
        sa.Column("file_path", sa.String(500), nullable=True),
        sa.Column("file_size", sa.BigInteger(), nullable=True),
        sa.Column("checksum", sa.String(64), nullable=True),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column("schema", sa.JSON(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("is_public", sa.Boolean(), default=False),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("download_count", sa.Integer(), default=0),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
    )

    op.create_index("ix_opencode_skills_name", "opencode_skills", ["name"])
    op.create_index("ix_opencode_skills_category", "opencode_skills", ["category"])
    op.create_index("ix_opencode_skills_is_active", "opencode_skills", ["is_active"])

    # 创建 opencode_mcps 表
    op.create_table(
        "opencode_mcps",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("version", sa.String(20), default="1.0.0"),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("author", sa.String(255), nullable=True),
        sa.Column("mcp_type", sa.String(50), nullable=False, default="stdio"),
        sa.Column("server_url", sa.String(500), nullable=True),
        sa.Column("command", sa.Text(), nullable=True),
        sa.Column("args", sa.JSON(), nullable=True),
        sa.Column("env", sa.JSON(), nullable=True),
        sa.Column("config", sa.JSON(), nullable=True),
        sa.Column("tools", sa.JSON(), nullable=True),
        sa.Column("tags", sa.JSON(), nullable=True),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
    )

    op.create_index("ix_opencode_mcps_name", "opencode_mcps", ["name"])
    op.create_index("ix_opencode_mcps_mcp_type", "opencode_mcps", ["mcp_type"])
    op.create_index("ix_opencode_mcps_is_active", "opencode_mcps", ["is_active"])

    # 创建 project_configs 表
    op.create_table(
        "project_configs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "project_id",
            sa.String(36),
            sa.ForeignKey("projects.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        sa.Column("selected_agents", sa.JSON(), nullable=True),
        sa.Column("selected_skills", sa.JSON(), nullable=True),
        sa.Column("selected_mcps", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_index("ix_project_configs_project_id", "project_configs", ["project_id"])

    # 创建 task_executions 表
    op.create_table(
        "task_executions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "task_id",
            sa.String(36),
            sa.ForeignKey("agent_tasks.id", ondelete="CASCADE"),
            unique=True,
            nullable=False,
        ),
        sa.Column("opencode_process_id", sa.String(36), nullable=True),
        sa.Column("opencode_status", sa.String(20), default="pending"),
        sa.Column("process_info", sa.JSON(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
    )

    op.create_index("ix_task_executions_task_id", "task_executions", ["task_id"])
    op.create_index("ix_task_executions_opencode_status", "task_executions", ["opencode_status"])


def downgrade() -> None:
    # 使用 IF EXISTS 来安全删除索引和表
    conn = op.get_bind()
    inspector = sa.inspect(conn)

    # 检查并删除索引
    def safe_drop_index(index_name, table_name):
        indexes = [idx["name"] for idx in inspector.get_indexes(table_name)]
        if index_name in indexes:
            op.drop_index(index_name, table_name)

    # 检查并删除表
    def safe_drop_table(table_name):
        tables = inspector.get_table_names()
        if table_name in tables:
            op.drop_table(table_name)

    # 清理 task_executions
    safe_drop_index("ix_task_executions_opencode_status", "task_executions")
    safe_drop_index("ix_task_executions_task_id", "task_executions")
    safe_drop_table("task_executions")

    # 清理 project_configs
    safe_drop_index("ix_project_configs_project_id", "project_configs")
    safe_drop_table("project_configs")

    # 清理 opencode_mcps
    safe_drop_index("ix_opencode_mcps_is_active", "opencode_mcps")
    safe_drop_index("ix_opencode_mcps_mcp_type", "opencode_mcps")
    safe_drop_index("ix_opencode_mcps_name", "opencode_mcps")
    safe_drop_table("opencode_mcps")

    # 清理 opencode_skills
    safe_drop_index("ix_opencode_skills_is_active", "opencode_skills")
    safe_drop_index("ix_opencode_skills_category", "opencode_skills")
    safe_drop_index("ix_opencode_skills_name", "opencode_skills")
    safe_drop_table("opencode_skills")

    # 清理 agents
    safe_drop_index("ix_agents_is_active", "agents")
    safe_drop_index("ix_agents_name", "agents")
    safe_drop_table("agents")
