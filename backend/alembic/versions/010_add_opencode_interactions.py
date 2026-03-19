"""Add opencode_interactions table

Revision ID: 010_add_opencode_interactions
Revises: 009_add_opencode_sessions
Create Date: 2025-03-19 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "010_add_opencode_interactions"
down_revision = "009_add_opencode_sessions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "opencode_interactions",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("interaction_type", sa.String(), nullable=False),
        sa.Column("endpoint", sa.String(length=255), nullable=False),
        sa.Column("http_method", sa.String(length=10), nullable=False),
        sa.Column("request_timestamp", sa.DateTime(timezone=True), nullable=False),
        sa.Column("response_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("request_payload", sa.Text(), nullable=True),
        sa.Column("response_payload", sa.Text(), nullable=True),
        sa.Column("http_status_code", sa.Integer(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("error_type", sa.String(length=100), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["session_id"], ["opencode_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("idx_opencode_interactions_session_id", "opencode_interactions", ["session_id"])
    op.create_index(
        "idx_opencode_interactions_timestamp", "opencode_interactions", ["request_timestamp"]
    )
    op.create_index("idx_opencode_interactions_type", "opencode_interactions", ["interaction_type"])
    op.create_index("idx_opencode_interactions_endpoint", "opencode_interactions", ["endpoint"])


def downgrade() -> None:
    op.drop_index("idx_opencode_interactions_endpoint", "opencode_interactions")
    op.drop_index("idx_opencode_interactions_type", "opencode_interactions")
    op.drop_index("idx_opencode_interactions_timestamp", "opencode_interactions")
    op.drop_index("idx_opencode_interactions_session_id", "opencode_interactions")
    op.drop_table("opencode_interactions")
