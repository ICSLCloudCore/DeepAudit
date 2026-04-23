"""
OpenCode会话管理 API 端点
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sse_starlette.sse import EventSourceResponse
from sqlalchemy import select, and_, desc, func
from sqlalchemy.ext.asyncio import AsyncSession

import json
import asyncio
from datetime import datetime, timezone
from typing import Dict

from app.utils.log import logger
from app.db.session import get_db
from app.models.opencode_session import OpenCodeSession, OpenCodeSessionStatus
from app.models.opencode_interaction import OpenCodeInteraction
from app.models.opencode_message_content import OpenCodeMessageContent
from app.models.prompt_template import PromptTemplate
from app.models.project import Project
from app.models.user import User
from app.api.deps import get_current_user
from app.schemas.opencode_session import (
    OpenCodeSessionCreate,
    OpenCodeSessionResponse,
    OpenCodeSessionListResponse,
    SendPromptRequest,
    StartAuditWithPromptRequest,
    StartAuditWithPromptResponse,
    SessionStatusResponse,
    AvailablePromptsResponse,
    AvailablePromptItem,
    OpenCodeInteractionResponse,
    OpenCodeInteractionListResponse,
    OpenCodeServerStatus,
)
from app.services.opencode.opencode_session_service import OpenCodeSessionService
from app.models.opencode_audit_task import OpenCodeAuditTaskStatus

router = APIRouter()

# 跟踪活跃的 SSE 流，用于在任务完成时主动停止
_active_streams: Dict[str, asyncio.Event] = {}


def process_prompt_variables(content: str, variables: dict) -> str:
    """处理提示词变量替换"""
    result = content
    for key, value in variables.items():
        result = result.replace(f"{{{key}}}", str(value))
    return result


@router.post("/projects/{project_id}/sessions", response_model=OpenCodeSessionResponse)
async def create_session(
    project_id: str,
    session_in: OpenCodeSessionCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """创建新的OpenCode会话"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    prompt_content = session_in.prompt_content
    prompt_template_id = session_in.prompt_template_id

    if prompt_template_id:
        result = await db.execute(
            select(PromptTemplate).where(PromptTemplate.id == prompt_template_id)
        )
        template = result.scalar_one_or_none()
        if template:
            prompt_content = template.content_zh or template.content_en or prompt_content
            if session_in.variables:
                prompt_content = process_prompt_variables(prompt_content, session_in.variables)

    session = OpenCodeSession(
        project_id=project_id,
        status=OpenCodeSessionStatus.ACTIVE,
        prompt_template_id=prompt_template_id,
        prompt_content=prompt_content,
        created_by=current_user.id,
    )

    db.add(session)
    await db.commit()
    await db.refresh(session)

    project.opencode_current_session_id = session.id
    await db.commit()

    return OpenCodeSessionResponse(
        id=session.id,
        project_id=session.project_id,
        status=session.status,
        prompt_template_id=session.prompt_template_id,
        prompt_content=session.prompt_content,
        response_content=session.response_content,
        started_at=session.started_at,
        completed_at=session.completed_at,
        created_by=session.created_by,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.get("/projects/{project_id}/sessions", response_model=OpenCodeSessionListResponse)
async def list_sessions(
    project_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """获取项目的会话列表"""
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    count_query = select(func.count()).select_from(
        select(OpenCodeSession).where(OpenCodeSession.project_id == project_id).subquery()
    )
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    query = (
        select(OpenCodeSession)
        .where(OpenCodeSession.project_id == project_id)
        .order_by(desc(OpenCodeSession.created_at))
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(query)
    sessions = result.scalars().all()

    items = [
        OpenCodeSessionResponse(
            id=s.id,
            project_id=s.project_id,
            status=s.status,
            prompt_template_id=s.prompt_template_id,
            prompt_content=s.prompt_content,
            response_content=s.response_content,
            started_at=s.started_at,
            completed_at=s.completed_at,
            created_by=s.created_by,
            created_at=s.created_at,
            updated_at=s.updated_at,
        )
        for s in sessions
    ]

    return OpenCodeSessionListResponse(items=items, total=total)


@router.get("/sessions/{session_id}", response_model=OpenCodeSessionResponse)
async def get_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """获取会话详情"""
    result = await db.execute(select(OpenCodeSession).where(OpenCodeSession.id == session_id))
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(select(Project).where(Project.id == session.project_id))
    project = result.scalar_one_or_none()

    if project and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    return OpenCodeSessionResponse(
        id=session.id,
        project_id=session.project_id,
        status=session.status,
        prompt_template_id=session.prompt_template_id,
        prompt_content=session.prompt_content,
        response_content=session.response_content,
        started_at=session.started_at,
        completed_at=session.completed_at,
        created_by=session.created_by,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.post("/sessions/{session_id}/send-prompt", response_model=OpenCodeSessionResponse)
async def send_prompt(
    session_id: str,
    prompt_in: SendPromptRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """向会话发送提示词"""
    result = await db.execute(select(OpenCodeSession).where(OpenCodeSession.id == session_id))
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(select(Project).where(Project.id == session.project_id))
    project = result.scalar_one_or_none()

    if project and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    prompt_content = prompt_in.prompt_content or session.prompt_content
    prompt_template_id = prompt_in.prompt_template_id or session.prompt_template_id

    if prompt_in.prompt_template_id and prompt_in.prompt_template_id != session.prompt_template_id:
        result = await db.execute(
            select(PromptTemplate).where(PromptTemplate.id == prompt_in.prompt_template_id)
        )
        template = result.scalar_one_or_none()
        if template:
            prompt_content = template.content_zh or template.content_en
            if prompt_in.variables:
                prompt_content = process_prompt_variables(prompt_content, prompt_in.variables)

    session.prompt_content = prompt_content
    session.prompt_template_id = prompt_template_id
    session.status = OpenCodeSessionStatus.ACTIVE
    session.response_content = ""

    await db.commit()
    await db.refresh(session)

    if project:
        project.opencode_current_session_id = session.id
        await db.commit()

    return OpenCodeSessionResponse(
        id=session.id,
        project_id=session.project_id,
        status=session.status,
        prompt_template_id=session.prompt_template_id,
        prompt_content=session.prompt_content,
        response_content=session.response_content,
        started_at=session.started_at,
        completed_at=session.completed_at,
        created_by=session.created_by,
        created_at=session.created_at,
        updated_at=session.updated_at,
    )


@router.delete("/sessions/{session_id}")
async def close_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """关闭会话"""
    result = await db.execute(select(OpenCodeSession).where(OpenCodeSession.id == session_id))
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(select(Project).where(Project.id == session.project_id))
    project = result.scalar_one_or_none()

    if project and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

    session.status = OpenCodeSessionStatus.CLOSED
    session.completed_at = datetime.now(timezone.utc)

    await db.commit()

    if project and project.opencode_current_session_id == session.id:
        project.opencode_current_session_id = None
        await db.commit()

    return {"message": "Session closed successfully"}


def stop_session_stream(session_id: str):
    """通知指定会话的 SSE 流停止（在任务完成时调用）"""
    stop_event = _active_streams.pop(session_id, None)
    if stop_event:
        stop_event.set()
        logger.info(f"[SSE] Notified stream to stop for session {session_id}")
    else:
        logger.debug(f"[SSE] No active stream found for session {session_id}")


@router.get("/sessions/{session_id}/stream")
async def session_stream(
    session_id: str,
    current_user=Depends(get_current_user),
):
    """获取会话的流式响应 - 直接从OpenCode Server获取原始消息数据"""
    from app.db.session import async_session_factory

    # 首先验证会话存在和权限
    async with async_session_factory() as db:
        result = await db.execute(select(OpenCodeSession).where(OpenCodeSession.id == session_id))
        session = result.scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        result = await db.execute(select(Project).where(Project.id == session.project_id))
        project = result.scalar_one_or_none()

        if project and project.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")

    # 创建停止事件，用于在任务完成时主动停止流
    stop_event = asyncio.Event()
    _active_streams[session_id] = stop_event

    async def event_generator():
        total_num = 0
        should_continue = True

        try:
            while should_continue:
                # 检查是否收到停止信号（任务已完成）
                if stop_event.is_set():
                    logger.info(f"[SSE] Stop event received for session {session_id}")
                    should_continue = False
                    break

                # 用于存储从数据库获取的数据
                current_session_data = None
                messages_data = []

                try:
                    # 1. 先在数据库会话中获取所有需要的数据
                    async with async_session_factory() as db:
                        # 重新获取会话状态
                        result = await db.execute(
                            select(OpenCodeSession).where(OpenCodeSession.id == session_id)
                        )
                        current_session = result.scalar_one_or_none()

                        if not current_session:
                            should_continue = False
                            break

                        # 获取消息
                        query = (
                            select(OpenCodeMessageContent)
                            .where(and_(OpenCodeMessageContent.session_id == session_id))
                            .order_by(OpenCodeMessageContent.message_index)
                        )
                        result = await db.execute(query)
                        messages = result.scalars().all()

                        # 将数据复制到局部变量，以便在会话外部使用
                        current_session_data = {"status": current_session.status}
                        messages_data = [
                            {
                                "content_type": msg.content_type,
                                "text_content": msg.text_content,
                                "message_index": msg.message_index,
                                "time": msg.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                            }
                            for msg in messages
                        ]

                    # 2. 现在在数据库会话外部处理数据和yield
                    # 发送新消息
                    for msg in messages_data[total_num:]:
                        # 检查停止信号
                        if stop_event.is_set():
                            logger.info(
                                f"[SSE] Stop event during message send for session {session_id}"
                            )
                            should_continue = False
                            break

                        yield {
                            "event": "message",
                            "data": json.dumps(msg),
                        }
                        try:
                            await asyncio.sleep(0.5)
                        except asyncio.CancelledError:
                            logger.error(
                                f"[SSE] Client disconnected during message send for session {session_id}"
                            )
                            should_continue = False
                            break

                    if not should_continue:
                        break

                    total_num = len(messages_data)

                    # 检查会话是否结束
                    if current_session_data and current_session_data["status"] in [
                        OpenCodeSessionStatus.CLOSED,
                        OpenCodeSessionStatus.ERROR,
                    ]:
                        # 获取时间 - 如果有消息使用最后一个消息的时间，否则使用当前时间
                        done_time = None
                        if messages_data:
                            done_time = messages_data[-1]["time"]
                        else:
                            from datetime import datetime

                            done_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

                        yield {
                            "event": "done",
                            "data": json.dumps(
                                {"content_type": current_session_data["status"], "time": done_time}
                            ),
                        }
                        should_continue = False
                        break

                    # 3. 在数据库会话外部等待，使用 wait_for 支持停止事件
                    if should_continue:
                        try:
                            await asyncio.wait_for(stop_event.wait(), timeout=1.0)
                            # 如果到这里，说明 stop_event 被设置了
                            logger.info(f"[SSE] Stop event during wait for session {session_id}")
                            should_continue = False
                            break
                        except asyncio.TimeoutError:
                            # 正常超时，继续下一轮轮询
                            pass

                except asyncio.CancelledError:
                    logger.error(f"[SSE] Client disconnected from stream for session {session_id}")
                    should_continue = False
                    break
                except Exception as e:
                    # 记录错误但不抛出，避免影响连接池
                    logger.error(f"[SSE] Error in stream for session {session_id}: {e}")
                    import traceback

                    traceback.print_exc()
                    # 出错时等待一下再继续，避免快速重试
                    try:
                        await asyncio.sleep(2)
                    except asyncio.CancelledError:
                        should_continue = False
                        break
        finally:
            # 清理：确保从活跃流列表中移除
            _active_streams.pop(session_id, None)
            logger.info(f"[SSE] Stream cleanup completed for session {session_id}")

    return EventSourceResponse(event_generator())


@router.post(
    "/projects/{project_id}/audit-with-prompt", response_model=StartAuditWithPromptResponse
)
async def start_audit_with_prompt(
    project_id: str,
    audit_in: StartAuditWithPromptRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """启动OpenCode审计（带Prompt选择）"""
    try:
        service = OpenCodeSessionService(db)
        session, server_status, audit_task = await service.start_audit_with_prompt(
            project_id=project_id,
            prompt_template_id=audit_in.prompt_template_id,
            prompt_content=audit_in.prompt_content,
            variables=audit_in.variables,
            current_user=current_user,
        )

        return StartAuditWithPromptResponse(
            session_id=session.id,
            task_id=audit_task.id,
            project_id=session.project_id,
            status=session.status,
            opencode_server_status=server_status,
            message="审计已启动",
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}/status", response_model=SessionStatusResponse)
async def get_session_status(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """获取OpenCode会话状态"""
    try:
        service = OpenCodeSessionService(db)
        session, server_status = await service.get_session_status(
            session_id=session_id, current_user=current_user
        )

        return SessionStatusResponse(
            session_id=session.id,
            status=session.status,
            prompt_content=session.prompt_content,
            response_content=session.response_content,
            opencode_server_status=server_status,
            started_at=session.started_at,
            completed_at=session.completed_at,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/projects/{project_id}/available-prompts", response_model=AvailablePromptsResponse)
async def get_available_prompts(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """获取项目可用提示词列表"""
    try:
        service = OpenCodeSessionService(db)
        templates, total = await service.get_available_prompts(
            project_id=project_id, current_user=current_user
        )

        items = [
            AvailablePromptItem(
                id=t.id,
                name=t.name,
                description=t.description,
                template_type=t.template_type,
                is_default=t.is_default,
                is_system=t.is_system,
                is_active=t.is_active,
            )
            for t in templates
        ]

        return AvailablePromptsResponse(items=items, total=total)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions/{session_id}/interactions", response_model=OpenCodeInteractionListResponse)
async def get_session_interactions(
    session_id: str,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """获取OpenCode会话的交互历史"""
    try:
        result = await db.execute(select(OpenCodeSession).where(OpenCodeSession.id == session_id))
        session = result.scalar_one_or_none()

        if not session:
            raise HTTPException(status_code=404, detail="Session not found")

        result = await db.execute(select(Project).where(Project.id == session.project_id))
        project = result.scalar_one_or_none()

        if project and project.owner_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized")

        count_query = select(func.count()).select_from(
            select(OpenCodeInteraction)
            .where(OpenCodeInteraction.session_id == session_id)
            .subquery()
        )
        total_result = await db.execute(count_query)
        total = total_result.scalar() or 0

        query = (
            select(OpenCodeInteraction)
            .where(OpenCodeInteraction.session_id == session_id)
            .order_by(desc(OpenCodeInteraction.request_timestamp))
            .offset(skip)
            .limit(limit)
        )
        result = await db.execute(query)
        interactions = result.scalars().all()

        items = [
            OpenCodeInteractionResponse(
                id=interaction.id,
                session_id=interaction.session_id,
                interaction_type=interaction.interaction_type,
                endpoint=interaction.endpoint,
                http_method=interaction.http_method,
                request_timestamp=interaction.request_timestamp,
                response_timestamp=interaction.response_timestamp,
                duration_ms=interaction.duration_ms,
                request_payload=interaction.request_payload,
                response_payload=interaction.response_payload,
                http_status_code=interaction.http_status_code,
                error_message=interaction.error_message,
                error_type=interaction.error_type,
                created_at=interaction.created_at,
                updated_at=interaction.updated_at,
            )
            for interaction in interactions
        ]

        return OpenCodeInteractionListResponse(items=items, total=total)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/projects/{project_id}/start")
async def start_opencode(
    project_id: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Start opencode serve for a project (using new implementation)"""
    # Get project
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check permissions
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")

    service = OpenCodeSessionService(db)

    # Check if already running
    server_status = await service.check_opencode_server_status(project)
    if server_status == OpenCodeServerStatus.RUNNING:
        return {
            "success": True,
            "message": "OpenCode serve is already running",
            "pid": project.opencode_pid,
            "port": project.opencode_port,
        }

    # Start server
    if server_status == OpenCodeServerStatus.STOPPED or server_status == OpenCodeServerStatus.ERROR:
        # 使用 create_full_opencode_session 创建完整会话（包含所有逻辑）
        db_session, server_status = await service.create_full_opencode_session(
            project_id,
            project,
            current_user,
            prompt_template_id=None,
            prompt_content=None,
        )

        if server_status == OpenCodeServerStatus.RUNNING:
            return {
                "success": True,
                "message": "OpenCode serve started successfully",
                "pid": project.opencode_pid,
                "port": project.opencode_port,
                "session_id": db_session.id,
            }
        elif server_status == OpenCodeServerStatus.STARTING:
            return {
                "success": True,
                "message": "OpenCode serve is starting",
                "session_id": db_session.id,
            }
        else:
            # Update session status to error
            db_session.status = OpenCodeSessionStatus.ERROR
            await db.commit()
            raise HTTPException(status_code=500, detail="Failed to start OpenCode serve")

    return {"success": True, "message": "OpenCode serve status: " + server_status}


@router.post("/projects/{project_id}/stop")
async def stop_opencode(
    project_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Stop opencode serve for a project (using new implementation)"""
    # Get project
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()

    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    # Check permissions
    if project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to access this project")

    service = OpenCodeSessionService(db)
    success = await service.stop_opencode_server(project)

    if success:
        return {"success": True, "message": "OpenCode serve stopped"}
    else:
        raise HTTPException(status_code=500, detail="Failed to stop OpenCode serve")
