"""refactor attack pattern: rename attack_type to pattern_type, drop likelihood/go_packages/source_url

Revision ID: 015_refactor_attack_pattern_fields
Revises: 014_simplify_vulnerability_entry
Create Date: 2026-03-25 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "015_refactor_attack_pattern_fields"
down_revision = "014_simplify_vulnerability_entry"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add new pattern_type column (nullable first, then backfill, then alter)
    op.add_column(
        "go_attack_pattern_entries",
        sa.Column("pattern_type", sa.String(100), nullable=True),
    )

    # 2. Copy existing attack_type values to pattern_type
    #    Map old free-form values to new enum where possible; default to 'general'
    op.execute("""
        UPDATE go_attack_pattern_entries
        SET pattern_type = CASE
            WHEN attack_type IN ('injection','traversal','deserialization','ssrf','xxe',
                                 'dos','privilege','supply-chain','social','other')
                THEN 'general'
            ELSE COALESCE(attack_type, 'general')
        END
    """)

    # 3. Make pattern_type non-nullable with default
    op.alter_column(
        "go_attack_pattern_entries", "pattern_type",
        nullable=False, server_default="general",
    )

    # 4. Drop old attack_type index, create new pattern_type index
    op.drop_index("ix_go_attack_attack_type", table_name="go_attack_pattern_entries")
    op.create_index("ix_go_attack_pattern_type", "go_attack_pattern_entries", ["pattern_type"])

    # 5. Drop attack_type column
    op.drop_column("go_attack_pattern_entries", "attack_type")

    # 6. Drop removed columns (likelihood, go_packages, source_url)
    op.drop_column("go_attack_pattern_entries", "likelihood")
    op.drop_column("go_attack_pattern_entries", "go_packages")
    op.drop_column("go_attack_pattern_entries", "source_url")


def downgrade() -> None:
    # Restore removed columns
    op.add_column("go_attack_pattern_entries", sa.Column("source_url", sa.String(500), nullable=True))
    op.add_column("go_attack_pattern_entries", sa.Column("go_packages", sa.Text(), server_default="[]"))
    op.add_column("go_attack_pattern_entries", sa.Column("likelihood", sa.String(20), nullable=True))

    # Restore attack_type from pattern_type
    op.add_column(
        "go_attack_pattern_entries",
        sa.Column("attack_type", sa.String(100), nullable=True),
    )
    op.execute("UPDATE go_attack_pattern_entries SET attack_type = pattern_type")
    op.alter_column("go_attack_pattern_entries", "attack_type", nullable=False, server_default="other")

    # Restore indexes
    op.drop_index("ix_go_attack_pattern_type", table_name="go_attack_pattern_entries")
    op.create_index("ix_go_attack_attack_type", "go_attack_pattern_entries", ["attack_type"])

    # Drop pattern_type
    op.drop_column("go_attack_pattern_entries", "pattern_type")
