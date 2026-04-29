# OpenCode 刷新功能 - 软件设计文档 (SDD)

**版本**: 1.3  
**日期**: 2026-04-29  
**作者**: DeepAudit Team

---

## 版本更新说明

### v1.3
- 统一所有模块的刷新函数命名，全部使用 `refresh` 前缀
- Models: `loadModels()` → `refreshModels()`
- Agents: `refreshAgentPackages()` → `refreshAgents()`
- 后端端点: `/opencode/agent-packages/refresh` → `/opencode/agents/refresh`
- 后端函数: `refresh_agent_packages()` → `refresh_agents()`

### v1.2
- 添加代码复用规划，创建统一的 utils.py 工具函数库
- 重构各模块的刷新实现，最大化复用现有代码

### v1.1
- 修改刷新按钮逻辑，同时刷新所有模块数据

### v1.0
- 初始版本，实现基本的刷新功能

---

## 1. 概述

### 1.1 项目背景

目前，OpenCode 资源管理功能已整合到统一的管理页面中，但缺少从文件系统同步到数据库的刷新功能。具体需求如下：

- **Skills**：可以解析 `~/.config/opencode/skills/` 目录下的所有 skill，将不存在的 skill 同步到数据库，更新 name 和 description
- **Agents**：可以解析 Agents 解压目录下的文件，将不存在的 agents 和 skills 或 agent 编排导入到数据库
- **MCPs**：可以解析 `~/.config/opencode/opencode.json` 中的 MCP 配置，同步到数据库卡片管理页面
- **Models**：保持不变
- **文件管理**：保持不变

### 1.2 功能目标

- 为 Skills 模块添加后端 API，实现从文件系统到数据库的同步
- 为 Agents 模块添加后端 API，实现从文件系统到数据库的同步
- 为 MCPs 模块添加后端 API，实现从 `opencode.json` 到数据库的同步
- 统一刷新按钮操作后，直接刷新所有模块的数据（Models、Skills、Agents、MCPs）
- 最大化代码复用，避免重复代码
- 保持现有功能不变，仅新增刷新功能
- 保持赛博朋克风格设计一致性

### 1.3 范围

本文档涵盖：
- 后端 API 新增刷新端点（Skills、Agents、MCPs）
- 创建统一工具文件（utils.py），存放可复用函数
- 前端页面修改统一刷新按钮逻辑，支持同时刷新所有模块
- 不涉及 Models 和文件管理模块的变更

---

## 2. 系统架构

### 2.1 总体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                        前端 (React)                                    │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │         OpenCodeResourceManager (现有)                            │  │
│  │  ┌─────────────────────────────────────────────────────────────┐  │
│  │  │         utils.py (新增) - 统一工具函数库                     │  │
│  │  └─────────────────────────────────────────────────────────┘  │
│  │  ┌─────────────────────────────────────────────────────────┐  │
│  │  │         Models: refreshModels()                          │  │
│  │  │         Skills: refreshSkills()                          │  │
│  │  │         Agents: refreshAgents()                           │  │
│  │  │         MCPs: refreshMcps()                              │  │
│  │  └─────────────────────────────────────────────────────────┘  │
│  └──────────────────────┬─────────────────────────────────────────────────┘  │
│                        │                                                  │
│  ┌─────────────────────▼─────────────────────────────────────────────────┐  │
│  │  API 层 (opencode.ts) - 新增刷新方法                                  │  │
│  │  - refreshModels()                                                   │  │
│  │  - refreshSkills()                                                   │  │
│  │  - refreshAgents()                                                   │  │
│  │  - refreshMcps()                                                     │  │
│  └──────────────────────┬─────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                        │
┌────────────────────────▼─────────────────────────────────────────────────┐
│                        后端 (FastAPI)                                    │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  ┌─────────────────────────────────────────────────────────┐  │
│  │  │         utils.py (新增) - 统一工具函数库                     │  │
│  │  └─────────────────────────────────────────────────────────┘  │
│  │  ┌─────────────────────────────────────────────────────────┐  │
│  │  │  现有模块 + 新增刷新端点:                               │  │
│  │  │  - POST /opencode/skills/refresh                          │  │
│  │  │  - POST /opencode/agents/refresh                          │  │
│  │  │  - POST /opencode/mcps/refresh                            │  │
│  │  └─────────────────────────────────────────────────────────┘  │
│  └─────────────────────────────────────────────────────────────────┘  │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │  文件系统交互:                                                   │  │
│  │  - ~/.config/opencode/skills/ (Skills)                          │  │
│  │  - AGENT_PACKAGES_EXTRACTED_PATH (Agents)                       │  │
│  │  - ~/.config/opencode/opencode.json (MCPs)                      │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

### 2.2 刷新功能流程

#### 统一刷新流程
1. 用户点击统一的刷新按钮（位于标签页列表右侧）
2. 前端同时刷新所有模块的数据（无论当前在哪个标签页）：

**Models 模块**
- 调用 `refreshModels()` 重新加载配置

**Skills 模块**
- 调用 `POST /opencode/skills/refresh`
- 后端扫描 `~/.config/opencode/skills/` 目录
- 对每个子目录，解析 `SKILL.md` 获取元数据
- 检查数据库是否已存在该 skill（通过目录名/name 匹配）
- 不存在则创建新记录，存在则更新 name 和 description
- 返回刷新结果（新增/更新数量）
- 前端重新加载 Skills 列表

**Agents 模块**
- 调用 `POST /opencode/agents/refresh`
- 后端扫描 `settings.AGENT_PACKAGES_EXTRACTED_PATH` 目录
- 对每个子目录，检查是否为有效的 Agent 包结构
- 解析 `AGENTS.md`、`agents/` 目录、`skills/` 目录
- 检查数据库是否已存在该 agent 包（通过目录名匹配）
- 不存在则创建新记录（包括关联的 OpenCodeAgent 和 OpenCodeSkill）
- 存在则跳过或更新（根据需求）
- 返回刷新结果
- 前端重新加载 Agents 列表

**MCPs 模块**
- 调用 `POST /opencode/mcps/refresh`
- 后端读取 `~/.config/opencode/opencode.json` 配置文件
- 解析 `mcp` 部分的所有配置
- 对每个 MCP 配置，检查数据库是否已存在（通过 name 匹配）
- 不存在则创建新记录，存在则同步配置
- 返回刷新结果
- 前端重新加载 MCPs 列表

3. 所有刷新完成后，显示汇总的成功提示（包含各模块的统计信息）

---

## 3. 数据模型

### 3.1 复用现有模型

所有数据模型保持不变，复用现有的定义：

