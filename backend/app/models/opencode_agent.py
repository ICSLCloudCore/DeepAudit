"""
DeepAudit x OpenCode 集成 - Agent 模型
"""

import uuid
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, JSON, Integer
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class AgentType:
    SYSTEM = "system"
    CUSTOM = "custom"


class Agent(Base):
    __tablename__ = "agents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False, index=True)
    agent_type = Column(String(50), nullable=False, default=AgentType.CUSTOM)
    version = Column(String(20), default="1.0.0")
    description = Column(Text, nullable=True)
    author = Column(String(255), nullable=True)
    config = Column(JSON, nullable=True)
    tools = Column(JSON, nullable=True)
    is_system = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)

    def __repr__(self):
        return f"<Agent {self.name} ({self.agent_type})>"

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "agent_type": self.agent_type,
            "version": self.version,
            "description": self.description,
            "author": self.author,
            "config": self.config,
            "tools": self.tools,
            "is_system": self.is_system,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "created_by": self.created_by,
        }
