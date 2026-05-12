"""Create workflows table

Revision ID: 020_create_workflows
Revises: 019_add_project_type
Create Date: 2026-05-12

"""

from alembic import op
import sqlalchemy as sa


revision = "020_create_workflows"
down_revision = "019_add_project_type"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "workflows",
        sa.Column("id", sa.String(36), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("submitted_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("analyze_status", sa.String(20), server_default="not_configured"),
        sa.Column("analyze_project_id", sa.String(36), nullable=True),
        sa.Column("analyze_tech_stack", sa.Text(), nullable=True),
        sa.Column("analyze_agents", sa.Text(), nullable=True),
        sa.Column("analyze_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("analyze_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("white_status", sa.String(20), server_default="not_configured"),
        sa.Column("white_project_id", sa.String(36), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("white_tech_stack", sa.Text(), nullable=True),
        sa.Column("white_agents", sa.Text(), nullable=True),
        sa.Column("white_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("white_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("black_status", sa.String(20), server_default="not_configured"),
        sa.Column("black_project_id", sa.String(36), nullable=True),
        sa.Column("black_tech_stack", sa.Text(), nullable=True),
        sa.Column("black_agents", sa.Text(), nullable=True),
        sa.Column("black_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("black_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), onupdate=sa.func.now()),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index(op.f("ix_workflows_owner"), "workflows", ["owner_id"])
    op.create_index(op.f("ix_workflows_is_active"), "workflows", ["is_active"])
    op.create_index(op.f("ix_workflows_analyze_project"), "workflows", ["analyze_project_id"])
    op.create_index(op.f("ix_workflows_white_project"), "workflows", ["white_project_id"])
    op.create_index(op.f("ix_workflows_black_project"), "workflows", ["black_project_id"])


def downgrade() -> None:
    op.drop_index(op.f("ix_workflows_black_project"), table_name="workflows")
    op.drop_index(op.f("ix_workflows_white_project"), table_name="workflows")
    op.drop_index(op.f("ix_workflows_analyze_project"), table_name="workflows")
    op.drop_index(op.f("ix_workflows_is_active"), table_name="workflows")
    op.drop_index(op.f("ix_workflows_owner"), table_name="workflows")
    op.drop_table("workflows")
