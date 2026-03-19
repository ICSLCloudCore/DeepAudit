"""
OpenCode交互记录数据模型
"""

import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base
import enum


class OpenCodeInteractionType(str, enum.Enum):
    """交互类型枚举"""

    REQUEST = "request"
    RESPONSE = "response"
    ERROR = "error"


class OpenCodeInteraction(Base):
    """OpenCode交互记录表"""

    __tablename__ = "opencode_interactions"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(
        String, ForeignKey("opencode_sessions.id", ondelete="CASCADE"), nullable=False
    )

    interaction_type = Column(String, nullable=False)
    endpoint = Column(String(255), nullable=False)
    http_method = Column(String(10), nullable=False)

    request_timestamp = Column(DateTime(timezone=True), nullable=False)
    response_timestamp = Column(DateTime(timezone=True), nullable=True)
    duration_ms = Column(Integer, nullable=True)

    request_payload = Column(Text, nullable=True)
    response_payload = Column(Text, nullable=True)
    http_status_code = Column(Integer, nullable=True)

    error_message = Column(Text, nullable=True)
    error_type = Column(String(100), nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    session = relationship("OpenCodeSession", backref="interactions", foreign_keys=[session_id])
