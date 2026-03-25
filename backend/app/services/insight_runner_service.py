"""
安全知识库洞察执行服务

流程：
1. 读取洞察配置（项目路径、prompt 等）
2. 启动专用的 opencode serve 进程（不复用其他项目进程）
3. 创建 opencode 会话，发送全局洞察 skill prompt，等待完成
4. 从 {project_path}/report/vuln-insight-report.md 读取洞察报告
   - content 字段 = 整个 md 文件内容
   - title/summary/tags/go_packages/source_url 从 md 结构中提取
   - 按 #### VULN-XXX 段拆分，每段对应一条 GoVulnerabilityEntry
5. 发送攻击模式提取 skill prompt，等待完成
6. 从 {project_path}/vuln-lib/patterns/*-patterns.md 读取所有攻击模式文件
   - 每个文件对应一批 GoAttackPatternEntry（按 ## GO-ATK-XXX 段拆分）
   - content 字段 = 整段 md 内容
   - title/risk_level/tags/summary/pattern_type 从 md 中提取
7. 关闭该专用 opencode 进程，更新 last_run_at / next_run_at
"""

from __future__ import annotations

import asyncio
import json
import os
import re
import signal
import subprocess
import sys
import traceback
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import AsyncSessionLocal
from app.models.security_kb import GoAttackPatternEntry, GoVulnerabilityEntry
from app.services.insight_config_service import load_insight_config, save_insight_config

# ─── 运行状态（进程内单例） ────────────────────────────────────────────────────

_insight_running: bool = False
_insight_pid: Optional[int] = None
_insight_port: Optional[str] = None
_insight_status: str = "idle"           # idle | running | success | error
_insight_last_error: str = ""
_insight_last_report: str = ""


def get_insight_status() -> dict[str, Any]:
    return {
        "running": _insight_running,
        "status": _insight_status,
        "pid": _insight_pid,
        "port": _insight_port,
        "last_error": _insight_last_error,
        "last_report": _insight_last_report,
    }


# ─── OpenCode 进程管理 ────────────────────────────────────────────────────────

def _start_opencode_process(project_path: str) -> tuple[int, str]:
    """在 project_path 目录下启动 opencode serve，返回 (pid, log_path)。"""
    log_dir = "/tmp/opencode_insight_logs" if sys.platform != "win32" else "C:/temp/opencode_insight_logs"
    os.makedirs(log_dir, exist_ok=True)
    log_path = os.path.join(log_dir, f"insight_{uuid.uuid4().hex[:8]}.log")

    log_file = open(log_path, "w")
    kwargs: dict[str, Any] = {
        "cwd": project_path,
        "stdout": log_file,
        "stderr": subprocess.STDOUT,
    }
    if sys.platform != "win32" and hasattr(os, "setsid"):
        kwargs["preexec_fn"] = os.setsid

    proc = subprocess.Popen(["opencode", "serve"], **kwargs)
    return proc.pid, log_path


async def _wait_for_port(log_path: str, max_attempts: int = 20) -> Optional[str]:
    """轮询日志文件，等待 opencode 输出监听端口。"""
    for _ in range(max_attempts):
        await asyncio.sleep(1)
        if os.path.exists(log_path):
            try:
                content = Path(log_path).read_text(encoding="utf-8", errors="replace")
                m = re.search(r"http://127\.0\.0\.1:(\d+)", content)
                if m:
                    return m.group(1)
            except Exception:
                pass
    return None


def _stop_opencode_process(pid: int) -> None:
    """优雅地终止 opencode 进程（SIGTERM → SIGKILL）。"""
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError:
        return
    import time
    time.sleep(1)
    try:
        os.kill(pid, 0)
        os.kill(pid, signal.SIGKILL)
    except OSError:
        pass


# ─── OpenCode HTTP 调用 ───────────────────────────────────────────────────────