- `OpenCodeSkill` - Skill 模型
- `Agent` - Agent 包模型
- `OpenCodeAgent` - Agent 包内的单个 Agent 模型
- `OpenCodeMCP` - MCP 模型

### 3.2 新增响应类型

#### Skills 刷新响应
```python
# 后端
{
  "success": True,
  "message": "Skills refreshed successfully",
  "stats": {
    "scanned": 10,
    "added": 3,
    "updated": 2,
    "skipped": 5
  },
  "errors": []  # 可选，包含失败的项
}
```

#### Agents 刷新响应
```python
# 后端
{
  "success": True,
  "message": "Agent packages refreshed successfully",
  "stats": {
    "scanned": 5,
    "added": 2,
    "updated": 1,
    "skipped": 2
  },
  "errors": []
}
```

#### MCPs 刷新响应
```python
# 后端
{
  "success": True,
  "message": "MCPs refreshed successfully",
  "stats": {
    "scanned": 8,
    "added": 3,
    "updated": 2,
    "skipped": 3
  },
  "errors": []
}
```

---

## 4. API 设计

### 4.1 新增 API 端点

| 模块 | 端点 | 方法 | 说明 |
|------|------|------|------|
| Skills | `/opencode/skills/refresh` | POST | 刷新 Skills，从文件系统同步到数据库 |
| Agents | `/opencode/agents/refresh` | POST | 刷新 Agents，从文件系统同步到数据库 |
| MCPs | `/opencode/mcps/refresh` | POST | 刷新 MCPs，从 opencode.json 同步到数据库 |

### 4.2 Skills 刷新 API 详细设计

**端点**: `POST /opencode/skills/refresh`

**请求**:
```
无请求体
```

**响应 (200 OK)**:
```json
{
  "success": true,
  "message": "Skills refreshed successfully",
  "stats": {
    "scanned": 10,
    "added": 3,
    "updated": 2,
    "skipped": 5
  },
  "errors": [
    {
      "directory": "invalid-skill",
      "error": "Missing SKILL.md"
    }
  ]
}
```

**实现要点**:
- 使用 `get_opencode_skills_dir()` 获取 Skills 目录
- 遍历每个子目录，检查是否包含 `SKILL.md`
- 使用 `parse_skill_md_from_path()` 解析 SKILL.md
- 通过 `opencode_file_path` 或 `name` 匹配数据库记录
- 使用 `create_or_update_opencode_skill()` 创建或更新记录

### 4.3 Agents 刷新 API 详细设计

**端点**: `POST /opencode/agents/refresh`

**请求**:
```
无请求体
```

**响应 (200 OK)**:
```json
{
  "success": true,
  "message": "Agents refreshed successfully",
  "stats": {
    "scanned": 5,
    "added": 2,
    "updated": 1,
    "skipped": 2
  },
  "errors": []
}
```

**实现要点**:
- 使用 `settings.AGENT_PACKAGES_EXTRACTED_PATH` 获取 Agent 包目录
- 使用 `validate_agent_package_structure()` 验证目录结构
- 使用 `parse_agents_directory()` 解析 agents/ 目录
- 使用 `parse_skills_directory_for_agent()` 解析 skills/ 目录
- 通过 `original_filename`（目录名）匹配数据库记录
- 使用 `create_agent_package_with_relations()` 创建关联记录

### 4.4 MCPs 刷新 API 详细设计

**端点**: `POST /opencode/mcps/refresh`

**请求**:
```
无请求体
```

**响应 (200 OK)**:
```json
{
  "success": true,
  "message": "MCPs refreshed successfully",
  "stats": {
    "scanned": 8,
    "added": 3,
    "updated": 2,
    "skipped": 3
  },
  "errors": []
}
```

**实现要点**:
- 使用 `read_opencode_config()` 读取配置文件
- 解析 `mcp` 部分的配置
- 通过 `name` 匹配数据库记录
- 使用 `create_or_update_opencode_mcp()` 创建或更新记录
- 使用 `fetch_mcp_tools()` 获取最新工具列表
- 使用 `update_config_mcp_entry()` 同步回配置文件

---

## 5. 代码复用规划

### 5.1 现有可复用代码分析

#### Skills 模块 - 可复用代码

| 代码片段 | 源文件 | 行号 | 功能 | 复用方式 |
|---------|--------|------|------|---------|
| `parse_skill_metadata_from_zip` | skills.py | 27-60 | 从ZIP内容解析SKILL.md | 直接复用 |
| `parse_skill_metadata_from_zip_path` | skills.py | 63-89 | 从ZIP路径解析SKILL.md | 直接复用 |
| ZIP结构验证代码 | skills.py | 223-251 | 验证ZIP包含根目录和SKILL.md | 封装成函数 |
| OpenCodeSkill创建代码 | skills.py | 272-285 | 创建数据库记录 | 封装成函数 |

#### Agents 模块 - 可复用代码

| 代码片段 | 源文件 | 行号 | 功能 | 复用方式 |
|---------|--------|------|------|---------|
| `validate_zip_structure` | agent_packages.py | 31-56 | 验证Agent包结构 | 直接复用 |
| `parse_skill_frontmatter` | agent_packages.py | 59-73 | 解析frontmatter | 直接复用 |
| agents目录解析 | agent_packages.py | 166-183 | 解析agents/目录.md文件 | 封装成函数 |
| skills目录解析 | agent_packages.py | 185-207 | 解析skills/子目录 | 封装成函数 |
| Agent创建代码 | agent_packages.py | 210-224 | 创建Agent包记录 | 封装成函数 |
| OpenCodeAgent创建 | agent_packages.py | 231-240 | 创建Agent记录 | 封装成函数 |
| OpenCodeSkill创建(Agent) | agent_packages.py | 244-257 | 创建Skill记录 | 封装成函数 |

#### MCPs 模块 - 可复用代码

| 代码片段 | 源文件 | 行号 | 功能 | 复用方式 |
|---------|--------|------|------|---------|
| `read_opencode_config` | mcp.py | 30-36 | 读取配置文件 | 直接复用 |
| `write_opencode_config` | mcp.py | 39-44 | 写入配置文件 | 直接复用 |
| `update_config_mcp_entry` | mcp.py | 46-69 | 更新MCP配置 | 直接复用 |
| `fetch_mcp_tools` | mcp.py | 105-227 | 获取MCP工具 | 直接复用 |
| OpenCodeMCP创建代码 | mcp.py | 313-326 | 创建MCP记录 | 封装成函数 |

#### 工具函数 - 可复用代码

