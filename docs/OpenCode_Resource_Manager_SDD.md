# OpenCode 资源管理 - 软件设计文档 (SDD)

**版本**: 1.0  
**日期**: 2026-04-25  
**作者**: DeepAudit Team

---

## 1. 概述

### 1.1 项目背景

DeepAudit 是一个 AI 驱动的智能安全代码审计平台。目前，OpenCode 相关的资源管理功能分散在四个独立的页面中：
- Skill 管理 (`/skill-marketplace`)
- Agent 管理 (`/agents`)
- 模型管理 (`/models`)
- MCP 管理 (`/mcp-marketplace`)

为了提升用户体验和代码可维护性，需要将这些功能整合到一个统一的页面中，使用标签页切换的方式进行管理。

### 1.2 功能目标

- 将四个独立的管理页面整合为一个统一的"Opencode 管理"页面
- 使用 Tabs 组件实现四个模块的切换（标签顺序：Models → Skills → Agents → MCPs）
- 保持各模块原有的所有功能不变
- 更新侧边栏导航，将四个菜单项合并为一个
- 删除旧的路由和页面文件
- 保持赛博朋克风格设计一致性

### 1.3 范围

本文档涵盖 OpenCode 资源管理整合功能的前端设计和实现。不涉及后端变更（所有 API 保持不变）。

---

## 2. 系统架构

### 2.1 总体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        前端 (React)                                    │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │         OpenCodeResourceManager (新页面)                         │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │
│  │  │  Tabs                                                      │  │
│  │  │  [Models] [Skills] [Agents] [MCPs]                       │  │
│  │  └──────────────┬──────────────────────────────────────────────┘  │
│  │                 │                                                 │
│  │  ┌──────────────▼─────────────────────────────────────────────┐  │
│  │  │  标签内容组件 (复用现有逻辑)                               │  │
│  │  ├───────────────────────────────────────────────────────────────┤  │
│  │  │ ModelsTab - 模型管理（来自 ModelManager）                  │  │
│  │  │ SkillsTab - Skill 管理（来自 SkillMarketplace）             │  │
│  │  │ AgentsTab - Agent 管理（来自 AgentManagement）              │  │
│  │  │ MCPsTab - MCP 管理（来自 MCPMarketplace）                  │  │
│  │  └─────────────────────────────────────────────────────────────┘  │
│  └──────────────────────┬────────────────────────────────────────────┘  │
│                         │                                               │
│  ┌──────────────────────────▼───────────────────────────────────────┐  │
│  │  API 层 (复用现有)                                               │  │
│  │  - opencodeConfig.ts (模型配置 API)                           │  │
│  │  - opencode.ts (Skill、Agent、MCP API)                        │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────▼───────────────────────────────────────┐  │
│  │  路由 (routes.tsx)                                                 │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────▼───────────────────────────────────────┐  │
│  │  Sidebar (侧边栏)                                                  │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                        (无后端变更)
                              │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 标签页顺序

| 顺序 | 标签 | 功能描述 |
|------|------|---------|
| 1 | Models | 模型供应商和模型配置管理 |
| 2 | Skills | OpenCode Skill 上传、下载、删除管理 |
| 3 | Agents | Agent 文件和状态管理 |
| 4 | MCPs | MCP 配置和工具刷新管理 |

---

## 3. 数据模型

### 3.1 复用现有类型

所有数据模型保持不变，复用现有的类型定义：

**文件**: `frontend/src/shared/api/opencode.ts`

```typescript
// Agent 类型
export interface Agent {
  id: string;
  name: string;
  agent_type: "system" | "custom";
  version: string;
  description: string;
  author: string;
  config: Record<string, any>;
  tools: any[];
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
}

// OpenCodeSkill 类型
export interface OpenCodeSkill {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: "security" | "analysis" | "utility" | "custom";
  file_path: string;
  file_size: number;
  checksum: string;
  config: Record<string, any>;
  schema: Record<string, any>;
  tags: string[];
  is_public: boolean;
  is_active: boolean;
  download_count: number;
  created_at: string;
  updated_at: string;
  created_by: string;
}

// OpenCodeMCP 类型
export interface OpenCodeMCP {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  mcp_type: "stdio" | "sse" | "http";
  server_url: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  config: Record<string, any>;
  tools: any[];
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
}
```

**文件**: `frontend/src/shared/api/opencodeConfig.ts`

```typescript
export interface ProviderConfig {
  api_key: string;
  base_url?: string;
  models: string[];
}

export interface OpenCodeConfig {
  model: string;
  provider: string;
  providers: Record<string, ProviderConfig>;
  mcp?: Record<string, any>;
}
```

---

