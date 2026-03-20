# OpenCode审计任务功能 - SSD规范文档

## 文档信息

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2026-03-20 | DeepAudit Team | 初始版本 - OpenCode审计任务功能 |

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
> 作为一个DeepAudit用户，我希望在sidebar中能够查看和管理所有的OpenCode审计任务，就像查看AGENT智能审计和快速扫描任务一样，包括任务列表展示、任务详情查看、任务状态管理、以及持久化存储功能。

### 1.2 核心需求

#### 需求1：OpenCode审计任务数据模型
- 支持创建、读取、更新、删除（CRUD）OpenCode审计任务
- 支持任务状态管理（pending、running、completed、failed、cancelled）
- 支持任务进度跟踪
- 支持关联项目和用户
- 持久化存储到数据库

#### 需求2：任务列表展示
- 在sidebar中添加"OpenCode审计任务"入口
- 展示OpenCode审计任务列表
- 支持按状态筛选
- 支持搜索功能
- 支持排序功能

#### 需求3：任务详情页面
- 展示OpenCode审计任务的完整信息
- 显示任务执行日志
- 显示审计结果（如果有）
- 支持任务操作（取消、重试等）

#### 需求4：与现有系统集成
- 与现有的项目管理系统集成
- 与用户权限系统集成
- 保持与AGENT审计和快速审计一致的UI风格

### 1.3 验收标准（Acceptance Criteria）

**AC1: 数据模型和持久化**
- [x] 创建`opencode_audit_tasks`数据表
- [x] 支持完整的CRUD操作
- [x] 支持任务状态流转
- [x] 数据持久化存储

**AC2: API接口**
- [x] 创建OpenCode审计任务的API端点
- [x] 获取任务列表的API端点
- [x] 获取任务详情的API端点
- [x] 更新任务状态的API端点
- [x] 删除任务的API端点

**AC3: 前端界面**
- [x] 在sidebar中添加"OpenCode审计任务"导航项
- [x] 创建任务列表页面
- [x] 创建任务详情页面
- [x] 支持任务状态筛选和搜索
- [x] UI风格与现有系统一致

**AC4: 功能集成**
- [x] 与项目系统集成
- [x] 与用户系统集成
- [x] 支持任务状态实时更新

### 1.4 用户体验流程

```
用户登录系统
    ↓
点击sidebar中的"OpenCode审计任务"
    ↓
显示OpenCode审计任务列表页面
    ↓
（可选）使用筛选器或搜索功能
    ↓
点击某个任务查看详情
    ↓
显示任务详情页面
    ↓
（可选）执行任务操作（取消、重试等）
```

### 1.5 非功能性需求

| 需求类型 | 具体要求 |
|---------|---------|
| 性能 | 任务列表加载时间 < 2秒（100条记录） |
| 可用性 | 支持至少1000个并发任务记录 |
| 可靠性 | 数据持久化保证，支持事务 |
| 用户体验 | 响应式设计，支持移动端 |
| 可扩展性 | 预留字段支持未来功能扩展 |

---

## 2. 技术架构设计（Architecture）

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         前端层 (Frontend)                          │
├─────────────────────────────────────────────────────────────────────┤
│  Sidebar (导航栏 - 新增OpenCode审计任务入口)                        │
│  OpenCodeAuditTasksPage (任务列表页)                                │
│  OpenCodeAuditTaskDetailPage (任务详情页)                          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         API层 (FastAPI)                            │
├─────────────────────────────────────────────────────────────────────┤
│  /api/v1/opencode-audit-tasks (CRUD操作)                           │
│  /api/v1/opencode-audit-tasks/{id} (单个任务操作)                  │
│  /api/v1/opencode-audit-tasks/{id}/status (状态更新)               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      服务层 (Services)                              │
├─────────────────────────────────────────────────────────────────────┤
│  OpenCodeAuditTaskService (任务业务逻辑)                            │
│  ├── create_task (创建任务)                                          │
│  ├── get_tasks (获取任务列表)                                       │
│  ├── get_task (获取单个任务)                                        │
│  ├── update_task (更新任务)                                         │
│  ├── update_task_status (更新任务状态)                              │
│  └── delete_task (删除任务)                                         │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      数据层 (Database)                              │
├─────────────────────────────────────────────────────────────────────┤
│  opencode_audit_tasks (OpenCode审计任务表 - 新增)                  │
│  projects (项目表 - 关联)                                           │
│  users (用户表 - 关联)                                              │
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

