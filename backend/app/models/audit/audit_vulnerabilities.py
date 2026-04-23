import uuid
from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text, Float, Boolean
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship
from app.db.base import Base


class AuditVulnerability(Base):
    __tablename__ = "audit_vulnerabilities"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    task_id = Column(String, nullable=False, index=True)
    vuln_id = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False, index=True)
    cvss_score = Column(Float, nullable=True)
    cvss_vector = Column(String(255), nullable=True)
    cwe = Column(String(255), nullable=True)
    confidence = Column(String(20), nullable=True)
    location = Column(String(255), nullable=True)
    file_path = Column(String(500), nullable=True)
    line_start = Column(Integer, nullable=True)
    line_end = Column(Integer, nullable=True)
    vulnerability_title = Column(String(255), nullable=False)
    vulnerability_essence = Column(Text, nullable=True)
    root_cause = Column(Text, nullable=True)
    security_impact = Column(Text, nullable=True)
    vulnerable_code = Column(Text, nullable=True)
    dataflow = Column(Text, nullable=True)
    exploit_steps = Column(Text, nullable=True)
    exploit_poc = Column(Text, nullable=True)
    impact_confidentiality = Column(String(20), nullable=True)
    impact_integrity = Column(String(20), nullable=True)
    impact_availability = Column(String(20), nullable=True)
    fix_description = Column(Text, nullable=True)
    fix_code_before = Column(Text, nullable=True)
    fix_code_after = Column(Text, nullable=True)
    manual_confirmation = Column(Boolean, nullable=True)
    manual_confirmation_status = Column(String(20), nullable=True, default="待确认")
    manual_confirmation_notes = Column(Text, nullable=True)
    confirmed_by = Column(String(36), nullable=True)
    confirmed_at = Column(DateTime(timezone=True), nullable=True)
    status = Column(String(20), nullable=True, default="new", index=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