async def _create_session(base_url: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{base_url}/session", json={"title": "Insight Session"})
            if resp.status_code == 200:
                return resp.json().get("id")
    except Exception as e:
        print(f"[Insight] 创建会话失败: {e}")
    return None


async def _send_prompt(base_url: str, session_id: str, prompt: str) -> Optional[str]:
    """异步发送 prompt，返回 message_id。"""
    import secrets
    import string
    alphabet = string.ascii_letters + string.digits
    message_id = "msg_" + "".join(secrets.choice(alphabet) for _ in range(26))
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{base_url}/session/{session_id}/prompt_async",
                json={"messageID": message_id, "parts": [{"type": "text", "text": prompt}]},
            )
            if resp.status_code in (200, 202, 204):
                return message_id
    except Exception as e:
        print(f"[Insight] 发送 prompt 失败: {e}")
    return None


async def _wait_for_completion(base_url: str, session_id: str, max_polls: int = 3600) -> bool:
    """
    轮询 opencode 消息接口，等待 skill 执行完成。
    使用「连续10次消息数量不变」策略判断 LLM 已结束输出。
    """
    message_url = f"{base_url}/session/{session_id}/message"
    record_index = 1
    same_time = 0

    for _ in range(max_polls):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(message_url)
                if resp.status_code == 200:
                    data: list = resp.json()
                    if record_index == len(data):
                        same_time += 1
                    else:
                        same_time = 0
                    if same_time >= 10 and len(data) > 1:
                        return True
                    for item in data[record_index:]:
                        info = item.get("info", {})
                        if info.get("finish") is not None:
                            record_index += 1
        except Exception as e:
            print(f"[Insight] 轮询失败: {e}")
        await asyncio.sleep(1)

    return False


# ─── 工具函数 ────────────────────────────────────────────────────────────────

def _slugify_simple(text: str) -> str:
    s = text.lower()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    ascii_part = re.sub(r"[^a-z0-9-]", "", s).strip("-")
    return ascii_part[:190] if ascii_part else uuid.uuid4().hex[:8]


def _unique_slug(base: str, existing: set[str]) -> str:
    slug = base
    suffix = 0
    while slug in existing:
        suffix += 1
        slug = f"{base}-{suffix}"
    existing.add(slug)
    return slug


def _tags_from_text(raw: object) -> list[str]:
    if isinstance(raw, list):
        return [str(t).strip() for t in raw if str(t).strip()]
    return [t.strip() for t in str(raw or "").split(",") if t.strip()]


# ─── 洞察报告解析（vuln-insight-report.md） ──────────────────────────────────

# 漏洞严重程度 → risk_level 映射
_SEVERITY_MAP = {
    "高": "high", "高危": "high", "严重": "critical", "critical": "critical",
    "high": "high", "中": "medium", "中危": "medium", "medium": "medium",
    "低": "low", "低危": "low", "low": "low",
}