## 4. API 设计

### 4.1 API 端点概览

所有 API 保持不变，复用现有端点：

| 模块 | 端点 | 说明 |
|------|------|------|
| Models | GET/PUT `/opencode-config` | 模型配置管理 |
| Models | GET/PUT `/opencode-config/raw` | 原始 JSON 配置管理 |
| Skills | GET `/opencode/skills` | 获取 Skill 列表 |
| Skills | POST `/opencode/skills/upload` | 上传单个 Skill |
| Skills | POST `/opencode/skills/batch-upload` | 批量上传 Skills |
| Skills | DELETE `/opencode/skills/{id}` | 删除 Skill |
| Skills | GET `/opencode/skills/{id}/download` | 下载 Skill |
| Agents | GET `/agents` | 获取 Agent 列表 |
| Agents | PATCH `/agents/{id}/toggle` | 切换 Agent 状态 |
| Agents | GET `/agents/files` | 获取 Agent 文件列表 |
| Agents | POST `/agents/files/upload` | 上传 Agent 文件 |
| Agents | DELETE `/agents/files/{filename}` | 删除 Agent 文件 |
| MCPs | GET `/opencode/mcps` | 获取 MCP 列表 |
| MCPs | POST `/opencode/mcps` | 创建 MCP |
| MCPs | PUT `/opencode/mcps/{id}` | 更新 MCP |
| MCPs | DELETE `/opencode/mcps/{id}` | 删除 MCP |
| MCPs | POST `/opencode/mcps/{id}/refresh-tools` | 刷新 MCP 工具 |

---

## 5. 前端实现

### 5.1 文件结构

```
frontend/src/
├── pages/
│   ├── OpenCodeResourceManager.tsx       [新增] 统一管理页面
│   ├── AgentManagement.tsx                [删除]
│   ├── SkillMarketplace.tsx               [删除]
│   ├── ModelManager.tsx                   [删除]
│   └── MCPMarketplace.tsx                 [删除]
├── app/
│   └── routes.tsx                         [更新]
└── components/layout/
    └── Sidebar.tsx                        [更新]
```

### 5.2 主页面实现

**文件**: `frontend/src/pages/OpenCodeResourceManager.tsx`

实现概述：
- 使用 Tabs 组件管理四个标签页
- 每个标签页内容独立实现，保持原有功能
- 保持赛博朋克风格设计

关键实现要点：

```tsx
import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Terminal, Cpu, Code2, Bot, Server } from 'lucide-react';

// 导入各模块的实现
// 这里会将原来四个页面的逻辑整合进来

export default function OpenCodeResourceManager() {
  const [activeTab, setActiveTab] = useState('models');

  return (
    <div className="space-y-6 p-6 cyber-bg-elevated min-h-screen font-mono relative">
      {/* 网格背景 */}
      <div className="absolute inset-0 cyber-grid-subtle pointer-events-none" />

      {/* 页面标题 */}
      <div className="cyber-card p-4 relative z-10">
        <div className="flex items-center gap-3">
          <Terminal className="w-6 h-6 text-primary" />
          <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">
            Opencode 管理
          </h3>
        </div>
      </div>

      {/* Tabs 导航 */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="relative z-10">
        <TabsList className="bg-muted border border-border p-1 h-auto gap-1 rounded">
          <TabsTrigger value="models" className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs">
            <Cpu className="w-4 h-4 mr-2" />
            Models
          </TabsTrigger>
          <TabsTrigger value="skills" className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs">
            <Code2 className="w-4 h-4 mr-2" />
            Skills
          </TabsTrigger>
          <TabsTrigger value="agents" className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs">
            <Bot className="w-4 h-4 mr-2" />
            Agents
          </TabsTrigger>
          <TabsTrigger value="mcps" className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs">
            <Server className="w-4 h-4 mr-2" />
            MCPs
          </TabsTrigger>
        </TabsList>

        {/* Models 标签页内容 */}
        <TabsContent value="models" className="mt-6">
          {/* 这里整合 ModelManager 的完整实现 */}
        </TabsContent>

        {/* Skills 标签页内容 */}
        <TabsContent value="skills" className="mt-6">
          {/* 这里整合 SkillMarketplace 的完整实现 */}
        </TabsContent>

        {/* Agents 标签页内容 */}
        <TabsContent value="agents" className="mt-6">
          {/* 这里整合 AgentManagement 的完整实现 */}
        </TabsContent>

        {/* MCPs 标签页内容 */}
        <TabsContent value="mcps" className="mt-6">
          {/* 这里整合 MCPMarketplace 的完整实现 */}
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

---

## 6. 路由和侧边栏更新

### 6.1 路由配置更新

**文件**: `frontend/src/app/routes.tsx`

变更说明：
1. 移除四个旧路由的导入和配置
2. 添加新的统一路由

```typescript
// 移除旧导入
// import AgentManagement from '@/pages/AgentManagement';
// import SkillMarketplace from '@/pages/SkillMarketplace';
// import MCPMarketplace from '@/pages/MCPMarketplace';
// import ModelManager from '@/pages/ModelManager';

