"""Add missing model fields to projects, agents, and opencode_skills

Revision ID: 024_add_missing_fields
Revises: 022_add_product_fields
Create Date: 2026-05-21 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "024_add_missing_fields"
down_revision = "022_add_product_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. projects 表 - 添加 opencode_active_session_id
    op.add_column("projects", sa.Column("opencode_active_session_id", sa.String(), nullable=True))

    # 2. agents 表 - 添加多个字段
    op.add_column(
        "agents",
        sa.Column("is_public", sa.Boolean(), server_default=sa.text("false"), nullable=True),
    )
    op.add_column("agents", sa.Column("original_filename", sa.String(255), nullable=True))
    op.add_column("agents", sa.Column("package_file_path", sa.String(500), nullable=True))
    op.add_column("agents", sa.Column("extracted_dir_path", sa.String(500), nullable=True))
    op.add_column("agents", sa.Column("agents_md_content", sa.Text(), nullable=True))
    op.add_column(
        "agents",
        sa.Column("agents_count", sa.Integer(), server_default=sa.text("0"), nullable=True),
    )
    op.add_column(
        "agents",
        sa.Column("skills_count", sa.Integer(), server_default=sa.text("0"), nullable=True),
    )

    # 3. opencode_skills 表 - 添加 agent_package_id
    op.add_column("opencode_skills", sa.Column("agent_package_id", sa.String(36), nullable=True))
    op.create_foreign_key(
        "fk_opencode_skills_agent_package_id",
        "opencode_skills",
        "agents",
        ["agent_package_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_opencode_skills_agent_package_id", "opencode_skills", ["agent_package_id"])


def downgrade() -> None:
    # 3. opencode_skills 表 - 删除 agent_package_id
    op.drop_index("ix_opencode_skills_agent_package_id", "opencode_skills")
    op.drop_constraint("fk_opencode_skills_agent_package_id", "opencode_skills", type_="foreignkey")
    op.drop_column("opencode_skills", "agent_package_id")

    # 2. agents 表 - 删除多个字段
    op.drop_column("agents", "skills_count")
    op.drop_column("agents", "agents_count")
    op.drop_column("agents", "agents_md_content")
    op.drop_column("agents", "extracted_dir_path")
    op.drop_column("agents", "package_file_path")
    op.drop_column("agents", "original_filename")
    op.drop_column("agents", "is_public")

    # 1. projects 表 - 删除 opencode_active_session_id
    op.drop_column("projects", "opencode_active_session_id")