def _parse_vuln_report_md(md_content: str) -> list[dict]:
    """
    解析 vuln-insight-report.md 文件内容，提取每条漏洞。

    格式约定：
    - 整个文件作为一个大报告（title 取文件第一个 # 标题）
    - 每个 #### VULN-XXX: 标题行起始一条漏洞条目
    - 每条漏洞的 content = 从该 #### 到下一个 #### 之间的完整文本
    - title = #### 标题行文本（去掉 VULN-XXX: 前缀后的描述）
    - summary / severity / component / go_packages / source_url 从条目内的 - **字段**: 值 提取
    - tags 由组件名 + 漏洞类型推断
    """
    entries: list[dict] = []
    existing_slugs: set[str] = set()

    # 按 #### (VULN-|CVE-|#) 标题拆分单个漏洞条目
    # 匹配 #### VULN-001: xxx 或 #### CVE-2024-xxx 或 #### 任意四级标题
    vuln_split = re.compile(r"(?:^|\n)(####\s+.+)", re.MULTILINE)
    parts = vuln_split.split(md_content)

    # parts[0] 是文件头（概述/统计等），parts[1::2] 是 #### 标题, parts[2::2] 是对应内容
    vuln_blocks: list[tuple[str, str]] = []
    i = 1
    while i + 1 < len(parts):
        heading = parts[i].strip()
        body = parts[i + 1].strip()
        vuln_blocks.append((heading, body))
        i += 2

    for heading, body in vuln_blocks:
        # 从 #### VULN-001: 标题中提取人类可读标题
        title_match = re.match(r"####\s+(?:VULN-\d+|CVE-[\d-]+|[A-Z]+-\d+)[：:]\s*(.+)", heading)
        if title_match:
            title = title_match.group(1).strip()
        else:
            # fallback：去掉 #### 前缀
            title = re.sub(r"^####\s+", "", heading).strip()

        if not title or len(title) < 3:
            continue

        # 将 heading + body 合并为条目的完整内容（便于还原上下文）
        full_section = f"{heading}\n{body}"

        # 从条目内提取结构化字段
        def _extract_field(pattern: str, text: str) -> str:
            m = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            return m.group(1).strip() if m else ""

        severity_raw = _extract_field(r"[-*]\s*\*\*(?:严重程度|Severity|风险等级)\*\*[：:]\s*(.+)", body)
        risk_level = _SEVERITY_MAP.get(severity_raw.lower(), _SEVERITY_MAP.get(severity_raw, "medium"))

        component = _extract_field(r"[-*]\s*\*\*(?:组件|Component)\*\*[：:]\s*(.+)", body)
        vuln_type = _extract_field(r"[-*]\s*\*\*(?:漏洞类型|类型|Type)\*\*[：:]\s*(.+)", body)
        issue_ref = _extract_field(r"[-*]\s*\*\*Issue\*\*[：:]\s*(.+)", body)
        source_url = _extract_field(r"[-*]\s*\*\*(?:参考链接|链接|URL|CVE)\*\*[：:]\s*(https?://\S+)", body)

        # 摘要：取「漏洞描述」段第一句话
        desc_match = re.search(
            r"[-*]\s*\*\*(?:漏洞描述|描述|Description)\*\*[：:]\s*(.+?)(?:\n|$)",
            body, re.IGNORECASE
        )
        summary = desc_match.group(1).strip()[:1000] if desc_match else title[:200]

        # tags：组件名 + 漏洞类型
        tags: list[str] = []
        if component:
            tags.append(component)
        if vuln_type:
            tags.append(vuln_type)
        if issue_ref:
            tags.append(issue_ref)

        # go_packages：从攻击向量或代码路径中尝试提取
        pkg_matches = re.findall(r"github\.com/[\w/-]+", body)
        go_packages = list(dict.fromkeys(pkg_matches))  # 去重保序

        slug_base = _slugify_simple(title) or uuid.uuid4().hex[:8]
        slug = _unique_slug(slug_base, existing_slugs)

        entries.append({
            "title": title[:200],
            "slug": slug,
            "tags": tags,
            "summary": summary,
            "content": full_section,        # 完整 md 段落内容
            "go_packages": go_packages,
            "source_url": source_url or None,
            "is_active": True,
        })

    return entries


def parse_vuln_report_file(project_path: str) -> tuple[str, list[dict]]:
    """
    读取 {project_path}/report/vuln-insight-report.md，返回 (文件全文, 条目列表)。
    文件全文将被存入第一条「总报告」条目的 content（如有需要）。
    """
    report_path = Path(project_path) / "report" / "vuln-insight-report.md"
    if not report_path.exists():
        print(f"[Insight] 洞察报告文件不存在: {report_path}")
        return "", []

    md_content = report_path.read_text(encoding="utf-8", errors="replace")
    print(f"[Insight] 读取洞察报告: {report_path}，共 {len(md_content)} 字符")

    entries = _parse_vuln_report_md(md_content)
    return md_content, entries