| 代码片段 | 源文件 | 功能 | 复用方式 |
|---------|--------|------|---------|
| `get_opencode_skills_dir` | platform_config.py | 23-31 | 获取Skills目录 | 直接复用 |
| `ensure_dir_exists` | platform_config.py | 45-51 | 确保目录存在 | 直接复用 |
| `delete_file_or_dir` | platform_config.py | 54-76 | 删除文件/目录 | 直接复用 |

### 5.2 新建统一工具文件

**文件**: `backend/app/api/v1/endpoints/opencode/utils.py`

**目录结构**:
```
backend/app/api/v1/endpoints/opencode/
├── skills.py
├── agent_packages.py
├── mcp.py
└── utils.py  ← 新建
```

### 5.3 utils.py 中的函数列表

#### Skills 相关函数

```python
# 验证 Skill ZIP 结构
def validate_skill_zip_structure(zip_ref: zipfile.ZipFile) -> tuple[bool, str]

# 从 ZIP 内容解析 SKILL.md
def parse_skill_metadata_from_zip(zip_content: bytes) -> dict

# 从 ZIP 路径解析 SKILL.md
def parse_skill_metadata_from_zip_path(zip_file_path: str) -> dict

# 从文件路径解析 SKILL.md（用于刷新功能）
def parse_skill_md_from_path(skill_md_path: str) -> dict

# 创建或更新 OpenCodeSkill 记录
def create_or_update_opencode_skill(
    db: AsyncSession,
    skill_data: dict,
    current_user,
    existing_skill: Optional[OpenCodeSkill] = None
) -> tuple[OpenCodeSkill, bool]  # (skill, is_new)
```

#### Agents 相关函数

```python
# 验证 Agent 包 ZIP 结构
def validate_zip_structure(zip_ref: zipfile.ZipFile) -> bool

# 验证 Agent 包目录结构（用于刷新功能）
def validate_agent_package_structure(pkg_path: str) -> bool

# 解析 Skill frontmatter
def parse_skill_frontmatter(content: str) -> dict

# 解析 agents 目录
def parse_agents_directory(agents_dir: str) -> list[dict]

# 解析 skills 目录（用于 Agent 包）
def parse_skills_directory_for_agent(skills_dir: str) -> list[dict]

# 创建 Agent 包记录
def create_agent_package_record(
    db: AsyncSession,
    package_data: dict,
    current_user,
    package_agents: list[dict],
    package_skills: list[dict]
) -> Agent

# 创建 OpenCodeAgent 记录
def create_opencode_agent_record(
    agent_package_id: str,
    agent_data: dict
) -> OpenCodeAgent

# 创建 OpenCodeSkill 记录（用于 Agent 包）
def create_opencode_skill_for_agent(
    agent_package_id: str,
    skill_data: dict,
    current_user
) -> OpenCodeSkill

# 创建 Agent 包及关联记录
def create_agent_package_with_relations(
    db: AsyncSession,
    package_data: dict,
    package_agents: list[dict],
    package_skills: list[dict],
    current_user
) -> Agent
```

#### MCPs 相关函数

```python
# 读取 opencode.json 配置
def read_opencode_config() -> dict

# 写入 opencode.json 配置
def write_opencode_config(config: dict) -> None

# 更新 MCP 配置条目
def update_config_mcp_entry(mcp: OpenCodeMCP, old_name: Optional[str] = None)

# 从 HTTP MCP 服务器获取工具列表
async def fetch_mcp_tools(server_url: str, config: Optional[dict] = None) -> dict

# 创建或更新 OpenCodeMCP 记录
def create_or_update_opencode_mcp(
    db: AsyncSession,
    mcp_data: dict,
    current_user,
    existing_mcp: Optional[OpenCodeMCP] = None
) -> tuple[OpenCodeMCP, bool]  # (mcp, is_new)
```

#### 通用工具函数

```python
# 获取 OpenCode Skills 目录
def get_opencode_skills_dir() -> Path

# 确保目录存在
def ensure_dir_exists(path: Path) -> None

# 删除文件或目录
def delete_file_or_dir(path: str) -> bool
```

### 5.4 各模块代码迁移计划

#### Phase 1: 创建 utils.py 并迁移代码
1. 从 skills.py 迁移可复用函数
2. 从 agent_packages.py 迁移可复用函数
3. 从 mcp.py 迁移可复用函数
4. 从 platform_config.py 迁移可复用函数

#### Phase 2: 修改 skills.py
1. 导入 utils.py 中的函数
2. 重构现有 upload/upload_batch 端点，使用新工具函数
3. 新增 refresh_skills 端点

#### Phase 3: 修改 agent_packages.py
1. 导入 utils.py 中的函数
2. 重构现有 upload 端点，使用新工具函数
3. 新增 refresh_agents 端点

#### Phase 4: 修改 mcp.py
1. 导入 utils.py 中的函数
2. 重构现有 create/update/refresh_tools 端点，使用新工具函数
3. 新增 refresh_mcps 端点

---

## 6. 前端实现

### 6.1 API 客户端更新

**文件**: `frontend/src/shared/api/opencode.ts`

新增方法：
```typescript
// Models 刷新
export const refreshModels = async (): Promise<void> => {
  // 刷新模型配置（使用原有逻辑）
  const configRes = await getOpenCodeConfig();
  const rawRes = await getRawOpenCodeConfig();
  // 设置状态（在组件中处理）
};

// Skills 刷新
export const refreshSkills = async (): Promise<{
  success: boolean;
  message: string;
  stats: { scanned: number; added: number; updated: number; skipped: number };
  errors?: Array<{ directory: string; error: string }>;
}> => {
  const response = await apiClient.post('/opencode/skills/refresh');
  return response.data;
};

// Agents 刷新
export const refreshAgents = async (): Promise<{
  success: boolean;
  message: string;
  stats: { scanned: number; added: number; updated: number; skipped: number };
  errors?: any[];
}> => {
  const response = await apiClient.post('/opencode/agents/refresh');
  return response.data;
};

// MCPs 刷新
export const refreshMcps = async (): Promise<{
  success: boolean;
  message: string;
  stats: { scanned: number; added: number; updated: number; skipped: number };
  errors?: any[];
}> => {
  const response = await apiClient.post('/opencode/mcps/refresh');
  return response.data;
};
```

### 6.2 主页面更新

**文件**: `frontend/src/pages/OpenCodeResourceManager.tsx`

#### 统一刷新按钮更新
- 现有统一刷新按钮已实现，目前仅调用 `loadModels()`
- 修改刷新按钮逻辑，同时刷新所有模块（Models、Skills、Agents、MCPs）
- 显示加载状态，成功后显示汇总的 toast 提示（包含各模块统计信息）

