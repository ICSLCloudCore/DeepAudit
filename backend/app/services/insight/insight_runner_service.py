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
from app.services.insight.insight_config_service import load_insight_config, save_insight_config
from app.utils.log import logger

# ─── 运行状态（进程内单例） ────────────────────────────────────────────────────

_insight_running: bool = False
_insight_abort: bool = False  # 中止标志，设为 True 后各等待循环将退出
_insight_pid: Optional[int] = None
_insight_port: Optional[str] = None
_insight_status: str = "idle"  # idle | running | success | error | aborted
_insight_last_error: str = ""
_insight_last_report: str = ""
_insight_current_step: str = ""  # 当前步骤描述
_insight_logs: list[str] = []  # 运行日志（最近 200 条）
_insight_messages: list[dict] = []  # opencode 消息（think + text，最近 50 条）

_MAX_LOGS = 200
_MAX_MSGS = 50


def _log(msg: str) -> None:
    """记录一条运行日志，同时打印到 stdout。"""
    global _insight_logs
    logger.info(f"[Insight] {msg}")
    _insight_logs.append(msg)
    if len(_insight_logs) > _MAX_LOGS:
        _insight_logs = _insight_logs[-_MAX_LOGS:]


def _set_step(step: str) -> None:
    global _insight_current_step
    _insight_current_step = step
    _log(f"▶ {step}")


def _add_message(role: str, content_type: str, text: str) -> None:
    global _insight_messages
    _insight_messages.append(
        {
            "role": role,
            "type": content_type,  # "text" | "reasoning"
            "text": text[:4000],  # 截断超长内容
            "ts": datetime.now(timezone.utc).isoformat(),
        }
    )
    if len(_insight_messages) > _MAX_MSGS:
        _insight_messages = _insight_messages[-_MAX_MSGS:]


def get_insight_status() -> dict[str, Any]:
    return {
        "running": _insight_running,
        "status": _insight_status,
        "pid": _insight_pid,
        "port": _insight_port,
        "current_step": _insight_current_step,
        "last_error": _insight_last_error,
        "last_report": _insight_last_report,
        "logs": list(_insight_logs[-50:]),
        "messages": list(_insight_messages),
    }


def abort_insight() -> dict[str, Any]:
    """
    请求中止当前正在运行的洞察任务。
    设置 _insight_abort 标志，各等待循环将在下次检查时退出，
    同时立即 SIGTERM opencode 进程加速退出。
    """
    global _insight_abort
    if not _insight_running:
        return {"success": False, "message": "当前没有正在运行的洞察任务"}
    _insight_abort = True
    _log("⚠️ 收到中止请求，正在中止洞察任务...")
    # 立即发信号给 opencode 进程加速退出
    if _insight_pid:
        try:
            os.kill(_insight_pid, signal.SIGTERM)
            _log(f"已发送 SIGTERM 到 opencode 进程 PID={_insight_pid}")
        except OSError:
            pass
    return {"success": True, "message": "中止请求已发送，洞察任务即将停止"}


def _reset_state() -> None:
    global _insight_logs, _insight_messages, _insight_current_step
    global _insight_last_error, _insight_last_report, _insight_abort
    _insight_logs = []
    _insight_messages = []
    _insight_current_step = ""
    _insight_last_error = ""
    _insight_last_report = ""
    _insight_abort = False


# ─── OpenCode 进程管理 ────────────────────────────────────────────────────────


def _start_opencode_process(project_path: str) -> tuple[int, str]:
    """在 project_path 目录下启动 opencode serve，返回 (pid, log_path)。"""
    log_dir = (
        "/tmp/opencode_insight_logs" if sys.platform != "win32" else "C:/temp/opencode_insight_logs"
    )
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
    _log(f"opencode serve 已启动，PID={proc.pid}，日志: {log_path}")
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
                    _log(f"检测到 opencode 端口: {m.group(1)}（第 {attempt + 1} 次尝试）")
                    return m.group(1)
                else:
                    if attempt < 3 or attempt % 5 == 0:
                        _log(f"等待端口中（第 {attempt + 1} 次），日志内容: {content[:300]!r}")
            except Exception as exc:
                _log(f"读取 opencode 日志失败: {exc}")
        else:
            if attempt < 3:
                _log(f"等待日志文件（第 {attempt + 1} 次）: {log_path}")
    return None


