"""
OpenCode 审计任务共享工具函数
最大化代码复用的核心模块
"""

import os
import shutil
import sys
import signal
import subprocess
import asyncio
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.utils.log import logger
from app.models.opencode.opencode_audit_task import OpenCodeAuditTask, OpenCodeAuditTaskStatus
from app.models.project.project import Project
from app.models.audit.audit_vulnerabilities import AuditVulnerability


async def close_opencode_session_by_task(task: OpenCodeAuditTask, db: AsyncSession) -> bool:
    """通过任务关闭 OpenCode 会话"""
    if not task.opencode_session_id:
        return True
    try:
        from app.models.opencode.opencode_session import OpenCodeSession, OpenCodeSessionStatus

        result = await db.execute(
            select(OpenCodeSession).where(OpenCodeSession.id == task.opencode_session_id)
        )
        session = result.scalar_one_or_none()
        if session:
            session.status = OpenCodeSessionStatus.CLOSED
            session.completed_at = datetime.now(timezone.utc)
            await db.commit()
            logger.info(f"[OpenCode] 会话已关闭: {task.opencode_session_id}")
        return True
    except Exception as e:
        logger.error(f"[OpenCode] 关闭会话失败: {e}")
        return False


async def stop_opencode_server_by_project(project: Project, db: AsyncSession) -> bool:
    """通过项目停止 OpenCode 服务器"""
    if not project.opencode_pid:
        return True
    try:
        # 尝试终止进程
        try:
            if sys.platform == "win32":
                subprocess.run(
                    ["taskkill", "/F", "/PID", str(project.opencode_pid)],
                    capture_output=True,
                    timeout=10,
                )
            else:
                try:
                    os.killpg(int(project.opencode_pid), signal.SIGTERM)
                except (OSError, ProcessLookupError):
                    pass
                try:
                    await asyncio.sleep(2)
                except NameError:
                    pass
                try:
                    os.killpg(int(project.opencode_pid), signal.SIGKILL)
                except (OSError, ProcessLookupError):
                    pass
        except Exception as e:
            logger.warning(f"[OpenCode] 停止服务器时出错: {e}")

        # 更新项目状态
        project.opencode_pid = None
        project.opencode_port = None
        project.opencode_active_session_id = None
        await db.commit()
        logger.info(f"[OpenCode] 服务器已停止")
        return True
    except Exception as e:
        logger.error(f"[OpenCode] 停止服务器失败: {e}")
        return False


async def delete_project_directory(task: OpenCodeAuditTask) -> bool:
    """删除任务关联的临时项目目录"""
    try:
        if not task.opencode_session_id:
            return True

        # 构建临时目录路径
        if sys.platform == "win32":
            project_dir = Path(f"C:/temp/{task.opencode_session_id}")
        else:
            project_dir = Path(f"/tmp/{task.opencode_session_id}")

        if project_dir.exists():
            shutil.rmtree(project_dir)
            logger.info(f"[OpenCode] 已删除项目目录: {project_dir}")
        return True
    except Exception as e:
        logger.error(f"[OpenCode] 删除项目目录失败: {e}")
        return False


async def update_task_status(
    task: OpenCodeAuditTask,
    status: str,
    error_msg: Optional[str] = None,
    db: Optional[AsyncSession] = None,
) -> None:
    """更新任务状态"""
    task.status = status
    if status in [
        OpenCodeAuditTaskStatus.COMPLETED,
        OpenCodeAuditTaskStatus.FAILED,
        OpenCodeAuditTaskStatus.CANCELLED,
    ]:
        task.completed_at = datetime.now(timezone.utc)
    if error_msg:
        task.error_message = error_msg
    if db:
        await db.commit()
    logger.info(f"[OpenCode] 任务状态更新: {task.id} -> {status}")


async def delete_task_vulnerabilities(task_id: str, db: AsyncSession) -> bool:
    """删除任务关联的所有漏洞"""
    try:
        result = await db.execute(
            select(AuditVulnerability).where(AuditVulnerability.task_id == task_id)
        )
        vulnerabilities = result.scalars().all()
        count = 0
        for vuln in vulnerabilities:
            await db.delete(vuln)
            count += 1
        await db.commit()
        logger.info(f"[OpenCode] 已删除 {count} 个漏洞记录: {task_id}")
        return True
    except Exception as e:
        logger.error(f"[OpenCode] 删除漏洞失败: {e}")
        return False
