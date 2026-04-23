"""
安全知识库洞察调度器

启动一个后台 asyncio 任务，每分钟检查一次洞察配置：
- 若 enabled=True 且 interval_hours=0（立即），且 last_run_at 为空，立即执行一次
- 若 enabled=True 且 next_run_at 已到（或为空），触发洞察执行
- 洞察执行完成后更新 next_run_at
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Optional

from app.services.insight.insight_config_service import load_insight_config
from app.utils.log import logger

_scheduler_task: Optional[asyncio.Task] = None


async def _scheduler_loop() -> None:
    """主调度循环，每 60 秒检查一次。"""
    logger.info("[InsightScheduler] 调度器已启动")
    while True:
        try:
            await _check_and_run()
        except Exception as e:
            logger.error(f"[InsightScheduler] 检查异常: {e}")
        await asyncio.sleep(60)


async def _check_and_run() -> None:
    """检查是否需要执行洞察，必要时触发（不阻塞调度循环）。"""
    from app.services.insight.insight_runner_service import run_insight, get_insight_status

    config = load_insight_config()
    if not config.get("enabled"):
        return

    status = get_insight_status()
    if status["running"]:
        return

    interval_hours: int = config.get("interval_hours", 24)
    last_run_at: Optional[str] = config.get("last_run_at")
    next_run_at: Optional[str] = config.get("next_run_at")
    now = datetime.now(timezone.utc)

    should_run = False

    if interval_hours == 0:
        # 立即模式：每次启用后执行一次（last_run_at 为空时触发）
        if not last_run_at:
            should_run = True
    else:
        if not next_run_at:
            should_run = True
        else:
            try:
                next_dt = datetime.fromisoformat(next_run_at)
                if next_dt.tzinfo is None:
                    next_dt = next_dt.replace(tzinfo=timezone.utc)
                if now >= next_dt:
                    should_run = True
            except ValueError:
                should_run = True

    if should_run:
        logger.info(f"[InsightScheduler] 触发洞察执行（interval_hours={interval_hours}）")
        asyncio.create_task(run_insight())


def start_scheduler() -> None:
    """在 FastAPI lifespan 中调用，启动后台调度任务。"""
    global _scheduler_task
    _scheduler_task = asyncio.create_task(_scheduler_loop())
    logger.info("[InsightScheduler] 调度任务已创建")


def stop_scheduler() -> None:
    """在 FastAPI 关闭时调用。"""
    global _scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        _scheduler_task.cancel()
        logger.info("[InsightScheduler] 调度任务已取消")
