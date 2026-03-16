# DeepAudit x OpenCode 集成功能规范（简化版）

## 1. 概述

本文档定义了DeepAudit平台与OpenCode集成的功能需求和技术规范，基于DeepAudit v3.0.4架构实现。

### 1.1 背景
DeepAudit是基于Multi-Agent协作架构的AI驱动代码安全审计平台。OpenCode提供强大的Skill/MCP生态系统。通过两者集成，增强DeepAudit的审计能力。

### 1.2 核心目标
- 简化用户体验：创建项目时直接选择Agent、Skill、MCP
- 自动化OpenCode管理：审计时后台自动创建和管理OpenCode进程
- 构建统一的Skill/MCP管理生态
- 提供灵活的Agent选择和配置机制
- 保持与DeepAudit现有架构的兼容性

---

## 2. 系统架构设计

### 2.1 总体架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         DeepAudit Frontend                       │
├─────────────────────────────────────────────────────────────────┤
│  项目管理  │  Agent管理  │  Skill/MCP市场  │  审计执行       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                      DeepAudit Backend (FastAPI)                │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  Agent管理服务   │  │  审计任务服务    │  │ Skill/MCP    │ │
│  └──────────────────┘  └──────────────────┘  │  管理服务     │ │
│  ┌──────────────────┐  ┌──────────────────┐  └──────────────┘ │
│  │  项目配置服务    │  │ OpenCode自动管理 │                   │
│  └──────────────────┘  └──────────────────┘                   │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL + Redis                            │
├─────────────────────────────────────────────────────────────────┤
│  projects │ agent_tasks │ agents │ skills │ mcps                │
│  project_configs │ task_executions                              │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│              OpenCode 进程（审计时自动创建）                      │
├─────────────────────────────────────────────────────────────────┤
│  OpenCode进程 (任务A)  │  OpenCode进程 (任务B)  │  ...        │
│  └─ 动态加载Skills+MCPs  │  └─ 动态加载Skills+MCPs  │         │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 核心组件

#### 2.2.1 OpenCode自动管理器
- 职责：审计任务启动时自动创建和管理OpenCode进程
- 功能：按需创建进程、动态加载Skill/MCP、自动清理进程
- 特性：进程生命周期与审计任务绑定

#### 2.2.2 Agent管理系统
- 职责：管理系统Agent和自定义Agent
- 功能：Agent注册、配置、启用/禁用、版本管理
- 特性：支持系统内置Agent和用户自定义Agent

#### 2.2.3 Skill/MCP仓库
- 职责：管理Skill和MCP资源
- 功能：上传、下载、版本管理、配置
- 特性：与DeepAudit Agent工具生态兼容

#### 2.2.4 项目配置服务
- 职责：管理项目的Agent/Skill/MCP选择配置
- 功能：配置保存、验证、应用到任务

---

## 3. 数据库设计规范

### 3.1 数据表清单

| 表名 | 说明 | 核心字段 |
|------|------|----------|
| `agents` | Agent注册表 | id, name, type, version, config, is_system, is_active |
| `opencode_skills` | Skill仓库表 | id, name, version, description, file_path, config |
| `opencode_mcps` | MCP仓库表 | id, name, version, description, config, server_url |
| `project_configs` | 项目配置表 | id, project_id, selected_agents, selected_skills, selected_mcps |
| `task_executions` | 任务执行记录表 | id, task_id, opencode_process_id, status |

### 3.2 详细表结构

#### 3.2.1 agents表
```sql
CREATE TABLE agents (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    agent_type VARCHAR(50) NOT NULL, -- 'system' | 'custom'
    version VARCHAR(20) DEFAULT '1.0.0',
    description TEXT,
    author VARCHAR(255),
    config JSON, -- Agent配置
    tools JSON, -- 可用工具列表
    is_system BOOLEAN DEFAULT FALSE, -- 是否系统内置
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(36) REFERENCES users(id)
);
```

#### 3.2.2 opencode_skills表
```sql
CREATE TABLE opencode_skills (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(20) DEFAULT '1.0.0',
    description TEXT,
    author VARCHAR(255),
    category VARCHAR(100), -- 'security' | 'analysis' | 'utility' | 'custom'
    file_path VARCHAR(500), -- Skill文件存储路径
    file_size BIGINT,
    checksum VARCHAR(64), -- SHA256校验和
    config JSON, -- Skill默认配置
    schema JSON, -- Skill输入输出Schema
    tags JSON, -- 标签数组
    is_public BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    download_count INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(36) REFERENCES users(id)
);
```

