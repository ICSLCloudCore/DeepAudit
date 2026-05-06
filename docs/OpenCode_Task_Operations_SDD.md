# OpenCode 审计任务操作功能 - 软件设计文档 (SDD)

**版本**: 1.0  
**日期**: 2026-05-04  
**作者**: DeepAudit Team

---

## 1. 概述

### 1.1 项目背景

当前 DeepAudit 平台的 OpenCode 审计功能已有基础的取消和完成功能，但存在以下痛点：

1. **代码复用不足**：任务列表页和详情页的操作逻辑分散，代码重复
2. **缺少删除功能**：用户无法删除不需要的审计任务
3. **操作入口单一**：只有详情页有完成/取消按钮，任务列表页缺少便捷操作
4. **缺少手动状态控制**：在业务异常时，用户无法灵活管理任务状态
5. **资源清理不完善**：删除任务时未清理临时项目目录

### 1.2 功能目标

1. **新建共享工具模块**：将公共业务逻辑提取到 `opencode_task_utils.py`，最大化代码复用
2. **新增三个核心操作**：
   - 手动完成任务：允许用户手动标记任务为完成，自动导入漏洞
   - 取消任务：关闭服务器，清理资源
   - 安全删除任务：完整清理所有关联数据和临时文件
3. **任务列表页操作菜单**：添加下拉操作菜单，支持在列表页直接操作
4. **详情页逻辑优化**：重构 OpenCodeAudit 详情页，复用新 API
5. **完善权限控制**：确保只有任务创建者可执行操作
6. **物理删除**：删除操作永久移除数据，不使用软删除

### 1.3 范围

本文档涵盖：
- 后端共享工具模块的设计和实现
- 三个新 API 端点的设计（`manual-complete`、`safe-delete`、重构 `cancel`）
- 前端任务列表页的操作下拉菜单
- 前端 OpenCodeAudit 详情页的逻辑重构
- 删除确认对话框的实现
- 临时项目目录的清理

不涉及：
- Agent 审计任务的操作（本次仅关注 OpenCode 审计）
- 快速扫描任务的操作
- 软删除机制

---

## 2. 系统架构

### 2.1 架构设计原则

1. **代码复用优先**：所有公共业务逻辑放入共享工具模块
2. **API 统一**：详情页和列表页使用相同的 API 端点
3. **错误容忍**：每个操作步骤独立，部分失败不影响整体流程
4. **权限严格**：所有操作验证 `task.created_by == current_user.id`
5. **清理彻底**：删除操作清理所有关联资源（数据库记录、临时文件）

### 2.2 当前工作流程

```
（详情页）用户点击取消/完成
    ↓
前端执行独立的业务逻辑
    ↓
调用不同的 API 端点
    ↓
完成操作
```

**问题**：
- 列表页无操作入口
- 代码分散，逻辑重复
- 无删除功能
- 资源清理不完整

### 2.3 改进后工作流程

```
（任务列表页/详情页）用户点击操作菜单
    ↓
[删除操作] 显示确认对话框
    ↓
前端调用统一的 API 端点
    ↓
后端通过共享工具执行操作：
    ↓
1. 更新任务状态
2. 关闭 OpenCode 会话
3. 停止 OpenCode 服务器
4. [完成操作] 扫描导入漏洞
5. [删除操作] 删除漏洞记录
6. [删除操作] 删除临时项目目录
7. [删除操作] 删除任务记录
    ↓
返回结果
```

---

## 3. 后端设计

### 3.1 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 新建 | `backend/app/utils/opencode_task_utils.py` | 共享业务逻辑工具模块 |
| 更新 | `backend/app/api/v1/endpoints/opencode/audit_tasks.py` | 新增端点，重构现有取消端点 |
| 更新 | `backend/app/utils/__init__.py` | 导出新工具函数 |

### 3.2 共享工具模块设计

**文件**: `backend/app/utils/opencode_task_utils.py`

#### 3.2.1 核心函数列表

