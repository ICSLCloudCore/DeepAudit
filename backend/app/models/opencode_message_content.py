"""
OpenCode消息内容数据模型
用于存储OpenCode会话中的消息文本内容
"""

import uuid
from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base
import enum


class OpenCodeMessageContentType(str, enum.Enum):
    """消息内容类型枚举"""

    RESPONSE = "response"
    REASONING = "reasoning"


class OpenCodeMessageContent(Base):
    """OpenCode消息内容表"""

    __tablename__ = "opencode_message_contents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(
        String, ForeignKey("opencode_sessions.id", ondelete="CASCADE"), nullable=False
    )

    message_index = Column(Integer, nullable=False)
    content_type = Column(String, nullable=False)
    text_content = Column(Text, nullable=False)

    created_at = Column(DateTime(timezone=True), server_default=func.now())

    session = relationship("OpenCodeSession", backref="message_contents", foreign_keys=[session_id])