#### 3.2.3 opencode_mcps表
```sql
CREATE TABLE opencode_mcps (
    id VARCHAR(36) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    version VARCHAR(20) DEFAULT '1.0.0',
    description TEXT,
    author VARCHAR(255),
    mcp_type VARCHAR(50) NOT NULL, -- 'stdio' | 'sse' | 'http'
    server_url VARCHAR(500), -- HTTP/SSE类型的URL
    command TEXT, -- STDIO类型的启动命令
    args JSON, -- 命令参数数组
    env JSON, -- 环境变量
    config JSON, -- MCP配置
    tools JSON, -- 暴露的工具列表
    tags JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE,
    created_by VARCHAR(36) REFERENCES users(id)
);
```

#### 3.2.4 project_configs表
```sql
CREATE TABLE project_configs (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE UNIQUE,
    selected_agents JSON, -- [{agent_id, config, priority}]
    selected_skills JSON, -- [{skill_id, config, enabled}]
    selected_mcps JSON, -- [{mcp_id, config, enabled}]
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);
```

#### 3.2.5 task_executions表
```sql
CREATE TABLE task_executions (
    id VARCHAR(36) PRIMARY KEY,
    task_id VARCHAR(36) REFERENCES agent_tasks(id) ON DELETE CASCADE UNIQUE,
    opencode_process_id VARCHAR(36), -- OpenCode进程标识
    opencode_status VARCHAR(20) DEFAULT 'pending', -- 'pending' | 'creating' | 'running' | 'cleanup' | 'completed'
    process_info JSON, -- 进程详细信息
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE
);
```

---

## 4. API接口设计规范

### 4.1 Agent管理API

#### 4.1.1 Agent列表
```
GET /api/v1/agents
Query参数:
  - type: 'system' | 'custom' | 'all'
  - is_active: boolean
  - search: string
  - page: int
  - page_size: int

响应:
{
  "items": [
    {
      "id": "uuid",
      "name": "OrchestratorAgent",
      "agent_type": "system",
      "version": "1.0.0",
      "description": "...",
      "is_system": true,
      "is_active": true,
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 10,
  "page": 1,
  "page_size": 20
}
```

#### 4.1.2 Agent详情
```
GET /api/v1/agents/{id}

响应:
{
  "id": "uuid",
  "name": "CustomAgent",
  "agent_type": "custom",
  "version": "1.0.0",
  "description": "...",
  "author": "user",
  "config": { ... },
  "tools": [ ... ],
  "is_system": false,
  "is_active": true,
  "created_at": "2024-01-01T00:00:00Z",
  "created_by": "user_id"
}
```

#### 4.1.3 创建Agent
```
POST /api/v1/agents
请求体:
{
  "name": "MyAgent",
  "agent_type": "custom",
  "version": "1.0.0",
  "description": "...",
  "config": { ... },
  "tools": [ ... ]
}
```

#### 4.1.4 更新Agent
```
PUT /api/v1/agents/{id}
请求体: 同创建，字段可选
```

#### 4.1.5 删除Agent
```
DELETE /api/v1/agents/{id}
仅非系统Agent可删除
```

#### 4.1.6 启用/禁用Agent
```
PATCH /api/v1/agents/{id}/toggle
请求体:
{
  "is_active": boolean
}
```

### 4.2 Skill管理API

#### 4.2.1 Skill列表
```
GET /api/v1/opencode/skills
Query参数:
  - category: string
  - is_public: boolean
  - search: string
  - page: int
  - page_size: int
```

#### 4.2.2 上传Skill
```
POST /api/v1/opencode/skills/upload
Content-Type: multipart/form-data
字段:
  - file: Skill文件
  - name: string
  - version: string
  - description: string
  - category: string
  - is_public: boolean
```

#### 4.2.3 下载Skill
```
GET /api/v1/opencode/skills/{id}/download
响应: 文件流
```

#### 4.2.4 Skill详情
```
GET /api/v1/opencode/skills/{id}
```

#### 4.2.5 更新Skill
```
PUT /api/v1/opencode/skills/{id}
```

#### 4.2.6 删除Skill
```
DELETE /api/v1/opencode/skills/{id}
```

### 4.3 MCP管理API

#### 4.3.1 MCP列表
```
GET /api/v1/opencode/mcps
Query参数:
  - mcp_type: 'stdio' | 'sse' | 'http'
  - search: string
  - page: int
  - page_size: int
```