```tsx
// 新增状态
const [refreshing, setRefreshing] = useState(false);

// 统一刷新处理函数 - 同时刷新所有模块
const handleRefresh = async () => {
  try {
    setRefreshing(true);
    
    // 并行执行所有刷新操作
    const [modelsResult, skillsResult, agentsResult, mcpsResult] = await Promise.allSettled([
      // Models: 调用新增的刷新函数
      refreshModels(),
      // Skills: 调用新增的刷新 API
      refreshSkills(),
      // Agents: 调用新增的刷新 API
      refreshAgents(),
      // MCPs: 调用新增的刷新 API
      refreshMcps(),
    ]);
    
    // 重新加载所有列表数据
    await Promise.all([
      loadSkills(),
      loadAgentPackages(),
      loadMcps(),
    ]);
    
    // 汇总统计信息
    let summary = "刷新完成！";
    if (skillsResult.status === 'fulfilled') {
      summary += ` Skills(+${skillsResult.value.stats.added}/~${skillsResult.value.stats.updated})`;
    }
    if (agentsResult.status === 'fulfilled') {
      summary += ` Agents(+${agentsResult.value.stats.added}/~${agentsResult.value.stats.updated})`;
    }
    if (mcpsResult.status === 'fulfilled') {
      summary += ` MCPs(+${mcpsResult.value.stats.added}/~${mcpsResult.value.stats.updated})`;
    }
    
    toast.success(summary);
  } catch (error) {
    console.error('Failed to refresh:', error);
    toast.error(`刷新失败`);
  } finally {
    setRefreshing(false);
  }
};

// 更新现有刷新按钮
<Button
  variant="outline"
  onClick={handleRefresh}
  className="cyber-btn-outline"
  disabled={saving || refreshing}
>
  <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
  刷新
</Button>
```

---

## 7. 后端实现

### 7.1 utils.py 工具文件实现

**文件**: `backend/app/api/v1/endpoints/opencode/utils.py`

