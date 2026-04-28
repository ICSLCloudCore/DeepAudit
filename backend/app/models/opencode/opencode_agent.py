"""
OpenCodeAgent 模型 - opencode_agents 表
"""

import uuid
from sqlalchemy import Column, String, DateTime, ForeignKey, Text
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class OpenCodeAgent(Base):
    __tablename__ = "opencode_agents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_package_id = Column(String(36), ForeignKey("agents.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_content = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系 - 关联到 Agent 包
    agent_package = relationship("Agent", back_populates="package_agents")

    def to_dict(self):
        return {
            "id": self.id,
            "agent_package_id": self.agent_package_id,
            "name": self.name,
            "file_name": self.file_name,
            "file_path": self.file_path,
            "file_content": self.file_content,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
