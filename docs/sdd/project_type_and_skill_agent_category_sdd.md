# SDD: 项目类型和 Skill/Agent 分类重构

**文档版本**：1.0
**日期**：2026-05-09
**作者**：DeepAudit Team
**设计原则**：保持数据兼容性，支持灵活扩展

---

## 1. 概述

### 1.1 问题背景

根据 `docs/example/规划.md` 中的需求，需要对以下功能进行重构：

1. **Skill 分类重构**：原有的 skill 分类（security、analysis、utility、custom）需要更新为新的分类体系
2. **Agent 分类新增**：Agent 模型需要新增分类字段
3. **Project 类型新增**：Project 模型需要新增类型字段，并根据类型动态显示技术栈
4. **审计功能重构**：审计时根据项目类型过滤 Agent 和展示 Skill

### 1.2 目标

✅ **Skill 分类更新**：新分类为 ANALYZE（威胁分析）、WHITE（白盒分析）、BLACK（黑盒分析）、OTHER（其他）
✅ **Agent 分类新增**：新增与 Skill 相同的分类体系，默认 OTHER
✅ **Project 类型新增**：新增项目类型（ANALYZE、WHITE、BLACK），默认 WHITE
✅ **技术栈动态显示**：根据项目类型显示对应技术栈选项
✅ **审计功能优化**：审计时只显示同类型 Agent，展示同类型 Skill
✅ **数据兼容性**：原有数据自动迁移，保持向后兼容

---

## 2. 需求详细说明

### 2.1 分类体系定义

| 分类标识 | 中文名称 | 说明 |
|---------|---------|------|
| `ANALYZE` | 威胁分析 | 威胁分析相关的 Skill/Agent |
| `WHITE` | 白盒分析 | 白盒代码审计相关的 Skill/Agent |
| `BLACK` | 黑盒分析 | 黑盒测试相关的 Skill/Agent |
| `OTHER` | 其他 | 其他类型，用于向后兼容 |

### 2.2 项目类型与技术栈对应关系

| 项目类型 | 技术栈选项 |
|----------|------------|
| ANALYZE（威胁分析） | PS、CS&IMS、融合视频、电信云平台 |
| WHITE（白盒分析） | c、go、通用 |
| BLACK（黑盒分析） | 裸机、docker、kubelte、CSP、CGP |

### 2.3 数据迁移策略

| 模型 | 字段 | 迁移策略 |
|------|------|---------|
| Skill | category | 原有所有值 → OTHER |
| Agent | category | 新增字段，默认 OTHER |
| Project | project_type | 新增字段，默认 WHITE |

---

## 3. 详细设计

### 3.1 数据库设计

#### 3.1.1 迁移文件 1：Skill 分类更新

**文件**：`backend/alembic/versions/017_update_skill_category.py`

```python
"""Update skill category to new classification

Revision ID: 017_update_skill_category
Revises: [current_latest_revision]
Create Date: 2026-05-09

"""
from alembic import op
import sqlalchemy as sa


revision = '017_update_skill_category'
down_revision = '[current_latest_revision]'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. 将现有所有 category 更新为 'OTHER'
    op.execute(
        "UPDATE opencode_skills SET category = 'OTHER' "
        "WHERE category IN ('security', 'analysis', 'utility', 'custom')"
    )
    # 注意：如果使用 PostgreSQL ENUM 类型，需要特殊处理


def downgrade() -> None:
    # 回滚时可以选择保留或恢复，但不做强制恢复
    pass
```

#### 3.1.2 迁移文件 2：Agent 分类新增

**文件**：`backend/alembic/versions/018_add_agent_category.py`

```python
"""Add category field to agents

Revision ID: 018_add_agent_category
Revises: 017_update_skill_category
Create Date: 2026-05-09

"""
from alembic import op
import sqlalchemy as sa


revision = '018_add_agent_category'
down_revision = '017_update_skill_category'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 新增 category 字段
    op.add_column('agents', sa.Column('category', sa.String(length=20), nullable=True, server_default='OTHER'))
    # 新增索引
    op.create_index(op.f('ix_agents_category'), 'agents', ['category'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_agents_category'), table_name='agents')
    op.drop_column('agents', 'category')
```

#### 3.1.3 迁移文件 3：Project 类型新增

**文件**：`backend/alembic/versions/019_add_project_type.py`

