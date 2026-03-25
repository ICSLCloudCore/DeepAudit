"""
安全知识库洞察执行服务

流程：
1. 读取洞察配置（项目路径、prompt 等）
2. 启动专用的 opencode serve 进程（不复用其他项目进程）
3. 创建 opencode 会话，发送全局洞察 skill prompt，等待完成
4. 从 {project_path}/reports/vuln-insight-report.md 读取洞察报告
   - 整个文件作为一条 GoVulnerabilityEntry（content = 原始 md 全文）
   - title/summary/tags/go_packages/source_url 从 md 结构中提取
5. 发送攻击模式提取 skill prompt，等待完成
6. 从 {project_path}/vuln-lib/patterns/*-patterns.md 读取所有攻击模式文件
   - 每个文件作为一条 GoAttackPatternEntry（content = 原始 md 全文）
   - 若同名文件对应的模式已存在，则更新并递增版本号
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
    print(f"[Insight] opencode serve 已启动，PID={proc.pid}，日志: {log_path}")
    return proc.pid, log_path


async def _wait_for_port(log_path: str, max_attempts: int = 20) -> Optional[str]:
    """轮询日志文件，等待 opencode 输出监听端口。"""
    for attempt in range(max_attempts):
        await asyncio.sleep(1)
        if os.path.exists(log_path):
            try:
                content = Path(log_path).read_text(encoding="utf-8", errors="replace")
                m = re.search(r"http://127\.0\.0\.1:(\d+)", content)
                if m:
                    print(f"[Insight] 第 {attempt+1} 次尝试，检测到端口: {m.group(1)}")
                    return m.group(1)
                else:
                    print(f"[Insight] 第 {attempt+1} 次尝试，日志暂无端口，当前内容: {content[:200]!r}")
            except Exception as exc:
                print(f"[Insight] 读取日志失败: {exc}")
        else:
            print(f"[Insight] 第 {attempt+1} 次尝试，日志文件尚不存在: {log_path}")
    return None


def _stop_opencode_process(pid: int) -> None:
    """优雅地终止 opencode 进程（SIGTERM → SIGKILL）。"""
    print(f"[Insight] 发送 SIGTERM 到 PID={pid}")
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError as e:
        print(f"[Insight] SIGTERM 失败: {e}")
        return
    import time
    time.sleep(1)
    try:
        os.kill(pid, 0)
        print(f"[Insight] 进程 PID={pid} 仍在运行，发送 SIGKILL")
        os.kill(pid, signal.SIGKILL)
    except OSError:
        print(f"[Insight] 进程 PID={pid} 已退出")


# ─── OpenCode HTTP 调用 ───────────────────────────────────────────────────────

async def _create_session(base_url: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{base_url}/session", json={"title": "Insight Session"})
            print(f"[Insight] 创建会话响应: HTTP {resp.status_code}")
            if resp.status_code == 200:
                session_id = resp.json().get("id")
                print(f"[Insight] 会话 ID: {session_id}")
                return session_id
    except Exception as e:
        print(f"[Insight] 创建会话失败: {e}")
    return None


async def _get_message_count(base_url: str, session_id: str) -> int:
    """获取会话当前消息数量，用于多轮 prompt 的轮询起始点。"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{base_url}/session/{session_id}/message")
            if resp.status_code == 200:
                data = resp.json()
                count = len(data) if isinstance(data, list) else 0
                print(f"[Insight] 当前会话消息数: {count}")
                return count
    except Exception as e:
        print(f"[Insight] 获取消息数失败: {e}")
    return 0


async def _send_prompt(base_url: str, session_id: str, prompt: str) -> Optional[str]:
    """异步发送 prompt，返回 message_id。"""
    import secrets
    import string
    alphabet = string.ascii_letters + string.digits
    message_id = "msg_" + "".join(secrets.choice(alphabet) for _ in range(26))
    print(f"[Insight] 发送 prompt，message_id={message_id}，内容前50字: {prompt[:50]!r}")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{base_url}/session/{session_id}/prompt_async",
                json={"messageID": message_id, "parts": [{"type": "text", "text": prompt}]},
            )
            print(f"[Insight] prompt_async 响应: HTTP {resp.status_code}")
            if resp.status_code in (200, 202, 204):
                return message_id
            else:
                print(f"[Insight] prompt_async 异常响应体: {resp.text[:200]}")
    except Exception as e:
        print(f"[Insight] 发送 prompt 失败: {e}")
    return None


