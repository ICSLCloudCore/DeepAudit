"""
直接初始化数据库脚本
用于全新环境部署，绕过 Alembic 迁移链
"""

import sys
import os
import asyncio

# 添加项目根目录到 Python 路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine
from app.db.base import Base
from app.core.config import settings


async def init_database_direct_async():
    """
    异步方式创建所有数据库表
    用于全新环境初始化，绕过 alembic 迁移
    """
    database_url = settings.DATABASE_URL

    print("=" * 60)
    print("DeepAudit 数据库直接初始化")
    print("=" * 60)
    print(f"数据库 URL: {database_url.split('@')[1] if '@' in database_url else database_url}")

    engine = create_async_engine(database_url, echo=False)

    # Step 1: 创建所有表（基于 Base.metadata）
    print("\n[Step 1] 创建数据库表...")
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print(f"  ✓ 已创建 {len(Base.metadata.tables)} 个表")
    except Exception as e:
        print(f"  ✗ 创建表失败: {e}")
        await engine.dispose()
        return False

    # Step 2: 创建 alembic_version 表并标记版本
    print("\n[Step 2] 标记 alembic 版本...")
    try:
        async with engine.begin() as conn:
            # 检查表是否已存在
            result = await conn.execute(
                text(
                    "SELECT EXISTS(SELECT 1 FROM information_schema.tables "
                    "WHERE table_name='alembic_version')"
                )
            )
            exists = result.scalar()

            if not exists:
                await conn.execute(
                    text("CREATE TABLE alembic_version (version_num VARCHAR(64) PRIMARY KEY)")
                )
                print("  ✓ 创建 alembic_version 表")

            # 清空并插入最新版本号
            await conn.execute(text("DELETE FROM alembic_version"))
            await conn.execute(
                text("INSERT INTO alembic_version VALUES ('024_add_missing_fields')")
            )
            print("  ✓ 版本号设置为: 024_add_missing_fields")
    except Exception as e:
        print(f"  ✗ 标记版本失败: {e}")
        await engine.dispose()
        return False

    # Step 3: 验证表数量
    print("\n[Step 3] 验证表结构...")
    try:
        async with engine.begin() as conn:
            result = await conn.execute(
                text("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'")
            )
            table_count = result.scalar()
            print(f"  ✓ 总表数: {table_count}")

            result = await conn.execute(text("SELECT version_num FROM alembic_version"))
            version = result.scalar()
            print(f"  ✓ alembic_version: {version}")
    except Exception as e:
        print(f"  ⚠ 验证跳过: {e}")

    await engine.dispose()

    print("\n" + "=" * 60)
    print("数据库初始化完成")
    print("=" * 60)
    print("\n后续步骤:")
    print("  1. 启动应用: docker compose up -d")
    print("  2. 访问 API 文档: http://localhost:8000/docs")
    print("  3. 演示账户: demo@example.com / demo123")
    print("=" * 60)

    return True


def init_database_direct():
    """同步入口"""
    return asyncio.run(init_database_direct_async())


if __name__ == "__main__":
    success = init_database_direct()
    sys.exit(0 if success else 1)
