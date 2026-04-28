"""
Agent 模型 - Agents 表
"""

import uuid
from sqlalchemy import Column, String, Boolean, DateTime, ForeignKey, Text, Integer
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class Agent(Base):
    __tablename__ = "agents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False, index=True)
    author = Column(String(255), nullable=True)
    version = Column(String(20), default="1.0.0")
    description = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)

    # Agent 包管理相关字段
    original_filename = Column(String(255), nullable=True)
    package_file_path = Column(String(500), nullable=True)
    extracted_dir_path = Column(String(500), nullable=True)
    agents_md_content = Column(Text, nullable=True)
    agents_count = Column(Integer, default=0)
    skills_count = Column(Integer, default=0)
    is_public = Column(Boolean, default=False)

    # 关系 - 关联到 OpenCodeAgent（包内的 Agents）
    package_agents = relationship(
        "OpenCodeAgent", back_populates="agent_package", cascade="all, delete-orphan"
    )
    # 关系 - 关联到 OpenCodeSkill（包内的 Skills）
    package_skills = relationship("OpenCodeSkill", back_populates="agent_package")

    def __repr__(self):
        return f"&lt;Agent {self.name}&gt;"

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "author": self.author,
            "version": self.version,
            "description": self.description,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "created_by": self.created_by,
            "original_filename": self.original_filename,
            "package_file_path": self.package_file_path,
            "extracted_dir_path": self.extracted_dir_path,
            "agents_md_content": self.agents_md_content,
            "agents_count": self.agents_count,
            "skills_count": self.skills_count,
            "is_public": self.is_public,
            "package_agents": [a.to_dict() for a in self.package_agents]
            if self.package_agents
            else [],
            "package_skills": [s.to_dict() for s in self.package_skills]
            if self.package_skills
            else [],
        }
