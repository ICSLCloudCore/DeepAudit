# SDD驱动AI开发规范 - OpenCode会话与任务管理重构

## 一、功能规范 (Specification)

### 1.1 功能概述
重构 OpenCode 会话与任务管理逻辑，实现以下目标：
1. **目录命名优化**：OpenCode 创建的目录使用 `OpenCodeSession.id` 作为目录名，而非 `AuditTask.id`
2. **会话复用机制**：在 OpenCode 服务器未关闭前，所有的 Audit Task 都复用同一个 OpenCode Session
3. **完整清理机制**：当 OpenCode Server 关闭后，应该清除 tmp 下的会话目录、清除数据库中的会话记录、关闭 OpenCode 进程

### 1.2 已实现基础
- 现有 OpenCode 服务器启动/停止功能
- 现有 OpenCodeSession 和 OpenCodeAuditTask 数据模型
- 现有 `/start` 和 `/audit-with-prompt` API 端点

### 1.3 待实现功能

#### 功能 1：`/start` 端点创建 OpenCodeSession（不创建 Audit Task）
- **需求**：调用 `/projects/{id}/start` 启动服务器时，创建 `OpenCodeSession` 记录，但 **不创建 Audit Task**
- **细节**：
  - 目录名 = `OpenCodeSession.id`
  - 更新 `project.opencode_active_session_id` 关联到该 session
  - 在服务器上创建会话并更新 `OpenCodeSession.opencode_server_session_id`
  - **不创建** `OpenCodeAuditTask` 记录

#### 功能 2：`/audit-with-prompt` 智能 session 管理
- **需求**：调用 `/audit-with-prompt` 时，先判断是否存在 session，没有则创建并拉起 opencode，然后创建 audit task
- **细节**：
  - 先检查是否有活跃的 `OpenCodeSession`
  - 如果有：
    * 复用该 session
    * 创建新的 `OpenCodeAuditTask` 关联到该 session
    * 发送提示词
  - 如果没有：
    * 创建新的 `OpenCodeSession`
    * 启动 OpenCode 服务器（使用 session.id 作为目录名）
    * 创建 `OpenCodeAuditTask` 关联到该 session
    * 发送提示词

#### 功能 3：完整清理机制
- **需求**：OpenCode Server 关闭时，执行完整清理
- **细节**：
  - 清除 `/tmp/{session_id}` 或 `C:/temp/{session_id}` 目录
  - 更新 `OpenCodeSession.status` 为 `CLOSED`
  - 设置 `OpenCodeSession.completed_at`
  - 清除 `project.opencode_active_session_id`
  - 关闭 OpenCode 进程

### 1.4 验收标准
- [ ] `/start` 端点成功创建 `OpenCodeSession` 并作为目录名
- [ ] 服务器运行期间，多个 audit task 复用同一个 session
- [ ] `/stop` 端点成功清理目录、数据库记录并关闭进程
- [ ] 原有功能不受影响，向后兼容

---

## 二、技术实施计划 (Plan)

### 2.1 技术栈
- 后端：Python + SQLAlchemy + FastAPI
- 数据库：PostgreSQL
- 临时目录：`/tmp/` (Unix) 或 `C:/temp/` (Windows)

### 2.2 架构设计

#### 1. 数据库层
- 在 `Project` 模型新增字段：`opencode_active_session_id` (String, nullable)
- 关联到当前活跃的 `OpenCodeSession`

#### 2. 后端服务层
- 修改 `start_opencode_server`：参数 `audit_task_id` → `opencode_session_id`
- 新增 `get_active_session()` 方法：获取项目的活跃 session
- **重构** `start_audit_with_prompt()`：
  * 先检查是否有活跃 session
  * 有则复用，无则创建 session 并启动服务器
  * 然后创建 audit task
- 修改 `stop_opencode_server()`：添加目录清理和数据库记录清理逻辑

#### 3. 后端 API 层
- **修改** `/projects/{id}/start` 端点：创建 `OpenCodeSession`，**不创建** `AuditTask`

### 2.3 数据模型变更

#### Project 模型新增字段
```python
# backend/app/models/project.py
opencode_active_session_id = Column(String, nullable=True)
```

---

## 三、待修改文件清单

### 优先级：高

#### 1. 数据库模型层
| 文件路径 | 修改原因 |
|---------|---------|
| `backend/app/models/project.py` | 新增 `opencode_active_session_id` 字段 |

