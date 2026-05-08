"""
OpenCode会话服务
负责管理OpenCode会话的创建、提示词发送和结果获取
"""

import asyncio
import uuid
import os
import re
import sys
import httpx
import subprocess
import json
import traceback
import logging
import zipfile
import math
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone
from pathlib import Path

from app.utils.log import logger
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

# 禁用 httpx 的详细日志
logging.getLogger("httpx").setLevel(logging.WARNING)

from app.models.opencode.opencode_session import OpenCodeSession, OpenCodeSessionStatus
from app.models.opencode.opencode_interaction import OpenCodeInteraction, OpenCodeInteractionType
from app.models.opencode.opencode_message_content import (
    OpenCodeMessageContent,
    OpenCodeMessageContentType,
)
from app.services.opencode.opencode_message_parser import OpenCodeMessageParser
from app.schemas.opencode_message import (
    Part,
    PartType,
    TextPart,
    ReasoningPart,
    ToolPart,
    StepStartPart,
    StepFinishPart,
)
from app.models.opencode.opencode_audit_task import OpenCodeAuditTask, OpenCodeAuditTaskStatus
from app.models.audit.audit_vulnerabilities import AuditVulnerability
from app.models.knowledge.prompt_template import PromptTemplate
from app.models.project.project import Project
from app.models.user.user import User
from app.schemas.opencode_session import OpenCodeServerStatus
from app.db.session import AsyncSessionLocal


def ensure_dir_exists(path: str):
    """确保目录存在"""
    os.makedirs(path, exist_ok=True)
    logger.info(f"[OpenCode] Ensured directory exists: {path}")


def link_agent_package_to_project(project_dir: str, agent_package):
    """
    将 Agent 包内容通过软链接链接到项目目录的 .opencode 文件夹

    Args:
        project_dir: 项目目录路径
        agent_package: Agent 包对象，需包含 extracted_dir_path
    """
    logger.info(f"[OpenCode] Linking agent package to project: {agent_package.name}")

    # 验证 Agent 包解压目录存在
    if not agent_package.extracted_dir_path:
        raise ValueError("Agent package has no extracted directory path")

    agent_source_dir = Path(agent_package.extracted_dir_path)
    if not agent_source_dir.exists():
        raise FileNotFoundError(f"Agent package directory not found: {agent_source_dir}")

    # 创建 .opencode 目录（如果已存在则先清理）
    opencode_dir = Path(project_dir) / ".opencode"

    if opencode_dir.exists():
        logger.info(f"[OpenCode] Cleaning existing .opencode directory: {opencode_dir}")
        # 安全删除：检查是否都是软链接
        import shutil

        shutil.rmtree(opencode_dir)

    # 创建新的 .opencode 目录
    opencode_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"[OpenCode] Created .opencode directory: {opencode_dir}")

    # 遍历 Agent 包解压目录的内容，创建软链接
    linked_count = 0
    for item in agent_source_dir.iterdir():
        target_path = opencode_dir / item.name
        source_path = item.absolute()

        # 创建软链接
        try:
            os.symlink(source_path, target_path)
            linked_count += 1
            logger.info(f"[OpenCode] Created symlink: {target_path} -> {source_path}")
        except OSError as e:
            logger.error(f"[OpenCode] Failed to create symlink for {item.name}: {e}")
            raise

    logger.info(f"[OpenCode] Successfully linked {linked_count} items from agent package")


def cleanup_agent_package_links(project_dir: str):
    """
    清理项目目录中的 .opencode 文件夹及其软链接

    Args:
        project_dir: 项目目录路径
    """
    opencode_dir = Path(project_dir) / ".opencode"

    if not opencode_dir.exists():
        logger.info(f"[OpenCode] .opencode directory not found, skipping cleanup")
        return

    logger.info(f"[OpenCode] Cleaning up .opencode directory: {opencode_dir}")

    try:
        import shutil

        shutil.rmtree(opencode_dir)
        logger.info(f"[OpenCode] Successfully cleaned up .opencode directory")
    except Exception as e:
        logger.error(f"[OpenCode] Failed to cleanup .opencode directory: {e}")
        # 不抛出异常，继续执行后续流程


async def log_opencode_interaction_to_db(
    db: AsyncSession,
    session_id: str,
    interaction_type: OpenCodeInteractionType,
    endpoint: str,
    http_method: str,
    request_timestamp: datetime,
    request_payload: Optional[Any] = None,
    response_timestamp: Optional[datetime] = None,
    response_payload: Optional[Any] = None,
    http_status_code: Optional[int] = None,
    duration_ms: Optional[int] = None,
    error_message: Optional[str] = None,
    error_type: Optional[str] = None,
):
    """记录OpenCode Server交互到数据库"""
    try:
        interaction = OpenCodeInteraction(
            session_id=session_id,
            interaction_type=interaction_type,
            endpoint=endpoint,
            http_method=http_method,
            request_timestamp=request_timestamp,
            response_timestamp=response_timestamp,
            duration_ms=duration_ms,
            request_payload=json.dumps(request_payload, default=str) if request_payload else None,
            response_payload=json.dumps(response_payload, default=str)
            if response_payload
            else None,
            http_status_code=http_status_code,
            error_message=error_message,
            error_type=error_type,
        )
        db.add(interaction)
        await db.commit()
        await db.refresh(interaction)
        return interaction
    except Exception as e:
        logger.info(f"[OpenCode] Failed to log interaction to DB: {e}")
        await db.rollback()
        return None


def log_opencode_interaction(direction: str, endpoint: str, data: Any = None):
    """记录OpenCode Server交互日志"""
    timestamp = datetime.now(timezone.utc).isoformat()
    log_entry = {"timestamp": timestamp, "direction": direction, "endpoint": endpoint, "data": data}
    logger.info(
        f"[OpenCode] {direction.upper()} {endpoint}: {json.dumps(data, default=str) if data else 'None'}"
    )


def _calculate_security_score(findings: List[Dict]) -> float:
    """
    计算质量评分 - 使用混合法（累计扣分 + 指数衰减）
    分数趋近于0但永远不等于0
    """
    if not findings:
        return 100.0

    # 定义每个严重程度的基础扣分值
    base_deductions = {
        "critical": 30,
        "high": 20,
        "medium": 12,
        "low": 5,
        "info": 2,
    }

    # 第一步：计算累计扣分（按严重程度）
    total_deduction = 0
    for f in findings:
        if isinstance(f, dict):
            sev = f.get("severity", "low")
            total_deduction += base_deductions.get(sev, 5)

    # 第二步：使用指数衰减让分数趋近于0但永远不等于0
    # k = 1.0（衰减系数）
    k = 1.0
    score = 100.0 * math.exp(-k * total_deduction / 100.0)

    return float(score)


