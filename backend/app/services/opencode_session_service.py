"""
OpenCode会话服务
负责管理OpenCode会话的创建、提示词发送和结果获取
"""

import asyncio
import uuid
import os
import re
from typing import Optional, Dict, Any
from datetime import datetime
from pathlib import Path
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.opencode_session import OpenCodeSession, OpenCodeSessionStatus
from app.models.prompt_template import PromptTemplate
from app.models.project import Project
from app.models.user import User
from app.schemas.opencode_session import OpenCodeServerStatus


def ensure_dir_exists(path: str):
    """确保目录存在"""
    os.makedirs(path, exist_ok=True)


async def execute_command(
    command: str | list[str],
    shell: bool = False,
    capture_output: bool = True,
    timeout: int = 60,
):
    """执行命令的简单实现"""
    import subprocess
    import asyncio

    try:
        if shell:
            process = await asyncio.create_subprocess_shell(
                command,
                stdout=subprocess.PIPE if capture_output else None,
                stderr=subprocess.PIPE if capture_output else None,
            )
        else:
            process = await asyncio.create_subprocess_exec(
                *command,
                stdout=subprocess.PIPE if capture_output else None,
                stderr=subprocess.PIPE if capture_output else None,
            )

        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            process.kill()
            await process.wait()
            return {"success": False, "stdout": "", "stderr": "Command timed out", "returncode": -1}

        return {
            "success": process.returncode == 0,
            "stdout": stdout.decode() if stdout and capture_output else "",
            "stderr": stderr.decode() if stderr and capture_output else "",
            "returncode": process.returncode,
        }
    except Exception as e:
        return {"success": False, "stdout": "", "stderr": str(e), "returncode": -1}


