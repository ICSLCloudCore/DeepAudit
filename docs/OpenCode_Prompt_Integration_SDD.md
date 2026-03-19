# OpenCode提示词集成功能设计文档

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 1.0 | 2025-03-18 | DeepAudit Team | 初始版本 |

---

## 1. 文档概述

### 1.1 文档目的
本文档详细描述DeepAudit平台与OpenCode Server集成，实现提示词管理功能的技术设计方案，包括功能需求、系统架构、数据库设计、API设计、前端UI设计、实现方案等，为开发团队提供明确的技术指导。

### 1.2 术语定义
| 术语 | 说明 |
|------|------|
| DeepAudit | AI驱动的代码安全审计平台 |
| OpenCode | 提供Skill/MCP生态系统的集成环境 |
| Prompt Template | 提示词模板，用户可管理的审计提示词 |
| Session | OpenCode会话，用于与OpenCode Server交互 |
| Prompt | 发送给OpenCode Server的提示词内容 |

### 1.3 参考资料
- [OpenCode_Integration_Spec.md](./OpenCode_Integration_Spec.md)
- https://www.cnblogs.com/goloving/p/19578247

---

## 2. 功能概述

### 2.1 背景
DeepAudit平台已具备以下功能：
1. 项目管理：可以选择OpenCode审计，并启动OpenCode服务器
2. 提示词管理：用户可以管理和维护提示词模板

### 2.2 功能需求
需要新增以下功能：
1. 在项目管理中启动审计，选择OpenCode审计时，可以选择提示词管理中的Prompt
2. 默认自动启动OpenCode服务器
3. 后台将提示词发送给OpenCode Server端，依次创建Session、发送prompt、等待一段时间后获取返回结果

### 2.3 功能流程图

```
用户启动OpenCode审计
    ↓
选择提示词模板
    ↓
启动OpenCode服务器（如未启动）
    ↓
创建OpenCode Session
    ↓
发送Prompt到OpenCode Server
    ↓
轮询获取返回结果
    ↓
展示结果给用户
```

---

## 3. 系统架构设计

### 3.1 总体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                         DeepAudit Frontend                         │
├─────────────────────────────────────────────────────────────────────┤
│  项目管理  │  提示词管理  │  OpenCode审计启动  │  结果展示   │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                      DeepAudit Backend (FastAPI)                   │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────┐ │
│  │  项目管理API    │  │  提示词管理API   │  │ OpenCode会话 │ │
│  └──────────────────┘  └──────────────────┘  │    管理服务    │ │
│  ┌──────────────────┐  ┌──────────────────┐  └──────────────┘ │
│  │  OpenCode服务    │  │  后台任务处理    │                   │ │
│  │    管理服务      │  │    服务         │                   │ │
│  └──────────────────┘  └──────────────────┘                   │ │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    PostgreSQL + Redis                              │
├─────────────────────────────────────────────────────────────────────┤
│  projects │ prompt_templates │ opencode_sessions                │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    OpenCode Server                               │
├─────────────────────────────────────────────────────────────────────┤
│  Session API  │  Prompt处理  │  结果返回                        │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 核心组件

#### 3.2.1 OpenCode会话管理服务
- 职责：管理OpenCode会话的创建、Prompt发送和结果获取
- 功能：
  - 检查OpenCode服务器状态
  - 创建OpenCode会话
  - 发送提示词
  - 轮询获取结果
  - 管理会话生命周期

#### 3.2.2 后台任务处理服务
- 职责：处理异步任务，避免阻塞主流程
- 功能：
  - 异步启动OpenCode服务器
  - 异步发送提示词
  - 异步轮询结果

#### 3.2.3 提示词模板服务
- 职责：管理提示词模板的选择和应用
- 功能：
  - 提供提示词模板列表
  - 提示词变量替换

---

## 4. 数据库设计

### 4.1 现有表结构分析

项目已有的相关表：
- `projects` - 项目表
- `prompt_templates` - 提示词模板表
- `opencode_sessions` - OpenCode会话表

