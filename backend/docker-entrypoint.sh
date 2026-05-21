#!/bin/bash
set -e

echo "🚀 DeepAudit 后端启动中..."

# 等待 PostgreSQL 就绪
echo "⏳ 等待数据库连接..."
max_retries=30
retry_count=0

while [ $retry_count -lt $max_retries ]; do
    if .venv/bin/python -c "
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine
import os

async def check_db():
    engine = create_async_engine(os.environ.get('DATABASE_URL', ''))
    try:
        async with engine.connect() as conn:
            await conn.execute(text('SELECT 1'))
        return True
    except Exception:
        return False
    finally:
        await engine.dispose()

from sqlalchemy import text
exit(0 if asyncio.run(check_db()) else 1)
" 2>/dev/null; then
        echo "✅ 数据库连接成功"
        break
    fi

    retry_count=$((retry_count + 1))
    echo "   重试 $retry_count/$max_retries..."
    sleep 2
done

if [ $retry_count -eq $max_retries ]; then
    echo "❌ 无法连接到数据库，请检查 DATABASE_URL 配置"
    exit 1
fi

# 判断初始化模式
if [ "$INIT_DB_DIRECT" = "true" ]; then
    echo "🔧 全新环境初始化模式..."
    echo "   将直接创建数据库表结构（不使用 alembic 迁移）"
    
    # 执行初始化脚本
    .venv/bin/python scripts/init_db_direct.py
    
    echo "✅ 数据库初始化完成"
else
    echo "🔄 标准模式：运行数据库迁移 (alembic upgrade head)..."
    .venv/bin/alembic upgrade head
    echo "✅ 数据库迁移完成"
fi

# 启动 uvicorn
echo "🌐 启动 API 服务..."
if [ "$1" = "--reload" ]; then
    exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
    exec .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000
fi