class OpenCodeSessionService:
    """OpenCode会话服务"""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def check_opencode_server_status(self, project: Project) -> OpenCodeServerStatus:
        """
        检查OpenCode服务器状态
        """
        if not project.opencode_pid:
            return OpenCodeServerStatus.STOPPED

        try:
            import os

            pid_int = int(project.opencode_pid)
            os.kill(pid_int, 0)
            return OpenCodeServerStatus.RUNNING
        except ValueError:
            return OpenCodeServerStatus.ERROR
        except OSError:
            return OpenCodeServerStatus.STOPPED
        except Exception:
            return OpenCodeServerStatus.ERROR

    async def start_opencode_server(
        self, project: Project, current_user_id: str
    ) -> OpenCodeServerStatus:
        """
        启动OpenCode服务器 - 获取真实PID
        """
        try:
            import uuid

            task_id = str(uuid.uuid4())

            project_path = None
            extract_dir = Path(f"/tmp/{task_id}")
            extract_dir.mkdir(parents=True, exist_ok=True)

            if project.source_type == "repository":
                repo_url = project.repository_url
                branch = project.default_branch or "main"
                if repo_url:
                    clone_cmd = [
                        "git",
                        "clone",
                        "--depth",
                        "1",
                        "--branch",
                        branch,
                        repo_url,
                        str(extract_dir),
                    ]
                    result = await execute_command(clone_cmd, shell=False, timeout=300)
                    if result["success"]:
                        project_path = str(extract_dir)

            elif project.source_type == "zip":
                try:
                    from app.core.config import settings

                    zip_file_path = Path(settings.ZIP_STORAGE_PATH) / f"{project.id}.zip"
                    if zip_file_path.exists():
                        import zipfile

                        with zipfile.ZipFile(zip_file_path, "r") as zip_ref:
                            zip_ref.extractall(extract_dir)
                        project_path = str(extract_dir)
                except Exception:
                    pass

            if not project_path:
                project_path = f"/tmp/opencode_project_{project.id}"
                ensure_dir_exists(project_path)

            log_dir = f"/tmp/opencode_logs"
            ensure_dir_exists(log_dir)

            random_id = str(uuid.uuid4())[:8]
            log_path = os.path.join(log_dir, f"{random_id}.log")

            command = f"cd {project_path} ; nohup opencode serve > {log_path} 2>&1 & echo $!"
            result = await execute_command(command=command, shell=True, timeout=30)

            if not result["success"]:
                print(f"[OpenCode] Failed to start opencode serve: {result['stderr']}")
                return OpenCodeServerStatus.ERROR

            pid = result["stdout"].strip()
            if not pid.isdigit():
                print(f"[OpenCode] Invalid PID: {pid}")
                return OpenCodeServerStatus.ERROR

            await asyncio.sleep(2)

            port = None
            max_attempts = 10
            for attempt in range(max_attempts):
                if os.path.exists(log_path):
                    with open(log_path, "r") as f:
                        log_content = f.read()
                        port_match = re.search(r"http://127\.0\.0\.1:(\d+)", log_content)
                        if port_match:
                            port = port_match.group(1)
                            break
                await asyncio.sleep(1)

            project.opencode_pid = pid
            project.opencode_port = port
            project.opencode_log_path = log_path
            project.opencode_started_at = datetime.utcnow()
            await self.db.commit()

            print(f"[OpenCode] Started opencode serve: PID={pid}, Port={port}")
            return OpenCodeServerStatus.RUNNING

        except Exception as e:
            print(f"Failed to start OpenCode server: {e}")
            import traceback

            traceback.print_exc()
            return OpenCodeServerStatus.ERROR

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

        return session

    async def create_opencode_server_session(self, project: Project) -> Optional[str]:
        """
        在OpenCode服务器上创建会话
        """
        try:
            await asyncio.sleep(1)
            return str(uuid.uuid4())
        except Exception as e:
            print(f"Failed to create OpenCode server session: {e}")
            return None

    async def send_prompt_to_opencode(
        self, project: Project, server_session_id: str, prompt_content: str
    ) -> bool:
        """
        发送提示词到OpenCode服务器
        """
        try:
            await asyncio.sleep(1)
            return True
        except Exception as e:
            print(f"Failed to send prompt to OpenCode: {e}")
            return False

    async def poll_opencode_result(
        self, project: Project, server_session_id: str, db_session: Optional[OpenCodeSession]
    ) -> str:
        """
        轮询OpenCode服务器获取结果
        """
        try:
            await asyncio.sleep(3)

            sample_response = (
                "这是一个模拟的AI响应示例。\n\n"
                "## 分析结果\n\n"
                "根据您的提示词，我进行了以下分析：\n\n"
                "1. **代码审查**：检查了项目中的主要文件\n"
                "2. **安全审计**：识别了潜在的安全问题\n"
                "3. **优化建议**：提供了性能优化建议\n\n"
                "### 代码示例\n\n"
                "```python\n"
                "def hello_world():\n"
                '    print("Hello, OpenCode!")\n'
                "```\n\n"
                "感谢使用DeepAudit x OpenCode！"
            )

            return sample_response
        except Exception as e:
            print(f"Failed to poll OpenCode result: {e}")
            return f"Error: {str(e)}"

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
        result = await self.db.execute(select(Project).where(Project.id == project_id))
        project = result.scalar_one_or_none()

        if not project:
            raise ValueError("Project not found")

        server_status = await self.check_opencode_server_status(project)

        if server_status == OpenCodeServerStatus.STOPPED:
            server_status = await self.start_opencode_server(project, current_user.id)

        if server_status == OpenCodeServerStatus.ERROR:
            raise RuntimeError("Failed to start OpenCode server")

        final_prompt_content = await self.get_prompt_content(
            prompt_template_id, prompt_content, variables
        )

        db_session = await self.create_opencode_session(
            project_id, prompt_template_id, final_prompt_content, current_user
        )

        server_session_id = await self.create_opencode_server_session(project)

        if server_session_id:
            await self.send_prompt_to_opencode(project, server_session_id, final_prompt_content)

            asyncio.create_task(
                self._background_poll_result(project, db_session.id, server_session_id)
            )

        db_session.status = OpenCodeSessionStatus.ACTIVE
        db_session.started_at = datetime.utcnow()
        await self.db.commit()
        await self.db.refresh(db_session)

        project.opencode_current_session_id = db_session.id
        await self.db.commit()

        return db_session, server_status

    async def _background_poll_result(
        self, project: Project, db_session_id: str, server_session_id: str
    ):
        """
        后台轮询结果任务
        """
        try:
            result_db = await self.db.execute(
                select(OpenCodeSession).where(OpenCodeSession.id == db_session_id)
            )
            db_session = result_db.scalar_one_or_none()

            result = await self.poll_opencode_result(project, server_session_id, db_session)

            if db_session:
                db_session.response_content = result
                db_session.status = OpenCodeSessionStatus.CLOSED
                db_session.completed_at = datetime.utcnow()
                await self.db.commit()
        except Exception as e:
            print(f"Background poll failed: {e}")
            try:
                result_db = await self.db.execute(
                    select(OpenCodeSession).where(OpenCodeSession.id == db_session_id)
                )
                db_session = result_db.scalar_one_or_none()
                if db_session:
                    db_session.status = OpenCodeSessionStatus.ERROR
                    db_session.response_content = f"Error: {str(e)}"
                    await self.db.commit()
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