async def _wait_for_completion(
    base_url: str,
    session_id: str,
    start_index: int = 0,
    max_polls: int = 3600,
    label: str = "",
) -> bool:
    """
    轮询 opencode 消息接口，等待 skill 执行完成。

    start_index：发送本次 prompt 之前会话中已有的消息数量，
                 轮询只关注 data[start_index:] 的新消息，避免旧消息干扰。

    退出条件：
    - 主要：新消息数（new_count）连续 10 次不变，且 new_count > 0
    - 兜底：new_count 持续为 0 超过 120 次（2 分钟），可能 skill 静默完成
    """
    message_url = f"{base_url}/session/{session_id}/message"
    prev_new_count: int = -1   # 上一次的新消息数，-1 表示尚未取到
    stable_count: int = 0      # new_count 连续不变的次数
    tag = f"[Insight][{label}]" if label else "[Insight]"

    print(f"{tag} 开始轮询，start_index={start_index}，max_polls={max_polls}")

    for poll_count in range(max_polls):
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(message_url)
                if resp.status_code == 200:
                    data: list = resp.json()
                    new_count = len(data) - start_index
                    if new_count < 0:
                        new_count = 0

                    # 每30次或前10次打印详细状态，便于诊断
                    if poll_count % 30 == 0 or poll_count < 10:
                        print(
                            f"{tag} 轮询 #{poll_count+1}: "
                            f"总消息={len(data)}，新消息={new_count}，"
                            f"stable_count={stable_count}，prev={prev_new_count}"
                        )

                    # 稳定性判断：与上次相比是否有变化
                    if new_count == prev_new_count:
                        stable_count += 1
                    else:
                        if prev_new_count != -1:
                            print(f"{tag} 新消息数变化: {prev_new_count} → {new_count}，stable重置")
                        stable_count = 0
                    prev_new_count = new_count

                    # 主退出条件：有新消息且稳定 10 次（≈10秒）
                    if stable_count >= 10 and new_count > 0:
                        print(f"{tag} 执行完成（消息数稳定），new_count={new_count}，轮询 {poll_count+1} 次")
                        return True

                    # 兜底退出条件：新消息一直为 0 超过 120 秒，认为 skill 静默完成
                    if stable_count >= 120 and new_count == 0:
                        print(f"{tag} 兜底退出：新消息持续为0超过120秒，可能 skill 静默完成")
                        return True

                else:
                    print(f"{tag} 轮询响应异常: HTTP {resp.status_code}，body={resp.text[:100]}")

        except Exception as e:
            print(f"{tag} 轮询异常: {e}")

        await asyncio.sleep(1)

    print(f"{tag} 轮询超时（{max_polls}次），强制继续后续步骤")
    return False


# ─── 工具函数 ────────────────────────────────────────────────────────────────

