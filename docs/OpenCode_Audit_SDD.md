# OpenCode审计功能 - SDD规范文档

## 文档信息

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.1 | 2025-03-19 | DeepAudit Team | 新增OpenCode交互详细信息记录功能 |
| 1.0 | 2025-03-19 | DeepAudit Team | 初始版本 |

---

## 目录

1. [功能规范（Spec）](#1-功能规范spec)
2. [技术实施计划（Plan）](#2-技术实施计划plan)
3. [技术研究（Research）](#3-技术研究research)
4. [数据模型（Data Model）](#4-数据模型data-model)
5. [API合约（Contracts）](#5-api合约contracts)
6. [关键验证场景（Quickstart）](#6-关键验证场景quickstart)
7. [可执行任务（Tasks）](#7-可执行任务tasks)

---

## 1. 功能规范（Spec）

### 1.1 功能概述

**用户故事**：
&gt; 作为一个DeepAudit用户，我希望在项目管理中启动审计时选择"OpenCode审计"，并可以选择提示词管理中的Prompt模板，系统会自动启动OpenCode服务器，后台将提示词发送给OpenCode Server端，依次创建Session、异步发送prompt、轮询获取结果，并且我可以在一个**仿Terminal Retro / Cassette Futurism风格的终端页面**上可视化查看每一次交互，就像Agent审计那样。

### 1.2 验收标准（Acceptance Criteria）

**AC1: OpenCode审计启动**
- [ ] 用户在项目详情页可以看到"OpenCode审计"选项
- [ ] 点击"OpenCode审计"可以打开对话框
- [ ] 对话框中显示提示词选择器
- [ ] 用户可以选择提示词管理中的Prompt模板
- [ ] 用户可以输入自定义提示词（可选）
- [ ] 点击"启动审计"按钮开始流程

**AC2: OpenCode服务器自动启动**
- [ ] 系统自动检查OpenCode服务器状态
- [ ] 如未启动，自动启动OpenCode服务器
- [ ] 显示服务器启动进度
- [ ] 启动失败时显示明确错误提示

**AC3: 后台处理流程**
- [ ] 后台依次创建OpenCode Session
- [ ] 异步发送prompt到OpenCode Server
- [ ] 每隔一段时间请求接口获取结果
- [ ] 结果增量更新到数据库

**AC6: OpenCode交互详细信息记录**
- [ ] 新增`opencode_interactions`数据表，记录每次与OpenCode Server的交互
- [ ] 记录交互类型：请求/响应/错误
- [ ] 记录交互时间戳（精确到毫秒）
- [ ] 记录请求端点（如/global/health, /session, /session/{id}/message等）
- [ ] 记录完整的请求内容（JSON格式）
- [ ] 记录完整的响应内容（JSON格式）
- [ ] 记录HTTP状态码
- [ ] 记录响应耗时（毫秒）
- [ ] 关联到对应的opencode_session
- [ ] 支持按session查询交互历史
- [ ] 前端可以查看详细的交互历史

**AC4: 前端UI可视化 - Terminal Retro风格**
- [ ] 创建专门的`OpenCodeAudit`页面
- [ ] UI风格与Agent审计**完全一致**：Terminal Retro / Cassette Futurism 仿终端风格
- [ ] 包含**SplashScreen启动画面**：仿终端启动序列，支持命令输入
- [ ] 包含**Header头部**：机械终端风格，发光效果
- [ ] 左侧面板：**Activity Log（交互日志）**，显示：
  - 提示词发送（PROMPT类型）
  - 响应内容（RESPONSE类型）
  - 状态变化（STATUS类型）
  - 错误信息（ERROR类型）
  - 进度更新（PROGRESS类型）
- [ ] 右侧面板：**Stats Panel（统计面板）**，显示：
  - OpenCode服务器状态
  - 会话执行状态
  - 进度条
  - 响应长度统计
  - 执行时间统计
- [ ] 支持自动滚动
- [ ] 支持日志展开/折叠
- [ ] 包含所有Terminal Retro视觉效果：
  - CRT屏幕效果
  - 扫描线动画
  - 赛博朋克网格背景
  - 数据流动画
  - 霓虹光效

**AC5: 状态显示**
- [ ] 显示OpenCode服务器状态（启动中/运行中/错误）
- [ ] 显示会话执行状态
- [ ] 显示进度条
- [ ] 显示响应长度/执行时间等统计信息

### 1.3 用户体验流程

```
用户在项目详情页
    ↓
点击"OpenCode审计"按钮
    ↓
显示OpenCode审计对话框
    ↓
用户选择提示词模板（或输入自定义）
    ↓
点击"启动审计"
    ↓
跳转到OpenCodeAudit页面
    ↓
显示Terminal Retro风格SplashScreen启动画面
    ↓
显示：[INIT] Loading OpenCode Core...
    ↓
显示：[SCAN] Prompt Analysis Engine
    ↓
显示：[LOAD] Session Configuration
    ↓
显示：[SYNC] OpenCode Server Connection
    ↓
显示：[READY] System Online
    ↓
（可选）用户输入'audit'命令
    ↓
进入主审计页面
    ↓
左侧：Activity Log显示实时交互
右侧：Stats Panel显示统计信息
    ↓
实时更新交互日志
    ↓
审计完成，显示统计信息
```

### 1.4 非功能性需求

| 需求类型 | 具体要求 |
|---------|---------|
| 性能 | OpenCode服务器启动时间 &lt; 30秒 |
| 性能 | 会话状态轮询间隔：2秒 |
| 可用性 | 支持至少5个并发OpenCode会话 |
| 可靠性 | 网络错误时自动重试3次 |
| 用户体验 | Terminal Retro风格，与Agent审计完全一致 |
| 用户体验 | 响应式设计，支持移动端 |

---

## 2. 技术实施计划（Plan）

### 2.1 技术栈选择

| 层级 | 技术选型 | 说明 |
|------|---------|------|
| 后端 | FastAPI + SQLAlchemy (异步) | 现有技术栈，保持一致 |
| 后端HTTP客户端 | httpx | 异步HTTP请求 |
| 后端任务处理 | BackgroundTasks | 异步后台任务 |
| 前端 | React 18 + TypeScript | 现有技术栈 |
| 前端UI | shadcn/ui + Tailwind CSS | 现有组件库，保持风格一致 |
| 前端状态管理 | useReducer + Context | 参考Agent审计实现 |
| 实时更新 | 轮询（Polling） | 简单可靠，基于现有实现 |
| UI风格 | Terminal Retro / Cassette Futurism | 与Agent审计完全一致 |

### 2.2 架构设计

```
┌─────────────────────────────────────────────────────────────────────┐
│                         前端层 (Frontend)                          │
├─────────────────────────────────────────────────────────────────────┤
│  OpenCodeAuditPage (主页面 - Terminal Retro风格)                  │
│  ├── SplashScreen (启动画面 - 仿终端)                            │
│  ├── Header (头部 - 机械终端风格)                                  │
│  ├── ActivityLog (交互日志)                                         │
│  │   └── LogEntry (日志条目 - 多种类型)                          │
│  └── StatsPanel (统计面板)                                          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                         API层 (FastAPI)                            │
├─────────────────────────────────────────────────────────────────────┤
│  /opencode/projects/{id}/audit-with-prompt (启动审计)              │
│  /opencode/sessions/{id}/status (获取状态)                        │
│  /opencode/sessions/{id}/stream (流式响应)                         │
│  /projects/{id}/available-prompts (可用提示词)                     │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      服务层 (Services)                              │
├─────────────────────────────────────────────────────────────────────┤
│  OpenCodeSessionService (会话管理)                                  │
│  ├── check_opencode_server_status (检查服务器状态)                  │
│  ├── start_opencode_server (启动服务器)                            │
│  ├── create_opencode_server_session (创建Session)                   │
│  ├── send_prompt_to_opencode (发送提示词)                          │
│  └── poll_opencode_result (轮询结果)                               │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      数据层 (Database)                              │
├─────────────────────────────────────────────────────────────────────┤
│  projects (项目表)                                                  │
│  prompt_templates (提示词模板表)                                    │
│  opencode_sessions (OpenCode会话表)                                │
│  opencode_interactions (OpenCode交互详细记录表) ← 新增              │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    OpenCode Server (外部)                          │
├─────────────────────────────────────────────────────────────────────┤
│  /global/health (健康检查)                                          │
│  /session (创建会话)                                                │
│  /session/{id}/prompt_async (异步发送提示词)                       │
│  /session/{id}/message (获取消息)                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.3 组件分解

#### 2.3.1 后端组件（需修改/新增）

| 组件名称 | 文件路径 | 职责 | 状态 |
|---------|---------|------|------|
| OpenCodeSessionService | `backend/app/services/opencode_session_service.py` | OpenCode会话管理 | ✅ 已存在，需修改以记录交互 |
| OpenCodeSessions API | `backend/app/api/v1/endpoints/opencode_sessions.py` | API端点 | ✅ 已存在，需新增交互历史API |
| OpenCodeSession Model | `backend/app/models/opencode_session.py` | 数据模型 | ✅ 已存在 |
| **OpenCodeInteraction Model** | **`backend/app/models/opencode_interaction.py`** | **交互记录数据模型** | ❌ **需新建** |
| OpenCodeSession Schemas | `backend/app/schemas/opencode_session.py` | Pydantic模式 | ✅ 已存在，需新增交互Schema |
| **数据库迁移** | **`alembic/versions/`** | **新增opencode_interactions表** | ❌ **需新建** |

#### 2.3.2 前端组件（需新建，复用Agent审计代码）

| 组件名称 | 文件路径 | 职责 | 参考源 |
|---------|---------|------|--------|
| OpenCodeAuditPage | `frontend/src/pages/OpenCodeAudit/index.tsx` | 主页面 | AgentAudit/index.tsx |
| useOpenCodeAuditState | `frontend/src/pages/OpenCodeAudit/hooks/useOpenCodeAuditState.ts` | 状态管理Hook | useAgentAuditState |
| types.ts | `frontend/src/pages/OpenCodeAudit/types.ts` | TypeScript类型定义 | AgentAudit/types.ts |
| constants.tsx | `frontend/src/pages/OpenCodeAudit/constants.tsx` | 常量定义（Terminal Retro风格） | AgentAudit/constants.tsx |
| utils.ts | `frontend/src/pages/OpenCodeAudit/utils.ts` | 工具函数 | AgentAudit/utils.ts |
| SplashScreen | `frontend/src/pages/OpenCodeAudit/components/SplashScreen.tsx` | 启动画面（仿终端） | AgentAudit/SplashScreen.tsx |
| Header | `frontend/src/pages/OpenCodeAudit/components/Header.tsx` | 头部（机械终端风格） | AgentAudit/Header.tsx |
| LogEntry | `frontend/src/pages/OpenCodeAudit/components/LogEntry.tsx` | 日志条目 | AgentAudit/LogEntry.tsx |
| StatsPanel | `frontend/src/pages/OpenCodeAudit/components/StatsPanel.tsx` | 统计面板 | AgentAudit/StatsPanel.tsx |
| StatusBadge | `frontend/src/pages/OpenCodeAudit/components/StatusBadge.tsx` | 状态徽章 | AgentAudit/StatusBadge.tsx |
| OpenCode API | `frontend/src/shared/api/opencode.ts` | API客户端 | ✅ 已存在，需验证 |

### 2.4 实施里程碑

| 里程碑 | 任务 | 预计工作量 | 依赖 |
|-------|------|-----------|------|
| M0 | 数据库迁移和交互记录功能 | 3小时 | 无 |
| M1 | 后端验证和测试 | 2小时 | M0 |
| M2 | 前端页面基础结构（复用Agent审计） | 2小时 | M1 |
| M3 | 状态管理和核心组件 | 3小时 | M2 |
| M4 | Terminal Retro视觉效果集成 | 2小时 | M3 |
| M5 | 实时更新和轮询机制 | 2小时 | M4 |
| M6 | 集成测试和优化 | 1小时 | M5 |
| **总计** | | **15小时** | |

---

## 3. 技术研究（Research）

### 3.1 现有代码分析

#### 3.1.1 后端现状分析

**已实现的功能**：
- ✅ `OpenCodeSessionService` - 核心服务已完整实现
  - `check_opencode_server_status()` - 检查服务器状态
  - `start_opencode_server()` - 启动服务器
  - `create_opencode_server_session()` - 创建Session
  - `send_prompt_to_opencode()` - 异步发送提示词（使用prompt_async API）
  - `poll_opencode_result()` - 轮询结果
  - `start_audit_with_prompt()` - 启动审计的完整流程

- ✅ API端点已完整实现
  - `POST /opencode/projects/{id}/audit-with-prompt`
  - `GET /opencode/sessions/{id}/status`
  - `GET /opencode/sessions/{id}/stream`
  - `GET /projects/{id}/available-prompts`

- ✅ 数据模型已存在
  - `OpenCodeSession` 模型完整

**结论**：**后端核心功能基本完成，需新增交互记录功能！**

**需新增/修改的后端功能**：
- ⚠️ 新增`opencode_interactions`数据模型
- ⚠️ 修改`OpenCodeSessionService`，在每次与OpenCode Server交互时记录详细信息
- ⚠️ 新增获取交互历史的API端点
- ⚠️ 创建数据库迁移脚本

#### 3.1.2 前端现状分析

**已实现的功能**：
- ✅ `opencode.ts` - API客户端已完整
- ✅ `OpenCodeSessionPanel.tsx` - 现有OpenCode面板组件
- ✅ `AgentAudit` 完整页面实现 - **完美的UI参考**

**AgentAudit页面的UI风格（需完全复制）**：
- Terminal Retro / Cassette Futurism 美学
- SplashScreen：仿终端启动序列，支持命令输入
- Header：机械终端风格，发光效果
- LogEntry：终端风格日志条目，多种类型
- 布局：左侧Activity Log，右侧Stats Panel
- 视觉效果：CRT屏幕、扫描线、赛博朋克网格、数据流动画等

**结论**：**前端只需复制AgentAudit的代码，适配OpenCode数据结构即可！**

### 3.2 技术选型对比

#### 3.2.1 实时更新方案

| 方案 | 优点 | 缺点 | 选择 |
|-----|------|------|------|
| SSE (Server-Sent Events) | 实时推送，效率高 | 实现复杂，需维护连接 | ❌ |
| WebSocket | 双向通信 | 实现最复杂 | ❌ |
| 轮询 (Polling) | 实现简单，基于现有代码 | 有一定延迟 | ✅ **选择** |

**选择理由**：后端已有轮询机制，前端可参考Agent审计的轮询实现，开发效率最高。

#### 3.2.2 UI组件方案

| 方案 | 优点 | 缺点 | 选择 |
|-----|------|------|------|
| 从零开始创建 | 完全定制化 | 工作量巨大，风格难保持一致 | ❌ |
| 复制Agent审计组件 | 风格完全一致，开发极快 | 需要适配数据结构 | ✅ **选择** |

**选择理由**：Agent审计页面已有完整的Terminal Retro风格实现，直接复制并适配即可，可节省80%开发时间。

### 3.3 UI风格详解 - Terminal Retro / Cassette Futurism

#### 3.3.1 视觉元素清单

| 元素 | 说明 | AgentAudit位置 |
|-----|------|----------------|
| 赛博朋克网格 | `cyber-grid`类，动态背景 | constants.tsx + CSS |
| 扫描线动画 | `scan-line`类，水平扫描线 | SplashScreen.tsx |
| CRT屏幕效果 | `crt-effect`类，CRT显示器效果 | SplashScreen.tsx |
| 数据流动画 | `data-stream`类，垂直数据流 | SplashScreen.tsx |
| 霓虹光效 | 文字阴影 + 发光边框 | Header.tsx, LogEntry.tsx |
| 机械终端风格 | 复古终端字体 + 边框 | 所有组件 |
| 启动序列 | 仿BIOS启动的文字序列 | SplashScreen.tsx |
| 命令输入 | 终端命令提示符 + 光标闪烁 | SplashScreen.tsx |

#### 3.3.2 日志类型配置（OpenCode版）

参考AgentAudit的LOG_TYPE_CONFIG，OpenCode需要的类型：

```typescript
export const LOG_TYPE_CONFIG: Record&lt;string, {
  icon: React.ReactNode;
  borderColor: string;
  bgColor: string;
}&gt; = {
  prompt: {
    // 发送提示词 - 使用紫色/青色
  },
  response: {
    // 响应内容 - 使用绿色/青色
  },
  status: {
    // 状态变化 - 使用黄色/橙色
  },
  error: {
    // 错误信息 - 使用红色
  },
  info: {
    // 一般信息
  },
  progress: {
    // 进度更新 - 使用青色
  },
};
```

### 3.4 风险评估

| 风险项 | 影响 | 概率 | 缓解措施 |
|--------|------|------|----------|
| OpenCode Server API变更 | 高 | 中 | 已封装API调用层，便于适配 |
| 提示词处理超时 | 中 | 中 | 已有超时机制和重试逻辑 |
| OpenCode Server启动失败 | 中 | 低 | 提供明确错误提示，允许手动启动 |
| 前端轮询性能问题 | 低 | 低 | 合理设置轮询间隔（2秒） |
| UI风格不一致 | 高 | 低 | 直接复制AgentAudit代码，确保一致 |

---

## 4. 数据模型（Data Model）

### 4.1 数据库表结构

#### 4.1.1 opencode_interactions表（新增）

```sql
CREATE TABLE opencode_interactions (
    id VARCHAR(36) PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(36) REFERENCES opencode_sessions(id) ON DELETE CASCADE NOT NULL,

    -- 交互基本信息
    interaction_type VARCHAR(20) NOT NULL, -- 'request' | 'response' | 'error'
    endpoint VARCHAR(255) NOT NULL, -- /global/health, /session, /session/{id}/message等
    http_method VARCHAR(10) NOT NULL, -- 'GET' | 'POST' | 'PUT' | 'DELETE'

    -- 时间信息
    request_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    response_timestamp TIMESTAMP WITH TIME ZONE,
    duration_ms INTEGER, -- 响应耗时（毫秒）

    -- 请求/响应内容
    request_payload TEXT, -- JSON格式的请求内容
    response_payload TEXT, -- JSON格式的响应内容
    http_status_code INTEGER, -- HTTP状态码，如200, 404, 500等

    -- 错误信息（如适用）
    error_message TEXT,
    error_type VARCHAR(100),

    -- 元数据
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_opencode_interactions_session_id ON opencode_interactions(session_id);
CREATE INDEX idx_opencode_interactions_timestamp ON opencode_interactions(request_timestamp);
CREATE INDEX idx_opencode_interactions_type ON opencode_interactions(interaction_type);
CREATE INDEX idx_opencode_interactions_endpoint ON opencode_interactions(endpoint);
```

#### 4.1.2 opencode_sessions表（已存在）

```sql
CREATE TABLE opencode_sessions (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'active' | 'closed' | 'error'
    prompt_template_id VARCHAR(36) REFERENCES prompt_templates(id),
    prompt_content TEXT NOT NULL,
    response_content TEXT DEFAULT '',
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(36) REFERENCES users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);
```

#### 4.1.2 projects表（已存在，包含OpenCode字段）

```sql
-- 相关字段
opencode_pid VARCHAR(255)           -- OpenCode进程ID
opencode_port VARCHAR(10)            -- OpenCode监听端口
opencode_log_path VARCHAR(500)       -- 日志文件路径
opencode_started_at TIMESTAMP        -- 启动时间
opencode_current_session_id VARCHAR(36) -- 当前会话ID
```

### 4.2 状态机定义

#### 4.2.1 OpenCodeSession状态流转

```
pending (待处理)
    ↓
active (活动中)
    ↓
    ├─→ closed (已完成)
    └─→ error (错误)
```

#### 4.2.2 OpenCodeServer状态

```
stopped (已停止)
    ↓
starting (启动中)
    ↓
    ├─→ running (运行中)
    └─→ error (错误)
```

### 4.3 前端状态接口

#### 4.3.1 日志类型定义

```typescript
export type LogType =
  | 'prompt'      // 发送提示词
  | 'response'    // 响应内容
  | 'status'      // 状态变化
  | 'error'       // 错误
  | 'info'        // 信息
  | 'progress';   // 进度

export interface LogItem {
  id: string;
  time: string;
  type: LogType;
  title: string;
  content?: string;
  isStreaming?: boolean;
}
```

#### 4.3.2 会话状态接口

```typescript
export interface OpenCodeSession {
  id: string;
  project_id: string;
  status: 'pending' | 'active' | 'closed' | 'error';
  prompt_content: string;
  response_content: string;
  opencode_server_status: 'starting' | 'running' | 'error' | 'stopped';
  started_at?: string;
  completed_at?: string;
}
```

### 4.4 数据流转图

```
用户启动审计
    ↓
创建 opencode_sessions 记录 (status: pending)
    ↓
检查 OpenCode Server 状态
    ↓
[记录交互] GET /global/health → opencode_interactions
    ↓
如未启动，启动 OpenCode Server
    ↓
更新 opencode_sessions (status: active)
    ↓
创建 OpenCode Server Session
    ↓
[记录交互] POST /session → opencode_interactions
    ↓
发送 Prompt 到 OpenCode Server
    ↓
[记录交互] POST /session/{id}/message → opencode_interactions
    ↓
启动后台轮询任务
    ↓
定期获取结果
    ↓
[记录交互] GET /session/{id}/message → opencode_interactions
    ↓
定期更新 response_content
    ↓
检测到完成信号
    ↓
更新 opencode_sessions (status: closed)
```

---

## 5. API合约（Contracts）

### 5.1 REST API端点（已存在）

#### 5.1.1 启动OpenCode审计

**端点**：`POST /api/v1/opencode/projects/{project_id}/audit-with-prompt`

**请求体**：
```json
{
  "prompt_template_id": "uuid (可选)",
  "prompt_content": "string (可选)",
  "variables": {
    "key": "value"
  }
}
```

**响应**（200 OK）：
```json
{
  "session_id": "uuid",
  "project_id": "uuid",
  "status": "pending",
  "opencode_server_status": "starting|running|error|stopped",
  "message": "审计已启动"
}
```

#### 5.1.2 获取会话状态

**端点**：`GET /api/v1/opencode/sessions/{session_id}/status`

**响应**（200 OK）：
```json
{
  "session_id": "uuid",
  "status": "pending|active|closed|error",
  "prompt_content": "string",
  "response_content": "string",
  "opencode_server_status": "starting|running|error|stopped",
  "started_at": "2025-03-19T00:00:00Z",
  "completed_at": "2025-03-19T00:05:00Z"
}
```

#### 5.1.3 获取可用提示词

**端点**：`GET /api/v1/opencode/projects/{project_id}/available-prompts`

**响应**（200 OK）：
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "安全审计提示词",
      "description": "用于代码安全审计的提示词模板",
      "template_type": "security",
      "is_default": true,
      "is_system": true,
      "is_active": true
    }
  ],
  "total": 10
}
```

---

## 6. 关键验证场景（Quickstart）

### 6.1 端到端测试场景

#### 场景1：成功启动OpenCode审计

**前置条件**：
- 项目已存在
- 提示词模板已创建

**测试步骤**：
1. 进入项目详情页
2. 点击"OpenCode审计"按钮
3. 选择一个提示词模板
4. 点击"启动审计"
5. 验证跳转到OpenCodeAudit页面
6. 验证显示Terminal Retro风格SplashScreen
7. 验证显示启动序列：[INIT] → [SCAN] → [LOAD] → [SYNC] → [READY]
8. 验证进入主页面，左侧显示Activity Log
9. 验证显示："正在启动OpenCode服务器..."
10. 验证显示："正在创建Session..."
11. 验证显示："正在发送提示词..."
12. 验证开始显示响应内容
13. 验证审计完成后显示统计信息

**预期结果**：所有步骤正常执行，Terminal Retro风格完美呈现，最终看到审计结果。

#### 场景2：OpenCode服务器已运行

**前置条件**：
- OpenCode服务器已在运行

**测试步骤**：
1. 进入项目详情页
2. 点击"OpenCode审计"
3. 选择提示词模板
4. 点击"启动审计"
5. 验证跳过"启动服务器"步骤，直接创建Session

**预期结果**：检测到服务器已运行，快速进入下一步。

#### 场景3：自定义提示词

**测试步骤**：
1. 进入项目详情页
2. 点击"OpenCode审计"
3. 不选择模板，直接输入自定义提示词
4. 点击"启动审计"
5. 验证使用自定义提示词执行

**预期结果**：使用用户输入的提示词，而不是模板。

### 6.2 常见问题排查

| 问题 | 可能原因 | 排查步骤 |
|-----|---------|---------|
| OpenCode服务器启动失败 | 端口被占用 | 检查端口是否被其他进程占用 |
| 提示词发送失败 | 网络问题 | 检查OpenCode Server是否可访问 |
| 结果不更新 | 轮询未启动 | 检查浏览器控制台是否有错误 |
| UI风格不一致 | 代码复制不完整 | 确保完全复制AgentAudit的所有CSS和组件 |

---

## 7. 可执行任务（Tasks）

### 7.1 任务分解（按优先级）

#### 阶段0：数据库迁移和交互记录功能（优先级：最高）

| 任务ID | 任务描述 | 依赖 | 预计时间 | 负责人 |
|--------|---------|------|---------|--------|
| T0.1 | 创建`opencode_interaction.py`数据模型 | 无 | 30分钟 | 后端 |
| T0.2 | 创建Pydantic schemas for交互记录 | T0.1 | 30分钟 | 后端 |
| T0.3 | 修改`log_opencode_interaction()`函数，写入数据库 | T0.2 | 45分钟 | 后端 |
| T0.4 | 修改`OpenCodeSessionService`，记录所有交互 | T0.3 | 45分钟 | 后端 |
| T0.5 | 新增获取交互历史的API端点 | T0.4 | 30分钟 | 后端 |
| T0.6 | 创建Alembic数据库迁移脚本 | T0.1 | 30分钟 | 后端 |
| **阶段0小计** | | | **3小时** | |

#### 阶段1：后端验证（优先级：高）

| 任务ID | 任务描述 | 依赖 | 预计时间 | 负责人 |
|--------|---------|------|---------|--------|
| T1.1 | 验证`start_audit_with_prompt` API | 无 | 30分钟 | 后端 |
| T1.2 | 验证`get_session_status` API | T1.1 | 15分钟 | 后端 |
| T1.3 | 验证后台轮询机制 | T1.2 | 30分钟 | 后端 |
| T1.4 | 后端集成测试 | T1.3 | 45分钟 | 后端 |
| **阶段1小计** | | | **2小时** | |

#### 阶段2：前端页面基础结构（优先级：高）

| 任务ID | 任务描述 | 依赖 | 预计时间 | 负责人 |
|--------|---------|------|---------|--------|
| T2.1 | 创建OpenCodeAudit目录结构 | 无 | 15分钟 | 前端 |
| T2.2 | 从AgentAudit复制types.ts并适配 | T2.1 | 30分钟 | 前端 |
| T2.3 | 从AgentAudit复制constants.tsx并适配 | T2.2 | 30分钟 | 前端 |
| T2.4 | 从AgentAudit复制utils.ts | T2.3 | 15分钟 | 前端 |
| T2.5 | 创建index.tsx主页面骨架 | T2.4 | 30分钟 | 前端 |
| **阶段2小计** | | | **2小时** | |

#### 阶段3：状态管理和核心组件（优先级：高）

| 任务ID | 任务描述 | 依赖 | 预计时间 | 负责人 |
|--------|---------|------|---------|--------|
| T3.1 | 从AgentAudit复制useAgentAuditState并重命名为useOpenCodeAuditState | T2.5 | 1小时 | 前端 |
| T3.2 | 适配状态管理Hook到OpenCode数据结构 | T3.1 | 30分钟 | 前端 |
| T3.3 | 从AgentAudit复制SplashScreen组件 | T3.2 | 20分钟 | 前端 |
| T3.4 | 从AgentAudit复制Header组件并适配 | T3.3 | 20分钟 | 前端 |
| T3.5 | 从AgentAudit复制LogEntry组件并适配日志类型 | T3.4 | 40分钟 | 前端 |
| T3.6 | 从AgentAudit复制StatsPanel组件并适配 | T3.5 | 30分钟 | 前端 |
| T3.7 | 从AgentAudit复制StatusBadge组件 | T3.6 | 10分钟 | 前端 |
| T3.8 | 集成所有组件到主页面 | T3.7 | 30分钟 | 前端 |
| **阶段3小计** | | | **3小时** | |

#### 阶段4：Terminal Retro视觉效果集成（优先级：高）

| 任务ID | 任务描述 | 依赖 | 预计时间 | 负责人 |
|--------|---------|------|---------|--------|
| T4.1 | 确保所有CSS类复制完整（cyber-grid, scan-line, crt-effect等） | T3.8 | 30分钟 | 前端 |
| T4.2 | 验证SplashScreen的启动序列动画 | T4.1 | 30分钟 | 前端 |
| T4.3 | 验证Header的发光效果 | T4.2 | 15分钟 | 前端 |
| T4.4 | 验证LogEntry的Terminal风格 | T4.3 | 15分钟 | 前端 |
| T4.5 | 整体视觉效果调优 | T4.4 | 30分钟 | 前端 |
| **阶段4小计** | | | **2小时** | |

#### 阶段5：实时更新和轮询（优先级：高）

| 任务ID | 任务描述 | 依赖 | 预计时间 | 负责人 |
|--------|---------|------|---------|--------|
| T5.1 | 从AgentAudit复制轮询逻辑并适配 | T4.5 | 45分钟 | 前端 |
| T5.2 | 实现日志实时更新 | T5.1 | 45分钟 | 前端 |
| T5.3 | 实现响应内容流式显示 | T5.2 | 30分钟 | 前端 |
| **阶段5小计** | | | **2小时** | |

#### 阶段6：测试和优化（优先级：中）

| 任务ID | 任务描述 | 依赖 | 预计时间 | 负责人 |
|--------|---------|------|---------|--------|
| T6.1 | 端到端测试（Terminal Retro风格验证） | T5.3 | 30分钟 | 测试 |
| T6.2 | UI/UX优化 | T6.1 | 30分钟 | 前端 |
| **阶段6小计** | | | **1小时** | |

### 7.2 任务依赖图

```
T0.1 → T0.2 → T0.3 → T0.4 → T0.5 → T0.6
                        ↓
T1.1 → T1.2 → T1.3 → T1.4
                        ↓
T2.1 → T2.2 → T2.3 → T2.4 → T2.5
                        ↓
T3.1 → T3.2 → T3.3 → T3.4 → T3.5 → T3.6 → T3.7 → T3.8
                        ↓
T4.1 → T4.2 → T4.3 → T4.4 → T4.5
                        ↓
T5.1 → T5.2 → T5.3
                        ↓
T6.1 → T6.2
```

### 7.3 总体进度

| 阶段 | 开始时间 | 结束时间 | 状态 |
|-----|---------|---------|------|
| **阶段0：数据库迁移和交互记录** | - | - | ⏳ 待开始 |
| 阶段1：后端验证 | - | - | ⏳ 待开始 |
| 阶段2：前端页面基础 | - | - | ⏳ 待开始 |
| 阶段3：状态管理和核心组件 | - | - | ⏳ 待开始 |
| 阶段4：Terminal Retro视觉效果 | - | - | ⏳ 待开始 |
| 阶段5：实时更新和轮询 | - | - | ⏳ 待开始 |
| 阶段6：测试和优化 | - | - | ⏳ 待开始 |
| **总计** | | | **15小时** |

---

## 附录

### A. 关键文件参考

| 文件路径 | 说明 |
|---------|------|
| `backend/app/services/opencode_session_service.py` | OpenCode会话服务（已存在，需修改以记录交互） |
| `backend/app/api/v1/endpoints/opencode_sessions.py` | API端点（已存在，需新增交互历史API） |
| **`backend/app/models/opencode_interaction.py`** | **交互记录数据模型（需新建）** |
| **`backend/app/schemas/opencode_session.py`** | **Pydantic模式（已存在，需新增交互Schema）** |
| **`alembic/versions/`** | **数据库迁移脚本（需新建）** |
| `frontend/src/pages/AgentAudit/` | **Agent审计页面 - 完美的UI参考** |
| `frontend/src/pages/AgentAudit/index.tsx` | 主页面结构参考 |
| `frontend/src/pages/AgentAudit/hooks/useAgentAuditState.ts` | 状态管理Hook参考 |
| `frontend/src/pages/AgentAudit/constants.tsx` | Terminal Retro风格常量参考 |
| `frontend/src/pages/AgentAudit/components/SplashScreen.tsx` | 启动画面参考 |
| `frontend/src/pages/AgentAudit/components/Header.tsx` | 头部组件参考 |
| `frontend/src/pages/AgentAudit/components/LogEntry.tsx` | 日志条目参考 |
| `frontend/src/shared/api/opencode.ts` | API客户端（已存在） |

### B. 术语表

| 术语 | 说明 |
|------|------|
| SDD | Specification-Driven Development，规范驱动开发 |
| OpenCode | 提供Skill/MCP生态系统的集成环境 |
| Session | OpenCode会话，用于与OpenCode Server交互 |
| Prompt | 发送给OpenCode Server的提示词内容 |
| Prompt Template | 提示词模板，用户可管理的审计提示词 |
| 轮询 (Polling) | 定期请求API获取更新的机制 |
| Terminal Retro | 复古终端风格，Cassette Futurism美学 |
| CRT Effect | 阴极射线管屏幕效果 |
| Cyber Grid | 赛博朋克网格背景 |

### C. UI风格检查清单

在完成开发后，验证以下Terminal Retro风格元素：

- [ ] SplashScreen启动画面有仿BIOS启动序列
- [ ] SplashScreen支持命令输入（audit/start/scan）
- [ ] Header有机械终端风格和发光效果
- [ ] LogEntry有不同类型的颜色编码
- [ ] 背景有赛博朋克网格（cyber-grid）
- [ ] 有扫描线动画（scan-line）
- [ ] 有CRT屏幕效果（crt-effect）
- [ ] 有数据流动画（data-stream）
- [ ] 整体配色与AgentAudit完全一致
- [ ] 所有文字使用等宽字体（font-mono）

---

**文档结束**