| 函数名 | 说明 | 参数 | 返回值 |
|--------|------|------|--------|
| `close_opencode_session_by_task` | 关闭任务关联的 OpenCode 会话 | task, db | bool |
| `stop_opencode_server_by_project` | 停止项目关联的 OpenCode 服务器 | project, db | bool |
| `delete_project_directory` | 删除任务的临时项目目录 | task | bool |
| `scan_and_import_vulnerabilities` | 扫描并导入漏洞（复用现有逻辑） | task_id, db | dict |
| `update_task_status` | 更新任务状态 | task, status, error_msg, db | None |
| `delete_task_vulnerabilities` | 删除任务关联的所有漏洞 | task_id, db | bool |

#### 3.2.2 核心函数设计

**函数**: `close_opencode_session_by_task(task, db)`

```python
async def close_opencode_session_by_task(task: OpenCodeAuditTask, db: AsyncSession) -> bool:
    """
    通过任务关闭 OpenCode 会话
    
    流程:
    1. 检查任务是否有关联的 session_id
    2. 查找会话记录
    3. 更新会话状态为 CLOSED
    4. 记录完成时间
    """
```

**函数**: `stop_opencode_server_by_project(project, db)`

```python
async def stop_opencode_server_by_project(project: Project, db: AsyncSession) -> bool:
    """
    通过项目停止 OpenCode 服务器
    
    流程:
    1. 检查项目是否有 opencode_pid
    2. 尝试终止进程（Windows 使用 taskkill，Unix 使用信号）
    3. 清理项目状态字段（pid, port, active_session_id）
    """
```

**函数**: `delete_project_directory(task)`

```python
async def delete_project_directory(task: OpenCodeAuditTask) -> bool:
    """
    删除任务关联的临时项目目录
    
    路径规则:
    - Windows: C:/temp/{session_id}
    - Linux/Unix: /tmp/{session_id}
    """
```

### 3.3 API 端点设计

#### 3.3.1 手动完成任务端点

**路径**: `POST /api/v1/opencode-audit-tasks/{task_id}/manual-complete`

**请求头**:
- `Authorization`: Bearer token

**响应格式** (200 OK):
```json
{
  "id": "task-uuid",
  "project_id": "project-uuid",
  "name": "任务名称",
  "status": "completed",
  "current_step": null,
  "started_at": "2026-05-04T10:00:00",
  "completed_at": "2026-05-04T10:30:00",
  "findings_count": 5,
  "critical_count": 1,
  "high_count": 2,
  "medium_count": 1,
  "low_count": 1,
  "project": { ... }
}
```

**执行流程**:
1. 验证任务存在且属于当前用户
2. 更新任务状态为 `completed`
3. 关闭 OpenCode 会话
4. 停止 OpenCode 服务器
5. 扫描并导入漏洞（异常不影响主流程）
6. 返回更新后的任务

**错误响应**:
- `404 Not Found`: 任务不存在
- `403 Forbidden`: 无权操作此任务

#### 3.3.2 安全删除任务端点

**路径**: `POST /api/v1/opencode-audit-tasks/{task_id}/safe-delete`

**请求头**:
- `Authorization`: Bearer token

**响应格式** (200 OK):
```json
{
  "message": "任务已成功删除",
  "task_id": "task-uuid"
}
```

**执行流程**:
1. 验证任务存在且属于当前用户
2. 关闭 OpenCode 会话
3. 停止 OpenCode 服务器
4. 删除关联的漏洞记录
5. 删除临时项目目录
6. 物理删除任务记录

**错误响应**:
- `404 Not Found`: 任务不存在
- `403 Forbidden`: 无权删除此任务

#### 3.3.3 取消任务端点（重构）

**路径**: `POST /api/v1/opencode-audit-tasks/{task_id}/cancel`

**变更**: 复用共享工具函数，保持接口兼容性

**执行流程**:
1. 验证任务存在且属于当前用户
2. 更新任务状态为 `cancelled`
3. 关闭 OpenCode 会话
4. 停止 OpenCode 服务器
5. 返回更新后的任务

### 3.4 数据模型（无变更）

本功能不需要新增或修改数据库模型，利用现有模型字段即可。

---

## 4. 前端设计