def _stop_opencode_process(pid: int) -> None:
    """优雅地终止 opencode 进程（SIGTERM → SIGKILL）。"""
    _log(f"发送 SIGTERM 到 PID={pid}")
    try:
        os.kill(pid, signal.SIGTERM)
    except OSError as e:
        _log(f"SIGTERM 失败: {e}")
        return
    import time

    time.sleep(1)
    try:
        os.kill(pid, 0)
        _log(f"进程 PID={pid} 仍在运行，发送 SIGKILL")
        os.kill(pid, signal.SIGKILL)
    except OSError:
        _log(f"进程 PID={pid} 已退出")


# ─── OpenCode HTTP 调用 ───────────────────────────────────────────────────────


async def _create_session(base_url: str) -> Optional[str]:
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(f"{base_url}/session", json={"title": "Insight Session"})
            _log(f"创建会话响应: HTTP {resp.status_code}")
            if resp.status_code == 200:
                session_id = resp.json().get("id")
                _log(f"会话 ID: {session_id}")
                return session_id
    except Exception as e:
        _log(f"创建会话失败: {e}")
    return None


async def _get_message_count(base_url: str, session_id: str) -> int:
    """获取会话当前消息数量，用于多轮 prompt 的轮询起始点。"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{base_url}/session/{session_id}/message")
            if resp.status_code == 200:
                data = resp.json()
                count = len(data) if isinstance(data, list) else 0
                _log(f"当前会话消息数: {count}")
                return count
    except Exception as e:
        _log(f"获取消息数失败: {e}")
    return 0


async def _send_prompt(base_url: str, session_id: str, prompt: str) -> Optional[str]:
    """异步发送 prompt，返回 message_id。"""
    import secrets
    import string

    alphabet = string.ascii_letters + string.digits
    message_id = "msg_" + "".join(secrets.choice(alphabet) for _ in range(26))
    _log(f"发送 prompt，message_id={message_id}，内容: {prompt[:80]!r}")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(
                f"{base_url}/session/{session_id}/prompt_async",
                json={"messageID": message_id, "parts": [{"type": "text", "text": prompt}]},
            )
            _log(f"prompt_async 响应: HTTP {resp.status_code}")
            if resp.status_code in (200, 202, 204):
                return message_id
            else:
                _log(f"prompt_async 异常响应体: {resp.text[:300]}")
    except Exception as e:
        _log(f"发送 prompt 失败: {e}")
    return None


def _collect_new_messages(data: list, start_index: int, collected_indices: set) -> None:
    """
    从消息列表中提取新出现的 text / reasoning 片段，存入 _insight_messages。
    collected_indices 记录已收集过的消息下标，避免重复。
    """
    for idx, item in enumerate(data[start_index:], start=start_index):
        if idx in collected_indices:
            continue
        for part in item.get("parts", []):
            ptype = part.get("type", "")
            text = part.get("text", "").strip()
            if ptype in ("text", "reasoning") and text:
                _add_message("assistant", ptype, text)
                collected_indices.add(idx)
                break  # 每条消息只取第一个有效 part


async def _wait_for_completion(
    base_url: str,
    session_id: str,
    start_index: int = 0,
    max_polls: int = 3600,
    label: str = "",
) -> bool:
    """
    轮询 opencode 消息接口，等待 skill 执行完成，同时收集 think/text 输出。

    start_index：发送本次 prompt 之前会话中已有的消息数量，
                 轮询只关注 data[start_index:] 的新消息，避免旧消息干扰。

    退出条件：
    - 主要：新消息数（new_count）连续 10 次不变，且 new_count > 0
    - 兜底：new_count 持续为 0 超过 120 次（2 分钟）
    """
    message_url = f"{base_url}/session/{session_id}/message"
    prev_new_count: int = -1
    stable_count: int = 0
    collected_indices: set = set()
    tag = label or "轮询"

    _log(f"[{tag}] 开始轮询，start_index={start_index}")

    for poll_count in range(max_polls):
        # 检查中止标志
        if _insight_abort:
            _log(f"[{tag}] 检测到中止请求，停止轮询")
            return False

        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(message_url)
                if resp.status_code == 200:
                    data: list = resp.json()
                    new_count = max(0, len(data) - start_index)

                    # 收集新消息内容（think/text）
                    _collect_new_messages(data, start_index, collected_indices)

                    # 每30次或前10次打印详细状态
                    if poll_count % 30 == 0 or poll_count < 10:
                        _log(
                            f"[{tag}] #{poll_count + 1}: "
                            f"总={len(data)} 新={new_count} "
                            f"stable={stable_count} prev={prev_new_count}"
                        )

                    if new_count == prev_new_count:
                        stable_count += 1
                    else:
                        if prev_new_count != -1:
                            _log(f"[{tag}] 消息数变化: {prev_new_count}→{new_count}")
                        stable_count = 0
                    prev_new_count = new_count

                    if stable_count >= 10 and new_count > 0:
                        _log(f"[{tag}] 执行完成，new_count={new_count}，共 {poll_count + 1} 次轮询")
                        return True

                    if stable_count >= 120 and new_count == 0:
                        _log(f"[{tag}] 兜底退出：新消息持续为0超过120秒")
                        return True

                else:
                    _log(f"[{tag}] 轮询异常 HTTP {resp.status_code}: {resp.text[:100]}")

        except Exception as e:
            _log(f"[{tag}] 轮询异常: {e}")

        await asyncio.sleep(1)

    _log(f"[{tag}] 超时（{max_polls}次），强制继续")
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


# ─── 文件等待 / 诊断辅助 ─────────────────────────────────────────────────────


async def _wait_for_file(
    path: Path,
    label: str = "文件",
    timeout_secs: int = 1800,
    base_url: str = "",
    session_id: str = "",
    start_index: int = 0,
) -> bool:
    """
    以文件存在作为 skill 完成的主要信号，轮询等待指定文件出现且大小 > 0。
    每秒检查一次文件，每 30 秒打印一次目录快照和消息进度。
    base_url/session_id/start_index 有值时，同步收集 opencode 消息到前端。
    返回 True 表示文件已存在，False 表示超时。
    """
    _log(f"等待 {label} 生成: {path}（最多 {timeout_secs // 60}分{timeout_secs % 60}秒）")
    _log(f"  skill 可能运行较长时间（需采集数据、调用 LLM），请耐心等待")

    collected_indices: set = set()

    for elapsed in range(timeout_secs):
        # 检查中止标志
        if _insight_abort:
            _log(f"⚠️ [{label}] 检测到中止请求，停止等待文件")
            return False

        if path.exists() and path.stat().st_size > 0:
            _log(f"✓ {label} 已生成（等待 {elapsed}s），大小: {path.stat().st_size} 字节")
            return True

        # 每 30 秒输出一次诊断快照
        if elapsed % 30 == 0:
            parent = path.parent
            if parent.exists():
                files = [f.name for f in parent.iterdir()]
                _log(f"  [{elapsed}s] {parent.name}/ 目录内容: {files}")
            else:
                _log(f"  [{elapsed}s] 目录不存在: {parent}")

            # 同步收集并记录新的 opencode 消息
            if base_url and session_id:
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        resp = await client.get(f"{base_url}/session/{session_id}/message")
                        if resp.status_code == 200:
                            data: list = resp.json()
                            new_msgs = data[start_index:]
                            _log(f"  [{elapsed}s] 会话新消息数: {len(new_msgs)}")
                            _collect_new_messages(data, start_index, collected_indices)
                            # 打印最新一条文本消息，方便实时观察 skill 进度
                            for item in reversed(new_msgs):
                                for part in item.get("parts", []):
                                    if part.get("type") == "text" and part.get("text", "").strip():
                                        snippet = part["text"].strip()[:200]
                                        _log(f"  [{elapsed}s] 最新消息: {snippet}")
                                        break
                                else:
                                    continue
                                break
                except Exception:
                    pass

        await asyncio.sleep(1)

    _log(f"✗ 等待 {label} 超时（{timeout_secs}s）")
    return False


async def _wait_for_dir_non_empty(
    path: Path,
    label: str = "目录",
    timeout_secs: int = 1800,
    base_url: str = "",
    session_id: str = "",
    start_index: int = 0,
) -> bool:
    """轮询等待目录存在且含有 .md 文件，以文件生成为主要信号。"""
    _log(f"等待 {label} 有文件写入: {path}（最多 {timeout_secs // 60}分）")
    collected_indices: set = set()

    for elapsed in range(timeout_secs):
        # 检查中止标志
        if _insight_abort:
            _log(f"⚠️ [{label}] 检测到中止请求，停止等待目录")
            return False

        if path.exists():
            md_files = list(path.glob("*.md"))
            if md_files:
                _log(f"✓ {label} 已有文件（{elapsed}s）: {[f.name for f in md_files]}")
                return True

        if elapsed % 30 == 0:
            if path.exists():
                _log(f"  [{elapsed}s] {path.name}/ 现有文件: {[f.name for f in path.iterdir()]}")
            else:
                _log(f"  [{elapsed}s] 目录不存在: {path}")

            if base_url and session_id:
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        resp = await client.get(f"{base_url}/session/{session_id}/message")
                        if resp.status_code == 200:
                            data: list = resp.json()
                            new_msgs = data[start_index:]
                            _log(f"  [{elapsed}s] 会话新消息数: {len(new_msgs)}")
                            _collect_new_messages(data, start_index, collected_indices)
                except Exception:
                    pass

        await asyncio.sleep(1)

    _log(f"✗ 等待 {label} 超时（{timeout_secs}s）")
    return False


async def _dump_session_messages(base_url: str, session_id: str, start_index: int = 0) -> None:
    """
    读取 opencode 会话消息，把所有文本内容记录到日志，辅助定位 skill 行为。
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{base_url}/session/{session_id}/message")
            if resp.status_code != 200:
                return
            data: list = resp.json()
            new_msgs = data[start_index:]
            if not new_msgs:
                _log("会话无新消息")
                return
            _log(f"── 会话消息详情（共 {len(new_msgs)} 条新消息）──")
            for i, item in enumerate(new_msgs):
                for part in item.get("parts", []):
                    ptype = part.get("type", "")
                    text = part.get("text", "").strip()
                    if ptype == "text" and text:
                        _log(f"  [消息{i + 1}·text] {text[:500]}")
                    elif ptype == "reasoning" and text:
                        _log(f"  [消息{i + 1}·think] {text[:300]}")
                    elif ptype == "tool-invocation":
                        tool = part.get("toolInvocation", {})
                        tool_name = tool.get("toolName", "")
                        tool_state = tool.get("state", "")
                        _log(f"  [消息{i + 1}·tool] {tool_name} state={tool_state}")
                        if tool_state == "result":
                            result = tool.get("result", "")
                            _log(f"    result: {str(result)[:300]}")
    except Exception as exc:
        _log(f"读取会话消息失败: {exc}")


