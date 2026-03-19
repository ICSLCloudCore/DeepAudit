# OpenCodeAudit 页面跳转修复说明

## 问题
点击"启动审计"后没有跳转到OpenCodeAudit页面，而是停留在项目详情页面。

---

## 修复内容

### 1. 修改 `frontend/src/pages/ProjectDetail.tsx`

#### a. 添加 `useNavigate` 导入
```typescript
import { useMemo, useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";  // 新增 useNavigate
```

#### b. 在组件中添加 `navigate` 实例
```typescript
export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();  // 新增
  // ...
}
```

#### c. 修改 `handleStartOpenCodeAudit` 函数
```typescript
// 修改前
const handleStartOpenCodeAudit = (response: StartAuditWithPromptResponse) => {
  loadProjectData();
  setActiveTab("overview");
};

// 修改后
const handleStartOpenCodeAudit = (response: StartAuditWithPromptResponse) => {
  loadProjectData();
  setShowOpenCodeAuditDialog(false);  // 关闭对话框
  navigate(`/opencode-audit/${response.session_id}`);  // 跳转到OpenCodeAudit页面
};
```

---

### 2. 修改 `frontend/src/app/routes.tsx`

#### a. 添加 OpenCodeAudit 导入
```typescript
import AgentAudit from "@/pages/AgentAudit";
import OpenCodeAudit from "@/pages/OpenCodeAudit";  // 新增
import AdminDashboard from "@/pages/AdminDashboard";
```

#### b. 添加路由配置
```typescript
const routes: RouteConfig[] = [
  // ... 现有路由 ...
  
  // 新增 OpenCodeAudit 路由
  {
    name: "OpenCode审计",
    path: "/opencode-audit",
    element: <OpenCodeAudit />,
    visible: false,
  },
  {
    name: "OpenCode审计会话",
    path: "/opencode-audit/:sessionId",
    element: <OpenCodeAudit />,
    visible: false,
  },
  
  // ... 其他路由 ...
];
```

---

## 现在的工作流程

```
用户在项目详情页
    ↓
点击"OpenCode 审计"按钮
    ↓
显示 OpenCodeAuditDialog 对话框
    ↓
用户选择提示词并点击"启动"
    ↓
触发 handleStartOpenCodeAudit()
    ↓
调用 API: startOpenCodeAuditWithPrompt()
    ↓
获取 response.session_id
    ↓
关闭对话框: setShowOpenCodeAuditDialog(false)
    ↓
跳转到: /opencode-audit/{session_id}
    ↓
显示 OpenCodeAudit 页面
    ↓
显示 SplashScreen 启动画面（可选）
    ↓
进入主审计页面
    ↓
左侧: Activity Log 显示实时交互
右侧: Stats Panel 显示统计信息
```

---

## 关键文件清单

### 修改的文件
1. ✅ `frontend/src/pages/ProjectDetail.tsx` - 添加跳转逻辑
2. ✅ `frontend/src/app/routes.tsx` - 添加路由配置

### 已存在的文件
1. ✅ `frontend/src/pages/OpenCodeAudit/` - 完整的页面实现
2. ✅ `backend/app/models/opencode_interaction.py` - 数据模型
3. ✅ `backend/app/api/v1/endpoints/opencode_sessions.py` - API端点
4. ✅ `backend/alembic/versions/010_add_opencode_interactions.py` - 数据库迁移

---

## 验证步骤

1. 启动前端和后端服务器
2. 进入项目详情页面
3. 点击"OpenCode 审计"按钮
4. 在对话框中选择提示词并点击"启动"
5. 应该自动跳转到 `http://localhost:3000/opencode-audit/{session_id}`
6. 显示 OpenCodeAudit 页面
7. 在 Activity Log 中可以看到实时交互信息

---

## 总结

✅ **问题已修复！**

- 添加了路由配置
- 修改了跳转逻辑
- 现在点击"启动审计"后会正确跳转到OpenCodeAudit页面
- 用户可以在仿终端风格的页面上查看实时交互信息