// 添加新导入
import OpenCodeResourceManager from '@/pages/OpenCodeResourceManager';

const routes: RouteConfig[] = [
  // ... 其他路由保持不变

  // 移除旧路由
  // {
  //   name: "Agent管理",
  //   path: "/agents",
  //   element: <AgentManagement />,
  //   visible: true,
  // },
  // {
  //   name: "Skill",
  //   path: "/skill-marketplace",
  //   element: <SkillMarketplace />,
  //   visible: true,
  // },
  // {
  //   name: "MCP",
  //   path: "/mcp-marketplace",
  //   element: <MCPMarketplace />,
  //   visible: true,
  // },
  // {
  //   name: "模型管理",
  //   path: "/models",
  //   element: <ModelManager />,
  //   visible: true,
  // },

  // 添加新路由
  {
    name: "Opencode管理",
    path: "/opencode",
    element: <OpenCodeResourceManager />,
    visible: true,
  }
];
```

### 6.2 侧边栏更新

**文件**: `frontend/src/components/layout/Sidebar.tsx`

```typescript
import { Terminal } from 'lucide-react';

const routeIcons: Record<string, React.ReactNode> = {
  // ... 其他图标保持不变

  // 移除旧图标
  // '/models': <Cpu className="w-[18px] h-[18px]" />,

  // 添加新图标
  '/opencode': <Terminal className="w-[18px] h-[18px]" />
};
```

---

## 7. 安全考虑

### 7.1 现有安全措施保持不变

- 所有现有的认证和授权机制保持不变
- API Key 脱敏处理保持不变
- 文件上传验证保持不变

### 7.2 路由变更风险

- 旧路由完全删除，确保没有残留引用
- 新路由正确配置权限检查

---

## 8. 测试计划

### 8.1 功能测试

- 验证四个标签页可以正常切换
- 验证每个标签页的原有功能正常工作：
  - Models：供应商和模型配置、可视化编辑、原始 JSON 编辑
  - Skills：Skill 列表、上传（单个/批量）、下载、删除
  - Agents：Agent 列表、文件管理、状态切换
  - MCPs：MCP 列表、创建/编辑/删除、工具刷新
- 验证搜索和筛选功能正常

### 8.2 UI 测试

- 验证赛博朋克风格保持一致
- 验证响应式布局正常
- 验证加载状态和错误提示正常

### 8.3 导航测试

- 验证侧边栏新菜单项正常显示和工作
- 验证旧路由已无法访问（返回 404）

---

## 9. 部署说明

### 9.1 部署步骤

1. 确保新页面 `OpenCodeResourceManager.tsx` 已创建
2. 更新路由配置
3. 更新侧边栏图标
4. 测试所有功能正常
5. 删除四个旧页面文件
6. 构建前端
7. 部署更新

### 9.2 回滚计划

如果出现问题，可以通过以下步骤回滚：
1. 恢复旧路由配置
2. 恢复旧页面文件
3. 移除新页面和路由
4. 重新构建部署

---

## 10. 附录

### 10.1 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 新增 | `frontend/src/pages/OpenCodeResourceManager.tsx` | 新的统一管理页面 |
| 更新 | `frontend/src/app/routes.tsx` | 路由配置更新 |
| 更新 | `frontend/src/components/layout/Sidebar.tsx` | 侧边栏图标更新 |
| 删除 | `frontend/src/pages/AgentManagement.tsx` | 旧 Agent 管理页面 |
| 删除 | `frontend/src/pages/SkillMarketplace.tsx` | 旧 Skill 管理页面 |
| 删除 | `frontend/src/pages/ModelManager.tsx` | 旧模型管理页面 |
| 删除 | `frontend/src/pages/MCPMarketplace.tsx` | 旧 MCP 管理页面 |

### 10.2 标签页顺序确认

最终确认的标签页顺序：
1. Models
2. Skills
3. Agents
4. MCPs

### 10.3 图标映射

| 标签页 | 图标组件 | 说明 |
|--------|---------|------|
| Models | `Cpu` | 处理器图标 |
| Skills | `Code2` | 代码图标 |
| Agents | `Bot` | 机器人图标 |
| MCPs | `Server` | 服务器图标 |

---

**文档结束**
