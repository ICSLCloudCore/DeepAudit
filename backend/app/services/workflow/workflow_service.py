import json
from typing import List, Dict, Any, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.orm import selectinload
from datetime import datetime, timezone
from sqlalchemy import or_, and_

from app.models.workflow.workflow import Workflow, WorkflowStageStatus
from app.models.project.project import Project, ProjectType
from app.models.audit.audit_vulnerabilities import AuditVulnerability
from app.models.opencode.opencode_audit_task import OpenCodeAuditTask, OpenCodeAuditTaskStatus
from app.models.agent.agent_task import AgentTask, AgentTaskStatus, AgentFinding
from app.models.opencode.agent import Agent, AgentCategory
from app.models.opencode.opencode_skill_mcp import OpenCodeSkill, SkillCategory
from app.models.knowledge.prompt_template import PromptTemplate
from app.schemas.workflow import (
    WorkflowCreate,
    WorkflowUpdate,
    WorkflowResponse,
    WorkflowDashboardStats,
    WorkflowVulnerabilityStats,
    StageConfigure,
)
from app.services.project.zip_storage import save_project_zip
from app.utils.log import logger
from app.services.opencode.opencode_session_service import OpenCodeSessionService
from app.models.opencode.opencode_session import OpenCodeSession
from app.models.user.user import User
from fastapi import BackgroundTasks


def get_workflow_overall_status(workflow: Workflow) -> str:
    if workflow.white_status == WorkflowStageStatus.NOT_CONFIGURED:
        return "draft"

    if any(
        s == WorkflowStageStatus.RUNNING
        for s in [workflow.analyze_status, workflow.white_status, workflow.black_status]
    ):
        return "in_progress"

    if workflow.white_status == WorkflowStageStatus.COMPLETED:
        return "completed"

    return "ready"


async def create_workflow_with_projects(
    db: AsyncSession,
    workflow_data: WorkflowCreate,
    owner_id: str,
    white_zip_path: Optional[str] = None,
    analyze_zip_path: Optional[str] = None,
    black_zip_path: Optional[str] = None,
) -> Workflow:
    full_name = f"{workflow_data.product_name} {workflow_data.version}"

    workflow = Workflow(
        product_name=workflow_data.product_name,
        product_domain=workflow_data.product_domain,
        version=workflow_data.version,
        audit_type=workflow_data.audit_type,
        validation_mode=workflow_data.validation_mode,
        name=full_name,
        description=workflow_data.description,
        owner_id=owner_id,
    )
    db.add(workflow)
    await db.flush()

    if not workflow_data.analyze_skip and analyze_zip_path:
        analyze_project = Project(
            name=f"{full_name}-威胁分析",
            project_type=ProjectType.ANALYZE,
            source_type="zip",
            owner_id=owner_id,
        )
        db.add(analyze_project)
        await db.flush()

        workflow.analyze_project_id = analyze_project.id
        workflow.analyze_status = WorkflowStageStatus.CONFIGURED
        workflow.analyze_agent_package_id = workflow_data.analyze_agent_package_id
        workflow.analyze_prompt_template_id = workflow_data.analyze_prompt_template_id
    elif workflow_data.analyze_skip:
        workflow.analyze_status = WorkflowStageStatus.SKIPPED

    white_project = Project(
        name=f"{workflow_data.name}-白盒分析",
        project_type=ProjectType.WHITE,
        source_type="zip",
        owner_id=owner_id,
    )
    db.add(white_project)
    await db.flush()

    if white_zip_path:
        await save_project_zip(white_project.id, white_zip_path, "white.zip")

    workflow.white_project_id = white_project.id
    workflow.white_status = WorkflowStageStatus.CONFIGURED
    workflow.white_tech_stack = json.dumps(workflow_data.white_tech_stack)
    workflow.white_agent_package_id = workflow_data.white_agent_package_id
    workflow.white_prompt_template_id = workflow_data.white_prompt_template_id

    if not workflow_data.black_skip and black_zip_path:
        black_project = Project(
            name=f"{workflow_data.name}-黑盒分析",
            project_type=ProjectType.BLACK,
            source_type="zip",
            owner_id=owner_id,
        )
        db.add(black_project)
        await db.flush()

        workflow.black_project_id = black_project.id
        workflow.black_status = WorkflowStageStatus.CONFIGURED
        workflow.black_tech_stack = json.dumps(workflow_data.black_tech_stack or [])
        workflow.black_agent_package_id = workflow_data.black_agent_package_id
        workflow.black_prompt_template_id = workflow_data.black_prompt_template_id
    elif workflow_data.black_skip:
        workflow.black_status = WorkflowStageStatus.SKIPPED

    await db.commit()
    await db.refresh(workflow)

    return workflow


