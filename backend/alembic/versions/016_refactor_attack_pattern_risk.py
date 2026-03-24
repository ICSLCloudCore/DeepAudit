"""drop capec_id/mitigations from attack patterns, rename severity to risk_level

Revision ID: 016_refactor_attack_pattern_risk
Revises: 015_refactor_attack_pattern_fields
Create Date: 2026-03-26 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "016_refactor_attack_pattern_risk"
down_revision = "015_refactor_attack_pattern_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add risk_level column (nullable first for backfill)
    op.add_column(
        "go_attack_pattern_entries",
        sa.Column("risk_level", sa.String(20), nullable=True),
    )

    # 2. Copy severity → risk_level
    op.execute("UPDATE go_attack_pattern_entries SET risk_level = severity WHERE risk_level IS NULL")

    # 3. Make risk_level non-nullable with default
    op.alter_column("go_attack_pattern_entries", "risk_level", nullable=False, server_default="medium")

    # 4. Drop old severity index, create new risk_level index
    op.drop_index("ix_go_attack_severity", table_name="go_attack_pattern_entries")
    op.create_index("ix_go_attack_risk_level", "go_attack_pattern_entries", ["risk_level"])

    # 5. Drop severity column
    op.drop_column("go_attack_pattern_entries", "severity")

    # 6. Drop capec_id and mitigations columns
    op.drop_column("go_attack_pattern_entries", "capec_id")
    op.drop_column("go_attack_pattern_entries", "mitigations")


def downgrade() -> None:
    # Restore mitigations and capec_id
    op.add_column("go_attack_pattern_entries", sa.Column("mitigations", sa.Text(), nullable=True))
    op.add_column("go_attack_pattern_entries", sa.Column("capec_id", sa.String(50), nullable=True))

    # Restore severity from risk_level
    op.add_column(
        "go_attack_pattern_entries",
        sa.Column("severity", sa.String(20), nullable=True),
    )
    op.execute("UPDATE go_attack_pattern_entries SET severity = risk_level WHERE severity IS NULL")
    op.alter_column("go_attack_pattern_entries", "severity", nullable=False, server_default="medium")

    # Restore indexes
    op.drop_index("ix_go_attack_risk_level", table_name="go_attack_pattern_entries")
    op.create_index("ix_go_attack_severity", "go_attack_pattern_entries", ["severity"])

    # Drop risk_level
    op.drop_column("go_attack_pattern_entries", "risk_level")