#### 4.1.1 opencode_sessions表（已存在）
```sql
CREATE TABLE opencode_sessions (
    id VARCHAR(36) PRIMARY KEY,
    project_id VARCHAR(36) REFERENCES projects(id) ON DELETE CASCADE,
    status VARCHAR(20) DEFAULT 'active', -- 'active' | 'closed' | 'error'
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

#### 4.1.2 projects表扩展
确认projects表已包含OpenCode相关字段：
- `opencode_pid` - OpenCode进程ID
- `opencode_port` - OpenCode监听端口
- `opencode_log_path` - 日志文件路径
- `opencode_started_at` - 启动时间

### 4.2 数据库迁移
现有表结构已满足需求，无需额外迁移。

---

## 5. API接口设计

### 5.1 新增API接口

#### 5.1.1 启动OpenCode审计（带Prompt选择）
**接口路径**：`POST /api/v1/opencode/projects/{project_id}/audit-with-prompt`

**请求参数**：
```json
{
  "prompt_template_id": "string (可选)",
  "prompt_content": "string (可选)",
  "variables": {
    "key": "value"
  }
}
```

**响应**：
```json
{
  "session_id": "uuid",
  "project_id": "uuid",
  "status": "pending",
  "opencode_server_status": "starting|running|error",
  "message": "审计已启动"
}
```

**功能说明**：
1. 检查OpenCode服务器状态，如未启动则自动启动
2. 创建OpenCode会话
3. 发送提示词到OpenCode Server
4. 启动后台任务轮询结果

#### 5.1.2 获取OpenCode会话状态
**接口路径**：`GET /api/v1/opencode/sessions/{session_id}/status`

**响应**：
```json
{
  "session_id": "uuid",
  "status": "active|closed|error",
  "prompt_content": "string",
  "response_content": "string",
  "opencode_server_status": "running",
  "started_at": "2025-03-18T00:00:00Z",
  "completed_at": "2025-03-18T00:05:00Z"
}
```

#### 5.1.3 流式获取OpenCode响应
**接口路径**：`GET /api/v1/opencode/sessions/{session_id}/stream`

**响应**：SSE流式响应

#### 5.1.4 获取项目可用提示词列表
**接口路径**：`GET /api/v1/projects/{project_id}/available-prompts`

**响应**：
```json
{
  "items": [
    {
      "id": "uuid",
      "name": "string",
      "description": "string",
      "template_type": "string",
      "is_default": boolean,
      "is_system": boolean,
      "is_active": boolean
    }
  ],
  "total": 10
}
```

### 5.2 OpenCode Server API交互规划

#### 5.2.1 OpenCode Server API端点（真实API）
根据OpenCode Server官方文档，实际API如下：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/global/health` | GET | 获取服务器健康状态和版本 |
| `/session` | POST | 创建新会话，请求体：`{ parentID?, title? }` |
| `/session/:id` | GET | 获取会话详情 |
| `/session/:id/message` | POST | 发送消息并等待响应，请求体：`{ messageID?, model?, agent?, noReply?, system?, tools?, parts }` |
| `/session/:id/message` | GET | 列出会话中的消息 |
| `/event` | GET | 服务器发送事件流（SSE） |

#### 5.2.2 交互流程
```
1. 健康检查：GET /global/health
   ↓
2. 创建会话：POST /session
   ↓
3. 发送提示词：POST /session/{session_id}/message
   ↓
4. 监听事件流或轮询结果：GET /event 或 GET /session/{session_id}/message
```

#### 5.2.3 API详细说明

**1. 健康检查**
```http
GET /global/health
响应: { healthy: true, version: string }
```

**2. 创建会话**
```http
POST /session
请求体: { parentID?: string, title?: string }
响应: Session对象
```

**3. 发送消息**
```http
POST /session/{id}/message
请求体: {
  messageID?: string,
  model?: string,
  agent?: string,
  noReply?: boolean,
  system?: string,
  tools?: any[],
  parts: Array<{
    type: "text",
    text: string
  }>
}
响应: { info: Message, parts: Part[] }
```

**4. 监听事件流**
```http
GET /event
响应: SSE流式响应，第一个事件是server.connected
```

---

## 6. 前端UI设计

### 6.1 页面设计

#### 6.1.1 项目详情页增强

**新增内容**：
1. 在"启动审计"按钮旁添加"OpenCode审计"选项
2. OpenCode审计对话框包含：
   - 提示词选择器
   - 自定义提示词输入框（可选）
   - 启动按钮

#### 6.1.2 OpenCode审计对话框设计

```
┌─────────────────────────────────────────┐
│         OpenCode审计                 │
├─────────────────────────────────────────┤
│ 选择提示词模板:                     │
│  [下拉选择器 ▼]                     │
│                                       │
│ 或输入自定义提示词:                   │
│  ┌─────────────────────────────┐    │
│  │ 提示词内容...               │    │
│  └─────────────────────────────┘    │
│                                       │
│  [ ] 自动启动OpenCode服务器          │
│                                       │
│  [取消]  [启动审计]                  │
└─────────────────────────────────────────┘
```

#### 6.1.3 结果展示页面

**功能**：
1. 显示OpenCode服务器状态
2. 显示会话执行进度
3. 流式展示返回结果
4. 支持结果复制/导出

### 6.2 组件设计

#### 6.2.1 PromptSelector组件
- 功能：选择提示词模板
- 属性：
  - `selectedPromptId` - 已选择的提示词ID
  - `onSelect` - 选择回调
  - `projectId` - 项目ID

#### 6.2.2 OpenCodeAuditDialog组件
- 功能：OpenCode审计对话框
- 属性：
  - `open` - 是否打开
  - `projectId` - 项目ID
  - `onClose` - 关闭回调
  - `onStart` - 启动回调

#### 6.2.3 OpenCodeResultViewer组件
- 功能：展示OpenCode审计结果
- 属性：
  - `sessionId` - 会话ID
  - `projectId` - 项目ID

---

## 7. 实现方案

### 7.1 后端实现

#### 7.1.1 新增/修改文件清单

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `backend/app/api/v1/endpoints/opencode_sessions.py` | 修改 | 新增启动审计接口 |
| `backend/app/services/opencode_session_service.py` | 新增 | OpenCode会话服务 |
| `backend/app/schemas/opencode_session.py` | 修改 | 新增Schema |
| `backend/app/api/v1/api.py` | 修改 | 注册新路由 |

#### 7.1.2 OpenCode会话服务实现

**核心功能**：
1. 检查OpenCode服务器状态
2. 创建会话
3. 发送提示词
4. 轮询结果
5. 更新会话状态

```python
class OpenCodeSessionService:
    async def start_audit_with_prompt(
        self,
        project_id: str,
        prompt_template_id: Optional[str],
        prompt_content: Optional[str],
        variables: Optional[dict],
        current_user: User
    ) -> OpenCodeSession:
        # 1. 获取项目
        # 2. 检查OpenCode服务器状态，如未启动则启动
        # 3. 获取提示词内容
        # 4. 创建OpenCode会话
        # 5. 发送提示词到OpenCode Server
        # 6. 启动后台任务轮询结果
        pass
```

#### 7.1.3 后台任务实现

使用FastAPI BackgroundTasks处理异步任务：
- 启动OpenCode服务器
- 发送提示词
- 轮询获取结果
- 更新数据库

### 7.2 前端实现

#### 7.2.1 新增/修改文件清单

| 文件路径 | 操作 | 说明 |
|---------|------|------|
| `frontend/src/shared/api/opencode.ts` | 修改 | 新增API调用 |
| `frontend/src/pages/ProjectDetail.tsx` | 修改 | 新增OpenCode审计功能 |
| `frontend/src/components/opencode/OpenCodeAuditDialog.tsx` | 新增 | OpenCode审计对话框 |
| `frontend/src/components/opencode/PromptSelector.tsx` | 新增 | 提示词选择器 |
| `frontend/src/components/opencode/OpenCodeResultViewer.tsx` | 新增 | 结果查看器 |

#### 7.2.2 API客户端扩展

在`opencode.ts`中新增：
```typescript
export const opencodeApi = {
  // ... 现有API
  
  // 新增
  startAuditWithPrompt: async (projectId: string, data: any) => {
    const response = await apiClient.post(`/opencode/projects/${projectId}/audit-with-prompt`, data);
    return response.data;
  },
  
  getSessionStatus: async (sessionId: string) => {
    const response = await apiClient.get(`/opencode/sessions/${sessionId}/status`);
    return response.data;
  },
  
  getAvailablePrompts: async (projectId: string) => {
    const response = await apiClient.get(`/projects/${projectId}/available-prompts`);
    return response.data;
  },
};
```

---

## 8. 测试计划

### 8.1 单元测试
- OpenCode会话服务测试
- API端点测试
- 提示词变量替换测试

### 8.2 集成测试
- 完整流程测试：启动审计 → 选择提示词 → 发送 → 获取结果
- 错误处理测试：OpenCode服务器未启动、网络错误等

### 8.3 前端测试
- 组件渲染测试
- 用户交互测试

---

## 9. 部署计划

### 9.1 后端部署
1. 应用数据库迁移（如需要）
2. 部署新的API端点
3. 配置OpenCode Server连接信息

### 9.2 前端部署
1. 构建前端应用
2. 部署新的UI组件

---

## 10. 风险评估

| 风险项 | 影响 | 概率 | 缓解措施 |
|--------|------|------|----------|
| OpenCode Server API变更 | 高 | 中 | 封装API调用层，便于适配 |
| 提示词处理超时 | 中 | 中 | 设置合理超时，提供重试机制 |
| OpenCode Server启动失败 | 中 | 低 | 提供明确错误提示，允许手动启动 |

---

## 11. 附录

### 11.1 参考文档
- [OpenCode_Integration_Spec.md](./OpenCode_Integration_Spec.md)
- 软件设计文档规范：https://www.cnblogs.com/goloving/p/19578247

### 11.2 相关文件
- `backend/app/models/opencode_session.py`
- `backend/app/api/v1/endpoints/opencode_sessions.py`
- `frontend/src/pages/ProjectDetail.tsx`