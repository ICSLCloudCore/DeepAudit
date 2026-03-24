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
    # 发送给 opencode 的洞察 prompt（全局洞察 skill）
    "insight_prompt": (
        "请对当前项目进行全面的安全漏洞洞察分析。"
        "以Markdown格式输出洞察报告，每份报告使用 --- 分隔，每份报告包含以下字段：\n"
        "title: 漏洞标题\n"
        "summary: 简要摘要（100字以内）\n"
        "tags: 标签列表（逗号分隔）\n"
        "go_packages: 涉及的 Go 包路径列表（逗号分隔，可为空）\n"
        "source_url: 参考链接（可为空）\n"
        "---\n"
        "（报告正文，详细描述漏洞原理、影响范围、复现方式、修复建议）\n"
        "每份洞察报告对应一个独立漏洞，请输出尽量多的独立漏洞报告。"
    ),
    # 发送给 opencode 的攻击模式提取 prompt
    "attack_pattern_prompt": (
        "根据上面的安全漏洞洞察报告，提取攻击模式。"
        "以Markdown格式输出攻击模式，每个攻击模式使用 --- 分隔，包含以下字段：\n"
        "title: 攻击模式标题\n"
        "pattern_type: 类型（general|go-specific|cloud-business|expert-experience）\n"
        "risk_level: 风险等级（critical|high|medium|low）\n"
        "tags: 标签列表（逗号分隔）\n"
        "summary: 简要摘要（100字以内）\n"
        "---\n"
        "（攻击模式正文，详细描述攻击手法、触发条件、防御措施）\n"
        "每个攻击模式对应一种独立的攻击手法。"
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
