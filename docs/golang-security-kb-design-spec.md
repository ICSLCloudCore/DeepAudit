# Golang 安全知识库模块 — 功能设计说明书

> 版本：v1.0  
> 日期：2026-03-24  
> 项目：GoDeepAudit v3.x  

---

## 目录

1. [需求概述](#1-需求概述)
2. [功能边界](#2-功能边界)
3. [整体架构适配](#3-整体架构适配)
4. [数据模型设计](#4-数据模型设计)
5. [后端 API 设计](#5-后端-api-设计)
6. [前端页面设计](#6-前端页面设计)
7. [Markdown 文件处理规范](#7-markdown-文件处理规范)
8. [导入导出规范](#8-导入导出规范)
9. [权限设计](#9-权限设计)
10. [数据库迁移计划](#10-数据库迁移计划)
11. [文件目录变更清单](#11-文件目录变更清单)
12. [接口契约总览](#12-接口契约总览)

---

## 1. 需求概述

### 1.1 背景

GoDeepAudit 作为面向 Golang 代码的安全审计平台，在执行审计任务时依赖内置的安全知识。当前系统已有「审计规则」（`AuditRule`）模块用于定义检测规则，但缺少一个可独立管理的**安全知识库**，用于沉淀：

- **洞察漏洞库**：Go 语言已知漏洞（CVE/CWE 条目、代码模式、利用方式、修复建议）。
- **攻击模式库**：CAPEC 风格的攻击场景、攻击向量、防御策略，以结构化 Markdown 文章形式存储。

知识库条目以 **Markdown 文件**为内容主体，支持富文本编辑与原始文件的导入导出。

### 1.2 目标

| 目标 | 说明 |
|------|------|
| 统一入口 | 在侧边栏新增「安全知识库」菜单，路由 `/security-kb` |
| 分类管理 | 页面内通过 Tab 区分「洞察漏洞库」与「攻击模式库」，后续可扩展更多 Tab |
| 全量 CRUD | 每个库支持条目的新建、查看、编辑（在线 Markdown 编辑）、删除 |
| 批量导入 | 支持单个 `.md` 文件上传或 ZIP 包批量导入 |
| 导出 | 支持单条导出为 `.md`、批量导出为 `.zip` |
| 搜索过滤 | 支持关键词搜索、严重等级、分类标签过滤 |
| 权限隔离 | 系统内置条目（`is_system=true`）只读；用户自建条目可全量管理 |

---

## 2. 功能边界

### 2.1 包含功能

- 新菜单项注册（`routes.tsx` + `Sidebar.tsx`）
- 两个 Tab 的独立列表页：洞察漏洞库、攻击模式库
- 每个列表页的功能：
  - 分页卡片/表格列表，关键词搜索 + 标签/严重等级筛选
  - 新建：弹出对话框，含 Markdown 在线编辑器
  - 查看：全屏对话框渲染 Markdown（只读）
  - 编辑：弹出对话框，复用新建表单，Markdown 编辑器回显
  - 删除：二次确认弹窗，系统条目禁止删除
  - 单条导出 `.md` 文件
  - 导入单个 `.md` 或 ZIP（批量）
  - 批量导出当前筛选结果为 ZIP
- 后端 FastAPI 路由：`/api/v1/security-kb`
- 两张数据库表：`go_vulnerability_entries`、`go_attack_pattern_entries`
- Alembic 迁移文件
- 前端 API 模块：`frontend/src/shared/api/securityKb.ts`

### 2.2 不包含功能（超出本期范围）

- 与 AuditTask/AgentTask 的自动关联推荐
- RAG 向量化索引（ChromaDB 知识库嵌入）
- 版本历史 / Git-diff 对比
- 多用户协作编辑 / 锁定机制

---

## 3. 整体架构适配

### 3.1 与现有模块的关系

```
现有侧边栏路由              新增
─────────────            ──────────────────
/                        
/projects                
/agents                  
/skill-marketplace       
/mcp-marketplace         
/instant-analysis        
/audit-tasks             
/audit-rules             
/prompts                 
/admin                   
/recycle-bin             
                    ───► /security-kb   ← 新增
```

### 3.2 后端模块层次

```
backend/app/
├── models/
│   ├── security_kb.py          ← 新增：两个 ORM 模型
├── schemas/
│   ├── security_kb.py          ← 新增：Pydantic v2 Schema
├── api/v1/endpoints/
│   ├── security_kb.py          ← 新增：FastAPI 路由
├── api/v1/api.py               ← 修改：注册新路由
├── models/__init__.py          ← 修改：导入新模型
alembic/versions/
├── XXX_add_security_kb.py      ← 新增：迁移脚本
```

### 3.3 前端模块层次

```
frontend/src/
├── app/
│   ├── routes.tsx              ← 修改：新增路由条目
├── components/layout/
│   ├── Sidebar.tsx             ← 修改：新增图标映射
├── pages/
│   ├── SecurityKnowledgeBase.tsx ← 新增：主页面（含两个Tab）
│   ├── security-kb/            ← 新增：子组件目录
│   │   ├── VulnerabilityList.tsx
│   │   ├── AttackPatternList.tsx
│   │   ├── KbEntryDialog.tsx   ← 新建/编辑通用对话框
│   │   ├── KbViewDialog.tsx    ← 查看对话框（Markdown 渲染）
│   │   ├── KbImportDialog.tsx  ← 导入对话框
│   │   └── types.ts            ← 本地类型定义
├── shared/api/
│   ├── securityKb.ts           ← 新增：API 模块
```

---

## 4. 数据模型设计

### 4.1 洞察漏洞库条目（`go_vulnerability_entries`）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `VARCHAR` PK | ✓ | UUID v4 |
| `title` | `VARCHAR(200)` | ✓ | 条目标题，如 "SQL 注入漏洞 - database/sql 误用" |
| `slug` | `VARCHAR(200)` | ✓ | URL 友好标识，唯一，如 `go-sqli-database-sql` |
| `cve_id` | `VARCHAR(50)` | | CVE 编号，如 `CVE-2023-1234`（可空） |
| `cwe_id` | `VARCHAR(50)` | | CWE 编号，如 `CWE-89`（可空） |
| `severity` | `VARCHAR(20)` | ✓ | `critical` / `high` / `medium` / `low` |
| `category` | `VARCHAR(100)` | ✓ | 漏洞大类，如 `injection`、`authentication`、`crypto` |
| `tags` | `TEXT` | | JSON 数组，如 `["goroutine","race-condition"]` |
| `summary` | `TEXT` | | 摘要（纯文本，≤500字符），用于列表展示 |
| `content` | `TEXT` | ✓ | Markdown 正文（完整文章） |
| `affected_versions` | `VARCHAR(500)` | | 受影响 Go 版本区间描述 |
| `go_packages` | `TEXT` | | JSON 数组，受影响 Go 包路径 |
| `source_url` | `VARCHAR(500)` | | 原始来源 URL（NVD/GHSA 等） |
| `is_system` | `BOOLEAN` | ✓ | 是否系统内置，默认 `false` |
| `is_active` | `BOOLEAN` | ✓ | 是否启用，默认 `true` |
| `created_by` | `VARCHAR` FK→`users.id` | | 创建者（系统条目为空） |
| `created_at` | `TIMESTAMP WITH TZ` | ✓ | 创建时间 |
| `updated_at` | `TIMESTAMP WITH TZ` | | 更新时间 |

**唯一约束**：`slug` 全局唯一。

**索引**：`severity`、`category`、`is_system`、`created_by`、`created_at`。

---

### 4.2 攻击模式库条目（`go_attack_pattern_entries`）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | `VARCHAR` PK | ✓ | UUID v4 |
| `title` | `VARCHAR(200)` | ✓ | 条目标题，如 "路径遍历攻击 - os.Open 路径注入" |
| `slug` | `VARCHAR(200)` | ✓ | URL 友好标识，唯一 |
| `capec_id` | `VARCHAR(50)` | | CAPEC 编号，如 `CAPEC-126`（可空） |
| `attack_type` | `VARCHAR(100)` | ✓ | 攻击类型，如 `injection`、`traversal`、`deserialization` |
| `severity` | `VARCHAR(20)` | ✓ | 严重程度 `critical`/`high`/`medium`/`low` |
| `likelihood` | `VARCHAR(20)` | | 利用可能性 `high`/`medium`/`low` |
| `tags` | `TEXT` | | JSON 数组标签 |
| `summary` | `TEXT` | | 摘要（纯文本，≤500字符） |
| `content` | `TEXT` | ✓ | Markdown 正文 |
| `mitigations` | `TEXT` | | Markdown 格式的防御措施（独立字段方便展示） |
| `go_packages` | `TEXT` | | JSON 数组，相关 Go 包 |
| `source_url` | `VARCHAR(500)` | | 来源 URL |
| `is_system` | `BOOLEAN` | ✓ | 是否系统内置，默认 `false` |
| `is_active` | `BOOLEAN` | ✓ | 是否启用，默认 `true` |
| `created_by` | `VARCHAR` FK→`users.id` | | 创建者 |
| `created_at` | `TIMESTAMP WITH TZ` | ✓ | 创建时间 |
| `updated_at` | `TIMESTAMP WITH TZ` | | 更新时间 |

**唯一约束**：`slug` 全局唯一。

---

### 4.3 ORM 模型代码（`backend/app/models/security_kb.py`）

```python
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
    __tablename__ = "go_vulnerability_entries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    title = Column(String(200), nullable=False)
    slug = Column(String(200), nullable=False, unique=True)
    cve_id = Column(String(50), nullable=True)
    cwe_id = Column(String(50), nullable=True)
    severity = Column(String(20), nullable=False, default="medium")
    category = Column(String(100), nullable=False)
    tags = Column(Text, default="[]")           # JSON array string
    summary = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    affected_versions = Column(String(500), nullable=True)
    go_packages = Column(Text, default="[]")    # JSON array string
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
```

---

## 5. 后端 API 设计

### 5.1 路由挂载

**`backend/app/api/v1/api.py` 新增**：

```python
from app.api.v1.endpoints import security_kb
api_router.include_router(
    security_kb.router,
    prefix="/security-kb",
    tags=["security-kb"]
)
```

### 5.2 洞察漏洞库接口（前缀 `/api/v1/security-kb/vulnerabilities`）

#### `GET /` — 列表查询（分页 + 筛选）

**Query 参数**：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `skip` | int | 0 | 分页偏移 |
| `limit` | int | 20 | 每页数量（1–100） |
| `q` | str | — | 关键词全文搜索（匹配 title、summary、cve_id） |
| `severity` | str | — | 严重程度筛选 |
| `category` | str | — | 漏洞分类筛选 |
| `is_system` | bool | — | 仅看系统内置 |
| `is_active` | bool | — | 启用状态筛选 |

**响应 200**：

```json
{
  "items": [ <VulnerabilityEntryResponse>, ... ],
  "total": 42,
  "skip": 0,
  "limit": 20
}
```

---

#### `POST /` — 新建条目

**Request Body**（`application/json`）：

```json
{
  "title": "SQL 注入 - database/sql Exec 参数拼接",
  "slug": "go-sqli-database-sql-exec",
  "cve_id": "CVE-2023-1234",
  "cwe_id": "CWE-89",
  "severity": "high",
  "category": "injection",
  "tags": ["sql", "database/sql", "injection"],
  "summary": "使用 database/sql 时直接拼接用户输入导致 SQL 注入...",
  "content": "# SQL 注入漏洞\n\n## 漏洞描述\n...",
  "affected_versions": ">= go1.0.0",
  "go_packages": ["database/sql"],
  "source_url": "https://nvd.nist.gov/vuln/detail/CVE-2023-1234"
}
```

**字段验证**：
- `title`：1–200 字符，必填
- `slug`：1–200 字符，仅字母/数字/连字符，必填，全局唯一
- `severity`：枚举 `critical|high|medium|low`，必填
- `category`：1–100 字符，必填
- `content`：必填，长度 ≥ 10 字符

**响应 201**：返回完整 `VulnerabilityEntryResponse`

**错误**：
- `400 Bad Request`：`slug` 重复 / 格式校验失败
- `422 Unprocessable Entity`：Pydantic 验证错误

---

#### `GET /{id}` — 获取单条

**响应 200**：完整 `VulnerabilityEntryResponse`（含 `content` Markdown 全文）

**错误**：`404 Not Found`

---

#### `PUT /{id}` — 更新条目

**Request Body**：同 Create，但所有字段可选（PATCH 语义）。

**权限约束**：系统内置条目（`is_system=true`）返回 `403 Forbidden`。

**响应 200**：更新后的完整对象

---

#### `DELETE /{id}` — 删除条目

**权限约束**：
- `is_system=true` 返回 `403 Forbidden`
- 非创建者（且非超级管理员）返回 `403 Forbidden`

**响应 204 No Content**

---

#### `GET /{id}/export` — 导出单条为 Markdown 文件

**响应 200**：

- `Content-Type: text/markdown; charset=utf-8`
- `Content-Disposition: attachment; filename="<slug>.md"`
- Body：Markdown 文件内容（包含 YAML Front Matter 元数据头）

**Front Matter 格式**：

```yaml
---
title: "SQL 注入 - database/sql Exec 参数拼接"
slug: go-sqli-database-sql-exec
cve_id: CVE-2023-1234
cwe_id: CWE-89
severity: high
category: injection
tags:
  - sql
  - database/sql
  - injection
affected_versions: ">= go1.0.0"
go_packages:
  - database/sql
source_url: https://nvd.nist.gov/vuln/detail/CVE-2023-1234
created_at: "2026-03-24T08:00:00Z"
---
# SQL 注入漏洞

## 漏洞描述
...
```

---

#### `POST /import` — 导入单个 Markdown 文件

**Request**：`multipart/form-data`

| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | `File` | 单个 `.md` 文件，≤ 10 MB |
| `overwrite` | `bool` | 若 `slug` 已存在是否覆盖，默认 `false` |

**处理逻辑**：
1. 解析 YAML Front Matter（若存在）提取元数据
2. Front Matter 之后的内容作为 `content`
3. 若 `slug` 缺失，由 `title` 自动生成（转小写，空格→连字符，截取 200 字符）
4. 按 `overwrite` 参数决定是否覆盖已有条目
5. 必填字段（`title`、`severity`、`category`）缺失时返回 `400`

**响应 201**：创建的条目 `VulnerabilityEntryResponse`

**响应 200**（`overwrite=true` 且已存在）：更新后的条目

---

#### `POST /import-zip` — 批量导入 ZIP

**Request**：`multipart/form-data`

| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | `File` | `.zip` 文件，≤ 100 MB，包含若干 `.md` 文件 |
| `overwrite` | `bool` | 默认 `false` |

**处理逻辑**：
1. 解压 ZIP（仅处理 `.md` 扩展名文件，忽略目录）
2. 对每个文件执行单文件导入逻辑
3. 汇总成功/失败列表

**响应 200**：

```json
{
  "total": 10,
  "success": 8,
  "skipped": 1,
  "failed": 1,
  "results": [
    { "filename": "go-sqli.md", "status": "created", "id": "...", "slug": "go-sqli" },
    { "filename": "go-xxe.md",  "status": "skipped", "reason": "slug already exists" },
    { "filename": "bad.md",     "status": "failed",  "reason": "missing required field: category" }
  ]
}
```

---

#### `POST /export-zip` — 批量导出（带筛选参数）

**Request Body**（`application/json`）：

```json
{
  "ids": ["id1", "id2"],        // 可选：指定 ID 列表；为空则导出当前筛选全量
  "severity": "high",           // 可选筛选
  "category": "injection"       // 可选筛选
}
```

**响应 200**：

- `Content-Type: application/zip`
- `Content-Disposition: attachment; filename="vulnerabilities_export_<timestamp>.zip"`
- Body：ZIP 包，每个条目一个 `.md` 文件（含 Front Matter）

---

### 5.3 攻击模式库接口（前缀 `/api/v1/security-kb/attack-patterns`）

接口结构与漏洞库完全对称，差异字段如下：

| 差异点 | 说明 |
|--------|------|
| 筛选参数 `category` → `attack_type` | 使用 `attack_type` 作为分类筛选参数 |
| 创建/更新新增字段 `capec_id`、`likelihood`、`mitigations` | 对应模型中的攻击模式专属字段 |
| Export Front Matter 新增 `capec_id`、`likelihood` 字段 | 保持元数据完整 |

完整端点列表（路径前缀 `/api/v1/security-kb/attack-patterns`）：

```
GET    /                 列表查询（skip/limit/q/severity/attack_type/is_system/is_active）
POST   /                 新建条目
GET    /{id}             获取单条
PUT    /{id}             更新条目
DELETE /{id}             删除条目
GET    /{id}/export      导出单条 .md
POST   /import           导入单个 .md
POST   /import-zip       批量导入 ZIP
POST   /export-zip       批量导出 ZIP
```

---

### 5.4 Pydantic Schema 设计（`backend/app/schemas/security_kb.py`）

```python
from __future__ import annotations
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator
import re

SLUG_PATTERN = re.compile(r'^[a-z0-9][a-z0-9\-]{0,198}[a-z0-9]$')
SEVERITY_VALUES = {"critical", "high", "medium", "low"}


# ─── 漏洞库 Schema ───────────────────────────────────────────────

class VulnerabilityEntryBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=2, max_length=200)
    cve_id: Optional[str] = Field(None, max_length=50)
    cwe_id: Optional[str] = Field(None, max_length=50)
    severity: str = Field(..., description="critical|high|medium|low")
    category: str = Field(..., min_length=1, max_length=100)
    tags: List[str] = Field(default_factory=list)
    summary: Optional[str] = Field(None, max_length=500)
    content: str = Field(..., min_length=10)
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
            raise ValueError(f"severity 必须是 {SEVERITY_VALUES} 之一")
        return v


class VulnerabilityEntryCreate(VulnerabilityEntryBase):
    pass


class VulnerabilityEntryUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    cve_id: Optional[str] = None
    cwe_id: Optional[str] = None
    severity: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None
    summary: Optional[str] = None
    content: Optional[str] = Field(None, min_length=10)
    affected_versions: Optional[str] = None
    go_packages: Optional[List[str]] = None
    source_url: Optional[str] = None
    is_active: Optional[bool] = None


class VulnerabilityEntryResponse(VulnerabilityEntryBase):
    id: str
    is_system: bool
    created_by: Optional[str]
    created_at: str
    updated_at: Optional[str]

    model_config = {"from_attributes": True}


class VulnerabilityEntryListResponse(BaseModel):
    items: List[VulnerabilityEntryResponse]
    total: int
    skip: int
    limit: int


# ─── 攻击模式 Schema ────────────────────────────────────────────

class AttackPatternEntryBase(BaseModel):
    title: str = Field(..., min_length=1, max_length=200)
    slug: str = Field(..., min_length=2, max_length=200)
    capec_id: Optional[str] = Field(None, max_length=50)
    attack_type: str = Field(..., min_length=1, max_length=100)
    severity: str = Field(..., description="critical|high|medium|low")
    likelihood: Optional[str] = Field(None, description="high|medium|low")
    tags: List[str] = Field(default_factory=list)
    summary: Optional[str] = Field(None, max_length=500)
    content: str = Field(..., min_length=10)
    mitigations: Optional[str] = None
    go_packages: List[str] = Field(default_factory=list)
    source_url: Optional[str] = Field(None, max_length=500)
    is_active: bool = True

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        if not SLUG_PATTERN.match(v):
            raise ValueError("slug 只能包含小写字母、数字和连字符")
        return v

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str) -> str:
        if v not in SEVERITY_VALUES:
            raise ValueError(f"severity 必须是 {SEVERITY_VALUES} 之一")
        return v


class AttackPatternEntryCreate(AttackPatternEntryBase):
    pass


class AttackPatternEntryUpdate(BaseModel):
    title: Optional[str] = None
    capec_id: Optional[str] = None
    attack_type: Optional[str] = None
    severity: Optional[str] = None
    likelihood: Optional[str] = None
    tags: Optional[List[str]] = None
    summary: Optional[str] = None
    content: Optional[str] = Field(None, min_length=10)
    mitigations: Optional[str] = None
    go_packages: Optional[List[str]] = None
    source_url: Optional[str] = None
    is_active: Optional[bool] = None


class AttackPatternEntryResponse(AttackPatternEntryBase):
    id: str
    is_system: bool
    created_by: Optional[str]
    created_at: str
    updated_at: Optional[str]

    model_config = {"from_attributes": True}


class AttackPatternEntryListResponse(BaseModel):
    items: List[AttackPatternEntryResponse]
    total: int
    skip: int
    limit: int


# ─── 导入结果 Schema ────────────────────────────────────────────

class ImportResultItem(BaseModel):
    filename: str
    status: str          # created | updated | skipped | failed
    id: Optional[str]
    slug: Optional[str]
    reason: Optional[str]


class ImportZipResponse(BaseModel):
    total: int
    success: int
    skipped: int
    failed: int
    results: List[ImportResultItem]


# ─── 批量导出请求 Schema ────────────────────────────────────────

class ExportZipRequest(BaseModel):
    ids: Optional[List[str]] = None
    severity: Optional[str] = None
    category: Optional[str] = None   # 漏洞库用
    attack_type: Optional[str] = None  # 攻击模式库用
```

---

### 5.5 FastAPI 路由实现要点（`backend/app/api/v1/endpoints/security_kb.py`）

```python
router = APIRouter()

# ── 公共依赖 ──────────────────────────────────────────────────────

def _require_editable(entry, current_user):
    """系统内置条目禁止修改/删除"""
    if entry.is_system:
        raise HTTPException(status_code=403, detail="系统内置条目不允许修改或删除")
    if entry.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="无权操作他人条目")

def _parse_markdown_file(content: bytes) -> dict:
    """
    解析 Markdown 文件，提取 YAML Front Matter 元数据和正文
    返回 dict，key 与 Schema 字段对齐
    """
    ...

def _generate_slug(title: str) -> str:
    """由 title 生成 slug：转 pinyin/英文小写，特殊字符→连字符，截取 200"""
    ...

def _entry_to_markdown(entry) -> str:
    """将 ORM 实例序列化为带 Front Matter 的 Markdown 字符串"""
    ...

# ── 漏洞库路由 ───────────────────────────────────────────────────

vuln_router = APIRouter(prefix="/vulnerabilities")

@vuln_router.get("", response_model=VulnerabilityEntryListResponse)
async def list_vulnerabilities(...)

@vuln_router.post("", response_model=VulnerabilityEntryResponse, status_code=201)
async def create_vulnerability(...)

@vuln_router.get("/{id}", response_model=VulnerabilityEntryResponse)
async def get_vulnerability(...)

@vuln_router.put("/{id}", response_model=VulnerabilityEntryResponse)
async def update_vulnerability(...)

@vuln_router.delete("/{id}", status_code=204)
async def delete_vulnerability(...)

@vuln_router.get("/{id}/export")
async def export_vulnerability_md(...)

@vuln_router.post("/import", response_model=VulnerabilityEntryResponse, status_code=201)
async def import_vulnerability_md(
    file: UploadFile = File(...),
    overwrite: bool = Form(False),
    ...
)

@vuln_router.post("/import-zip", response_model=ImportZipResponse)
async def import_vulnerability_zip(
    file: UploadFile = File(...),
    overwrite: bool = Form(False),
    ...
)

@vuln_router.post("/export-zip")
async def export_vulnerability_zip(body: ExportZipRequest, ...)

# ── 攻击模式路由 ─────────────────────────────────────────────────

attack_router = APIRouter(prefix="/attack-patterns")
# 同上，字段对应 GoAttackPatternEntry

router.include_router(vuln_router)
router.include_router(attack_router)
```

---

## 6. 前端页面设计

### 6.1 路由注册（`frontend/src/app/routes.tsx`）

```typescript
// 新增 import
import SecurityKnowledgeBase from "@/pages/SecurityKnowledgeBase";

// 在 routes 数组中新增（建议放在 /audit-rules 之后）
{
  name: "安全知识库",
  path: "/security-kb",
  element: <SecurityKnowledgeBase />,
  visible: true,
},
```

### 6.2 侧边栏图标（`frontend/src/components/layout/Sidebar.tsx`）

```typescript
// 新增图标 import
import { BookOpen } from "lucide-react";

// routeIcons 中新增
"/security-kb": <BookOpen className="w-[18px] h-[18px]" />,
```

---

### 6.3 主页面（`frontend/src/pages/SecurityKnowledgeBase.tsx`）

**页面结构**：

```
┌─ 页面标题区 ─────────────────────────────────────────────────────────┐
│  📖 安全知识库     [副标题：Golang Security Knowledge Base]          │
└──────────────────────────────────────────────────────────────────────┘
┌─ Tabs ───────────────────────────────────────────────────────────────┐
│  [洞察漏洞库]  [攻击模式库]                                          │
└──────────────────────────────────────────────────────────────────────┘
┌─ Tab 内容区（含工具栏 + 列表） ───────────────────────────────────────┐
│  <VulnerabilityList />  或  <AttackPatternList />                    │
└──────────────────────────────────────────────────────────────────────┘
```

**实现要点**：

```typescript
export default function SecurityKnowledgeBase() {
  const [activeTab, setActiveTab] = useState("vulnerabilities");
  return (
    <div className="flex flex-col h-full">
      {/* 页头 */}
      <PageHeader title="安全知识库" subtitle="Golang Security Knowledge Base" />
      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="vulnerabilities">
            <Bug className="w-4 h-4 mr-2" />洞察漏洞库
          </TabsTrigger>
          <TabsTrigger value="attack-patterns">
            <Swords className="w-4 h-4 mr-2" />攻击模式库
          </TabsTrigger>
        </TabsList>
        <TabsContent value="vulnerabilities">
          <VulnerabilityList />
        </TabsContent>
        <TabsContent value="attack-patterns">
          <AttackPatternList />
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

---

### 6.4 列表子组件（`VulnerabilityList.tsx` / `AttackPatternList.tsx`）

两个组件结构一致，以 `VulnerabilityList.tsx` 为例：

#### 工具栏区

```
┌─ 工具栏 ───────────────────────────────────────────────────────────┐
│ [🔍 搜索框]  [严重等级▼]  [分类▼]  │  [导入▼]  [批量导出]  [+ 新建] │
└────────────────────────────────────────────────────────────────────┘
```

- **搜索框**：`Input` 组件，防抖 300ms，触发列表重新拉取
- **严重等级下拉**：`Select` 枚举 `critical/high/medium/low`，含「全部」项
- **分类下拉**（漏洞库用 `category`，攻击库用 `attack_type`）
- **导入按钮**：下拉菜单，含「导入单个 .md」与「批量导入 ZIP」
- **批量导出按钮**：导出当前筛选全量
- **+ 新建按钮**：打开 `KbEntryDialog`

#### 列表区

卡片网格布局（`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3`），每张卡片包含：

```
┌─ 条目卡片 ──────────────────────────────────────────────────────────┐
│ [严重等级 Badge]  [分类 Badge]  [系统标签（若为系统内置）]           │
│                                                                     │
│ 标题（一行截断）                                                    │
│ CVE/CWE 编号（若有）                          创建时间              │
│ 摘要（两行截断）                                                    │
│                                                                     │
│ [Go 包标签 ×N]                                                      │
│                                              [查看] [编辑] [导出] [删除] │
└─────────────────────────────────────────────────────────────────────┘
```

- 系统内置条目：「编辑」「删除」按钮置灰并 `disabled`，hover 时显示 tooltip「系统内置条目不可修改」
- **严重等级色彩体系**（沿用 AuditRules.tsx 的 `severity-*` CSS class）：
  - `critical`：红色
  - `high`：橙色
  - `medium`：黄色
  - `low`：蓝色

#### 分页控件

底部分页栏：`<` `页码` `>` 与「共 N 条」，每页 20 条，超出时显示。

---

### 6.5 新建/编辑对话框（`KbEntryDialog.tsx`）

**对话框尺寸**：`max-w-4xl`，可滚动

**布局**：双列表单 + 全宽 Markdown 编辑器

```
┌─ 对话框 ──────────────────────────────────────────────────────────┐
│ [标题]           新建漏洞条目 / 编辑漏洞条目                        │
├─ 左列（基本信息） ────┬─ 右列（元数据） ────────────────────────────┤
│ 标题 *            │ CVE 编号（可选）                                │
│ Slug *（自动生成） │ CWE 编号（可选）                               │
│ 严重等级 * [下拉] │ 分类 * [下拉]                                  │
│ 摘要（textarea）  │ 标签 [Tag Input]                               │
│                   │ 受影响版本                                     │
│                   │ Go 包（Tag Input）                             │
│                   │ 来源 URL                                       │
│                   │ 启用开关                                        │
├───────────────────┴─────────────────────────────────────────────┤
│ Markdown 内容 *                                                   │
│ ┌─ Editor / Preview 切换 Tab ──────────────────────────────────┐ │
│ │  [编辑] [预览]                                                │ │
│ │  <Textarea 或 渲染区，高度 min-h-64>                         │ │
│ └──────────────────────────────────────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────┤
│                                         [取消]  [保存]            │
└──────────────────────────────────────────────────────────────────┘
```

**Slug 自动生成逻辑**：
- 用户输入 `title` 时，若 slug 字段处于「自动」状态（用户未手动修改），则自动推导：
  - 转小写、替换非字母数字为连字符、去除首尾连字符、合并连续连字符
- 用户手动修改 slug 后不再自动覆盖，显示「已自定义」标记

**Markdown 编辑器**：
- 「编辑」Tab：原生 `<Textarea>` 组件（等宽字体，支持 Tab 键缩进）
- 「预览」Tab：使用 `react-markdown` + `remark-gfm` 渲染（需安装依赖）
- 编辑区域 `min-h-[300px]`，可调整高度

**表单校验**（使用 `react-hook-form` + `zod`）：
- `title`：必填
- `slug`：必填，正则 `/^[a-z0-9][a-z0-9\-]{0,198}[a-z0-9]$/`
- `severity`：必填
- `category`/`attack_type`：必填
- `content`：必填，最少 10 字符

---

### 6.6 查看对话框（`KbViewDialog.tsx`）

**对话框尺寸**：`max-w-5xl`，`max-h-[90vh]`，内部可滚动

```
┌─ 查看对话框 ────────────────────────────────────────────────────────┐
│ 标题                              [导出 .md]  [编辑]  ✕ 关闭       │
├─────────────────────────────────────────────────────────────────────┤
│ [严重等级]  [分类]  CVE: xxx  CWE: xxx  创建时间: xxx               │
│ 标签: [tag1] [tag2]                                                  │
├─────────────────────────────────────────────────────────────────────┤
│  Markdown 渲染区（ScrollArea，高度自适应）                           │
│  使用 react-markdown + remark-gfm + rehype-highlight 渲染          │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 6.7 导入对话框（`KbImportDialog.tsx`）

**两种模式通过 `mode` prop 区分**：`"single"` / `"zip"`

```
┌─ 导入对话框 ────────────────────────────────────────────────────────┐
│ 标题：导入 Markdown 文件 / 批量导入 ZIP 包                          │
├─────────────────────────────────────────────────────────────────────┤
│  [文件拖拽区域]                                                      │
│  点击或拖拽上传 .md 文件（或 .zip 文件）                             │
│  文件大小限制：单文件 10MB / ZIP 100MB                               │
│                                                                     │
│  ☐ 若 slug 冲突则覆盖已有条目                                       │
├─────────────────────────────────────────────────────────────────────┤
│  ← 导入结果（上传完成后显示）                                        │
│  成功：8 条  跳过：1 条  失败：1 条                                  │
│  [失败明细展开▼]                                                    │
│   • bad.md — 缺少必填字段: category                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                            [取消]  [开始导入]       │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 6.8 前端 API 模块（`frontend/src/shared/api/securityKb.ts`）

```typescript
import { apiClient } from './serverClient';

// ─── 通用类型 ────────────────────────────────────────────────────

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Likelihood = 'high' | 'medium' | 'low';

// ─── 漏洞库类型 ──────────────────────────────────────────────────

export interface VulnerabilityEntry {
  id: string;
  title: string;
  slug: string;
  cve_id?: string;
  cwe_id?: string;
  severity: Severity;
  category: string;
  tags: string[];
  summary?: string;
  content: string;
  affected_versions?: string;
  go_packages: string[];
  source_url?: string;
  is_system: boolean;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

export interface VulnerabilityEntryCreate {
  title: string;
  slug: string;
  cve_id?: string;
  cwe_id?: string;
  severity: Severity;
  category: string;
  tags?: string[];
  summary?: string;
  content: string;
  affected_versions?: string;
  go_packages?: string[];
  source_url?: string;
  is_active?: boolean;
}

export type VulnerabilityEntryUpdate = Partial<Omit<VulnerabilityEntryCreate, 'slug'>>;

export interface KbListResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface KbListParams {
  skip?: number;
  limit?: number;
  q?: string;
  severity?: string;
  category?: string;
  is_system?: boolean;
  is_active?: boolean;
}

export interface ImportZipResponse {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  results: Array<{
    filename: string;
    status: 'created' | 'updated' | 'skipped' | 'failed';
    id?: string;
    slug?: string;
    reason?: string;
  }>;
}

// ─── 漏洞库 API 函数 ─────────────────────────────────────────────

const VULN_BASE = '/security-kb/vulnerabilities';

export async function listVulnerabilities(
  params?: KbListParams
): Promise<KbListResponse<VulnerabilityEntry>> {
  const response = await apiClient.get(VULN_BASE, { params });
  return response.data;
}

export async function getVulnerability(id: string): Promise<VulnerabilityEntry> {
  const response = await apiClient.get(`${VULN_BASE}/${id}`);
  return response.data;
}

export async function createVulnerability(
  data: VulnerabilityEntryCreate
): Promise<VulnerabilityEntry> {
  const response = await apiClient.post(VULN_BASE, data);
  return response.data;
}

export async function updateVulnerability(
  id: string,
  data: VulnerabilityEntryUpdate
): Promise<VulnerabilityEntry> {
  const response = await apiClient.put(`${VULN_BASE}/${id}`, data);
  return response.data;
}

export async function deleteVulnerability(id: string): Promise<void> {
  await apiClient.delete(`${VULN_BASE}/${id}`);
}

export async function exportVulnerabilityMd(id: string, slug: string): Promise<void> {
  const response = await apiClient.get(`${VULN_BASE}/${id}/export`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importVulnerabilityMd(
  file: File,
  overwrite: boolean
): Promise<VulnerabilityEntry> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('overwrite', String(overwrite));
  const response = await apiClient.post(`${VULN_BASE}/import`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function importVulnerabilityZip(
  file: File,
  overwrite: boolean
): Promise<ImportZipResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('overwrite', String(overwrite));
  const response = await apiClient.post(`${VULN_BASE}/import-zip`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function exportVulnerabilitiesZip(params: {
  ids?: string[];
  severity?: string;
  category?: string;
}): Promise<void> {
  const response = await apiClient.post(`${VULN_BASE}/export-zip`, params, {
    responseType: 'blob',
  });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vulnerabilities_export_${ts}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── 攻击模式库类型 ───────────────────────────────────────────────

export interface AttackPatternEntry {
  id: string;
  title: string;
  slug: string;
  capec_id?: string;
  attack_type: string;
  severity: Severity;
  likelihood?: Likelihood;
  tags: string[];
  summary?: string;
  content: string;
  mitigations?: string;
  go_packages: string[];
  source_url?: string;
  is_system: boolean;
  is_active: boolean;
  created_by?: string;
  created_at: string;
  updated_at?: string;
}

export interface AttackPatternEntryCreate {
  title: string;
  slug: string;
  capec_id?: string;
  attack_type: string;
  severity: Severity;
  likelihood?: Likelihood;
  tags?: string[];
  summary?: string;
  content: string;
  mitigations?: string;
  go_packages?: string[];
  source_url?: string;
  is_active?: boolean;
}

export type AttackPatternEntryUpdate = Partial<Omit<AttackPatternEntryCreate, 'slug'>>;

// ─── 攻击模式库 API 函数 ─────────────────────────────────────────

const ATTACK_BASE = '/security-kb/attack-patterns';

export async function listAttackPatterns(
  params?: KbListParams & { attack_type?: string }
): Promise<KbListResponse<AttackPatternEntry>> {
  const response = await apiClient.get(ATTACK_BASE, { params });
  return response.data;
}

export async function getAttackPattern(id: string): Promise<AttackPatternEntry> {
  const response = await apiClient.get(`${ATTACK_BASE}/${id}`);
  return response.data;
}

export async function createAttackPattern(
  data: AttackPatternEntryCreate
): Promise<AttackPatternEntry> {
  const response = await apiClient.post(ATTACK_BASE, data);
  return response.data;
}

export async function updateAttackPattern(
  id: string,
  data: AttackPatternEntryUpdate
): Promise<AttackPatternEntry> {
  const response = await apiClient.put(`${ATTACK_BASE}/${id}`, data);
  return response.data;
}

export async function deleteAttackPattern(id: string): Promise<void> {
  await apiClient.delete(`${ATTACK_BASE}/${id}`);
}

export async function exportAttackPatternMd(id: string, slug: string): Promise<void> {
  const response = await apiClient.get(`${ATTACK_BASE}/${id}/export`, {
    responseType: 'blob',
  });
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slug}.md`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importAttackPatternMd(
  file: File,
  overwrite: boolean
): Promise<AttackPatternEntry> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('overwrite', String(overwrite));
  const response = await apiClient.post(`${ATTACK_BASE}/import`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function importAttackPatternZip(
  file: File,
  overwrite: boolean
): Promise<ImportZipResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('overwrite', String(overwrite));
  const response = await apiClient.post(`${ATTACK_BASE}/import-zip`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function exportAttackPatternsZip(params: {
  ids?: string[];
  severity?: string;
  attack_type?: string;
}): Promise<void> {
  const response = await apiClient.post(`${ATTACK_BASE}/export-zip`, params, {
    responseType: 'blob',
  });
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const url = URL.createObjectURL(response.data);
  const a = document.createElement('a');
  a.href = url;
  a.download = `attack_patterns_export_${ts}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}
```

---

## 7. Markdown 文件处理规范

### 7.1 标准 Front Matter 格式

导出的 Markdown 文件统一使用 **YAML Front Matter**（三横线分隔块）：

**漏洞库条目示例**：

```markdown
---
title: "SQL 注入 - database/sql Exec 参数直接拼接"
slug: go-sqli-database-sql-exec
entry_type: vulnerability
cve_id: CVE-2023-1234
cwe_id: CWE-89
severity: high
category: injection
tags:
  - sql-injection
  - database/sql
  - user-input
affected_versions: ">= go1.0.0"
go_packages:
  - database/sql
source_url: "https://nvd.nist.gov/vuln/detail/CVE-2023-1234"
is_active: true
created_at: "2026-03-24T08:00:00Z"
updated_at: "2026-03-24T10:30:00Z"
---

# SQL 注入漏洞

## 漏洞描述

当使用 `database/sql` 包时，若将用户输入直接拼接进 SQL 语句而非使用参数化查询，
则存在 SQL 注入风险...

## 漏洞代码示例

```go
// 危险写法
query := "SELECT * FROM users WHERE name = '" + userInput + "'"
rows, err := db.QueryContext(ctx, query)
```

## 修复方案

```go
// 安全写法 - 使用参数化查询
rows, err := db.QueryContext(ctx, "SELECT * FROM users WHERE name = ?", userInput)
```

## 参考资料

- [OWASP SQL Injection](https://owasp.org/www-community/attacks/SQL_Injection)
- [Go database/sql 最佳实践](https://pkg.go.dev/database/sql)
```

**攻击模式库条目示例**：

```markdown
---
title: "路径遍历攻击 - os.Open 路径注入"
slug: go-path-traversal-os-open
entry_type: attack_pattern
capec_id: CAPEC-126
attack_type: traversal
severity: high
likelihood: medium
tags:
  - path-traversal
  - os
  - file-system
go_packages:
  - os
  - path/filepath
source_url: "https://capec.mitre.org/data/definitions/126.html"
is_active: true
created_at: "2026-03-24T08:00:00Z"
---

# 路径遍历攻击

## 攻击场景描述
...

## 防御措施

- 使用 `filepath.Clean` 清洗路径
- 使用 `filepath.Abs` 转绝对路径后验证前缀
- ...
```

### 7.2 导入解析规则

| 优先级 | 说明 |
|--------|------|
| P1 | Front Matter 字段优先级高于文件名推导 |
| P2 | 若 Front Matter 缺失 `slug`，由 `title` 推导；若 `title` 也缺失，由文件名去扩展名推导 |
| P3 | 若 Front Matter 缺失 `entry_type`，根据导入的接口路径判断（`/vulnerabilities/import` → `vulnerability`） |
| P4 | `severity` 缺失时默认 `medium` |
| P5 | `category`/`attack_type` 缺失时：漏洞库默认 `uncategorized`；攻击库默认 `other` |

### 7.3 Slug 生成算法

```python
import re
import unicodedata

def generate_slug(title: str) -> str:
    # 1. Unicode 规范化
    text = unicodedata.normalize('NFKD', title)
    # 2. 保留 ASCII 字母、数字、空格、连字符
    text = re.sub(r'[^\w\s\-]', ' ', text, flags=re.ASCII)
    # 3. 转小写
    text = text.lower()
    # 4. 连续空白/连字符 → 单连字符
    text = re.sub(r'[\s\-]+', '-', text)
    # 5. 去除首尾连字符
    text = text.strip('-')
    # 6. 截取 200 字符
    return text[:200] or 'entry'
```

---

## 8. 导入导出规范

### 8.1 文件命名规则

| 场景 | 文件名格式 |
|------|-----------|
| 单条导出 | `<slug>.md` |
| 批量导出 ZIP | `vulnerabilities_export_<YYYY-MM-DDTHH-MM-SS>.zip` |
| 批量导出 ZIP（攻击模式） | `attack_patterns_export_<YYYY-MM-DDTHH-MM-SS>.zip` |
| ZIP 内部文件 | `<slug>.md`（平铺，不使用子目录） |

### 8.2 ZIP 导入限制

| 参数 | 限制 |
|------|------|
| 单个 `.md` 文件大小 | ≤ 10 MB |
| ZIP 文件大小 | ≤ 100 MB |
| ZIP 内文件数量 | ≤ 500 个 |
| 允许的文件扩展名 | `.md` 仅此一种（其他忽略，不报错） |
| ZIP 目录深度 | 不限，但 `.md` 文件统一平铺处理（忽略目录结构） |

### 8.3 `overwrite` 语义

| `overwrite` 值 | slug 已存在时行为 |
|----------------|-----------------|
| `false`（默认） | 跳过，状态 `skipped` |
| `true` | 覆盖更新，状态 `updated` |

系统内置条目（`is_system=true`）无论 `overwrite` 为何值，均不允许覆盖，返回状态 `skipped` 并附带原因说明。

---

## 9. 权限设计

| 操作 | 普通用户（已登录） | 超级管理员 |
|------|-------------------|-----------|
| 查看列表（含系统条目） | ✓ | ✓ |
| 查看单条（含系统条目） | ✓ | ✓ |
| 新建条目 | ✓（`is_system=false`） | ✓ |
| 编辑自己创建的条目 | ✓ | ✓ |
| 编辑他人条目 | ✗ | ✓ |
| 编辑系统内置条目 | ✗ | ✗（系统条目不允许任何人修改） |
| 删除自己创建的条目 | ✓ | ✓ |
| 删除他人条目 | ✗ | ✓ |
| 删除系统内置条目 | ✗ | ✗ |
| 导出任意条目为 .md | ✓ | ✓ |
| 批量导出 ZIP | ✓（仅导出自己可见的条目） | ✓ |
| 导入 .md / ZIP | ✓（导入后条目 `created_by` = 自己） | ✓ |

**备注**：超级管理员通过 `current_user.is_superuser` 标识，与现有 `admin` 角色一致。

---

## 10. 数据库迁移计划

### 10.1 迁移文件（`alembic/versions/XXX_add_security_kb.py`）

```python
"""add golang security knowledge base tables

Revision ID: add_security_kb_001
Revises: <上一个 revision id>
Create Date: 2026-03-24
"""

from alembic import op
import sqlalchemy as sa

def upgrade() -> None:
    # 洞察漏洞库
    op.create_table(
        'go_vulnerability_entries',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(200), nullable=False, unique=True),
        sa.Column('cve_id', sa.String(50), nullable=True),
        sa.Column('cwe_id', sa.String(50), nullable=True),
        sa.Column('severity', sa.String(20), nullable=False, server_default='medium'),
        sa.Column('category', sa.String(100), nullable=False),
        sa.Column('tags', sa.Text(), server_default='[]'),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('affected_versions', sa.String(500), nullable=True),
        sa.Column('go_packages', sa.Text(), server_default='[]'),
        sa.Column('source_url', sa.String(500), nullable=True),
        sa.Column('is_system', sa.Boolean(), server_default='false'),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('created_by', sa.String(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_go_vuln_severity', 'go_vulnerability_entries', ['severity'])
    op.create_index('ix_go_vuln_category', 'go_vulnerability_entries', ['category'])
    op.create_index('ix_go_vuln_is_system', 'go_vulnerability_entries', ['is_system'])
    op.create_index('ix_go_vuln_created_by', 'go_vulnerability_entries', ['created_by'])

    # 攻击模式库
    op.create_table(
        'go_attack_pattern_entries',
        sa.Column('id', sa.String(), primary_key=True),
        sa.Column('title', sa.String(200), nullable=False),
        sa.Column('slug', sa.String(200), nullable=False, unique=True),
        sa.Column('capec_id', sa.String(50), nullable=True),
        sa.Column('attack_type', sa.String(100), nullable=False),
        sa.Column('severity', sa.String(20), nullable=False, server_default='medium'),
        sa.Column('likelihood', sa.String(20), nullable=True),
        sa.Column('tags', sa.Text(), server_default='[]'),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('content', sa.Text(), nullable=False),
        sa.Column('mitigations', sa.Text(), nullable=True),
        sa.Column('go_packages', sa.Text(), server_default='[]'),
        sa.Column('source_url', sa.String(500), nullable=True),
        sa.Column('is_system', sa.Boolean(), server_default='false'),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('created_by', sa.String(), sa.ForeignKey('users.id'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_go_attack_attack_type', 'go_attack_pattern_entries', ['attack_type'])
    op.create_index('ix_go_attack_severity', 'go_attack_pattern_entries', ['severity'])
    op.create_index('ix_go_attack_is_system', 'go_attack_pattern_entries', ['is_system'])
    op.create_index('ix_go_attack_created_by', 'go_attack_pattern_entries', ['created_by'])


def downgrade() -> None:
    op.drop_table('go_attack_pattern_entries')
    op.drop_table('go_vulnerability_entries')
```

---

## 11. 文件目录变更清单

### 新增文件

| 路径 | 说明 |
|------|------|
| `backend/app/models/security_kb.py` | ORM 数据模型 |
| `backend/app/schemas/security_kb.py` | Pydantic v2 Schema |
| `backend/app/api/v1/endpoints/security_kb.py` | FastAPI 路由实现 |
| `backend/alembic/versions/XXX_add_security_kb.py` | 数据库迁移脚本 |
| `frontend/src/pages/SecurityKnowledgeBase.tsx` | 主页面组件 |
| `frontend/src/pages/security-kb/VulnerabilityList.tsx` | 漏洞库列表组件 |
| `frontend/src/pages/security-kb/AttackPatternList.tsx` | 攻击模式列表组件 |
| `frontend/src/pages/security-kb/KbEntryDialog.tsx` | 新建/编辑对话框 |
| `frontend/src/pages/security-kb/KbViewDialog.tsx` | 查看对话框 |
| `frontend/src/pages/security-kb/KbImportDialog.tsx` | 导入对话框 |
| `frontend/src/pages/security-kb/types.ts` | 本地类型辅助 |
| `frontend/src/shared/api/securityKb.ts` | 前端 API 封装 |

### 修改文件

| 路径 | 变更说明 |
|------|---------|
| `backend/app/models/__init__.py` | 新增 `GoVulnerabilityEntry`、`GoAttackPatternEntry` import |
| `backend/app/api/v1/api.py` | 注册 `security_kb.router` 到 `/security-kb` |
| `frontend/src/app/routes.tsx` | 新增 `/security-kb` 路由条目 |
| `frontend/src/components/layout/Sidebar.tsx` | 新增 `BookOpen` 图标映射 |
| `frontend/package.json` | 新增依赖 `react-markdown`、`remark-gfm`、`rehype-highlight`、`js-yaml` |

### 新增 npm 依赖

| 包名 | 用途 |
|------|------|
| `react-markdown` | Markdown 渲染（查看对话框、编辑预览） |
| `remark-gfm` | GitHub Flavored Markdown 支持（表格、代码块等） |
| `rehype-highlight` | 代码语法高亮 |
| `js-yaml` | 前端 YAML Front Matter 解析（可选，用于本地预览） |

### 新增 Python 依赖

| 包名 | 用途 |
|------|------|
| `python-frontmatter` | 解析 Markdown YAML Front Matter |
| `python-slugify` | Slug 生成（含中文 Pinyin 支持） |

---

## 12. 接口契约总览

### 洞察漏洞库（`/api/v1/security-kb/vulnerabilities`）

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | `/` | 登录 | 分页列表，支持 q/severity/category 筛选 |
| POST | `/` | 登录 | 新建条目 |
| GET | `/{id}` | 登录 | 获取单条（含完整 Markdown content） |
| PUT | `/{id}` | 登录 | 更新条目（非系统/非他人） |
| DELETE | `/{id}` | 登录 | 删除条目（非系统/非他人） |
| GET | `/{id}/export` | 登录 | 导出单条 `.md` 文件 |
| POST | `/import` | 登录 | 导入单个 `.md` 文件（multipart） |
| POST | `/import-zip` | 登录 | 批量导入 ZIP（multipart） |
| POST | `/export-zip` | 登录 | 批量导出 ZIP（JSON body 含筛选条件） |

### 攻击模式库（`/api/v1/security-kb/attack-patterns`）

| Method | Path | Auth | 说明 |
|--------|------|------|------|
| GET | `/` | 登录 | 分页列表，支持 q/severity/attack_type 筛选 |
| POST | `/` | 登录 | 新建条目 |
| GET | `/{id}` | 登录 | 获取单条 |
| PUT | `/{id}` | 登录 | 更新条目 |
| DELETE | `/{id}` | 登录 | 删除条目 |
| GET | `/{id}/export` | 登录 | 导出单条 `.md` 文件 |
| POST | `/import` | 登录 | 导入单个 `.md` 文件 |
| POST | `/import-zip` | 登录 | 批量导入 ZIP |
| POST | `/export-zip` | 登录 | 批量导出 ZIP |

---

*本文档描述 Golang 安全知识库模块的完整设计规范，涵盖数据模型、后端 API、前端页面、Markdown 处理、导入导出、权限控制及数据库迁移各层面，可直接作为开发实现的参考基准。*
