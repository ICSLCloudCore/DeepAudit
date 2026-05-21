"""
直接初始化数据库脚本
用于全新环境部署，绕过 Alembic 迁移链
"""

import sys
import os

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import create_engine, text
from app.db.base import Base
from app.core.config import settings


def init_database_direct():
    """
    直接创建所有数据库表
    用于全新环境初始化，绕过 alembic 迁移
    """
    # 将 asyncpg URL 转换为 psycopg2 URL（同步引擎）
    database_url = settings.DATABASE_URL.replace("+asyncpg", "+psycopg2")

    print("=" * 60)
    print("DeepAudit 数据库直接初始化")
    print("=" * 60)
    print(f"数据库 URL: {database_url.split('@')[1] if '@' in database_url else database_url}")

    engine = create_engine(database_url, echo=False)

    # Step 1: 创建所有表（基于 Base.metadata）
    print("\n[Step 1] 创建数据库表...")
    try:
        Base.metadata.create_all(bind=engine)
        print(f"  ✓ 已创建 {len(Base.metadata.tables)} 个表")
    except Exception as e:
        print(f"  ✗ 创建表失败: {e}")
        engine.dispose()
        return False

    # Step 2: 创建 alembic_version 表并标记版本
    print("\n[Step 2] 标记 alembic 版本...")
    try:
        with engine.connect() as conn:
            # 检查表是否已存在
            result = conn.execute(
                text(
                    "SELECT EXISTS(SELECT 1 FROM information_schema.tables "
                    "WHERE table_name='alembic_version')"
                )
            )
            exists = result.scalar()

            if not exists:
                conn.execute(
                    text("CREATE TABLE alembic_version (version_num VARCHAR(64) PRIMARY KEY)")
                )
                print("  ✓ 创建 alembic_version 表")

            # 清空并插入最新版本号
            conn.execute(text("DELETE FROM alembic_version"))
            conn.execute(text("INSERT INTO alembic_version VALUES ('024_add_missing_fields')"))
            conn.commit()
            print("  ✓ 版本号设置为: 024_add_missing_fields")
    except Exception as e:
        print(f"  ✗ 标记版本失败: {e}")
        engine.dispose()
        return False

    # Step 3: 验证表结构
    print("\n[Step 3] 验证表结构...")
    try:
        from sqlalchemy import inspect

        inspector = inspect(engine)
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

        missing_tables = [t for t in required_tables if t not in tables]

        if missing_tables:
            print(f"  ✗ 缺失表: {missing_tables}")
        else:
            print(f"  ✓ 所有必要表已创建 ({len(required_tables)} 个)")

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

        missing_columns = {}
        for table, columns in required_columns.items():
            table_columns = [c["name"] for c in inspector.get_columns(table)]
            missing = [c for c in columns if c not in table_columns]
            if missing:
                missing_columns[table] = missing

        if missing_columns:
            print(f"  ✗ 缺失字段: {missing_columns}")
        else:
            print("  ✓ 所有必要字段已创建")
    except Exception as e:
        print(f"  ⚠ 验证跳过: {e}")

    # Step 4: 验证 alembic_version
    print("\n[Step 4] 验证 alembic_version...")
    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version_num FROM alembic_version"))
            version = result.scalar()
            print(f"  ✓ 当前版本: {version}")
    except Exception as e:
        print(f"  ✗ 验证失败: {e}")

    engine.dispose()

    print("\n" + "=" * 60)
    print("数据库初始化完成")
    print("=" * 60)
    print("\n后续步骤:")
    print("  1. 启动应用: docker compose up -d")
    print("  2. 访问 API 文档: http://localhost:8000/docs")
    print("  3. 演示账户: demo@example.com / demo123")
    print("=" * 60)

    return True


if __name__ == "__main__":
    success = init_database_direct()
    sys.exit(0 if success else 1)
