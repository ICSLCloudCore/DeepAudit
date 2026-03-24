"""
Golang 安全知识库模型
- GoVulnerabilityEntry: 洞察漏洞库条目
- GoAttackPatternEntry: 攻击模式库条目
"""

import uuid
from sqlalchemy import Column, String, Text, Boolean, DateTime, ForeignKey, Index
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class GoVulnerabilityEntry(Base):
    """洞察漏洞库条目表"""
    __tablename__ = "go_vulnerability_entries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(200), nullable=False)
    slug = Column(String(200), nullable=False, unique=True)
    cve_id = Column(String(50), nullable=True)
    cwe_id = Column(String(50), nullable=True)
    severity = Column(String(20), nullable=False, default="medium")
    category = Column(String(100), nullable=False)
    tags = Column(Text, default="[]")
    summary = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    affected_versions = Column(String(500), nullable=True)
    go_packages = Column(Text, default="[]")
    source_url = Column(String(500), nullable=True)
    is_system = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    creator = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        Index("ix_go_vuln_severity", "severity"),
        Index("ix_go_vuln_category", "category"),
        Index("ix_go_vuln_is_system", "is_system"),
        Index("ix_go_vuln_created_by", "created_by"),
    )


class GoAttackPatternEntry(Base):
    """攻击模式库条目表"""
    __tablename__ = "go_attack_pattern_entries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(200), nullable=False)
    slug = Column(String(200), nullable=False, unique=True)
    capec_id = Column(String(50), nullable=True)
    attack_type = Column(String(100), nullable=False)
    severity = Column(String(20), nullable=False, default="medium")
    likelihood = Column(String(20), nullable=True)
    tags = Column(Text, default="[]")
    summary = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    mitigations = Column(Text, nullable=True)
    go_packages = Column(Text, default="[]")
    source_url = Column(String(500), nullable=True)
    is_system = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    creator = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        Index("ix_go_attack_attack_type", "attack_type"),
        Index("ix_go_attack_severity", "severity"),
        Index("ix_go_attack_is_system", "is_system"),
        Index("ix_go_attack_created_by", "created_by"),
    )
