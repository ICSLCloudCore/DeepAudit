"""
DeepAudit x OpenCode 集成 - 项目配置和任务执行模型
"""

import uuid
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, JSON
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class ProjectConfig(Base):
    __tablename__ = "project_configs"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(
        String(36),
        ForeignKey("projects.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    selected_agents = Column(JSON, nullable=True)
    selected_skills = Column(JSON, nullable=True)
    selected_mcps = Column(JSON, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    project = relationship("Project", backref="project_config")

    def __repr__(self):
        return f"<ProjectConfig project_id={self.project_id}>"

    def to_dict(self):
        return {
            "id": self.id,
            "project_id": self.project_id,
            "selected_agents": self.selected_agents,
            "selected_skills": self.selected_skills,
            "selected_mcps": self.selected_mcps,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


class OpenCodeStatus:
    PENDING = "pending"
    CREATING = "creating"
    RUNNING = "running"
    CLEANUP = "cleanup"
    COMPLETED = "completed"


class TaskExecution(Base):
    __tablename__ = "task_executions"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = Column(
        String(36),
        ForeignKey("agent_tasks.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    opencode_process_id = Column(String(36), nullable=True)
    opencode_status = Column(String(20), default=OpenCodeStatus.PENDING, index=True)
    process_info = Column(JSON, nullable=True)

    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    task = relationship("AgentTask", backref="task_execution")

    def __repr__(self):
        return f"<TaskExecution task_id={self.task_id} status={self.opencode_status}>"

    def to_dict(self):
        return {
            "id": self.id,
            "task_id": self.task_id,
            "opencode_process_id": self.opencode_process_id,
            "opencode_status": self.opencode_status,
            "process_info": self.process_info,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