# ─── 项目目录诊断 ─────────────────────────────────────────────────────────────


def _log_project_tree(project_path: str, depth: int = 3) -> None:
    """记录项目目录结构（最多3层），辅助确认 skill 输出路径。"""
    _log(f"── 项目目录结构: {project_path} ──")
    base = Path(project_path)
    for item in sorted(base.rglob("*")):
        rel = item.relative_to(base)
        parts = rel.parts
        if len(parts) <= depth:
            indent = "  " * (len(parts) - 1)
            size = f" ({item.stat().st_size}B)" if item.is_file() else "/"
            _log(f"  {indent}{item.name}{size}")


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
    _log(f"尝试读取洞察报告: {report_path}")
    if not report_path.exists():
        _log(f"洞察报告文件不存在: {report_path}")
        # 列出 reports 目录内容辅助诊断
        reports_dir = Path(project_path) / "reports"
        if reports_dir.exists():
            files = list(reports_dir.iterdir())
            _log(f"reports/ 目录下的文件: {[f.name for f in files]}")
        else:
            _log(f"reports/ 目录不存在")
        return "", []

    md_content = report_path.read_text(encoding="utf-8", errors="replace")
    _log(f"读取洞察报告成功: {report_path}，共 {len(md_content)} 字符")

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

    _log(f"洞察报告解析结果: title={title!r}, tags={tags}, go_packages_count={len(go_packages)}")
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
    "高危": "high",
    "高": "high",
    "critical": "critical",
    "严重": "critical",
    "中危": "medium",
    "中": "medium",
    "medium": "medium",
    "低危": "low",
    "低": "low",
    "low": "low",
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
        r"\*\*(?:严重性|Severity|风险等级)[：:]\*\*\s*(\S+)", md_content, re.IGNORECASE
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
        title = (
            filename.replace("-patterns.md", "")
            .replace("_patterns.md", "")
            .replace("-", " ")
            .title()
        )

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

    logger.info(
        f"[Insight] 攻击模式文件解析: {filename} → title={title!r}, "
        f"risk={risk_level}, type={pattern_type}, tags_count={len(tags)}"
    )
    return {
        "file_key": file_key,  # 用于 upsert 查找
        "slug_base": slug_base,  # slug 的基础部分
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
    _log(f"扫描攻击模式目录: {patterns_dir}")
    if not patterns_dir.exists():
        _log(f"攻击模式目录不存在: {patterns_dir}")
        return []

    all_files = sorted(
        set(list(patterns_dir.glob("*-patterns.md")) + list(patterns_dir.glob("*_patterns.md")))
    )
    _log(f"发现 {len(all_files)} 个攻击模式文件: {[f.name for f in all_files]}")

    entries: list[dict] = []
    for pf in all_files:
        try:
            md_content = pf.read_text(encoding="utf-8", errors="replace")
            _log(f"读取: {pf.name}，共 {len(md_content)} 字符")
            e = _parse_attack_pattern_file_as_whole(md_content, pf.name)
            entries.append(e)
        except Exception as exc:
            _log(f"读取/解析 {pf.name} 失败: {exc}")

    _log(f"共解析 {len(entries)} 条攻击模式")
    return entries


# ─── DB 保存 ─────────────────────────────────────────────────────────────────


async def _save_vuln_entries(db: AsyncSession, entries: list[dict]) -> int:
    """批量保存漏洞条目（append-only），返回实际保存数量。"""
    saved = 0
    for e in entries:
        # slug 含时间戳基本不会冲突，保险起见仍检查
        slug = e["slug"]
        existing = (
            await db.execute(select(GoVulnerabilityEntry).where(GoVulnerabilityEntry.slug == slug))
        ).scalar_one_or_none()
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
            is_system=False,  # 洞察生成的报告允许用户编辑
            is_active=True,
        )
        db.add(entry)
        saved += 1
        _log(f"新增漏洞报告: slug={slug!r}, title={e['title'][:60]!r}")

    if saved:
        try:
            await db.commit()
            _log(f"漏洞报告已提交，共 {saved} 条")
        except Exception as exc:
            await db.rollback()
            _log(f"保存漏洞条目失败（已回滚）: {exc}")
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
        existing = (
            await db.execute(
                select(GoAttackPatternEntry).where(
                    GoAttackPatternEntry.slug == slug_base,
                    GoAttackPatternEntry.is_latest == True,
                )
            )
        ).scalar_one_or_none()

        if existing:
            # 旧版本标记为非最新，同时重命名 slug（追加版本号）以释放唯一约束
            # 例如：dos-patterns → dos-patterns-v1.0.0
            old_version = existing.version
            new_version = _bump_minor_version(old_version)
            archived_slug = f"{slug_base}-v{old_version}"
            existing.is_latest = False
            existing.slug = archived_slug  # 释放 slug_base 以供新版本使用
            db.add(existing)

            # 先 flush 旧版本的 slug 变更，再插入新版本，避免唯一约束冲突
            await db.flush()

            new_id = str(uuid.uuid4())
            new_entry = GoAttackPatternEntry(
                id=new_id,
                pattern_id=existing.pattern_id,
                version=new_version,
                version_notes=f"自动更新（洞察执行于 {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}）",
                is_latest=True,
                parent_id=existing.id,
                title=e["title"],
                slug=slug_base,  # 新版本继承规范 slug
                pattern_type=e["pattern_type"],
                risk_level=e["risk_level"],
                tags=json.dumps(e["tags"], ensure_ascii=False),
                summary=e.get("summary"),
                content=e["content"],
                is_system=False,
                is_active=True,
            )
            db.add(new_entry)
            updated += 1
            _log(
                f"更新攻击模式: slug={slug_base!r}, {old_version}(→{archived_slug}) → {new_version}"
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
                is_system=False,  # 洞察生成的攻击模式允许用户编辑
                is_active=True,
            )
            db.add(new_entry)
            created += 1
            _log(f"新增攻击模式: slug={slug_base!r}, title={e['title'][:60]!r}")

    if created + updated > 0:
        try:
            await db.commit()
            _log(f"攻击模式已提交：新增 {created}，更新 {updated}")
        except Exception as exc:
            await db.rollback()
            _log(f"保存攻击模式失败（已回滚）: {exc}")
            _log(f"  提示：若为唯一约束错误，请检查 slug 是否冲突")
            return 0, 0

    return created, updated