### 4.1 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 更新 | `frontend/src/shared/api/opencodeAuditTasks.ts` | 新增 API 调用函数 |
| 更新 | `frontend/src/pages/AuditTasks.tsx` | 添加任务操作下拉菜单 |
| 更新 | `frontend/src/pages/OpenCodeAudit/index.tsx` | 重构取消/完成逻辑 |

### 4.2 API 客户端设计

**文件**: `frontend/src/shared/api/opencodeAuditTasks.ts`

#### 4.2.1 新增类型定义

```typescript
export interface ManualCompleteResponse {
  message: string;
  task_id: string;
}

export interface SafeDeleteResponse {
  message: string;
  task_id: string;
}
```

#### 4.2.2 新增 API 函数

```typescript
/**
 * 手动完成 OpenCode 审计任务
 */
export async function manualCompleteOpenCodeAuditTask(
  taskId: string
): Promise<OpenCodeAuditTask>

/**
 * 安全删除 OpenCode 审计任务
 */
export async function safeDeleteOpenCodeAuditTask(
  taskId: string
): Promise<SafeDeleteResponse>
```

### 4.3 任务列表页设计

**文件**: `frontend/src/pages/AuditTasks.tsx`

#### 4.3.1 新增状态管理

```typescript
const [processingTaskId, setProcessingTaskId] = useState<string | null>(null);
const [deleteConfirmOpen, setDeleteConfirmOpen] = useState<string | null>(null);
```

#### 4.3.2 操作处理函数

| 函数名 | 说明 |
|--------|------|
| `handleManualCompleteTask` | 执行手动完成操作 |
| `handleCancelTask` | 执行取消操作 |
| `handleDeleteTask` | 执行删除操作 |

#### 4.3.3 UI 组件设计

**组件 1: 操作下拉菜单**
- 使用 ShadCN/UI 的 `DropdownMenu` 组件
- 触发按钮：`MoreVertical` 图标
- 菜单项：
  - 手动完成（绿色，`CheckCircle` 图标）
  - 取消任务（琥珀色，`XCircle` 图标）
  - 分隔线
  - 删除任务（红色，`Trash2` 图标）

**组件 2: 删除确认对话框**
- 使用 ShadCN/UI 的 `AlertDialog` 组件
- 内容说明删除的影响范围：
  - 任务记录
  - 漏洞发现
  - 项目临时文件
- 强调"无法撤销"

**显示逻辑**:
- 运行中/等待中任务：显示完整下拉菜单
- 已完成/失败/已取消任务：只显示删除按钮

### 4.4 OpenCodeAudit 详情页设计

**文件**: `frontend/src/pages/OpenCodeAudit/index.tsx`

#### 4.4.1 逻辑重构

**变更点**:
- 取消操作：调用新的 `cancelOpenCodeAuditTask` API
- 完成操作：调用新的 `manualCompleteOpenCodeAuditTask` API
- 移除本地的服务器停止/会话关闭逻辑（由后端统一处理）
- 断开 SSE 连接（如果有）

---

## 5. 错误处理

### 5.1 错误处理策略

1. **步骤独立性**：每个操作步骤独立执行，一个失败不影响其他步骤
2. **日志记录**：所有步骤记录详细日志，包含成功/失败状态
3. **错误容忍**：
   - 扫描导入漏洞失败：不影响标记任务完成
   - 清理临时目录失败：不影响删除任务记录
   - 停止服务器失败：不影响其他清理操作
4. **友好反馈**：前端显示明确的成功/失败提示

### 5.2 错误场景表

| 场景 | 处理方式 | 用户提示 |
|------|---------|---------|
| 任务不存在 | 返回 404 | "任务不存在" |
| 无权操作 | 返回 403 | "无权操作此任务" |
| 关闭会话失败 | 记录错误，继续 | 无（继续操作） |
| 停止服务器失败 | 记录错误，继续 | 无（继续操作） |
| 删除临时目录失败 | 记录错误，继续 | 无（继续操作） |
| 导入漏洞失败 | 记录错误，继续 | 无（任务仍标记完成） |
| 网络错误 | 捕获异常 | "操作失败，请重试" |