| 组件名称 | 文件路径 | 职责 | 状态 |
|---------|---------|------|------|
| OpenCodeAuditTask Model | `backend/app/models/opencode_audit_task.py` | 数据模型 | ✅ 已创建 |
| OpenCodeAuditTask API | `backend/app/api/v1/endpoints/opencode_audit_tasks.py` | API端点 | ✅ 已创建 |
| 数据库迁移 | `backend/alembic/versions/011_add_opencode_audit_tables.py` | 迁移脚本 | ✅ 已创建 |
| 模型导出 | `backend/app/models/__init__.py` | 导出新模型 | ✅ 已修改 |
| API注册 | `backend/app/api/v1/api.py` | 注册路由 | ✅ 已修改 |

#### 2.3.2 前端组件

| 组件名称 | 文件路径 | 职责 | 参考源 |
|---------|---------|------|--------|
| API客户端 | `frontend/src/shared/api/opencodeAuditTasks.ts` | API调用 | agentTasks.ts |
| 任务列表页 | `frontend/src/pages/OpenCodeAuditTasks/index.tsx` | 任务列表展示 | AuditTasks.tsx |
| 任务详情页 | `frontend/src/pages/OpenCodeAuditTaskDetail/index.tsx` | 任务详情展示 | AuditTaskDetail.tsx |
| Sidebar更新 | `frontend/src/components/layout/Sidebar.tsx` | 导航栏 | 现有 |
| 路由配置 | `frontend/src/app/routes.tsx` | 路由配置 | 现有 |

---

## 3. 数据模型设计（Data Model）

### 3.1 数据库表结构

#### 3.1.1 opencode_audit_tasks表（新增）

```sql
CREATE TABLE opencode_audit_tasks (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4(),
    project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
    
    -- 任务基本信息
    name VARCHAR(255),
    description TEXT,
    task_type VARCHAR(50) DEFAULT 'opencode_audit',
    
    -- OpenCode相关
    opencode_session_id VARCHAR(36),
    opencode_prompt_template_id VARCHAR(36) REFERENCES prompt_templates(id),
    prompt_content TEXT,
    
    -- 任务配置
    audit_config JSON,
    target_files JSON,
    exclude_patterns JSON,
    
    -- 状态
    status VARCHAR(20) DEFAULT 'pending',
    current_step VARCHAR(255),
    error_message TEXT,
    
    -- 进度统计
    total_files INTEGER DEFAULT 0,
    processed_files INTEGER DEFAULT 0,
    findings_count INTEGER DEFAULT 0,
    
    -- 严重程度统计
    critical_count INTEGER DEFAULT 0,
    high_count INTEGER DEFAULT 0,
    medium_count INTEGER DEFAULT 0,
    low_count INTEGER DEFAULT 0,
    
    -- 结果
    result_summary TEXT,
    findings JSON,
    
    -- 时间戳
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    
    -- 创建者
    created_by VARCHAR(36) REFERENCES users(id) NOT NULL
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
支持OpenCode审计任务的持久化存储
"""

import uuid
from datetime import datetime
from typing import Optional, List, TYPE_CHECKING
from sqlalchemy import (
    Column, String, Integer, Text, Boolean, 
    DateTime, ForeignKey, JSON
)
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from app.db.base import Base

if TYPE_CHECKING:
    from .project import Project
    from .user import User


class OpenCodeAuditTaskStatus:
    """OpenCode审计任务状态"""
    PENDING = "pending"           # 等待执行
    RUNNING = "running"           # 运行中
    COMPLETED = "completed"       # 已完成
    FAILED = "failed"             # 失败
    CANCELLED = "cancelled"       # 已取消


class OpenCodeAuditTask(Base):
    """OpenCode审计任务"""
    __tablename__ = "opencode_audit_tasks"
    
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    project_id = Column(String(36), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False)
    
    # 任务基本信息
    name = Column(String(255), nullable=True)
    description = Column(Text, nullable=True)
    task_type = Column(String(50), default="opencode_audit")
    
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
    
    # 进度统计
    total_files = Column(Integer, default=0)
    processed_files = Column(Integer, default=0)
    findings_count = Column(Integer, default=0)
    
    # 严重程度统计
    critical_count = Column(Integer, default=0)
    high_count = Column(Integer, default=0)
    medium_count = Column(Integer, default=0)
    low_count = Column(Integer, default=0)
    
    # 结果
    result_summary = Column(Text, nullable=True)
    findings = Column(JSON, nullable=True)
    
    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())
    started_at = Column(DateTime(timezone=True), nullable=True)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    
    # 创建者
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    
    # 关联关系
    project = relationship("Project", back_populates="opencode_audit_tasks")
    creator = relationship("User")
    
    def __repr__(self):
        return f"<OpenCodeAuditTask {self.id} - {self.status}>"
    
    @property
    def progress_percentage(self) -> float:
        """计算进度百分比"""
        if self.status == OpenCodeAuditTaskStatus.COMPLETED:
            return 100.0
        if self.status in [OpenCodeAuditTaskStatus.FAILED, OpenCodeAuditTaskStatus.CANCELLED]:
            return 0.0
        if self.total_files > 0:
            return min((self.processed_files / self.total_files) * 100, 99.0)
        return 0.0
```