```python
"""
OpenCode 统一工具函数库
包含 Skills、Agents、MCPs 模块的可复用函数
"""

import os
import zipfile
import tempfile
import json
import frontmatter
import httpx
from typing import List, Optional, Tuple
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import OpenCodeSkill, Agent, OpenCodeAgent, OpenCodeMCP
from app.core.config import settings
from app.core.platform_config import get_opencode_skills_dir, ensure_dir_exists, delete_file_or_dir

# ========== Skills 相关函数 ==========

def parse_skill_metadata_from_zip(zip_content: bytes) -> dict:
    """从 ZIP 文件内容中解析 SKILL.md 的元数据"""
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as temp_file:
        temp_file.write(zip_content)
        temp_file_path = temp_file.name

    try:
        with zipfile.ZipFile(temp_file_path, "r") as zip_ref:
            # 查找 SKILL.md 文件
            skill_md_path = None
            skill_dir_name = None
            for info in zip_ref.infolist():
                parts = info.filename.split("/")
                if len(parts) == 2 and parts[1] == "SKILL.md":
                    skill_md_path = info.filename
                    skill_dir_name = parts[0]
                    break

            if not skill_md_path:
                return {"name": None, "description": None, "skill_dir_name": skill_dir_name}

            # 读取 SKILL.md 内容
            skill_md_content = zip_ref.read(skill_md_path).decode("utf-8")

            # 使用 python-frontmatter 解析
            post = frontmatter.loads(skill_md_content)

            return {
                "name": post.get("name"),
                "description": post.get("description"),
                "skill_dir_name": skill_dir_name,
            }
    finally:
        os.unlink(temp_file_path)


def parse_skill_metadata_from_zip_path(zip_file_path: str) -> dict:
    """从 ZIP 文件路径解析 SKILL.md 的元数据"""
    with zipfile.ZipFile(zip_file_path, "r") as zip_ref:
        # 查找 SKILL.md 文件
        skill_md_path = None
        skill_dir_name = None
        for info in zip_ref.infolist():
            parts = info.filename.split("/")
            if len(parts) == 2 and parts[1] == "SKILL.md":
                skill_md_path = info.filename
                skill_dir_name = parts[0]
                break

        if not skill_md_path:
            return {"name": None, "description": None, "skill_dir_name": skill_dir_name}

        # 读取 SKILL.md 内容
        skill_md_content = zip_ref.read(skill_md_path).decode("utf-8")

        # 使用 python-frontmatter 解析
        post = frontmatter.loads(skill_md_content)

        return {
            "name": post.get("name"),
            "description": post.get("description"),
            "skill_dir_name": skill_dir_name,
        }


def parse_skill_md_from_path(skill_md_path: str) -> dict:
    """从文件路径解析 SKILL.md（用于刷新功能）"""
    if not os.path.exists(skill_md_path):
        return {"name": None, "description": None}

    with open(skill_md_path, "r", encoding="utf-8") as f:
        skill_content = f.read()

    post = frontmatter.loads(skill_content)

    return {
        "name": post.get("name"),
        "description": post.get("description"),
        "version": post.get("version", "1.0.0"),
        "author": post.get("author"),
        "category": post.get("category", "custom"),
    }


def validate_skill_zip_structure(zip_ref: zipfile.ZipFile) -> tuple[bool, str]:
    """验证 Skill ZIP 结构，返回(是否有效, 错误信息)"""
    root_dirs = set()
    has_skill_md = False

    for info in zip_ref.infolist():
        parts = info.filename.split("/")
        if len(parts) > 0 and parts[0]:
            root_dirs.add(parts[0])
            if len(parts) == 2 and parts[1] == "SKILL.md":
                has_skill_md = True

    if len(root_dirs) != 1:
        return False, f"ZIP格式不符：必须包含且仅包含一个根目录，当前包含 {len(root_dirs)} 个"

    if not has_skill_md:
        return False, "ZIP格式不符：根目录下必须包含SKILL.md文件"

    return True, ""


def create_or_update_opencode_skill(
    db: AsyncSession,
    skill_data: dict,
    current_user,
    existing_skill: Optional[OpenCodeSkill] = None
) -> tuple[OpenCodeSkill, bool]:
    """创建或更新 OpenCodeSkill 记录，返回(skill, is_new)"""
    if existing_skill:
        # 更新现有记录
        if skill_data.get("name"):
            existing_skill.name = skill_data["name"]
        if skill_data.get("description"):
            existing_skill.description = skill_data["description"]
        if skill_data.get("version"):
            existing_skill.version = skill_data["version"]
        if skill_data.get("author"):
            existing_skill.author = skill_data["author"]
        if skill_data.get("category"):
            existing_skill.category = skill_data["category"]
        if "config" in skill_data:
            existing_skill.config = skill_data["config"]
        if "file_path" in skill_data:
            existing_skill.file_path = skill_data["file_path"]
        if "opencode_file_path" in skill_data:
            existing_skill.opencode_file_path = skill_data["opencode_file_path"]
        existing_skill.updated_at = datetime.utcnow()
        return existing_skill, False
    else:
        # 创建新记录
        new_skill = OpenCodeSkill(
            name=skill_data.get("name", "unnamed-skill"),
            version=skill_data.get("version", "1.0.0"),
            description=skill_data.get("description", ""),
            author=skill_data.get("author", getattr(current_user, "full_name", "unknown")),
            category=skill_data.get("category", "custom"),
            file_path=skill_data.get("file_path", ""),
            opencode_file_path=skill_data.get("opencode_file_path", ""),
            file_size=skill_data.get("file_size", 0),
            checksum=skill_data.get("checksum", ""),
            config=skill_data.get("config", {}),
            schema=skill_data.get("schema", {}),
            tags=skill_data.get("tags", []),
            is_public=skill_data.get("is_public", False),
            is_active=skill_data.get("is_active", True),
            agent_package_id=skill_data.get("agent_package_id"),
            created_by=current_user.id if hasattr(current_user, "id") else None
        )
        db.add(new_skill)
        return new_skill, True

# ========== Agents 相关函数 ==========

def validate_zip_structure(zip_ref: zipfile.ZipFile) -> bool:
    """验证 Agent 包 ZIP 结构"""
    file_list = zip_ref.namelist()

    has_agents_md = any(
        f == "AGENTS.md" or (len(f.split("/")) == 2 and f.endswith("/AGENTS.md")) for f in file_list
    )
    has_agents = any(f.startswith("agents/") and f.endswith(".md") for f in file_list)

    # 检查是否有 skills 目录且至少有一个子目录包含 SKILL.md
    has_skills = False
    skill_dirs = set()
    for f in file_list:
        if f.startswith("skills/") and f != "skills/":
            parts = f.split("/")
            if len(parts) > 2:
                skill_dirs.add(parts[1])

    # 检查是否有 SKILL.md 在 skills 子目录下
    for f in file_list:
        parts = f.split("/")
        if len(parts) == 3 and parts[0] == "skills" and parts[2] == "SKILL.md":
            has_skills = True
            break

    return has_agents_md or has_agents or has_skills


def validate_agent_package_structure(pkg_path: str) -> bool:
    """验证 Agent 包目录结构（用于刷新功能）"""
    has_agents_md = os.path.exists(os.path.join(pkg_path, "AGENTS.md"))
    has_agents_dir = os.path.isdir(os.path.join(pkg_path, "agents"))
    has_skills_dir = os.path.isdir(os.path.join(pkg_path, "skills"))
    return has_agents_md or has_agents_dir or has_skills_dir


def parse_skill_frontmatter(content: str) -> dict:
    """简单解析 Skill 的 frontmatter"""
    frontmatter_dict = {}
    try:
        if content.startswith("---"):
            end_idx = content.find("---", 3)
            if end_idx > 0:
                fm_content = content[3:end_idx].strip()
                for line in fm_content.split("\n"):
                    if ":" in line:
                        key, value = line.split(":", 1)
                        frontmatter_dict[key.strip()] = value.strip()
    except Exception:
        pass
    return frontmatter_dict


def parse_agents_directory(agents_dir: str) -> list[dict]:
    """解析 agents 目录，返回 agent 信息列表"""
    package_agents = []
    if os.path.exists(agents_dir):
        for agent_file in os.listdir(agents_dir):
            if agent_file.endswith(".md"):
                agent_path = os.path.join(agents_dir, agent_file)
                with open(agent_path, "r", encoding="utf-8") as f:
                    content = f.read()
                agent_name = Path(agent_file).stem
                package_agents.append({
                    "name": agent_name,
                    "file_name": agent_file,
                    "file_path": agent_path,
                    "file_content": content,
                })
    return package_agents


def parse_skills_directory_for_agent(skills_dir: str) -> list[dict]:
    """解析 skills 目录（用于 Agent 包），返回 skill 信息列表"""
    package_skills = []
    if os.path.exists(skills_dir):
        for skill_dir_name in os.listdir(skills_dir):
            skill_dir = os.path.join(skills_dir, skill_dir_name)
            if os.path.isdir(skill_dir):
                skill_md_path = os.path.join(skill_dir, "SKILL.md")
                if os.path.exists(skill_md_path):
                    with open(skill_md_path, "r", encoding="utf-8") as f:
                        content = f.read()
                    fm = parse_skill_frontmatter(content)
                    skill_name = fm.get("name", skill_dir_name)
                    package_skills.append({
                        "name": skill_name,
                        "version": fm.get("version", "1.0.0"),
                        "description": fm.get("description"),
                        "author": fm.get("author"),
                        "category": fm.get("category", "custom"),
                        "file_path": skill_dir,
                    })
    return package_skills


def create_opencode_agent_record(agent_package_id: str, agent_data: dict) -> OpenCodeAgent:
    """创建 OpenCodeAgent 记录"""
    return OpenCodeAgent(
        id=str(uuid.uuid4()),
        agent_package_id=agent_package_id,
        name=agent_data["name"],
        file_name=agent_data["file_name"],
        file_path=agent_data["file_path"],
        file_content=agent_data["file_content"]
    )


def create_opencode_skill_for_agent(agent_package_id: str, skill_data: dict, current_user) -> OpenCodeSkill:
    """创建 OpenCodeSkill 记录（用于 Agent 包）"""
    return OpenCodeSkill(
        id=str(uuid.uuid4()),
        name=skill_data["name"],
        version=skill_data.get("version", "1.0.0"),
        description=skill_data.get("description", ""),
        author=skill_data.get("author", getattr(current_user, "full_name", "unknown")),
        category=skill_data.get("category", "custom"),
        file_path=skill_data["file_path"],
        agent_package_id=agent_package_id,
        is_public=False,
        is_active=True,
        created_by=current_user.id if hasattr(current_user, "id") else None
    )


def create_agent_package_with_relations(
    db: AsyncSession,
    package_data: dict,
    package_agents: list[dict],
    package_skills: list[dict],
    current_user
) -> Agent:
    """创建 Agent 包及关联记录（OpenCodeAgent、OpenCodeSkill）"""
    # 创建 Agent 包记录
    new_agent = Agent(
        id=str(uuid.uuid4()),
        name=package_data.get("name", package_data.get("original_filename", "unnamed-agent")),
        author=package_data.get("author", getattr(current_user, "full_name", "unknown")),
        version=package_data.get("version", "1.0.0"),
        description=package_data.get("description", ""),
        original_filename=package_data.get("original_filename", ""),
        package_file_path=package_data.get("package_file_path", ""),
        extracted_dir_path=package_data.get("extracted_dir_path", ""),
        agents_md_content=package_data.get("agents_md_content"),
        agents_count=len(package_agents),
        skills_count=len(package_skills),
        is_public=package_data.get("is_public", False),
        created_by=current_user.id if hasattr(current_user, "id") else None
    )
    db.add(new_agent)

    # 创建 OpenCodeAgent 记录
    for pa in package_agents:
        op_agent = create_opencode_agent_record(new_agent.id, pa)
        db.add(op_agent)

    # 创建 OpenCodeSkill 记录
    for ps in package_skills:
        op_skill = create_opencode_skill_for_agent(new_agent.id, ps, current_user)
        db.add(op_skill)

    return new_agent

# ========== MCPs 相关函数 ==========

def get_opencode_config_path() -> Path:
    """获取 opencode.json 配置文件路径"""
    config_dir = Path.home() / ".config" / "opencode"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir / "opencode.json"


def read_opencode_config() -> dict:
    """读取 opencode.json 配置文件，不存在则返回默认值"""
    config_path = get_opencode_config_path()
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"mcp": {}}


def write_opencode_config(config: dict):
    """写入配置到 opencode.json"""
    config_path = get_opencode_config_path()
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def update_config_mcp_entry(mcp: OpenCodeMCP, old_name: Optional[str] = None):
    """更新或添加 MCP 条目到 opencode.json"""
    config = read_opencode_config()

    # 确保 mcp 部分存在
    if "mcp" not in config:
        config["mcp"] = {}

    # 如果名称改变了，删除旧条目
    if old_name and old_name in config["mcp"] and old_name != mcp.name:
        del config["mcp"][old_name]

    # 从数据库字段准备 MCP 条目
    headers = mcp.config.get("headers", {}) if mcp.config else {}

    mcp_entry = {
        "type": "remote",
        "url": mcp.server_url,
        "enabled": mcp.is_active,
        "headers": headers
    }

    config["mcp"][mcp.name] = mcp_entry
    write_opencode_config(config)


def remove_config_mcp_entry(mcp_name: str):
    """从 opencode.json 删除 MCP 条目"""
    config = read_opencode_config()

    if "mcp" in config and mcp_name in config["mcp"]:
        del config["mcp"][mcp_name]
        write_opencode_config(config)


async def fetch_mcp_tools(server_url: str, config: Optional[dict] = None) -> dict:
    """从 HTTP MCP 服务器获取工具列表"""
    try:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }
        if config and config.get("headers"):
            headers.update(config["headers"])

        # 尝试连接 MCP 服务器
        async with httpx.AsyncClient(timeout=30.0) as client:
            # 1. 获取服务器信息（初始化会话）
            init_payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {},
                        "resources": {},
                        "prompts": {}
                    },
                    "clientInfo": {
                        "name": "DeepAudit",
                        "version": "1.0.0"
                    }
                }
            }

            init_response = await client.post(server_url, json=init_payload, headers=headers)
            init_response.raise_for_status()

            # 从响应头提取 mcp-session-id
            session_id = init_response.headers.get("mcp-session-id") or init_response.headers.get("MCP-Session-ID")

            # 准备后续请求头
            request_headers = headers.copy()
            if session_id:
                request_headers["mcp-session-id"] = session_id

            # 2. 发送 initialized 通知
            initialized_payload = {
                "jsonrpc": "2.0",
                "method": "notifications/initialized"
            }

            try:
                await client.post(server_url, json=initialized_payload, headers=request_headers)
            except Exception:
                # 部分服务器可能不需要此步骤
                pass

            # 3. 获取工具列表
            list_tools_payload = {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/list"
            }

            response = await client.post(server_url, json=list_tools_payload, headers=request_headers)
            response.raise_for_status()

            # 检查内容类型并解析
            content_type = response.headers.get("content-type", "")

            if "text/event-stream" in content_type:
                # 处理 Server-Sent Events 格式
                result = None
                # 解析 SSE 流 - 查找 JSON 数据行
                for line in response.text.split("\n"):
                    line = line.strip()
                    if line.startswith("data:"):
                        data_str = line[5:].strip()
                        if data_str:
                            try:
                                result = json.loads(data_str)
                                break  # 取第一个有效 JSON 数据
                            except Exception:
                                continue

                if result is None:
                    return {
                        "success": False,
                        "error": "Failed to parse SSE response"
                    }
            else:
                # 默认为 JSON 解析
                result = response.json()

            # 检查错误
            if "error" in result:
                return {
                    "success": False,
                    "error": f"tools/list failed: {result['error'].get('message', 'Unknown error')}"
                }

            # 处理不同响应格式
            tools = []
            if "result" in result:
                if isinstance(result["result"], dict) and "tools" in result["result"]:
                    tools = result["result"]["tools"]
                elif isinstance(result["result"], list):
                    tools = result["result"]

            return {
                "success": True,
                "tools": tools
            }

    except httpx.HTTPError as e:
        return {
            "success": False,
            "error": f"HTTP connection error: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to fetch tools: {str(e)}"
        }


def create_or_update_opencode_mcp(
    db: AsyncSession,
    mcp_data: dict,
    current_user,
    existing_mcp: Optional[OpenCodeMCP] = None
) -> tuple[OpenCodeMCP, bool]:
    """创建或更新 OpenCodeMCP 记录，返回(mcp, is_new)"""
    if existing_mcp:
        # 更新现有记录
        if mcp_data.get("name"):
            existing_mcp.name = mcp_data["name"]
        if mcp_data.get("mcp_type"):
            existing_mcp.mcp_type = mcp_data["mcp_type"]
        if mcp_data.get("version"):
            existing_mcp.version = mcp_data["version"]
        if mcp_data.get("description"):
            existing_mcp.description = mcp_data["description"]
        if mcp_data.get("author"):
            existing_mcp.author = mcp_data["author"]
        if mcp_data.get("server_url"):
            existing_mcp.server_url = mcp_data["server_url"]
        if mcp_data.get("command"):
            existing_mcp.command = mcp_data["command"]
        if "args" in mcp_data:
            existing_mcp.args = mcp_data["args"]
        if "env" in mcp_data:
            existing_mcp.env = mcp_data["env"]
        if "config" in mcp_data:
            existing_mcp.config = mcp_data["config"]
        if "tools" in mcp_data:
            existing_mcp.tools = mcp_data["tools"]
        if "tags" in mcp_data:
            existing_mcp.tags = mcp_data["tags"]
        if "is_active" in mcp_data:
            existing_mcp.is_active = mcp_data["is_active"]
        existing_mcp.updated_at = datetime.utcnow()
        return existing_mcp, False
    else:
        # 创建新记录
        new_mcp = OpenCodeMCP(
            name=mcp_data.get("name", "unnamed-mcp"),
            mcp_type=mcp_data.get("mcp_type", "http"),
            version=mcp_data.get("version", "1.0.0"),
            description=mcp_data.get("description", ""),
            author=mcp_data.get("author", getattr(current_user, "full_name", "unknown")),
            server_url=mcp_data.get("server_url", ""),
            command=mcp_data.get("command", ""),
            args=mcp_data.get("args", []),
            env=mcp_data.get("env", {}),
            config=mcp_data.get("config", {}),
            tools=mcp_data.get("tools", []),
            tags=mcp_data.get("tags", []),
            is_active=mcp_data.get("is_active", True),
            created_by=current_user.id if hasattr(current_user, "id") else None
        )
        db.add(new_mcp)
        return new_mcp, True

# ========== 通用工具函数 ==========

# 这些函数从 platform_config.py 导入即可，无需重复实现
```