### 5.3 日志记录

关键操作记录日志：

```python
logger.info(f"[OpenCode] 手动完成任务: {task_id}")
logger.info(f"[OpenCode] 安全删除任务: {task_id}")
logger.info(f"[OpenCode] 已删除项目目录: {path}")
logger.warning(f"[OpenCode] 漏洞导入失败，但任务已标记完成: {error}")
logger.error(f"[OpenCode] 删除项目目录失败: {error}")
```

---

## 6. 数据流程

### 6.1 手动完成任务数据流

```
用户点击"手动完成"
    ↓
前端调用 POST /manual-complete
    ↓
后端验证权限和任务存在
    ↓
[utils] update_task_status → 数据库更新为 completed
    ↓
[utils] close_opencode_session_by_task → 更新 session 状态
    ↓
[utils] stop_opencode_server_by_project → 终止进程，清理项目状态
    ↓
[utils] scan_and_import_vulnerabilities → 尝试导入漏洞（失败不影响）
    ↓
返回更新后的任务对象
    ↓
前端刷新列表/详情页
    ↓
显示"任务已手动完成"提示
```

### 6.2 安全删除任务数据流

```
用户点击"删除任务"
    ↓
显示确认对话框
    ↓
用户确认
    ↓
前端调用 POST /safe-delete
    ↓
后端验证权限和任务存在
    ↓
[utils] close_opencode_session_by_task → 关闭会话
    ↓
[utils] stop_opencode_server_by_project → 停止服务器
    ↓
[utils] delete_task_vulnerabilities → 删除漏洞记录
    ↓
[utils] delete_project_directory → 删除临时目录
    ↓
删除任务记录 → db.delete(task)
    ↓
返回删除成功消息
    ↓
前端刷新任务列表
    ↓
显示"任务已删除"提示
```

### 6.3 取消任务数据流

```
用户点击"取消任务"
    ↓
前端调用 POST /cancel
    ↓
后端验证权限和任务存在
    ↓
[utils] update_task_status → 数据库更新为 cancelled
    ↓
[utils] close_opencode_session_by_task → 关闭会话
    ↓
[utils] stop_opencode_server_by_project → 停止服务器
    ↓
返回更新后的任务对象
    ↓
前端刷新列表/详情页
    ↓
显示"任务已取消"提示
```

---

## 7. 安全设计

### 7.1 权限控制

**所有操作都验证**:
```python
if task.created_by != current_user.id:
    raise HTTPException(status_code=403, detail="无权操作此任务")
```

**验证流程**:
1. 查询任务时使用 `selectinload` 加载关联数据
2. 检查任务创建者 ID 是否等于当前用户 ID
3. 仅允许任务创建者执行任何操作

### 7.2 删除操作安全

1. **二次确认**：前端显示确认对话框，说明影响范围
2. **物理删除**：直接从数据库移除记录，不使用软删除标记
3. **清理彻底**：删除所有关联资源（漏洞、临时文件）
4. **不可撤销**：明确告知用户操作无法恢复

### 7.3 文件系统安全

1. **路径限制**：仅删除临时目录（`/tmp/{session_id}` 或 `C:/temp/{session_id}`）
2. **不递归上升**：不使用可能导致目录 traversal 的路径操作
3. **错误处理**：删除失败时记录日志，不抛出异常（不影响主流程）

---

## 8. 测试计划

### 8.1 功能测试

#### 8.1.1 后端 API 测试

- [ ] 手动完成 - 验证任务状态更新为 `completed`
- [ ] 手动完成 - 验证会话状态更新为 `closed`
- [ ] 手动完成 - 验证服务器进程已停止
- [ ] 手动完成 - 验证漏洞已导入
- [ ] 手动完成 - 验证权限控制（其他用户无法操作）
- [ ] 取消任务 - 验证任务状态更新为 `cancelled`
- [ ] 取消任务 - 验证权限控制
- [ ] 安全删除 - 验证任务记录已删除
- [ ] 安全删除 - 验证漏洞记录已删除
- [ ] 安全删除 - 验证临时目录已删除
- [ ] 安全删除 - 验证权限控制
- [ ] 错误容忍 - 验证一个步骤失败不影响整体流程

