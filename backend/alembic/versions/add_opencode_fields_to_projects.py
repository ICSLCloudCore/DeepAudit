"""add_opencode_fields_to_projects

Revision ID: add_opencode_fields_to_projects
Revises: 73889a94a455
Create Date: 2026-03-16 15:17:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'add_opencode_fields_to_projects'
down_revision = '73889a94a455'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add opencode columns to projects table
    op.add_column('projects', sa.Column('opencode_pid', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('opencode_port', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('opencode_log_path', sa.String(), nullable=True))
    op.add_column('projects', sa.Column('opencode_started_at', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    # Remove opencode columns from projects table
    op.drop_column('projects', 'opencode_started_at')
    op.drop_column('projects', 'opencode_log_path')
    op.drop_column('projects', 'opencode_port')
    op.drop_column('projects', 'opencode_pid')