class OpenCodeSessionService:
    """OpenCode会话服务"""

    def __init__(self, db: AsyncSession):
        self.db = db
        self._current_session_id: Optional[str] = None

    def set_current_session_id(self, session_id: str):
        """设置当前会话ID，用于交互记录"""
        self._current_session_id = session_id

    async def _make_opencode_request(
        self,
        method: str,
        url: str,
        endpoint: str,
        json_data: Optional[Dict[str, Any]] = None,
        timeout: float = 10.0,
    ) -> tuple[Optional[httpx.Response], Optional[Exception]]:
        """
        包装OpenCode Server请求，自动记录交互到数据库
        """
        request_time = datetime.now(timezone.utc)

        try:
            log_opencode_interaction("request", endpoint, json_data)

            async with httpx.AsyncClient(timeout=timeout) as client:
                if method.upper() == "GET":
                    response = await client.get(url)
                elif method.upper() == "POST":
                    response = await client.post(url, json=json_data)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")

            response_time = datetime.now(timezone.utc)
            duration_ms = int((response_time - request_time).total_seconds() * 1000)

            logger.info(f"[OpenCode] Response status: {response.status_code}")
            logger.info(f"[OpenCode] Response content: {response.text[:500]}")

            if self._current_session_id:
                if response.status_code in [200, 202, 204]:
                    try:
                        response_data = response.json()
                        log_opencode_interaction("response", endpoint, response_data)

                        await log_opencode_interaction_to_db(
                            self.db,
                            self._current_session_id,
                            OpenCodeInteractionType.RESPONSE,
                            endpoint,
                            method.upper(),
                            request_time,
                            json_data,
                            response_time,
                            response_data,
                            response.status_code,
                            duration_ms,
                        )
                    except Exception:
                        log_opencode_interaction("response", endpoint, {"text": response.text})

                        await log_opencode_interaction_to_db(
                            self.db,
                            self._current_session_id,
                            OpenCodeInteractionType.RESPONSE,
                            endpoint,
                            method.upper(),
                            request_time,
                            json_data,
                            response_time,
                            {"text": response.text},
                            response.status_code,
                            duration_ms,
                        )
                else:
                    log_opencode_interaction(
                        "error",
                        endpoint,
                        {"status_code": response.status_code, "text": response.text},
                    )

                    if self._current_session_id:
                        await log_opencode_interaction_to_db(
                            self.db,
                            self._current_session_id,
                            OpenCodeInteractionType.ERROR,
                            endpoint,
                            method.upper(),
                            request_time,
                            json_data,
                            response_time,
                            None,
                            response.status_code,
                            duration_ms,
                            error_message=f"HTTP {response.status_code}",
                        )

            return response, None

        except Exception as e:
            logger.info(f"[OpenCode] Request exception: {e}")
            logger.info(f"[OpenCode] Request traceback: {traceback.format_exc()}")

            log_opencode_interaction("error", endpoint, {"error": str(e)})

            response_time = datetime.now(timezone.utc)
            duration_ms = int((response_time - request_time).total_seconds() * 1000)

            if self._current_session_id:
                await log_opencode_interaction_to_db(
                    self.db,
                    self._current_session_id,
                    OpenCodeInteractionType.ERROR,
                    endpoint,
                    method.upper(),
                    request_time,
                    json_data,
                    response_time,
                    None,
                    None,
                    duration_ms,
                    error_message=str(e),
                    error_type=type(e).__name__,
                )

            return None, e

    def get_opencode_server_url(self, project: Project) -> str:
        """获取OpenCode Server的URL"""
        if project.opencode_port:
            url = f"http://127.0.0.1:{project.opencode_port}"
            logger.info(f"[OpenCode] Using OpenCode Server URL: {url}")
            return url
        url = "http://127.0.0.1:4096"
        logger.info(f"[OpenCode] Using default OpenCode Server URL: {url}")
        return url

    async def check_opencode_server_health(
        self, project: Project, db_session_id: Optional[str] = None
    ) -> bool:
        """检查OpenCode Server健康状态"""
        logger.info(f"[OpenCode] Checking OpenCode Server health...")
        request_time = datetime.now(timezone.utc)
        try:
            url = self.get_opencode_server_url(project)
            health_url = f"{url}/global/health"

            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(health_url)
                response_time = datetime.now(timezone.utc)
                duration_ms = int((response_time - request_time).total_seconds() * 1000)

                if response.status_code == 200:
                    data = response.json()

                    if db_session_id:
                        await log_opencode_interaction_to_db(
                            self.db,
                            db_session_id,
                            OpenCodeInteractionType.RESPONSE,
                            "/global/health",
                            "GET",
                            request_time,
                            None,
                            response_time,
                            data,
                            response.status_code,
                            duration_ms,
                        )

                    is_healthy = data.get("healthy", False)
                    logger.info(f"[OpenCode] Server healthy: {is_healthy}")
                    return is_healthy
                else:
                    log_opencode_interaction(
                        "error", "/global/health", {"status_code": response.status_code}
                    )

                    if db_session_id:
                        await log_opencode_interaction_to_db(
                            self.db,
                            db_session_id,
                            OpenCodeInteractionType.ERROR,
                            "/global/health",
                            "GET",
                            request_time,
                            None,
                            response_time,
                            None,
                            response.status_code,
                            duration_ms,
                            error_message=f"Status code: {response.status_code}",
                        )

                    return False
        except Exception as e:
            logger.info(f"[OpenCode] Health check exception: {e}")

            if db_session_id:
                response_time = datetime.now(timezone.utc)
                duration_ms = int((response_time - request_time).total_seconds() * 1000)
                await log_opencode_interaction_to_db(
                    self.db,
                    db_session_id,
                    OpenCodeInteractionType.ERROR,
                    "/global/health",
                    "GET",
                    request_time,
                    None,
                    response_time,
                    None,
                    None,
                    duration_ms,
                    error_message=str(e),
                    error_type=type(e).__name__,
                )

            return False

    async def check_opencode_server_status(self, project: Project) -> OpenCodeServerStatus:
        """
        检查OpenCode服务器状态
        """
        logger.info(f"[OpenCode] Checking server status for project {project.id}")
        logger.info(f"[OpenCode] Current opencode_pid: {project.opencode_pid}")
        logger.info(f"[OpenCode] Current opencode_port: {project.opencode_port}")

        if not project.opencode_pid:
            logger.info(f"[OpenCode] No PID found, server is stopped")
            return OpenCodeServerStatus.STOPPED

        try:
            is_healthy = await self.check_opencode_server_health(project)
            if is_healthy:
                logger.info(f"[OpenCode] PID {project.opencode_pid} is running and healthy")
                return OpenCodeServerStatus.RUNNING
            else:
                logger.info(f"[OpenCode] PID {project.opencode_pid} is running but not responding")
                return OpenCodeServerStatus.ERROR

        except ValueError as e:
            logger.info(f"[OpenCode] Invalid PID format: {e}")
            return OpenCodeServerStatus.ERROR
        except OSError as e:
            logger.info(f"[OpenCode] PID {project.opencode_pid} is not running: {e}")
            return OpenCodeServerStatus.STOPPED
        except Exception as e:
            logger.info(f"[OpenCode] Error checking server status: {e}")
            logger.info(f"[OpenCode] Error traceback: {traceback.format_exc()}")
            return OpenCodeServerStatus.ERROR

    async def get_active_session(self, project: Project) -> Optional[OpenCodeSession]:
        """获取项目的活跃 OpenCodeSession"""
        from app.models.opencode.opencode_session import OpenCodeSession, OpenCodeSessionStatus

        if not project.opencode_active_session_id:
            return None

        result = await self.db.execute(
            select(OpenCodeSession).where(OpenCodeSession.id == project.opencode_active_session_id)
        )
        session = result.scalar_one_or_none()

        # 验证会话是否仍然有效
        if (
            session
            and session.status != OpenCodeSessionStatus.CLOSED
            and session.status != OpenCodeSessionStatus.ERROR
        ):
            return session
        return None

    async def start_opencode_server(
        self, project: Project, current_user_id: str, opencode_session_id: str, agent_package=None
    ) -> OpenCodeServerStatus:
        logger.info("[OpenCode] run start_opencode_server")

        """
        启动OpenCode服务器 - 获取真实PID
        """
        logger.info(f"[OpenCode] Starting OpenCode server for project {project.id}")
        logger.info(f"[OpenCode] Project source type: {project.source_type}")
        logger.info(f"[OpenCode] Platform: {sys.platform}")

        logger.info(f"[OpenCode] opencode_session_id: {opencode_session_id}")

        # 确保 opencode_session_id 有值
        if not opencode_session_id:
            raise ValueError("opencode_session_id is required and cannot be empty")

        try:
            # 使用 opencode_session_id 作为目录名
            session_id = opencode_session_id
            logger.info(f"[OpenCode] Session ID: {session_id}")

            project_path = None
            extract_dir = (
                Path(f"/tmp/{session_id}")
                if sys.platform != "win32"
                else Path(f"C:/temp/{session_id}")
            )
            logger.info(f"[OpenCode] Extract directory: {extract_dir}")
            extract_dir.mkdir(parents=True, exist_ok=True)

            if project.source_type == "repository":
                repo_url = project.repository_url
                branch = project.default_branch or "main"
                logger.info(f"[OpenCode] Repository URL: {repo_url}, branch: {branch}")
                if repo_url:
                    logger.info(f"[OpenCode] Cloning repository (using subprocess directly)...")
                    try:
                        clone_process = subprocess.Popen(
                            [
                                "git",
                                "clone",
                                "--depth",
                                "1",
                                "--branch",
                                branch,
                                repo_url,
                                str(extract_dir),
                            ],
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                        )
                        clone_stdout, clone_stderr = clone_process.communicate(timeout=300)
                        logger.info(f"[OpenCode] Clone return code: {clone_process.returncode}")
                        if clone_process.returncode == 0:
                            project_path = str(extract_dir)
                            logger.info(f"[OpenCode] Successfully cloned to: {project_path}")
                        else:
                            logger.info(
                                f"[OpenCode] Clone failed: {clone_stderr.decode() if clone_stderr else 'Unknown error'}"
                            )
                    except subprocess.TimeoutExpired:
                        logger.info(f"[OpenCode] Clone timed out")
                        clone_process.kill()

            elif project.source_type == "zip":
                logger.info(f"[OpenCode] Handling ZIP source type")
                try:
                    from app.core.config import settings
                    from app.services.project.zip_storage import get_project_zip_password

                    zip_file_path = Path(settings.ZIP_STORAGE_PATH) / f"{project.id}.zip"
                    logger.info(f"[OpenCode] ZIP file path: {zip_file_path}")
                    if zip_file_path.exists():
                        logger.info(f"[OpenCode] ZIP file exists, extracting...")
                        import zipfile

                        zip_password = await get_project_zip_password(project.id)
                        pwd_bytes = zip_password.encode("utf-8") if zip_password else None

                        with zipfile.ZipFile(zip_file_path, "r") as zip_ref:
                            zip_ref.extractall(extract_dir, pwd=pwd_bytes)
                        project_path = str(extract_dir)
                        logger.info(f"[OpenCode] Successfully extracted ZIP to: {project_path}")
                    else:
                        logger.info(f"[OpenCode] ZIP file does not exist: {zip_file_path}")
                except Exception as e:
                    logger.info(f"[OpenCode] Error handling ZIP: {e}")
                    logger.info(f"[OpenCode] Error traceback: {traceback.format_exc()}")

            if not project_path:
                logger.info(f"[OpenCode] No project path found, using temporary directory")
                project_path = (
                    f"/tmp/opencode_project_{project.id}"
                    if sys.platform != "win32"
                    else f"C:/temp/opencode_project_{project.id}"
                )
                ensure_dir_exists(project_path)

            logger.info(f"[OpenCode] Final project path: {project_path}")

            # 链接 Agent 包（如果有）
            if agent_package:
                link_agent_package_to_project(project_path, agent_package)

            log_dir = f"/tmp/opencode_logs" if sys.platform != "win32" else "C:/temp/opencode_logs"
            ensure_dir_exists(log_dir)

            random_id = str(uuid.uuid4())[:8]
            log_path = os.path.join(log_dir, f"{random_id}.log")
            logger.info(f"[OpenCode] Log path: {log_path}")

            logger.info(f"[OpenCode] Preparing to start opencode serve...")

            original_cwd = os.getcwd()
            logger.info(f"[OpenCode] Original working directory: {original_cwd}")

            logger.info(f"[OpenCode] Changing to project directory: {project_path}")
            os.chdir(project_path)

            logger.info(f"[OpenCode] Starting opencode serve with subprocess.Popen...")

            log_file = open(log_path, "w")

            try:
                log_file = open(log_path, "w")
                proc = subprocess.Popen(
                    ["opencode", "serve"],
                    cwd=project_path,
                    stdout=log_file,
                    stderr=subprocess.STDOUT,
                    preexec_fn=os.setpgrp,  # Create new process group
                )
                pid = str(proc.pid)
            except Exception as e:
                logger.info(f"[OpenCode] Failed to start opencode serve: {e}")
                import traceback

                traceback.print_exc()
                return OpenCodeServerStatus.ERROR

            logger.info(f"[OpenCode] Started opencode serve with PID: {pid}")

            os.chdir(original_cwd)
            logger.info(f"[OpenCode] Restored original working directory: {original_cwd}")

            logger.info(f"[OpenCode] Waiting for server to start...")
            await asyncio.sleep(3)

            logger.info(f"[OpenCode] Reading log file to find port...")
            port = None
            max_attempts = 20
            for attempt in range(max_attempts):
                if os.path.exists(log_path):
                    try:
                        with open(log_path, "r") as f:
                            log_content = f.read()
                            logger.info(
                                f"[OpenCode] Log content (attempt {attempt + 1}): {log_content[:500]}"
                            )
                            port_match = re.search(r"http://127\.0\.0\.1:(\d+)", log_content)
                            if port_match:
                                port = port_match.group(1)
                                logger.info(f"[OpenCode] Found port: {port}")
                                break
                    except Exception as e:
                        logger.info(f"[OpenCode] Error reading log: {e}")
                else:
                    logger.info(f"[OpenCode] Log file does not exist yet: {log_path}")
                await asyncio.sleep(1)

            if not port:
                logger.info(
                    f"[OpenCode] Could not find port in log file after {max_attempts} attempts"
                )

            logger.info(f"[OpenCode] Updating project with opencode info...")
            project.opencode_pid = str(pid)
            project.opencode_port = port
            project.opencode_log_path = log_path
            project.opencode_started_at = datetime.now(timezone.utc)
            await self.db.commit()

            logger.info(f"[OpenCode] Successfully started opencode serve: PID={pid}, Port={port}")
            return OpenCodeServerStatus.RUNNING

        except Exception as e:
            logger.info(f"[OpenCode] Failed to start OpenCode server: {e}")
            logger.info(f"[OpenCode] Error traceback: {traceback.format_exc()}")
            return OpenCodeServerStatus.ERROR

    async def create_opencode_server_session(self, project: Project) -> Optional[str]:
        """
        在OpenCode服务器上创建会话 - 真实API调用
        """
        logger.info(f"[OpenCode] ========================================")
        logger.info(f"[OpenCode] STARTING CREATE OPENDCODE SESSION")
        logger.info(f"[OpenCode] ========================================")

        try:
            url = self.get_opencode_server_url(project)
            session_url = f"{url}/session"

            request_data = {"title": "DeepAudit Audit Session"}

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(session_url, json=request_data)

                if response.status_code == 200:
                    data = response.json()
                    server_session_id = data.get("id")

                    logger.info(f"[OpenCode] Created server session.")
                    return server_session_id
                else:
                    logger.info(f"[OpenCode] Failed to create session: {response.status_code}")
                    return None

        except Exception as e:
            logger.info(f"[OpenCode] Failed to create OpenCode server session: {e}")
            return None

    def generate_message_id(self) -> str:
        """Generate message ID: msg_ + 26 alphanumeric characters"""
        import secrets
        import string

        alphabet = string.ascii_letters + string.digits
        random_part = "".join(secrets.choice(alphabet) for _ in range(26))
        message_id = f"msg_{random_part}"
        logger.info(f"[OpenCode] Generated message ID: {message_id}")
        return message_id

    async def send_prompt_to_opencode(
        self, project: Project, server_session_id: str, prompt_content: str
    ) -> Optional[str]:
        """
        发送提示词到OpenCode服务器 - 使用新的prompt_async API，返回message_id
        """
        logger.info(f"[OpenCode] ========================================")
        logger.info(f"[OpenCode] STARTING SEND PROMPT (ASYNC)")
        logger.info(f"[OpenCode] ========================================")
        logger.info(f"[OpenCode] Using server_session_id: {server_session_id}")

        try:
            url = self.get_opencode_server_url(project)
            prompt_async_url = f"{url}/session/{server_session_id}/prompt_async"

            # Generate message ID
            message_id = self.generate_message_id()

            request_data = {
                "messageID": message_id,
                "parts": [{"type": "text", "text": prompt_content}],
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(prompt_async_url, json=request_data)

                if response.status_code in [200, 202, 204]:
                    logger.info(f"[OpenCode] Prompt sent successfully.")
                    return message_id
                else:
                    logger.info(f"[OpenCode] Failed to send prompt: {response.status_code}")
                    return None

        except Exception as e:
            logger.info(f"[OpenCode] Failed to send prompt to OpenCode: {e}")
            return None

    async def get_prompt_content(
        self,
        prompt_template_id: Optional[str],
        prompt_content: Optional[str],
        variables: Optional[Dict[str, str]] = None,
    ) -> str:
        """
        获取处理后的提示词内容
        """
        content = prompt_content or ""

        if prompt_template_id:
            result = await self.db.execute(
                select(PromptTemplate).where(PromptTemplate.id == prompt_template_id)
            )
            template = result.scalar_one_or_none()
            if template:
                content = template.content_zh or template.content_en or content

        if variables:
            for key, value in variables.items():
                content = content.replace(f"{{{key}}}", str(value))

        return content

    async def create_opencode_session(
        self,
        project_id: str,
        current_user: User,
        prompt_template_id: Optional[str] = None,
        prompt_content: Optional[str] = None,
    ) -> OpenCodeSession:
        """
        创建OpenCode会话
        """
        logger.info(f"[OpenCode] Creating OpenCode session for project {project_id}")

        session = OpenCodeSession(
            project_id=project_id,
            status=OpenCodeSessionStatus.PENDING,
            prompt_template_id=prompt_template_id,
            prompt_content=prompt_content or "",
            created_by=current_user.id,
        )

        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)

        logger.info(f"[OpenCode] OpenCode db_session_id created: {session.id}")
        return session

    async def create_full_opencode_session(
        self,
        project_id: str,
        project: Project,
        current_user: User,
        prompt_template_id: Optional[str] = None,
        prompt_content: Optional[str] = None,
        agent_package=None,
    ) -> tuple[OpenCodeSession, OpenCodeServerStatus]:
        """
        创建完整的OpenCode会话（包含启动server、等待RUNNING、创建服务器会话和数据库记录）

        Args:
            project_id: 项目ID
            project: Project对象（用于调用opencode server API）
            current_user: 当前用户
            prompt_template_id: 提示词模板ID（可选）
            prompt_content: 提示词内容（可选）

        Returns:
            tuple: (OpenCodeSession对象, final_server_status)
        """
        logger.info(f"[OpenCode] Creating full OpenCode session for project {project_id}")

        # 1. 先创建数据库记录（用于获取 session.id 来启动 server）
        session = OpenCodeSession(
            project_id=project_id,
            status=OpenCodeSessionStatus.PENDING,
            prompt_template_id=prompt_template_id,
            prompt_content=prompt_content or "",
            created_by=current_user.id,
        )

        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)

        # 2. 检查并启动 opencode server（如果需要）
        server_status = await self.check_opencode_server_status(project)

        if (
            server_status == OpenCodeServerStatus.STOPPED
            or server_status == OpenCodeServerStatus.ERROR
        ):
            server_status = await self.start_opencode_server(
                project,
                current_user.id,
                opencode_session_id=session.id,
                agent_package=agent_package,
            )

        if server_status == OpenCodeServerStatus.ERROR:
            raise RuntimeError("Failed to start OpenCode server")

        # 3. 如果 server 是 STARTING，等待它变成 RUNNING
        if server_status == OpenCodeServerStatus.STARTING:
            logger.info(f"[OpenCode] Server is STARTING, waiting for RUNNING...")
            max_wait_seconds = 30
            poll_interval = 1

            for wait_count in range(max_wait_seconds):
                await asyncio.sleep(poll_interval)
                server_status = await self.check_opencode_server_status(project)

                if server_status == OpenCodeServerStatus.RUNNING:
                    logger.info(f"[OpenCode] Server is now RUNNING after {wait_count + 1} seconds")
                    break
                elif server_status == OpenCodeServerStatus.ERROR:
                    raise RuntimeError("Server entered ERROR state while starting")

            if server_status != OpenCodeServerStatus.RUNNING:
                raise RuntimeError(f"Server failed to start within {max_wait_seconds} seconds")

        # 4. 创建 OpenCode 服务器会话（此时 server 应该是 RUNNING）
        server_session_id = await self.create_opencode_server_session(project)

        if not server_session_id:
            logger.info(f"[OpenCode] Error: Failed to create server session")
            raise RuntimeError("Failed to create OpenCode server session")

        # 5. 更新数据库，保存 server_session_id和active_session_id
        session.opencode_server_session_id = server_session_id
        session.status = OpenCodeSessionStatus.ACTIVE
        project.opencode_active_session_id = session.id

        await self.db.commit()
        await self.db.refresh(session)

        logger.info(f"[OpenCode] Full session created, server_session_id: {server_session_id}")
        return session, server_status

    async def _check_running_tasks(
        self,
        opencode_session_id: str,
    ) -> Optional[OpenCodeAuditTask]:
        """
        检查指定的 OpenCodeSession 是否有正在运行或待处理的审计任务

        Args:
            opencode_session_id: OpenCodeSession 的 ID

        Returns:
            如果有运行中的任务，返回该任务；否则返回 None
        """
        from app.models.opencode.opencode_audit_task import (
            OpenCodeAuditTask,
            OpenCodeAuditTaskStatus,
        )

        result = await self.db.execute(
            select(OpenCodeAuditTask)
            .where(OpenCodeAuditTask.opencode_session_id == opencode_session_id)
            .where(
                OpenCodeAuditTask.status.in_(
                    [OpenCodeAuditTaskStatus.PENDING, OpenCodeAuditTaskStatus.RUNNING]
                )
            )
            .order_by(OpenCodeAuditTask.created_at.desc())
        )
        return result.scalars().first()

    async def _collect_project_info(self, project_id: str) -> Dict[str, Any]:
        """
        收集项目信息（文件数、代码行数等）

        Args:
            project_id: 项目ID

        Returns:
            包含 file_count 和 total_lines 的字典
        """
        file_count = 0
        total_lines = 0

        try:
            result = await self.db.execute(select(Project).where(Project.id == project_id))
            project = result.scalar_one_or_none()

            if not project:
                return {"file_count": 0, "total_lines": 0}

            if project.source_type == "zip":
                from app.services.project.zip_storage import load_project_zip

                zip_path = await load_project_zip(project_id)
                if zip_path and os.path.exists(zip_path):
                    try:
                        with zipfile.ZipFile(zip_path, "r") as zip_ref:
                            for file_info in zip_ref.infolist():
                                if not file_info.is_dir():
                                    name = file_info.filename
                                    if not self._should_exclude_file(name):
                                        file_count += 1
                                        try:
                                            content = zip_ref.read(name)
                                            try:
                                                text_content = content.decode(
                                                    "utf-8", errors="ignore"
                                                )
                                                total_lines += len(text_content.splitlines())
                                            except Exception:
                                                pass
                                        except Exception:
                                            pass
                    except Exception as e:
                        logger.warning(f"[OpenCode] Error reading zip file for stats: {e}")

            # 对于 repository 类型，暂时返回 0（需要更复杂的实现）
            # TODO: 实现 repository 类型的文件统计

        except Exception as e:
            logger.warning(f"[OpenCode] Error collecting project info: {e}")

        return {"file_count": file_count, "total_lines": total_lines}

    def _should_exclude_file(self, filename: str) -> bool:
        """
        判断文件是否应该被排除

        Args:
            filename: 文件名

        Returns:
            是否应该排除
        """
        exclude_patterns = [
            "node_modules",
            "__pycache__",
            ".git",
            ".DS_Store",
            "*.min.js",
            "*.min.css",
            "*.log",
            "*.tmp",
            "*.temp",
        ]

        for pattern in exclude_patterns:
            if pattern.startswith("*."):
                ext = pattern[1:]
                if filename.lower().endswith(ext):
                    return True
            else:
                if pattern in filename:
                    return True

        return False

    async def create_opencode_audit_task(
        self,
        project_id: str,
        prompt_template_id: Optional[str],
        prompt_content: Optional[str],
        current_user: User,
        db_session_id: Optional[str] = None,
        is_just_start_server: bool = False,
    ) -> OpenCodeAuditTask:
        """
        创建OpenCode审计任务
        """
        logger.info(f"[OpenCode] Creating OpenCode audit task for project {project_id}")

        # 如果有关联的 session，检查是否已有运行中的任务
        if db_session_id and not is_just_start_server:
            running_task = await self._check_running_tasks(db_session_id)
            if running_task:
                raise ValueError(
                    f"该会话已有运行中的审计任务。"
                    f"任务ID: {running_task.id}, 状态: {running_task.status}"
                )

        # 获取提示词模板名称
        if is_just_start_server:
            task_name = "OpenCode Server 启动"
            task_description = "仅启动 OpenCode 服务器，不执行审计"
        else:
            task_name = "OpenCode 审计任务"
            task_description = "使用 OpenCode 进行代码审计"

            if prompt_template_id:
                result = await self.db.execute(
                    select(PromptTemplate).where(PromptTemplate.id == prompt_template_id)
                )
                template = result.scalar_one_or_none()
                if template:
                    task_name = f"OpenCode: {template.name}"
                    task_description = template.description or task_description

        # 收集项目统计信息
        project_info = {"file_count": 0, "total_lines": 0}
        if not is_just_start_server:
            project_info = await self._collect_project_info(project_id)

        audit_task = OpenCodeAuditTask(
            project_id=project_id,
            created_by=current_user.id,
            name=task_name,
            description=task_description,
            task_type="opencode_serve" if is_just_start_server else "opencode_audit",
            opencode_session_id=db_session_id,
            opencode_prompt_template_id=prompt_template_id,
            prompt_content=prompt_content,
            status=OpenCodeAuditTaskStatus.RUNNING
            if not is_just_start_server
            else OpenCodeAuditTaskStatus.COMPLETED,
            current_step="Starting OpenCode server"
            if is_just_start_server
            else "Initializing audit",
            started_at=datetime.now(timezone.utc),
            completed_at=datetime.now(timezone.utc) if is_just_start_server else None,
            total_files=project_info.get("file_count", 0),
            total_lines=project_info.get("total_lines", 0),
        )

        self.db.add(audit_task)
        await self.db.commit()
        await self.db.refresh(audit_task)

        logger.info(f"[OpenCode] OpenCode audit task created: {audit_task.id}")
        return audit_task

    async def start_audit_with_prompt(
        self,
        project_id: str,
        prompt_template_id: Optional[str],
        prompt_content: Optional[str],
        variables: Optional[Dict[str, str]],
        current_user: User,
        agent_package=None,
    ) -> tuple[OpenCodeSession, OpenCodeServerStatus, Any]:
        """
        启动带提示词的OpenCode审计
        """
        logger.info(f"[OpenCode] ========================================")
        logger.info(f"[OpenCode] STARTING AUDIT WITH PROMPT")
        logger.info(f"[OpenCode] ========================================")
        logger.info(f"[OpenCode] Starting audit with prompt for project {project_id}")

        result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()

        if not project:
            raise ValueError("Project not found")

        final_prompt_content = await self.get_prompt_content(
            prompt_template_id, prompt_content, variables
        )

        logger.info(f"[OpenCode] final prompt: {final_prompt_content}")

        # 检查是否有活跃的 OpenCodeSession
        db_session = await self.get_active_session(project)
        server_session_id = None
        server_status = OpenCodeServerStatus.RUNNING

        if db_session:
            # 复用现有 session
            logger.info(f"[OpenCode] Reusing existing active session: {db_session.id}")
            server_session_id = db_session.opencode_server_session_id
            # 检查 server 状态
            server_status = await self.check_opencode_server_status(project)
        else:
            # 创建新的完整 OpenCodeSession（包含 server session）
            db_session, server_status = await self.create_full_opencode_session(
                project_id,
                project,
                current_user,
                prompt_template_id,
                final_prompt_content,
                agent_package,
            )
            server_session_id = db_session.opencode_server_session_id

        # 创建审计任务（总是创建新的 audit task）
        audit_task = await self.create_opencode_audit_task(
            project_id,
            prompt_template_id,
            final_prompt_content,
            current_user,
            db_session_id=db_session.id,
        )

        # 保存用户发送的 prompt 到 OpenCodeMessageContent
        from app.models.opencode.opencode_message_content import (
            OpenCodeMessageContent,
            OpenCodeMessageContentType,
        )

        logger.info(f"[OpenCode] Saving user prompt to database...")
        logger.info(f"[OpenCode]   - session_id: {db_session.id}")
        logger.info(f"[OpenCode]   - audit_task_id: {audit_task.id}")
        logger.info(f"[OpenCode]   - prompt length: {len(final_prompt_content)} chars")

        user_prompt = OpenCodeMessageContent(
            session_id=db_session.id,
            message_index=0,
            content_type=OpenCodeMessageContentType.USER_PROMPT,
            text_content=final_prompt_content,
            audit_task_id=audit_task.id,
        )
        self.db.add(user_prompt)
        await self.db.commit()
        logger.info(f"[OpenCode] User prompt saved successfully! Message ID: {user_prompt.id}")

        message_id = None

        if server_session_id:
            message_id = await self.send_prompt_to_opencode(
                project, server_session_id, final_prompt_content
            )

            if message_id:
                logger.info(f"[OpenCode] Got message_id: {message_id}, starting background poll...")
                # 保存 message_id 到 audit_task
                audit_task.opencode_message_id = message_id
                await self.db.commit()
                await asyncio.sleep(3)
                asyncio.create_task(
                    self._background_poll_result(
                        project_id,
                        db_session.id,
                        audit_task.id,
                        server_session_id,
                        message_id,
                        current_user.id,
                    )
                )
            else:
                logger.info(f"[OpenCode] Failed to get message_id, skipping background poll")
                # 更新任务状态为失败
                audit_task.status = OpenCodeAuditTaskStatus.FAILED
                audit_task.error_message = "Failed to send prompt to OpenCode server"
                audit_task.completed_at = datetime.now(timezone.utc)
                await self.db.commit()
        else:
            logger.info(f"[OpenCode] Failed to get server_session_id, skipping prompt sending")
            # 更新任务状态为失败
            audit_task.status = OpenCodeAuditTaskStatus.FAILED
            audit_task.error_message = "Failed to create OpenCode server session"
            audit_task.completed_at = datetime.now(timezone.utc)
            await self.db.commit()

        db_session.status = OpenCodeSessionStatus.ACTIVE
        db_session.started_at = datetime.now(timezone.utc)
        db_session.opencode_server_session_id = server_session_id
        await self.db.commit()
        await self.db.refresh(db_session)

        project.opencode_current_session_id = db_session.id
        await self.db.commit()

        logger.info(
            f"[OpenCode] Audit started successfully, session ID: {db_session.id}, task ID: {audit_task.id}"
        )
        return db_session, server_status, audit_task

    async def poll_opencode_result_with_updates(
        self,
        project: Project,
        server_session_id: str,
        message_id: Optional[str],
        db_session_id: str,
        audit_task_id: Optional[str],
    ) -> bool:
        """
        轮询OpenCode服务器获取结果
        """
        logger.info(f"[OpenCode] Polling OpenCode Server for result (with updates)...")
        logger.info(f"[OpenCode] Polling for session: {server_session_id}")
        logger.info(f"[OpenCode] Polling for message_id: {message_id}")

        max_polls = 216000  # 60 hour with 1s interval
        poll_interval = 1
        record_index = 1
        same_time = 1

        if not message_id:
            logger.info(f"[OpenCode] No message_id provided, cannot poll")
            return False

        url = self.get_opencode_server_url(project)
        message_url = f"{url}/session/{server_session_id}/message"

        async def save_part_to_database(
            msg_index: int,
            part: Part,
            db_session_id: str,
            audit_task_id: Optional[str],
            opencode_message_id: Optional[str],
            role: str = "assistant",
        ) -> None:
            """保存单个 Part 到数据库"""
            async with AsyncSessionLocal() as db_session_local:
                try:
                    # 类型映射
                    content_type_map = {
                        PartType.TEXT: OpenCodeMessageContentType.RESPONSE,
                        PartType.REASONING: OpenCodeMessageContentType.REASONING,
                        PartType.TOOL: OpenCodeMessageContentType.TOOL,
                        PartType.STEP_START: OpenCodeMessageContentType.STEP_START,
                        PartType.STEP_FINISH: OpenCodeMessageContentType.STEP_FINISH,
                    }

                    # 用户消息特殊处理
                    if role == "user" and part.type == PartType.TEXT:
                        content_type = OpenCodeMessageContentType.USER_PROMPT
                    else:
                        content_type = content_type_map.get(part.type)

                    if not content_type:
                        logger.warning(f"[OpenCode] Unknown part type: {part.type}, skipping")
                        return

                    # 生成 text_content
                    if isinstance(part, (TextPart, ReasoningPart)):
                        text_content = part.text
                    else:
                        text_content = json.dumps(part.dict(), ensure_ascii=False)

                    content_type_str = content_type.value

                    # 先检查是否已经存在相同的消息
                    existing_result = await db_session_local.execute(
                        select(OpenCodeMessageContent)
                        .where(OpenCodeMessageContent.session_id == db_session_id)
                        .where(OpenCodeMessageContent.message_index == msg_index)
                        .where(OpenCodeMessageContent.content_type == content_type_str)
                    )
                    existing_message = existing_result.scalar_one_or_none()

                    if existing_message:
                        logger.info(
                            f"[OpenCode] Message already exists (same session_id, index, content_type), skipping save"
                        )
                        return

                    # 保存新消息
                    message_content = OpenCodeMessageContent(
                        session_id=db_session_id,
                        message_index=msg_index,
                        content_type=content_type_str,
                        text_content=text_content,
                        opencode_message_id=opencode_message_id,
                        audit_task_id=audit_task_id,
                    )
                    db_session_local.add(message_content)
                    await db_session_local.commit()
                    logger.info(f"[OpenCode] Message saved successfully! Type: {content_type_str}")
                except Exception as e:
                    logger.error(f"[OpenCode] Failed to save part: {e}")
                    await db_session_local.rollback()

        for poll_count in range(max_polls):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(message_url)

                    if response.status_code == 200:
                        data: list = response.json()

                        # 当处理完成的次数与总数相同10次时，认为处理ok
                        if record_index == len(data):
                            same_time += 1
                        if same_time == 10:
                            return True

                        # 使用解析器解析消息
                        messages = OpenCodeMessageParser.parse_message_array(data)

                        for msg in messages[record_index:]:
                            # 处理每个 part
                            for part in msg.parts:
                                await save_part_to_database(
                                    msg_index=record_index,
                                    part=part,
                                    db_session_id=db_session_id,
                                    audit_task_id=audit_task_id,
                                    opencode_message_id=message_id,
                                    role=msg.info.role,
                                )

                            # 检测完成标记
                            if msg.info.finish is not None:
                                record_index += 1

                                # 检查是否有完成的响应
                                has_text = any(isinstance(p, TextPart) for p in msg.parts)
                                has_reasoning = any(isinstance(p, ReasoningPart) for p in msg.parts)
                                if has_text and has_reasoning:
                                    return True

                await asyncio.sleep(poll_interval)

            except Exception as e:
                logger.info(f"[OpenCode] Poll attempt {poll_count + 1} failed: {e}")
                await asyncio.sleep(poll_interval)

        logger.info(f"[OpenCode] Polling timed out after {max_polls} attempts")
        return False

    async def _background_poll_result(
        self,
        project_id: str,
        db_session_id: str,
        audit_task_id: str,
        server_session_id: str,
        message_id: Optional[str],
        user_id: str,
    ):
        """
        后台轮询结果任务 - 使用独立的数据库会话
        """
        logger.info(f"[OpenCode] Starting background poll for session {db_session_id}")
        logger.info(f"[OpenCode] Background poll - audit_task_id: {audit_task_id}")
        logger.info(f"[OpenCode] Background poll - server_session_id: {server_session_id}")
        logger.info(f"[OpenCode] Background poll - message_id: {message_id}")

        try:
            async with AsyncSessionLocal() as db_session_local:
                result_project = await db_session_local.execute(
                    select(Project).where(Project.id == project_id)
                )
                project = result_project.scalar_one_or_none()

            # 设置当前会话ID，用于交互记录
            self.set_current_session_id(db_session_id)

            sign = await self.poll_opencode_result_with_updates(
                project, server_session_id, message_id, db_session_id, audit_task_id
            )
            logger.info(f"[OpenCode] sign: {sign}")

            async with AsyncSessionLocal() as db_session_local:
                result_db = await db_session_local.execute(
                    select(OpenCodeSession).where(OpenCodeSession.id == db_session_id)
                )
                db_session = result_db.scalar_one_or_none()
                logger.info(f"[OpenCode] db_session: {db_session}")

                # 获取审计任务
                result_task = await db_session_local.execute(
                    select(OpenCodeAuditTask).where(OpenCodeAuditTask.id == audit_task_id)
                )
                audit_task = result_task.scalar_one_or_none()
                logger.info(f"[OpenCode] audit_task: {audit_task}")

                if db_session:
                    if not sign:
                        db_session.status = OpenCodeSessionStatus.ERROR
                        db_session.response_content += "\nLLM Server response timeout. Please try again or check the server status."

                        db_session.completed_at = datetime.now(timezone.utc)
                        await db_session_local.commit()

                    # 更新审计任务状态
                    if audit_task:
                        if sign:
                            audit_task.status = OpenCodeAuditTaskStatus.COMPLETED
                            audit_task.current_step = "Audit completed"
                            # 确保完成时 processed_files = total_files
                            if audit_task.total_files > 0:
                                audit_task.processed_files = audit_task.total_files

                            # 自动尝试导入漏洞报告
                            try:
                                await self.auto_import_vulnerabilities(
                                    db_session_local,
                                    audit_task.id,
                                    project_id,
                                )
                                logger.info(
                                    f"[OpenCode] Auto import completed for task {audit_task.id}"
                                )
                            except Exception as e:
                                logger.info(f"[OpenCode] Auto import error: {e}")
                        else:
                            audit_task.status = OpenCodeAuditTaskStatus.FAILED
                            audit_task.error_message = "LLM Server response timeout"
                            audit_task.current_step = "Failed"

                        audit_task.completed_at = datetime.now(timezone.utc)
                        await db_session_local.commit()

                    logger.info(
                        f"[OpenCode] Background poll completed with status: {db_session.status}"
                    )

                    # 通知 SSE 流停止，避免继续轮询数据库
                    try:
                        from app.api.v1.endpoints.opencode.sessions import stop_session_stream

                        stop_session_stream(db_session_id)
                        logger.info(
                            f"[OpenCode] Notified SSE stream to stop for session {db_session_id}"
                        )
                    except Exception as e:
                        logger.warning(f"[OpenCode] Failed to stop SSE stream: {e}")
        except Exception as e:
            logger.info(f"[OpenCode] Background poll failed: {e}")

            try:
                async with AsyncSessionLocal() as db_session_local:
                    result_db = await db_session_local.execute(
                        select(OpenCodeSession).where(OpenCodeSession.id == db_session_id)
                    )
                    db_session = result_db.scalar_one_or_none()
                    if db_session:
                        db_session.status = OpenCodeSessionStatus.ERROR
                        db_session.response_content += f"\nError: {str(e)}"
                        await db_session_local.commit()

                    # 更新审计任务状态为失败
                    result_task = await db_session_local.execute(
                        select(OpenCodeAuditTask).where(OpenCodeAuditTask.id == audit_task_id)
                    )
                    audit_task = result_task.scalar_one_or_none()
                    if audit_task:
                        audit_task.status = OpenCodeAuditTaskStatus.FAILED
                        audit_task.error_message = str(e)
                        audit_task.current_step = "Failed"
                        audit_task.completed_at = datetime.now(timezone.utc)
                        await db_session_local.commit()
            except Exception:
                pass
            finally:
                # 即使出错也要通知 SSE 流停止
                try:
                    from app.api.v1.endpoints.opencode.sessions import stop_session_stream

                    stop_session_stream(db_session_id)
                    logger.info(
                        f"[OpenCode] Notified SSE stream to stop on error for session {db_session_id}"
                    )
                except Exception:
                    pass

    async def get_session_status(
        self, session_id: str, current_user: User
    ) -> tuple[OpenCodeSession, OpenCodeServerStatus]:
        """
        获取会话状态
        """
        result = await self.db.execute(
            select(OpenCodeSession).where(OpenCodeSession.id == session_id)
        )
        session = result.scalar_one_or_none()

        if not session:
            raise ValueError("Session not found")

        result_project = await self.db.execute(
            select(Project).where(Project.id == session.project_id)
        )
        project = result_project.scalar_one_or_none()

        if project and project.owner_id != current_user.id:
            raise ValueError("Not authorized")

        server_status = OpenCodeServerStatus.RUNNING
        if project:
            server_status = await self.check_opencode_server_status(project)

        return session, server_status

    async def get_available_prompts(
        self, project_id: str, current_user: User
    ) -> tuple[list[PromptTemplate], int]:
        """
        获取项目可用的提示词列表
        """
        result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()

        if not project:
            raise ValueError("Project not found")

        if project.owner_id != current_user.id:
            raise ValueError("Not authorized")

        query = (
            select(PromptTemplate)
            .where(
                (PromptTemplate.is_system == True) | (PromptTemplate.created_by == current_user.id)
            )
            .where(PromptTemplate.is_active == True)
        )

        count_query = (
            select(PromptTemplate)
            .where(
                (PromptTemplate.is_system == True) | (PromptTemplate.created_by == current_user.id)
            )
            .where(PromptTemplate.is_active == True)
        )

        from sqlalchemy import func

        total_result = await self.db.execute(
            select(func.count()).select_from(count_query.subquery())
        )
        total = total_result.scalar() or 0

        query = query.order_by(
            PromptTemplate.is_system.desc(),
            PromptTemplate.is_default.desc(),
            PromptTemplate.created_at.desc(),
        )

        result = await self.db.execute(query)
        templates = result.scalars().all()

        return templates, total

    def _build_possible_report_paths(
        self,
        opencode_session_id: Optional[str],
        project_id: str,
        project_source_type: Optional[str] = None,
    ) -> List[Path]:
        """
        构建可能的报告路径列表（公共方法，供 auto_import_vulnerabilities 和报告下载使用）
        """
        from pathlib import Path

        possible_paths = []

        if opencode_session_id:
            possible_paths.extend(
                [
                    Path(f"/tmp/{opencode_session_id}") / "reports",
                    Path(f"C:/temp/{opencode_session_id}") / "reports",
                    Path(f"/tmp/{opencode_session_id}"),
                    Path(f"C:/temp/{opencode_session_id}"),
                ]
            )

        if project_source_type == "zip":
            from app.core.config import settings

            zip_path = Path(settings.ZIP_STORAGE_PATH) / f"{project_id}.zip"
            if zip_path.exists():
                possible_paths.extend(
                    [
                        Path(f"/tmp/opencode_project_{project_id}") / "reports",
                        Path(f"C:/temp/opencode_project_{project_id}") / "reports",
                    ]
                )
        elif project_source_type == "repository":
            possible_paths.extend(
                [
                    Path(f"/tmp/{project_id}") / "reports",
                    Path(f"C:/temp/{project_id}") / "reports",
                ]
            )

        if opencode_session_id:
            possible_paths.extend(
                [
                    Path(f"/tmp/opencode_{opencode_session_id}") / "reports",
                    Path(f"C:/temp/opencode_{opencode_session_id}") / "reports",
                ]
            )

        home_dir = Path.home()
        possible_paths.extend(
            [
                home_dir / "DeepAudit" / "reports",
                home_dir / "Documents" / "DeepAudit" / "reports",
                home_dir / "opencode" / "reports",
            ]
        )

        current_dir = Path.cwd()
        possible_paths.extend(
            [
                current_dir / "reports",
                current_dir / "docs" / "example",
            ]
        )

        possible_paths.extend(
            [
                Path("/tmp/opencode_project") / "reports",
                Path("/tmp/opencode_workspace") / "reports",
                Path("C:/temp/opencode_project") / "reports",
                Path("C:/temp/opencode_workspace") / "reports",
            ]
        )

        return possible_paths

    def find_report_files(
        self,
        opencode_session_id: Optional[str],
        project_id: str,
        project_source_type: Optional[str] = None,
        extension: str = ".json",
    ) -> List[Path]:
        """
        查找指定扩展名的报告文件（公共方法）
        返回按修改时间排序的文件列表（最新的在前）
        """
        from pathlib import Path

        possible_paths = self._build_possible_report_paths(
            opencode_session_id, project_id, project_source_type
        )

        logger.info(f"[OpenCode] ===== Find Report Files Debug Info =====")
        logger.info(f"[OpenCode] Checking {len(possible_paths)} paths for {extension} files:")
        for i, p in enumerate(possible_paths, 1):
            exists = "EXISTS" if p.exists() else "NOT EXISTS"
            logger.info(f"[OpenCode] {i}. {p} [{exists}]")
        logger.info(f"[OpenCode] ===== End of paths =====")

        report_files = []
        for reports_dir in possible_paths:
            if reports_dir.exists() and reports_dir.is_dir():
                logger.info(f"[OpenCode] Found directory: {reports_dir}")
                for file in reports_dir.rglob(f"*{extension}"):
                    report_files.append(file)
                    logger.info(f"[OpenCode] Found {extension} file: {file}")

        report_files.sort(key=lambda x: x.stat().st_mtime if x.exists() else 0, reverse=True)
        return report_files

    async def auto_import_vulnerabilities(
        self,
        db: AsyncSession,
        audit_task_id: str,
        project_id: str,
        report_data: Optional[Dict] = None,
    ) -> Dict[str, Any]:
        """自动导入审计报告中的漏洞

        Args:
            db: 数据库会话
            audit_task_id: 审计任务ID
            project_id: 项目ID
            report_data: 可选的报告数据，如果提供则直接使用，否则从文件系统查找

        Returns:
            导入结果统计字典
        """
        import traceback

        logger.info(f"[OpenCode] Auto importing vulnerabilities for task {audit_task_id}")
        result_stats = {
            "imported_count": 0,
            "total_in_report": 0,
            "findings_count": 0,
            "critical_count": 0,
            "high_count": 0,
            "medium_count": 0,
            "low_count": 0,
        }

        try:
            # 查找项目路径
            result_project = await db.execute(select(Project).where(Project.id == project_id))
            project = result_project.scalar_one_or_none()

            if not project:
                logger.info(f"[OpenCode] Project not found for auto import: {project_id}")
                return result_stats

            # 查找审计任务
            result_task = await db.execute(
                select(OpenCodeAuditTask).where(OpenCodeAuditTask.id == audit_task_id)
            )
            audit_task = result_task.scalar_one_or_none()

            if not audit_task:
                logger.info(f"[OpenCode] Audit task not found for auto import: {audit_task_id}")
                return result_stats

            # 如果提供了 report_data，直接使用；否则从文件系统查找
            report_data_list = []
            if report_data:
                report_data_list = [report_data]
                logger.info(f"[OpenCode] Using provided report_data directly")
            else:
                # 需要 opencode_session_id 来查找文件
                opencode_session_id = audit_task.opencode_session_id
                if not opencode_session_id:
                    logger.info(
                        f"[OpenCode] No opencode_session_id found for audit task: {audit_task_id}"
                    )
                    return result_stats

                # 打印调试信息
                logger.info(f"[OpenCode] Project ID: {project.id}")
                logger.info(f"[OpenCode] Project source_type: {project.source_type}")
                logger.info(f"[OpenCode] Task ID: {audit_task_id}")
                logger.info(f"[OpenCode] OpenCode Session ID: {opencode_session_id}")

                # 使用公共方法查找 JSON 报告文件
                report_files = self.find_report_files(
                    opencode_session_id=opencode_session_id,
                    project_id=project_id,
                    project_source_type=project.source_type,
                    extension=".json",
                )

                if report_files:
                    logger.info(f"[OpenCode] Found {len(report_files)} potential report files")
                    # 读取报告文件
                    for report_file in report_files[:3]:
                        try:
                            with open(report_file, "r", encoding="utf-8") as f:
                                report_data_list.append(json.load(f))
                        except Exception as e:
                            logger.info(f"[OpenCode] Failed to read report file {report_file}: {e}")
                            continue
                else:
                    logger.info(f"[OpenCode] No report files found for auto import")
                    return result_stats

            # 处理报告数据
            for current_report_data in report_data_list:
                if "vulnerabilities" not in current_report_data:
                    continue

                vulnerabilities = current_report_data["vulnerabilities"]
                result_stats["total_in_report"] = len(vulnerabilities)
                logger.info(f"[OpenCode] Found {len(vulnerabilities)} vulnerabilities in report")

                imported_count = 0
                for vuln_data in vulnerabilities:
                    try:
                        current_vuln_id = vuln_data.get("vuln_id", str(uuid.uuid4()))

                        # 检查是否已存在
                        result = await db.execute(
                            select(AuditVulnerability).where(
                                (AuditVulnerability.task_id == audit_task_id)
                                & (AuditVulnerability.vuln_id == current_vuln_id)
                            )
                        )
                        existing_vuln = result.scalar_one_or_none()

                        if existing_vuln:
                            logger.info(
                                f"[OpenCode] Vulnerability {current_vuln_id} already exists, skipping"
                            )
                            continue

                        vuln = AuditVulnerability(
                            id=str(uuid.uuid4()),
                            task_id=audit_task_id,
                            vuln_id=current_vuln_id,
                            severity=vuln_data.get("severity", "medium"),
                            cvss_score=vuln_data.get("cvss_score"),
                            cvss_vector=vuln_data.get("cvss_vector"),
                            cwe=vuln_data.get("cwe"),
                            confidence=vuln_data.get("confidence"),
                            location=vuln_data.get("location"),
                            file_path=vuln_data.get("file_path"),
                            line_start=vuln_data.get("line_start"),
                            line_end=vuln_data.get("line_end"),
                            vulnerability_title=vuln_data.get("vulnerability_title", "未知漏洞"),
                            vulnerability_essence=vuln_data.get("vulnerability_essence"),
                            root_cause=vuln_data.get("root_cause"),
                            security_impact=vuln_data.get("security_impact"),
                            vulnerable_code=vuln_data.get("vulnerable_code"),
                            dataflow=vuln_data.get("dataflow"),
                            exploit_steps=vuln_data.get("exploit_steps"),
                            exploit_poc=vuln_data.get("exploit_poc"),
                            impact_confidentiality=vuln_data.get("impact_confidentiality"),
                            impact_integrity=vuln_data.get("impact_integrity"),
                            impact_availability=vuln_data.get("impact_availability"),
                            fix_description=vuln_data.get("fix_description"),
                            fix_code_before=vuln_data.get("fix_code_before"),
                            fix_code_after=vuln_data.get("fix_code_after"),
                            manual_confirmation=vuln_data.get("manual_confirmation"),
                            manual_confirmation_status=vuln_data.get(
                                "manual_confirmation_status", "待确认"
                            ),
                            manual_confirmation_notes=vuln_data.get("manual_confirmation_notes"),
                            confirmed_by=vuln_data.get("confirmed_by"),
                            confirmed_at=vuln_data.get("confirmed_at"),
                            status=vuln_data.get("status", "new"),
                        )
                        db.add(vuln)
                        imported_count += 1
                    except Exception as e:
                        logger.info(f"[OpenCode] Failed to import vulnerability: {e}")
                        import traceback

                        traceback.print_exc()
                        # 回滚当前事务，避免影响后续导入
                        await db.rollback()
                        continue

                if imported_count > 0:
                    # 更新任务的漏洞统计
                    result_task = await db.execute(
                        select(OpenCodeAuditTask).where(OpenCodeAuditTask.id == audit_task_id)
                    )
                    task = result_task.scalar_one_or_none()
                    if task:
                        task.findings_count = imported_count
                        severity_summary = current_report_data.get("severity_summary", {})
                        task.critical_count = severity_summary.get(
                            "致命", 0
                        ) + severity_summary.get("critical", 0)
                        task.high_count = severity_summary.get("严重", 0) + severity_summary.get(
                            "high", 0
                        )
                        task.medium_count = severity_summary.get("一般", 0) + severity_summary.get(
                            "medium", 0
                        )
                        task.low_count = (
                            severity_summary.get("提示", 0)
                            + severity_summary.get("low", 0)
                            + severity_summary.get("info", 0)
                        )

                        # 收集漏洞列表用于计算分数
                        findings_list = []
                        for vuln_data in vulnerabilities:
                            findings_list.append({"severity": vuln_data.get("severity", "low")})

                        # 计算质量评分
                        score = _calculate_security_score(findings_list)
                        task.quality_score = score
                        task.security_score = score
                        await db.commit()

                        # 更新返回统计
                        result_stats["imported_count"] = imported_count
                        result_stats["findings_count"] = task.findings_count
                        result_stats["critical_count"] = task.critical_count
                        result_stats["high_count"] = task.high_count
                        result_stats["medium_count"] = task.medium_count
                        result_stats["low_count"] = task.low_count

                    logger.info(
                        f"[OpenCode] Successfully auto imported {imported_count} vulnerabilities"
                    )
                    break  # 成功导入一个报告后就停止

        except Exception as e:
            logger.info(f"[OpenCode] Auto import vulnerabilities failed: {e}")
            logger.info(f"[OpenCode] Error traceback: {traceback.format_exc()}")

        return result_stats

    def _is_valid_opencode_process(self, pid: int) -> bool:
        """
        验证PID是否是有效的OpenCode进程
        """
        try:
            if pid <= 1:
                logger.warning(f"[OpenCode] PID {pid} is a special PID, skipping")
                return False

            proc_path = Path(f"/proc/{pid}")
            if not proc_path.exists():
                logger.info(f"[OpenCode] PID {pid} does not exist in /proc")
                return False

            cmdline_path = proc_path / "cmdline"
            if cmdline_path.exists():
                try:
                    with open(cmdline_path, "r") as f:
                        cmdline = f.read()
                    if "opencode" in cmdline.lower():
                        logger.info(f"[OpenCode] PID {pid} verified as opencode process")
                        return True
                except Exception as e:
                    logger.warning(f"[OpenCode] Error reading cmdline for PID {pid}: {e}")

            comm_path = proc_path / "comm"
            if comm_path.exists():
                try:
                    with open(comm_path, "r") as f:
                        comm = f.read().strip()
                    if "opencode" in comm.lower():
                        logger.info(f"[OpenCode] PID {pid} verified as opencode process via comm")
                        return True
                except Exception as e:
                    logger.warning(f"[OpenCode] Error reading comm for PID {pid}: {e}")

            logger.warning(f"[OpenCode] PID {pid} is not a valid opencode process")
            return False
        except Exception as e:
            logger.warning(f"[OpenCode] Error validating PID {pid}: {e}")
            return False

    async def stop_opencode_server(self, project: Project) -> bool:
        """
        停止OpenCode服务器 - 安全版本
        """
        logger.info(f"[OpenCode] Stopping OpenCode server for project {project.id}")

        if not project.opencode_pid:
            logger.info(f"[OpenCode] No PID found, server is already stopped")
        else:
            try:
                import os
                import signal

                pid_int = int(project.opencode_pid)
                logger.info(f"[OpenCode] Attempting to stop PID {pid_int}")

                if self._is_valid_opencode_process(pid_int):
                    try:
                        pgid = None
                        try:
                            pgid = os.getpgid(pid_int)
                            logger.info(f"[OpenCode] Killing process group {pgid}")
                            os.killpg(pgid, signal.SIGTERM)
                        except (OSError, ProcessLookupError):
                            logger.info(
                                f"[OpenCode] Process group not available, killing PID {pid_int} directly"
                            )
                            os.kill(pid_int, signal.SIGTERM)

                        logger.info(f"[OpenCode] Sent SIGTERM to opencode process")
                        await asyncio.sleep(1.5)

                        try:
                            os.kill(pid_int, 0)
                            logger.info(f"[OpenCode] Process still running, sending SIGKILL")
                            try:
                                if pgid is not None:
                                    os.killpg(pgid, signal.SIGKILL)
                                else:
                                    os.kill(pid_int, signal.SIGKILL)
                            except Exception:
                                logger.info(
                                    f"[OpenCode] Error sending SIGKILL, but will continue with cleanup"
                                )
                        except OSError:
                            logger.info(f"[OpenCode] Process successfully stopped")
                    except OSError as e:
                        logger.info(f"[OpenCode] Process already stopped or error stopping: {e}")
                else:
                    logger.warning(
                        f"[OpenCode] PID {pid_int} is not a valid opencode process, skipping kill but will cleanup"
                    )

            except ValueError as e:
                logger.info(f"[OpenCode] Invalid PID format: {e}")
            except Exception as e:
                logger.info(f"[OpenCode] Error during process kill: {e}")
                logger.info(f"[OpenCode] Error traceback: {traceback.format_exc()}")

        logger.info(f"[OpenCode] Starting cleanup (always runs)")
        try:
            project.opencode_pid = None
            project.opencode_port = None
            project.opencode_log_path = None
            project.opencode_started_at = None
            project.opencode_current_session_id = None
            project.updated_at = datetime.now(timezone.utc)

            if project.opencode_active_session_id:
                session_id = project.opencode_active_session_id
                session_dir = (
                    Path(f"/tmp/{session_id}")
                    if sys.platform != "win32"
                    else Path(f"C:/temp/{session_id}")
                )
                if session_dir.exists():
                    try:
                        import shutil

                        shutil.rmtree(session_dir)
                        logger.info(f"[OpenCode] Cleaned up session directory: {session_dir}")
                    except Exception as e:
                        logger.warning(f"[OpenCode] Error cleaning session directory: {e}")

                from app.models.opencode.opencode_session import (
                    OpenCodeSession,
                    OpenCodeSessionStatus,
                )

                try:
                    result = await self.db.execute(
                        select(OpenCodeSession).where(OpenCodeSession.id == session_id)
                    )
                    session = result.scalar_one_or_none()
                    if session:
                        session.status = OpenCodeSessionStatus.CLOSED
                        session.completed_at = datetime.now(timezone.utc)
                except Exception as e:
                    logger.warning(f"[OpenCode] Error updating session status: {e}")

                project.opencode_active_session_id = None

            await self.db.commit()
            logger.info(f"[OpenCode] Cleanup completed successfully")
            return True
        except Exception as e:
            logger.error(f"[OpenCode] Error during cleanup: {e}")
            logger.error(f"[OpenCode] Error traceback: {traceback.format_exc()}")
            return False
