from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel


class WorkflowStageStatusBase(str):
    NOT_CONFIGURED = "not_configured"
    CONFIGURED = "configured"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class WorkflowBase(BaseModel):
    name: str
    description: Optional[str] = None


class WorkflowCreate(WorkflowBase):
    analyze_skip: Optional[bool] = False
    analyze_tech_stack: Optional[List[str]] = None
    analyze_agent_package_id: Optional[str] = None
    analyze_prompt_template_id: Optional[str] = None

    white_tech_stack: List[str]
    white_agent_package_id: Optional[str] = None
    white_prompt_template_id: Optional[str] = None

    black_skip: Optional[bool] = False
    black_tech_stack: Optional[List[str]] = None
    black_agent_package_id: Optional[str] = None
    black_prompt_template_id: Optional[str] = None


class WorkflowUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None

    analyze_tech_stack: Optional[List[str]] = None
    analyze_agent_package_id: Optional[str] = None

    white_tech_stack: Optional[List[str]] = None
    white_agent_package_id: Optional[str] = None

    black_tech_stack: Optional[List[str]] = None
    black_agent_package_id: Optional[str] = None


class StageConfigure(BaseModel):
    tech_stack: List[str]
    agent_package_id: Optional[str] = None
    prompt_template_id: Optional[str] = None


class AvailableResourcesResponse(BaseModel):
    agent_packages: List[Dict[str, Any]]
    category_skills: List[Dict[str, Any]]
    other_skills: List[Dict[str, Any]]
    prompt_templates: List[Dict[str, Any]]


class WorkflowResponse(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    owner_id: str

    submitted_at: datetime
    completed_at: Optional[datetime] = None

    analyze_status: str
    analyze_project_id: Optional[str] = None
    analyze_tech_stack: Optional[List[str]] = None
    analyze_agent_package_id: Optional[str] = None
    analyze_prompt_template_id: Optional[str] = None
    analyze_started_at: Optional[datetime] = None
    analyze_completed_at: Optional[datetime] = None

    white_status: str
    white_project_id: Optional[str] = None
    white_tech_stack: Optional[List[str]] = None
    white_agent_package_id: Optional[str] = None
    white_prompt_template_id: Optional[str] = None
    white_started_at: Optional[datetime] = None
    white_completed_at: Optional[datetime] = None

    black_status: str
    black_project_id: Optional[str] = None
    black_tech_stack: Optional[List[str]] = None
    black_agent_package_id: Optional[str] = None
    black_prompt_template_id: Optional[str] = None
    black_started_at: Optional[datetime] = None
    black_completed_at: Optional[datetime] = None

    created_at: datetime
    updated_at: Optional[datetime] = None
    is_active: bool

    overall_status: Optional[str] = None
    total_vulnerabilities: Optional[int] = 0

    class Config:
        from_attributes = True


class WorkflowDashboardStats(BaseModel):
    total_workflows: int
    total_vulnerabilities: int
    analyze_tech_stack_distribution: Dict[str, int]
    white_tech_stack_distribution: Dict[str, int]
    black_tech_stack_distribution: Dict[str, int]
    status_distribution: Dict[str, int]


class WorkflowVulnerabilityStats(BaseModel):
    workflow_id: str
    overall_status: str
    vulnerabilities: Dict[str, Any]
    stages: Dict[str, Any]


class WorkflowListResponse(BaseModel):
    workflows: List[WorkflowResponse]
    total: int
