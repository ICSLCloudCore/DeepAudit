# Agent 包管理功能 - 软件设计文档 (SDD)

**版本**: 1.1  
**日期**: 2026-04-28  
**作者**: DeepAudit Team

---

## 变更记录

| 版本 | 日期 | 变更说明 |
|------|------|---------|
| 1.0 | 2026-04-28 | 初始版本 |
| 1.1 | 2026-04-28 | 新增字段删除说明、数据迁移策略、向后兼容性处理 |

---

## 1. 概述

### 1.1 项目背景

DeepAudit 是一个 AI 驱动的智能安全代码审计平台。目前系统已支持单独的 Skill 管理，但缺少对完整 Agent 包的支持。

完整的 Agent 包结构（参考 `docs/example/cloudecore-audit/`）：
```
agent-package/
├── AGENTS.md          # 总工作流编排定义
├── agents/            # Agent 文件目录
│   ├── orchestrator.md
│   └── ...
└── skills/            # Skill 目录
    ├── go-audit-detector/
    │   └── SKILL.md
    ├── go-audit-judge/
    │   └── SKILL.md
    └── ...
```

为了提升用户体验，需要支持 Agent 包的上传、解析、存储和管理功能。

### 1.2 功能目标

- 支持上传 Agent 压缩包（zip 格式）
- 使用 zip 包文件名作为工作流名称
- 扫描并解析 agents/ 目录下的 Agent 文件
- 扫描并解析 skills/ 目录下的 Skill
- 以卡片管理形式在页面呈现：
- 总编排（zip 包文件名作为名称）
  - Agents 列表
  - Skills 列表
- 保持与现有 Skill 管理的兼容性
- 提供完整的 CRUD 功能（上传、列表、详情、下载、删除）

### 1.3 范围

本文档涵盖：
- 数据库模型设计与变更
- 后端 API 设计与实现
- 前端页面修改（整合Agent包功能到原Agents标签页）
- 文件存储与解析逻辑
- 安全考虑
- **字段删除与数据迁移策略（新增重点）**
- **向后兼容性处理（新增重点）**

不涉及：
- Agent 包的执行逻辑
- Skill 的实际使用逻辑

---

## 2. 系统架构

### 2.1 总体架构

名称说明
- Agents：Agent的编排逻辑，包含多个Agent和Skill，是一套完整编排流程的具象化，以Agents压缩包的名称命名
- Agent： 单个的Agent，以agent文件的名称命名