#### 8.1.2 前端 UI 测试

- [ ] 任务列表页 - 运行中任务显示完整操作菜单
- [ ] 任务列表页 - 已完成任务只显示删除按钮
- [ ] 任务列表页 - 手动完成功能正常
- [ ] 任务列表页 - 取消功能正常
- [ ] 任务列表页 - 删除确认对话框正常显示
- [ ] 任务列表页 - 删除功能正常
- [ ] 任务列表页 - 加载状态正常显示
- [ ] OpenCodeAudit 详情页 - 取消功能正常
- [ ] OpenCodeAudit 详情页 - 完成功能正常
- [ ] OpenCodeAudit 详情页 - 与列表页行为一致

### 8.2 用户体验测试

- [ ] 确认对话框内容清晰易读
- [ ] 操作反馈及时明确
- [ ] 加载状态有适当提示
- [ ] 错误提示友好准确

### 8.3 安全测试

- [ ] 用户 A 无法操作用户 B 的任务
- [ ] 删除操作真正删除数据（查询验证）
- [ ] 临时目录真正被删除（文件系统验证）

---

## 9. 部署说明

### 9.1 部署步骤

1. **后端部署**:
   - 新建 `backend/app/utils/opencode_task_utils.py`
   - 更新 `backend/app/api/v1/endpoints/opencode/audit_tasks.py`
   - 更新 `backend/app/utils/__init__.py`
   - 重启后端服务

2. **前端部署**:
   - 更新 `frontend/src/shared/api/opencodeAuditTasks.ts`
   - 更新 `frontend/src/pages/AuditTasks.tsx`
   - 更新 `frontend/src/pages/OpenCodeAudit/index.tsx`
   - 构建和部署前端

### 9.2 回滚计划

如果出现问题：

1. **后端回滚**:
   - 恢复 `audit_tasks.py` 到前一版本
   - 移除新建的 `opencode_task_utils.py`
   - 重启服务

2. **前端回滚**:
   - 恢复修改的三个文件到前一版本
   - 重新构建和部署

**说明**：无需数据库迁移，回滚相对简单。

---

## 10. 附录

### 10.1 临时目录路径规则

| 平台 | 路径 |
|------|------|
| Windows | `C:/temp/{session_id}` |
| Linux/Unix | `/tmp/{session_id}` |
| macOS | `/tmp/{session_id}` |

### 10.2 任务状态枚举

```python
class OpenCodeAuditTaskStatus(str, Enum):
    PENDING = "pending"      # 等待中
    RUNNING = "running"      # 运行中
    COMPLETED = "completed"  # 已完成
    FAILED = "failed"        # 失败
    CANCELLED = "cancelled"  # 已取消
```

### 10.3 参考文档

- `backend/app/api/v1/endpoints/opencode/audit_tasks.py` - OpenCode 审计任务 API
- `backend/app/services/opencode/opencode_session_service.py` - OpenCode 会话服务
- `frontend/src/shared/api/opencodeAuditTasks.ts` - OpenCode API 客户端
- `frontend/src/pages/AuditTasks.tsx` - 审计任务列表页
- `frontend/src/pages/OpenCodeAudit/index.tsx` - OpenCode 审计详情页
- `docs/OpenCode_Export_Button_Improvement_SDD.md` - 参考文档格式

### 10.4 注意事项

1. **代码复用优先**：所有公共逻辑必须通过 `opencode_task_utils.py` 复用，禁止重复实现
2. **错误容忍**：每个操作步骤独立，部分失败不影响整体流程
3. **权限验证**：所有 API 端点必须验证 `task.created_by == current_user.id`
4. **清理彻底**：删除操作必须清理所有关联资源（数据库记录、临时文件）
5. **前后端一致**：详情页和列表页必须使用相同的 API 端点，行为保持一致
6. **无需回滚**：删除操作无需回滚机制，确认后直接执行

---

**文档结束**
