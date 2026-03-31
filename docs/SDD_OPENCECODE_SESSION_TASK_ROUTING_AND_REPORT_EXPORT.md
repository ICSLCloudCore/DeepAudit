# SDD驱动AI开发规范 - OpenCode审计会话与任务路由重构及报告导出功能

## 一、功能规范 (Specification)

### 1.1 功能概述
重构 OpenCode 审计页面的路由结构，从单 sessionId 参数改为 sessionId + taskId 双参数；在页面 Header 中增加 Task Status 显示；将操作按钮（查看问题、导出MD报告、导出JSON报告）移至页面右下角；并使用 Audit Task 的状态而非 Session 状态来控制按钮显示。同时修复现有页面中跳转链接的错误。

### 1.2 已实现基础
- 现有路由：`/opencode-audit/:sessionId`
- 现有按钮位于右侧面板 StatsPanel 下方，使用 `isComplete`（Session 状态）判断显示
- 已实现报告导出后端 API：`/export-report-md` 和 `/export-report-json`
- `OpenCodeAuditTask` 数据结构同时包含 `id`（taskId）和 `opencode_session_id`（sessionId）

### 1.3 待实现功能
1. **路由重构**：
   - 删除旧路由：`/opencode-audit/:sessionId`
   - 添加新路由：`/opencode-audit/:sessionId/tasks/:taskId`

2. **页面状态管理**：
   - 从 URL 参数同时获取 `sessionId` 和 `taskId`
   - 添加 `auditTask` 状态，调用 API 加载任务数据
   - 使用 `auditTask.status === 'completed'` 判断按钮显示

3. **Header 组件更新**：
   - 在 Header 中增加 Task Status 显示
   - 与 Session Status、Server Status 并列显示

4. **按钮显示条件调整**：
   - 按钮位置**保留在原来的右侧面板位置**
   - 修改按钮显示条件：从 `session && isComplete` 改为 `auditTask?.status === 'completed'`

5. **跳转链接更新**：
   - 更新所有跳转到 OpenCode 审计页面的链接
   - 修复 Dashboard.tsx 中错误使用 task.id 作为 sessionId 的 bug

### 1.4 验收标准
- 新路由 `/opencode-audit/:sessionId/tasks/:taskId` 正常工作
- Header 中正确显示 Session Status、Server Status、Task Status
- 三个按钮正确显示在页面右下角
- 按钮仅在 Audit Task 状态为 `completed` 时显示
- 所有跳转链接正确指向新路由格式
- Dashboard.tsx 中的 bug 被修复

---

## 二、技术实施计划 (Plan)

### 2.1 技术栈
- 前端：React + TypeScript + Tailwind CSS + React Router
- 状态管理：useReducer（现有 useOpenCodeAuditState hook）

### 2.2 路由设计
**旧路由（删除）：**
```
/opencode-audit/:sessionId
```

**新路由（添加）：**
```
/opencode-audit/:sessionId/tasks/:taskId
```

### 2.3 数据结构确认
`OpenCodeAuditTask` 接口包含：
```typescript
{
  id: string;                    // taskId
  opencode_session_id: string | null;  // sessionId
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  // ... 其他字段
}
```

### 2.4 按钮显示条件调整
**按钮位置：保留在右侧面板原来的位置**
**显示条件：从 `session && isComplete` 改为 `auditTask?.status === 'completed'`

---

## 三、待修改文件清单

### 优先级：高

#### 1. 路由配置
| 文件路径 | 修改原因 |
|---------|---------|
| `frontend/src/app/routes.tsx` | 删除旧路由，添加新路由 |

#### 2. OpenCodeAudit 主页面
| 文件路径 | 修改原因 |
|---------|---------|
| `frontend/src/pages/OpenCodeAudit/index.tsx` | 从 URL 获取 taskId、添加 auditTask 状态、修改按钮显示条件 |