#### 4.3.2 创建MCP
```
POST /api/v1/opencode/mcps
请求体:
{
  "name": "MyMCP",
  "version": "1.0.0",
  "description": "...",
  "mcp_type": "stdio",
  "command": "node",
  "args": ["server.js"],
  "env": { "NODE_ENV": "production" },
  "config": { ... }
}
```

#### 4.3.3 MCP详情、更新、删除
```
GET /api/v1/opencode/mcps/{id}
PUT /api/v1/opencode/mcps/{id}
DELETE /api/v1/opencode/mcps/{id}
```

#### 4.3.4 测试MCP连接
```
POST /api/v1/opencode/mcps/{id}/test
响应:
{
  "success": true,
  "tools": ["tool1", "tool2"],
  "latency_ms": 123
}
```

### 4.4 项目配置API

#### 4.4.1 获取项目配置
```
GET /api/v1/projects/{id}/config
响应:
{
  "project_id": "uuid",
  "selected_agents": [
    {
      "agent_id": "uuid",
      "name": "OrchestratorAgent",
      "config": { ... },
      "priority": 1,
      "enabled": true
    }
  ],
  "selected_skills": [
    {
      "skill_id": "uuid",
      "name": "SecurityScanSkill",
      "config": { ... },
      "enabled": true
    }
  ],
  "selected_mcps": [
    {
      "mcp_id": "uuid",
      "name": "FileSystemMCP",
      "config": { ... },
      "enabled": true
    }
  ],
  "created_at": "2024-01-01T00:00:00Z",
  "updated_at": "2024-01-01T00:00:00Z"
}
```

#### 4.4.2 更新项目配置
```
PUT /api/v1/projects/{id}/config
请求体:
{
  "selected_agents": [
    {
      "agent_id": "uuid",
      "config": { ... },
      "priority": 1,
      "enabled": true
    }
  ],
  "selected_skills": [
    {
      "skill_id": "uuid",
      "config": { ... },
      "enabled": true
    }
  ],
  "selected_mcps": [
    {
      "mcp_id": "uuid",
      "config": { ... },
      "enabled": true
    }
  ]
}
```

#### 4.4.3 获取可用的Agent/Skill/MCP列表（用于项目配置）
```
GET /api/v1/projects/{id}/available-resources
响应:
{
  "agents": [
    { "id": "...", "name": "...", "description": "...", "agent_type": "system", "is_active": true }
  ],
  "skills": [
    { "id": "...", "name": "...", "description": "...", "category": "security", "is_active": true }
  ],
  "mcps": [
    { "id": "...", "name": "...", "description": "...", "mcp_type": "stdio", "is_active": true }
  ]
}
```

### 4.5 审计任务API（增强版）

#### 4.5.1 创建审计任务
```
POST /api/v1/agent-tasks
请求体:
{
  "project_id": "uuid",
  "name": "审计任务",
  "description": "...",
  "audit_scope": { ... },
  "target_vulnerabilities": [...],
  "verification_level": "sandbox",
  "branch_name": "main",
  "exclude_patterns": [...],
  "target_files": [...],
  "max_iterations": 50,
  "timeout_seconds": 1800,
  "use_project_config": true,  // 使用项目配置中的Agent/Skill/MCP
  "config_override": {         // 可选：覆盖项目配置
    "selected_agents": [...],
    "selected_skills": [...],
    "selected_mcps": [...]
  }
}
```

#### 4.5.2 获取任务执行状态（包含OpenCode信息）
```
GET /api/v1/agent-tasks/{id}/execution
响应:
{
  "task_id": "uuid",
  "opencode_status": "running", // 'pending' | 'creating' | 'running' | 'cleanup' | 'completed'
  "opencode_process_id": "uuid",
  "process_info": {
    "pid": 12345,
    "status": "healthy",
    "uptime_seconds": 300,
    "loaded_skills": 3,
    "loaded_mcps": 2
  },
  "started_at": "2024-01-01T00:00:00Z",
  "completed_at": null
}
```

---

## 5. UI/UX设计规范

### 5.1 页面导航结构

```
DeepAudit
├── 仪表盘
├── 项目管理
│   └── 项目详情
│       ├── 概览
│       ├── 审计任务
│       └── 资源配置 (新增，原OpenCode配置)
├── Agent管理 (新增)
│   ├── 系统Agents
│   ├── 自定义Agents
│   └── Agent详情
└── Skill/MCP市场 (新增)
    ├── Skills
    └── MCPs
```

### 5.2 Agent管理页面