#### 2. 后端服务层
| 文件路径 | 修改原因 |
|---------|---------|
| `backend/app/services/opencode_session_service.py` | 核心重构：目录命名、会话复用、清理机制 |

#### 3. 后端 API 层
| 文件路径 | 修改原因 |
|---------|---------|
| `backend/app/api/v1/endpoints/opencode_sessions.py` | 修改 `/start` 端点逻辑 |

---

## 四、可执行任务清单 (Tasks)

### 优先级：高

1. [x] 在 `Project` 模型中添加 `opencode_active_session_id` 字段
2. [x] 修改 `start_opencode_server()` 方法签名：参数 `audit_task_id` → `opencode_session_id`
3. [x] 修改目录创建逻辑：使用 `opencode_session_id` 作为目录名
4. [x] 添加 `get_active_session()` 方法：获取项目的活跃 session
5. [x] 修改 `create_opencode_session()` 方法：参数顺序调整，prompt_content 可选
6. [x] **修改** `/projects/{id}/start` 端点：创建 `OpenCodeSession`，**不创建** `AuditTask`
7. [x] **重构** `start_audit_with_prompt()` 方法：
   - [x] 先检查是否有活跃 session
   - [x] 有则复用，无则创建 session 并启动服务器
   - [x] 然后创建 audit task
8. [x] 修改 `stop_opencode_server()` 方法：添加目录清理和数据库记录清理逻辑
9. [ ] 测试：`/start` 端点创建 session 并作为目录名（不创建 audit task）
10. [ ] 测试：`/audit-with-prompt` 智能 session 管理（有则复用，无则创建）
11. [ ] 测试：服务器运行期间多个 audit task 复用同一个 session
12. [ ] 测试：`/stop` 端点完整清理

### 已完成任务说明：
- ✅ 创建了完整的后端数据模型变更
- ✅ 修改了 `start_opencode_server` 方法签名和目录逻辑
- ✅ 添加了 `get_active_session` 方法用于获取活跃会话
- ✅ 修改了 `create_opencode_session` 方法参数顺序和可选性
- ✅ 修改了 `/projects/{id}/start` 端点，创建 OpenCodeSession 而非 AuditTask
- ✅ 重构了 `start_audit_with_prompt` 方法，实现智能 session 复用
- ✅ 修改了 `stop_opencode_server` 方法，添加目录清理和数据库记录清理

---

## 五、实施指引 (Implementation)

### 5.1 代码规范
- 后端代码遵循现有项目 Python 编码规范，使用 ruff 进行 lint 检查
- 数据库操作使用 SQLAlchemy async 模式
- 临时目录操作使用 `pathlib` 确保跨平台兼容性

### 5.2 关键实现细节

#### 目录清理实现
```python
# 清理临时目录
session_dir = (
    Path(f"/tmp/{session_id}") 
    if sys.platform != "win32" 
    else Path(f"C:/temp/{session_id}")
)
if session_dir.exists():
    import shutil
    shutil.rmtree(session_dir)
```

#### /audit-with-prompt 智能 session 管理流程
```
1. 检查是否有活跃的 OpenCodeSession
2. 如果有活跃 session：
   a. 复用该 session
   b. 创建新的 OpenCodeAuditTask 关联到该 session
   c. 复用 server_session_id 发送消息
3. 如果没有活跃 session：
   a. 创建新的 OpenCodeSession
   b. 启动 OpenCode 服务器（使用 session.id 作为目录名）
   c. 创建 OpenCodeAuditTask 关联到该 session
   d. 发送提示词
```

### 5.3 验证标准
- 目录命名正确使用 `OpenCodeSession.id`
- 会话复用功能正常工作
- 清理机制完整执行
- 原有功能不受影响
- 无数据丢失或泄漏

---

## 总结

本次变更主要涉及 **3 个核心文件**，围绕以下目标：

### 核心业务逻辑
1. **`/start` 端点**：创建 `OpenCodeSession`，**不创建** `AuditTask`
2. **`/audit-with-prompt` 端点**：
   - 先判断是否有活跃 session
   - 有则复用，无则创建 session 并拉起 opencode
   - 然后创建 audit task
3. 目录命名：使用 `OpenCodeSession.id` 作为目录名
4. 完整清理机制：服务器关闭时清理目录、数据库记录和进程