### 7.2 Skills 刷新端点实现

**文件**: `backend/app/api/v1/endpoints/opencode/skills.py`

新增端点函数（使用 utils.py 工具函数）：
```python
from .utils import (
    get_opencode_skills_dir,
    ensure_dir_exists,
    parse_skill_md_from_path,
    create_or_update_opencode_skill
)


@router.post("/skills/refresh")
async def refresh_skills(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    从文件系统刷新 Skills 到数据库（使用 utils.py 工具函数）
    
    扫描 ~/.config/opencode/skills/ 目录，解析每个子目录的 SKILL.md，
    将不存在的 skill 添加到数据库，已存在的更新 name 和 description
    """
    skills_dir = get_opencode_skills_dir()
    ensure_dir_exists(skills_dir)

    stats = {
        "scanned": 0,
        "added": 0,
        "updated": 0,
        "skipped": 0
    }
    errors = []

    # 遍历 skills 目录
    for item in os.listdir(skills_dir):
        skill_path = os.path.join(skills_dir, item)
        if not os.path.isdir(skill_path):
            continue

        stats["scanned"] += 1

        # 检查 SKILL.md
        skill_md_path = os.path.join(skill_path, "SKILL.md")
        if not os.path.exists(skill_md_path):
            errors.append({
                "directory": item,
                "error": "Missing SKILL.md"
            })
            stats["skipped"] += 1
            continue

        try:
            # 使用工具函数解析 SKILL.md
            skill_data = parse_skill_md_from_path(skill_md_path)
            skill_data["opencode_file_path"] = skill_path

            # 检查是否已存在
            result = await db.execute(
                select(OpenCodeSkill).where(OpenCodeSkill.opencode_file_path == skill_path)
            )
            existing_skill = result.scalar_one_or_none()

            # 使用工具函数创建或更新记录
            skill, is_new = create_or_update_opencode_skill(
                db, skill_data, current_user, existing_skill
            )

            if is_new:
                stats["added"] += 1
            else:
                stats["updated"] += 1

        except Exception as e:
            errors.append({
                "directory": item,
                "error": str(e)
            })
            stats["skipped"] += 1

    await db.commit()

    return {
        "success": True,
        "message": "Skills refreshed successfully",
        "stats": stats,
        "errors": errors
    }
```

