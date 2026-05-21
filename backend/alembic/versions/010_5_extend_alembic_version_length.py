"""Extend alembic_version.version_num field length

Revision ID: extend_alembic_version
Revises: 010_add_opencode_interactions
Create Date: 2026-05-21 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa


revision = "extend_alembic_version"
down_revision = "010_add_opencode_interactions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(64)")


def downgrade() -> None:
    op.execute("ALTER TABLE alembic_version ALTER COLUMN version_num TYPE VARCHAR(32)")