```python
"""Add project_type field to projects

Revision ID: 019_add_project_type
Revises: 018_add_agent_category
Create Date: 2026-05-09

"""
from alembic import op
import sqlalchemy as sa


revision = '019_add_project_type'
down_revision = '018_add_agent_category'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 新增 project_type 字段，默认 WHITE
    op.add_column('projects', sa.Column('project_type', sa.String(length=20), nullable=True, server_default='WHITE'))
    # 新增索引
    op.create_index(op.f('ix_projects_project_type'), 'projects', ['project_type'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_projects_project_type'), table_name='projects')
    op.drop_column('projects', 'project_type')
```

### 3.2 后端数据模型更新

#### 3.2.1 Skill 模型更新

**文件**：`backend/app/models/opencode/opencode_skill_mcp.py`

```python
from enum import Enum


class SkillCategory(str, Enum):
    """Skill 分类枚举"""
    ANALYZE = "ANALYZE"    # 威胁分析
    WHITE = "WHITE"        # 白盒分析
    BLACK = "BLACK"        # 黑盒分析
    OTHER = "OTHER"        # 其他（向后兼容）


# 在 OpenCodeSkill 模型中更新 category 字段
# 原有代码保持，更新枚举引用即可
```

#### 3.2.2 Agent 模型更新

**文件**：`backend/app/models/opencode/agent.py`

```python
from enum import Enum


class AgentCategory(str, Enum):
    """Agent 分类枚举"""
    ANALYZE = "ANALYZE"    # 威胁分析
    WHITE = "WHITE"        # 白盒分析
    BLACK = "BLACK"        # 黑盒分析
    OTHER = "OTHER"        # 其他


# 在 Agent 模型中新增
class Agent(Base):
    # ... 现有字段 ...
    
    category = Column(
        String(20),
        nullable=True,
        default=AgentCategory.OTHER,
        index=True,
        doc="Agent 分类"
    )
```

#### 3.2.3 Project 模型更新

**文件**：`backend/app/models/project/project.py`

```python
from enum import Enum


class ProjectType(str, Enum):
    """项目类型枚举"""
    ANALYZE = "ANALYZE"    # 威胁分析
    WHITE = "WHITE"        # 白盒分析
    BLACK = "BLACK"        # 黑盒分析


# 在 Project 模型中新增
class Project(Base):
    # ... 现有字段 ...
    
    project_type = Column(
        String(20),
        nullable=True,
        default=ProjectType.WHITE,
        index=True,
        doc="项目类型"
    )
```

### 3.3 后端 API 设计

#### 3.3.1 新增：获取项目对应 Agent

**端点**：`GET /api/v1/projects/{project_id}/agents`

**功能**：根据项目类型获取同类型的 Agent 列表

**响应示例**：
```json
{
  "items": [
    {
      "id": "agent-1",
      "name": "白盒分析 Agent",
      "category": "WHITE"
    }
  ],
  "total": 1
}
```

#### 3.3.2 新增：获取项目对应 Skill

**端点**：`GET /api/v1/projects/{project_id}/skills`

**功能**：根据项目类型获取同类型的 Skill 列表（仅供展示）

**响应示例**：
```json
{
  "items": [
    {
      "id": "skill-1",
      "name": "Go 安全审计",
      "category": "WHITE"
    }
  ],
  "total": 1
}
```

### 3.4 前端类型定义

**文件**：`frontend/src/shared/types/index.ts`

```typescript
// 新增分类枚举
export enum SkillCategory {
  ANALYZE = 'ANALYZE',
  WHITE = 'WHITE',
  BLACK = 'BLACK',
  OTHER = 'OTHER'
}

export enum AgentCategory {
  ANALYZE = 'ANALYZE',
  WHITE = 'WHITE',
  BLACK = 'BLACK',
  OTHER = 'OTHER'
}

export enum ProjectType {
  ANALYZE = 'ANALYZE',
  WHITE = 'WHITE',
  BLACK = 'BLACK'
}

// 更新 Project 类型
export interface Project {
  // ... 现有字段 ...
  project_type?: ProjectType;
}

// 更新 Skill 类型
export interface Skill {
  // ... 现有字段 ...
  category: SkillCategory;
}

// 更新 Agent 类型
export interface Agent {
  // ... 现有字段 ...
  category: AgentCategory;
}
```

### 3.5 前端界面设计

#### 3.5.1 项目新建/编辑界面

**文件**：`frontend/src/pages/Projects.tsx`

**新增组件逻辑**：
```typescript
// 技术栈选项配置
const TECH_STACK_OPTIONS: Record<ProjectType, string[]> = {
  [ProjectType.ANALYZE]: ['PS', 'CS&IMS', '融合视频', '电信云平台'],
  [ProjectType.WHITE]: ['c', 'go', '通用'],
  [ProjectType.BLACK]: ['裸机', 'docker', 'kubelte', 'CSP', 'CGP']
};

// 根据选中的项目类型动态显示技术栈
const handleProjectTypeChange = (type: ProjectType) => {
  setCreateForm({ ...createForm, project_type: type, programming_languages: [] });
};
```