# ─── 主执行入口 ───────────────────────────────────────────────────────────────


async def run_insight() -> dict[str, Any]:
    """
    执行一次完整的洞察流程。如果已有洞察在运行，则立即返回。
    返回 {"success": bool, "message": str, "vuln_count": int, "attack_count": int}
    """
    global _insight_running, _insight_pid, _insight_port, _insight_status

    if _insight_running:
        return {
            "success": False,
            "message": "洞察正在运行中，请稍后",
            "vuln_count": 0,
            "attack_count": 0,
        }

    _insight_running = True
    _insight_status = "running"
    _reset_state()

    config = load_insight_config()
    project_path = config.get("insight_project_path", "").strip()
    insight_prompt = config.get("insight_prompt", "")
    attack_prompt = config.get("attack_pattern_prompt", "")

    _log(f"===== 洞察任务开始 =====")
    _log(f"项目路径: {project_path}")
    _log(f"interval_hours: {config.get('interval_hours')}")

    if not project_path or not os.path.isdir(project_path):
        _insight_running = False
        _insight_status = "error"
        global _insight_last_error
        _insight_last_error = f"洞察项目路径无效: '{project_path}'"
        _log(f"错误: {_insight_last_error}")
        return {
            "success": False,
            "message": _insight_last_error,
            "vuln_count": 0,
            "attack_count": 0,
        }

    # 记录初始目录结构，确认 skill 输出路径是否已存在
    _log_project_tree(project_path)

    pid: Optional[int] = None
    log_path: Optional[str] = None

    try:
        # ── 1. 启动专用 opencode 进程 ──────────────────────────────────────
        _set_step("步骤1/9：启动 opencode serve")
        pid, log_path = _start_opencode_process(project_path)
        _insight_pid = pid

        await asyncio.sleep(3)
        port = await _wait_for_port(log_path)
        if not port:
            raise RuntimeError("无法从日志中获取 opencode 端口（超过20次尝试）")
        _insight_port = port
        base_url = f"http://127.0.0.1:{port}"
        _log(f"opencode 服务就绪: {base_url}")

        # ── 2. 健康检查 ────────────────────────────────────────────────────
        _set_step("步骤2/9：健康检查")
        healthy = False
        for attempt in range(15):
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    r = await client.get(f"{base_url}/global/health")
                    if r.status_code == 200 and r.json().get("healthy"):
                        healthy = True
                        _log(f"健康检查通过（第 {attempt + 1} 次）")
                        break
                    else:
                        _log(f"健康检查第 {attempt + 1} 次: HTTP {r.status_code}, {r.text[:100]}")
            except Exception as exc:
                _log(f"健康检查第 {attempt + 1} 次异常: {exc}")
            await asyncio.sleep(1)
        if not healthy:
            raise RuntimeError("opencode 健康检查超时（15次）")

        # ── 3. 创建会话 ────────────────────────────────────────────────────
        _set_step("步骤3/9：创建 opencode 会话")
        session_id = await _create_session(base_url)
        if not session_id:
            raise RuntimeError("无法创建 opencode 会话")

        # ── 4. 发送全局洞察 skill prompt ──────────────────────────────────
        _set_step("步骤4/9：发送全局洞察 skill prompt")
        pre_insight_count = await _get_message_count(base_url, session_id)
        msg_id = await _send_prompt(base_url, session_id, insight_prompt)
        if not msg_id:
            raise RuntimeError("发送洞察 prompt 失败")

        # 不用 _wait_for_completion（消息稳定 ≠ skill 文件写入完成）。
        # 直接等待报告文件出现，同时每30秒刷新消息到前端面板。
        # skill 需要运行 fetch_issues.py、fetch_pr_diff.py 等子进程，耗时可达十几分钟。
        _set_step("步骤4/9：等待报告文件生成（skill 正在运行，请耐心等待）...")
        report_path = Path(project_path) / "reports" / "vuln-insight-report.md"
        await _wait_for_file(
            report_path,
            label="洞察报告",
            timeout_secs=1800,  # 最多等 30 分钟
            base_url=base_url,
            session_id=session_id,
            start_index=pre_insight_count,
        )

        # 记录 opencode 会话中所有文本消息，帮助定位 skill 行为
        await _dump_session_messages(base_url, session_id, start_index=pre_insight_count)

        # ── 5. 从文件读取洞察报告，解析并保存 ────────────────────────────
        _set_step("步骤5/9：读取 reports/vuln-insight-report.md")
        _, vuln_entries = parse_vuln_report_file(project_path)
        _log(f"解析到 {len(vuln_entries)} 条漏洞报告")

        vuln_count = 0
        if vuln_entries:
            async with AsyncSessionLocal() as db:
                vuln_count = await _save_vuln_entries(db, vuln_entries)
            _log(f"已保存 {vuln_count} 条漏洞报告")
        else:
            _log("未读取到漏洞报告文件，跳过保存")

        # ── 6. 发送攻击模式提取 skill prompt ────────────────────────────
        attack_created = 0
        attack_updated = 0
        if attack_prompt:
            _set_step("步骤6/9：发送攻击模式提取 skill prompt")
            pre_attack_count = await _get_message_count(base_url, session_id)
            _log(f"发送攻击模式 prompt 前消息数: {pre_attack_count}")

            atk_msg_id = await _send_prompt(base_url, session_id, attack_prompt)
            if atk_msg_id:
                _set_step("步骤6/9：等待攻击模式文件生成（skill 正在运行）...")
                patterns_dir = Path(project_path) / "vuln-lib" / "patterns"
                await _wait_for_dir_non_empty(
                    patterns_dir,
                    label="攻击模式目录",
                    timeout_secs=1800,
                    base_url=base_url,
                    session_id=session_id,
                    start_index=pre_attack_count,
                )
                await _dump_session_messages(base_url, session_id, start_index=pre_attack_count)
            else:
                _log("攻击模式 prompt 发送失败，仍尝试读取已有文件")
        else:
            _log("攻击模式 prompt 为空，跳过发送，直接读取文件")

        # ── 7. 从文件读取攻击模式，解析并 upsert ─────────────────────────
        _set_step("步骤7/9：扫描 vuln-lib/patterns/ 目录")
        attack_entries = parse_attack_pattern_files(project_path)
        _log(f"解析到 {len(attack_entries)} 条攻击模式")

        if attack_entries:
            async with AsyncSessionLocal() as db:
                attack_created, attack_updated = await _upsert_attack_entries(db, attack_entries)
            _log(f"攻击模式完成：新增 {attack_created}，更新 {attack_updated}")
        else:
            _log("未读取到攻击模式文件，跳过保存")

        # ── 8. 更新运行时间 ───────────────────────────────────────────────
        _set_step("步骤8/9：更新运行时间")
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
            f"洞察完成：{vuln_count} 条漏洞报告，攻击模式 新增{attack_created}/更新{attack_updated}"
        )
        _insight_status = "success"
        global _insight_last_report
        _insight_last_report = summary
        _set_step("步骤9/9：完成")
        _log(f"===== {summary} =====")
        return {
            "success": True,
            "message": summary,
            "vuln_count": vuln_count,
            "attack_count": attack_count,
        }

    except Exception as exc:
        err = str(exc)
        _log(f"洞察执行失败: {err}")
        _log(traceback.format_exc())
        if _insight_abort:
            _insight_status = "aborted"
            _insight_last_report = "洞察已被用户中止"
        else:
            _insight_status = "error"
            _insight_last_error = err
        return {"success": False, "message": err, "vuln_count": 0, "attack_count": 0}

    finally:
        # ── 9. 关闭专用 opencode 进程 ─────────────────────────────────────
        if pid:
            _log(f"关闭专用 opencode 进程 PID={pid}")
            _stop_opencode_process(pid)
        # 如果是主动中止，更新状态
        if _insight_abort and _insight_status == "running":
            _insight_status = "aborted"
            _insight_last_report = "洞察已被用户中止"
            _log("洞察任务已中止")
        _insight_running = False
        _insight_pid = None
        _insight_port = None
        _insight_abort = False
        _log(f"===== 洞察任务结束 =====")
