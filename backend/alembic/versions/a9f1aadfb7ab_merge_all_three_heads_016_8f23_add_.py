"""merge all three heads (016, 8f23, add_opencode_fields)

Revision ID: a9f1aadfb7ab
Revises: 016_refactor_attack_pattern_risk, 8f2355fe393f, add_opencode_fields_to_projects
Create Date: 2026-05-08 10:51:11.344104

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a9f1aadfb7ab'
down_revision = ('016_refactor_attack_pattern_risk', '8f2355fe393f', 'add_opencode_fields_to_projects')
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass






