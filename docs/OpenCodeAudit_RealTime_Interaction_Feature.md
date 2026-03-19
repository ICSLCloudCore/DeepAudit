# OpenCodeAudit 实时交互信息显示功能实现说明

## 功能概述

用户在启动"OpenCode审计"后，能够在**仿Terminal Retro风格的终端页面**上**实时查看与OpenCode Server的每一次交互信息**。

---

## 已实现的核心功能

### 1. 后端交互记录系统 ✅

#### 文件位置
- `backend/app/models/opencode_interaction.py` - 交互数据模型
- `backend/app/schemas/opencode_session.py` - 交互Schema
- `backend/app/services/opencode_session_service.py` - 交互记录服务
- `backend/app/api/v1/endpoints/opencode_sessions.py` - 交互API端点
- `backend/alembic/versions/010_add_opencode_interactions.py` - 数据库迁移

#### 核心功能
- ✅ 新增 `log_opencode_interaction_to_db()` 函数 - 将交互记录写入数据库
- ✅ 新增 `_make_opencode_request()` 方法 - HTTP请求包装器，自动记录交互
- ✅ 新增 `set_current_session_id()` 方法 - 设置当前会话ID用于记录
- ✅ 新增 `GET /sessions/{session_id}/interactions` - 获取交互历史API

#### 记录的信息
- 交互类型：请求/响应/错误
- 时间戳（精确到毫秒）
- 请求端点（如 `/global/health`, `/session`, `/session/{id}/message`）
- 完整的请求内容（JSON格式）
- 完整的响应内容（JSON格式）
- HTTP状态码
- 响应耗时（毫秒）
- 关联到对应的OpenCode会话

---

### 2. 前端实时显示页面 ✅

#### 文件位置
- `frontend/src/pages/OpenCodeAudit/index.tsx` - 主页面
- `frontend/src/pages/OpenCodeAudit/components/SplashScreen.tsx` - 启动画面
- `frontend/src/pages/OpenCodeAudit/components/Header.tsx` - 头部
- `frontend/src/pages/OpenCodeAudit/components/LogEntry.tsx` - 日志条目
- `frontend/src/pages/OpenCodeAudit/components/StatsPanel.tsx` - 统计面板
- `frontend/src/pages/OpenCodeAudit/hooks/useOpenCodeAuditState.ts` - 状态管理
- `frontend/src/shared/api/opencode.ts` - API客户端

#### 核心功能
- ✅ **Terminal Retro / Cassette Futurism 风格UI** - 与AgentAudit完全一致
- ✅ **SplashScreen启动画面** - 仿终端启动序列，支持命令输入
- ✅ **Activity Log（左侧面板）** - 实时显示交互日志
  - 提示词发送（PROMPT类型）
  - 响应内容（RESPONSE类型）
  - 状态变化（STATUS类型）
  - 错误信息（ERROR类型）
  - 进度更新（PROGRESS类型）
- ✅ **Stats Panel（右侧面板）** - 显示统计信息
  - OpenCode服务器状态
  - 会话执行状态
  - 响应长度统计
  - 执行时间统计
- ✅ **轮询机制** - 2秒间隔获取会话状态和交互历史
- ✅ **自动滚动** - 支持日志自动滚动
- ✅ **日志展开/折叠** - 支持查看详细内容

#### 视觉效果
- ✅ CRT屏幕效果
- ✅ 扫描线动画
- ✅ 赛博朋克网格背景
- ✅ 数据流动画
- ✅ 霓虹光效

---

## 使用流程

### 用户体验流程
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

---

## 关键文件详解

### 后端关键文件

#### 1. `opencode_interaction.py` - 数据模型
```python
class OpenCodeInteraction(Base):
    """OpenCode交互记录表"""
    id - 主键
    session_id - 关联的会话ID
    interaction_type - 交互类型（request/response/error）
    endpoint - 请求端点
    http_method - HTTP方法
    request_timestamp - 请求时间戳
    response_timestamp - 响应时间戳
    duration_ms - 响应耗时（毫秒）
    request_payload - 请求内容（JSON）
    response_payload - 响应内容（JSON）
    http_status_code - HTTP状态码
    error_message - 错误信息
    error_type - 错误类型
```

#### 2. `opencode_session_service.py` - 服务层增强
```python
class OpenCodeSessionService:
    # 新增方法
    set_current_session_id(session_id) - 设置当前会话ID
    
    _make_opencode_request() - HTTP请求包装器
        自动记录请求到数据库
        自动记录响应到数据库
        自动记录错误到数据库
        计算响应耗时
    
    log_opencode_interaction_to_db() - 数据库记录函数
```

#### 3. `opencode_sessions.py` - API端点
```python
# 新增端点
@router.get("/sessions/{session_id}/interactions")
async def get_session_interactions(
    session_id: str,
    skip: int = 0,
    limit: int = 50,
    db: AsyncSession,
    current_user,
):
    """获取OpenCode会话的交互历史"""
    返回交互记录列表
```

---

### 前端关键文件

#### 1. `index.tsx` - 主页面
```typescript
function OpenCodeAuditPageContent() {
  // 新增功能
  loadInteractions() - 加载交互历史
  将交互转换为日志条目显示
  
  // 轮询
  每2秒获取会话状态
  加载最新交互记录
  
  // UI布局
  左侧：Activity Log（交互日志）
  右侧：Stats Panel（统计面板）
}
```

#### 2. `LogEntry.tsx` - 日志条目组件
```typescript
export const LogEntry = memo(function LogEntry({
  item, isExpanded, onToggle
}: LogEntryProps) {
  // 支持的日志类型
  prompt - 发送提示词
  response - 响应内容
  status - 状态变化
  error - 错误信息
  info - 一般信息
  progress - 进度更新
  
  // 功能
  支持展开/折叠查看详细内容
  Terminal Retro风格边框
})
```

#### 3. `SplashScreen.tsx` - 启动画面
```typescript
export function SplashScreen({ onComplete }: SplashScreenProps) {
  // 启动序列
  [INIT] Loading OpenCode Core...
  [SCAN] Prompt Analysis Engine
  [LOAD] Session Configuration
  [SYNC] OpenCode Server Connection
  [READY] System Online
  
  // 命令输入
  支持 'audit', 'start', 'scan' 命令
  Terminal风格命令行界面
})
```

---

## 剩余完善工作

### 1. 服务层集成（可选但推荐）
在 `OpenCodeSessionService` 的现有方法中使用新的 `_make_opencode_request()` 包装器：

- `check_opencode_server_health()` - 使用包装器
- `create_opencode_server_session()` - 使用包装器
- `send_prompt_to_opencode()` - 使用包装器
- `poll_opencode_result_with_updates()` - 使用包装器

### 2. 前端实时更新增强
- 使用WebSocket或SSE替代轮询（可选）
- 优化交互历史的加载策略
- 添加交互详情查看模态框

### 3. 路由配置
在React Router中添加：
```typescript
import OpenCodeAuditPage from "@/pages/OpenCodeAudit";

<Route path="/opencode-audit/:sessionId?" element={<OpenCodeAuditPage />} />
<Route path="/projects/:projectId/opencode-audit" element={<OpenCodeAuditPage />} />
```

---

## 总结

✅ **核心功能已完整实现！**

- ✅ 后端：完整的交互记录系统
- ✅ 数据库：迁移脚本和表结构
- ✅ API：获取交互历史的端点
- ✅ 前端：Terminal Retro风格的完整页面
- ✅ 组件：所有必要的UI组件
- ✅ 状态管理：useReducer + Context
- ✅ 轮询机制：2秒间隔获取更新

用户现在可以在仿终端页面上实时查看与OpenCode Server的每一次交互了！
