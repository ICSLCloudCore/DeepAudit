"""Add opencode_message_contents table

Revision ID: 011_add_opencode_message_contents
Revises: 010_add_opencode_interactions
Create Date: 2025-03-22 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "011_add_opencode_message_contents"
down_revision = "010_add_opencode_interactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "opencode_message_contents",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("message_index", sa.Integer(), nullable=False),
        sa.Column("content_type", sa.String(), nullable=False),
        sa.Column("text_content", sa.Text(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["session_id"], ["opencode_sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("idx_opencode_message_contents_session_id", "opencode_message_contents", ["session_id"])
    op.create_index("idx_opencode_message_contents_content_type", "opencode_message_contents", ["content_type"])
    op.create_index("idx_opencode_message_contents_message_index", "opencode_message_contents", ["message_index"])


def downgrade() -> None:
    op.drop_index("idx_opencode_message_contents_message_index", "opencode_message_contents")
    op.drop_index("idx_opencode_message_contents_content_type", "opencode_message_contents")
    op.drop_index("idx_opencode_message_contents_session_id", "opencode_message_contents")
    op.drop_table("opencode_message_contents")