```
┌─────────────────────────────────────────────────────────────────────┐
│                      前端 (React)                                    │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │      OpenCodeResourceManager (现有页面)                           │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │
│  │  │  Tabs (保持不变)                                            │  │
│  │  │  [Models] [Skills] [Agents] [MCPs]                        │  │
│  │  └──────────────┬──────────────────────────────────────────────┘  │
│  │                 │                                                 │
│  │  ┌──────────────▼─────────────────────────────────────────────┐  │
│  │  │  Agents Tab (更新，原先功能废弃，整合Agent包功能)            │  │
│  │  │  - 支持上传Agent包，新增卡片管理、上传、查看等功能                 │  │
│  │  │  - 一个Agents包含多个skill和agent                       │  │
│  │  │  - 标签页展示Agents的编排逻辑，支持删除完整的Agent                   │  │
│  │  └─────────────────────────────────────────────────────────────┘  │
│  └──────────────────────┬────────────────────────────────────────────┘  │
│                         │                                               │
└─────────────────────────┼───────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────┐
│                      后端 (FastAPI)                                     │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  agents.py (新增 API 模块)                                       │  │
│  └──────────────────────┬────────────────────────────────────────────┘  │
│                         │                                               │
│  ┌──────────────────────▼────────────────────────────────────────────┐  │
│  │  数据库 (PostgreSQL)                                             │  │
│  │  - agents (表结构更新)                                          │  │
│  │  - opencode_agents (新增表)                                     │  │
│  │  - opencode_skills (表结构更新)                                  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                         │                                               │
│  ┌──────────────────────▼────────────────────────────────────────────┐  │
│  │  文件存储                                                         │  │
│  │  uploads/agent_packages/                                          │  │
│  │  ├── zips/              # 原始压缩包                             │  │
│  │  └── extracted/         # 解压内容                               │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 标签页顺序（保持不变）

| 顺序 | 标签 | 功能说明 |
|------|------|---------|
| 1 | Models | 模型供应商和模型配置管理 |
| 2 | Skills | OpenCode Skill 上传、下载、删除管理 |
| 3 | Agents | Agent 包管理（原单个Agent功能废弃） |
| 4 | MCPs | MCP 配置和工具刷新管理 |

---

## 3. 数据模型

### 3.1 agents 表（重大更新）

**文件**: `backend/app/models/agent/opencode_agent.py`

修改该文件路径，将文件修改到 `backend/app/models/opencode/agents.py`

#### 3.1.1 字段变更详情

**删除的字段（重要！）**:

| 字段名 | 类型 | 说明 | 删除原因 |
|--------|------|------|---------|
| `agent_type` | String(50) | Agent类型（system/custom） | 不再需要区分系统/自定义Agent |
| `config` | JSON | 配置信息 | Agent配置不再存储在数据库中 |
| `tools` | JSON | 工具列表 | Agent工具不再存储在数据库中 |
| `is_system` | Boolean | 是否为系统Agent | 不再需要此标识 |
| `is_active` | Boolean | 是否激活 | 不再需要此状态标识 |

**保留的字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `id` | String(36) | 主键，UUID |
| `name` | String(255) | 名称（工作流名称，若上传时未填写从压缩包名称中提取） |
| `author`| String(255) | 作者 |
| `version` | String(20) | 版本号，默认"1.0.0" |
| `description` | Text | 描述信息（上传时填写，可选） |
| `created_at` | DateTime | 创建时间 |
| `updated_at` | DateTime | 更新时间 |
| `created_by` | String(36) | 创建者用户ID，外键关联users表 |

**新增字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `original_filename` | String(255) | 原始zip文件名（不含后缀，可能已自动添加序号） |
| `package_file_path` | String(500) | 原始zip文件存储路径（可为null） |
| `extracted_dir_path` | String(500) | 解压后目录存储路径（可为null） |
| `agents_md_content` | Text | AGENTS.md原始内容（可为null） |
| `agents_count` | Integer | 包内Agent数量，默认0 |
| `skills_count` | Integer | 包内Skill数量，默认0 |
| `is_public` | Boolean | 是否公开，默认false |

#### 3.1.2 数据迁移策略（重点）

由于删除了重要字段，需要制定完整的数据迁移策略：

**迁移步骤**:

1. **数据备份阶段**（迁移前）：
   - 执行完整数据库备份
   - 导出 `agents` 表所有数据为 JSON/CSV 格式
   - 保存备份文件到安全位置

2. **数据归档阶段**：
   - 创建归档表 `agents_archive_YYYYMMDD`
   - 将 `agents` 表所有数据复制到归档表
   - 验证归档数据完整性

3. **字段删除阶段**：
   - 删除 `agent_type`, `config`, `tools`, `is_system`, `is_active` 字段
   - 添加新字段 `original_filename`, `package_file_path`, `extracted_dir_path`, `agents_md_content`, `agents_count`, `skills_count`, `is_public`

4. **数据清理阶段**：
   - 对于原有的单个Agent记录，由于新功能专注于Agent包管理，建议：
     - 保留记录但标记为"遗留数据"（通过 `created_at` 日期判断）
     - 或提供导出功能让用户自行备份后删除

5. **验证阶段**：
   - 验证表结构变更正确
   - 验证新字段默认值正确
   - 验证归档表可访问

#### 3.1.3 向后兼容性处理（重点）

**兼容性策略**:

1. **API 兼容性**:
   - 旧版 API 端点保持可用但标记为 deprecated
   - 旧版 API 返回简化数据（不包含已删除字段）
   - 提供 API 版本控制（`/api/v1/` 为旧版，`/api/v2/` 为新版）

2. **前端兼容性**:
   - 原单个Agent视图暂时保留但隐藏
   - 提供数据导出功能让用户备份旧数据
   - 逐步引导用户使用新的Agent包功能

3. **模型兼容性**:
   - `to_dict()` 方法不再返回已删除字段
   - 保留字段的访问方法保持不变
   - 新增字段有合理默认值

**新增关系**:

```python
# 与 opencode_agents 的一对多关系
package_agents = relationship("OpenCodeAgent", back_populates="agent_package", cascade="all, delete-orphan")

# 与 opencode_skills 的一对多关系
package_skills = relationship("OpenCodeSkill", back_populates="agent_package")
```

**更新的 to_dict() 方法**:

```python
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
        # 新增字段
        "original_filename": self.original_filename,
        "package_file_path": self.package_file_path,
        "extracted_dir_path": self.extracted_dir_path,
        "agents_md_content": self.agents_md_content,
        "agents_count": self.agents_count,
        "skills_count": self.skills_count,
        "is_public": self.is_public,
        # 关联数据
        "package_agents": [a.to_dict() for a in self.package_agents] if self.package_agents else [],
        "package_skills": [s.to_dict() for s in self.package_skills] if self.package_skills else [],
    }
```

---

### 3.2 opencode_agents 表（新增）

**文件**: `backend/app/models/agent/opencode_agent.py`（新增类）

```python
class OpenCodeAgent(Base):
    __tablename__ = "opencode_agents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    agent_package_id = Column(String(36), ForeignKey("agents.id"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    file_name = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    file_content = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    # 关系
    agent_package = relationship("Agent", back_populates="package_agents")

    def to_dict(self):
        return {
            "id": self.id,
            "agent_package_id": self.agent_package_id,
            "name": self.name,
            "file_name": self.file_name,
            "file_path": self.file_path,
            "file_content": self.file_content,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }
```

**字段说明**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `id` | String(36) | 主键，UUID |
| `agent_package_id` | String(36) | 所属Agent包ID，外键关联agents表 |
| `name` | String(255) | Agent名称（从文件名或内容提取） |
| `file_name` | String(255) | 文件名（如 orchestrator.md） |
| `file_path` | String(500) | 文件存储路径 |
| `created_at` | DateTime | 创建时间 |

---

### 3.3 opencode_skills 表（更新）

**文件**: `backend/app/models/opencode/opencode_skill_mcp.py`

**现有字段（全部保留）**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `id` | String(36) | 主键，UUID |
| `name` | String(255) | Skill名称 |
| `version` | String(20) | 版本号 |
| `description` | Text | 描述 |
| `author` | String(255) | 作者 |
| `category` | String(100) | 分类 |
| `file_path` | String(500) | 文件路径 |
| `opencode_file_path` | String(500) | OpenCode可访问路径 |
| `file_size` | BigInteger | 文件大小 |
| `checksum` | String(64) | 校验和 |
| `config` | JSON | 配置 |
| `schema` | JSON | 模式 |
| `tags` | JSON | 标签 |
| `is_public` | Boolean | 是否公开 |
| `is_active` | Boolean | 是否激活 |
| `download_count` | Integer | 下载次数 |
| `created_at` | DateTime | 创建时间 |
| `updated_at` | DateTime | 更新时间 |
| `created_by` | String(36) | 创建者用户ID |

**新增字段**:

| 字段名 | 类型 | 说明 |
|--------|------|------|
| `agent_package_id` | String(36) | 所属Agent包ID，外键关联agents表，可为null |

**关系说明**:
- `agent_package_id` = `null` → 公共Skill（从Skill模块独立上传）
- `agent_package_id` = 有值 → 属于某个Agent包的Skill

**新增关系**:

```python
agent_package = relationship("Agent", back_populates="package_skills")
```

**更新的 to_dict() 方法**:

```python
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
```

---

### 3.4 前端 TypeScript 类型定义

**文件**: `frontend/src/shared/api/opencode.ts`（新增）

```typescript
// Agent 包类型
export interface AgentPackage {
    id: string;
    name: string;
    author?: string;
    version: string;
    description?: string;
    created_at: string;
    updated_at?: string;
    created_by?: string;
    // 新增字段
    original_filename?: string;
    package_file_path?: string;
    extracted_dir_path?: string;
    agents_md_content?: string;
    agents_count: number;
    skills_count: number;
    is_public: boolean;
    // 关联数据
    package_agents?: AgentPackageAgent[];
    package_skills?: AgentPackageSkill[];
}

// Agent 包内 Agent 类型
export interface AgentPackageAgent {
    id: string;
    agent_package_id: string;
    name: string;
    file_name: string;
    file_path: string;
    file_content?: string;
    created_at: string;
}

// Agent 包内 Skill 类型（基于 OpenCodeSkill）
export interface AgentPackageSkill {
    id: string;
    name: string;
    version: string;
    description?: string;
    author?: string;
    category: string;
    file_path?: string;
    opencode_file_path?: string;
    file_size?: number;
    checksum?: string;
    config?: Record<string, any>;
    schema?: Record<string, any>;
    tags?: string[];
    is_public: boolean;
    is_active: boolean;
    download_count: number;
    created_at: string;
    updated_at?: string;
    created_by?: string;
    agent_package_id?: string;
}
```

---

## 4. API 设计

### 4.1 API 端点概览

**文件**: `backend/app/api/v1/endpoints/opencode/agent_packages.py`（新增）

| 方法 | 端点 | 说明 | 认证 |
|------|------|------|------|
| POST | `/opencode/agent-packages/upload` | 上传 Agent 包 | ✅ |
| GET | `/opencode/agent-packages` | 获取 Agent 包列表（分页筛选） | ✅ |
| GET | `/opencode/agent-packages/{id}` | 获取单个 Agent 包详情 | ✅ |
| GET | `/opencode/agent-packages/{id}/download` | 下载 Agent 包 | ✅ |
| DELETE | `/opencode/agent-packages/{id}` | 删除 Agent 包 | ✅ |
| PUT | `/opencode/agent-packages/{id}` | 更新 Agent 包信息 | ✅ |

**废弃的旧API端点**:
- `GET /api/v1/agents` - 旧的单个Agent列表（返回空数据或归档数据）
- `POST /api/v1/agents` - 旧的创建Agent（返回410 Gone）
- `PUT /api/v1/agents/{id}` - 旧的更新Agent（返回410 Gone）
- `DELETE /api/v1/agents/{id}` - 旧的删除Agent（返回410 Gone）

### 4.2 存储路径配置

**文件**: `backend/app/core/platform_config.py` 和 `backend/app/core/config.py`（新增配置）

```python
# Agent 包存储路径配置
AGENT_PACKAGES_ZIP_STORAGE_PATH = "uploads/agent_packages/zips"
AGENT_PACKAGES_EXTRACTED_PATH = "uploads/agent_packages/extracted"
```

**目录结构**:

```
uploads/
└── agent_packages/
    ├── zips/              # 原始压缩包
    │   └── {filename}.zip
    └── extracted/         # 解压内容
        └── {filename}/
            ├── AGENTS.md
            ├── agents/
            │   └── *.md
            └── skills/
                └── {skill-name}/
                    └── SKILL.md
