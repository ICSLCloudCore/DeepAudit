"""Add category field to agents

Revision ID: 018_add_agent_category
Revises: 017_update_skill_category
Create Date: 2026-05-09

"""

from alembic import op
import sqlalchemy as sa


revision = "018_add_agent_category"
down_revision = "017_update_skill_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 新增 category 字段
    op.add_column(
        "agents", sa.Column("category", sa.String(length=20), nullable=True, server_default="OTHER")
    )
    # 新增索引
    op.create_index(op.f("ix_agents_category"), "agents", ["category"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_agents_category"), table_name="agents")
    op.drop_column("agents", "category")
