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
PATTERN_TYPE_VALUES = {"general", "go-specific", "cloud-business", "expert-experience"}


# ─── 漏洞洞察报告 Schema ─────────────────────────────────────────────────────


class VulnerabilityEntryBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=1, max_length=200)
    tags: List[str] = Field(default_factory=list)
    summary: Optional[str] = Field(None, max_length=1000)
    content: str = Field(..., min_length=1)
    go_packages: List[str] = Field(default_factory=list)
    source_url: Optional[str] = Field(None, max_length=500)
    is_active: bool = True

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        if not SLUG_PATTERN.match(v):
            raise ValueError("slug 只能包含小写字母、数字和连字符，且不能以连字符开头或结尾")
        return v


class VulnerabilityEntryCreate(VulnerabilityEntryBase):
    pass


class VulnerabilityEntryUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    tags: Optional[List[str]] = None
    summary: Optional[str] = Field(None, max_length=1000)
    content: Optional[str] = Field(None, min_length=1)
    go_packages: Optional[List[str]] = None
    source_url: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


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
    pattern_type: str = Field(default="general", description="general|go-specific|cloud-business|expert-experience")
    severity: str = Field(..., description="critical|high|medium|low")
    tags: List[str] = Field(default_factory=list)
    summary: Optional[str] = Field(None, max_length=1000)
    content: str = Field(..., min_length=1)
    mitigations: Optional[str] = None
    is_active: bool = True
    # 版本管理字段
    version: str = Field(default="1.0.0", max_length=50)
    version_notes: Optional[str] = Field(None, max_length=2000)

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

    @field_validator("pattern_type")
    @classmethod
    def validate_pattern_type(cls, v: str) -> str:
        if v not in PATTERN_TYPE_VALUES:
            raise ValueError(f"pattern_type 必须是 {sorted(PATTERN_TYPE_VALUES)} 之一")
        return v


class AttackPatternEntryCreate(AttackPatternEntryBase):
    pass


class AttackPatternEntryUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    capec_id: Optional[str] = Field(None, max_length=50)
    pattern_type: Optional[str] = None
    severity: Optional[str] = None
    tags: Optional[List[str]] = None
    summary: Optional[str] = Field(None, max_length=1000)
    content: Optional[str] = Field(None, min_length=1)
    mitigations: Optional[str] = None
    is_active: Optional[bool] = None
    version_notes: Optional[str] = Field(None, max_length=2000)

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in SEVERITY_VALUES:
            raise ValueError(f"severity 必须是 {sorted(SEVERITY_VALUES)} 之一")
        return v

    @field_validator("pattern_type")
    @classmethod
    def validate_pattern_type(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and v not in PATTERN_TYPE_VALUES:
            raise ValueError(f"pattern_type 必须是 {sorted(PATTERN_TYPE_VALUES)} 之一")
        return v


class AttackPatternEntryResponse(AttackPatternEntryBase):
    id: str
    pattern_id: str
    is_latest: bool
    is_system: bool
    parent_id: Optional[str] = None
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


# ─── 版本管理 Schema ─────────────────────────────────────────────────────────


class AttackPatternVersionCreate(BaseModel):
    """基于现有版本创建新版本"""
    version: str = Field(..., min_length=1, max_length=50, description="新版本号，如 2.0.0")
    version_notes: Optional[str] = Field(None, max_length=2000, description="版本变更说明")
    # 可覆盖的内容字段（不提供则完全继承父版本内容）
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    summary: Optional[str] = Field(None, max_length=1000)
    content: Optional[str] = Field(None, min_length=1)
    mitigations: Optional[str] = None
    severity: Optional[str] = None
    pattern_type: Optional[str] = None
    tags: Optional[List[str]] = None
    is_active: Optional[bool] = None


class AttackPatternVersionListResponse(BaseModel):
    """某一攻击模式的全部版本列表"""
    pattern_id: str
    versions: List[AttackPatternEntryResponse]


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
