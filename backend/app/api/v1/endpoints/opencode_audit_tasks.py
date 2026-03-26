"""
DeepAudit OpenCode 审计任务 API
"""

import json
import os
from typing import Any, List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from sqlalchemy import func
from pydantic import BaseModel, Field
from datetime import datetime, timezone
from uuid import uuid4

from app.api import deps
from app.db.session import get_db
from app.models.opencode_audit_task import OpenCodeAuditTask, OpenCodeAuditTaskStatus
from app.models.project import Project
from app.models.user import User
from app.models.audit_vulnerabilities import AuditVulnerability
from app.services.opencode_session_service import OpenCodeSessionService

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
    processed_files: Optional[int] = None
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
    return result.scalars().all()


@router.post("/", response_model=OpenCodeAuditTaskResponse)
async def create_opencode_audit_task(
    task_data: CreateOpenCodeAuditTaskRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    创建OpenCode审计任务
    """
    # 验证项目存在且属于当前用户
    project_result = await db.execute(
        select(Project).where(
            Project.id == task_data.project_id, Project.owner_id == current_user.id
        )
    )
    project = project_result.scalars().first()
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
    await db.refresh(task)
    return task


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
    if status_data.processed_files is not None:
        task.processed_files = status_data.processed_files
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
    await db.refresh(task)
    return task


@router.post("/{task_id}/cancel")
async def cancel_opencode_audit_task(
    task_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    取消OpenCode审计任务
    """
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
    result = await db.execute(select(OpenCodeAuditTask).where(OpenCodeAuditTask.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")

    # 检查权限
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权删除此任务")

    await db.delete(task)
    await db.commit()

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
            raise HTTPException(status_code=400, detail=f"读取报告文件失败: {str(e)}")

    if not report_data:
        raise HTTPException(status_code=400, detail="报告数据不能为空")

    # 解析漏洞数据
    vulnerabilities = report_data.get("vulnerabilities", [])
    if not vulnerabilities:
        return {"message": "报告中没有漏洞数据", "imported_count": 0}

    # 批量导入漏洞
    imported_count = 0
    for vuln_data in vulnerabilities:
        try:
            vuln = AuditVulnerability(
                id=str(uuid4()),
                task_id=task_id,
                vuln_id=vuln_data.get("vuln_id", f"VULN-{imported_count + 1:03d}"),
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
                manual_confirmation_status=vuln_data.get("manual_confirmation_status", "待确认"),
                manual_confirmation_notes=vuln_data.get("manual_confirmation_notes"),
                confirmed_by=vuln_data.get("confirmed_by"),
                confirmed_at=vuln_data.get("confirmed_at"),
                status=vuln_data.get("status", "new"),
            )
            db.add(vuln)
            imported_count += 1
        except Exception as e:
            continue  # 跳过解析失败的漏洞

    await db.commit()

    # 更新任务的漏洞统计
    if imported_count > 0:
        task.findings_count = imported_count

        # 统计各严重程度数量
        severity_summary = report_data.get("severity_summary", {})
        task.critical_count = severity_summary.get("致命", 0) + severity_summary.get("critical", 0)
        task.high_count = severity_summary.get("严重", 0) + severity_summary.get("high", 0)
        task.medium_count = severity_summary.get("一般", 0) + severity_summary.get("medium", 0)
        task.low_count = (
            severity_summary.get("提示", 0)
            + severity_summary.get("low", 0)
            + severity_summary.get("info", 0)
        )

        await db.commit()

    return {
        "message": f"成功导入 {imported_count} 个漏洞",
        "imported_count": imported_count,
        "total_in_report": len(vulnerabilities),
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

    return {
        "message": "状态已更新",
        "vuln_id": vuln_id,
        "status": vuln.status,
        "manual_confirmation_status": vuln.manual_confirmation_status,
    }