#### 5.2.1 Agent列表页面
**位置** `/agents`

**功能模块**
1. 筛选栏
   - Agent类型筛选: 全部 / 系统Agent / 自定义Agent
   - 状态筛选: 全部 / 已启用 / 已禁用
   - 搜索框: 按名称/描述搜索

2. Agent卡片网格
   - 卡片内容:
     - Agent名称
     - 类型标签 (系统/自定义)
     - 版本号
     - 描述（截断）
     - 状态指示器 (启用/禁用)
     - 操作按钮: 查看详情 / 配置 / 启用/禁用

3. 工具栏
   - "创建自定义Agent"按钮
   - "刷新"按钮
   - 视图切换: 网格/列表

#### 5.2.2 Agent详情页面
**位置** `/agents/{id}`

**功能模块**
1. 头部信息
   - Agent名称
   - 版本号
   - 类型标签
   - 作者信息
   - 创建时间
   - 状态开关

2. 配置面板
   - 基本信息编辑
   - Agent配置JSON编辑器
   - 工具列表管理

3. 使用统计
   - 绑定项目数
   - 任务执行次数
   - 平均执行时间

4. 版本历史
   - 版本列表
   - 变更记录
   - 回滚功能

### 5.3 Skill/MCP市场页面

#### 5.3.1 Skills市场
**位置** `/marketplace/skills`

**功能模块**
1. 导航栏
   - 分类筛选: 全部 / 安全 / 分析 / 工具 / 自定义
   - 排序: 最新 / 最热 / 评分
   - 搜索框
   - "上传Skill"按钮

2. Skill卡片
   - Skill名称
   - 作者
   - 版本
   - 下载量
   - 评分
   - 标签
   - 操作: 查看详情 / 下载

3. Skill详情模态框
   - 完整描述
   - 使用文档
   - 配置选项
   - 版本历史
   - 评论/评分

#### 5.3.2 MCP管理
**位置** `/marketplace/mcps`

**功能模块**
1. MCP列表
   - MCP名称
   - 类型 (STDIO/SSE/HTTP)
   - 状态 (已连接/已断开)
   - 暴露工具数
   - 操作: 编辑 / 删除 / 测试连接

2. 创建/编辑MCP表单
   - 基本信息: 名称、描述、版本
   - 类型选择及对应配置
   - 环境变量配置
   - 连接测试按钮

### 5.4 项目详情页增强

#### 5.4.1 新增"资源配置"标签页
**位置** `/projects/{id}#resources`

**功能模块**
1. 页面说明
   - 简要说明：在此配置项目使用的Agent、Skill和MCP，审计时将自动应用
   - "使用推荐配置"按钮（快速填充系统推荐的组合）

2. Agent选择区域
   - 标题: 选择审计Agents
   - 可用Agent列表
     - 按类型分组（系统Agent / 自定义Agent）
     - 每个Agent显示：名称、描述、复选框
     - 悬停显示详细信息
   - 已选Agent列表
     - 拖拽排序（设置优先级）
     - 每个Agent右侧：配置按钮 / 移除按钮
   - 配置弹窗：点击配置按钮打开，编辑该Agent的特定配置

3. Skill选择区域
   - 标题: 选择Skills（可选）
   - 可用Skill列表
     - 按分类分组
     - 每个Skill显示：名称、描述、复选框
   - 已选Skill列表
     - 每个Skill右侧：配置按钮 / 移除按钮
   - 配置弹窗：编辑Skill配置

4. MCP选择区域
   - 标题: 选择MCPs（可选）
   - 可用MCP列表
     - 每个MCP显示：名称、描述、类型标签、复选框
   - 已选MCP列表
     - 每个MCP右侧：配置按钮 / 移除按钮
   - 配置弹窗：编辑MCP配置

5. 配置摘要
   - 显示当前选择的Agent、Skill、MCP数量
   - "保存配置"按钮
   - "重置为默认"按钮

### 5.5 审计任务创建流程增强

**位置** 创建Agent任务对话框

**步骤设计**

#### 步骤1: 基本配置（保留现有）
- 任务名称
- 审计范围
- 目标漏洞类型
- 验证级别
- 分支选择
- 排除模式

#### 步骤2: 资源选择（新增）
- 标题: 选择审计资源
- 说明: 使用项目配置或自定义选择
- 选项:
  - [x] 使用项目资源配置（默认选中）
    - 下方显示项目配置的摘要：X个Agents, Y个Skills, Z个MCPs
    - "查看配置"链接
  - [ ] 自定义选择
    - 展开显示Agent/Skill/MCP选择界面（同项目资源配置页面的简化版）

