"""
业务知识库类型配置服务
类型定义存储于 ./data/business_kb_types.json，可在后台直接编辑调整。
"""
from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

BUSINESS_KB_TYPES_PATH: Path = Path(
    os.environ.get("BUSINESS_KB_TYPES_PATH", "./data/business_kb_types.json")
)

DEFAULT_TYPES: list[dict[str, Any]] = [
    {"value": "protocol-standard",  "label": "协议标准",  "description": "行业协议、规范与标准文档",   "color": "sky"},
    {"value": "test-baseline",      "label": "测试基线",  "description": "安全测试基线与检查项",       "color": "emerald"},
    {"value": "threat-analysis",    "label": "威胁分析",  "description": "威胁建模与风险分析报告",     "color": "orange"},
    {"value": "framework-analysis", "label": "框架分析",  "description": "技术框架安全分析文档",       "color": "violet"},
]


def load_business_kb_types() -> list[dict[str, Any]]:
    """读取业务知识库类型配置，文件不存在时返回默认值。"""
    try:
        if BUSINESS_KB_TYPES_PATH.exists():
            data = json.loads(BUSINESS_KB_TYPES_PATH.read_text(encoding="utf-8"))
            if isinstance(data, list) and data:
                return data
    except Exception as exc:
        print(f"[BusinessKbType] 读取类型配置失败，使用默认值: {exc}")
    return list(DEFAULT_TYPES)


def get_kb_type_values() -> set[str]:
    return {t["value"] for t in load_business_kb_types()}
