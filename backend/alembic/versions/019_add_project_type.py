"""Add project_type field to projects

Revision ID: 019_add_project_type
Revises: 018_add_agent_category
Create Date: 2026-05-09

"""

from alembic import op
import sqlalchemy as sa


revision = "019_add_project_type"
down_revision = "018_add_agent_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 新增 project_type 字段，默认 WHITE
    op.add_column(
        "projects",
        sa.Column("project_type", sa.String(length=20), nullable=True, server_default="WHITE"),
    )
    # 新增索引
    op.create_index(op.f("ix_projects_project_type"), "projects", ["project_type"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_projects_project_type"), table_name="projects")
    op.drop_column("projects", "project_type")
