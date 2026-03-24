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
    """漏洞洞察报告表"""
    __tablename__ = "go_vulnerability_entries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(200), nullable=False)
    slug = Column(String(200), nullable=False, unique=True)
    tags = Column(Text, default="[]")
    summary = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    go_packages = Column(Text, default="[]")
    source_url = Column(String(500), nullable=True)
    is_system = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    creator = relationship("User", foreign_keys=[created_by])

    __table_args__ = (
        Index("ix_go_vuln_is_system", "is_system"),
        Index("ix_go_vuln_created_by", "created_by"),
    )


class GoAttackPatternEntry(Base):
    """攻击模式库条目表（含版本管理）

    版本设计：
    - pattern_id：同一攻击模式所有版本共享同一 pattern_id（创建首版时与 id 相同）
    - version：语义化版本号字符串，如 "1.0.0"、"1.1.0"、"2.0.0"
    - version_notes：当前版本的变更说明
    - is_latest：是否为该 pattern_id 下的最新版本（同一 pattern_id 只有一条记录为 True）
    - is_active：该版本是否启用（各版本独立控制）
    - parent_id：上一版本的 id（首版为 None）
    """
    __tablename__ = "go_attack_pattern_entries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    # 版本管理字段
    pattern_id = Column(String, nullable=False, index=True)   # 同一模式所有版本共享
    version = Column(String(50), nullable=False, default="1.0.0")
    version_notes = Column(Text, nullable=True)
    is_latest = Column(Boolean, nullable=False, default=True)  # 同一 pattern_id 只有一条为 True
    parent_id = Column(String, ForeignKey("go_attack_pattern_entries.id"), nullable=True)

    title = Column(String(200), nullable=False)
    slug = Column(String(200), nullable=False, unique=True)
    # 模式类型: general(通用攻击模式) | go-specific(Go特有攻击模式)
    #           cloud-business(云核业务攻击模式) | expert-experience(专家经验模式)
    pattern_type = Column(String(100), nullable=False, default="general")
    # 风险等级: critical | high | medium | low
    risk_level = Column(String(20), nullable=False, default="medium")
    tags = Column(Text, default="[]")
    summary = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    is_system = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_by = Column(String, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    creator = relationship("User", foreign_keys=[created_by])
    parent = relationship("GoAttackPatternEntry", foreign_keys=[parent_id], remote_side="GoAttackPatternEntry.id")

    __table_args__ = (
        Index("ix_go_attack_pattern_id", "pattern_id"),
        Index("ix_go_attack_pattern_type", "pattern_type"),
        Index("ix_go_attack_risk_level", "risk_level"),
        Index("ix_go_attack_is_system", "is_system"),
        Index("ix_go_attack_created_by", "created_by"),
        Index("ix_go_attack_is_latest", "is_latest"),
    )
