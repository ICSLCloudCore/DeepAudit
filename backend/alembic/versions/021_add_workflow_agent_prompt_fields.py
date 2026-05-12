"""Add agent_package_id and prompt_template_id fields to workflows

Revision ID: 021_add_workflow_fields
Revises: 020_create_workflows
Create Date: 2026-05-12

"""

from alembic import op
import sqlalchemy as sa


revision = "021_add_workflow_fields"
down_revision = "020_create_workflows"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workflows", sa.Column("analyze_agent_package_id", sa.String(36), nullable=True))
    op.add_column(
        "workflows", sa.Column("analyze_prompt_template_id", sa.String(36), nullable=True)
    )
    op.add_column("workflows", sa.Column("white_agent_package_id", sa.String(36), nullable=True))
    op.add_column("workflows", sa.Column("white_prompt_template_id", sa.String(36), nullable=True))
    op.add_column("workflows", sa.Column("black_agent_package_id", sa.String(36), nullable=True))
    op.add_column("workflows", sa.Column("black_prompt_template_id", sa.String(36), nullable=True))


def downgrade() -> None:
    op.drop_column("workflows", "analyze_agent_package_id")
    op.drop_column("workflows", "analyze_prompt_template_id")
    op.drop_column("workflows", "white_agent_package_id")
    op.drop_column("workflows", "white_prompt_template_id")
    op.drop_column("workflows", "black_agent_package_id")
    op.drop_column("workflows", "black_prompt_template_id")
