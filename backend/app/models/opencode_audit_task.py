"""
OpenCode审计任务模型
模仿AuditTask和AgentTask的设计
支持OpenCode审计任务的持久化存储
"""

import uuid
from typing import Optional, TYPE_CHECKING
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base

if TYPE_CHECKING:
    from .project import Project
    from .user import User


class OpenCodeAuditTaskStatus:
    """OpenCode审计任务状态（参考AgentTaskStatus）"""

    PENDING = "pending"  # 等待执行
    RUNNING = "running"  # 运行中
    COMPLETED = "completed"  # 已完成
    FAILED = "failed"  # 失败
    CANCELLED = "cancelled"  # 已取消


class OpenCodeAuditTask(Base):
    """OpenCode审计任务
    结合AuditTask和AgentTask的设计特点
    """

    __tablename__ = "opencode_audit_tasks"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)

    # 任务基本信息（参考AuditTask）
    name = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    task_type = Column(String(50), default="opencode_audit")

    # 分支信息（参考AgentTask）
    branch_name = Column(String(255), nullable=True)

    # OpenCode相关
    opencode_session_id = Column(String(36), nullable=True)
    opencode_prompt_template_id = Column(
        String(36), ForeignKey("prompt_templates.id"), nullable=True
    )
    prompt_content = Column(Text, nullable=True)
    opencode_message_id = Column(
        String(255), nullable=True, index=True, doc="OpenCode Server 端的消息 ID (msg_xxx)"
    )

    # 任务配置
    audit_config = Column(JSON, nullable=True)
    target_files = Column(JSON, nullable=True)
    exclude_patterns = Column(JSON, nullable=True)

    # 状态
    status = Column(String(20), default=OpenCodeAuditTaskStatus.PENDING)
    current_step = Column(String(255), nullable=True)
    error_message = Column(Text, nullable=True)

    # 进度统计（参考AuditTask）
    total_files = Column(Integer, default=0)
    processed_files = Column(Integer, default=0)  # 类似scanned_files
    total_lines = Column(Integer, default=0)
    findings_count = Column(Integer, default=0)  # 类似issues_count

    # 严重程度统计（参考AgentTask）
    critical_count = Column(Integer, default=0)
    high_count = Column(Integer, default=0)
    medium_count = Column(Integer, default=0)
    low_count = Column(Integer, default=0)

    # 质量评分（参考AuditTask）
    quality_score = Column(Float, default=0.0)
    security_score = Column(Float, default=0.0)

    # 结果
    result_summary = Column(Text, nullable=True)
    findings = Column(JSON, nullable=True)

    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)

    # 关联关系
    project = relationship("Project", back_populates="opencode_audit_tasks")
    creator = relationship("User")

    def __repr__(self):
        return f"<OpenCodeAuditTask {self.id} - {self.status}>"

    @property
    def progress_percentage(self) -> float:
        """计算进度百分比（参考AgentTask）"""
        if self.status == OpenCodeAuditTaskStatus.COMPLETED:
            return 100.0
        if self.status in [OpenCodeAuditTaskStatus.FAILED, OpenCodeAuditTaskStatus.CANCELLED]:
            return 0.0
        if self.total_files > 0:
            return min((self.processed_files / self.total_files) * 100, 99.0)
        return 0.0