### 3.3 状态机定义

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

### 3.4 前端类型定义

```typescript
// OpenCode审计任务状态
export type OpenCodeAuditTaskStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

// OpenCode审计任务接口
export interface OpenCodeAuditTask {
  id: string;
  project_id: string;
  
  // 任务基本信息
  name?: string;
  description?: string;
  task_type: string;
  
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
  findings_count: number;
  
  // 严重程度统计
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  
  // 结果
  result_summary?: string;
  findings?: Record<string, any>;
  
  // 时间戳
  created_at: string;
  updated_at?: string;
  started_at?: string;
  completed_at?: string;
  
  // 创建者
  created_by: string;
  
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
}

// 状态更新请求
export interface UpdateOpenCodeAuditTaskStatusRequest {
  status: OpenCodeAuditTaskStatus;
  current_step?: string;
  error_message?: string;
  processed_files?: number;
  findings_count?: number;
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

### 5.1 Sidebar导航更新

在现有的sidebar中添加"OpenCode审计任务"导航项，位置在"AGENT智能审计"和"快速扫描"之后。

### 5.2 任务列表页面设计

#### 5.2.1 页面布局

```
┌─────────────────────────────────────────────────────────────────────┐
│  OpenCode审计任务                                              [筛选] │
├─────────────────────────────────────────────────────────────────────┤
│  搜索框: [________________________]  [状态筛选▼] [排序▼]         │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ 任务卡片1                                                    │  │
│  │ [状态徽章] 任务名称  [项目名称]  [进度条]  [操作按钮]       │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ 任务卡片2                                                    │  │
│  │ [状态徽章] 任务名称  [项目名称]  [进度条]  [操作按钮]       │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ...                                                                │
│  [分页控件]                                                         │
└─────────────────────────────────────────────────────────────────────┘
```

#### 5.2.2 任务卡片组件

每个任务卡片包含：
- 状态徽章（pending/running/completed/failed/cancelled）
- 任务名称
- 项目名称
- 进度条
- 创建时间
- 操作按钮（查看详情、取消、删除等）

### 5.3 任务详情页面设计

#### 5.3.1 页面布局

```
┌─────────────────────────────────────────────────────────────────────┐
│  ← 返回  OpenCode审计任务详情                              [操作▼]  │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ 任务基本信息                                                   │  │
│  │ 名称: [______________]  状态: [状态徽章]                     │  │
│  │ 项目: [项目名称]  创建时间: 2026-03-20 10:00:00           │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ 进度信息                                                       │  │
│  │ 总文件: 100  已处理: 60  发现: 6                             │  │
│  │ [进度条 60%]                                                   │  │
│  │ 当前步骤: 正在分析文件...                                      │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ 执行日志                                                       │  │
│  │ [日志列表]                                                     │  │
│  │ 2026-03-20 10:00:00  任务创建                                │  │
│  │ 2026-03-20 10:05:00  任务启动                                │  │
│  │ 2026-03-20 10:10:00  正在分析文件...                         │  │
│  └─────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────┐  │
│  │ 审计结果（如已完成）                                           │  │
│  │ [发现列表]                                                     │  │
│  └─────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 6. 技术实施计划（Implementation Plan）

### 6.1 实施阶段分解

#### 阶段1：后端数据模型和API（已完成）
- [x] 创建数据模型 `opencode_audit_task.py`
- [x] 创建数据库迁移文件
- [x] 创建API端点
- [x] 注册API路由
- [x] 更新模型导出

