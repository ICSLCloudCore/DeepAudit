from typing import Any, List
from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    UploadFile,
    File,
    Form,
    Query,
    BackgroundTasks,
)
from sqlalchemy.ext.asyncio import AsyncSession
import json
import os
import uuid
import shutil

from app.api import deps
from app.db.session import get_db
from app.models.user.user import User
from app.models.workflow.workflow import WorkflowStageStatus
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    WorkflowDashboardStats,
    WorkflowVulnerabilityStats,
    StageConfigure,
    WorkflowListResponse,
    AvailableResourcesResponse,
)
from app.services.workflow.workflow_service import (
    create_workflow_with_projects,
    get_workflows,
    get_workflow_by_id,
    update_workflow,
    delete_workflow,
    configure_stage,
    start_stage,
    skip_stage,
    unskip_stage,
    get_dashboard_stats,
    get_workflow_vulnerability_stats,
    workflow_to_response,
    get_available_resources_for_stage,
    start_stage_audit,
    complete_workflow_stage,
)
from app.utils.log import logger

router = APIRouter()


@router.get("/", response_model=WorkflowListResponse)
async def list_workflows(
    db: AsyncSession = Depends(get_db),
    skip: int = 0,
    limit: int = 100,
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    workflows = await get_workflows(db, current_user.id, skip, limit)

    workflow_responses = []
    for wf in workflows:
        vuln_stats = await get_workflow_vulnerability_stats(db, wf)
        workflow_responses.append(workflow_to_response(wf, vuln_stats))

    return WorkflowListResponse(
        workflows=workflow_responses,
        total=len(workflow_responses),
    )


@router.post("/", response_model=WorkflowResponse)
async def create_workflow(
    db: AsyncSession = Depends(get_db),
    product_name: str = Form(...),
    product_domain: str = Form(...),
    version: str = Form(...),
    audit_type: str = Form(...),
    validation_mode: str = Form(...),
    description: str = Form(None),
    analyze_skip: bool = Form(False),
    analyze_agent_package_id: str = Form(None),
    analyze_prompt_template_id: str = Form(None),
    white_zip: UploadFile = File(...),
    white_tech_stack: str = Form(...),
    white_agent_package_id: str = Form(None),
    white_prompt_template_id: str = Form(None),
    black_skip: bool = Form(False),
    black_tech_stack: str = Form(None),
    black_agent_package_id: str = Form(None),
    black_prompt_template_id: str = Form(None),
    black_zip: UploadFile = File(None),
    analyze_zip: UploadFile = File(None),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    workflow_data = WorkflowCreate(
        product_name=product_name,
        product_domain=product_domain,
        version=version,
        audit_type=audit_type,
        validation_mode=validation_mode,
        description=description,
        analyze_skip=analyze_skip,
        analyze_agent_package_id=analyze_agent_package_id,
        analyze_prompt_template_id=analyze_prompt_template_id,
        white_tech_stack=json.loads(white_tech_stack),
        white_agent_package_id=white_agent_package_id,
        white_prompt_template_id=white_prompt_template_id,
        black_skip=black_skip,
        black_tech_stack=json.loads(black_tech_stack or "[]"),
        black_agent_package_id=black_agent_package_id,
        black_prompt_template_id=black_prompt_template_id,
    )

    white_temp_path = None
    analyze_temp_path = None
    black_temp_path = None

    try:
        temp_file_id = str(uuid.uuid4())

        if white_zip:
            white_temp_path = f"/tmp/{temp_file_id}_white.zip"
            with open(white_temp_path, "wb") as buffer:
                shutil.copyfileobj(white_zip.file, buffer)

        if analyze_zip:
            analyze_temp_path = f"/tmp/{temp_file_id}_analyze.zip"
            with open(analyze_temp_path, "wb") as buffer:
                shutil.copyfileobj(analyze_zip.file, buffer)

        if black_zip:
            black_temp_path = f"/tmp/{temp_file_id}_black.zip"
            with open(black_temp_path, "wb") as buffer:
                shutil.copyfileobj(black_zip.file, buffer)

        workflow = await create_workflow_with_projects(
            db,
            workflow_data,
            current_user.id,
            white_temp_path,
            analyze_temp_path,
            black_temp_path,
        )

        vuln_stats = await get_workflow_vulnerability_stats(db, workflow)
        return workflow_to_response(workflow, vuln_stats)

    finally:
        for path in [white_temp_path, analyze_temp_path, black_temp_path]:
            if path and os.path.exists(path):
                os.remove(path)


@router.get("/stats", response_model=WorkflowDashboardStats)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    return await get_dashboard_stats(db, current_user.id)


@router.get("/available-resources", response_model=AvailableResourcesResponse)
async def get_available_resources(
    category: str = Query(..., description="阶段类型: ANALYZE/WHITE/BLACK"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    if category not in ["ANALYZE", "WHITE", "BLACK"]:
        raise HTTPException(status_code=400, detail="无效的阶段类型，必须是 ANALYZE/WHITE/BLACK")

    return await get_available_resources_for_stage(db, category, current_user.id)


@router.get("/{id}", response_model=WorkflowResponse)
async def get_workflow(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    workflow = await get_workflow_by_id(db, id, current_user.id)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")

    vuln_stats = await get_workflow_vulnerability_stats(db, workflow)
    return workflow_to_response(workflow, vuln_stats)


@router.put("/{id}", response_model=WorkflowResponse)
async def update_workflow_endpoint(
    id: str,
    workflow_in: WorkflowUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    workflow = await get_workflow_by_id(db, id, current_user.id)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")

    updated_workflow = await update_workflow(db, workflow, workflow_in)
    vuln_stats = await get_workflow_vulnerability_stats(db, updated_workflow)
    return workflow_to_response(updated_workflow, vuln_stats)


@router.delete("/{id}")
async def delete_workflow_endpoint(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    workflow = await get_workflow_by_id(db, id, current_user.id)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")

    success = await delete_workflow(db, workflow)
    if not success:
        raise HTTPException(status_code=400, detail="执行中的工作流禁止删除")

    return {"message": "工作流已删除"}


@router.get("/{id}/stats", response_model=WorkflowVulnerabilityStats)
async def get_workflow_stats(
    id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    workflow = await get_workflow_by_id(db, id, current_user.id)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")

    return await get_workflow_vulnerability_stats(db, workflow)


@router.post("/{id}/start/{stage}")
async def start_workflow_stage(
    id: str,
    stage: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    if stage not in ["analyze", "white", "black"]:
        raise HTTPException(status_code=400, detail="无效的阶段名称")

    workflow = await get_workflow_by_id(db, id, current_user.id)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")

    status_field = f"{stage}_status"
    current_status = getattr(workflow, status_field)

    if current_status == "skipped":
        raise HTTPException(status_code=400, detail="已跳过的阶段不可启动，请先取消跳过状态")

    if current_status == "running":
        raise HTTPException(status_code=400, detail="阶段正在运行中")

    if current_status == "not_configured":
        raise HTTPException(status_code=400, detail="阶段未配置，请先补充参数")

    updated_workflow = await start_stage(db, workflow, stage)
    vuln_stats = await get_workflow_vulnerability_stats(db, updated_workflow)

    return {
        "message": f"{stage}阶段已启动",
        "workflow": workflow_to_response(updated_workflow, vuln_stats),
    }


@router.post("/{id}/configure/{stage}")
async def configure_workflow_stage(
    id: str,
    stage: str,
    config: StageConfigure,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    if stage not in ["analyze", "white", "black"]:
        raise HTTPException(status_code=400, detail="无效的阶段名称")

    workflow = await get_workflow_by_id(db, id, current_user.id)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")

    updated_workflow = await configure_stage(db, workflow, stage, config)
    vuln_stats = await get_workflow_vulnerability_stats(db, updated_workflow)

    return workflow_to_response(updated_workflow, vuln_stats)


@router.post("/{id}/skip/{stage}")
async def skip_workflow_stage(
    id: str,
    stage: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    if stage not in ["analyze", "black"]:
        raise HTTPException(status_code=400, detail="仅威胁分析和黑盒分析阶段可跳过")

    workflow = await get_workflow_by_id(db, id, current_user.id)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")

    status_field = f"{stage}_status"
    current_status = getattr(workflow, status_field)

    if current_status == "running":
        raise HTTPException(status_code=400, detail="运行中的阶段不可跳过")

    updated_workflow = await skip_stage(db, workflow, stage)
    vuln_stats = await get_workflow_vulnerability_stats(db, updated_workflow)

    return workflow_to_response(updated_workflow, vuln_stats)


@router.post("/{id}/unskip/{stage}")
async def unskip_workflow_stage(
    id: str,
    stage: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    if stage not in ["analyze", "black"]:
        raise HTTPException(status_code=400, detail="仅威胁分析和黑盒分析阶段可取消跳过")

    workflow = await get_workflow_by_id(db, id, current_user.id)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")

    status_field = f"{stage}_status"
    current_status = getattr(workflow, status_field)

    if current_status != "skipped":
        raise HTTPException(status_code=400, detail="阶段未被跳过")

    updated_workflow = await unskip_stage(db, workflow, stage)
    vuln_stats = await get_workflow_vulnerability_stats(db, updated_workflow)

    return workflow_to_response(updated_workflow, vuln_stats)


@router.post("/{id}/start-audit/{stage}")
async def start_workflow_stage_audit(
    id: str,
    stage: str,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """一键启动工作流阶段审计（使用已配置的参数）"""
    from datetime import datetime, timezone

    if stage not in ["analyze", "white", "black"]:
        raise HTTPException(status_code=400, detail="无效的阶段名称")

    workflow = await get_workflow_by_id(db, id, current_user.id)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")

    stage_status = getattr(workflow, f"{stage}_status")

    if stage_status == WorkflowStageStatus.SKIPPED:
        raise HTTPException(status_code=400, detail="已跳过的阶段不可启动")
    if stage_status == WorkflowStageStatus.RUNNING:
        raise HTTPException(status_code=400, detail="阶段正在运行中")
    if stage_status not in [
        WorkflowStageStatus.CONFIGURED,
        WorkflowStageStatus.COMPLETED,
        WorkflowStageStatus.CANCELLED,
        WorkflowStageStatus.FAILED,
    ]:
        raise HTTPException(status_code=400, detail="阶段未配置，请先补充参数")

    project_id = getattr(workflow, f"{stage}_project_id")
    agent_package_id = getattr(workflow, f"{stage}_agent_package_id")
    prompt_template_id = getattr(workflow, f"{stage}_prompt_template_id")

    if not project_id:
        raise HTTPException(status_code=400, detail="阶段未配置项目")

    try:
        session, audit_task = await start_stage_audit(
            db, project_id, agent_package_id, prompt_template_id, current_user, background_tasks
        )

        setattr(workflow, f"{stage}_status", WorkflowStageStatus.RUNNING)
        setattr(workflow, f"{stage}_started_at", datetime.now(timezone.utc))
        workflow.updated_at = datetime.now(timezone.utc)
        await db.commit()

        return {
            "message": f"{stage}阶段审计已启动",
            "session_id": session.id,
            "task_id": audit_task.id,
            "project_id": project_id,
        }
    except Exception as e:
        logger.error(f"Failed to start audit for workflow {id} stage {stage}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/{id}/complete-stage/{stage}")
async def complete_workflow_stage_endpoint(
    id: str,
    stage: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """前端检测到任务完成后，更新阶段状态"""
    if stage not in ["analyze", "white", "black"]:
        raise HTTPException(status_code=400, detail="无效的阶段名称")

    workflow = await get_workflow_by_id(db, id, current_user.id)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")

    stage_status = getattr(workflow, f"{stage}_status")

    if stage_status != WorkflowStageStatus.RUNNING:
        return {"message": "阶段状态无需更新"}

    await complete_workflow_stage(db, workflow, stage)

    return {"message": f"{stage}阶段已完成"}


@router.post("/{id}/update-stage-status/{stage}")
async def update_workflow_stage_status(
    id: str,
    stage: str,
    task_status: str = Query(
        ..., description="任务状态: pending/running/completed/failed/cancelled"
    ),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """前端同步任务状态到工作流阶段"""
    from datetime import datetime, timezone
    from app.services.workflow.workflow_service import check_all_stages_completed

    if stage not in ["analyze", "white", "black"]:
        raise HTTPException(status_code=400, detail="无效的阶段名称")

    workflow = await get_workflow_by_id(db, id, current_user.id)
    if not workflow:
        raise HTTPException(status_code=404, detail="工作流不存在")

    status_map = {
        "pending": WorkflowStageStatus.RUNNING,
        "running": WorkflowStageStatus.RUNNING,
        "completed": WorkflowStageStatus.COMPLETED,
        "failed": WorkflowStageStatus.FAILED,
        "cancelled": WorkflowStageStatus.CANCELLED,
    }

    new_status = status_map.get(task_status)
    if not new_status:
        raise HTTPException(status_code=400, detail="无效的任务状态")

    setattr(workflow, f"{stage}_status", new_status)

    if new_status == WorkflowStageStatus.COMPLETED:
        setattr(workflow, f"{stage}_completed_at", datetime.now(timezone.utc))
        check_all_stages_completed(workflow)

    workflow.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return {"message": "状态已更新", "stage": stage, "status": new_status}
