"""
DeepAudit OpenCode 审计任务 API
"""

from typing import Any, List, Optional, Dict
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field
from datetime import datetime, timezone

from app.api import deps
from app.db.session import get_db
from app.models.opencode_audit_task import OpenCodeAuditTask, OpenCodeAuditTaskStatus
from app.models.opencode_finding import (
    OpenCodeFinding,
    OpenCodeFindingStatus,
    OpenCodeManualConfirmationStatus,
)
from app.models.project import Project
from app.models.user import User
from app.services.opencode_report_parser import OpenCodeReportParser

router = APIRouter()


# ============ Schemas ============


class ProjectSchema(BaseModel):
    id: str
    name: str
    description: Optional[str] = None

    class Config:
        from_attributes = True


class OpenCodeFindingResponse(BaseModel):
    """OpenCode发现响应"""

    id: str
    task_id: str
    vuln_id: str

    # 基本信息
    severity: str
    cvss_score: Optional[float] = None
    cvss_vector: Optional[str] = None
    cwe: Optional[str] = None
    confidence: Optional[str] = None
    location: Optional[str] = None
    file_path: Optional[str] = None
    line_start: Optional[int] = None
    line_end: Optional[int] = None
    function_name: Optional[str] = None

    # 漏洞描述
    vulnerability_title: str
    vulnerability_essence: Optional[str] = None
    root_cause: Optional[str] = None
    security_impact: Optional[str] = None

    # 漏洞代码
    vulnerable_code: Optional[str] = None

    # 数据流路径
    dataflow_source: Optional[str] = None
    dataflow_propagation: Optional[Dict[str, Any]] = None
    dataflow_sink: Optional[str] = None
    dataflow_sanitization: Optional[str] = None
    dataflow_conclusion: Optional[str] = None

    # 利用场景
    exploit_steps: Optional[str] = None
    exploit_poc: Optional[str] = None

    # 影响
    impact_confidentiality: Optional[str] = None
    impact_integrity: Optional[str] = None
    impact_availability: Optional[str] = None

    # 修复建议
    fix_description: Optional[str] = None
    fix_code_before: Optional[str] = None
    fix_code_after: Optional[str] = None

    # 人工确认
    manual_confirmation: Optional[str] = None
    manual_confirmation_status: Optional[str] = None
    manual_confirmation_notes: Optional[str] = None
    confirmed_by: Optional[str] = None
    confirmed_at: Optional[datetime] = None

    # 元数据
    status: str
    created_at: datetime
    updated_at: Optional[datetime] = None

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

    # 创建任务
    task = OpenCodeAuditTask(
        project_id=task_data.project_id,
        created_by=current_user.id,
        name=task_data.name,
        description=task_data.description,
        branch_name=task_data.branch_name,
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


# ============ Findings Endpoints ============


@router.get("/{task_id}/findings", response_model=List[OpenCodeFindingResponse])
async def list_opencode_findings(
    task_id: str,
    severity: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    获取OpenCode审计任务的漏洞列表
    """
    # 验证任务存在且有权限
    result = await db.execute(select(OpenCodeAuditTask).where(OpenCodeAuditTask.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权查看此任务")

    # 查询findings
    query = select(OpenCodeFinding).where(OpenCodeFinding.task_id == task_id)
    if severity:
        query = query.where(OpenCodeFinding.severity == severity)
    query = query.order_by(OpenCodeFinding.created_at.desc())

    result = await db.execute(query)
    return result.scalars().all()


@router.get("/{task_id}/findings/{finding_id}", response_model=OpenCodeFindingResponse)
async def get_opencode_finding(
    task_id: str,
    finding_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    获取单个OpenCode漏洞详情
    """
    # 验证任务存在且有权限
    result = await db.execute(select(OpenCodeAuditTask).where(OpenCodeAuditTask.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权查看此任务")

    # 查询finding
    result = await db.execute(
        select(OpenCodeFinding).where(
            OpenCodeFinding.id == finding_id, OpenCodeFinding.task_id == task_id
        )
    )
    finding = result.scalars().first()
    if not finding:
        raise HTTPException(status_code=404, detail="漏洞不存在")

    return finding


class UpdateOpenCodeFindingRequest(BaseModel):
    """更新OpenCode漏洞请求"""

    status: Optional[str] = None


@router.put("/{task_id}/findings/{finding_id}", response_model=OpenCodeFindingResponse)
async def update_opencode_finding(
    task_id: str,
    finding_id: str,
    finding_data: UpdateOpenCodeFindingRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    更新OpenCode漏洞状态
    """
    # 验证任务存在且有权限
    result = await db.execute(select(OpenCodeAuditTask).where(OpenCodeAuditTask.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权更新此任务")

    # 查询finding
    result = await db.execute(
        select(OpenCodeFinding).where(
            OpenCodeFinding.id == finding_id, OpenCodeFinding.task_id == task_id
        )
    )
    finding = result.scalars().first()
    if not finding:
        raise HTTPException(status_code=404, detail="漏洞不存在")

    # 更新
    if finding_data.status is not None:
        finding.status = finding_data.status

    await db.commit()
    await db.refresh(finding)
    return finding


class ManualConfirmRequest(BaseModel):
    """人工确认请求"""

    manual_confirmation_status: str
    manual_confirmation_notes: Optional[str] = None


@router.post("/{task_id}/findings/{finding_id}/confirm", response_model=OpenCodeFindingResponse)
async def confirm_opencode_finding(
    task_id: str,
    finding_id: str,
    confirm_data: ManualConfirmRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    人工确认OpenCode漏洞
    """
    # 验证任务存在且有权限
    result = await db.execute(select(OpenCodeAuditTask).where(OpenCodeAuditTask.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权更新此任务")

    # 查询finding
    result = await db.execute(
        select(OpenCodeFinding).where(
            OpenCodeFinding.id == finding_id, OpenCodeFinding.task_id == task_id
        )
    )
    finding = result.scalars().first()
    if not finding:
        raise HTTPException(status_code=404, detail="漏洞不存在")

    # 更新确认信息
    finding.manual_confirmation_status = confirm_data.manual_confirmation_status
    finding.manual_confirmation_notes = confirm_data.manual_confirmation_notes
    finding.confirmed_by = current_user.id
    finding.confirmed_at = datetime.now(timezone.utc)

    await db.commit()
    await db.refresh(finding)
    return finding


class ParseReportRequest(BaseModel):
    """解析报告请求"""

    reports_directory: str


@router.post("/{task_id}/parse-report")
async def parse_opencode_report(
    task_id: str,
    parse_data: ParseReportRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """
    解析OpenCode审计报告并存储到数据库
    """
    # 验证任务存在且有权限
    result = await db.execute(select(OpenCodeAuditTask).where(OpenCodeAuditTask.id == task_id))
    task = result.scalars().first()
    if not task:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.created_by != current_user.id:
        raise HTTPException(status_code=403, detail="无权操作此任务")

    # 解析报告
    parser = OpenCodeReportParser()
    findings_data = parser.parse_report_directory(parse_data.reports_directory)

    # 存储到数据库
    created_count = 0
    critical_count = 0
    high_count = 0
    medium_count = 0
    low_count = 0

    for finding_data in findings_data:
        finding = OpenCodeFinding(task_id=task_id, **finding_data)
        db.add(finding)
        created_count += 1

        # 统计
        if finding.severity == "critical":
            critical_count += 1
        elif finding.severity == "high":
            high_count += 1
        elif finding.severity == "medium":
            medium_count += 1
        elif finding.severity == "low":
            low_count += 1

    # 更新任务统计
    task.findings_count = created_count
    task.critical_count = critical_count
    task.high_count = high_count
    task.medium_count = medium_count
    task.low_count = low_count

    await db.commit()

    return {
        "message": f"成功解析 {created_count} 个漏洞",
        "task_id": task_id,
        "findings_count": created_count,
        "critical_count": critical_count,
        "high_count": high_count,
        "medium_count": medium_count,
        "low_count": low_count,
    }
