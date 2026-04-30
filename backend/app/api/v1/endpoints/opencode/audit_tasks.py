"""
DeepAudit OpenCode 审计任务 API
"""

import json
import os
import tempfile
import asyncio
from typing import Any, List, Optional, Dict
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from uuid import uuid4

from app.api import deps
from app.db.session import get_db
from app.models.opencode.opencode_audit_task import OpenCodeAuditTask, OpenCodeAuditTaskStatus
from app.models.project.project import Project
from app.models.user.user import User
from app.models.audit.audit_vulnerabilities import AuditVulnerability
from app.services.opencode.opencode_session_service import OpenCodeSessionService

router = APIRouter()


# ============ Schemas ============


class ProjectSchema(BaseModel):
    id: str
    name: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


class OpenCodeAuditTaskResponse(BaseModel):
    """OpenCode审计任务响应 - 包含所有前端需要的字段"""

    id: str
    project_id: str
    name: Optional[str] = None
    description: Optional[str] = None
    task_type: str = "opencode_audit"
    status: str
    current_step: Optional[str] = None

    # 分支信息
    branch_name: Optional[str] = None

    # OpenCode相关
    opencode_session_id: Optional[str] = None
    opencode_prompt_template_id: Optional[str] = None
    prompt_content: Optional[str] = None

    # 进度统计
    total_files: int = 0
    processed_files: int = 0
    total_lines: int = 0
    findings_count: int = 0

    # 严重程度统计
    critical_count: int = 0
    high_count: int = 0
    medium_count: int = 0
    low_count: int = 0

    # 评分
    quality_score: float = 0.0
    security_score: float = 0.0

    # 进度百分比
    progress_percentage: float = 0.0

    # 时间
    created_at: datetime
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    # 错误信息
    error_message: Optional[str] = None

    # 关联数据
    project: Optional[ProjectSchema] = None

    class Config:
        from_attributes = True


class CreateOpenCodeAuditTaskRequest(BaseModel):
    """创建OpenCode审计任务请求"""

    project_id: str = Field(..., description="项目 ID")
    name: Optional[str] = Field(None, description="任务名称")
    description: Optional[str] = Field(None, description="任务描述")
    branch_name: Optional[str] = Field(None, description="分支名称")
    opencode_session_id: Optional[str] = Field(None, description="关联的OpenCode会话ID")
    opencode_prompt_template_id: Optional[str] = Field(None, description="OpenCode提示词模板ID")
    prompt_content: Optional[str] = Field(None, description="自定义提示词内容")
    audit_config: Optional[dict] = Field(None, description="审计配置")
    target_files: Optional[List[str]] = Field(None, description="指定扫描的文件")
    exclude_patterns: Optional[List[str]] = Field(None, description="排除模式")


class UpdateOpenCodeAuditTaskRequest(BaseModel):
    """更新OpenCode审计任务请求"""

    name: Optional[str] = None
    description: Optional[str] = None


class UpdateOpenCodeAuditTaskStatusRequest(BaseModel):
    """更新任务状态请求"""

    status: str
    current_step: Optional[str] = None
    error_message: Optional[str] = None
    total_files: Optional[int] = None
    processed_files: Optional[int] = None
    total_lines: Optional[int] = None
    findings_count: Optional[int] = None
    critical_count: Optional[int] = None
    high_count: Optional[int] = None
    medium_count: Optional[int] = None
    low_count: Optional[int] = None


# ============ API Endpoints ============


