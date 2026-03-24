"""
Golang 安全知识库 Schema
"""

from __future__ import annotations
import re
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
from datetime import datetime

SLUG_PATTERN = re.compile(r'^[a-z0-9][a-z0-9\-]*[a-z0-9]$|^[a-z0-9]$')
SEVERITY_VALUES = {"critical", "high", "medium", "low"}
LIKELIHOOD_VALUES = {"high", "medium", "low"}


# ─── 漏洞库 Schema ──────────────────────────────────────────────────────────


class VulnerabilityEntryBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=200)
    cve_id: Optional[str] = Field(None, max_length=50)
    cwe_id: Optional[str] = Field(None, max_length=50)
    severity: str = Field(..., description="critical|high|medium|low")
    category: str = Field(..., min_length=1, max_length=100)
    tags: List[str] = Field(default_factory=list)
    summary: Optional[str] = Field(None, max_length=1000)
    content: str = Field(..., min_length=1)
    affected_versions: Optional[str] = Field(None, max_length=500)
    go_packages: List[str] = Field(default_factory=list)
    source_url: Optional[str] = Field(None, max_length=500)
    is_active: bool = True

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        if not SLUG_PATTERN.match(v):
            raise ValueError("slug 只能包含小写字母、数字和连字符，且不能以连字符开头或结尾")
        return v

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str) -> str:
        if v not in SEVERITY_VALUES:
            raise ValueError(f"severity 必须是 {sorted(SEVERITY_VALUES)} 之一")
        return v


class VulnerabilityEntryCreate(VulnerabilityEntryBase):
    pass


class VulnerabilityEntryUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    cve_id: Optional[str] = Field(None, max_length=50)
    cwe_id: Optional[str] = Field(None, max_length=50)
    severity: Optional[str] = None
    category: Optional[str] = Field(None, min_length=1, max_length=100)
    tags: Optional[List[str]] = None
    summary: Optional[str] = Field(None, max_length=1000)
    content: Optional[str] = Field(None, min_length=1)
    affected_versions: Optional[str] = Field(None, max_length=500)
    go_packages: Optional[List[str]] = None
    source_url: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in SEVERITY_VALUES:
            raise ValueError(f"severity 必须是 {sorted(SEVERITY_VALUES)} 之一")
        return v


class VulnerabilityEntryResponse(VulnerabilityEntryBase):
    id: str
    is_system: bool
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class VulnerabilityEntryListResponse(BaseModel):
    items: List[VulnerabilityEntryResponse]
    total: int
    skip: int
    limit: int


# ─── 攻击模式 Schema ────────────────────────────────────────────────────────


class AttackPatternEntryBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=200)
    capec_id: Optional[str] = Field(None, max_length=50)
    attack_type: str = Field(..., min_length=1, max_length=100)
    severity: str = Field(..., description="critical|high|medium|low")
    likelihood: Optional[str] = Field(None, description="high|medium|low")
    tags: List[str] = Field(default_factory=list)
    summary: Optional[str] = Field(None, max_length=1000)
    content: str = Field(..., min_length=1)
    mitigations: Optional[str] = None
    go_packages: List[str] = Field(default_factory=list)
    source_url: Optional[str] = Field(None, max_length=500)
    is_active: bool = True

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        if not SLUG_PATTERN.match(v):
            raise ValueError("slug 只能包含小写字母、数字和连字符，且不能以连字符开头或结尾")
        return v

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str) -> str:
        if v not in SEVERITY_VALUES:
            raise ValueError(f"severity 必须是 {sorted(SEVERITY_VALUES)} 之一")
        return v

    @field_validator("likelihood")
    @classmethod
    def validate_likelihood(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in LIKELIHOOD_VALUES:
            raise ValueError(f"likelihood 必须是 {sorted(LIKELIHOOD_VALUES)} 之一")
        return v


class AttackPatternEntryCreate(AttackPatternEntryBase):
    pass


class AttackPatternEntryUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    capec_id: Optional[str] = Field(None, max_length=50)
    attack_type: Optional[str] = Field(None, min_length=1, max_length=100)
    severity: Optional[str] = None
    likelihood: Optional[str] = None
    tags: Optional[List[str]] = None
    summary: Optional[str] = Field(None, max_length=1000)
    content: Optional[str] = Field(None, min_length=1)
    mitigations: Optional[str] = None
    go_packages: Optional[List[str]] = None
    source_url: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in SEVERITY_VALUES:
            raise ValueError(f"severity 必须是 {sorted(SEVERITY_VALUES)} 之一")
        return v

    @field_validator("likelihood")
    @classmethod
    def validate_likelihood(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in LIKELIHOOD_VALUES:
            raise ValueError(f"likelihood 必须是 {sorted(LIKELIHOOD_VALUES)} 之一")
        return v


class AttackPatternEntryResponse(AttackPatternEntryBase):
    id: str
    is_system: bool
    created_by: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AttackPatternEntryListResponse(BaseModel):
    items: List[AttackPatternEntryResponse]
    total: int
    skip: int
    limit: int


# ─── 导入结果 Schema ────────────────────────────────────────────────────────


class ImportResultItem(BaseModel):
    filename: str
    status: str
    id: Optional[str] = None
    slug: Optional[str] = None
    reason: Optional[str] = None


class ImportZipResponse(BaseModel):
    total: int
    success: int
    skipped: int
    failed: int
    results: List[ImportResultItem]


# ─── 批量导出请求 Schema ────────────────────────────────────────────────────


class ExportZipRequest(BaseModel):
    ids: Optional[List[str]] = None
    severity: Optional[str] = None
    category: Optional[str] = None
    attack_type: Optional[str] = None
