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
from typing import Optional, Dict, Any
from datetime import datetime
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.opencode_session import OpenCodeSession, OpenCodeSessionStatus
from app.models.opencode_interaction import OpenCodeInteraction, OpenCodeInteractionType
from app.models.prompt_template import PromptTemplate
from app.models.project import Project
from app.models.user import User
from app.schemas.opencode_session import OpenCodeServerStatus
from app.db.session import AsyncSessionLocal


def ensure_dir_exists(path: str):
    """确保目录存在"""
    os.makedirs(path, exist_ok=True)
    print(f"[OpenCode] Ensured directory exists: {path}")


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
        print(f"[OpenCode] Failed to log interaction to DB: {e}")
        await db.rollback()
        return None


def log_opencode_interaction(direction: str, endpoint: str, data: Any = None):
    """记录OpenCode Server交互日志"""
    timestamp = datetime.utcnow().isoformat()
    log_entry = {"timestamp": timestamp, "direction": direction, "endpoint": endpoint, "data": data}
    print(
        f"[OpenCode] {direction.upper()} {endpoint}: {json.dumps(data, default=str) if data else 'None'}"
    )


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
        request_time = datetime.utcnow()

        try:
            log_opencode_interaction("request", endpoint, json_data)

            async with httpx.AsyncClient(timeout=timeout) as client:
                if method.upper() == "GET":
                    response = await client.get(url)
                elif method.upper() == "POST":
                    response = await client.post(url, json=json_data)
                else:
                    raise ValueError(f"Unsupported HTTP method: {method}")

            response_time = datetime.utcnow()
            duration_ms = int((response_time - request_time).total_seconds() * 1000)

            print(f"[OpenCode] Response status: {response.status_code}")
            print(f"[OpenCode] Response content: {response.text[:500]}")

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
            print(f"[OpenCode] Request exception: {e}")
            print(f"[OpenCode] Request traceback: {traceback.format_exc()}")

            log_opencode_interaction("error", endpoint, {"error": str(e)})

            response_time = datetime.utcnow()
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
            print(f"[OpenCode] Using OpenCode Server URL: {url}")
            return url
        url = "http://127.0.0.1:4096"
        print(f"[OpenCode] Using default OpenCode Server URL: {url}")
        return url

    async def check_opencode_server_health(
        self, project: Project, db_session_id: Optional[str] = None
    ) -> bool:
        """检查OpenCode Server健康状态"""
        print(f"[OpenCode] Checking OpenCode Server health...")
        request_time = datetime.utcnow()
        try:
            url = self.get_opencode_server_url(project)
            health_url = f"{url}/global/health"

            print(f"[OpenCode] Health check URL: {health_url}")
            log_opencode_interaction("request", "/global/health", None)

            async with httpx.AsyncClient(timeout=5.0) as client:
                response = await client.get(health_url)
                response_time = datetime.utcnow()
                duration_ms = int((response_time - request_time).total_seconds() * 1000)

                print(f"[OpenCode] Health check status code: {response.status_code}")
                print(f"[OpenCode] Health check response: {response.text}")

                if response.status_code == 200:
                    data = response.json()
                    log_opencode_interaction("response", "/global/health", data)

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
                    print(f"[OpenCode] Server healthy: {is_healthy}")
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
            print(f"[OpenCode] Health check exception: {e}")
            print(f"[OpenCode] Health check traceback: {traceback.format_exc()}")
            log_opencode_interaction("error", "/global/health", {"error": str(e)})

            if db_session_id:
                response_time = datetime.utcnow()
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
        print(f"[OpenCode] Checking server status for project {project.id}")
        print(f"[OpenCode] Current opencode_pid: {project.opencode_pid}")
        print(f"[OpenCode] Current opencode_port: {project.opencode_port}")

        if not project.opencode_pid:
            print(f"[OpenCode] No PID found, server is stopped")
            return OpenCodeServerStatus.STOPPED

        try:
            import os

            pid_int = int(project.opencode_pid)
            print(f"[OpenCode] Checking if PID {pid_int} is running...")

            if sys.platform == "win32":
                print(f"[OpenCode] Windows platform, skipping process check")
                is_healthy = await self.check_opencode_server_health(project)
                return OpenCodeServerStatus.RUNNING if is_healthy else OpenCodeServerStatus.ERROR

            os.kill(pid_int, 0)
            print(f"[OpenCode] PID {pid_int} is running")

            is_healthy = await self.check_opencode_server_health(project)
            if is_healthy:
                print(f"[OpenCode] PID {pid_int} is running and healthy")
                return OpenCodeServerStatus.RUNNING
            else:
                print(f"[OpenCode] PID {pid_int} is running but not responding")
                return OpenCodeServerStatus.ERROR

        except ValueError as e:
            print(f"[OpenCode] Invalid PID format: {e}")
            return OpenCodeServerStatus.ERROR
        except OSError as e:
            print(f"[OpenCode] PID {project.opencode_pid} is not running: {e}")
            return OpenCodeServerStatus.STOPPED
        except Exception as e:
            print(f"[OpenCode] Error checking server status: {e}")
            print(f"[OpenCode] Error traceback: {traceback.format_exc()}")
            return OpenCodeServerStatus.ERROR

    async def start_opencode_server(
        self, project: Project, current_user_id: str
    ) -> OpenCodeServerStatus:
        """
        启动OpenCode服务器 - 获取真实PID
        """
        print(f"[OpenCode] Starting OpenCode server for project {project.id}")
        print(f"[OpenCode] Project source type: {project.source_type}")
        print(f"[OpenCode] Platform: {sys.platform}")

        try:
            task_id = str(uuid.uuid4())
            print(f"[OpenCode] Generated task ID: {task_id}")

            project_path = None
            extract_dir = (
                Path(f"/tmp/{task_id}") if sys.platform != "win32" else Path(f"C:/temp/{task_id}")
            )
            print(f"[OpenCode] Extract directory: {extract_dir}")
            extract_dir.mkdir(parents=True, exist_ok=True)

            if project.source_type == "repository":
                repo_url = project.repository_url
                branch = project.default_branch or "main"
                print(f"[OpenCode] Repository URL: {repo_url}, branch: {branch}")
                if repo_url:
                    print(f"[OpenCode] Cloning repository (using subprocess directly)...")
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
                        print(f"[OpenCode] Clone return code: {clone_process.returncode}")
                        if clone_process.returncode == 0:
                            project_path = str(extract_dir)
                            print(f"[OpenCode] Successfully cloned to: {project_path}")
                        else:
                            print(
                                f"[OpenCode] Clone failed: {clone_stderr.decode() if clone_stderr else 'Unknown error'}"
                            )
                    except subprocess.TimeoutExpired:
                        print(f"[OpenCode] Clone timed out")
                        clone_process.kill()

            elif project.source_type == "zip":
                print(f"[OpenCode] Handling ZIP source type")
                try:
                    from app.core.config import settings

                    zip_file_path = Path(settings.ZIP_STORAGE_PATH) / f"{project.id}.zip"
                    print(f"[OpenCode] ZIP file path: {zip_file_path}")
                    if zip_file_path.exists():
                        print(f"[OpenCode] ZIP file exists, extracting...")
                        import zipfile

                        with zipfile.ZipFile(zip_file_path, "r") as zip_ref:
                            zip_ref.extractall(extract_dir)
                        project_path = str(extract_dir)
                        print(f"[OpenCode] Successfully extracted ZIP to: {project_path}")
                    else:
                        print(f"[OpenCode] ZIP file does not exist: {zip_file_path}")
                except Exception as e:
                    print(f"[OpenCode] Error handling ZIP: {e}")
                    print(f"[OpenCode] Error traceback: {traceback.format_exc()}")

            if not project_path:
                print(f"[OpenCode] No project path found, using temporary directory")
                project_path = (
                    f"/tmp/opencode_project_{project.id}"
                    if sys.platform != "win32"
                    else f"C:/temp/opencode_project_{project.id}"
                )
                ensure_dir_exists(project_path)

            print(f"[OpenCode] Final project path: {project_path}")

            log_dir = f"/tmp/opencode_logs" if sys.platform != "win32" else "C:/temp/opencode_logs"
            ensure_dir_exists(log_dir)

            random_id = str(uuid.uuid4())[:8]
            log_path = os.path.join(log_dir, f"{random_id}.log")
            print(f"[OpenCode] Log path: {log_path}")

            print(f"[OpenCode] Preparing to start opencode serve...")

            original_cwd = os.getcwd()
            print(f"[OpenCode] Original working directory: {original_cwd}")

            print(f"[OpenCode] Changing to project directory: {project_path}")
            os.chdir(project_path)

            print(f"[OpenCode] Starting opencode serve with subprocess.Popen...")

            log_file = open(log_path, "w")

            popen_kwargs = {
                "stdout": log_file,
                "stderr": subprocess.STDOUT,
            }

            if sys.platform != "win32" and hasattr(os, "setsid"):
                popen_kwargs["preexec_fn"] = os.setsid

            process = subprocess.Popen(["opencode", "serve"], **popen_kwargs)

            pid = process.pid
            print(f"[OpenCode] Started opencode serve with PID: {pid}")

            os.chdir(original_cwd)
            print(f"[OpenCode] Restored original working directory: {original_cwd}")

            print(f"[OpenCode] Waiting for server to start...")
            await asyncio.sleep(3)

            print(f"[OpenCode] Reading log file to find port...")
            port = None
            max_attempts = 20
            for attempt in range(max_attempts):
                if os.path.exists(log_path):
                    try:
                        with open(log_path, "r") as f:
                            log_content = f.read()
                            print(
                                f"[OpenCode] Log content (attempt {attempt + 1}): {log_content[:500]}"
                            )
                            port_match = re.search(r"http://127\.0\.0\.1:(\d+)", log_content)
                            if port_match:
                                port = port_match.group(1)
                                print(f"[OpenCode] Found port: {port}")
                                break
                    except Exception as e:
                        print(f"[OpenCode] Error reading log: {e}")
                else:
                    print(f"[OpenCode] Log file does not exist yet: {log_path}")
                await asyncio.sleep(1)

            if not port:
                print(f"[OpenCode] Could not find port in log file after {max_attempts} attempts")

            print(f"[OpenCode] Updating project with opencode info...")
            project.opencode_pid = str(pid)
            project.opencode_port = port
            project.opencode_log_path = log_path
            project.opencode_started_at = datetime.utcnow()
            await self.db.commit()

            print(f"[OpenCode] Successfully started opencode serve: PID={pid}, Port={port}")
            return OpenCodeServerStatus.RUNNING

        except Exception as e:
            print(f"[OpenCode] Failed to start OpenCode server: {e}")
            print(f"[OpenCode] Error traceback: {traceback.format_exc()}")
            return OpenCodeServerStatus.ERROR

    async def create_opencode_server_session(self, project: Project) -> Optional[str]:
        """
        在OpenCode服务器上创建会话 - 真实API调用
        """
        print(f"[OpenCode] ========================================")
        print(f"[OpenCode] STARTING CREATE OPENDCODE SESSION")
        print(f"[OpenCode] ========================================")

        try:
            url = self.get_opencode_server_url(project)
            session_url = f"{url}/session"

            print(f"[OpenCode] Session creation URL: {session_url}")

            request_data = {"title": "DeepAudit Audit Session"}
            log_opencode_interaction("request", "/session", request_data)

            print(f"[OpenCode] About to call POST {session_url}")

            async with httpx.AsyncClient(timeout=10.0) as client:
                response = await client.post(session_url, json=request_data)

                print(f"[OpenCode] Session creation status code: {response.status_code}")
                print(f"[OpenCode] Session creation response: {response.text}")

                if response.status_code == 200:
                    data = response.json()
                    server_session_id = data.get("id")

                    print(f"[OpenCode] Server returned session ID: {server_session_id}")

                    log_opencode_interaction("response", "/session", data)
                    print(f"[OpenCode] Created server session: {server_session_id}")
                    return server_session_id
                else:
                    log_opencode_interaction(
                        "error",
                        "/session",
                        {"status_code": response.status_code, "text": response.text},
                    )
                    print(f"[OpenCode] Failed to create session: {response.status_code}")
                    return None

        except Exception as e:
            print(f"[OpenCode] Failed to create OpenCode server session: {e}")
            print(f"[OpenCode] Failed to create session traceback: {traceback.format_exc()}")
            log_opencode_interaction("error", "/session", {"error": str(e)})
            return None

    def generate_message_id(self) -> str:
        """Generate message ID: msg_ + 26 alphanumeric characters"""
        import secrets
        import string

        alphabet = string.ascii_letters + string.digits
        random_part = "".join(secrets.choice(alphabet) for _ in range(26))
        message_id = f"msg_{random_part}"
        print(f"[OpenCode] Generated message ID: {message_id}")
        return message_id

    async def send_prompt_to_opencode(
        self, project: Project, server_session_id: str, prompt_content: str
    ) -> Optional[str]:
        """
        发送提示词到OpenCode服务器 - 使用新的prompt_async API，返回message_id
        """
        print(f"[OpenCode] ========================================")
        print(f"[OpenCode] STARTING SEND PROMPT (ASYNC)")
        print(f"[OpenCode] ========================================")
        print(f"[OpenCode] Using server_session_id: {server_session_id}")

        try:
            url = self.get_opencode_server_url(project)
            prompt_async_url = f"{url}/session/{server_session_id}/prompt_async"

            print(f"[OpenCode] Prompt async URL: {prompt_async_url}")

            # Generate message ID
            message_id = self.generate_message_id()

            request_data = {
                "messageID": message_id,
                "parts": [{"type": "text", "text": prompt_content}],
            }

            log_opencode_interaction(
                "request",
                f"/session/{server_session_id}/prompt_async",
                {"messageID": message_id, "parts": [{"type": "text", "text": "prompt..."}]},
            )

            print(f"[OpenCode] About to call POST {prompt_async_url}")

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(prompt_async_url, json=request_data)

                print(f"[OpenCode] Send prompt async status code: {response.status_code}")
                print(f"[OpenCode] Send prompt async response: {response.text}")

                if response.status_code in [200, 202, 204]:
                    log_opencode_interaction(
                        "response",
                        f"/session/{server_session_id}/prompt_async",
                        {"status": "accepted", "message_id": message_id},
                    )
                    print(f"[OpenCode] Prompt sent successfully, message_id: {message_id}")
                    return message_id
                else:
                    log_opencode_interaction(
                        "error",
                        f"/session/{server_session_id}/prompt_async",
                        {"status_code": response.status_code, "text": response.text},
                    )
                    print(f"[OpenCode] Failed to send prompt: {response.status_code}")
                    return None

        except Exception as e:
            print(f"[OpenCode] Failed to send prompt to OpenCode: {e}")
            print(f"[OpenCode] Failed to send prompt traceback: {traceback.format_exc()}")
            log_opencode_interaction(
                "error", f"/session/{server_session_id}/prompt_async", {"error": str(e)}
            )
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
        prompt_template_id: Optional[str],
        prompt_content: str,
        current_user: User,
    ) -> OpenCodeSession:
        """
        创建OpenCode会话
        """
        print(f"[OpenCode] Creating OpenCode session for project {project_id}")

        session = OpenCodeSession(
            project_id=project_id,
            status=OpenCodeSessionStatus.PENDING,
            prompt_template_id=prompt_template_id,
            prompt_content=prompt_content,
            created_by=current_user.id,
        )

        self.db.add(session)
        await self.db.commit()
        await self.db.refresh(session)

        print(f"[OpenCode] OpenCode session created: {session.id}")
        return session

    async def start_audit_with_prompt(
        self,
        project_id: str,
        prompt_template_id: Optional[str],
        prompt_content: Optional[str],
        variables: Optional[Dict[str, str]],
        current_user: User,
    ) -> tuple[OpenCodeSession, OpenCodeServerStatus]:
        """
        启动带提示词的OpenCode审计
        """
        print(f"[OpenCode] ========================================")
        print(f"[OpenCode] STARTING AUDIT WITH PROMPT")
        print(f"[OpenCode] ========================================")
        print(f"[OpenCode] Starting audit with prompt for project {project_id}")

        result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()

        if not project:
            raise ValueError("Project not found")

        server_status = await self.check_opencode_server_status(project)

        if server_status == OpenCodeServerStatus.STOPPED:
            print(f"[OpenCode] Server is stopped, starting it...")
            server_status = await self.start_opencode_server(project, current_user.id)

        if server_status == OpenCodeServerStatus.ERROR:
            raise RuntimeError("Failed to start OpenCode server")

        final_prompt_content = await self.get_prompt_content(
            prompt_template_id, prompt_content, variables
        )

        db_session = await self.create_opencode_session(
            project_id, prompt_template_id, final_prompt_content, current_user
        )

        print(f"[OpenCode] About to call create_opencode_server_session...")
        server_session_id = await self.create_opencode_server_session(project)
        message_id = None

        print(f"[OpenCode] create_opencode_server_session returned: {server_session_id}")

        if server_session_id:
            print(f"[OpenCode] Got server_session_id: {server_session_id}, now sending prompt...")
            message_id = await self.send_prompt_to_opencode(
                project, server_session_id, final_prompt_content
            )

            if message_id:
                print(f"[OpenCode] Got message_id: {message_id}, starting background poll...")
                await asyncio.sleep(3)
                asyncio.create_task(
                    self._background_poll_result(
                        project_id, db_session.id, server_session_id, message_id, current_user.id
                    )
                )
            else:
                print(f"[OpenCode] Failed to get message_id, skipping background poll")
        else:
            print(f"[OpenCode] Failed to get server_session_id, skipping prompt sending")

        db_session.status = OpenCodeSessionStatus.ACTIVE
        db_session.started_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(db_session)

        project.opencode_current_session_id = db_session.id
        await self.db.commit()

        print(f"[OpenCode] Audit started successfully, session ID: {db_session.id}")
        return db_session, server_status

    async def poll_opencode_result_with_updates(
        self,
        project: Project,
        server_session_id: str,
        message_id: Optional[str],
        db_session_id: str,
    ) -> str:
        """
        轮询OpenCode服务器获取结果 - 使用新的message API，检查reason=stop
        """
        print(f"[OpenCode] Polling OpenCode Server for result (with updates)...")
        print(f"[OpenCode] Polling for session: {server_session_id}")
        print(f"[OpenCode] Polling for message_id: {message_id}")

        max_polls = 180  # 3 minutes with 1s interval
        poll_interval = 1
        full_response = ""

        if not message_id:
            print(f"[OpenCode] No message_id provided, cannot poll")
            return "Error: No message ID provided"

        url = self.get_opencode_server_url(project)
        message_url = f"{url}/session/{server_session_id}/message"

        for poll_count in range(max_polls):
            try:
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(message_url)

                    if response.status_code == 200:
                        data = response.json()
                        data = data[-1]

                        # Extract parts
                        parts = data.get("parts", [])
                        if len(parts) == 0:
                            await asyncio.sleep(poll_interval)
                            continue

                        # Get the last part text
                        last_part = parts[-1]
                        text = last_part.get("text", "")
                        if text:
                            full_response = text

                        if parts[-1].get("reason") == "stop":
                            print(f"[OpenCode] Polling completed, returning full response")
                            return full_response

                await asyncio.sleep(poll_interval)

            except Exception as e:
                print(f"[OpenCode] Poll attempt {poll_count + 1} failed: {e}")
                print(f"[OpenCode] Poll attempt traceback: {traceback.format_exc()}")
                log_opencode_interaction(
                    "error",
                    f"/session/{server_session_id}/message",
                    {"error": str(e), "poll_count": poll_count + 1},
                )
                await asyncio.sleep(poll_interval)

        print(f"[OpenCode] Polling timed out after {max_polls} attempts")
        return "timeout"

    async def _background_poll_result(
        self,
        project_id: str,
        db_session_id: str,
        server_session_id: str,
        message_id: Optional[str],
        user_id: str,
    ):
        """
        后台轮询结果任务 - 使用独立的数据库会话
        """
        print(f"[OpenCode] Starting background poll for session {db_session_id}")
        print(f"[OpenCode] Background poll - server_session_id: {server_session_id}")
        print(f"[OpenCode] Background poll - message_id: {message_id}")

        try:
            async with AsyncSessionLocal() as db_session_local:
                result_project = await db_session_local.execute(
                    select(Project).where(Project.id == project_id)
                )
                project = result_project.scalar_one_or_none()

                # 设置当前会话ID，用于交互记录
                self.set_current_session_id(db_session_id)

                result = await self.poll_opencode_result_with_updates(
                    project, server_session_id, message_id, db_session_id
                )

                result_db = await db_session_local.execute(
                    select(OpenCodeSession).where(OpenCodeSession.id == db_session_id)
                )
                db_session = result_db.scalar_one_or_none()

                if db_session:
                    db_session.response_content = result

                    # 检查是否超时
                    if result == "timeout":
                        db_session.status = OpenCodeSessionStatus.ERROR
                        db_session.response_content = "OpenCode Server response timeout. Please try again or check the server status."
                    else:
                        db_session.status = OpenCodeSessionStatus.CLOSED

                    db_session.completed_at = datetime.utcnow()
                    await db_session_local.commit()

                    print(f"[OpenCode] Background poll completed with status: {db_session.status}")
        except Exception as e:
            print(f"[OpenCode] Background poll failed: {e}")
            print(f"[OpenCode] Background poll traceback: {traceback.format_exc()}")

            try:
                async with AsyncSessionLocal() as db_session_local:
                    result_db = await db_session_local.execute(
                        select(OpenCodeSession).where(OpenCodeSession.id == db_session_id)
                    )
                    db_session = result_db.scalar_one_or_none()
                    if db_session:
                        db_session.status = OpenCodeSessionStatus.ERROR
                        db_session.response_content = f"Error: {str(e)}"
                        await db_session_local.commit()
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