@router.get("/", response_model=List[OpenCodeAuditTaskResponse])
async def list_opencode_audit_tasks(
    project_id: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    获取OpenCode审计任务列表
    """
    from app.utils.log import logger

    logger.info(f"[OpenCode Audit Tasks] Listing tasks for user {current_user.id}")

    # 先获取当前用户的项目ID列表
    projects_result = await db.execute(
        select(Project.id).where(Project.owner_id == current_user.id)
    )
    user_project_ids = [p[0] for p in projects_result.fetchall()]

    query = select(OpenCodeAuditTask).options(selectinload(OpenCodeAuditTask.project))

    # 只返回当前用户项目的任务
    query = (
        query.where(OpenCodeAuditTask.project_id.in_(user_project_ids))
        if user_project_ids
        else query.where(False)
    )

    if project_id:
        query = query.where(OpenCodeAuditTask.project_id == project_id)

    if status:
        query = query.where(OpenCodeAuditTask.status == status)

    if search:
        search_lower = search.lower()
        query = query.where(
            (OpenCodeAuditTask.name.ilike(f"%{search_lower}%"))
            | (OpenCodeAuditTask.description.ilike(f"%{search_lower}%"))
        )

    query = query.order_by(OpenCodeAuditTask.created_at.desc())
    result = await db.execute(query)
    tasks = result.scalars().all()

    logger.info(f"[OpenCode Audit Tasks] Found {len(tasks)} tasks")
    return tasks


@router.post("/", response_model=OpenCodeAuditTaskResponse)
async def create_opencode_audit_task(
    task_data: CreateOpenCodeAuditTaskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    创建OpenCode审计任务
    """
    from app.utils.log import logger

    logger.info(f"[OpenCode Audit Tasks] Creating task for project {task_data.project_id}")

    # 验证项目存在且属于当前用户
    project_result = await db.execute(
        select(Project).where(
            Project.id == task_data.project_id, Project.owner_id == current_user.id
        )
    )
    project = project_result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="项目不存在或无权访问")

    # 如果有关联的 session，检查是否已有运行中的任务
    if task_data.opencode_session_id:
        running_task_result = await db.execute(
            select(OpenCodeAuditTask)
            .where(OpenCodeAuditTask.opencode_session_id == task_data.opencode_session_id)
            .where(
                OpenCodeAuditTask.status.in_(
                    [OpenCodeAuditTaskStatus.PENDING, OpenCodeAuditTaskStatus.RUNNING]
                )
            )
            .order_by(OpenCodeAuditTask.created_at.desc())
        )
        running_task = running_task_result.scalars().first()

        if running_task:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "该会话已有运行中的审计任务",
                    "running_task": {
                        "id": running_task.id,
                        "status": running_task.status,
                        "name": running_task.name,
                    },
                },
            )

    # 创建任务
    task = OpenCodeAuditTask(
        project_id=task_data.project_id,
        created_by=current_user.id,
        name=task_data.name,
        description=task_data.description,
        branch_name=task_data.branch_name,
        opencode_session_id=task_data.opencode_session_id,
        opencode_prompt_template_id=task_data.opencode_prompt_template_id,
        prompt_content=task_data.prompt_content,
        audit_config=task_data.audit_config,
        target_files=task_data.target_files,
        exclude_patterns=task_data.exclude_patterns,
        status=OpenCodeAuditTaskStatus.PENDING,
    )

    db.add(task)
    await db.commit()
    await db.refresh(task)

    logger.info(f"[OpenCode Audit Tasks] Task created: {task.id}")

    # 重新查询以加载关联的项目
    result = await db.execute(
        select(OpenCodeAuditTask)
        .options(selectinload(OpenCodeAuditTask.project))
        .where(OpenCodeAuditTask.id == task.id)
    )
    return result.scalars().first()


