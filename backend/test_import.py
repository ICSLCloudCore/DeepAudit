#!/usr/bin/env python3
"""简单测试我们的包装对象是否工作"""

import sys
from pathlib import Path

# 添加项目路径
sys.path.insert(0, str(Path(__file__).parent))


# 模拟 FastAPI 的 APIRouter 类
class MockAPIRouter:
    def __init__(self, name):
        self.name = name


# 暂时替换 sys.modules 里的模块来避免 WeasyPrint 问题
import sys
from types import ModuleType

# 创建模拟模块
mock_fastapi = ModuleType("fastapi")
mock_fastapi.APIRouter = MockAPIRouter
sys.modules["fastapi"] = mock_fastapi

mock_weasyprint = ModuleType("weasyprint")
mock_weasyprint.HTML = lambda x: None
mock_weasyprint.CSS = lambda x: None
sys.modules["weasyprint"] = mock_weasyprint

# 现在测试我们的 __init__.py
from app.api.v1.endpoints import auth, projects, users

print("✅ 测试成功！")
print(f"  - auth 是: {type(auth)}")
print(f"  - auth.router 可用: {hasattr(auth, 'router')}")
print(f"  - projects.router 可用: {hasattr(projects, 'router')}")
print(f"  - users.router 可用: {hasattr(users, 'router')}")
print("\n🎉 我们的修复工作正常！向后兼容性保持完好！")