### 7.3 Agents 刷新端点实现

**文件**: `backend/app/api/v1/endpoints/opencode/agent_packages.py`

新增端点函数（使用 utils.py 工具函数）：
```python
from .utils import (
    validate_agent_package_structure,
    parse_agents_directory,
    parse_skills_directory_for_agent,
    create_agent_package_with_relations
)


@router.post("/refresh")
async def refresh_agents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    从文件系统刷新 Agents 到数据库（使用 utils.py 工具函数）
    
    扫描 AGENT_PACKAGES_EXTRACTED_PATH 目录，解析每个子目录，
    将不存在的 agent 包添加到数据库
    """
    ensure_storage_dirs()

    stats = {
        "scanned": 0,
        "added": 0,
        "updated": 0,
        "skipped": 0
    }
    errors = []

    extract_dir = Path(settings.AGENT_PACKAGES_EXTRACTED_PATH)

    for item in os.listdir(extract_dir):
        pkg_path = os.path.join(extract_dir, item)
        if not os.path.isdir(pkg_path):
            continue

        stats["scanned"] += 1

        # 使用工具函数验证结构
        if not validate_agent_package_structure(pkg_path):
            errors.append({
                "directory": item,
                "error": "Invalid agent package structure"
            })
            stats["skipped"] += 1
            continue

        # 检查是否已存在
        result = await db.execute(
            select(Agent).where(Agent.original_filename == item)
        )
        existing_agent = result.scalar_one_or_none()

        if existing_agent:
            # 已存在，跳过
            stats["skipped"] += 1
            continue

        try:
            # 1. 读取 AGENTS.md
            agents_md_content = None
            agents_md_path = os.path.join(pkg_path, "AGENTS.md")
            if os.path.exists(agents_md_path):
                with open(agents_md_path, "r", encoding="utf-8") as f:
                    agents_md_content = f.read()

            # 2. 使用工具函数解析 agents/ 目录
            package_agents = parse_agents_directory(os.path.join(pkg_path, "agents"))

            # 3. 使用工具函数解析 skills/ 目录
            package_skills = parse_skills_directory_for_agent(os.path.join(pkg_path, "skills"))

            # 4. 使用工具函数创建 Agent 包及关联记录
            package_data = {
                "name": item,
                "original_filename": item,
                "extracted_dir_path": pkg_path,
                "agents_md_content": agents_md_content,
            }

            new_agent = create_agent_package_with_relations(
                db, package_data, package_agents, package_skills, current_user
            )

            await db.commit()

            stats["added"] += 1

        except Exception as e:
            errors.append({
                "directory": item,
                "error": str(e)
            })
            stats["skipped"] += 1

    return {
        "success": True,
        "message": "Agents refreshed successfully",
        "stats": stats,
        "errors": errors
    }
```

### 7.4 MCPs 刷新端点实现

**文件**: `backend/app/api/v1/endpoints/opencode/mcp.py`

