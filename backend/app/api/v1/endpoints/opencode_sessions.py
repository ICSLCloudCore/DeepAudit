"""
OpenCode会话管理 API 端点
"""

import json
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sse_starlette.sse import EventSourceResponse
from sqlalchemy import select, and_, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime
import asyncio
import httpx

from app.db.session import get_db
from app.models.opencode_session import OpenCodeSession, OpenCodeSessionStatus
from app.models.opencode_interaction import OpenCodeInteraction
from app.models.opencode_message_content import OpenCodeMessageContent
from app.models.prompt_template import PromptTemplate
from app.models.project import Project
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
)
from app.services.opencode_session_service import OpenCodeSessionService

router = APIRouter()


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
    session.completed_at = datetime.utcnow()

    await db.commit()

    if project and project.opencode_current_session_id == session.id:
        project.opencode_current_session_id = None
        await db.commit()

    return {"message": "Session closed successfully"}


@router.get("/sessions/{session_id}/stream")
async def session_stream(
    session_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """获取会话的流式响应 - 直接从OpenCode Server获取原始消息数据"""
    result = await db.execute(select(OpenCodeSession).where(OpenCodeSession.id == session_id))
    session = result.scalar_one_or_none()

    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    result = await db.execute(select(Project).where(Project.id == session.project_id))
    project = result.scalar_one_or_none()

    if project and project.owner_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")

<<<<<<< HEAD
    from app.db.session import AsyncSessionLocal
    from app.services.opencode_session_service import OpenCodeSessionService

    async def event_generator():
        # 检查是否有OpenCode Server会话ID
        if not session.opencode_server_session_id:
            yield {
                "event": OpenCodeStreamEventType.DATA.value,
                "data": json.dumps(
                    {
                        "type": OpenCodeStreamEventType.DATA.value,
                        "data": "正在初始化会话...",
                        "timestamp": datetime.utcnow().isoformat(),
                    }
                ),
            }
            return

        # 获取OpenCode Server URL
        service = OpenCodeSessionService(db)
        url = service.get_opencode_server_url(project)
        message_url = f"{url}/session/{session.opencode_server_session_id}/message"
        print(f"[OpenCode] SSE polling message URL: {message_url}")

        processed_message_ids = set()
        max_polls = 300
        poll_interval = 0.5

        for poll_count in range(max_polls):
            try:
                # 直接从OpenCode Server获取原始消息数据
                async with httpx.AsyncClient(timeout=10.0) as client:
                    response = await client.get(message_url)

                    if response.status_code != 200:
                        await asyncio.sleep(poll_interval)
                        continue

                    raw_data = response.json()

                    if isinstance(raw_data, list):
                        for message in raw_data:
                            message_id = message.get("info", {}).get("id")

                            if message_id and message_id not in processed_message_ids:
                                processed_message_ids.add(message_id)

                                # 发送完整的原始消息数据
                                yield {
                                    "event": OpenCodeStreamEventType.DATA.value,
                                    "data": json.dumps(
                                        {
                                            "type": "message",
                                            "message": message,
                                            "timestamp": datetime.utcnow().isoformat(),
                                        }
                                    ),
                                }

                # 检查会话状态
                async with AsyncSessionLocal() as db_session_local:
                    result_db = await db_session_local.execute(
                        select(OpenCodeSession).where(OpenCodeSession.id == session_id)
                    )
                    current_session = result_db.scalar_one_or_none()

                    if current_session and current_session.status == OpenCodeSessionStatus.CLOSED:
                        yield {
                            "event": OpenCodeStreamEventType.DONE.value,
                            "data": json.dumps(
                                {
                                    "type": OpenCodeStreamEventType.DONE.value,
                                    "timestamp": datetime.utcnow().isoformat(),
                                }
                            ),
                        }
                        return
                    elif current_session and current_session.status == OpenCodeSessionStatus.ERROR:
                        yield {
                            "event": OpenCodeStreamEventType.ERROR.value,
                            "data": json.dumps(
                                {
                                    "type": OpenCodeStreamEventType.ERROR.value,
                                    "error": current_session.response_content or "Unknown error",
                                    "timestamp": datetime.utcnow().isoformat(),
                                }
                            ),
                        }
                        return

            except Exception as e:
                print(f"[OpenCode] SSE poll error: {e}")
                import traceback

                print(f"[OpenCode] SSE poll traceback: {traceback.format_exc()}")

            await asyncio.sleep(poll_interval)

        yield {
            "event": OpenCodeStreamEventType.ERROR.value,
            "data": json.dumps(
                {
                    "type": OpenCodeStreamEventType.ERROR.value,
                    "error": "响应超时",
                    "timestamp": datetime.utcnow().isoformat(),
=======
    async def event_generator():
        total_num = 0
        while True:
            # 查询大于last_index的消息
            query = (
                select(OpenCodeMessageContent)
                .where(
                    and_(
                        OpenCodeMessageContent.session_id == session_id
                    )
                )
                .order_by(OpenCodeMessageContent.message_index)
            )
            result = await db.execute(query)
            messages = result.scalars().all()
            for msg in messages[total_num:]:
                yield {
                    "event": "message",
                    "data": json.dumps({
                        "content_type": msg.content_type,
                        "text_content": msg.text_content,
                        "message_index": msg.message_index
                    })
>>>>>>> origin/sse_session
                }
                await asyncio.sleep(1)
            total_num = len(messages)
            # 检查会话是否结束 不考虑另一边存储状态的时间差
            await db.refresh(session)
            if session.status in [OpenCodeSessionStatus.CLOSED, OpenCodeSessionStatus.ERROR]:
                yield {
                    "event": "done",
                    "data": json.dumps({"status": session.status})
                }
                break

            await asyncio.sleep(1)

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
        session, server_status = await service.start_audit_with_prompt(
            project_id=project_id,
            prompt_template_id=audit_in.prompt_template_id,
            prompt_content=audit_in.prompt_content,
            variables=audit_in.variables,
            current_user=current_user,
        )

        return StartAuditWithPromptResponse(
            session_id=session.id,
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