# ─── 攻击模式解析（vuln-lib/patterns/*-patterns.md） ─────────────────────────

# 文件名到 pattern_type 的映射（可按需扩展）
_PATTERN_TYPE_MAP: dict[str, str] = {
    "dos": "general",
    "nil": "go-specific",
    "bof": "go-specific",
    "rac": "go-specific",
    "iiv": "go-specific",
    "injection": "general",
    "auth": "general",
    "supply-chain": "general",
    "cloud": "cloud-business",
    "expert": "expert-experience",
}

_RISK_MAP: dict[str, str] = {
    "高危": "high", "高": "high", "critical": "critical", "严重": "critical",
    "中危": "medium", "中": "medium", "medium": "medium",
    "低危": "low", "低": "low", "low": "low",
    "高危 ": "high",  # trailing space guard
}


def _detect_pattern_type_from_filename(filename: str) -> str:
    name = filename.lower().replace("-patterns.md", "").replace("_patterns.md", "")
    for key, ptype in _PATTERN_TYPE_MAP.items():
        if key in name:
            return ptype
    return "general"


def _parse_attack_pattern_file(md_content: str, filename: str) -> list[dict]:
    """
    解析单个 *-patterns.md 文件，提取所有攻击模式条目。

    格式约定：
    - 每个 ## GO-ATK-XXX: 标题行 起始一条攻击模式
    - content = 从该 ## 到下一个 ## 之间的完整文本
    - title = ## 标题文本
    - risk_level / pattern_type / tags / summary 从条目内提取
    """
    entries: list[dict] = []
    existing_slugs: set[str] = set()

    default_pattern_type = _detect_pattern_type_from_filename(filename)

    # 按 ## GO-ATK-XXX 或 ## ID：标题 拆分
    split_re = re.compile(r"(?:^|\n)(##\s+(?:GO-ATK-[\w-]+|[A-Z]+-\d+)[：:].+|##\s+\w[\w\s-]*：.+)", re.MULTILINE)
    parts = split_re.split(md_content)

    pattern_blocks: list[tuple[str, str]] = []
    i = 1
    while i + 1 < len(parts):
        heading = parts[i].strip()
        body = parts[i + 1].strip()
        pattern_blocks.append((heading, body))
        i += 2

    # 如果上面的正则没拆到，fallback：按 ## 三级标题拆
    if not pattern_blocks:
        split_re2 = re.compile(r"(?:^|\n)(##\s+.+)", re.MULTILINE)
        parts2 = split_re2.split(md_content)
        i = 1
        while i + 1 < len(parts2):
            heading = parts2[i].strip()
            body = parts2[i + 1].strip()
            # 跳过目录级别的标题（如「## 模式列表」）
            if not re.search(r"(ATK|攻击|漏洞|模式|Pattern)", heading, re.IGNORECASE):
                i += 2
                continue
            pattern_blocks.append((heading, body))
            i += 2

    for heading, body in pattern_blocks:
        # 提取人类可读标题，去掉 ID 前缀
        title_match = re.match(r"##\s+(?:GO-ATK-[\w-]+)[：:]\s*(.+)", heading)
        if title_match:
            title = title_match.group(1).strip()
        else:
            title = re.sub(r"^##\s+", "", heading).strip()
            # 如果标题包含 「: 内容」 则截取冒号后
            colon_m = re.search(r"[：:]\s*(.+)", title)
            if colon_m:
                title = colon_m.group(1).strip()

        if not title or len(title) < 3:
            continue

        full_section = f"{heading}\n{body}"

        def _ef(pattern: str, text: str) -> str:
            m = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
            return m.group(1).strip() if m else ""

        # 严重性
        sev_raw = _ef(r"\*\*严重性[：:]\*\*\s*(.+)", body) or _ef(r"\*\*(?:Severity|风险等级)[：:]\*\*\s*(.+)", body)
        risk_level = _RISK_MAP.get(sev_raw, _RISK_MAP.get(sev_raw.lower(), "medium"))

        # 模式类型
        ptype_raw = _ef(r"\*\*(?:模式类型|Pattern Type)[：:]\*\*\s*(.+)", body)
        _valid_ptypes = {"general", "go-specific", "cloud-business", "expert-experience"}
        pattern_type = ptype_raw if ptype_raw in _valid_ptypes else default_pattern_type

        # 标签：从「标签」字段或 md 元数据行提取
        tags_raw = _ef(r"[\"标签\"]?\[\"(.+?)\"\]", body)
        if not tags_raw:
            tags_raw = _ef(r"-\s*标签[：:]\s*(.+)", body)
        tags = _tags_from_text(tags_raw) if tags_raw else []
        # 从文件名补充标签
        file_tag = filename.replace("-patterns.md", "").replace("_patterns.md", "").upper()
        if file_tag and file_tag not in tags:
            tags.insert(0, file_tag)

        # 摘要：取「漏洞描述」第一句
        desc_raw = _ef(r"###\s*漏洞描述\s*\n+(.+?)(?:\n\n|\n###)", body)
        if not desc_raw:
            desc_raw = _ef(r"\*\*(?:描述|Description)[：:]\*\*\s*(.+?)(?:\n|$)", body)
        summary = (desc_raw or title)[:1000]

        slug_base = _slugify_simple(title) or uuid.uuid4().hex[:8]
        slug = _unique_slug(slug_base, existing_slugs)

        entries.append({
            "title": title[:200],
            "slug": slug,
            "pattern_type": pattern_type,
            "risk_level": risk_level,
            "tags": tags,
            "summary": summary,
            "content": full_section,        # 完整 md 段落内容
            "is_active": True,
        })

    return entries