```

**注意**: filename 为上传的原始 zip 文件名（不含后缀），如果文件名已存在，会先删除原有记录及其文件，然后保存新文件

---

### 4.3 核心函数设计

#### 4.3.1 parse_agent_package_metadata

从 zip 内容中解析 Agent 包元数据。

**输入**: zip 文件内容（bytes）、zip 文件名

**输出**:
```python
{
    "workflow_name": "从 zip 文件名提取的工作流名称",
    "agents": [
        {"name": "Agent名称", "file_name": "文件名.md", "content": "文件内容"},
        ...
    ],
    "skills": [
        {"name": "Skill名称", "dir_name": "目录名", "frontmatter": {...}},
        ...
    ]
}
```

**处理逻辑**:
1. 验证 zip 结构
2. 从 zip 文件名提取工作流名称（移除 .zip 后缀）
3. 读取 AGENTS.md 内容（仅用于存储，不用于提取名称）
4. 扫描 agents/ 目录下的 .md 文件
5. 扫描 skills/ 目录，解析每个子目录的 SKILL.md

---

#### 4.3.2 validate_agent_package_structure

验证 Agent 包的 zip 结构是否有效。

**验证项**:
- 根目录包含 AGENTS.md
- 存在 agents/ 目录且至少有一个 .md 文件
- 存在 skills/ 目录且至少有一个子目录（每个子目录包含 SKILL.md）

---

### 4.4 API 详细设计

#### 4.4.1 POST /opencode/agent-packages/upload

上传 Agent 包。

**请求**:
- Content-Type: `multipart/form-data`
- 字段:
  - `file`: zip 文件（必填）
  - `version`: 版本号（可选，默认 "1.0.0"）
  - `description`: 描述（可选）
  - `is_public`: 是否公开（可选，默认 false）

**响应** (200 OK):
```json
{
    "id": "uuid",
    "name": "工作流名称",
    "version": "1.0.0",
    "description": "描述",
    "agents_count": 5,
    "skills_count": 8,
    "is_public": false,
    "created_at": "2026-04-28T...",
    ...
}
```

**错误响应**:
- 400 Bad Request: 文件格式错误、结构验证失败
- 413 Payload Too Large: 文件过大
- 500 Internal Server Error: 服务器错误

**处理流程**:
1. 读取上传的 zip 文件
2. 验证文件格式和结构
3. 从 zip 文件名提取工作流名称（移除 .zip 后缀）
4. 检查文件名是否已存在
5. 如果文件已存在：
   - 删除原有 `agents` 表记录及其关联的 `opencode_agents`、`opencode_skills` 记录
   - 删除原有的 zip 文件和解压目录
6. 读取 AGENTS.md 内容（仅用于存储，不用于提取名称）
7. 扫描目录内容
8. 保存 zip 文件到 `uploads/agent_packages/zips/`（使用原始文件名）
9. 解压文件到 `uploads/agent_packages/extracted/{filename}/`
10. 创建 `agents` 表记录
11. 创建 `opencode_agents` 表记录
12. 解析每个 Skill，创建 `opencode_skills` 表记录（关联 `agent_package_id`）
13. 返回创建的 Agent 包信息

---

#### 4.4.2 GET /opencode/agent-packages

获取 Agent 包列表。

**查询参数**:
- `search`: 搜索关键词（可选）
- `is_public`: 筛选公开/私有（可选）
- `page`: 页码（可选，默认 1）
- `page_size`: 每页数量（可选，默认 20）

**响应** (200 OK):
```json
{
    "items": [
        {
            "id": "uuid",
            "name": "工作流名称",
            "version": "1.0.0",
            "description": "描述",
            "agents_count": 5,
            "skills_count": 8,
            "is_public": false,
            "created_at": "2026-04-28T...",
            ...
        },
        ...
    ],
    "total": 100,
    "page": 1,
    "page_size": 20
}
```

**筛选逻辑**:
- 返回所有 agents 表记录（因为现在表只用于Agent包）
- 按 `created_at` 倒序排列

---

#### 4.4.3 GET /opencode/agent-packages/{id}

获取单个 Agent 包详情。

**响应** (200 OK):
```json
{
    "id": "uuid",
    "name": "工作流名称",
    "version": "1.0.0",
    "description": "描述",
    "agents_md_content": "AGENTS.md 原始内容",
    "agents_count": 5,
    "skills_count": 8,
    "is_public": false,
    "created_at": "2026-04-28T...",
    "package_agents": [
        {
            "id": "uuid",
            "name": "Agent名称",
            "file_name": "orchestrator.md",
            "file_content": "文件内容",
            ...
        },
        ...
    ],
    "package_skills": [
        {
            "id": "uuid",
            "name": "Skill名称",
            "version": "1.0.0",
            "description": "描述",
            "category": "security",
            ...
        },
        ...
    ]
}
```

---

#### 4.4.4 GET /opencode/agent-packages/{id}/download

下载 Agent 包。

**响应**:
- Content-Type: `application/zip`
- Content-Disposition: `attachment; filename="{filename}.zip"`

注意: filename 为上传时的原始文件名（如果有重命名则为重命名后的文件名）

---

#### 4.4.5 DELETE /opencode/agent-packages/{id}

删除 Agent 包。

**处理流程**:
1. 检查权限（仅创建者或管理员可删除）
2. 删除关联的 `opencode_agents` 记录（级联删除）
3. 删除关联的 `opencode_skills` 记录（仅 `agent_package_id` 关联的，公共 Skill 不删除）
4. 删除存储的 zip 文件
5. 删除解压的目录
6. 删除 `agents` 表记录
7. 返回成功响应

**响应** (200 OK):
```json
{
    "message": "Agent 包删除成功",
    "deleted_files": ["zip文件路径", "解压目录路径"]
}
```

---

#### 4.4.6 PUT /opencode/agent-packages/{id}

更新 Agent 包信息。

**请求体**:
```json
{
    "name": "新名称（可选）",
    "description": "新描述（可选）",
    "version": "新版本（可选）",
    "is_public": true/false（可选）
}
```

**注意**: 此端点只更新元数据，不支持重新上传或更新包内容。

---

### 4.5 API 路由注册

**文件**: `backend/app/api/v1/endpoints/opencode/__init__.py`（更新）

```python
from .sessions import router as opencode_sessions_router
from .skills import router as opencode_skills_router
from .mcp import router as opencode_mcp_router
from .audit_tasks import router as opencode_audit_tasks_router
from .agent_packages import router as opencode_agent_packages_router  # 新增