#### 步骤3: 确认启动
- 配置摘要:
  - 基本配置信息
  - 将要使用的Agents列表
  - 将要使用的Skills列表
  - 将要使用的MCPs列表
- "开始审计"按钮

### 5.6 审计执行页面增强

**位置** AgentAudit页面

**新增内容**

1. 头部状态栏
   - 显示OpenCode状态:
     - "正在初始化OpenCode..."
     - "OpenCode运行中 (加载了X个Skills, Y个MCPs)"
   - 状态指示器

2. 资源面板（可选折叠）
   - 显示当前任务使用的Agents
   - 显示当前任务使用的Skills
   - 显示当前任务使用的MCPs

### 5.7 设计风格规范

#### 5.7.1 保持一致性
- 使用与DeepAudit现有UI相同的shadcn/ui组件库
- 保持Cyberpunk/Terminal复古美学风格
- 使用相同的颜色方案:
  - 主色: 紫色/青色
  - 背景: 深色主题
  - 边框: 半透明效果

#### 5.7.2 新增视觉元素
- Agent图标: 使用Bot图标
- Skill图标: 使用Puzzle图标
- MCP图标: 使用Plug图标
- OpenCode状态: 使用Zap/Server图标

---

## 6. 后端服务设计规范

### 6.1 OpenCode自动管理器

#### 6.1.1 核心职责
- 审计任务启动时自动创建OpenCode进程
- 动态加载指定的Skill和MCP
- 监控进程健康状态
- 任务完成后自动清理进程

#### 6.1.2 进程生命周期

```
任务创建 → 状态: pending
    ↓
开始执行 → 创建OpenCode进程 → 状态: creating
    ↓
进程启动 → 加载Skills → 加载MCPs → 状态: running
    ↓
审计执行中...
    ↓
任务完成 → 清理进程 → 状态: cleanup → completed
```

#### 6.1.3 进程创建流程
```
1. 接收审计任务开始事件
2. 从任务或项目配置中获取selected_skills和selected_mcps
3. 创建临时工作目录
4. 生成OpenCode配置文件（包含要加载的Skill/MCP）
5. 启动OpenCode子进程
6. 等待健康检查通过
7. 更新task_executions表状态为running
8. 注册进程监控
```

#### 6.1.4 进程监控
- 定期健康检查（每10秒）
- 自动重启崩溃的进程
- 日志收集
- 资源使用统计

#### 6.1.5 进程清理
- 任务完成/失败/取消时触发
- 优雅停止OpenCode进程
- 清理临时文件
- 更新状态为completed

### 6.2 Agent管理服务

#### 6.2.1 Agent注册表
- 系统Agent自动注册（启动时扫描）
- 自定义AgentCRUD
- Agent版本管理

#### 6.2.2 系统内置Agent（只读）
- OrchestratorAgent (编排)
- ReconAgent (侦察)
- AnalysisAgent (分析)
- VerificationAgent (验证)

#### 6.2.3 自定义Agent支持
- 支持通过配置文件定义
- 提供Agent开发模板

### 6.3 Skill/MCP管理服务

#### 6.3.1 Skill仓库
- 文件存储管理
- 版本控制
- 元数据索引
- 搜索功能

#### 6.3.2 MCP服务器管理
- MCP配置管理
- 连接测试
- 工具发现和缓存

### 6.4 桥接层服务

#### 6.4.1 Skill桥接
- 将OpenCode Skill包装为DeepAudit Agent工具
- 参数格式转换
- 错误处理

#### 6.4.2 MCP桥接
- MCP协议到DeepAudit工具的转换
- 双向通信支持

---

## 7. 集成工作流设计

### 7.1 创建项目并配置资源流程

```
1. 用户创建新项目（现有流程）
   ↓
2. 进入项目详情页 → 点击"资源配置"标签
   ↓
3. 配置Agent
   a. 浏览可用Agent列表
   b. 勾选需要的Agent
   c. 拖拽排序设置优先级
   d. （可选）点击配置按钮编辑Agent参数
   ↓
4. 配置Skills（可选）
   a. 浏览可用Skill列表
   b. 勾选需要的Skill
   c. （可选）配置Skill参数
   ↓
5. 配置MCPs（可选）
   a. 浏览可用MCP列表
   b. 勾选需要的MCP
   c. （可选）配置MCP参数
   ↓
6. 点击"保存配置"
   ↓
7. 配置保存到project_configs表
```