def parse_attack_pattern_files(project_path: str) -> list[dict]:
    """
    读取 {project_path}/vuln-lib/patterns/*-patterns.md，
    将所有文件解析为攻击模式条目列表。
    """
    patterns_dir = Path(project_path) / "vuln-lib" / "patterns"
    if not patterns_dir.exists():
        print(f"[Insight] 攻击模式目录不存在: {patterns_dir}")
        return []

    all_entries: list[dict] = []
    existing_slugs_global: set[str] = set()

    pattern_files = sorted(patterns_dir.glob("*-patterns.md")) + sorted(patterns_dir.glob("*_patterns.md"))
    # 去重（glob 可能重叠）
    seen: set[str] = set()
    unique_files: list[Path] = []
    for f in pattern_files:
        if str(f) not in seen:
            seen.add(str(f))
            unique_files.append(f)

    for pf in unique_files:
        md_content = pf.read_text(encoding="utf-8", errors="replace")
        print(f"[Insight] 读取攻击模式文件: {pf.name}，共 {len(md_content)} 字符")
        entries = _parse_attack_pattern_file(md_content, pf.name)
        # 全局 slug 去重
        for e in entries:
            base = e["slug"]
            while e["slug"] in existing_slugs_global:
                e["slug"] = base + "-" + uuid.uuid4().hex[:4]
            existing_slugs_global.add(e["slug"])
        all_entries.extend(entries)

    print(f"[Insight] 共解析 {len(all_entries)} 条攻击模式（来自 {len(unique_files)} 个文件）")
    return all_entries


# ─── DB 保存 ─────────────────────────────────────────────────────────────────

