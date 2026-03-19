"""Add opencode_sessions table and extend projects table

Revision ID: 009_add_opencode_sessions
Revises: 007_add_opencode_integration
Create Date: 2024-01-20 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "009_add_opencode_sessions"
down_revision = "007_add_opencode_integration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "opencode_sessions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("project_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False, server_default="active"),
        sa.Column("prompt_template_id", sa.String(), nullable=True),
        sa.Column("prompt_content", sa.Text(), nullable=False),
        sa.Column("response_content", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "started_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
        ),
        sa.ForeignKeyConstraint(["project_id"], ["projects.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["prompt_template_id"],
            ["prompt_templates.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_opencode_sessions_project_id", "opencode_sessions", ["project_id"])
    op.create_index("ix_opencode_sessions_status", "opencode_sessions", ["status"])
    op.create_index("ix_opencode_sessions_created_by", "opencode_sessions", ["created_by"])

    op.add_column("projects", sa.Column("opencode_current_session_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_projects_opencode_current_session",
        "projects",
        "opencode_sessions",
        ["opencode_current_session_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_projects_opencode_current_session", "projects", type_="foreignkey")
    op.drop_column("projects", "opencode_current_session_id")

    op.drop_index("ix_opencode_sessions_created_by", "opencode_sessions")
    op.drop_index("ix_opencode_sessions_status", "opencode_sessions")
    op.drop_index("ix_opencode_sessions_project_id", "opencode_sessions")
    op.drop_table("opencode_sessions")
