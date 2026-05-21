"""
数据库表结构验证脚本
验证数据库表和字段是否完整创建
"""

import sys
import os

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, inspect, text
from app.core.config import settings

# 导入所有模型（确保注册到 Base.metadata）
import app.models  # noqa: F401


def verify_schema():
    """验证数据库表结构完整性"""

    # 连接数据库
    database_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")
    engine = create_engine(database_url)
    inspector = inspect(engine)

    # 获取所有表名
    tables = inspector.get_table_names()

    # 必要表清单
    required_tables = [
        "users",
        "user_configs",
        "projects",
        "project_members",
        "project_configs",
        "audit_tasks",
        "audit_issues",
        "audit_vulnerabilities",
        "audit_rules",
        "audit_rule_sets",
        "agent_tasks",
        "agent_events",
        "agent_findings",
        "agent_checkpoints",
        "agent_tree_nodes",
        "agents",
        "opencode_skills",
        "opencode_mcps",
        "opencode_sessions",
        "opencode_interactions",
        "opencode_message_contents",
        "opencode_audit_tasks",
        "prompt_templates",
        "go_vulnerability_entries",
        "go_attack_pattern_entries",
        "business_kb_entries",
        "workflows",
        "instant_analyses",
    ]

    # 检查缺失表
    missing_tables = [t for t in required_tables if t not in tables]

    # 验证关键字段
    required_columns = {
        "projects": ["opencode_active_session_id"],
        "agents": [
            "is_public",
            "original_filename",
            "package_file_path",
            "extracted_dir_path",
            "agents_md_content",
            "agents_count",
            "skills_count",
        ],
        "opencode_skills": ["agent_package_id"],
    }

    # 检查缺失字段
    missing_columns = {}
    for table, columns in required_columns.items():
        if table in tables:
            table_columns = [c["name"] for c in inspector.get_columns(table)]
            missing = [c for c in columns if c not in table_columns]
            if missing:
                missing_columns[table] = missing
        else:
            missing_columns[table] = columns

    # 验证 alembic_version
    version = None
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version_num FROM alembic_version"))
            version = result.scalar()
    except Exception:
        version = None

    # 输出验证结果
    print("=" * 60)
    print("数据库表结构验证报告")
    print("=" * 60)
    print(f"总表数: {len(tables)}")
    print(f"必要表数: {len(required_tables)}")

    if missing_tables:
        print(f"缺失表 ({len(missing_tables)}): {missing_tables}")
    else:
        print("✓ 所有必要表已创建")

    if missing_columns:
        print(f"缺失字段:")
        for table, cols in missing_columns.items():
            print(f"  - {table}: {cols}")
    else:
        print("✓ 所有必要字段已创建")

    if version:
        print(f"alembic_version: {version}")
    else:
        print("⚠ alembic_version 表不存在或为空")

    print("=" * 60)

    # 判断验证结果
    is_valid = len(missing_tables) == 0 and len(missing_columns) == 0

    if is_valid:
        print("✅ 验证通过：表结构完整")
    else:
        print("❌ 验证失败：表结构不完整")

    engine.dispose()
    return is_valid


if __name__ == "__main__":
    success = verify_schema()
    sys.exit(0 if success else 1)