async def _save_vuln_entries(db: AsyncSession, entries: list[dict]) -> int:
    """批量保存漏洞条目，返回实际保存数量。"""
    saved = 0
    for e in entries:
        existing = (await db.execute(
            select(GoVulnerabilityEntry).where(GoVulnerabilityEntry.slug == e["slug"])
        )).scalar_one_or_none()
        if existing:
            e["slug"] = e["slug"] + "-" + uuid.uuid4().hex[:6]

        entry = GoVulnerabilityEntry(
            title=e["title"],
            slug=e["slug"],
            tags=json.dumps(e["tags"], ensure_ascii=False),
            summary=e.get("summary"),
            content=e["content"],
            go_packages=json.dumps(e["go_packages"], ensure_ascii=False),
            source_url=e.get("source_url"),
            is_system=True,
            is_active=True,
        )
        db.add(entry)
        saved += 1

    if saved:
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            print(f"[Insight] 保存漏洞条目失败: {exc}")
            return 0
    return saved


async def _save_attack_entries(db: AsyncSession, entries: list[dict]) -> int:
    """批量保存攻击模式条目，返回实际保存数量。"""
    saved = 0
    for e in entries:
        existing = (await db.execute(
            select(GoAttackPatternEntry).where(GoAttackPatternEntry.slug == e["slug"])
        )).scalar_one_or_none()
        if existing:
            e["slug"] = e["slug"] + "-" + uuid.uuid4().hex[:6]

        new_id = str(uuid.uuid4())
        entry = GoAttackPatternEntry(
            id=new_id,
            pattern_id=new_id,
            version="1.0.0",
            is_latest=True,
            title=e["title"],
            slug=e["slug"],
            pattern_type=e["pattern_type"],
            risk_level=e["risk_level"],
            tags=json.dumps(e["tags"], ensure_ascii=False),
            summary=e.get("summary"),
            content=e["content"],
            is_system=True,
            is_active=True,
        )
        db.add(entry)
        saved += 1

    if saved:
        try:
            await db.commit()
        except Exception as exc:
            await db.rollback()
            print(f"[Insight] 保存攻击模式失败: {exc}")
            return 0
    return saved


# ─── 主执行入口 ───────────────────────────────────────────────────────────────