### 7.2 启动审计任务流程

```
1. 用户在项目中点击"新建审计"
   ↓
2. 显示创建任务对话框
   ↓
3. 步骤1: 填写基本配置（现有）
   - 任务名称
   - 审计范围
   - 目标漏洞类型
   - 验证级别
   ↓
4. 步骤2: 选择资源（新增）
   - 默认选中"使用项目资源配置"
   - 显示项目配置的Agent/Skill/MCP摘要
   - 用户可选择"自定义选择"来覆盖
   ↓
5. 步骤3: 确认启动
   - 显示配置摘要
   - 点击"开始审计"
   ↓
6. 后端处理
   a. 创建agent_task记录
   b. 创建task_execution记录，状态为pending
   c. 后台启动审计任务
   d. 创建OpenCode进程（异步）
      i. 从配置中获取selected_skills和selected_mcps
      ii. 启动OpenCode进程
      iii. 动态加载Skill和MCP
      iv. 更新task_execution状态为running
   e. Agent开始执行审计
```

### 7.3 审计执行中的Skill/MCP调用

```
Agent执行
   ↓
需要调用工具
   ↓
检查是否为OpenCode Skill/MCP
   ├─ 是 → 通过桥接层调用
   │         ├─ Skill: 加载Skill → 执行 → 返回结果
   │         └─ MCP: 连接MCP服务器 → 调用工具 → 返回结果
   └─ 否 → 使用DeepAudit原生工具
   ↓
返回结果给Agent
```

### 7.4 任务完成流程

```
审计任务完成（成功/失败/取消）
   ↓
触发OpenCode进程清理
   ↓
优雅停止OpenCode进程
   ↓
清理临时文件
   ↓
更新task_execution状态为completed
   ↓
完成
```

---

## 8. 安全与性能规范

### 8.1 安全要求

1. **进程隔离**
   - 每个OpenCode进程运行在独立的沙箱环境
   - 文件系统访问限制
   - 网络访问控制

2. **Skill/MCP安全**
   - Skill文件签名验证
   - MCP服务器白名单
   - 权限最小化原则
   - 执行日志审计

3. **API安全**
   - 所有新增API需认证
   - 权限控制（系统Agent仅管理员可修改）
   - 速率限制
   - 输入验证

### 8.2 性能要求

1. **进程管理**
   - OpenCode进程启动时间 < 30秒
   - 健康检查响应 < 2秒
   - 支持至少5个并发OpenCode进程

2. **API响应**
   - 列表查询 < 500ms
   - 详情查询 < 200ms
   - 文件上传支持至少100MB

3. **资源使用**
   - 单个OpenCode进程默认限制: CPU 2核, 内存4GB
   - 可配置资源限制
   - 资源监控开销 < 5% CPU

---

## 9. 测试规范

### 9.1 单元测试
- 数据库模型测试
- 服务层逻辑测试
- API端点测试

### 9.2 集成测试
- 项目配置保存和读取测试
- 审计任务创建流程测试
- OpenCode自动创建和清理测试
- Skill/MCP调用测试

### 9.3 性能测试
- 并发任务测试
- 大文件上传测试
- 长时间运行稳定性测试

---

## 10. 部署与迁移规范

### 10.1 数据库迁移
- 使用Alembic创建迁移脚本
- 包含数据迁移逻辑（如需要）
- 回滚脚本
- 迁移验证

### 10.2 配置更新
- 新增配置项文档
- 默认值设置
- 环境变量支持

### 10.3 向后兼容
- 不破坏现有功能
- 现有项目无需强制配置
- 未配置的项目使用默认Agent组合
- 渐进式采用

---

## 附录

### A. 术语表
- **OpenCode**: 集成的Skill/MCP执行环境（审计时自动创建）
- **Skill**: 可重用的功能模块
- **MCP**: Model Context Protocol，模型上下文协议
- **Agent**: 执行审计任务的智能体
- **项目配置**: 项目级别的Agent/Skill/MCP选择配置

### B. 参考文件
- `backend/app/models/agent_task.py` - 数据库模型参考
- `backend/app/api/v1/endpoints/agent_tasks.py` - API端点参考
- `frontend/src/pages/AgentAudit/` - 前端页面参考
- `frontend/src/pages/Projects.tsx` - 项目管理页面参考

### C. 版本历史
| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 2.0 | 2024-01-15 | - | 简化版：移除手动OpenCode配置，改为自动管理 |
| 1.0 | 2024-01-15 | - | 初始版本 |
