"""add golang security knowledge base tables

Revision ID: 012_add_security_kb
Revises: 011_add_opencode_message_contents
Create Date: 2026-03-24 00:00:00.000000

"""

from alembic import op
import sqlalchemy as sa

revision = "012_add_security_kb"
down_revision = "011_add_opencode_message_contents"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 洞察漏洞库
    op.create_table(
        "go_vulnerability_entries",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False, unique=True),
        sa.Column("cve_id", sa.String(50), nullable=True),
        sa.Column("cwe_id", sa.String(50), nullable=True),
        sa.Column("severity", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("category", sa.String(100), nullable=False),
        sa.Column("tags", sa.Text(), server_default="[]"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("affected_versions", sa.String(500), nullable=True),
        sa.Column("go_packages", sa.Text(), server_default="[]"),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column("is_system", sa.Boolean(), server_default="false"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_by", sa.String(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_go_vuln_severity", "go_vulnerability_entries", ["severity"])
    op.create_index("ix_go_vuln_category", "go_vulnerability_entries", ["category"])
    op.create_index("ix_go_vuln_is_system", "go_vulnerability_entries", ["is_system"])
    op.create_index("ix_go_vuln_created_by", "go_vulnerability_entries", ["created_by"])

    # 攻击模式库
    op.create_table(
        "go_attack_pattern_entries",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("slug", sa.String(200), nullable=False, unique=True),
        sa.Column("capec_id", sa.String(50), nullable=True),
        sa.Column("attack_type", sa.String(100), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False, server_default="medium"),
        sa.Column("likelihood", sa.String(20), nullable=True),
        sa.Column("tags", sa.Text(), server_default="[]"),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("mitigations", sa.Text(), nullable=True),
        sa.Column("go_packages", sa.Text(), server_default="[]"),
        sa.Column("source_url", sa.String(500), nullable=True),
        sa.Column("is_system", sa.Boolean(), server_default="false"),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_by", sa.String(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
        ),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index(
        "ix_go_attack_attack_type", "go_attack_pattern_entries", ["attack_type"]
    )
    op.create_index(
        "ix_go_attack_severity", "go_attack_pattern_entries", ["severity"]
    )
    op.create_index(
        "ix_go_attack_is_system", "go_attack_pattern_entries", ["is_system"]
    )
    op.create_index(
        "ix_go_attack_created_by", "go_attack_pattern_entries", ["created_by"]
    )


def downgrade() -> None:
    op.drop_index("ix_go_attack_created_by", table_name="go_attack_pattern_entries")
    op.drop_index("ix_go_attack_is_system", table_name="go_attack_pattern_entries")
    op.drop_index("ix_go_attack_severity", table_name="go_attack_pattern_entries")
    op.drop_index("ix_go_attack_attack_type", table_name="go_attack_pattern_entries")
    op.drop_table("go_attack_pattern_entries")

    op.drop_index("ix_go_vuln_created_by", table_name="go_vulnerability_entries")
    op.drop_index("ix_go_vuln_is_system", table_name="go_vulnerability_entries")
    op.drop_index("ix_go_vuln_category", table_name="go_vulnerability_entries")
    op.drop_index("ix_go_vuln_severity", table_name="go_vulnerability_entries")
    op.drop_table("go_vulnerability_entries")
