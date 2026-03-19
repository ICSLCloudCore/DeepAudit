"""
OpenCode会话数据模型
"""

import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base
import enum


class OpenCodeSessionStatus(str, enum.Enum):
    """会话状态枚举"""

    ACTIVE = "active"
    CLOSED = "closed"
    ERROR = "error"
    PENDING = "pending"


class OpenCodeSession(Base):
    """OpenCode会话表"""

    __tablename__ = "opencode_sessions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String, ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)

    status = Column(String, default=OpenCodeSessionStatus.ACTIVE, nullable=False)

    prompt_template_id = Column(String, ForeignKey("prompt_templates.id"), nullable=True)
    prompt_content = Column(Text, nullable=False)

    response_content = Column(Text, default="", nullable=False)

    started_at = Column(DateTime(timezone=True), server_default=func.now())
    completed_at = Column(DateTime(timezone=True), nullable=True)

    created_by = Column(String, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    project = relationship("Project", backref="opencode_sessions", foreign_keys=[project_id])
    prompt_template = relationship("PromptTemplate")
    creator = relationship("User", foreign_keys=[created_by])
