"""
安全知识库洞察执行服务

流程：
1. 读取洞察配置（项目路径、prompt 等）
2. 启动专用的 opencode serve 进程（不复用其他项目进程）
3. 创建 opencode 会话，发送全局洞察 prompt
4. 轮询结果，收集完整响应文本
5. 解析响应文本中的洞察报告，保存到 go_vulnerability_entries 表
6. 继续发送攻击模式提取 prompt（以洞察报告内容为上下文）
7. 解析响应，保存到 go_attack_pattern_entries 表
8. 关闭该专用 opencode 进程，更新 last_run_at / next_run_at
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

_insight_running: bool = False          # 是否正在执行洞察
_insight_pid: Optional[int] = None      # 当前洞察专用 opencode 进程 PID
_insight_port: Optional[str] = None     # 当前洞察专用 opencode 监听端口
_insight_status: str = "idle"           # idle | running | success | error
_insight_last_error: str = ""           # 最近一次错误信息
_insight_last_report: str = ""          # 最近一次运行摘要


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

def _start_opencode_process(project_path: str) -> tuple[int, str, str]:
    """
    在 project_path 目录下启动 opencode serve，返回 (pid, log_path, port_or_empty)。
    port 从日志中异步读取（见 _wait_for_port）。
    """
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
    return proc.pid, log_path, ""


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
    """创建 opencode 会话，返回 session id。"""
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


async def _poll_result(base_url: str, session_id: str, max_polls: int = 3600) -> str:
    """
    轮询消息接口，收集所有 text 类型消息片段，返回完整响应文本。
    使用与 opencode_session_service 相同的"连续10次相同长度"停止策略。
    """
    message_url = f"{base_url}/session/{session_id}/message"
    collected: list[str] = []
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
                        break
                    for item in data[record_index:]:
                        info = item.get("info", {})
                        if info.get("finish") is not None:
                            for part in item.get("parts", []):
                                if part.get("type") == "text":
                                    collected.append(part.get("text", ""))
                            record_index += 1
        except Exception as e:
            print(f"[Insight] 轮询失败: {e}")
        await asyncio.sleep(1)

    return "\n".join(collected)


# ─── 报告解析 ────────────────────────────────────────────────────────────────

def _slugify_simple(text: str) -> str:
    """简单 slug 化：小写、只保留字母数字和连字符。"""
    import re as _re
    s = text.lower()
    s = _re.sub(r"[^\w\s-]", "", s, flags=_re.UNICODE)
    s = _re.sub(r"[\s_]+", "-", s)
    s = _re.sub(r"-+", "-", s).strip("-")
    # 去掉非 ASCII（中文等），替换为 hash 片段
    ascii_part = _re.sub(r"[^a-z0-9-]", "", s).strip("-")
    if not ascii_part:
        ascii_part = uuid.uuid4().hex[:8]
    return ascii_part[:190]


def _unique_slug(base: str, existing: set[str]) -> str:
    slug = base
    suffix = 0
    while slug in existing:
        suffix += 1
        slug = f"{base}-{suffix}"
    existing.add(slug)
    return slug


def _split_into_sections(text: str) -> list[str]:
    """
    将 LLM 输出拆分成独立报告段落。支持两种格式：
    1. Frontmatter 格式：每段以 ---\n 开头，包含 YAML metadata + 正文
    2. 标题格式：每段以 ## 或 # 标题行开头
    """
    sections: list[str] = []

    # 优先尝试 frontmatter 格式：--- YAML --- body
    # 匹配完整块：--- 开头，YAML，再一个 ---，然后是正文直到下一个 --- 或结尾
    fm_pattern = re.compile(
        r"(---\n(?:(?!---).)+?---\n(?:(?!---).)*)",
        re.DOTALL,
    )
    fm_matches = fm_pattern.findall(text)
    if fm_matches:
        for m in fm_matches:
            m = m.strip()
            if m:
                sections.append(m)
        return sections

    # fallback：按 ## 或 # 标题行分割
    heading_pattern = re.compile(r"(?:^|\n)(#{1,3} .+[\s\S]*?)(?=\n#{1,3} |\Z)")
    heading_matches = heading_pattern.findall(text)
    if heading_matches:
        for m in heading_matches:
            m = m.strip()
            if m:
                sections.append(m)
        return sections

    # 最终 fallback：整段视为一个条目
    if text.strip():
        sections.append(text.strip())
    return sections


def _extract_meta_and_body(raw: str) -> tuple[dict, str]:
    """从原始段落中提取 frontmatter 元数据和正文。"""
    import frontmatter as fm
    if raw.startswith("---"):
        try:
            post = fm.loads(raw)
            body = post.content.strip()
            return dict(post.metadata), body
        except Exception:
            pass
    return {}, raw


def _tags_from_meta(raw_val: object) -> list[str]:
    if isinstance(raw_val, list):
        return [str(t).strip() for t in raw_val if str(t).strip()]
    return [t.strip() for t in str(raw_val or "").split(",") if t.strip()]


def _parse_vuln_sections(text: str) -> list[dict]:
    """从 LLM 输出中提取漏洞报告列表。"""
    entries = []
    existing_slugs: set[str] = set()

    for raw in _split_into_sections(text):
        meta, body = _extract_meta_and_body(raw)

        title = str(meta.get("title", "")).strip()
        if not title:
            m = re.search(r"^#{1,3}\s+(.+)", body, re.MULTILINE)
            title = m.group(1).strip() if m else ""
        if not title or len(title) < 3:
            continue
        if not body or len(body) < 5:
            body = raw

        tags = _tags_from_meta(meta.get("tags", ""))
        pkgs_raw = meta.get("go_packages", "")
        go_packages = _tags_from_meta(pkgs_raw)

        summary = str(meta.get("summary", "")).strip()[:1000] or None
        source_url = str(meta.get("source_url", "")).strip()[:500] or None

        slug_base = _slugify_simple(title) or uuid.uuid4().hex[:8]
        slug = _unique_slug(slug_base, existing_slugs)

        entries.append({
            "title": title[:200],
            "slug": slug,
            "tags": tags,
            "summary": summary,
            "content": body or "（内容待补充）",
            "go_packages": go_packages,
            "source_url": source_url,
            "is_active": True,
        })

    return entries


def _parse_attack_sections(text: str) -> list[dict]:
    """从 LLM 输出中提取攻击模式列表。"""
    _valid_pattern_types = {"general", "go-specific", "cloud-business", "expert-experience"}
    _valid_risk_levels = {"critical", "high", "medium", "low"}
    entries = []
    existing_slugs: set[str] = set()

    for raw in _split_into_sections(text):
        meta, body = _extract_meta_and_body(raw)

        title = str(meta.get("title", "")).strip()
        if not title:
            m = re.search(r"^#{1,3}\s+(.+)", body, re.MULTILINE)
            title = m.group(1).strip() if m else ""
        if not title or len(title) < 3:
            continue
        if not body or len(body) < 5:
            body = raw

        tags = _tags_from_meta(meta.get("tags", ""))
        summary = str(meta.get("summary", "")).strip()[:1000] or None

        pattern_type = str(meta.get("pattern_type", "general")).strip()
        if pattern_type not in _valid_pattern_types:
            pattern_type = "general"

        risk_level = str(meta.get("risk_level", meta.get("severity", "medium"))).strip()
        if risk_level not in _valid_risk_levels:
            risk_level = "medium"

        slug_base = _slugify_simple(title) or uuid.uuid4().hex[:8]
        slug = _unique_slug(slug_base, existing_slugs)

        entries.append({
            "title": title[:200],
            "slug": slug,
            "pattern_type": pattern_type,
            "risk_level": risk_level,
            "tags": tags,
            "summary": summary,
            "content": body or "（内容待补充）",
            "is_active": True,
        })

    return entries


# ─── DB 保存 ─────────────────────────────────────────────────────────────────

async def _save_vuln_entries(db: AsyncSession, entries: list[dict]) -> int:
    """批量保存漏洞条目，跳过 slug 冲突的条目，返回实际保存数量。"""
    saved = 0
    for e in entries:
        existing = (await db.execute(
            select(GoVulnerabilityEntry).where(GoVulnerabilityEntry.slug == e["slug"])
        )).scalar_one_or_none()
        if existing:
            # slug 冲突 → 追加 uuid 片段
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
    执行一次完整的洞察流程。如果已有洞察在运行，则立即返回状态。
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
        pid, log_path, _ = _start_opencode_process(project_path)
        _insight_pid = pid
        print(f"[Insight] opencode PID={pid}，等待端口...")

        # 先等待 3s 让进程初始化
        await asyncio.sleep(3)
        port = await _wait_for_port(log_path)
        if not port:
            raise RuntimeError("无法从日志中获取 opencode 端口")
        _insight_port = port
        base_url = f"http://127.0.0.1:{port}"
        print(f"[Insight] opencode 服务端口: {port}")

        # ── 2. 健康检查 ────────────────────────────────────────────────────
        for attempt in range(10):
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

        # ── 4. 发送洞察 prompt ────────────────────────────────────────────
        print("[Insight] 发送全局洞察 prompt...")
        msg_id = await _send_prompt(base_url, session_id, insight_prompt)
        if not msg_id:
            raise RuntimeError("发送洞察 prompt 失败")

        # ── 5. 轮询洞察结果 ───────────────────────────────────────────────
        print("[Insight] 轮询洞察结果...")
        vuln_text = await _poll_result(base_url, session_id)
        print(f"[Insight] 收到洞察响应，长度: {len(vuln_text)} 字符")

        # ── 6. 解析并保存漏洞条目 ─────────────────────────────────────────
        vuln_entries = _parse_vuln_sections(vuln_text)
        print(f"[Insight] 解析到 {len(vuln_entries)} 条漏洞报告")

        async with AsyncSessionLocal() as db:
            vuln_count = await _save_vuln_entries(db, vuln_entries)
        print(f"[Insight] 已保存 {vuln_count} 条漏洞报告")

        # ── 7. 攻击模式提取（基于洞察结果作为上下文） ────────────────────
        combined_attack_prompt = (
            f"以下是安全洞察报告的内容：\n\n{vuln_text[:8000]}\n\n{attack_prompt}"
        )
        print("[Insight] 发送攻击模式提取 prompt...")
        # 复用同一会话（上下文连续）
        atk_msg_id = await _send_prompt(base_url, session_id, combined_attack_prompt)
        attack_count = 0
        if atk_msg_id:
            print("[Insight] 轮询攻击模式结果...")
            attack_text = await _poll_result(base_url, session_id)
            print(f"[Insight] 收到攻击模式响应，长度: {len(attack_text)} 字符")
            attack_entries = _parse_attack_sections(attack_text)
            print(f"[Insight] 解析到 {len(attack_entries)} 条攻击模式")
            async with AsyncSessionLocal() as db:
                attack_count = await _save_attack_entries(db, attack_entries)
            print(f"[Insight] 已保存 {attack_count} 条攻击模式")
        else:
            print("[Insight] 攻击模式 prompt 发送失败，跳过")

        # ── 8. 更新运行时间 ───────────────────────────────────────────────
        now_iso = datetime.now(timezone.utc).isoformat()
        interval_hours: int = config.get("interval_hours", 24)
        if interval_hours > 0:
            from datetime import timedelta
            next_dt = datetime.now(timezone.utc) + timedelta(hours=interval_hours)
            next_iso = next_dt.isoformat()
        else:
            next_iso = None  # 立即模式不自动再次调度

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
        tb = traceback.format_exc()
        print(f"[Insight] 洞察执行失败: {err}\n{tb}")
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