async def get_workflows(
    db: AsyncSession,
    owner_id: str,
    skip: int = 0,
    limit: int = 100,
) -> List[Workflow]:
    result = await db.execute(
        select(Workflow)
        .where(Workflow.owner_id == owner_id)
        .where(Workflow.is_active == True)
        .order_by(Workflow.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    return result.scalars().all()


async def get_workflow_by_id(
    db: AsyncSession,
    workflow_id: str,
    owner_id: str,
) -> Optional[Workflow]:
    result = await db.execute(
        select(Workflow).where(Workflow.id == workflow_id).where(Workflow.owner_id == owner_id)
    )
    return result.scalars().first()


async def update_workflow(
    db: AsyncSession,
    workflow: Workflow,
    update_data: WorkflowUpdate,
) -> Workflow:
    if update_data.name is not None:
        workflow.name = update_data.name
    if update_data.description is not None:
        workflow.description = update_data.description

    if update_data.product_name is not None:
        workflow.product_name = update_data.product_name
    if update_data.product_domain is not None:
        workflow.product_domain = update_data.product_domain
    if update_data.version is not None:
        workflow.version = update_data.version
    if update_data.audit_type is not None:
        workflow.audit_type = update_data.audit_type
    if update_data.validation_mode is not None:
        workflow.validation_mode = update_data.validation_mode

    if update_data.analyze_agent_package_id is not None:
        workflow.analyze_agent_package_id = update_data.analyze_agent_package_id

    if update_data.white_tech_stack is not None:
        workflow.white_tech_stack = json.dumps(update_data.white_tech_stack)
        if workflow.white_status == WorkflowStageStatus.COMPLETED:
            workflow.white_status = WorkflowStageStatus.CONFIGURED
    if update_data.white_agent_package_id is not None:
        workflow.white_agent_package_id = update_data.white_agent_package_id

    if update_data.black_tech_stack is not None:
        workflow.black_tech_stack = json.dumps(update_data.black_tech_stack)
        if workflow.black_status == WorkflowStageStatus.COMPLETED:
            workflow.black_status = WorkflowStageStatus.CONFIGURED
    if update_data.black_agent_package_id is not None:
        workflow.black_agent_package_id = update_data.black_agent_package_id

    workflow.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(workflow)

    return workflow


async def delete_workflow(
    db: AsyncSession,
    workflow: Workflow,
) -> bool:
    if any(
        s == WorkflowStageStatus.RUNNING
        for s in [workflow.analyze_status, workflow.white_status, workflow.black_status]
    ):
        return False

    workflow.is_active = False
    workflow.updated_at = datetime.now(timezone.utc)
    await db.commit()

    return True


async def configure_stage(
    db: AsyncSession,
    workflow: Workflow,
    stage: str,
    config: StageConfigure,
) -> Workflow:
    status_field = f"{stage}_status"
    agent_package_field = f"{stage}_agent_package_id"
    prompt_template_field = f"{stage}_prompt_template_id"

    if stage in ["white", "black"] and config.tech_stack:
        tech_stack_field = f"{stage}_tech_stack"
        setattr(workflow, tech_stack_field, json.dumps(config.tech_stack))

    if config.agent_package_id:
        setattr(workflow, agent_package_field, config.agent_package_id)
    if config.prompt_template_id:
        setattr(workflow, prompt_template_field, config.prompt_template_id)

    current_status = getattr(workflow, status_field)
    if current_status == WorkflowStageStatus.NOT_CONFIGURED:
        setattr(workflow, status_field, WorkflowStageStatus.CONFIGURED)
    elif current_status == WorkflowStageStatus.SKIPPED:
        setattr(workflow, status_field, WorkflowStageStatus.CONFIGURED)

    workflow.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(workflow)

    return workflow


async def start_stage(
    db: AsyncSession,
    workflow: Workflow,
    stage: str,
) -> Workflow:
    status_field = f"{stage}_status"
    started_at_field = f"{stage}_started_at"

    setattr(workflow, status_field, WorkflowStageStatus.RUNNING)
    setattr(workflow, started_at_field, datetime.now(timezone.utc))

    workflow.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(workflow)

    return workflow


async def skip_stage(
    db: AsyncSession,
    workflow: Workflow,
    stage: str,
) -> Workflow:
    if stage not in ["analyze", "black"]:
        raise ValueError("Only analyze and black stages can be skipped")

    status_field = f"{stage}_status"
    setattr(workflow, status_field, WorkflowStageStatus.SKIPPED)

    workflow.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(workflow)

    return workflow


async def unskip_stage(
    db: AsyncSession,
    workflow: Workflow,
    stage: str,
) -> Workflow:
    if stage not in ["analyze", "black"]:
        raise ValueError("Only analyze and black stages can be unskipped")

    status_field = f"{stage}_status"
    current_status = getattr(workflow, status_field)

    if current_status != WorkflowStageStatus.SKIPPED:
        raise ValueError("Stage is not skipped")

    setattr(workflow, status_field, WorkflowStageStatus.NOT_CONFIGURED)

    workflow.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(workflow)

    return workflow


async def get_dashboard_stats(
    db: AsyncSession,
    owner_id: str,
) -> WorkflowDashboardStats:
    result = await db.execute(
        select(Workflow).where(Workflow.owner_id == owner_id).where(Workflow.is_active == True)
    )
    workflows = result.scalars().all()

    total_workflows = len(workflows)

    product_domain_distribution: Dict[str, int] = {}
    white_distribution: Dict[str, int] = {}
    black_distribution: Dict[str, int] = {}
    status_distribution: Dict[str, int] = {}

    total_vulnerabilities = 0

    for wf in workflows:
        overall_status = get_workflow_overall_status(wf)
        status_distribution[overall_status] = status_distribution.get(overall_status, 0) + 1

        if wf.product_domain:
            product_domain_distribution[wf.product_domain] = (
                product_domain_distribution.get(wf.product_domain, 0) + 1
            )

        if wf.white_tech_stack:
            techs = json.loads(wf.white_tech_stack)
            for tech in techs:
                white_distribution[tech] = white_distribution.get(tech, 0) + 1

        if wf.black_tech_stack:
            techs = json.loads(wf.black_tech_stack)
            for tech in techs:
                black_distribution[tech] = black_distribution.get(tech, 0) + 1

        vuln_stats = await get_workflow_vulnerability_stats(db, wf)
        total_vulnerabilities += vuln_stats["vulnerabilities"]["total"]

    return WorkflowDashboardStats(
        total_workflows=total_workflows,
        total_vulnerabilities=total_vulnerabilities,
        product_domain_distribution=product_domain_distribution,
        white_tech_stack_distribution=white_distribution,
        black_tech_stack_distribution=black_distribution,
        status_distribution=status_distribution,
    )
    workflows = result.scalars().all()

    total_workflows = len(workflows)

    analyze_distribution: Dict[str, int] = {}
    white_distribution: Dict[str, int] = {}
    black_distribution: Dict[str, int] = {}
    status_distribution: Dict[str, int] = {}

    total_vulnerabilities = 0

    for wf in workflows:
        overall_status = get_workflow_overall_status(wf)
        status_distribution[overall_status] = status_distribution.get(overall_status, 0) + 1

        if wf.product_domain:
            analyze_distribution[wf.product_domain] = (
                analyze_distribution.get(wf.product_domain, 0) + 1
            )

        if wf.white_tech_stack:
            techs = json.loads(wf.white_tech_stack)
            for tech in techs:
                white_distribution[tech] = white_distribution.get(tech, 0) + 1

        if wf.black_tech_stack:
            techs = json.loads(wf.black_tech_stack)
            for tech in techs:
                black_distribution[tech] = black_distribution.get(tech, 0) + 1

        vuln_stats = await get_workflow_vulnerability_stats(db, wf)
        total_vulnerabilities += vuln_stats["vulnerabilities"]["total"]

    return WorkflowDashboardStats(
        total_workflows=total_workflows,
        total_vulnerabilities=total_vulnerabilities,
        analyze_tech_stack_distribution=analyze_distribution,
        white_tech_stack_distribution=white_distribution,
        black_tech_stack_distribution=black_distribution,
        status_distribution=status_distribution,
    )


async def get_workflow_vulnerability_stats(
    db: AsyncSession,
    workflow: Workflow,
) -> Dict[str, Any]:
    stats = {
        "total": 0,
        "by_severity": {"critical": 0, "high": 0, "medium": 0, "low": 0},
        "by_stage": {"white": 0, "black": 0},
        "by_status": {"open": 0, "resolved": 0, "false_positive": 0},
    }

    stages: Dict[str, Any] = {}

    if workflow.analyze_project_id:
        stages["analyze"] = {
            "status": workflow.analyze_status,
            "project_id": workflow.analyze_project_id,
            "vulnerability_count": 0,
        }
        project_id = workflow.analyze_project_id

        agent_tasks_result = await db.execute(
            select(AgentTask).where(AgentTask.project_id == project_id)
        )
        agent_tasks = agent_tasks_result.scalars().all()

        analyze_count = 0
        for task in agent_tasks:
            findings_result = await db.execute(
                select(AgentFinding).where(AgentFinding.task_id == task.id)
            )
            findings = findings_result.scalars().all()

            analyze_count += len(findings)

        stages["analyze"]["vulnerability_count"] = analyze_count

    if workflow.white_project_id:
        stages["white"] = {
            "status": workflow.white_status,
            "project_id": workflow.white_project_id,
            "vulnerability_count": 0,
        }
        project_id = workflow.white_project_id

        opencode_tasks_result = await db.execute(
            select(OpenCodeAuditTask).where(OpenCodeAuditTask.project_id == project_id)
        )
        opencode_tasks = opencode_tasks_result.scalars().all()

        for task in opencode_tasks:
            vulns_result = await db.execute(
                select(AuditVulnerability).where(AuditVulnerability.task_id == task.id)
            )
            vulns = vulns_result.scalars().all()

            for vuln in vulns:
                stats["total"] += 1
                stats["by_stage"]["white"] += 1
                severity = vuln.severity.lower() if vuln.severity else "medium"
                if severity in stats["by_severity"]:
                    stats["by_severity"][severity] += 1
                status = vuln.status.lower() if vuln.status else "open"
                if status in ["fixed", "resolved", "wont_fix"]:
                    stats["by_status"]["resolved"] += 1
                elif status == "false_positive":
                    stats["by_status"]["false_positive"] += 1
                else:
                    stats["by_status"]["open"] += 1

        stages["white"]["vulnerability_count"] = stats["by_stage"]["white"]

    if workflow.black_project_id:
        stages["black"] = {
            "status": workflow.black_status,
            "project_id": workflow.black_project_id,
            "vulnerability_count": 0,
        }
        project_id = workflow.black_project_id

        agent_tasks_result = await db.execute(
            select(AgentTask).where(AgentTask.project_id == project_id)
        )
        agent_tasks = agent_tasks_result.scalars().all()

        for task in agent_tasks:
            findings_result = await db.execute(
                select(AgentFinding).where(AgentFinding.task_id == task.id)
            )
            findings = findings_result.scalars().all()

            for finding in findings:
                stats["total"] += 1
                stats["by_stage"]["black"] += 1
                severity = finding.severity.lower() if finding.severity else "medium"
                if severity in stats["by_severity"]:
                    stats["by_severity"][severity] += 1
                status = finding.status.lower() if finding.status else "open"
                if status in ["fixed", "wont_fix"]:
                    stats["by_status"]["resolved"] += 1
                elif status == "false_positive":
                    stats["by_status"]["false_positive"] += 1
                else:
                    stats["by_status"]["open"] += 1

        stages["black"]["vulnerability_count"] = stats["by_stage"]["black"]

    return {
        "workflow_id": workflow.id,
        "overall_status": get_workflow_overall_status(workflow),
        "vulnerabilities": stats,
        "stages": stages,
    }


def workflow_to_response(workflow: Workflow, vuln_stats: Optional[Dict] = None) -> WorkflowResponse:
    full_name = f"{workflow.product_name} {workflow.version}"

    return WorkflowResponse(
        id=workflow.id,
        name=workflow.name,
        description=workflow.description,
        owner_id=workflow.owner_id,
        submitted_at=workflow.submitted_at,
        completed_at=workflow.completed_at,
        product_name=workflow.product_name,
        product_domain=workflow.product_domain,
        version=workflow.version,
        audit_type=workflow.audit_type,
        validation_mode=workflow.validation_mode,
        full_name=full_name,
        analyze_status=workflow.analyze_status,
        analyze_project_id=workflow.analyze_project_id,
        analyze_agent_package_id=workflow.analyze_agent_package_id,
        analyze_prompt_template_id=workflow.analyze_prompt_template_id,
        analyze_started_at=workflow.analyze_started_at,
        analyze_completed_at=workflow.analyze_completed_at,
        white_status=workflow.white_status,
        white_project_id=workflow.white_project_id,
        white_tech_stack=json.loads(workflow.white_tech_stack or "[]"),
        white_agent_package_id=workflow.white_agent_package_id,
        white_prompt_template_id=workflow.white_prompt_template_id,
        white_started_at=workflow.white_started_at,
        white_completed_at=workflow.white_completed_at,
        black_status=workflow.black_status,
        black_project_id=workflow.black_project_id,
        black_tech_stack=json.loads(workflow.black_tech_stack or "[]"),
        black_agent_package_id=workflow.black_agent_package_id,
        black_prompt_template_id=workflow.black_prompt_template_id,
        black_started_at=workflow.black_started_at,
        black_completed_at=workflow.black_completed_at,
        created_at=workflow.created_at,
        updated_at=workflow.updated_at,
        is_active=workflow.is_active,
        overall_status=get_workflow_overall_status(workflow),
        total_vulnerabilities=vuln_stats.get("vulnerabilities", {}).get("total", 0)
        if vuln_stats
        else 0,
    )


async def get_available_resources_for_stage(
    db: AsyncSession,
    category: str,
    user_id: str,
) -> Dict[str, Any]:
    valid_categories = ["ANALYZE", "WHITE", "BLACK"]
    if category not in valid_categories:
        raise ValueError(f"Invalid category: {category}")

    agent_packages_result = await db.execute(
        select(Agent)
        .options(selectinload(Agent.package_agents), selectinload(Agent.package_skills))
        .where(
            or_(
                Agent.category == category,
                Agent.category == AgentCategory.OTHER,
            )
        )
        .where(
            or_(
                Agent.is_public == True,
                Agent.created_by == user_id,
            )
        )
        .order_by(Agent.created_at.desc())
    )
    agent_packages = agent_packages_result.scalars().all()

    category_skills_result = await db.execute(
        select(OpenCodeSkill)
        .where(OpenCodeSkill.category == category)
        .where(OpenCodeSkill.is_active == True)
        .where(
            or_(
                OpenCodeSkill.is_public == True,
                OpenCodeSkill.created_by == user_id,
            )
        )
        .order_by(OpenCodeSkill.created_at.desc())
    )
    category_skills = category_skills_result.scalars().all()

    other_skills_result = await db.execute(
        select(OpenCodeSkill)
        .where(OpenCodeSkill.category == "OTHER")
        .where(OpenCodeSkill.is_active == True)
        .where(
            or_(
                OpenCodeSkill.is_public == True,
                OpenCodeSkill.created_by == user_id,
            )
        )
        .order_by(OpenCodeSkill.created_at.desc())
    )
    other_skills = other_skills_result.scalars().all()

    prompts_result = await db.execute(
        select(PromptTemplate)
        .where(PromptTemplate.is_active == True)
        .order_by(PromptTemplate.is_default.desc(), PromptTemplate.sort_order.asc())
    )
    prompt_templates = prompts_result.scalars().all()

    return {
        "agent_packages": [pkg.to_dict() for pkg in agent_packages],
        "category_skills": [skill.to_dict() for skill in category_skills],
        "other_skills": [skill.to_dict() for skill in other_skills],
        "prompt_templates": [
            {
                "id": pt.id,
                "name": pt.name,
                "description": pt.description,
                "template_type": pt.template_type,
                "is_default": pt.is_default,
                "is_system": pt.is_system,
            }
            for pt in prompt_templates
        ],
    }


async def start_stage_audit(
    db: AsyncSession,
    project_id: str,
    agent_package_id: Optional[str],
    prompt_template_id: Optional[str],
    current_user: User,
    background_tasks: BackgroundTasks,
) -> tuple[OpenCodeSession, Any]:
    """复用 OpenCodeSessionService 启动审计"""
    service = OpenCodeSessionService(db)

    agent_package = None
    if agent_package_id:
        result = await db.execute(select(Agent).where(Agent.id == agent_package_id))
        agent_package = result.scalar_one_or_none()

    session, server_status, audit_task = await service.start_audit_with_prompt(
        project_id=project_id,
        prompt_template_id=prompt_template_id,
        prompt_content=None,
        variables=None,
        current_user=current_user,
        agent_package=agent_package,
    )

    return session, audit_task


async def complete_workflow_stage(
    db: AsyncSession,
    workflow: Workflow,
    stage: str,
) -> None:
    """更新阶段状态为完成"""
    setattr(workflow, f"{stage}_status", WorkflowStageStatus.COMPLETED)
    setattr(workflow, f"{stage}_completed_at", datetime.now(timezone.utc))
    workflow.updated_at = datetime.now(timezone.utc)

    check_all_stages_completed(workflow)

    await db.commit()


def check_all_stages_completed(workflow: Workflow) -> None:
    """检查所有阶段是否完成，更新整体状态"""
    stages_to_check = []
    for s in ["analyze", "white", "black"]:
        status = getattr(workflow, f"{s}_status")
        if status != WorkflowStageStatus.SKIPPED:
            stages_to_check.append(s)

    if all(
        getattr(workflow, f"{s}_status") == WorkflowStageStatus.COMPLETED for s in stages_to_check
    ):
        workflow.completed_at = datetime.now(timezone.utc)
