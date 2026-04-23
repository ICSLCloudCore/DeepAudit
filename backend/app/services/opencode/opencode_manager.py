"""
OpenCode Auto Manager - Manages OpenCode processes for audit tasks
"""

import asyncio
import uuid
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import TaskExecution, OpenCodeStatus
from app.utils.log import logger


class OpenCodeAutoManager:
    """
    Manages the lifecycle of OpenCode processes for audit tasks
    """

    def __init__(self, db: AsyncSession):
        self.db = db
        self._process_cache: Dict[str, Dict[str, Any]] = {}

    async def create_process(self, task_id: str, config: Optional[Dict] = None) -> TaskExecution:
        """
        Create and initialize an OpenCode process for a task
        """
        # Check if execution already exists
        result = await self.db.execute(
            select(TaskExecution).where(TaskExecution.task_id == task_id)
        )
        execution = result.scalar_one_or_none()

        if execution:
            return execution

        # Create new task execution
        execution = TaskExecution(
            task_id=task_id,
            opencode_process_id=str(uuid.uuid4()),
            opencode_status=OpenCodeStatus.PENDING,
            process_info={},
        )

        self.db.add(execution)
        await self.db.commit()
        await self.db.refresh(execution)

        # Start process initialization in background
        asyncio.create_task(self._initialize_process(execution.id, config or {}))

        return execution

    async def _initialize_process(self, execution_id: str, config: Dict):
        """
        Background task to initialize OpenCode process
        """
        try:
            # Get execution
            result = await self.db.execute(
                select(TaskExecution).where(TaskExecution.id == execution_id)
            )
            execution = result.scalar_one_or_none()

            if not execution:
                return

            # Update status to creating
            execution.opencode_status = OpenCodeStatus.CREATING
            await self.db.commit()

            # Simulate process creation (in real implementation, this would start the actual process)
            await asyncio.sleep(2)

            # Load skills and mcps
            await asyncio.sleep(1)

            # Update status to running
            execution.opencode_status = OpenCodeStatus.RUNNING
            execution.started_at = datetime.now(timezone.utc)
            execution.process_info = {
                "pid": 12345,
                "status": "healthy",
                "uptime_seconds": 0,
                "loaded_skills": len(config.get("selected_skills", [])),
                "loaded_mcps": len(config.get("selected_mcps", [])),
                "config": config,
            }
            await self.db.commit()

            # Cache process info
            self._process_cache[execution.opencode_process_id] = {
                "execution_id": execution.id,
                "task_id": execution.task_id,
                "started_at": execution.started_at,
            }

        except Exception as e:
            logger.error(f"Error initializing OpenCode process: {e}")

    async def get_process_status(self, task_id: str) -> Optional[TaskExecution]:
        """
        Get current status of OpenCode process for a task
        """
        result = await self.db.execute(
            select(TaskExecution).where(TaskExecution.task_id == task_id)
        )
        return result.scalar_one_or_none()

    async def cleanup_process(self, task_id: str):
        """
        Clean up OpenCode process when task completes
        """
        result = await self.db.execute(
            select(TaskExecution).where(TaskExecution.task_id == task_id)
        )
        execution = result.scalar_one_or_none()

        if not execution:
            return

        if execution.opencode_status in [OpenCodeStatus.COMPLETED, OpenCodeStatus.CLEANUP]:
            return

        # Update status to cleanup
        execution.opencode_status = OpenCodeStatus.CLEANUP
        await self.db.commit()

        # Simulate cleanup
        await asyncio.sleep(1)

        # Update status to completed
        execution.opencode_status = OpenCodeStatus.COMPLETED
        execution.completed_at = datetime.now(timezone.utc)

        # Remove from cache
        if execution.opencode_process_id in self._process_cache:
            del self._process_cache[execution.opencode_process_id]

        await self.db.commit()

    async def health_check(self, process_id: str) -> bool:
        """
        Perform health check on OpenCode process
        """
        return process_id in self._process_cache
