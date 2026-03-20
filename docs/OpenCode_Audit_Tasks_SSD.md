# OpenCode审计任务功能 - SSD规范文档

## 文档信息

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-20 | DeepAudit Team | 初始版本 - 在现有AuditTasks页面添加OpenCode审计tab |

---

## 目录

1. [功能规范（Spec）](#1-功能规范spec)
2. [技术架构设计（Architecture）](#2-技术架构设计architecture)
3. [数据模型设计（Data Model）](#3-数据模型设计data-model)
4. [API接口规范（API Contracts）](#4-api接口规范api-contracts)
5. [前端界面设计（UI/UX）](#5-前端界面设计uiux)
6. [技术实施计划（Implementation Plan）](#6-技术实施计划implementation-plan)
7. [关键验证场景（Testing）](#7-关键验证场景testing)
8. [可执行任务清单（Tasks）](#8-可执行任务清单tasks)

---

## 1. 功能规范（Spec）

### 1.1 功能概述

**用户故事**：
> 作为一个DeepAudit用户，我希望在现有的"审计任务"页面中，除了"快速审计"和"AGENT审计"之外，还能看到第三个tab："OPENCODE审计"，这样我就可以在同一个页面中查看和管理所有类型的审计任务，包括OpenCode审计任务。

### 1.2 核心需求

#### 需求1：OpenCode审计任务数据模型
- 模仿AuditTask和AgentTask创建OpenCodeAuditTask数据模型
- 支持创建、读取、更新、删除（CRUD）OpenCode审计任务
- 支持任务状态管理（pending、running、completed、failed、cancelled）
- 支持任务进度跟踪
- 支持关联项目和用户
- 持久化存储到数据库

#### 需求2：在AuditTasks页面添加第三个tab
- 在现有的AuditTasks页面中添加"OPENCODE审计"tab
- tab样式与"快速审计"和"AGENT审计"保持一致
- 使用卡片式设计，带有统计数据和运行中指示
- 支持tab切换，显示对应的任务列表

#### 需求3：OpenCode任务列表展示
- 展示OpenCode审计任务列表
- 支持按状态筛选（全部、运行中、已完成、失败）
- 支持搜索功能
- 显示任务卡片，包含：状态徽章、任务名称、项目名称、进度条、操作按钮

#### 需求4：任务统计和实时更新
- 显示OpenCode任务的统计数据（总任务数、已完成、运行中、失败）
- 支持任务状态实时更新（轮询机制）
- 支持任务取消操作

### 1.3 验收标准（Acceptance Criteria）

**AC1: 数据模型和持久化**
- [x] 创建`opencode_audit_tasks`数据表，模仿AuditTask和AgentTask
- [x] 支持完整的CRUD操作
- [x] 支持任务状态流转
- [x] 数据持久化存储

**AC2: API接口**
- [x] 创建OpenCode审计任务的API端点
- [x] 获取任务列表的API端点
- [x] 获取任务详情的API端点
- [x] 更新任务状态的API端点
- [x] 删除任务的API端点

**AC3: 前端界面 - AuditTasks页面tab**
- [x] 在AuditTasks页面添加第三个tab："OPENCODE审计"
- [x] tab样式与现有tab保持一致（卡片式设计）
- [x] 显示OpenCode任务统计数据
- [x] 支持tab切换功能

**AC4: 前端界面 - OpenCode任务列表**
- [x] 显示OpenCode审计任务列表
- [x] 支持按状态筛选
- [x] 支持搜索功能
- [x] UI风格与现有系统一致

**AC5: 功能集成**
- [x] 与项目系统集成
- [x] 与用户系统集成
- [x] 支持任务状态实时更新（轮询）

### 1.4 用户体验流程

```
用户登录系统
    ↓
点击sidebar中的"审计任务"
    ↓
显示AuditTasks页面，包含3个tab：
    - Agent智能审计
    - 快速扫描任务
    - OPENCODE审计 ← 新增
    ↓
点击"OPENCODE审计"tab
    ↓
显示OpenCode审计任务列表
    ↓
（可选）使用筛选器或搜索功能
    ↓
点击某个任务查看详情
```

### 1.5 非功能性需求

| 需求类型 | 具体要求 |
|---------|---------|
| 性能 | 任务列表加载时间 < 2秒（100条记录） |
| 可用性 | 支持至少1000个并发任务记录 |
| 可靠性 | 数据持久化保证，支持事务 |
| 用户体验 | 与现有UI风格完全一致 |
| 可扩展性 | 预留字段支持未来功能扩展 |

---

## 2. 技术架构设计（Architecture）

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    前端层 (Frontend)                              │
├─────────────────────────────────────────────────────────────────────┤
│  AuditTasksPage (审计任务页面 - 包含3个tab)                       │
│  ├── Tab 1: Agent智能审计 (现有的)                               │
│  ├── Tab 2: 快速扫描任务 (现有的)                                 │
│  └── Tab 3: OPENCODE审计 ← 新增                                  │
│      └── OpenCode任务列表展示                                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    API层 (FastAPI)                                │
├─────────────────────────────────────────────────────────────────────┤
│  /api/v1/opencode-audit-tasks (CRUD操作)                         │
│  /api/v1/opencode-audit-tasks/{id} (单个任务操作)                 │
│  /api/v1/opencode-audit-tasks/{id}/status (状态更新)              │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                  数据层 (Database)                                │
├─────────────────────────────────────────────────────────────────────┤
│  audit_tasks (快速审计任务 - 现有的)                              │
│  agent_tasks (Agent审计任务 - 现有的)                             │
│  opencode_audit_tasks (OpenCode审计任务 - 新增) ←                 │
│  projects (项目表 - 关联)                                          │
│  users (用户表 - 关联)                                             │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 技术栈选择

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 后端 | FastAPI + SQLAlchemy (异步) | 现有技术栈，保持一致 |
| 数据库 | PostgreSQL | 现有数据库 |
| 数据库迁移 | Alembic | 现有迁移工具 |
| 前端 | React 18 + TypeScript | 现有技术栈 |
| 前端UI | shadcn/ui + Tailwind CSS | 现有组件库，保持风格一致 |
| 前端路由 | React Router | 现有路由方案 |
| 前端状态管理 | React Query | 现有状态管理 |

### 2.3 组件分解

#### 2.3.1 后端组件

| 组件名称 | 文件路径 | 职责 | 状态 | 参考 |
|---------|---------|------|------|------|
| OpenCodeAuditTask Model | `backend/app/models/opencode_audit_task.py` | 数据模型 | ✅ 需新建 | AuditTask, AgentTask |
| OpenCodeAuditTask API | `backend/app/api/v1/endpoints/opencode_audit_tasks.py` | API端点 | ✅ 需新建 | agent_tasks.py |
| 数据库迁移 | `backend/alembic/versions/011_add_opencode_audit_tables.py` | 迁移脚本 | ✅ 需新建 | - |
| 模型导出 | `backend/app/models/__init__.py` | 导出新模型 | ✅ 需修改 | - |
| API注册 | `backend/app/api/v1/api.py` | 注册路由 | ✅ 需修改 | - |

#### 2.3.2 前端组件

| 组件名称 | 文件路径 | 职责 | 参考 |
|---------|---------|------|--------|
| API客户端 | `frontend/src/shared/api/opencodeAuditTasks.ts` | API调用 | agentTasks.ts |
| AuditTasks页面tab更新 | `frontend/src/pages/AuditTasks.tsx` | 添加第三个tab | 现有文件 |
| OpenCode任务列表 | `frontend/src/pages/AuditTasks.tsx` | 在tab中展示列表 | 现有实现 |

---

## 3. 数据模型设计（Data Model）

### 3.1 数据库表结构

#### 3.1.1 opencode_audit_tasks表（新增）

**设计参考**：结合AuditTask和AgentTask的设计

```sql
CREATE TABLE opencode_audit_tasks (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    created_by VARCHAR(36) REFERENCES users(id) NOT NULL,
    
    -- 任务基本信息（参考AuditTask）
    name VARCHAR(255),
    description TEXT,
    task_type VARCHAR(50) DEFAULT 'opencode_audit',
    
    -- 分支信息（参考AgentTask）
    branch_name VARCHAR(255),
    
    -- OpenCode相关
    opencode_session_id VARCHAR(36),
    opencode_prompt_template_id VARCHAR(36) REFERENCES prompt_templates(id),
    prompt_content TEXT,
    
    -- 任务配置
    audit_config JSON,
    target_files JSON,
    exclude_patterns JSON,
    
    -- 状态（参考两者）
    status VARCHAR(20) DEFAULT 'pending',
    current_step VARCHAR(255),
    error_message TEXT,
    
    -- 进度统计（参考AuditTask）
    total_files INTEGER DEFAULT 0,
    processed_files INTEGER DEFAULT 0,
    total_lines INTEGER DEFAULT 0,
    findings_count INTEGER DEFAULT 0,
    
    -- 严重程度统计（参考AgentTask）
    critical_count INTEGER DEFAULT 0,
    high_count INTEGER DEFAULT 0,
    medium_count INTEGER DEFAULT 0,
    low_count INTEGER DEFAULT 0,
    
    -- 质量评分（参考AuditTask）
    quality_score FLOAT DEFAULT 0.0,
    security_score FLOAT DEFAULT 0.0,
    
    -- 结果
    result_summary TEXT,
    findings JSON,
    
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE
);

-- 索引
CREATE INDEX idx_opencode_audit_tasks_project_id ON opencode_audit_tasks(project_id);
CREATE INDEX idx_opencode_audit_tasks_status ON opencode_audit_tasks(status);
CREATE INDEX idx_opencode_audit_tasks_created_at ON opencode_audit_tasks(created_at);
CREATE INDEX idx_opencode_audit_tasks_created_by ON opencode_audit_tasks(created_by);
```

### 3.2 Python数据模型

```python
"""
OpenCode审计任务模型
模仿AuditTask和AgentTask的设计
支持OpenCode审计任务的持久化存储
"""

import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import (
    Column, String, Integer, Float, Text, Boolean, 
    DateTime, ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base

if TYPE_CHECKING:
    from .project import Project
    from .user import User


class OpenCodeAuditTaskStatus:
    """OpenCode审计任务状态（参考AgentTaskStatus）"""
    PENDING = "pending"           # 等待执行
    RUNNING = "running"           # 运行中
    COMPLETED = "completed"       # 已完成
    FAILED = "failed"             # 失败
    CANCELLED = "cancelled"       # 已取消


class OpenCodeAuditTask(Base):
    """OpenCode审计任务
    结合AuditTask和AgentTask的设计特点
    """
    __tablename__ = "opencode_audit_tasks"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    
    # 任务基本信息（参考AuditTask）
    name = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    task_type = Column(String(50), default="opencode_audit")
    
    # 分支信息（参考AgentTask）
    branch_name = Column(String(255), nullable=True)
    
    # OpenCode相关
    opencode_session_id = Column(String(36), nullable=True)
    opencode_prompt_template_id = Column(String(36), ForeignKey("prompt_templates.id"), nullable=True)
    prompt_content = Column(Text, nullable=True)
    
    # 任务配置
    audit_config = Column(JSON, nullable=True)
    target_files = Column(JSON, nullable=True)
    exclude_patterns = Column(JSON, nullable=True)
    
    # 状态
    status = Column(String(20), default=OpenCodeAuditTaskStatus.PENDING)
    current_step = Column(String(255), nullable=True)
    error_message = Column(Text, nullable=True)
    
    # 进度统计（参考AuditTask）
    total_files = Column(Integer, default=0)
    processed_files = Column(Integer, default=0)  # 类似scanned_files
    total_lines = Column(Integer, default=0)
    findings_count = Column(Integer, default=0)  # 类似issues_count
    
    # 严重程度统计（参考AgentTask）
    critical_count = Column(Integer, default=0)
    high_count = Column(Integer, default=0)
    medium_count = Column(Integer, default=0)
    low_count = Column(Integer, default=0)
    
    # 质量评分（参考AuditTask）
    quality_score = Column(Float, default=0.0)
    security_score = Column(Float, default=0.0)
    
    # 结果
    result_summary = Column(Text, nullable=True)
    findings = Column(JSON, nullable=True)
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # 关联关系
    project = relationship("Project", back_populates="opencode_audit_tasks")
    creator = relationship("User")
    
    def __repr__(self):
        return f"<OpenCodeAuditTask {self.id} - {self.status}>"
    
    @property
    def progress_percentage(self) -> float:
        """计算进度百分比（参考AgentTask）"""
        if self.status == OpenCodeAuditTaskStatus.COMPLETED:
            return 100.0
        if self.status in [OpenCodeAuditTaskStatus.FAILED, OpenCodeAuditTaskStatus.CANCELLED]:
            return 0.0
        if self.total_files > 0:
            return min((self.processed_files / self.total_files) * 100, 99.0)
        return 0.0
```

### 3.3 Project模型更新

需要在Project模型中添加与OpenCodeAuditTask的关联关系：

```python
# 在 backend/app/models/project.py 中添加
opencode_audit_tasks = relationship("OpenCodeAuditTask", back_populates="project", cascade="all, delete-orphan")
```

### 3.4 状态机定义

#### OpenCodeAuditTask状态流转

```
pending (待处理)
    ↓
running (运行中)
    ↓
    ├─→ completed (已完成)
    ├─→ failed (失败)
    └─→ cancelled (已取消)
```

### 3.5 前端类型定义

```typescript
// OpenCode审计任务状态
export type OpenCodeAuditTaskStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

// OpenCode审计任务接口（结合AuditTask和AgentTask）
export interface OpenCodeAuditTask {
  id: string;
  project_id: string;
  created_by: string;
  
  // 任务基本信息
  name?: string;
  description?: string;
  task_type: string;
  
  // 分支信息
  branch_name?: string;
  
  // OpenCode相关
  opencode_session_id?: string;
  opencode_prompt_template_id?: string;
  prompt_content?: string;
  
  // 任务配置
  audit_config?: Record<string, any>;
  target_files?: string[];
  exclude_patterns?: string[];
  
  // 状态
  status: OpenCodeAuditTaskStatus;
  current_step?: string;
  error_message?: string;
  
  // 进度统计
  total_files: number;
  processed_files: number;
  total_lines: number;
  findings_count: number;
  
  // 严重程度统计
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  
  // 质量评分
  quality_score: number;
  security_score: number;
  
  // 结果
  result_summary?: string;
  findings?: Record<string, any>;
  
  // 时间戳
  created_at: string;
  updated_at?: string;
  started_at?: string;
  completed_at?: string;
  
  // 关联数据（可选）
  project?: {
    id: string;
    name: string;
  };
  creator?: {
    id: string;
    username: string;
  };
}

// 创建任务请求
export interface CreateOpenCodeAuditTaskRequest {
  project_id: string;
  name?: string;
  description?: string;
  branch_name?: string;
  opencode_prompt_template_id?: string;
  prompt_content?: string;
  audit_config?: Record<string, any>;
  target_files?: string[];
  exclude_patterns?: string[];
}

// 更新任务请求
export interface UpdateOpenCodeAuditTaskRequest {
  name?: string;
  description?: string;
  status?: OpenCodeAuditTaskStatus;
  current_step?: string;
  processed_files?: number;
  findings_count?: number;
}

// 状态更新请求
export interface UpdateOpenCodeAuditTaskStatusRequest {
  status: OpenCodeAuditTaskStatus;
  current_step?: string;
  error_message?: string;
  processed_files?: number;
  findings_count?: number;
  critical_count?: number;
  high_count?: number;
  medium_count?: number;
  low_count?: number;
}

// 列表查询参数
export interface OpenCodeAuditTaskListParams {
  page?: number;
  page_size?: number;
  status?: OpenCodeAuditTaskStatus;
  project_id?: string;
  search?: string;
  ordering?: string;
}

// 列表响应
export interface OpenCodeAuditTaskListResponse {
  items: OpenCodeAuditTask[];
  total: number;
  page: number;
  page_size: number;
}
```

---

## 4. API接口规范（API Contracts）

### 4.1 REST API端点

#### 4.1.1 获取OpenCode审计任务列表

**端点**：`GET /api/v1/opencode-audit-tasks`

**查询参数**：
- `page`: 页码（默认1）
- `page_size`: 每页数量（默认20）
- `status`: 状态筛选
- `project_id`: 项目ID筛选
- `search`: 搜索关键词
- `ordering`: 排序字段

**响应**（200 OK）：
```json
{
  "items": [
    {
      "id": "uuid",
      "project_id": "uuid",
      "name": "OpenCode审计任务",
      "status": "running",
      "created_at": "2026-03-20T10:00:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "page_size": 20
}
```

#### 4.1.2 创建OpenCode审计任务

**端点**：`POST /api/v1/opencode-audit-tasks`

**请求体**：
```json
{
  "project_id": "uuid",
  "name": "OpenCode审计任务",
  "description": "这是一个OpenCode审计任务",
  "branch_name": "main",
  "opencode_prompt_template_id": "uuid",
  "prompt_content": "自定义提示词内容",
  "audit_config": {},
  "target_files": ["file1.py", "file2.py"],
  "exclude_patterns": ["**/test/**"]
}
```

**响应**（201 Created）：
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "name": "OpenCode审计任务",
  "status": "pending",
  "created_at": "2026-03-20T10:00:00Z"
}
```

#### 4.1.3 获取单个OpenCode审计任务

**端点**：`GET /api/v1/opencode-audit-tasks/{task_id}`

**响应**（200 OK）：
```json
{
  "id": "uuid",
  "project_id": "uuid",
  "name": "OpenCode审计任务",
  "description": "这是一个OpenCode审计任务",
  "status": "running",
  "current_step": "分析文件中...",
  "total_files": 100,
  "processed_files": 50,
  "findings_count": 5,
  "created_at": "2026-03-20T10:00:00Z",
  "started_at": "2026-03-20T10:05:00Z"
}
```

#### 4.1.4 更新OpenCode审计任务

**端点**：`PUT /api/v1/opencode-audit-tasks/{task_id}`

**请求体**：
```json
{
  "name": "更新后的任务名称",
  "description": "更新后的描述"
}
```

**响应**（200 OK）：
```json
{
  "id": "uuid",
  "name": "更新后的任务名称",
  "updated_at": "2026-03-20T10:10:00Z"
}
```

#### 4.1.5 更新任务状态

**端点**：`PATCH /api/v1/opencode-audit-tasks/{task_id}/status`

**请求体**：
```json
{
  "status": "running",
  "current_step": "正在分析文件...",
  "processed_files": 60,
  "findings_count": 6
}
```

**响应**（200 OK）：
```json
{
  "id": "uuid",
  "status": "running",
  "current_step": "正在分析文件...",
  "updated_at": "2026-03-20T10:15:00Z"
}
```

#### 4.1.6 删除OpenCode审计任务

**端点**：`DELETE /api/v1/opencode-audit-tasks/{task_id}`

**响应**（204 No Content）

---

## 5. 前端界面设计（UI/UX）

### 5.1 AuditTasks页面tab更新

#### 5.1.1 TaskTab类型更新

```typescript
// 修改前
type TaskTab = "regular" | "agent";

// 修改后
type TaskTab = "regular" | "agent" | "opencode";
```

#### 5.1.2 添加OpenCode任务状态管理

```typescript
// 在AuditTasks组件中添加
const [openCodeTasks, setOpenCodeTasks] = useState<OpenCodeAuditTask[]>([]);
const [openCodeLoading, setOpenCodeLoading] = useState(true);
```

#### 5.1.3 添加OpenCode统计数据

```typescript
const openCodeStats = {
  total: openCodeTasks.length,
  completed: openCodeTasks.filter(t => t.status === 'completed').length,
  running: openCodeTasks.filter(t => t.status === 'running').length,
  failed: openCodeTasks.filter(t => t.status === 'failed').length,
};
```

### 5.2 Tab切换卡片设计（3个卡片）

#### 5.2.1 网格布局更新

```typescript
// 修改前
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">

// 修改后
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
```

#### 5.2.2 OPENCODE审计tab卡片

使用紫色/品红色主题（区别于Agent的青色和快速扫描的蓝绿色），参考现有卡片设计：

- 图标：使用Code2或Terminal图标
- 背景渐变：从紫色/品红色开始
- 边框：紫色/品红色
- 统计数据显示：总任务数、已完成、失败数
- 运行中指示：如果有运行中的任务，显示动画徽章

### 5.3 OpenCode任务列表展示

#### 5.3.1 任务卡片设计

每个OpenCode任务卡片包含：
- 状态徽章（pending/running/completed/failed/cancelled）
- 任务名称
- 项目名称
- 进度条（processed_files / total_files）
- 统计数据：总文件数、已处理、发现数、安全评分
- 创建时间
- 操作按钮（查看详情、取消等）

#### 5.3.2 筛选和搜索

- 搜索框：搜索任务名称或项目名称
- 状态筛选按钮：全部、运行中、已完成、失败
- 与现有tab的筛选功能保持一致

### 5.4 实时更新和轮询

添加OpenCode任务的自动刷新机制（静默更新，不显示loading）：

```typescript
// 自动刷新OpenCode任务
useEffect(() => {
  const activeOpenCodeTasks = openCodeTasks.filter(
    task => task.status === 'running' || task.status === 'pending'
  );
  if (activeOpenCodeTasks.length === 0) return;
  const intervalId = setInterval(() => loadOpenCodeTasks(true), 5000);
  return () => clearInterval(intervalId);
}, [openCodeTasks.map(t => t.id + t.status).join(',')]);
```

---

## 6. 技术实施计划（Implementation Plan）

### 6.1 实施阶段分解

#### 阶段1：后端数据模型和API
- [ ] 创建数据模型 `opencode_audit_task.py`
- [ ] 在 `__init__.py` 中导出新模型
- [ ] 更新 `project.py` 添加关联关系
- [ ] 创建数据库迁移文件
- [ ] 创建API端点文件
- [ ] 在 `api.py` 中注册API路由

#### 阶段2：前端基础架构
- [ ] 创建API客户端 `opencodeAuditTasks.ts`
- [ ] 在 `AuditTasks.tsx` 中添加第三个tab
- [ ] 添加OpenCode任务状态管理
- [ ] 添加OpenCode任务加载函数
- [ ] 添加OpenCode任务统计数据

#### 阶段3：UI/UX和测试
- [ ] 添加OPENCODE审计tab卡片
- [ ] 添加OpenCode任务列表展示
- [ ] 添加筛选和搜索功能
- [ ] 添加实时更新和轮询机制
- [ ] 编写单元测试
- [ ] 集成测试

### 6.2 时间估算

| 阶段 | 工作量 | 状态 |
|-----|--------|------|
| 阶段1：后端数据模型和API | 4小时 | ⏳ 待开始 |
| 阶段2：前端基础架构 | 3小时 | ⏳ 待开始 |
| 阶段3：UI/UX和测试 | 3小时 | ⏳ 待开始 |
| **总计** | **10小时** | |

---

## 7. 关键验证场景（Testing）

### 7.1 功能测试场景

#### 场景1：AuditTasks页面3个tab显示
**步骤**：
1. 登录系统
2. 点击sidebar中的"审计任务"
3. 验证页面显示3个tab卡片

**预期结果**：
- 显示"Agent智能审计"tab
- 显示"快速扫描任务"tab
- 显示"OPENCODE审计"tab ← 新增
- 三个tab样式一致

#### 场景2：切换到OPENCODE审计tab
**步骤**：
1. 在AuditTasks页面
2. 点击"OPENCODE审计"tab卡片
3. 验证tab切换和内容显示

**预期结果**：
- tab切换成功
- 显示OpenCode任务列表
- 显示OpenCode任务统计数据
- 筛选和搜索功能正常

#### 场景3：查看OpenCode任务列表
**步骤**：
1. 切换到"OPENCODE审计"tab
2. 查看任务列表
3. 使用筛选和搜索功能

**预期结果**：
- 任务列表正常显示
- 筛选和搜索功能正常工作
- 任务卡片样式与现有一致

#### 场景4：任务状态实时更新
**步骤**：
1. 启动一个OpenCode任务
2. 观察状态从pending → running → completed
3. 验证进度更新

**预期结果**：
- 状态正确流转
- 进度实时更新
- 统计数据自动更新

### 7.2 性能测试场景

| 测试项 | 目标 | 验证方法 |
|-------|------|---------|
| 3个tab加载 | < 2秒 | 加载页面，测量时间 |
| 任务列表加载 | < 2秒（100条记录） | 加载100条任务，测量时间 |
| 状态更新延迟 | < 1秒 | 测量状态更新到UI显示的时间 |

---

## 8. 可执行任务清单（Tasks）

### 8.1 后端任务

- [ ] 创建数据模型文件 `backend/app/models/opencode_audit_task.py`
- [ ] 在 `backend/app/models/__init__.py` 中导出新模型
- [ ] 更新 `backend/app/models/project.py` 添加关联关系
- [ ] 创建数据库迁移文件 `backend/alembic/versions/011_add_opencode_audit_tables.py`
- [ ] 创建API端点文件 `backend/app/api/v1/endpoints/opencode_audit_tasks.py`
- [ ] 在 `backend/app/api/v1/api.py` 中注册API路由

### 8.2 前端任务

- [ ] 创建API客户端 `frontend/src/shared/api/opencodeAuditTasks.ts`
- [ ] 修改 `frontend/src/pages/AuditTasks.tsx`：
  - [ ] 更新TaskTab类型，添加"opencode"
  - [ ] 添加OpenCode任务状态管理
  - [ ] 添加OpenCode任务加载函数
  - [ ] 添加第三个tab卡片（OPENCODE审计）
  - [ ] 更新网格布局为3列
  - [ ] 添加OpenCode任务列表展示
  - [ ] 添加OpenCode任务统计数据
  - [ ] 添加实时更新和轮询机制

### 8.3 文档任务

- [x] 生成SSD规范文档 `docs/OpenCode_Audit_Tasks_SSD.md`

---

## 附录

### A. 术语表

| 术语 | 说明 |
|------|------|
| OpenCode | DeepAudit集成的代码审计环境 |
| SSD | Specification-Driven Development，规范驱动开发 |
| CRUD | Create, Read, Update, Delete - 增删改查 |
| API | Application Programming Interface - 应用程序接口 |
| UI | User Interface - 用户界面 |
| Tab | 标签页，用于在不同内容之间切换 |

### B. 参考文件

| 文件路径 | 说明 |
|---------|------|
| `backend/app/models/audit.py` | AuditTask模型参考 |
| `backend/app/models/agent_task.py` | AgentTask模型参考 |
| `backend/app/api/v1/endpoints/agent_tasks.py` | Agent任务API参考 |
| `frontend/src/pages/AuditTasks.tsx` | AuditTasks页面，需要修改 |
| `frontend/src/shared/api/agentTasks.ts` | Agent任务API客户端参考 |

### C. 部署清单

- [ ] 运行数据库迁移 `alembic upgrade head`
- [ ] 重启后端服务
- [ ] 重启前端服务
- [ ] 验证API端点可访问
- [ ] 验证AuditTasks页面显示3个tab
- [ ] 验证OPENCODE审计tab功能正常
- [ ] 执行功能测试
- [ ] 执行性能测试

---

**文档结束**
