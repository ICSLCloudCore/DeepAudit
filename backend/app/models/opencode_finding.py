"""
OpenCode审计发现模型
支持OpenCode审计报告的完整字段存储
"""

import uuid
from typing import Optional, TYPE_CHECKING
from sqlalchemy import Column, String, Integer, Float, Text, DateTime, ForeignKey, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base

if TYPE_CHECKING:
    from .opencode_audit_task import OpenCodeAuditTask
    from .user import User


class OpenCodeFindingStatus:
    """发现状态"""

    NEW = "new"
    ANALYZING = "analyzing"
    RESOLVED = "resolved"
    FALSE_POSITIVE = "false_positive"


class OpenCodeManualConfirmationStatus:
    """人工确认状态"""

    PENDING = "待确认"
    CONFIRMED = "已确认"
    FALSE_POSITIVE = "误报"
    FIXED = "已修复"


class OpenCodeFinding(Base):
    """OpenCode发现的漏洞"""

    __tablename__ = "opencode_findings"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = Column(
        String(36),
        ForeignKey("opencode_audit_tasks.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    vuln_id = Column(String(50), nullable=False, index=True)

    # 基本信息
    severity = Column(String(20), nullable=False, index=True)
    cvss_score = Column(Float, nullable=True)
    cvss_vector = Column(String(255), nullable=True)
    cwe = Column(String(255), nullable=True)
    confidence = Column(String(20), nullable=True)
    location = Column(String(500), nullable=True)
    file_path = Column(String(500), nullable=True, index=True)
    line_start = Column(Integer, nullable=True)
    line_end = Column(Integer, nullable=True)
    function_name = Column(String(255), nullable=True)

    # 漏洞描述
    vulnerability_title = Column(String(500), nullable=False)
    vulnerability_essence = Column(Text, nullable=True)
    root_cause = Column(Text, nullable=True)
    security_impact = Column(Text, nullable=True)

    # 漏洞代码
    vulnerable_code = Column(Text, nullable=True)

    # 数据流路径
    dataflow_source = Column(Text, nullable=True)
    dataflow_propagation = Column(JSON, nullable=True)
    dataflow_sink = Column(Text, nullable=True)
    dataflow_sanitization = Column(Text, nullable=True)
    dataflow_conclusion = Column(Text, nullable=True)

    # 利用场景
    exploit_steps = Column(Text, nullable=True)
    exploit_poc = Column(Text, nullable=True)

    # 影响
    impact_confidentiality = Column(String(20), nullable=True)
    impact_integrity = Column(String(20), nullable=True)
    impact_availability = Column(String(20), nullable=True)

    # 修复建议
    fix_description = Column(Text, nullable=True)
    fix_code_before = Column(Text, nullable=True)
    fix_code_after = Column(Text, nullable=True)

    # 人工确认
    manual_confirmation = Column(Text, nullable=True)
    manual_confirmation_status = Column(String(30), nullable=True, index=True)
    manual_confirmation_notes = Column(Text, nullable=True)
    confirmed_by = Column(String(36), ForeignKey("users.id"), nullable=True, index=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)

    # 元数据
    status = Column(String(30), default=OpenCodeFindingStatus.NEW, index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    # 关联关系
    task = relationship("OpenCodeAuditTask", back_populates="finding_items")
    confirmer = relationship("User")

    def __repr__(self):
        return f"<OpenCodeFinding {self.vuln_id} - {self.severity}>"

    @staticmethod
    def severity_to_enum(severity_cn: str) -> str:
        """将中文严重程度转换为英文枚举"""
        mapping = {"致命": "critical", "严重": "high", "一般": "medium", "提示": "low"}
        return mapping.get(severity_cn, severity_cn)

    @staticmethod
    def enum_to_severity(severity_en: str) -> str:
        """将英文枚举转换为中文严重程度"""
        mapping = {"critical": "致命", "high": "严重", "medium": "一般", "low": "提示"}
        return mapping.get(severity_en, severity_en)
