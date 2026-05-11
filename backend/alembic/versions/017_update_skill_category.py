"""Update skill category to new classification

Revision ID: 017_update_skill_category
Revises: a9f1aadfb7ab
Create Date: 2026-05-09

"""

from alembic import op
import sqlalchemy as sa


revision = "017_update_skill_category"
down_revision = "a9f1aadfb7ab"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 将现有所有 category 更新为 'OTHER'
    op.execute(
        "UPDATE opencode_skills SET category = 'OTHER' "
        "WHERE category IN ('security', 'analysis', 'utility', 'custom')"
    )


def downgrade() -> None:
    # 回滚时不做强制恢复，保持数据现状
    pass
