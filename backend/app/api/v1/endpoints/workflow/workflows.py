from typing import Any, List
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
import json
import os
import uuid
import shutil

from app.api import deps
from app.db.session import get_db
from app.models.user.user import User
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    WorkflowDashboardStats,
    WorkflowVulnerabilityStats,
    StageConfigure,
    WorkflowListResponse,
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
    name: str = Form(...),
    description: str = Form(None),
    analyze_skip: bool = Form(False),
    analyze_tech_stack: str = Form(None),
    analyze_agents: str = Form(None),
    white_zip: UploadFile = File(...),
    white_tech_stack: str = Form(...),
    white_agents: str = Form(...),
    black_skip: bool = Form(False),
    black_tech_stack: str = Form(None),
    black_agents: str = Form(None),
    black_zip: UploadFile = File(None),
    analyze_zip: UploadFile = File(None),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    workflow_data = WorkflowCreate(
        name=name,
        description=description,
        analyze_skip=analyze_skip,
        analyze_tech_stack=json.loads(analyze_tech_stack or "[]"),
        analyze_agents=json.loads(analyze_agents or "[]"),
        white_tech_stack=json.loads(white_tech_stack),
        white_agents=json.loads(white_agents),
        black_skip=black_skip,
        black_tech_stack=json.loads(black_tech_stack or "[]"),
        black_agents=json.loads(black_agents or "[]"),
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