async def run_insight() -> dict[str, Any]:
    """
    执行一次完整的洞察流程。如果已有洞察在运行，则立即返回。
    返回 {"success": bool, "message": str, "vuln_count": int, "attack_count": int}
    """
    global _insight_running, _insight_pid, _insight_port, _insight_status
    global _insight_last_error, _insight_last_report

    if _insight_running:
        return {"success": False, "message": "洞察正在运行中，请稍后", "vuln_count": 0, "attack_count": 0}

    _insight_running = True
    _insight_status = "running"
    _insight_last_error = ""
    _insight_last_report = ""

    config = load_insight_config()
    project_path = config.get("insight_project_path", "").strip()
    insight_prompt = config.get("insight_prompt", "")
    attack_prompt = config.get("attack_pattern_prompt", "")

    if not project_path or not os.path.isdir(project_path):
        _insight_running = False
        _insight_status = "error"
        _insight_last_error = f"洞察项目路径无效: '{project_path}'"
        return {"success": False, "message": _insight_last_error, "vuln_count": 0, "attack_count": 0}

    pid: Optional[int] = None
    log_path: Optional[str] = None

    try:
        # ── 1. 启动专用 opencode 进程 ──────────────────────────────────────
        print(f"[Insight] 启动 opencode serve，项目路径: {project_path}")
        pid, log_path = _start_opencode_process(project_path)
        _insight_pid = pid
        print(f"[Insight] opencode PID={pid}，等待端口...")

        await asyncio.sleep(3)
        port = await _wait_for_port(log_path)
        if not port:
            raise RuntimeError("无法从日志中获取 opencode 端口")
        _insight_port = port
        base_url = f"http://127.0.0.1:{port}"
        print(f"[Insight] opencode 服务端口: {port}")

        # ── 2. 健康检查 ────────────────────────────────────────────────────
        for _ in range(10):
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    r = await client.get(f"{base_url}/global/health")
                    if r.status_code == 200 and r.json().get("healthy"):
                        break
            except Exception:
                pass
            await asyncio.sleep(1)
        else:
            raise RuntimeError("opencode 健康检查超时")

        # ── 3. 创建会话 ────────────────────────────────────────────────────
        session_id = await _create_session(base_url)
        if not session_id:
            raise RuntimeError("无法创建 opencode 会话")
        print(f"[Insight] 会话 ID: {session_id}")

        # ── 4. 发送全局洞察 skill prompt，等待执行完成 ─────────────────────
        print("[Insight] 发送全局洞察 skill prompt...")
        msg_id = await _send_prompt(base_url, session_id, insight_prompt)
        if not msg_id:
            raise RuntimeError("发送洞察 prompt 失败")

        print("[Insight] 等待洞察 skill 执行完成...")
        completed = await _wait_for_completion(base_url, session_id)
        if not completed:
            print("[Insight] 警告：洞察 skill 轮询超时，继续尝试读取报告文件")

        # ── 5. 从文件读取洞察报告，解析并保存 ────────────────────────────
        print(f"[Insight] 读取洞察报告文件: {project_path}/report/vuln-insight-report.md")
        _, vuln_entries = parse_vuln_report_file(project_path)
        print(f"[Insight] 解析到 {len(vuln_entries)} 条漏洞报告")

        vuln_count = 0
        if vuln_entries:
            async with AsyncSessionLocal() as db:
                vuln_count = await _save_vuln_entries(db, vuln_entries)
            print(f"[Insight] 已保存 {vuln_count} 条漏洞报告")

        # ── 6. 发送攻击模式提取 skill prompt，等待执行完成 ────────────────
        attack_count = 0
        if attack_prompt:
            print("[Insight] 发送攻击模式提取 skill prompt...")
            atk_msg_id = await _send_prompt(base_url, session_id, attack_prompt)
            if atk_msg_id:
                print("[Insight] 等待攻击模式提取 skill 执行完成...")
                await _wait_for_completion(base_url, session_id)
            else:
                print("[Insight] 攻击模式 prompt 发送失败，仍尝试读取已有文件")

        # ── 7. 从文件读取攻击模式，解析并保存 ───────────────────────────
        print(f"[Insight] 读取攻击模式文件: {project_path}/vuln-lib/patterns/")
        attack_entries = parse_attack_pattern_files(project_path)
        print(f"[Insight] 解析到 {len(attack_entries)} 条攻击模式")

        if attack_entries:
            async with AsyncSessionLocal() as db:
                attack_count = await _save_attack_entries(db, attack_entries)
            print(f"[Insight] 已保存 {attack_count} 条攻击模式")

        # ── 8. 更新运行时间 ───────────────────────────────────────────────
        now_iso = datetime.now(timezone.utc).isoformat()
        interval_hours: int = config.get("interval_hours", 24)
        if interval_hours > 0:
            from datetime import timedelta
            next_iso = (datetime.now(timezone.utc) + timedelta(hours=interval_hours)).isoformat()
        else:
            next_iso = None

        config["last_run_at"] = now_iso
        config["next_run_at"] = next_iso
        save_insight_config(config)

        summary = f"洞察完成：{vuln_count} 条漏洞报告，{attack_count} 条攻击模式"
        _insight_status = "success"
        _insight_last_report = summary
        print(f"[Insight] {summary}")
        return {"success": True, "message": summary, "vuln_count": vuln_count, "attack_count": attack_count}

    except Exception as exc:
        err = str(exc)
        print(f"[Insight] 洞察执行失败: {err}\n{traceback.format_exc()}")
        _insight_status = "error"
        _insight_last_error = err
        return {"success": False, "message": err, "vuln_count": 0, "attack_count": 0}

    finally:
        # ── 9. 关闭专用 opencode 进程 ─────────────────────────────────────
        if pid:
            print(f"[Insight] 关闭专用 opencode 进程 PID={pid}")
            _stop_opencode_process(pid)
        _insight_running = False
        _insight_pid = None
        _insight_port = None