#### 3. Header 组件
| 文件路径 | 修改原因 |
|---------|---------|
| `frontend/src/pages/OpenCodeAudit/components/Header.tsx` | 添加 Task Status 显示 |
| `frontend/src/pages/OpenCodeAudit/types.ts` | 更新 HeaderProps 类型 |

#### 4. 跳转链接更新（共 5 个文件）
| 文件路径 | 修改原因 |
|---------|---------|
| `frontend/src/pages/ProjectDetail.tsx` | 更新链接格式（第 862-863 行） |
| `frontend/src/pages/project-detail/components/ProjectTasksTab.tsx` | 更新链接格式（第 51-52 行） |
| `frontend/src/pages/AuditTasks.tsx` | 更新链接格式（第 1254-1255 行） |
| `frontend/src/pages/Dashboard.tsx` | 更新链接格式并修复 bug（第 472-473 行） |
| `frontend/src/pages/Dashboard.tsx` | 更新链接格式并修复 bug（第 652-653 行） |

---

## 四、可执行任务清单 (Tasks)

### 优先级：高

1. [ ] 修改路由配置：删除 `/opencode-audit/:sessionId`，添加 `/opencode-audit/:sessionId/tasks/:taskId`
2. [ ] 更新 OpenCodeAudit 页面：
   - [ ] 从 `useParams` 获取 `sessionId` 和 `taskId`
   - [ ] 添加 `auditTask` 状态和 `loadingAuditTask` 状态
   - [ ] 添加 `useEffect` 加载 auditTask 数据
   - [ ] 修改按钮显示条件为 `auditTask?.status === 'completed'`
3. [ ] 更新 Header 组件：
   - [ ] 更新 `HeaderProps` 类型，添加 `auditTask?: OpenCodeAuditTask`
   - [ ] 在 Header 中添加 Task Status 显示
4. [ ] 更新 ProjectDetail.tsx 跳转链接
5. [ ] 更新 ProjectTasksTab.tsx 跳转链接
6. [ ] 更新 AuditTasks.tsx 跳转链接
7. [ ] 更新 Dashboard.tsx 第 472-473 行跳转链接并修复 bug
8. [ ] 更新 Dashboard.tsx 第 652-653 行跳转链接并修复 bug

### 关键发现说明
- ✅ 所有跳转页面都有完整的 `OpenCodeAuditTask` 对象
- ✅ `OpenCodeAuditTask` 同时包含 `id`（taskId）和 `opencode_session_id`（sessionId）
- ⚠️ Dashboard.tsx 中有两处 bug：错误地使用 `task.id` 作为 sessionId，应改为使用 `task.opencode_session_id`

---

## 五、实施指引 (Implementation)

### 5.1 代码规范
- 遵循现有项目的 TypeScript + React 编码规范
- 组件 Props 类型定义完整
- 使用 Tailwind CSS 类名保持样式一致性
- 保持现有代码风格和文件结构

### 5.2 参考实现
- 参考现有 Header 组件中 Session Status 和 Server Status 的显示方式
- 参考现有按钮组件的样式和交互逻辑
- 参考现有路由配置的格式

### 5.3 验证标准
- 新路由能够正常访问和渲染
- Header 中三个状态（Session、Server、Task）正确显示
- 按钮正确显示在右下角，样式符合设计
- 按钮仅在 Audit Task 完成时显示
- 所有跳转链接测试通过
- Dashboard.tsx 的 bug 被修复

---

## 总结

本次变更共涉及 **8 个文件**：
1. 路由配置：1 个文件
2. OpenCodeAudit 页面：2 个文件（主页面 + Header + types）
3. 跳转链接更新：5 个文件

主要变更围绕：
1. 路由结构从单参数改为双参数
2. 页面状态管理增加 auditTask
3. Header 增加 Task Status 显示
4. 按钮位置从右侧面板移至右下角
5. 所有跳转链接更新为新格式并修复 bug