__all__ = [
    "opencode_sessions_router",
    "opencode_skills_router",
    "opencode_mcp_router",
    "opencode_audit_tasks_router",
    "opencode_agent_packages_router",  # 新增
]
```

**文件**: `backend/app/api/v1/api.py`（更新，添加路由）

---

## 5. 前端实现

### 5.1 文件结构

```
frontend/src/
├── pages/
│   └── OpenCodeResourceManager.tsx          [更新] 修改Agents标签页，专注Agent包功能
├── shared/api/
│   └── opencode.ts                          [更新] 新增类型和 API 函数
└── components/
    └── (可选) AgentPackageCard.tsx          [新增] Agent 包卡片组件
```

---

### 5.2 API 函数

**文件**: `frontend/src/shared/api/opencode.ts`（新增）

```typescript
// 上传 Agent 包
export async function uploadAgentPackage(formData: FormData): Promise<AgentPackage> {
    const response = await apiClient.post('/opencode/agent-packages/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
}

// 获取 Agent 包列表
export async function listAgentPackages(params?: {
    search?: string;
    is_public?: boolean;
    page?: number;
    page_size?: number;
}): Promise<{ items: AgentPackage[]; total: number; page: number; page_size: number }> {
    const response = await apiClient.get('/opencode/agent-packages', { params });
    return response.data;
}

// 获取 Agent 包详情
export async function getAgentPackage(id: string): Promise<AgentPackage> {
    const response = await apiClient.get(`/opencode/agent-packages/${id}`);
    return response.data;
}

// 下载 Agent 包
export async function downloadAgentPackage(id: string, original_filename: string): Promise<void> {
    const response = await apiClient.get(`/opencode/agent-packages/${id}/download`, {
        responseType: 'blob',
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${original_filename}.zip`);
    document.body.appendChild(link);
    link.click();
    link.remove();
}

// 删除 Agent 包
export async function deleteAgentPackage(id: string): Promise<void> {
    await apiClient.delete(`/opencode/agent-packages/${id}`);
}

// 更新 Agent 包
export async function updateAgentPackage(id: string, data: Partial<AgentPackage>): Promise<AgentPackage> {
    const response = await apiClient.put(`/opencode/agent-packages/${id}`, data);
    return response.data;
}
```

---

### 5.3 页面实现

**文件**: `frontend/src/pages/OpenCodeResourceManager.tsx`（更新）

#### 5.3.1 Agents Tab 更新

Agents 标签页现在专注于 Agent 包管理，移除了单个 Agent 视图切换：

```tsx
<TabsContent value="agents" className="mt-6 space-y-6">
  {/* 头部卡片 */}
  <div className="cyber-card p-0">
    <div className="cyber-card-header">
      <Terminal className="w-5 h-5 text-primary" />
      <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">
        Agent 包管理
      </h3>
      <div className="ml-auto">
        <Button onClick={() => setShowUploadDialog(true)} className="cyber-btn-primary">
          <Upload className="w-4 h-4 mr-2" />
          上传 Agent 包
        </Button>
      </div>
    </div>
    <div className="p-6">
      <p className="text-muted-foreground font-mono">
        上传、管理包含 AGENTS.md、agents/、skills/ 的完整 Agent 包
      </p>
    </div>
  </div>

  {/* 筛选区域 */}
  <div className="cyber-bg-elevated border border-border p-4 rounded-lg">
    <div className="flex flex-col sm:flex-row gap-4">
      <div className="flex-1">
        <Input
          type="text"
          placeholder="搜索 Agent 包..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="cyber-input"
        />
      </div>
      <Select value={isPublicFilter} onValueChange={setIsPublicFilter}>
        <SelectTrigger className="cyber-input w-[150px]">
          <SelectValue placeholder="全部" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">全部</SelectItem>
          <SelectItem value="true">公开</SelectItem>
          <SelectItem value="false">私有</SelectItem>
        </SelectContent>
      </Select>
    </div>
  </div>

  {/* Agent 包卡片列表 */}
  {loading ? (
    <div className="text-center py-12">
      <div className="loading-spinner w-8 h-8 mx-auto mb-4" />
      <p className="text-muted-foreground font-mono">加载中...</p>
    </div>
  ) : agentPackages.length === 0 ? (
    <div className="empty-state">
      <Terminal className="empty-state-icon" />
      <p className="empty-state-title">暂无 Agent 包</p>
      <p className="empty-state-description">上传您的第一个 Agent 包开始使用</p>
    </div>
  ) : (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {agentPackages.map((pkg) => (
        <AgentPackageCard
          key={pkg.id}
          pkg={pkg}
          onView={handleViewPackage}
          onDownload={handleDownloadPackage}
          onDelete={handleDeletePackage}
        />
      ))}
    </div>
  )}
</TabsContent>
```

#### 5.3.2 AgentPackageCard 组件

```tsx
function AgentPackageCard({
    pkg,
    onView,
    onDownload,
    onDelete,
}: {
    pkg: AgentPackage;
    onView: (pkg: AgentPackage) => void;
    onDownload: (pkg: AgentPackage) => void;
    onDelete: (pkg: AgentPackage) => void;
}) {
    return (
        <div className="cyber-card p-4 hover:border-primary transition-all group">
            <div className="flex justify-between items-start mb-3 pb-3 border-b border-border">
                <div className="flex items-start space-x-3">
                    <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/30">
                        <Terminal className="w-5 h-5 text-primary" />
                    </div>
                    <div className="flex-1">
                        <h4 className="font-bold text-sm text-foreground mb-1 group-hover:text-primary transition-colors uppercase truncate">
                            {pkg.name}
                        </h4>
                        <div className="flex items-center space-x-1 text-xs text-muted-foreground font-mono">
                            <span className="text-primary">{">"}</span>
                            <span>v{pkg.version}</span>
                        </div>
                    </div>
                </div>
                <Badge className="cyber-badge-muted">{pkg.is_public ? "公开" : "私有"}</Badge>
            </div>

            {pkg.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{pkg.description}</p>
            )}

            <div className="flex items-center gap-4 text-xs text-muted-foreground mb-3">
                <div className="flex items-center gap-1">
                    <Bot className="w-3 h-3" />
                    <span>{pkg.agents_count} Agents</span>
                </div>
                <div className="flex items-center gap-1">
                    <Code2 className="w-3 h-3" />
                    <span>{pkg.skills_count} Skills</span>
                </div>
            </div>

            <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onView(pkg)}
                    className="flex-1 h-8 cyber-btn-ghost"
                >
                    <Eye className="w-4 h-4 mr-1" />
                    查看
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDownload(pkg)}
                    className="h-8 px-2"
                >
                    <Download className="w-4 h-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onDelete(pkg)}
                    className="h-8 px-2 hover:bg-red-500/10 hover:text-red-400"
                >
                    <Trash2 className="w-4 h-4" />
                </Button>
            </div>
        </div>
    );
}
```

#### 5.3.3 详情对话框

显示 Agent 包的详细信息，包括：
- AGENTS.md 内容预览
- Agents 列表（可点击查看内容）
- Skills 列表

---

## 6. 安全考虑

### 6.1 文件上传安全

1. **文件格式验证**:
   - 仅接受 `.zip` 扩展名
   - 验证 zip 文件的魔数（magic number）

2. **路径遍历防护**:
   - 解压前检查所有文件路径，禁止包含 `..` 或绝对路径
   - 使用安全的解压库

3. **文件大小限制**:
   - 配置最大文件大小限制
   - 过大文件返回 413 错误

4. **内容验证**:
   - 验证 zip 结构符合预期（AGENTS.md、agents/、skills/）
   - 防止恶意文件上传

### 6.2 访问控制

1. **认证**: 所有 API 端点需要认证
2. **授权**:
   - 删除操作仅允许创建者或管理员
   - 私有 Agent 包仅创建者可见
   - 公开 Agent 包所有用户可见

### 6.3 数据安全

1. **文件隔离**: Agent 包文件存储在独立目录，与其他文件隔离
2. **清理机制**: 删除时确保所有相关文件被清理
3. **校验和**: 保存文件时计算并存储校验和，用于完整性验证

### 6.4 数据迁移安全

1. **备份验证**: 迁移前验证备份完整性
2. **归档访问**: 归档表设置为只读，防止意外修改
3. **回滚准备**: 准备完整的回滚脚本，可快速恢复到迁移前状态

---

## 7. 测试计划

### 7.1 功能测试

**后端测试**:
- [ ] Agent 包上传功能（正常 zip）
- [ ] Agent 包上传功能（无效格式）
- [ ] Agent 包上传功能（结构不完整）
- [ ] Agent 包列表查询（分页、筛选）
- [ ] Agent 包详情查询
- [ ] Agent 包下载
- [ ] Agent 包删除（级联删除验证）
- [ ] Agent 包信息更新
- [ ] Skill 解析逻辑（从 SKILL.md 提取 frontmatter）

**前端测试**:
- [ ] Agents标签页正常显示Agent包管理界面
- [ ] Agent包视图上传对话框功能正常
- [ ] Agent包视图卡片列表正常显示
- [ ] Agent包视图筛选和搜索功能正常
- [ ] Agent包视图详情对话框正常显示
- [ ] Agent包视图下载功能正常
- [ ] Agent包视图删除功能正常（含确认提示）

### 7.2 兼容性测试

- [ ] 现有 Skill 管理功能不受影响（agent_package_id = null）
- [ ] 数据库迁移正常执行
- [ ] 归档表数据完整可访问
- [ ] 旧API端点正确返回 deprecated 响应

### 7.3 数据迁移测试

- [ ] 备份脚本正常执行
- [ ] 归档表创建成功
- [ ] 字段删除和新增操作成功
- [ ] 数据完整性验证通过
- [ ] 回滚脚本正常执行

### 7.4 安全测试

- [ ] 路径遍历攻击防护验证
- [ ] 恶意文件上传防护验证
- [ ] 访问控制验证（私有包、删除权限）
- [ ] 大文件上传处理验证
- [ ] 归档数据访问权限验证

---

## 8. 部署说明

### 8.1 数据库迁移（重点）

创建 Alembic 迁移脚本，按以下顺序执行：

**迁移脚本步骤**:

1. **创建归档表**:
   ```sql
   CREATE TABLE agents_archive_YYYYMMDD AS SELECT * FROM agents;
   ```

2. **删除旧字段**:
   ```sql
   ALTER TABLE agents DROP COLUMN IF EXISTS agent_type;
   ALTER TABLE agents DROP COLUMN IF EXISTS config;
   ALTER TABLE agents DROP COLUMN IF EXISTS tools;
   ALTER TABLE agents DROP COLUMN IF EXISTS is_system;
   ALTER TABLE agents DROP COLUMN IF EXISTS is_active;
   ```

3. **添加新字段**:
   ```sql
   ALTER TABLE agents ADD COLUMN original_filename VARCHAR(255);
   ALTER TABLE agents ADD COLUMN package_file_path VARCHAR(500);
   ALTER TABLE agents ADD COLUMN extracted_dir_path VARCHAR(500);
   ALTER TABLE agents ADD COLUMN agents_md_content TEXT;
   ALTER TABLE agents ADD COLUMN agents_count INTEGER DEFAULT 0;
   ALTER TABLE agents ADD COLUMN skills_count INTEGER DEFAULT 0;
   ALTER TABLE agents ADD COLUMN is_public BOOLEAN DEFAULT FALSE;
   ```

4. **创建 opencode_agents 表**:
   ```sql
   CREATE TABLE opencode_agents (
       id VARCHAR(36) PRIMARY KEY,
       agent_package_id VARCHAR(36) NOT NULL REFERENCES agents(id),
       name VARCHAR(255) NOT NULL,
       file_name VARCHAR(255) NOT NULL,
       file_path VARCHAR(500) NOT NULL,
       file_content TEXT,
       created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
   );
   CREATE INDEX idx_opencode_agents_agent_package_id ON opencode_agents(agent_package_id);
   ```

5. **为 opencode_skills 添加 agent_package_id 字段**:
   ```sql
   ALTER TABLE opencode_skills ADD COLUMN agent_package_id VARCHAR(36) REFERENCES agents(id);
   CREATE INDEX idx_opencode_skills_agent_package_id ON opencode_skills(agent_package_id);
   ```

### 8.2 部署步骤

1. **预部署准备**:
   - 执行完整数据库备份
   - 准备回滚脚本
   - 通知用户系统维护时间

2. **后端部署**:
   - 创建新的数据库模型
   - 生成并执行数据库迁移
   - 验证迁移成功
   - 新增 API 模块
   - 更新路由注册
   - 配置存储目录
   - 验证 API 功能正常

3. **前端部署**:
   - 更新 API 类型定义
   - 更新 OpenCodeResourceManager 页面
   - 修改 Agents 标签页，专注 Agent 包功能
   - 实现 Agent 包视图的所有功能

4. **验证**:
   - 测试 Agents 标签页功能正常
   - 测试 Agent 包上传功能
   - 测试 Agent 包列表和详情
   - 测试 Agent 包删除功能
   - 验证 Skill 管理功能不受影响
   - 验证归档表可访问

5. **部署完成**:
   - 通知用户系统恢复
   - 监控系统运行状态

### 8.3 回滚计划

如果出现问题，按以下顺序回滚：

1. **停止服务**: 暂停前端和后端服务
2. **恢复数据库**: 从备份恢复数据库或执行回滚脚本
3. **回滚代码**: 部署前一版本的代码
4. **验证恢复**: 验证系统功能正常
5. **重启服务**: 启动前端和后端服务
6. **通知用户**: 告知用户回滚完成

回滚脚本示例：
```sql
-- 删除新表和新字段
DROP TABLE IF EXISTS opencode_agents;
ALTER TABLE opencode_skills DROP COLUMN IF EXISTS agent_package_id;
ALTER TABLE agents DROP COLUMN IF EXISTS original_filename;
ALTER TABLE agents DROP COLUMN IF EXISTS package_file_path;
ALTER TABLE agents DROP COLUMN IF EXISTS extracted_dir_path;
ALTER TABLE agents DROP COLUMN IF EXISTS agents_md_content;
ALTER TABLE agents DROP COLUMN IF EXISTS agents_count;
ALTER TABLE agents DROP COLUMN IF EXISTS skills_count;
ALTER TABLE agents DROP COLUMN IF EXISTS is_public;

-- 从归档表恢复数据
DROP TABLE IF EXISTS agents;
CREATE TABLE agents AS SELECT * FROM agents_archive_YYYYMMDD;

-- 重建索引（如需要）
```

---

## 9. 附录

### 9.1 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 更新 | `backend/app/models/agent/opencode_agent.py` | Agent 模型删除字段、新增字段和关系，新增 OpenCodeAgent 类 |
| 更新 | `backend/app/models/opencode/opencode_skill_mcp.py` | OpenCodeSkill 模型新增 agent_package_id 字段 |
| 更新 | `backend/app/models/__init__.py` | 导出新模型 |
| 新增 | `backend/app/api/v1/endpoints/opencode/agent_packages.py` | Agent 包 API 模块 |
| 更新 | `backend/app/api/v1/endpoints/opencode/__init__.py` | 导出新路由 |
| 更新 | `backend/app/api/v1/api.py` | 注册新路由 |
| 更新 | `backend/app/core/config.py` | 新增存储路径配置 |
| 更新 | `backend/app/core/platform_config.py` | 新增存储路径配置 |
| 更新 | `frontend/src/shared/api/opencode.ts` | 新增类型定义和 API 函数 |
| 更新 | `frontend/src/pages/OpenCodeResourceManager.tsx` | 修改 Agents 标签页，专注 Agent 包功能 |

### 9.2 参考示例

参考 `docs/example/cloudecore-audit/` 目录的结构：
```
cloudecore-audit/
├── AGENTS.md
├── agents/
│   └── trace-resolver.md
└── skills/
    ├── project-analyzer/
    │   └── SKILL.md
    ├── orchestrator-audit/
    │   └── SKILL.md
    ├── go-audit-detector/
    │   └── SKILL.md
    ├── go-audit-judge/
    │   └── SKILL.md
    └── ...
```

### 9.3 图标映射

| 元素 | 图标组件 | 说明 |
|------|---------|------|
| Agent 包卡片 | `Terminal` | 终端图标 |
| Agents 计数 | `Bot` | 机器人图标 |
| Skills 计数 | `Code2` | 代码图标 |

### 9.4 字段删除影响汇总

| 影响范围 | 影响描述 | 处理措施 |
|---------|---------|---------|
| 数据库 | agents 表删除5个字段 | 数据归档 + 迁移脚本 |
| 后端模型 | Agent 类移除相应属性 | 更新 to_dict() 方法 |
| API | 旧端点不再可用 | 标记 deprecated + 返回410 |
| 前端 | 单个Agent管理功能移除 | 专注Agent包管理 |
| 现有数据 | 旧Agent记录需要处理 | 归档保留 + 提供导出 |

---

**文档结束**
