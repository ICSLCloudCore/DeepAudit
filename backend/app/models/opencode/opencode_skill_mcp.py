"""
DeepAudit x OpenCode 集成 - Skill 和 MCP 模型
"""

import uuid
from sqlalchemy import (
    Column,
    String,
    Boolean,
    DateTime,
    ForeignKey,
    Text,
    JSON,
    BigInteger,
    Integer,
)
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class SkillCategory:
    SECURITY = "security"
    ANALYSIS = "analysis"
    UTILITY = "utility"
    CUSTOM = "custom"


class OpenCodeSkill(Base):
    __tablename__ = "opencode_skills"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False, index=True)
    version = Column(String(20), default="1.0.0")
    description = Column(Text, nullable=True)
    author = Column(String(255), nullable=True)
    category = Column(String(100), default=SkillCategory.CUSTOM, index=True)
    file_path = Column(String(500), nullable=True)
    opencode_file_path = Column(String(500), nullable=True)  # OpenCode进程可访问的路径
    file_size = Column(BigInteger, nullable=True)
    checksum = Column(String(64), nullable=True)
    config = Column(JSON, nullable=True)
    schema = Column(JSON, nullable=True)
    tags = Column(JSON, nullable=True)
    is_public = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True, index=True)
    download_count = Column(Integer, default=0)
    agent_package_id = Column(String(36), ForeignKey("agents.id"), nullable=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)

    # 新增关系
    agent_package = relationship("Agent", back_populates="package_skills")

    def __repr__(self):
        return f"&lt;OpenCodeSkill {self.name} v{self.version}&gt;"

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "author": self.author,
            "category": self.category,
            "file_path": self.file_path,
            "opencode_file_path": self.opencode_file_path,
            "file_size": self.file_size,
            "checksum": self.checksum,
            "config": self.config,
            "schema": self.schema,
            "tags": self.tags,
            "is_public": self.is_public,
            "is_active": self.is_active,
            "download_count": self.download_count,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "created_by": self.created_by,
            "agent_package_id": self.agent_package_id,
        }


class MCPType:
    STDIO = "stdio"
    SSE = "sse"
    HTTP = "http"


class OpenCodeMCP(Base):
    __tablename__ = "opencode_mcps"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False, index=True)
    version = Column(String(20), default="1.0.0")
    description = Column(Text, nullable=True)
    author = Column(String(255), nullable=True)
    mcp_type = Column(String(50), nullable=False, default=MCPType.STDIO, index=True)
    server_url = Column(String(500), nullable=True)
    command = Column(Text, nullable=True)
    args = Column(JSON, nullable=True)
    env = Column(JSON, nullable=True)
    config = Column(JSON, nullable=True)
    tools = Column(JSON, nullable=True)
    tags = Column(JSON, nullable=True)
    is_active = Column(Boolean, default=True, index=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    created_by = Column(String(36), ForeignKey("users.id"), nullable=True)

    def __repr__(self):
        return f"&lt;OpenCodeMCP {self.name} ({self.mcp_type})&gt;"

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "author": self.author,
            "mcp_type": self.mcp_type,
            "server_url": self.server_url,
            "command": self.command,
            "args": self.args,
            "env": self.env,
            "config": self.config,
            "tools": self.tools,
            "tags": self.tags,
            "is_active": self.is_active,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "created_by": self.created_by,
        }