新增端点函数（使用 utils.py 工具函数）：
```python
from .utils import (
    read_opencode_config,
    create_or_update_opencode_mcp,
    fetch_mcp_tools,
    update_config_mcp_entry
)


@router.post("/mcps/refresh")
async def refresh_mcps(
    db: AsyncSession = Depends(get_db),
    current_user = Depends(get_current_user),
):
    """
    从 opencode.json 刷新 MCPs 到数据库（使用 utils.py 工具函数）
    
    读取配置文件中的 mcp 部分，同步到数据库，并刷新工具列表
    """
    stats = {
        "scanned": 0,
        "added": 0,
        "updated": 0,
        "skipped": 0
    }
    errors = []

    # 使用工具函数读取配置
    config = read_opencode_config()
    mcp_configs = config.get("mcp", {})

    for mcp_name, mcp_entry in mcp_configs.items():
        stats["scanned"] += 1

        try:
            # 转换配置格式
            mcp_data = {
                "name": mcp_name,
                "mcp_type": "http",
                "version": "1.0.0",
                "description": "",
                "server_url": mcp_entry.get("url", ""),
                "command": "",
                "args": [],
                "env": {},
                "config": {"headers": mcp_entry.get("headers", {})} if mcp_entry.get("headers") else {},
                "is_active": mcp_entry.get("enabled", True),
            }

            # 检查是否已存在
            result = await db.execute(
                select(OpenCodeMCP).where(OpenCodeMCP.name == mcp_name)
            )
            existing_mcp = result.scalar_one_or_none()

            # 使用工具函数创建或更新记录
            mcp, is_new = create_or_update_opencode_mcp(
                db, mcp_data, current_user, existing_mcp
            )

            # 如果是 HTTP MCP，刷新工具列表
            if mcp.mcp_type == "http" and mcp.server_url:
                tool_result = await fetch_mcp_tools(mcp.server_url, mcp.config)
                if tool_result["success"]:
                    mcp.tools = tool_result["tools"]

            await db.commit()

            # 同步回配置文件
            update_config_mcp_entry(mcp)

            if is_new:
                stats["added"] += 1
            else:
                stats["updated"] += 1

        except Exception as e:
            errors.append({
                "name": mcp_name,
                "error": str(e)
            })
            stats["skipped"] += 1

    return {
        "success": True,
        "message": "MCPs refreshed successfully",
        "stats": stats,
        "errors": errors
    }
```

---

## 8. 安全考虑

### 8.1 现有安全措施保持不变
- 所有现有的认证和授权机制保持不变
- 文件读取权限验证
- 路径遍历防护

### 8.2 新增安全考虑
- 对解析的 SKILL.md、AGENTS.md 等文件内容进行安全验证
- 限制文件读取大小，防止恶意大文件
- 对解析的 frontmatter 进行字段验证
- 记录刷新操作日志

---

## 9. 测试计划

### 9.1 功能测试

#### Skills 刷新测试
- 准备测试 skill 目录，包含有效的和无效的 skill
- 验证刷新端点正确扫描目录
- 验证新 skill 被正确添加到数据库
- 验证现有 skill 的 name 和 description 被正确更新
- 验证无效 skill 被正确跳过并记录错误

#### Agents 刷新测试
- 准备测试 agent 包目录
- 验证刷新端点正确扫描和解析
- 验证新 agent 包被正确添加（包含关联的 agents 和 skills）
- 验证已存在的包被正确跳过

#### MCPs 刷新测试
- 准备测试 opencode.json 配置
- 验证刷新端点正确读取配置
- 验证新 MCP 被正确添加
- 验证现有 MCP 配置被正确同步
- 验证数据库正确更新到 opencode.json

### 9.2 工具函数测试
- 验证 `parse_skill_md_from_path()` 正确解析 SKILL.md
- 验证 `parse_agents_directory()` 正确解析 agents 目录
- 验证 `parse_skills_directory_for_agent()` 正确解析 skills 目录
- 验证 `validate_agent_package_structure()` 正确验证目录结构
- 验证 `create_or_update_opencode_skill()` 正确创建或更新记录
- 验证 `create_or_update_opencode_mcp()` 正确创建或更新记录
- 验证 `create_agent_package_with_relations()` 正确创建关联记录

### 9.3 UI 测试
- 验证统一刷新按钮正常显示
- 验证点击刷新时按钮显示加载状态（旋转图标）
- 验证点击刷新后所有模块数据被同时刷新
- 验证刷新完成后显示汇总的 toast 提示（包含各模块统计信息）
- 验证所有列表正确重新加载
- 验证错误处理正常

---

## 10. 部署说明

### 10.1 部署步骤
1. 创建 utils.py 并迁移所有可复用代码
2. 后端：修改 skills.py、agent_packages.py、mcp.py，使用新工具函数并新增刷新端点
3. 前端：更新 API 客户端和主页面（修改统一刷新按钮逻辑）
4. 测试所有刷新功能正常
5. 构建和部署

### 10.2 回滚计划
- 后端：移除 utils.py，恢复三个模块文件到原始状态，移除新增的刷新端点
- 前端：恢复到添加刷新功能之前的状态

---

## 11. 附录

### 11.1 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 新建 | `backend/app/api/v1/endpoints/opencode/utils.py` | 统一工具函数库 |
| 更新 | `backend/app/api/v1/endpoints/opencode/skills.py` | 重构现有端点，新增 refresh_skills 端点 |
| 更新 | `backend/app/api/v1/endpoints/opencode/agent_packages.py` | 重构现有端点，新增 refresh_agents 端点 |
| 更新 | `backend/app/api/v1/endpoints/opencode/mcp.py` | 重构现有端点，新增 refresh_mcps 端点 |
| 更新 | `frontend/src/shared/api/opencode.ts` | 新增 refreshModels, refreshSkills, refreshAgents, refreshMcps 方法 |
| 更新 | `frontend/src/pages/OpenCodeResourceManager.tsx` | 修改统一刷新按钮逻辑，同时刷新所有模块 |

### 11.2 依赖说明

- 后端：`python-frontmatter`（已存在，用于解析 SKILL.md）
- 前端：无新增依赖

### 11.3 刷新按钮位置

| 模块 | 位置 | 图标 | 说明 |
|------|------|------|------|
| 统一 | 标签页列表右侧 | RefreshCw | 点击后同时刷新所有模块数据（Models、Skills、Agents、MCPs） |

### 11.4 代码复用效益

- **代码复用率**: 约 70% 的刷新功能代码来自现有模块
- **维护性提升**: 所有工具函数集中管理，修改一处即可影响所有使用该函数的模块
- **代码一致性**: 统一的错误处理、数据验证、数据库操作模式
- **开发效率**: 新增类似功能时可直接复用现有函数
- **测试覆盖**: 工具函数的测试可覆盖多个使用场景

---

**文档结束**