#### 阶段2：前端基础架构（已完成）
- [x] 创建API客户端 `opencodeAuditTasks.ts`
- [x] 创建任务列表页面
- [x] 创建任务详情页面
- [x] 更新Sidebar导航
- [x] 添加路由配置

#### 阶段3：UI/UX优化和测试
- [ ] 完善页面样式和交互
- [ ] 添加搜索和筛选功能
- [ ] 添加实时更新功能
- [ ] 编写单元测试
- [ ] 集成测试

### 6.2 时间估算

| 阶段 | 工作量 | 状态 |
|-----|--------|------|
| 阶段1：后端数据模型和API | 4小时 | ✅ 已完成 |
| 阶段2：前端基础架构 | 4小时 | ✅ 已完成 |
| 阶段3：UI/UX优化和测试 | 4小时 | ⏳ 待完成 |
| **总计** | **12小时** | |

---

## 7. 关键验证场景（Testing）

### 7.1 功能测试场景

#### 场景1：创建OpenCode审计任务
**步骤**：
1. 登录系统
2. 进入项目页面
3. 启动OpenCode审计任务
4. 验证任务创建成功

**预期结果**：
- 任务成功创建
- 状态为pending
- 出现在任务列表中

#### 场景2：查看任务列表
**步骤**：
1. 点击sidebar中的"OpenCode审计任务"
2. 查看任务列表
3. 使用筛选和搜索功能

**预期结果**：
- 任务列表正常显示
- 筛选和搜索功能正常工作

#### 场景3：查看任务详情
**步骤**：
1. 在任务列表中点击某个任务
2. 查看任务详情页面
3. 查看执行日志

**预期结果**：
- 任务详情完整显示
- 执行日志正确显示

#### 场景4：任务状态更新
**步骤**：
1. 启动一个任务
2. 观察状态从pending → running → completed
3. 验证进度更新

**预期结果**：
- 状态正确流转
- 进度实时更新

### 7.2 性能测试场景

| 测试项 | 目标 | 验证方法 |
|-------|------|---------|
| 任务列表加载 | < 2秒（100条记录） | 加载100条任务，测量时间 |
| 状态更新延迟 | < 1秒 | 测量状态更新到UI显示的时间 |
| 并发用户 | 支持10个并发用户 | 模拟10个用户同时访问 |

---

## 8. 可执行任务清单（Tasks）

### 8.1 已完成任务

- [x] 创建数据模型文件 `backend/app/models/opencode_audit_task.py`
- [x] 在 `backend/app/models/__init__.py` 中导出新模型
- [x] 创建数据库迁移文件 `backend/alembic/versions/011_add_opencode_audit_tables.py`
- [x] 创建API端点文件 `backend/app/api/v1/endpoints/opencode_audit_tasks.py`
- [x] 在 `backend/app/api/v1/api.py` 中注册API路由
- [x] 创建前端API客户端 `frontend/src/shared/api/opencodeAuditTasks.ts`
- [x] 创建前端任务列表页面 `frontend/src/pages/OpenCodeAuditTasks/index.tsx`
- [x] 创建前端任务详情页面 `frontend/src/pages/OpenCodeAuditTaskDetail/index.tsx`
- [x] 更新Sidebar `frontend/src/components/layout/Sidebar.tsx`
- [x] 添加路由配置 `frontend/src/app/routes.tsx`
- [x] 生成SSD规范文档

### 8.2 待完成任务

- [ ] 完善UI样式和交互效果
- [ ] 添加搜索和筛选功能
- [ ] 添加任务状态实时更新
- [ ] 编写单元测试
- [ ] 进行集成测试
- [ ] 性能优化

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
| UX | User Experience - 用户体验 |

### B. 参考文件

| 文件路径 | 说明 |
|---------|------|
| `backend/app/models/agent_task.py` | Agent任务模型参考 |
| `backend/app/api/v1/endpoints/agent_tasks.py` | Agent任务API参考 |
| `frontend/src/pages/AuditTasks.tsx` | 审计任务列表页参考 |
| `frontend/src/components/layout/Sidebar.tsx` | 导航栏组件 |
| `frontend/src/app/routes.tsx` | 路由配置 |

### C. 部署清单

- [ ] 运行数据库迁移 `alembic upgrade head`
- [ ] 重启后端服务
- [ ] 重启前端服务
- [ ] 验证API端点可访问
- [ ] 验证前端页面正常显示
- [ ] 执行功能测试
- [ ] 执行性能测试

---

**文档结束**