@router.get("/{task_id}", response_model=OpenCodeAuditTaskResponse)
async def get_opencode_audit_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    获取单个OpenCode审计任务
    """
    from app.utils.log import logger

    logger.info(f"[OpenCode Audit Tasks] Getting task: {task_id}")

    result = await db.execute(
        select(OpenCodeAuditTask)
        .options(selectinload(OpenCodeAuditTask.project))
        .where(OpenCodeAuditTask.id == task_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 检查权限：只有任务创建者可以查看
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权查看此任务")

    logger.info(f"[OpenCode Audit Tasks] Found task: {task.id}, status: {task.status}")
    return task


@router.put("/{task_id}", response_model=OpenCodeAuditTaskResponse)
async def update_opencode_audit_task(
    task_id: str,
    task_data: UpdateOpenCodeAuditTaskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    更新OpenCode审计任务
    """
    from app.utils.log import logger

    logger.info(f"[OpenCode Audit Tasks] Updating task: {task_id}")

    result = await db.execute(
        select(OpenCodeAuditTask)
        .options(selectinload(OpenCodeAuditTask.project))
        .where(OpenCodeAuditTask.id == task_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 检查权限
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权更新此任务")

    if task_data.name is not None:
        task.name = task_data.name
    if task_data.description is not None:
        task.description = task_data.description

    await db.commit()

    logger.info(f"[OpenCode Audit Tasks] Task updated: {task.id}")

    # 重新查询以确保关联的项目数据被正确加载
    result = await db.execute(
        select(OpenCodeAuditTask)
        .options(selectinload(OpenCodeAuditTask.project))
        .where(OpenCodeAuditTask.id == task_id)
    )
    return result.scalars().first()


@router.patch("/{task_id}/status", response_model=OpenCodeAuditTaskResponse)
async def update_opencode_audit_task_status(
    task_id: str,
    status_data: UpdateOpenCodeAuditTaskStatusRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    更新OpenCode审计任务状态
    """
    from app.utils.log import logger

    logger.info(f"[OpenCode Audit Tasks] Updating task status: {task_id} -> {status_data.status}")

    result = await db.execute(
        select(OpenCodeAuditTask)
        .options(selectinload(OpenCodeAuditTask.project))
        .where(OpenCodeAuditTask.id == task_id)
    )
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 检查权限
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权更新此任务状态")

    # 更新状态
    if status_data.status:
        task.status = status_data.status
        if status_data.status == OpenCodeAuditTaskStatus.RUNNING and not task.started_at:
            task.started_at = datetime.now(timezone.utc)
        if status_data.status in [
            OpenCodeAuditTaskStatus.COMPLETED,
            OpenCodeAuditTaskStatus.FAILED,
            OpenCodeAuditTaskStatus.CANCELLED,
        ]:
            task.completed_at = datetime.now(timezone.utc)

    if status_data.current_step is not None:
        task.current_step = status_data.current_step
    if status_data.error_message is not None:
        task.error_message = status_data.error_message
    if status_data.total_files is not None:
        task.total_files = status_data.total_files
    if status_data.processed_files is not None:
        task.processed_files = status_data.processed_files
    if status_data.total_lines is not None:
        task.total_lines = status_data.total_lines
    if status_data.findings_count is not None:
        task.findings_count = status_data.findings_count
    if status_data.critical_count is not None:
        task.critical_count = status_data.critical_count
    if status_data.high_count is not None:
        task.high_count = status_data.high_count
    if status_data.medium_count is not None:
        task.medium_count = status_data.medium_count
    if status_data.low_count is not None:
        task.low_count = status_data.low_count

    await db.commit()

    logger.info(f"[OpenCode Audit Tasks] Task status updated: {task.id} -> {task.status}")

    # 重新查询以确保关联的项目数据被正确加载
    result = await db.execute(
        select(OpenCodeAuditTask)
        .options(selectinload(OpenCodeAuditTask.project))
        .where(OpenCodeAuditTask.id == task_id)
    )
    return result.scalars().first()


@router.post("/{task_id}/cancel")
async def cancel_opencode_audit_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    取消OpenCode审计任务
    """
    from app.utils.log import logger

    logger.info(f"[OpenCode Audit Tasks] Cancelling task: {task_id}")

    result = await db.execute(select(OpenCodeAuditTask).where(OpenCodeAuditTask.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 检查权限
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权取消此任务")

    if task.status not in [OpenCodeAuditTaskStatus.PENDING, OpenCodeAuditTaskStatus.RUNNING]:
        raise HTTPException(status_code=400, detail="只能取消待处理或运行中的任务")

    # 更新数据库状态
    task.status = OpenCodeAuditTaskStatus.CANCELLED
    task.completed_at = datetime.now(timezone.utc)
    await db.commit()

    logger.info(f"[OpenCode Audit Tasks] Task cancelled: {task_id}")

    return {"message": "任务已取消", "task_id": task_id}


@router.delete("/{task_id}")
async def delete_opencode_audit_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    删除OpenCode审计任务
    """
    from app.utils.log import logger

    logger.info(f"[OpenCode Audit Tasks] Deleting task: {task_id}")

    result = await db.execute(select(OpenCodeAuditTask).where(OpenCodeAuditTask.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 检查权限
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权删除此任务")

    await db.delete(task)
    await db.commit()

    logger.info(f"[OpenCode Audit Tasks] Task deleted: {task_id}")

    return {"message": "任务已删除", "task_id": task_id}


# ============ 漏洞相关 Schema ============


class AuditVulnerabilityResponse(BaseModel):
    """漏洞响应"""

    id: str
    task_id: str
    vuln_id: str
    severity: str
    cvss_score: Optional[float] = None
    cvss_vector: Optional[str] = None
    cwe: Optional[str] = None
    confidence: Optional[str] = None
    location: Optional[str] = None
    file_path: Optional[str] = None
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    vulnerability_title: str
    vulnerability_essence: Optional[str] = None
    root_cause: Optional[str] = None
    security_impact: Optional[str] = None
    vulnerable_code: Optional[str] = None
    dataflow: Optional[str] = None
    exploit_steps: Optional[str] = None
    exploit_poc: Optional[str] = None
    impact_confidentiality: Optional[str] = None
    impact_integrity: Optional[str] = None
    impact_availability: Optional[str] = None
    fix_description: Optional[str] = None
    fix_code_before: Optional[str] = None
    fix_code_after: Optional[str] = None
    manual_confirmation: Optional[bool] = None
    manual_confirmation_status: Optional[str] = None
    manual_confirmation_notes: Optional[str] = None
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[datetime] = None
    status: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PaginatedVulnerabilitiesResponse(BaseModel):
    """分页漏洞响应"""

    items: List[AuditVulnerabilityResponse]
    total: int
    page: int
    page_size: int
    total_pages: int


class ImportVulnerabilitiesRequest(BaseModel):
    """导入漏洞请求"""

    report_path: Optional[str] = Field(None, description="报告文件路径")
    report_data: Optional[Dict] = Field(None, description="报告JSON数据")


# ============ 漏洞相关 API Endpoints ============


@router.post("/{task_id}/import-vulns", response_model=Dict[str, Any])
async def import_vulnerabilities(
    task_id: str,
    request: ImportVulnerabilitiesRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    导入审计报告中的漏洞到数据库
    """
    from app.utils.log import logger

    logger.info(f"[OpenCode Audit Tasks] Importing vulnerabilities for task: {task_id}")

    # 验证任务存在且属于当前用户
    task_result = await db.execute(
        select(OpenCodeAuditTask).where(
            OpenCodeAuditTask.id == task_id, OpenCodeAuditTask.created_by == current_user.id
        )
    )
    task = task_result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或无权访问")

    # 获取报告数据
    report_data = request.report_data
    if request.report_path:
        try:
            with open(request.report_path, "r", encoding="utf-8") as f:
                report_data = json.load(f)
        except Exception as e:
            logger.error(f"[OpenCode Audit Tasks] Failed to read report file: {e}")
            raise HTTPException(status_code=400, detail=f"读取报告文件失败: {str(e)}")

    if not report_data:
        raise HTTPException(status_code=400, detail="报告数据不能为空")

    # 调用服务层统一导入方法
    service = OpenCodeSessionService(db)
    result_stats = await service.auto_import_vulnerabilities(
        db, task_id, task.project_id, report_data
    )

    logger.info(
        f"[OpenCode Audit Tasks] Import completed: {result_stats['imported_count']} vulnerabilities"
    )

    # 重新查询任务获取更新后的统计
    await db.refresh(task)

    message = (
        f"成功导入 {result_stats['imported_count']} 个漏洞"
        if result_stats["imported_count"] > 0
        else "报告中没有漏洞数据或全部已存在"
    )

    return {
        "message": message,
        "imported_count": result_stats["imported_count"],
        "total_in_report": result_stats["total_in_report"],
        "findings_count": result_stats["findings_count"],
        "critical_count": result_stats["critical_count"],
        "high_count": result_stats["high_count"],
        "medium_count": result_stats["medium_count"],
        "low_count": result_stats["low_count"],
    }


@router.post("/{task_id}/scan-import-vulns")
async def scan_import_vulnerabilities(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    扫描并导入审计报告中的漏洞
    用户在调用 skill 导出 JSON 报告后，调用此接口触发扫描和导入
    """
    from app.utils.log import logger

    logger.info(
        f"[OpenCode Audit Tasks] Scanning and importing vulnerabilities for task: {task_id}"
    )

    # 验证任务存在且属于当前用户
    task_result = await db.execute(
        select(OpenCodeAuditTask).where(
            OpenCodeAuditTask.id == task_id, OpenCodeAuditTask.created_by == current_user.id
        )
    )
    task = task_result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或无权访问")

    # 调用服务层扫描导入
    service = OpenCodeSessionService(db)
    await service.auto_import_vulnerabilities(db, task_id, task.project_id)

    logger.info(f"[OpenCode Audit Tasks] Scan and import completed for task: {task_id}")

    # 重新查询任务获取更新后的统计
    await db.refresh(task)

    return {
        "message": "扫描导入完成",
        "findings_count": task.findings_count,
        "critical_count": task.critical_count,
        "high_count": task.high_count,
        "medium_count": task.medium_count,
        "low_count": task.low_count,
    }


@router.get("/{task_id}/vulnerabilities", response_model=PaginatedVulnerabilitiesResponse)
async def list_vulnerabilities(
    task_id: str,
    severity: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    获取任务的漏洞列表
    """
    from app.utils.log import logger

    logger.info(f"[OpenCode Audit Tasks] Listing vulnerabilities for task: {task_id}")

    # 验证任务存在且属于当前用户
    task_result = await db.execute(
        select(OpenCodeAuditTask).where(
            OpenCodeAuditTask.id == task_id, OpenCodeAuditTask.created_by == current_user.id
        )
    )
    task = task_result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或无权访问")

    # 构建基础查询
    base_query = select(AuditVulnerability).where(AuditVulnerability.task_id == task_id)

    if severity:
        # 支持中英文 severity 过滤
        severity_map = {
            "critical": ["critical", "致命"],
            "high": ["high", "严重"],
            "medium": ["medium", "一般"],
            "low": ["low", "提示"],
        }
        severities_to_match = severity_map.get(severity, [severity])
        base_query = base_query.where(AuditVulnerability.severity.in_(severities_to_match))

    if status:
        base_query = base_query.where(AuditVulnerability.status == status)

    # 查询总数量
    count_query = select(func.count()).select_from(base_query.subquery())
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # 查询当前页数据
    query = base_query.order_by(AuditVulnerability.created_at.desc())
    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size)

    result = await db.execute(query)
    items = result.scalars().all()

    # 计算总页数
    total_pages = (total + page_size - 1) // page_size if total > 0 else 0

    logger.info(f"[OpenCode Audit Tasks] Found {len(items)} vulnerabilities (total: {total})")

    return PaginatedVulnerabilitiesResponse(
        items=items, total=total, page=page, page_size=page_size, total_pages=total_pages
    )


@router.get("/{task_id}/vulnerabilities/{vuln_id}", response_model=AuditVulnerabilityResponse)
async def get_vulnerability(
    task_id: str,
    vuln_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    获取单个漏洞详情
    """
    from app.utils.log import logger

    logger.info(f"[OpenCode Audit Tasks] Getting vulnerability: {vuln_id} for task: {task_id}")

    # 验证任务存在且属于当前用户
    task_result = await db.execute(
        select(OpenCodeAuditTask).where(
            OpenCodeAuditTask.id == task_id, OpenCodeAuditTask.created_by == current_user.id
        )
    )
    task = task_result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或无权访问")

    # 查询漏洞
    vuln_result = await db.execute(
        select(AuditVulnerability).where(
            AuditVulnerability.id == vuln_id, AuditVulnerability.task_id == task_id
        )
    )
    vuln = vuln_result.scalars().first()
    if not vuln:
        raise HTTPException(status_code=404, detail="漏洞不存在")

    logger.info(f"[OpenCode Audit Tasks] Found vulnerability: {vuln_id}")

    return vuln


class UpdateVulnerabilityStatusRequest(BaseModel):
    """更新漏洞状态请求"""

    status: str = Field(..., description="状态: true_positive 或 false_positive")
    notes: Optional[str] = Field(None, description="备注信息")


@router.patch("/{task_id}/vulnerabilities/{vuln_id}")
async def update_vulnerability_status(
    task_id: str,
    vuln_id: str,
    request: UpdateVulnerabilityStatusRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    更新漏洞状态
    """
    from app.utils.log import logger

    logger.info(
        f"[OpenCode Audit Tasks] Updating vulnerability status: {vuln_id} -> {request.status}"
    )

    # 验证任务存在且属于当前用户
    task_result = await db.execute(
        select(OpenCodeAuditTask).where(
            OpenCodeAuditTask.id == task_id, OpenCodeAuditTask.created_by == current_user.id
        )
    )
    task = task_result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在或无权访问")

    # 查询漏洞
    vuln_result = await db.execute(
        select(AuditVulnerability).where(
            AuditVulnerability.id == vuln_id, AuditVulnerability.task_id == task_id
        )
    )
    vuln = vuln_result.scalars().first()
    if not vuln:
        raise HTTPException(status_code=404, detail="漏洞不存在")

    # 验证状态值
    valid_statuses = ["true_positive", "false_positive"]
    if request.status not in valid_statuses:
        raise HTTPException(
            status_code=400, detail=f"无效的状态值，有效值为: {', '.join(valid_statuses)}"
        )

    # 状态标签映射
    status_labels = {
        "true_positive": "是问题",
        "false_positive": "误报",
    }

    # 更新字段
    vuln.status = request.status
    vuln.manual_confirmation = True
    vuln.manual_confirmation_status = status_labels.get(request.status, request.status)
    vuln.manual_confirmation_notes = request.notes or status_labels.get(
        request.status, request.status
    )
    vuln.confirmed_by = current_user.id
    vuln.confirmed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(vuln)

    logger.info(f"[OpenCode Audit Tasks] Vulnerability status updated: {vuln_id} -> {vuln.status}")

    return {
        "message": "状态已更新",
        "vuln_id": vuln_id,
        "status": vuln.status,
        "manual_confirmation_status": vuln.manual_confirmation_status,
    }


# ============ 报告下载相关 API Endpoints ============


@router.get("/{task_id}/export-report-md")
async def export_report_md(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    导出 Markdown 格式的审计报告
    """
    from app.utils.log import logger

    logger.info(f"[OpenCode Report Export] ========== EXPORT MD REPORT START ==========")
    logger.info(f"[OpenCode Report Export] Task ID: {task_id}")
    logger.info(f"[OpenCode Report Export] User ID: {current_user.id}")

    task_result = await db.execute(
        select(OpenCodeAuditTask).where(
            OpenCodeAuditTask.id == task_id, OpenCodeAuditTask.created_by == current_user.id
        )
    )
    task = task_result.scalars().first()
    if not task:
        logger.error(f"[OpenCode Report Export] Task not found or not authorized: {task_id}")
        raise HTTPException(status_code=404, detail="任务不存在或无权访问")

    logger.info(f"[OpenCode Report Export] Task found: {task.id}")
    logger.info(f"[OpenCode Report Export] Task status: {task.status}")
    logger.info(f"[OpenCode Report Export] OpenCode session ID: {task.opencode_session_id}")
    logger.info(f"[OpenCode Report Export] Project ID: {task.project_id}")

    project_result = await db.execute(select(Project).where(Project.id == task.project_id))
    project = project_result.scalar_one_or_none()

    project_source_type = project.source_type if project else None
    logger.info(f"[OpenCode Report Export] Project source type: {project_source_type}")

    # 使用服务层的公共方法查找报告文件
    logger.info(f"[OpenCode Report Export] Starting to find MD report files...")
    service = OpenCodeSessionService(db)
    report_files = service.find_report_files(
        opencode_session_id=task.opencode_session_id,
        project_id=task.project_id,
        project_source_type=project_source_type,
        extension=".md",
    )

    logger.info(f"[OpenCode Report Export] Found {len(report_files)} MD report files")
    for i, f in enumerate(report_files):
        logger.info(f"[OpenCode Report Export] MD file {i + 1}: {f}")

    if not report_files:
        logger.warning(
            f"[OpenCode Report Export] No MD report files found, returning default content"
        )

        # 创建临时 Markdown 文件，返回"无报告"内容
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".md", delete=False, encoding="utf-8"
        ) as f:
            f.write("# OpenCode 审计报告\n\n")
            f.write("## 状态\n\n")
            f.write("暂无报告生成，请等待审计任务完成后重试。\n\n")
            f.write("## 任务信息\n\n")
            f.write(f"- 任务 ID: {task_id}\n")
            f.write(f"- 任务状态: {task.status}\n")
            f.write(f"- 创建时间: {task.created_at}\n")
            if task.started_at:
                f.write(f"- 开始时间: {task.started_at}\n")
            temp_md_path = f.name

        try:
            filename = f"opencode-audit-report-{task_id[:8]}-no-report.md"
            logger.info(f"[OpenCode Report Export] Serving default MD content: {filename}")
            logger.info(f"[OpenCode Report Export] ========== EXPORT MD REPORT END ==========")

            # 延迟删除临时文件
            async def delete_temp_file():
                await asyncio.sleep(1)
                try:
                    Path(temp_md_path).unlink(missing_ok=True)
                    logger.info(
                        f"[OpenCode Report Export] Deleted temporary MD file: {temp_md_path}"
                    )
                except Exception as e:
                    logger.error(
                        f"[OpenCode Report Export] Failed to delete temporary MD file: {e}"
                    )

            asyncio.create_task(delete_temp_file())
            return FileResponse(
                path=str(temp_md_path), media_type="text/markdown", filename=filename
            )
        except Exception:
            # 确保临时文件被删除
            try:
                Path(temp_md_path).unlink(missing_ok=True)
            except Exception:
                pass
            raise
    else:
        latest_file = report_files[0]
        logger.info(f"[OpenCode Report Export] Serving latest MD file: {latest_file}")
        logger.info(f"[OpenCode Report Export] File exists: {latest_file.exists()}")
        logger.info(
            f"[OpenCode Report Export] File size: {latest_file.stat().st_size if latest_file.exists() else 0} bytes"
        )

        filename = f"opencode-audit-report-{task_id[:8]}.md"
        logger.info(f"[OpenCode Report Export] Download filename: {filename}")
        logger.info(f"[OpenCode Report Export] ========== EXPORT MD REPORT END ==========")

        return FileResponse(path=str(latest_file), media_type="text/markdown", filename=filename)


@router.get("/{task_id}/export-report-json")
async def export_report_json(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    导出 JSON 格式的审计报告
    """
    from app.utils.log import logger

    logger.info(f"[OpenCode Report Export] ========== EXPORT JSON REPORT START ==========")
    logger.info(f"[OpenCode Report Export] Task ID: {task_id}")
    logger.info(f"[OpenCode Report Export] User ID: {current_user.id}")

    task_result = await db.execute(
        select(OpenCodeAuditTask).where(
            OpenCodeAuditTask.id == task_id, OpenCodeAuditTask.created_by == current_user.id
        )
    )
    task = task_result.scalars().first()
    if not task:
        logger.error(f"[OpenCode Report Export] Task not found or not authorized: {task_id}")
        raise HTTPException(status_code=404, detail="任务不存在或无权访问")

    logger.info(f"[OpenCode Report Export] Task found: {task.id}")
    logger.info(f"[OpenCode Report Export] Task status: {task.status}")
    logger.info(f"[OpenCode Report Export] OpenCode session ID: {task.opencode_session_id}")
    logger.info(f"[OpenCode Report Export] Project ID: {task.project_id}")

    project_result = await db.execute(select(Project).where(Project.id == task.project_id))
    project = project_result.scalar_one_or_none()

    project_source_type = project.source_type if project else None
    logger.info(f"[OpenCode Report Export] Project source type: {project_source_type}")

    # 使用服务层的公共方法查找报告文件
    logger.info(f"[OpenCode Report Export] Starting to find JSON report files...")
    service = OpenCodeSessionService(db)
    report_files = service.find_report_files(
        opencode_session_id=task.opencode_session_id,
        project_id=task.project_id,
        project_source_type=project_source_type,
        extension=".json",
    )

    logger.info(f"[OpenCode Report Export] Found {len(report_files)} JSON report files")
    for i, f in enumerate(report_files):
        logger.info(f"[OpenCode Report Export] JSON file {i + 1}: {f}")

    if not report_files:
        logger.warning(
            f"[OpenCode Report Export] No JSON report files found, returning default content"
        )

        # 创建临时 JSON 文件，返回"无报告"内容
        default_json = {
            "metadata": {
                "export_date": datetime.now(timezone.utc).isoformat(),
                "version": "1.0.0",
                "format": "JSON",
                "status": "no_report_available",
            },
            "task": {
                "id": task_id,
                "status": task.status,
                "created_at": task.created_at.isoformat() if task.created_at else None,
                "started_at": task.started_at.isoformat() if task.started_at else None,
                "project_id": task.project_id,
            },
            "message": "暂无报告生成，请等待审计任务完成后重试。",
            "issues": [],
            "summary": {"total_issues": 0, "critical": 0, "high": 0, "medium": 0, "low": 0},
        }

        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".json", delete=False, encoding="utf-8"
        ) as f:
            json.dump(default_json, f, indent=2, ensure_ascii=False)
            temp_json_path = f.name

        try:
            filename = f"opencode-audit-report-{task_id[:8]}-no-report.json"
            logger.info(f"[OpenCode Report Export] Serving default JSON content: {filename}")
            logger.info(f"[OpenCode Report Export] ========== EXPORT JSON REPORT END ==========")

            # 延迟删除临时文件
            async def delete_temp_file():
                await asyncio.sleep(1)
                try:
                    Path(temp_json_path).unlink(missing_ok=True)
                    logger.info(
                        f"[OpenCode Report Export] Deleted temporary JSON file: {temp_json_path}"
                    )
                except Exception as e:
                    logger.error(
                        f"[OpenCode Report Export] Failed to delete temporary JSON file: {e}"
                    )

            asyncio.create_task(delete_temp_file())
            return FileResponse(
                path=str(temp_json_path), media_type="application/json", filename=filename
            )
        except Exception:
            # 确保临时文件被删除
            try:
                Path(temp_json_path).unlink(missing_ok=True)
            except Exception:
                pass
            raise
    else:
        latest_file = report_files[0]
        logger.info(f"[OpenCode Report Export] Serving latest JSON file: {latest_file}")
        logger.info(f"[OpenCode Report Export] File exists: {latest_file.exists()}")
        logger.info(
            f"[OpenCode Report Export] File size: {latest_file.stat().st_size if latest_file.exists() else 0} bytes"
        )

        filename = f"opencode-audit-report-{task_id[:8]}.json"
        logger.info(f"[OpenCode Report Export] Download filename: {filename}")
        logger.info(f"[OpenCode Report Export] ========== EXPORT JSON REPORT END ==========")

        return FileResponse(path=str(latest_file), media_type="application/json", filename=filename)
