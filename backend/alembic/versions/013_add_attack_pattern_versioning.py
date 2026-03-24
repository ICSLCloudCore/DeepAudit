"""add versioning fields to go_attack_pattern_entries

Revision ID: 013_add_attack_pattern_versioning
Revises: 012_add_security_kb
Create Date: 2026-03-24 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "013_add_attack_pattern_versioning"
down_revision = "012_add_security_kb"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add new columns to go_attack_pattern_entries
    op.add_column(
        "go_attack_pattern_entries",
        sa.Column("pattern_id", sa.String(), nullable=True),
    )
    op.add_column(
        "go_attack_pattern_entries",
        sa.Column("version", sa.String(50), nullable=True, server_default="1.0.0"),
    )
    op.add_column(
        "go_attack_pattern_entries",
        sa.Column("version_notes", sa.Text(), nullable=True),
    )
    op.add_column(
        "go_attack_pattern_entries",
        sa.Column("is_latest", sa.Boolean(), nullable=True, server_default="true"),
    )
    op.add_column(
        "go_attack_pattern_entries",
        sa.Column(
            "parent_id",
            sa.String(),
            sa.ForeignKey("go_attack_pattern_entries.id"),
            nullable=True,
        ),
    )

    # Backfill pattern_id = id for all existing rows (each is its own first version)
    op.execute(
        "UPDATE go_attack_pattern_entries SET pattern_id = id WHERE pattern_id IS NULL"
    )
    op.execute(
        "UPDATE go_attack_pattern_entries SET version = '1.0.0' WHERE version IS NULL"
    )
    op.execute(
        "UPDATE go_attack_pattern_entries SET is_latest = true WHERE is_latest IS NULL"
    )

    # Make pattern_id non-nullable after backfill
    op.alter_column("go_attack_pattern_entries", "pattern_id", nullable=False)
    op.alter_column("go_attack_pattern_entries", "version", nullable=False)
    op.alter_column("go_attack_pattern_entries", "is_latest", nullable=False)

    # Indexes
    op.create_index("ix_go_attack_pattern_id", "go_attack_pattern_entries", ["pattern_id"])
    op.create_index("ix_go_attack_is_latest", "go_attack_pattern_entries", ["is_latest"])


def downgrade() -> None:
    op.drop_index("ix_go_attack_is_latest", table_name="go_attack_pattern_entries")
    op.drop_index("ix_go_attack_pattern_id", table_name="go_attack_pattern_entries")
    op.drop_column("go_attack_pattern_entries", "parent_id")
    op.drop_column("go_attack_pattern_entries", "is_latest")
    op.drop_column("go_attack_pattern_entries", "version_notes")
    op.drop_column("go_attack_pattern_entries", "version")
    op.drop_column("go_attack_pattern_entries", "pattern_id")
