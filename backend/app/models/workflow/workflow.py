import uuid
from enum import Enum
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class WorkflowStageStatus(str, Enum):
    NOT_CONFIGURED = "not_configured"
    CONFIGURED = "configured"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"
    CANCELLED = "cancelled"


class Workflow(Base):
    __tablename__ = "workflows"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    owner_id = Column(String, ForeignKey("users.id"), nullable=False)

    submitted_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    analyze_status = Column(String(20), default=WorkflowStageStatus.NOT_CONFIGURED)
    analyze_project_id = Column(String, nullable=True)
    analyze_tech_stack = Column(Text, nullable=True)
    analyze_agent_package_id = Column(String, nullable=True)
    analyze_prompt_template_id = Column(String, nullable=True)
    analyze_started_at = Column(DateTime(timezone=True), nullable=True)
    analyze_completed_at = Column(DateTime(timezone=True), nullable=True)

    white_status = Column(String(20), default=WorkflowStageStatus.NOT_CONFIGURED)
    white_project_id = Column(String, ForeignKey("projects.id"), nullable=True)
    white_tech_stack = Column(Text, nullable=True)
    white_agent_package_id = Column(String, nullable=True)
    white_prompt_template_id = Column(String, nullable=True)
    white_started_at = Column(DateTime(timezone=True), nullable=True)
    white_completed_at = Column(DateTime(timezone=True), nullable=True)

    black_status = Column(String(20), default=WorkflowStageStatus.NOT_CONFIGURED)
    black_project_id = Column(String, nullable=True)
    black_tech_stack = Column(Text, nullable=True)
    black_agent_package_id = Column(String, nullable=True)
    black_prompt_template_id = Column(String, nullable=True)
    black_started_at = Column(DateTime(timezone=True), nullable=True)
    black_completed_at = Column(DateTime(timezone=True), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    is_active = Column(Boolean, default=True)

    owner = relationship("User", backref="workflows")
    white_project = relationship("Project", foreign_keys=[white_project_id])