def _slugify_simple(text: str) -> str:
    s = text.lower()
    s = re.sub(r"[^\w\s-]", "", s, flags=re.UNICODE)
    s = re.sub(r"[\s_]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    ascii_part = re.sub(r"[^a-z0-9-]", "", s).strip("-")
    return ascii_part[:190] if ascii_part else uuid.uuid4().hex[:8]


def _tags_from_text(raw: object) -> list[str]:
    if isinstance(raw, list):
        return [str(t).strip() for t in raw if str(t).strip()]
    return [t.strip() for t in str(raw or "").split(",") if t.strip()]


def _bump_minor_version(version: str) -> str:
    """版本号递增：1.0.0 → 1.1.0 → 1.2.0"""
    parts = version.split(".")
    if len(parts) >= 2:
        try:
            minor = int(parts[1]) + 1
            return f"{parts[0]}.{minor}.0"
        except ValueError:
            pass
    return "1.1.0"


# ─── 洞察报告解析（reports/vuln-insight-report.md）──────────────────────────
#
# 整个文件对应一条 GoVulnerabilityEntry：
#   content  = 文件全文（原始 md）
#   title    = 文件第一个 # 标题行
#   summary  = ## 概述 段第一段有效文字
#   tags     = > 项目: xxx 的项目名 + 统计表中的漏洞类型关键词
#   go_packages = 正文中 github.com/... 路径，去重
#   source_url  = 正文中第一个 https:// 链接（若有）


def parse_vuln_report_file(project_path: str) -> tuple[str, list[dict]]:
    """
    读取 {project_path}/reports/vuln-insight-report.md，
    将整个文件作为一条洞察报告返回。
    返回 (文件全文, [单条条目dict])，文件不存在则返回 ("", [])。
    """
    report_path = Path(project_path) / "reports" / "vuln-insight-report.md"
    print(f"[Insight] 尝试读取洞察报告: {report_path}")
    if not report_path.exists():
        print(f"[Insight] 洞察报告文件不存在: {report_path}")
        # 列出 reports 目录内容辅助诊断
        reports_dir = Path(project_path) / "reports"
        if reports_dir.exists():
            files = list(reports_dir.iterdir())
            print(f"[Insight] reports/ 目录下的文件: {[f.name for f in files]}")
        else:
            print(f"[Insight] reports/ 目录不存在")
        return "", []

    md_content = report_path.read_text(encoding="utf-8", errors="replace")
    print(f"[Insight] 读取洞察报告成功: {report_path}，共 {len(md_content)} 字符")

    entry = _build_vuln_entry_from_report(md_content)
    return md_content, [entry]


def _build_vuln_entry_from_report(md_content: str) -> dict:
    """将整份 vuln-insight-report.md 内容解析为一条 GoVulnerabilityEntry。"""
    # ── title ───────────────────────────────────────────────────────────────
    title_m = re.search(r"^#\s+(.+)", md_content, re.MULTILINE)
    title = title_m.group(1).strip() if title_m else "漏洞洞察报告"

    # ── summary：## 概述 段第一段 ────────────────────────────────────────────
    overview_m = re.search(r"##\s*概述\s*\n+([\s\S]+?)(?:\n##|\Z)", md_content, re.IGNORECASE)
    if overview_m:
        first_para = re.split(r"\n\n+", overview_m.group(1).strip())[0].strip()
        summary = re.sub(r"\s+", " ", first_para)[:1000] or title
    else:
        quote_m = re.search(r"^>\s*(.+)", md_content, re.MULTILINE)
        summary = quote_m.group(1).strip()[:1000] if quote_m else title

    # ── tags：项目名 + 漏洞类型 ─────────────────────────────────────────────
    tags: list[str] = []
    proj_m = re.search(r"^>\s*项目[：:]\s*(.+)", md_content, re.MULTILINE)
    if proj_m:
        for p in re.split(r"[,，/\s]+", proj_m.group(1)):
            p = p.strip()
            if p and p not in tags:
                tags.append(p)
    for row_m in re.finditer(r"^\|\s*([^|]+?)\s*\([A-Z]+\)\s*\|", md_content, re.MULTILINE):
        tag = row_m.group(1).strip()
        if tag and tag not in tags:
            tags.append(tag)

    # ── go_packages ─────────────────────────────────────────────────────────
    pkg_matches = re.findall(r"github\.com/[\w./-]+", md_content)
    go_packages = list(dict.fromkeys(pkg_matches))

    # ── source_url ──────────────────────────────────────────────────────────
    url_m = re.search(r"https?://\S+", md_content)
    source_url = url_m.group(0).rstrip("）).,。") if url_m else None

    # ── slug（含时间戳保证多次洞察唯一） ────────────────────────────────────
    slug_base = _slugify_simple(title) or uuid.uuid4().hex[:8]
    slug = f"{slug_base}-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}"[:200]

    print(f"[Insight] 洞察报告解析结果: title={title!r}, tags={tags}, go_packages_count={len(go_packages)}")
    return {
        "title": title[:200],
        "slug": slug,
        "tags": tags,
        "summary": summary,
        "content": md_content,
        "go_packages": go_packages,
        "source_url": source_url,
        "is_active": True,
    }


# ─── 攻击模式解析（vuln-lib/patterns/*-patterns.md）─────────────────────────
#
# 每个文件作为一条 GoAttackPatternEntry：
#   content      = 文件全文（原始 md）
#   title        = 文件第一个 # 标题行（如「拒绝服务 攻击模式集」）
#   pattern_type = 从文件名推断
#   risk_level   = 文件内出现的最高风险等级
#   tags         = 文件名标识 + 文件内 GO-ATK-XXX ID 列表
#   summary      = 文件概述段 / 模式列表说明
#   file_key     = 用于 upsert 匹配的唯一标识（文件名去掉 .md 后缀）

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

_RISK_PRIORITY = {"critical": 4, "high": 3, "medium": 2, "low": 1}
_RISK_MAP: dict[str, str] = {
    "高危": "high", "高": "high", "critical": "critical", "严重": "critical",
    "中危": "medium", "中": "medium", "medium": "medium",
    "低危": "low", "低": "low", "low": "low",
}


def _detect_pattern_type(filename: str) -> str:
    name = filename.lower()
    for key, ptype in _PATTERN_TYPE_MAP.items():
        if key in name:
            return ptype
    return "general"


def _extract_highest_risk(md_content: str) -> str:
    """
    从文档中提取所有出现的严重性值，返回最高级别。
    只匹配表格数据行（| 值 |）或 **严重性：** 值 这类字段上下文，
    避免把表头「严重性」误认为是 critical。
    """
    found_levels = []
    # 匹配表格数据列：| 高危 | 或 | high | 等（非表头行）
    for cell_m in re.finditer(r"\|\s*([^|]+?)\s*\|", md_content):
        cell = cell_m.group(1).strip()
        if cell in _RISK_MAP:
            found_levels.append(_RISK_MAP[cell])
    # 匹配字段行：**严重性：** 高危 / **Severity:** high
    for field_m in re.finditer(
        r"\*\*(?:严重性|Severity|风险等级)[：:]\*\*\s*(\S+)",
        md_content, re.IGNORECASE
    ):
        val = field_m.group(1).strip().rstrip("。，,.")
        if val in _RISK_MAP:
            found_levels.append(_RISK_MAP[val])
    if not found_levels:
        return "medium"
    return max(found_levels, key=lambda l: _RISK_PRIORITY.get(l, 0))


def _parse_attack_pattern_file_as_whole(md_content: str, filename: str) -> dict:
    """将整个 *-patterns.md 文件解析为一条攻击模式记录。"""
    # ── title：第一个 # 标题 ─────────────────────────────────────────────────
    title_m = re.search(r"^#\s+(.+)", md_content, re.MULTILINE)
    if title_m:
        title = title_m.group(1).strip()
    else:
        # fallback：文件名转标题
        title = filename.replace("-patterns.md", "").replace("_patterns.md", "").replace("-", " ").title()

    # ── pattern_type ────────────────────────────────────────────────────────
    pattern_type = _detect_pattern_type(filename)

    # ── risk_level：取文档中出现的最高级别 ──────────────────────────────────
    risk_level = _extract_highest_risk(md_content)

    # ── tags：文件名类型标识 + 文档内所有 GO-ATK-XXX ID ─────────────────────
    file_type_tag = filename.replace("-patterns.md", "").replace("_patterns.md", "").upper()
    tags: list[str] = [file_type_tag] if file_type_tag else []
    for id_m in re.finditer(r"\bGO-ATK-[\w-]+\b", md_content):
        atk_id = id_m.group(0)
        if atk_id not in tags:
            tags.append(atk_id)

    # ── summary：第一个 ## 标题下方的说明段落 ───────────────────────────────
    first_section_m = re.search(r"##\s*.+\n+([\s\S]+?)(?:\n##|\Z)", md_content)
    if first_section_m:
        first_para = re.split(r"\n\n+", first_section_m.group(1).strip())[0].strip()
        # 去掉表格行
        first_para = re.sub(r"^\|.+\|$", "", first_para, flags=re.MULTILINE).strip()
        summary = re.sub(r"\s+", " ", first_para)[:1000] or title
    else:
        summary = title

    # ── file_key：用于 upsert 的唯一标识 ────────────────────────────────────
    file_key = filename.replace(".md", "")
    slug_base = _slugify_simple(file_key) or uuid.uuid4().hex[:8]

    print(
        f"[Insight] 攻击模式文件解析: {filename} → title={title!r}, "
        f"risk={risk_level}, type={pattern_type}, tags_count={len(tags)}"
    )
    return {
        "file_key": file_key,       # 用于 upsert 查找
        "slug_base": slug_base,     # slug 的基础部分
        "title": title[:200],
        "pattern_type": pattern_type,
        "risk_level": risk_level,
        "tags": tags,
        "summary": summary,
        "content": md_content,
        "is_active": True,
    }


def parse_attack_pattern_files(project_path: str) -> list[dict]:
    """
    扫描 {project_path}/vuln-lib/patterns/*-patterns.md，
    每个文件作为一条攻击模式返回。
    """
    patterns_dir = Path(project_path) / "vuln-lib" / "patterns"
    print(f"[Insight] 扫描攻击模式目录: {patterns_dir}")
    if not patterns_dir.exists():
        print(f"[Insight] 攻击模式目录不存在: {patterns_dir}")
        return []

    all_files = sorted(set(
        list(patterns_dir.glob("*-patterns.md")) +
        list(patterns_dir.glob("*_patterns.md"))
    ))
    print(f"[Insight] 发现 {len(all_files)} 个攻击模式文件: {[f.name for f in all_files]}")

    entries: list[dict] = []
    for pf in all_files:
        try:
            md_content = pf.read_text(encoding="utf-8", errors="replace")
            print(f"[Insight] 读取: {pf.name}，共 {len(md_content)} 字符")
            e = _parse_attack_pattern_file_as_whole(md_content, pf.name)
            entries.append(e)
        except Exception as exc:
            print(f"[Insight] 读取/解析 {pf.name} 失败: {exc}")

    print(f"[Insight] 共解析 {len(entries)} 条攻击模式")
    return entries


# ─── DB 保存 ─────────────────────────────────────────────────────────────────

async def _save_vuln_entries(db: AsyncSession, entries: list[dict]) -> int:
    """批量保存漏洞条目（append-only），返回实际保存数量。"""
    saved = 0
    for e in entries:
        # slug 含时间戳基本不会冲突，保险起见仍检查
        slug = e["slug"]
        existing = (await db.execute(
            select(GoVulnerabilityEntry).where(GoVulnerabilityEntry.slug == slug)
        )).scalar_one_or_none()
        if existing:
            slug = slug + "-" + uuid.uuid4().hex[:6]

        entry = GoVulnerabilityEntry(
            title=e["title"],
            slug=slug,
            tags=json.dumps(e["tags"], ensure_ascii=False),
            summary=e.get("summary"),
            content=e["content"],
            go_packages=json.dumps(e.get("go_packages", []), ensure_ascii=False),
            source_url=e.get("source_url"),
            is_system=True,
            is_active=True,
        )
        db.add(entry)
        saved += 1
        print(f"[Insight] 新增漏洞报告: slug={slug!r}, title={e['title'][:60]!r}")

    if saved:
        try:
            await db.commit()
            print(f"[Insight] 漏洞报告已提交，共 {saved} 条")
        except Exception as exc:
            await db.rollback()
            print(f"[Insight] 保存漏洞条目失败（已回滚）: {exc}")
            return 0
    return saved


async def _upsert_attack_entries(db: AsyncSession, entries: list[dict]) -> tuple[int, int]:
    """
    攻击模式 upsert：
    - 以 slug_base（= slugify(file_key)）为唯一键，查找 is_latest=True 的已有记录
    - 若存在 → 旧记录 is_latest=False，创建新版本（版本号递增，parent_id=旧id）
    - 若不存在 → 直接创建 1.0.0 版本
    返回 (created_count, updated_count)
    """
    created = 0
    updated = 0

    for e in entries:
        slug_base = e["slug_base"]

        # 查找同 slug_base 前缀且 is_latest=True 的最新记录
        existing = (await db.execute(
            select(GoAttackPatternEntry).where(
                GoAttackPatternEntry.slug == slug_base,
                GoAttackPatternEntry.is_latest == True,
            )
        )).scalar_one_or_none()

        if existing:
            # 旧版本标记为非最新
            old_version = existing.version
            new_version = _bump_minor_version(old_version)
            existing.is_latest = False
            db.add(existing)

            new_id = str(uuid.uuid4())
            new_entry = GoAttackPatternEntry(
                id=new_id,
                pattern_id=existing.pattern_id,   # 保持同一 pattern_id
                version=new_version,
                version_notes=f"自动更新（洞察执行于 {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}）",
                is_latest=True,
                parent_id=existing.id,
                title=e["title"],
                slug=slug_base,
                pattern_type=e["pattern_type"],
                risk_level=e["risk_level"],
                tags=json.dumps(e["tags"], ensure_ascii=False),
                summary=e.get("summary"),
                content=e["content"],
                is_system=True,
                is_active=True,
            )
            db.add(new_entry)
            updated += 1
            print(
                f"[Insight] 更新攻击模式: slug={slug_base!r}, "
                f"{old_version} → {new_version}, title={e['title'][:60]!r}"
            )
        else:
            new_id = str(uuid.uuid4())
            new_entry = GoAttackPatternEntry(
                id=new_id,
                pattern_id=new_id,
                version="1.0.0",
                is_latest=True,
                title=e["title"],
                slug=slug_base,
                pattern_type=e["pattern_type"],
                risk_level=e["risk_level"],
                tags=json.dumps(e["tags"], ensure_ascii=False),
                summary=e.get("summary"),
                content=e["content"],
                is_system=True,
                is_active=True,
            )
            db.add(new_entry)
            created += 1
            print(f"[Insight] 新增攻击模式: slug={slug_base!r}, title={e['title'][:60]!r}")

    if created + updated > 0:
        try:
            await db.commit()
            print(f"[Insight] 攻击模式已提交：新增 {created}，更新 {updated}")
        except Exception as exc:
            await db.rollback()
            print(f"[Insight] 保存攻击模式失败（已回滚）: {exc}")
            return 0, 0

    return created, updated


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

    print(f"[Insight] ===== 洞察任务开始 =====")
    print(f"[Insight] 项目路径: {project_path}")
    print(f"[Insight] interval_hours: {config.get('interval_hours')}")

    if not project_path or not os.path.isdir(project_path):
        _insight_running = False
        _insight_status = "error"
        _insight_last_error = f"洞察项目路径无效: '{project_path}'"
        print(f"[Insight] 错误: {_insight_last_error}")
        return {"success": False, "message": _insight_last_error, "vuln_count": 0, "attack_count": 0}

    pid: Optional[int] = None
    log_path: Optional[str] = None

    try:
        # ── 1. 启动专用 opencode 进程 ──────────────────────────────────────
        print(f"[Insight] 步骤1: 启动 opencode serve")
        pid, log_path = _start_opencode_process(project_path)
        _insight_pid = pid

        await asyncio.sleep(3)
        port = await _wait_for_port(log_path)
        if not port:
            raise RuntimeError("无法从日志中获取 opencode 端口（超过20次尝试）")
        _insight_port = port
        base_url = f"http://127.0.0.1:{port}"
        print(f"[Insight] opencode 服务就绪: {base_url}")

        # ── 2. 健康检查 ────────────────────────────────────────────────────
        print(f"[Insight] 步骤2: 健康检查")
        healthy = False
        for attempt in range(15):
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    r = await client.get(f"{base_url}/global/health")
                    if r.status_code == 200 and r.json().get("healthy"):
                        healthy = True
                        print(f"[Insight] 健康检查通过（第 {attempt+1} 次）")
                        break
                    else:
                        print(f"[Insight] 健康检查第 {attempt+1} 次: HTTP {r.status_code}, {r.text[:100]}")
            except Exception as exc:
                print(f"[Insight] 健康检查第 {attempt+1} 次异常: {exc}")
            await asyncio.sleep(1)
        if not healthy:
            raise RuntimeError("opencode 健康检查超时（15次）")

        # ── 3. 创建会话 ────────────────────────────────────────────────────
        print(f"[Insight] 步骤3: 创建 opencode 会话")
        session_id = await _create_session(base_url)
        if not session_id:
            raise RuntimeError("无法创建 opencode 会话")

        # ── 4. 发送全局洞察 skill prompt ──────────────────────────────────
        print(f"[Insight] 步骤4: 发送全局洞察 skill prompt")
        # 记录发送前消息数（此时应为 0，但为严谨起见仍获取）
        pre_insight_count = await _get_message_count(base_url, session_id)
        msg_id = await _send_prompt(base_url, session_id, insight_prompt)
        if not msg_id:
            raise RuntimeError("发送洞察 prompt 失败")

        print(f"[Insight] 等待全局洞察 skill 执行完成（从消息索引 {pre_insight_count} 开始轮询）...")
        completed = await _wait_for_completion(
            base_url, session_id,
            start_index=pre_insight_count,
            label="洞察skill"
        )
        if not completed:
            print(f"[Insight] 警告：洞察 skill 轮询超时，继续尝试读取报告文件")

        # ── 5. 从文件读取洞察报告，解析并保存 ────────────────────────────
        print(f"[Insight] 步骤5: 读取 reports/vuln-insight-report.md")
        _, vuln_entries = parse_vuln_report_file(project_path)
        print(f"[Insight] 解析到 {len(vuln_entries)} 条漏洞报告")

        vuln_count = 0
        if vuln_entries:
            async with AsyncSessionLocal() as db:
                vuln_count = await _save_vuln_entries(db, vuln_entries)
            print(f"[Insight] 已保存 {vuln_count} 条漏洞报告")
        else:
            print(f"[Insight] 未读取到漏洞报告，跳过保存")

        # ── 6. 发送攻击模式提取 skill prompt ────────────────────────────
        attack_created = 0
        attack_updated = 0
        if attack_prompt:
            print(f"[Insight] 步骤6: 发送攻击模式提取 skill prompt")
            # 关键：记录本次 prompt 发送前的消息数，轮询只看新消息
            pre_attack_count = await _get_message_count(base_url, session_id)
            print(f"[Insight] 发送攻击模式 prompt 前消息数: {pre_attack_count}")

            atk_msg_id = await _send_prompt(base_url, session_id, attack_prompt)
            if atk_msg_id:
                print(f"[Insight] 等待攻击模式提取 skill 执行完成（从消息索引 {pre_attack_count} 开始轮询）...")
                await _wait_for_completion(
                    base_url, session_id,
                    start_index=pre_attack_count,
                    label="攻击模式skill"
                )
            else:
                print(f"[Insight] 攻击模式 prompt 发送失败，仍尝试读取已有文件")
        else:
            print(f"[Insight] 步骤6: 攻击模式 prompt 为空，跳过发送，直接读取文件")

        # ── 7. 从文件读取攻击模式，解析并 upsert ─────────────────────────
        print(f"[Insight] 步骤7: 读取 vuln-lib/patterns/ 目录")
        attack_entries = parse_attack_pattern_files(project_path)
        print(f"[Insight] 解析到 {len(attack_entries)} 条攻击模式")

        if attack_entries:
            async with AsyncSessionLocal() as db:
                attack_created, attack_updated = await _upsert_attack_entries(db, attack_entries)
            print(f"[Insight] 攻击模式完成：新增 {attack_created}，更新 {attack_updated}")
        else:
            print(f"[Insight] 未读取到攻击模式文件，跳过保存")

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

        attack_count = attack_created + attack_updated
        summary = (
            f"洞察完成：{vuln_count} 条漏洞报告，"
            f"攻击模式 新增{attack_created}/更新{attack_updated}"
        )
        _insight_status = "success"
        _insight_last_report = summary
        print(f"[Insight] ===== {summary} =====")
        return {
            "success": True, "message": summary,
            "vuln_count": vuln_count, "attack_count": attack_count,
        }

    except Exception as exc:
        err = str(exc)
        print(f"[Insight] 洞察执行失败: {err}\n{traceback.format_exc()}")
        _insight_status = "error"
        _insight_last_error = err
        return {"success": False, "message": err, "vuln_count": 0, "attack_count": 0}

    finally:
        # ── 9. 关闭专用 opencode 进程 ─────────────────────────────────────
        if pid:
            print(f"[Insight] 步骤9: 关闭专用 opencode 进程 PID={pid}")
            _stop_opencode_process(pid)
        _insight_running = False
        _insight_pid = None
        _insight_port = None
        print(f"[Insight] ===== 洞察任务结束 =====")