#### 3.5.2 项目审计界面

**文件**：`frontend/src/pages/ProjectDetail.tsx`

**功能**：
- 调用 `/api/v1/projects/{project_id}/agents` 获取可选 Agent
- 调用 `/api/v1/projects/{project_id}/skills` 获取 Skill 列表（只读展示）

---

## 4. 实施清单

| 阶段 | 步骤 | 文件 | 优先级 |
|------|------|------|--------|
| 1 | 创建数据库迁移文件 | `backend/alembic/versions/017*.py` | 高 |
| 1 | 创建数据库迁移文件 | `backend/alembic/versions/018*.py` | 高 |
| 1 | 创建数据库迁移文件 | `backend/alembic/versions/019*.py` | 高 |
| 2 | 更新 Skill 模型枚举 | `backend/app/models/opencode/opencode_skill_mcp.py` | 高 |
| 2 | 更新 Agent 模型（新增分类） | `backend/app/models/opencode/agent.py` | 高 |
| 2 | 更新 Project 模型（新增类型） | `backend/app/models/project/project.py` | 高 |
| 3 | 更新 Skill API | `backend/app/api/v1/endpoints/opencode/skills.py` | 中 |
| 3 | 更新 Agent API | [Agent API 文件] | 中 |
| 3 | 更新 Project API | `backend/app/api/v1/endpoints/project/projects.py` | 高 |
| 3 | 新增获取项目 Agent 接口 | [Project API 文件] | 中 |
| 3 | 新增获取项目 Skill 接口 | [Project API 文件] | 中 |
| 4 | 更新前端类型定义 | `frontend/src/shared/types/index.ts` | 高 |
| 5 | 更新 Skill 管理界面 | `frontend/src/pages/OpenCodeResourceManager.tsx` | 中 |
| 5 | 更新 Agent 管理界面 | `frontend/src/pages/OpenCodeResourceManager.tsx` | 中 |
| 5 | 重构项目新建/编辑界面 | `frontend/src/pages/Projects.tsx` | 高 |
| 5 | 重构项目审计界面 | `frontend/src/pages/ProjectDetail.tsx` | 高 |

---

## 5. 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 数据库迁移失败 | 高 | 低 | 先在测试环境验证，备份生产数据 |
| 现有数据丢失 | 高 | 低 | 迁移前备份，迁移逻辑非破坏性 |
| 枚举值不匹配导致错误 | 中 | 中 | 代码中添加兼容性处理，接受字符串并转换 |
| 前端显示异常 | 中 | 中 | 充分测试各种类型组合 |

---

## 6. 测试计划

### 6.1 测试用例

| ID | 测试场景 | 预期结果 |
|----|---------|---------|
| 1 | Skill 数据迁移 | 原有 Skill category 全部变为 OTHER |
| 2 | Agent 新增字段 | Agent 表有 category 字段，默认值 OTHER |
| 3 | Project 新增字段 | Project 表有 project_type 字段，默认值 WHITE |
| 4 | 新建威胁分析项目 | 技术栈选项显示 PS、CS&IMS 等 |
| 5 | 新建白盒分析项目 | 技术栈选项显示 c、go、通用 |
| 6 | 新建黑盒分析项目 | 技术栈选项显示 裸机、docker 等 |
| 7 | 白盒项目审计 | 只显示 WHITE 类型的 Agent |
| 8 | 白盒项目审计 | 展示 WHITE 类型的 Skill 列表 |

---

## 7. 回退计划

### 7.1 回退步骤

如果出现问题，按以下顺序回退：

1. **数据库回退**：
   ```bash
   cd backend
   alembic downgrade -3  # 回退 3 个版本
   ```

2. **代码回退**：
   - 检出修改前的代码版本

3. **重启服务**

### 7.2 回退影响

- 数据库恢复到原有结构
- 功能恢复到原有行为
- 不影响现有数据

---

## 附录 A：分类映射关系

### A.1 Skill 原有分类映射

| 原分类值 | 新分类值 |
|---------|---------|
| security | OTHER |
| analysis | OTHER |
| utility | OTHER |
| custom | OTHER |
| (其他) | OTHER |

### A.2 项目类型中文映射

| 枚举值 | 中文显示 |
|--------|---------|
| ANALYZE | 威胁分析 |
| WHITE | 白盒分析 |
| BLACK | 黑盒分析 |

---

**文档结束**
