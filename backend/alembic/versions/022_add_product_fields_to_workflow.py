"""Add product fields and remove analyze_tech_stack

Revision ID: 022_add_product_fields
Revises: 021_add_workflow_fields
Create Date: 2026-05-18

"""

from alembic import op
import sqlalchemy as sa


revision = "022_add_product_fields"
down_revision = "021_add_workflow_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workflows", sa.Column("product_name", sa.String(255), nullable=True))
    op.add_column("workflows", sa.Column("product_domain", sa.String(50), nullable=True))
    op.add_column("workflows", sa.Column("version", sa.String(50), nullable=True))
    op.add_column("workflows", sa.Column("audit_type", sa.String(20), nullable=True))
    op.add_column("workflows", sa.Column("validation_mode", sa.String(20), nullable=True))

    op.execute("""
        UPDATE workflows 
        SET product_name = 'Unknown',
            product_domain = 'PS',
            version = '1.0.0',
            audit_type = 'baseline',
            validation_mode = 'self'
        WHERE product_name IS NULL OR product_name = ''
    """)

    op.alter_column("workflows", "product_name", nullable=False)
    op.alter_column("workflows", "product_domain", nullable=False)
    op.alter_column("workflows", "version", nullable=False)
    op.alter_column("workflows", "audit_type", nullable=False)
    op.alter_column("workflows", "validation_mode", nullable=False)

    op.drop_column("workflows", "analyze_tech_stack")


def downgrade() -> None:
    op.add_column("workflows", sa.Column("analyze_tech_stack", sa.Text(), nullable=True))

    op.alter_column("workflows", "validation_mode", nullable=True)
    op.alter_column("workflows", "audit_type", nullable=True)
    op.alter_column("workflows", "version", nullable=True)
    op.alter_column("workflows", "product_domain", nullable=True)
    op.alter_column("workflows", "product_name", nullable=True)

    op.drop_column("workflows", "validation_mode")
    op.drop_column("workflows", "audit_type")
    op.drop_column("workflows", "version")
    op.drop_column("workflows", "product_domain")
    op.drop_column("workflows", "product_name")
