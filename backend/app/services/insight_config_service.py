"""
洞察配置服务 — 以 JSON 文件持久化洞察任务配置项
文件路径: ./data/insight_config.json（可通过 INSIGHT_CONFIG_PATH 环境变量覆盖）
"""

from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from app.core.config import settings

# ─── 默认配置 ────────────────────────────────────────────────────────────────

INSIGHT_CONFIG_PATH: Path = Path(
    os.environ.get("INSIGHT_CONFIG_PATH", "./data/insight_config.json")
)

# 可选洞察源（label + value，可扩展）
INSIGHT_SOURCE_OPTIONS = [
    {"value": "github",        "label": "GitHub Advisory",     "description": "GitHub Security Advisory Database"},
    {"value": "nvd",           "label": "NVD (CVE)",           "description": "美国国家漏洞数据库"},
    {"value": "osv",           "label": "OSV",                 "description": "Open Source Vulnerabilities"},
    {"value": "codehub",       "label": "CodeHub",             "description": "华为云 CodeHub 安全公告"},
    {"value": "tech_blog",     "label": "技术博客",             "description": "安全技术博客聚合（先知、FreeBuf 等）"},
    {"value": "go_vuln_db",    "label": "Go Vulnerability DB", "description": "官方 Go 漏洞数据库 (pkg.go.dev/vuln)"},
    {"value": "snyk",          "label": "Snyk",                "description": "Snyk 开源漏洞库"},
    {"value": "custom_rss",    "label": "自定义 RSS",           "description": "自定义 RSS/Atom 订阅源"},
]

DEFAULT_CONFIG: dict[str, Any] = {
    "enabled": False,
    "interval_hours": 24,
    "sources": ["github", "nvd", "go_vuln_db"],
    "last_run_at": None,
    "next_run_at": None,
    # 洞察项目路径（opencode serve 的工作目录）
    "insight_project_path": "",
    # 发送给 opencode 的洞察 prompt（触发全局洞察 skill）
    # skill 执行完成后会将报告写入 {project_path}/report/vuln-insight-report.md
    "insight_prompt": (
        "请调用全局洞察skill，对当前项目进行全面的安全漏洞洞察分析，"
        "将分析结果输出到 report/vuln-insight-report.md 文件中。"
        "报告格式要求：\n"
        "- 文件以 # 标题行开头\n"
        "- 每条漏洞以 #### VULN-XXX: 标题 格式独立成段\n"
        "- 每段包含：- **严重程度**: 高/中/低、- **组件**: 组件名、"
        "- **漏洞描述**: 简述、- **根因**: 根因分析、- **Issue**: #编号"
    ),
    # 发送给 opencode 的攻击模式提取 prompt（触发攻击模式提取 skill）
    # skill 执行完成后会将各类攻击模式写入 {project_path}/vuln-lib/patterns/*-patterns.md
    "attack_pattern_prompt": (
        "请调用攻击模式提取skill，根据已生成的洞察报告提取攻击模式，"
        "将各类攻击模式分别输出到 vuln-lib/patterns/ 目录下的对应文件，"
        "文件名格式为 {类型}-patterns.md，例如 DOS-patterns.md、NIL-patterns.md。\n"
        "每个攻击模式以 ## GO-ATK-{类型}-{序号}：标题 格式独立成段，"
        "包含：**严重性**、**漏洞描述**（### 子节）、**测试方法**、**漏洞模式（典型代码）**等。"
    ),
}

# ─── 读写操作 ─────────────────────────────────────────────────────────────────


def _ensure_dir() -> None:
    INSIGHT_CONFIG_PATH.parent.mkdir(parents=True, exist_ok=True)


def load_insight_config() -> dict[str, Any]:
    """读取洞察配置，文件不存在时返回默认值。"""
    try:
        if INSIGHT_CONFIG_PATH.exists():
            text = INSIGHT_CONFIG_PATH.read_text(encoding="utf-8")
            stored = json.loads(text)
            # 合并默认值（向前兼容：新增字段时旧文件不会缺字段）
            merged = {**DEFAULT_CONFIG, **stored}
            return merged
    except Exception as exc:  # noqa: BLE001
        print(f"[InsightConfig] 读取配置文件失败，使用默认配置: {exc}")
    return dict(DEFAULT_CONFIG)


def save_insight_config(config: dict[str, Any]) -> dict[str, Any]:
    """保存洞察配置到 JSON 文件，返回保存后的配置。"""
    _ensure_dir()
    to_save = {
        "enabled": bool(config.get("enabled", DEFAULT_CONFIG["enabled"])),
        "interval_hours": int(config.get("interval_hours", DEFAULT_CONFIG["interval_hours"])),
        "sources": list(config.get("sources", DEFAULT_CONFIG["sources"])),
        "last_run_at": config.get("last_run_at"),
        "next_run_at": config.get("next_run_at"),
        "insight_project_path": str(config.get("insight_project_path", DEFAULT_CONFIG["insight_project_path"])),
        "insight_prompt": str(config.get("insight_prompt", DEFAULT_CONFIG["insight_prompt"])),
        "attack_pattern_prompt": str(config.get("attack_pattern_prompt", DEFAULT_CONFIG["attack_pattern_prompt"])),
    }
    INSIGHT_CONFIG_PATH.write_text(
        json.dumps(to_save, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return to_save


def get_source_options() -> list[dict[str, str]]:
    """返回所有可选洞察源定义（供前端渲染多选框）。"""
    return INSIGHT_SOURCE_OPTIONS
