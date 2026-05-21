# DeepAudit 数据库初始化方案设计文档 (SDD)

**文档编号**: SDD-DB-INIT-001  
**版本**: v1.0  
**日期**: 2026-05-21  
**状态**: 设计阶段  
**作者**: 系统架构分析  

---

## 目录

1. [概述](#1-概述)
2. [问题分析](#2-问题分析)
3. [系统架构设计](#3-系统架构设计)
4. [模型完整性检查](#4-模型完整性检查)
5. [解决方案设计](#5-解决方案设计)
6. [实施计划](#6-实施计划)
7. [验证方案](#7-验证方案)
8. [风险评估](#8-风险评估)
9. [附录](#9-附录)

---

## 1. 概述

### 1.1 背景

DeepAudit v3.0.4 项目在全新环境部署时，使用 `docker compose up -d` 启动后，数据库表结构未能完整创建，导致应用运行时出现以下错误：

```
ERROR: column projects.opencode_active_session_id does not exist
ERROR: column agents.is_public does not exist
ERROR: column opencode_skills.agent_package_id does not exist
```

### 1.2 问题影响

- 全新环境部署失败
- 现有环境升级后缺少必要字段
- 影响范围：核心业务功能（项目管理、Agent系统、知识库）

### 1.3 设计目标

设计一套可靠的数据库初始化方案，实现：
- 全新环境直接部署，无需依赖 Alembic 迁移链
- 表结构与模型定义完全一致
- 支持后续增量升级（保持 Alembic 兼容性）
- 自动化、零配置部署

---

## 2. 问题分析

### 2.1 根本原因分析

#### 2.1.1 迁移文件与模型脱节

| 问题类型 | 描述 | 影响 |
|----------|------|------|
| **字段遗漏** | 模型新增字段无对应迁移文件 | 表结构不完整 |
| **版本号过长** | `011_add_opencode_message_contents` (34字符) 超过 VARCHAR(32) | 迁移执行失败 |
| **导入顺序错误** | `Base.metadata.create_all()` 在模型导入前执行 | 表创建失败 |

#### 2.1.2 模型导入不完整

**核心问题**: `backend/app/db/base.py` 未导入任何模型类

```python
# 当前状态 (仅17行)
@as_declarative()
class Base:
    id: str
    __name__: str
    
    @declared_attr
    def __tablename__(cls) -> str:
        return cls.__name__.lower() + "s"

# 问题: Base.metadata 为空，create_all() 无表可创建
```

#### 2.1.3 启动流程分析

```
应用启动流程:
├─ lifespan() 函数开始
│   ├─ Base.metadata.create_all() ← 此时 metadata 可能为空
│   └─ init_db() 初始化数据
├─ app.include_router(api_router) ← 导入 endpoints
│   └─ endpoints 导入 models ← 模型注册到 Base.metadata (晚了!)
└─ 应用就绪
```

**时序图**:

```
时间轴
T0: app/main.py 导入
T1: lifespan() 开始执行
T2: Base.metadata.create_all() ← metadata.registry = 空
T3: 应用继续初始化
T4: include_router() → 导入 endpoints
T5: endpoints → 导入 models
T6: 模型注册到 Base.metadata ← 已经晚了
T7: 应用就绪，但表可能未创建
```

### 2.2 Alembic 版本号限制问题

#### 2.2.1 错误详情

```
asyncpg.exceptions.StringDataRightTruncationError: 
value too long for type character varying(32)

SQL: UPDATE alembic_version 
SET version_num='011_add_opencode_message_contents' 
WHERE alembic_version.version_num = '010_add_opencode_interactions'
```

#### 2.2.2 版本号长度分析

| Revision ID | 长度 | 状态 |
|-------------|------|------|
| `011_add_opencode_message_contents` | 34字符 | ❌ 超出限制 |
| `007_add_agent_checkpoint_tables` | 32字符 | ⚠️ 刚好达标 |
| `013_add_attack_pattern_versioning` | 32字符 | ⚠️ 刚好达标 |
| 其他版本号 | <32字符 | ✓ 正常 |

#### 2.2.3 解决方案

已创建迁移文件 `010_5_extend_alembic_version_length.py`，扩展字段长度至 VARCHAR(64)。

---

## 3. 系统架构设计

### 3.1 数据库架构概览

```
DeepAudit 数据库架构
├─ 用户系统 (users, user_configs)
├─ 项目管理 (projects, project_members, project_configs)
├─ 审计系统 (audit_tasks, audit_issues, audit_vulnerabilities, audit_rules)
├─ Agent 系统 (agent_tasks, agent_events, agent_findings, agent_checkpoints, agent_tree_nodes)
├─ OpenCode 集成 (agents, opencode_skills, opencode_mcps, opencode_sessions, opencode_interactions)
├─ 知识库 (prompt_templates, go_vulnerability_entries, go_attack_pattern_entries, business_kb_entries)
├─ 工作流 (workflows)
└─ 版本控制 (alembic_version)
```

### 3.2 SQLAlchemy 模型注册机制

#### 3.2.1 声明式基类设计

```python
# 声明式基类定义
@as_declarative()
class Base:
    """所有模型的基类"""
    id: str              # 主键字段
    __name__: str        # 类名
    
    @declared_attr
    def __tablename__(cls) -> str:
        """自动生成表名（类名小写 + 's'）"""
        return cls.__name__.lower() + "s"
```

#### 3.2.2 模型注册流程

```
模型注册流程
├─ Step 1: 定义 Base 类
│   └─ Base.metadata = MetaData() (空的注册表)
├─ Step 2: 各模型文件导入 Base
│   └─ class Model(Base): ... (继承 Base)
├─ Step 3: 模型类定义完成
│   └─ Table 对象自动注册到 Base.metadata
├─ Step 4: Base.metadata.create_all(engine)
│   └─ 遍历 Base.metadata.tables 创建表
└─ 结果: 所有表创建成功
```

**关键点**:
- 模型必须**在 `create_all()` 之前**导入
- 导入语句执行时，模型类注册到 `Base.metadata`
- `Base.metadata.tables` 包含所有已注册的表定义

---

## 4. 模型完整性检查

### 4.1 模型文件结构

```
backend/app/models/
├─ __init__.py          (模型导出汇总)
├─ user/
│   ├─ user.py          (User)
│   └─ user_config.py   (UserConfig)
├─ project/
│   └ project.py        (Project, ProjectMember)
├─ audit/
│   ├─ audit.py         (AuditTask, AuditIssue)
│   ├─ audit_vulnerabilities.py (AuditVulnerability)
│   ├─ analysis.py      (InstantAnalysis)
│   └ audit_rule.py     (AuditRuleSet, AuditRule)
├─ agent/
│   └ agent_task.py     (AgentTask, AgentEvent, AgentFinding, AgentCheckpoint, AgentTreeNode)
├─ opencode/
│   ├─ agent.py         (Agent)
│   ├─ opencode_agent.py (OpenCodeAgent)
│   ├─ opencode_skill_mcp.py (OpenCodeSkill, OpenCodeMCP)
│   ├─ opencode_project_task.py (ProjectConfig, TaskExecution)
│   ├─ opencode_session.py (OpenCodeSession)
│   ├─ opencode_interaction.py (OpenCodeInteraction)
│   ├─ opencode_message_content.py (OpenCodeMessageContent)
│   └ opencode_audit_task.py (OpenCodeAuditTask)
├─ knowledge/
│   ├─ prompt_template.py (PromptTemplate)
│   └ security_kb.py    (GoVulnerabilityEntry, GoAttackPatternEntry, BusinessKbEntry)
└─ workflow/
    └ workflow.py       (Workflow)
```

### 4.2 模型注册状态检查

#### 4.2.1 当前状态

| 检查项 | 结果 | 问题 |
|--------|------|------|
| 模型文件总数 | 27个 | ✓ 正常 |
| 模型类总数 | 30个 | ✓ 正常 |
| `base.py` 导入模型数 | **0个** | ❌ **关键问题** |
| `models/__init__.py` 导出数 | 26个 | ⚠️ 缺少4个 |

#### 4.2.2 遗漏模型清单

| 模型类 | 文件位置 | 表名 | 用途 |
|--------|---------|------|------|
| **Workflow** | `workflow/workflow.py` | `workflows` | 工作流管理 |
| **AgentCheckpoint** | `agent/agent_task.py:448` | `agent_checkpoints` | Agent 状态恢复 |
| **AgentTreeNode** | `agent/agent_task.py:513` | `agent_tree_nodes` | Agent 树可视化 |
| **BusinessKbEntry** | `knowledge/security_kb.py:91` | `business_kb_entries` | 业务知识库 |

### 4.3 缺失字段清单

#### 4.3.1 projects 表

| 字段名 | 类型 | 模型位置 | 迁移状态 |
|--------|------|----------|----------|
| `opencode_active_session_id` | String | `project.py:44-46` | ❌ 无迁移文件 |

#### 4.3.2 agents 表

| 字段名 | 类型 | 模型位置 | 迁移状态 |
|--------|------|----------|----------|
| `is_public` | Boolean | `agent.py:42` | ❌ 无迁移文件 |
| `original_filename` | String(255) | `agent.py:36` | ❌ 无迁移文件 |
| `package_file_path` | String(500) | `agent.py:37` | ❌ 无迁移文件 |
| `extracted_dir_path` | String(500) | `agent.py:38` | ❌ 无迁移文件 |
| `agents_md_content` | Text | `agent.py:39` | ❌ 无迁移文件 |
| `agents_count` | Integer | `agent.py:40` | ❌ 无迁移文件 |
| `skills_count` | Integer | `agent.py:41` | ❌ 无迁移文件 |

#### 4.3.3 opencode_skills 表

| 字段名 | 类型 | 模型位置 | 迁移状态 |
|--------|------|----------|----------|
| `agent_package_id` | String(36) + FK | `opencode_skill_mcp.py:59` | ❌ 无迁移文件 |

---

## 5. 解决方案设计

### 5.1 方案概述

设计**混合初始化方案**，支持两种模式：
- **标准模式**: 使用 Alembic 迁移（适用于已有环境升级）
- **直接初始化模式**: 使用 SQLAlchemy `create_all()`（适用于全新环境）

### 5.2 核心设计

#### 5.2.1 模型导入修复方案

**设计要点**:
- 在 `base.py` 中导入所有模型类
- 确保导入顺序正确（避免循环依赖）
- 所有模型注册到 `Base.metadata`

**导入设计**:

```python
# backend/app/db/base.py

from sqlalchemy.orm import as_declarative, declared_attr

@as_declarative()
class Base:
    id: str
    __name__: str
    
    @declared_attr
    def __tablename__(cls) -> str:
        return cls.__name__.lower() + "s"

# ========== 导入所有模型（确保注册到 Base.metadata） ==========

# 用户系统
from app.models.user.user import User
from app.models.user.user_config import UserConfig

# 项目管理
from app.models.project.project import Project, ProjectMember

# 审计系统
from app.models.audit.audit import AuditTask, AuditIssue
from app.models.audit.audit_vulnerabilities import AuditVulnerability
from app.models.audit.analysis import InstantAnalysis
from app.models.audit.audit_rule import AuditRuleSet, AuditRule

# Agent 系统
from app.models.agent.agent_task import (
    AgentTask, AgentEvent, AgentFinding, 
    AgentCheckpoint, AgentTreeNode
)

# OpenCode 集成
from app.models.opencode.agent import Agent
from app.models.opencode.opencode_agent import OpenCodeAgent
from app.models.opencode.opencode_skill_mcp import OpenCodeSkill, OpenCodeMCP
from app.models.opencode.opencode_project_task import ProjectConfig, TaskExecution
from app.models.opencode.opencode_session import OpenCodeSession
from app.models.opencode.opencode_interaction import OpenCodeInteraction
from app.models.opencode.opencode_message_content import OpenCodeMessageContent
from app.models.opencode.opencode_audit_task import OpenCodeAuditTask

# 知识库
from app.models.knowledge.prompt_template import PromptTemplate
from app.models.knowledge.security_kb import (
    GoVulnerabilityEntry, GoAttackPatternEntry, BusinessKbEntry
)

# 工作流
from app.models.workflow.workflow import Workflow
```

#### 5.2.2 模型导出修复方案

**修改位置**: `backend/app/models/__init__.py`

**新增导出**:

```python
# 工作流模型
from .workflow.workflow import Workflow, WorkflowStageStatus

# Agent 扩展模型
from .agent.agent_task import AgentCheckpoint, AgentTreeNode

# 知识库扩展模型
from .knowledge.security_kb import BusinessKbEntry

# 更新 __all__ 列表
__all__ = [
    # ... 现有的 26 个导出 ...
    "Workflow",
    "WorkflowStageStatus",
    "AgentCheckpoint",
    "AgentTreeNode",
    "BusinessKbEntry",
]
```

### 5.3 直接初始化脚本设计

#### 5.3.1 脚本功能设计

**文件位置**: `backend/scripts/init_db_direct.py`

**功能清单**:
- 连接数据库（同步引擎）
- 创建所有表结构 (`Base.metadata.create_all()`)
- 创建 `alembic_version` 表
- 标记版本号为最新版本
- 可选：创建初始管理员账户

#### 5.3.2 核心流程设计

```
init_db_direct.py 执行流程
├─ Step 1: 导入 Base 和所有模型
│   └─ from app.db.base import Base (包含所有模型导入)
├─ Step 2: 创建同步引擎
│   └─ DATABASE_URL.replace("+asyncpg", "+psycopg2")
├─ Step 3: 创建所有表
│   └─ Base.metadata.create_all(bind=engine)
│   ├─ 遍历 Base.metadata.tables
│   ├─ 创建表结构
│   ├─ 创建索引
│   └─ 创建外键约束
├─ Step 4: 创建 alembic_version 表
│   ├─ CREATE TABLE alembic_version (version_num VARCHAR(64) PRIMARY KEY)
│   └─ INSERT INTO alembic_version VALUES ('版本号')
├─ Step 5: 验证表结构
│   └─ 检查表数量、索引、约束
└─ Step 6: 清理资源
    └─ engine.dispose()
```

#### 5.3.3 alembic_version 版本号选择

**选项分析**:

| 版本号选项 | 优点 | 缺点 | 建议 |
|------------|------|------|------|
| `022_add_product_fields` | 已存在，无需创建迁移 | 不是真正最新 | ⚠️ 临时方案 |
| `024_add_missing_fields` | 表示真正最新版本 | 需先创建补丁迁移 | ✓ **推荐** |
| 自定义版本号 | 可标记为 "direct_init" | 与迁移链不一致 | ❌ 不推荐 |

**推荐方案**: 
- 先创建补丁迁移 `024_add_missing_model_fields.py`
- 添加所有缺失字段
- 使用 `024_add_missing_fields` 作为初始化版本号

### 5.4 Docker 启动流程设计

#### 5.4.1 环境变量设计

**新增环境变量**: `INIT_DB_DIRECT`

| 值 | 行为 | 适用场景 |
|----|------|----------|
| `true` | 直接初始化（绕过 Alembic） | 全新环境部署 |
| `false` | Alembic 迁移模式 | 已有环境升级 |

#### 5.4.2 启动脚本设计

**修改位置**: `backend/docker-entrypoint.sh`

**流程设计**:

```
docker-entrypoint.sh 流程
├─ Step 1: 等待数据库就绪
│   └─ 循环检查，最多30次重试
├─ Step 2: 判断初始化模式
│   ├─ if INIT_DB_DIRECT=true:
│   │   ├─ 执行 scripts/init_db_direct.py
│   │   └─ 标记版本，创建表结构
│   └─ else:
│       ├─ 执行 alembic upgrade head
│       └─ 按迁移链逐步升级
├─ Step 3: 启动应用
│   └─ uvicorn app.main:app
└─ 完成
```

---

## 6. 实施计划

### 6.1 实施阶段

#### Phase 1: 模型导入修复（必须）

| 任务 | 文件 | 预期结果 |
|------|------|----------|
| 导入所有模型到 base.py | `app/db/base.py` | Base.metadata 包含30个表 |
| 补充模型导出 | `app/models/__init__.py` | __all__ 包含30个模型 |

#### Phase 2: 补丁迁移创建（必须）

| 任务 | 文件 | 预期结果 |
|------|------|----------|
| 创建字段补丁迁移 | `alembic/versions/024_add_missing_model_fields.py` | 包含9个缺失字段 |
| 执行迁移测试 | 数据库 | 所有字段已添加 |

#### Phase 3: 直接初始化脚本（必须）

| 任务 | 文件 | 预期结果 |
|------|------|----------|
| 创建初始化脚本 | `scripts/init_db_direct.py` | 可直接创建完整表结构 |
| 创建验证脚本 | `scripts/verify_db_schema.py` | 可验证表结构完整性 |

#### Phase 4: Docker 配置更新（必须）

| 任务 | 文件 | 预期结果 |
|------|------|----------|
| 修改启动脚本 | `docker-entrypoint.sh` | 支持 INIT_DB_DIRECT 模式 |
| 修改 compose 配置 | `docker-compose.yml` | 传递 INIT_DB_DIRECT 环境变量 |

#### Phase 5: 测试验证（必须）

| 任务 | 方法 | 预期结果 |
|------|------|----------|
| 全新环境测试 | `INIT_DB_DIRECT=true docker compose up -d` | 所有表已创建 |
| 已有环境升级测试 | `docker compose up -d` | 迁移正常执行 |
| 表结构验证 | SQL 查询 | 30个表，所有字段完整 |

### 6.2 实施时间表

| 阶段 | 任务 | 文件数 | 预计耗时 |
|------|------|--------|----------|
| Phase 1 | 模型导入修复 | 2 | 30分钟 |
| Phase 2 | 补丁迁移创建 | 1 | 20分钟 |
| Phase 3 | 初始化脚本 | 2 | 40分钟 |
| Phase 4 | Docker 配置 | 2 | 20分钟 |
| Phase 5 | 测试验证 | - | 60分钟 |
| **总计** | - | **7** | **170分钟** |

### 6.3 实施依赖关系

```
实施依赖关系图
├─ Phase 1 (模型导入修复)
│   └─ 必须最先执行
│   └─ 其他阶段依赖此阶段结果
├─ Phase 2 (补丁迁移)
│   └─ 依赖 Phase 1
│   └─ 可与 Phase 3 并行
├─ Phase 3 (初始化脚本)
│   └─ 依赖 Phase 1
│   └─ 可与 Phase 2 并行
├─ Phase 4 (Docker 配置)
│   └─ 依赖 Phase 1, 2, 3 完成
└─ Phase 5 (测试验证)
    └─ 依赖所有阶段完成
```

---

## 7. 验证方案

### 7.1 自动化验证脚本设计

**脚本功能**:

```python
# backend/scripts/verify_db_schema.py

from sqlalchemy import create_engine, inspect, text
from app.core.config import settings

def verify_schema():
    """验证数据库表结构完整性"""
    
    # 连接数据库
    engine = create_engine(settings.DATABASE_URL.replace("+asyncpg", "+psycopg2"))
    inspector = inspect(engine)
    
    # 获取所有表名
    tables = inspector.get_table_names()
    
    # 验证必要表
    required_tables = [
        'users', 'user_configs',
        'projects', 'project_members', 'project_configs',
        'audit_tasks', 'audit_issues', 'audit_vulnerabilities', 
        'audit_rules', 'audit_rule_sets',
        'agent_tasks', 'agent_events', 'agent_findings',
        'agent_checkpoints', 'agent_tree_nodes',
        'agents', 'opencode_skills', 'opencode_mcps',
        'opencode_sessions', 'opencode_interactions',
        'opencode_message_contents', 'opencode_audit_tasks',
        'prompt_templates',
        'go_vulnerability_entries', 'go_attack_pattern_entries',
        'business_kb_entries',
        'workflows',
        'instant_analyses',
    ]
    
    # 检查缺失表
    missing_tables = [t for t in required_tables if t not in tables]
    
    # 验证关键字段
    required_columns = {
        'projects': ['opencode_active_session_id'],
        'agents': ['is_public', 'original_filename', 'package_file_path', 
                   'extracted_dir_path', 'agents_md_content', 
                   'agents_count', 'skills_count'],
        'opencode_skills': ['agent_package_id'],
    }
    
    # 检查缺失字段
    missing_columns = {}
    for table, columns in required_columns.items():
        table_columns = [c['name'] for c in inspector.get_columns(table)]
        missing = [c for c in columns if c not in table_columns]
        if missing:
            missing_columns[table] = missing
    
    # 验证 alembic_version
    with engine.connect() as conn:
        result = conn.execute(text("SELECT version_num FROM alembic_version"))
        version = result.scalar()
    
    # 输出验证结果
    print("=" * 60)
    print("数据库表结构验证报告")
    print("=" * 60)
    print(f"总表数: {len(tables)}")
    print(f"必要表数: {len(required_tables)}")
    print(f"缺失表: {missing_tables}")
    print(f"缺失字段: {missing_columns}")
    print(f"alembic_version: {version}")
    print("=" * 60)
    
    # 判断验证结果
    is_valid = len(missing_tables) == 0 and len(missing_columns) == 0
    
    if is_valid:
        print("✅ 验证通过：表结构完整")
    else:
        print("❌ 验证失败：表结构不完整")
    
    engine.dispose()
    return is_valid
```

### 7.2 手动验证方法

#### 7.2.1 表数量验证

```sql
-- PostgreSQL 查询
SELECT COUNT(*) FROM information_schema.tables 
WHERE table_schema = 'public';

-- 预期结果: 30+
```

#### 7.2.2 关键字段验证

```sql
-- projects 表字段检查
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'projects' 
AND column_name = 'opencode_active_session_id';

-- agents 表字段检查
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'agents' 
AND column_name IN ('is_public', 'original_filename', 'agents_count');

-- opencode_skills 表字段检查
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'opencode_skills' 
AND column_name = 'agent_package_id';
```

#### 7.2.3 版本号验证

```sql
SELECT version_num FROM alembic_version;

-- 预期结果: 024_add_missing_fields 或更高版本
```

### 7.3 验证清单

| 验证项 | 方法 | 预期结果 | 通过条件 |
|--------|------|----------|----------|
| 表总数 | SQL COUNT | ≥30 | ✓ |
| 必要表存在 | SQL SELECT | 无缺失 | ✓ |
| 关键字段存在 | SQL SELECT | 无缺失 | ✓ |
| 外键约束有效 | SQL 查询 | 所有FK正常 | ✓ |
| 索引已创建 | SQL 查询 | 所有索引存在 | ✓ |
| alembic_version | SQL SELECT | 最新版本 | ✓ |
| 应用启动成功 | 日志检查 | 无ERROR | ✓ |
| API 响应正常 | HTTP测试 | 200 OK | ✓ |

---

## 8. 风险评估

### 8.1 技术风险

| 风险项 | 描述 | 影响 | 级别 | 缓解措施 |
|--------|------|------|------|----------|
| **循环导入** | base.py 导入模型可能产生循环依赖 | 启动失败 | 高 | 按正确顺序导入，使用字符串引用 |
| **字段类型不匹配** | 模型定义与已有表结构不一致 | 数据丢失 | 高 | 先执行补丁迁移，再直接初始化 |
| **版本号不一致** | 直接初始化与迁移链版本不匹配 | 后续升级失败 | 中 | 使用迁移链最新版本号 |
| **外键依赖顺序** | 表创建顺序可能导致外键失败 | 表创建失败 | 中 | SQLAlchemy 自动处理依赖顺序 |
| **数据丢失** | 已有环境误用直接初始化模式 | 数据丢失 | 高 | 环境变量检查 + 警告日志 |

### 8.2 业务风险

| 风险项 | 描述 | 影响 | 级别 | 缓解措施 |
|--------|------|------|------|----------|
| **部署失败** | 新客户无法部署 | 业务中断 | 高 | 充分测试，提供回滚方案 |
| **功能不可用** | 缺失字段导致功能异常 | 用户体验差 | 中 | 逐步发布，灰度测试 |
| **升级中断** | 已有客户升级后系统异常 | 客户投诉 | 高 | 提供迁移文档，技术支持 |

### 8.3 缓解策略

#### 8.3.1 技术风险缓解

**循环导入预防**:
- base.py 在 Base 定义后导入模型
- 模型文件只导入 Base，不导入其他模型
- relationship 使用字符串引用: `relationship("User", backref="projects")`

**字段一致性检查**:
- 使用 `alembic revision --autogenerate` 检测差异
- 执行补丁迁移后再使用直接初始化

**版本号管理**:
- 保持直接初始化版本号与迁移链一致
- 每次新增迁移后更新初始化脚本版本号

#### 8.3.2 业务风险缓解

**部署保障**:
- 提供详细部署文档
- CI/CD 自动化测试
- Docker 镜像预构建测试

**升级保障**:
- 已有环境强制使用 Alembic 模式
- 提供迁移检查脚本
- 技术支持文档

---

## 9. 附录

### 9.1 完整模型清单

| 序号 | 模型类 | 表名 | 文件位置 |
|------|--------|------|----------|
| 1 | User | users | `user/user.py` |
| 2 | UserConfig | user_configs | `user/user_config.py` |
| 3 | Project | projects | `project/project.py` |
| 4 | ProjectMember | project_members | `project/project.py` |
| 5 | AuditTask | audit_tasks | `audit/audit.py` |
| 6 | AuditIssue | audit_issues | `audit/audit.py` |
| 7 | AuditVulnerability | audit_vulnerabilities | `audit/audit_vulnerabilities.py` |
| 8 | InstantAnalysis | instant_analyses | `audit/analysis.py` |
| 9 | AuditRuleSet | audit_rule_sets | `audit/audit_rule.py` |
| 10 | AuditRule | audit_rules | `audit/audit_rule.py` |
| 11 | AgentTask | agent_tasks | `agent/agent_task.py` |
| 12 | AgentEvent | agent_events | `agent/agent_task.py` |
| 13 | AgentFinding | agent_findings | `agent/agent_task.py` |
| 14 | AgentCheckpoint | agent_checkpoints | `agent/agent_task.py` |
| 15 | AgentTreeNode | agent_tree_nodes | `agent/agent_task.py` |
| 16 | Agent | agents | `opencode/agent.py` |
| 17 | OpenCodeAgent | opencode_agents | `opencode/opencode_agent.py` |
| 18 | OpenCodeSkill | opencode_skills | `opencode/opencode_skill_mcp.py` |
| 19 | OpenCodeMCP | opencode_mcps | `opencode/opencode_skill_mcp.py` |
| 20 | ProjectConfig | project_configs | `opencode/opencode_project_task.py` |
| 21 | TaskExecution | task_executions | `opencode/opencode_project_task.py` |
| 22 | OpenCodeSession | opencode_sessions | `opencode/opencode_session.py` |
| 23 | OpenCodeInteraction | opencode_interactions | `opencode/opencode_interaction.py` |
| 24 | OpenCodeMessageContent | opencode_message_contents | `opencode/opencode_message_content.py` |
| 25 | OpenCodeAuditTask | opencode_audit_tasks | `opencode/opencode_audit_task.py` |
| 26 | PromptTemplate | prompt_templates | `knowledge/prompt_template.py` |
| 27 | GoVulnerabilityEntry | go_vulnerability_entries | `knowledge/security_kb.py` |
| 28 | GoAttackPatternEntry | go_attack_pattern_entries | `knowledge/security_kb.py` |
| 29 | BusinessKbEntry | business_kb_entries | `knowledge/security_kb.py` |
| 30 | Workflow | workflows | `workflow/workflow.py` |

### 9.2 Alembic 迁移链完整清单

| 序号 | Revision ID | 长度 | 状态 | 描述 |
|------|-------------|------|------|------|
| 1 | `001_initial` | 11 | ✓ | 初始表创建 |
| 2 | `5fc1cc05d5d0` | 12 | ✓ | 用户字段补充 |
| 3 | `006_add_agent_tables` | 20 | ✓ | Agent 核心表 |
| 4 | `007_add_agent_checkpoint_tables` | 32 | ⚠️ | Agent checkpoint 表 |
| 5 | `73889a94a455` | 12 | ✓ | projects.is_active |
| 6 | `add_opencode_fields_to_projects` | 28 | ✓ | OpenCode 字段 |
| 7 | `add_source_type_001` | 16 | ✓ | source_type 字段 |
| 8 | `004_add_prompts_and_rules` | 24 | ✓ | prompts 和 rules 表 |
| 9 | `4c280754c680` | 12 | ✓ | 合并 heads |
| 10 | `007_add_opencode_integration` | 28 | ✓ | OpenCode 集成表 |
| 11 | `008_add_files_with_findings` | 25 | ✓ | files_with_findings 字段 |
| 12 | `8f2355fe393f` | 12 | ✓ | opencode_file_path |
| 13 | `009_add_opencode_sessions` | 23 | ✓ | opencode_sessions 表 |
| 14 | `010_add_opencode_interactions` | 26 | ✓ | opencode_interactions 表 |
| 15 | **`011_add_opencode_message_contents`** | **34** | **❌** | **超长版本号** |
| 16 | `extend_alembic_version` | 21 | ✓ | 扩展版本号长度 |
| 17 | `012_add_security_kb` | 17 | ✓ | 安全知识库表 |
| 18 | `013_add_attack_pattern_versioning` | 32 | ⚠️ | 攻击模式版本管理 |
| 19 | `014_simplify_vulnerability_entry` | 30 | ✓ | 简化漏洞条目 |
| 20 | `015_refactor_attack_pattern_fields` | 31 | ✓ | 重构攻击模式字段 |
| 21 | `016_refactor_attack_pattern_risk` | 31 | ✓ | 攻击模式风险字段 |
| 22 | `a9f1aadfb7ab` | 12 | ✓ | 合并三个 heads |
| 23 | `017_update_skill_category` | 23 | ✓ | Skill 分类更新 |
| 24 | `018_add_agent_category` | 21 | ✓ | Agent 分类字段 |
| 25 | `019_add_project_type` | 19 | ✓ | project_type 字段 |
| 26 | `020_create_workflows` | 20 | ✓ | workflows 表 |
| 27 | `021_add_workflow_fields` | 23 | ✓ | workflow 字段 |
| 28 | `022_add_product_fields` | 21 | ✓ | workflow 产品字段 |
| 29 | `023_extend_version_len` | 19 | ✓ | 扩展版本号长度 |
| 30 | **`024_add_missing_fields`** | **20** | **待创建** | **缺失字段补丁** |

### 9.3 数据库连接配置

#### 9.3.1 异步连接配置（应用运行时）

```python
# 使用 asyncpg 驱动
DATABASE_URL = "postgresql+asyncpg://postgres:postgres@db:5432/deepaudit"

# 创建异步引擎
from sqlalchemy.ext.asyncio import create_async_engine
engine = create_async_engine(DATABASE_URL)
```

#### 9.3.2 同步连接配置（初始化脚本）

```python
# 使用 psycopg2 驱动
DATABASE_URL_SYNC = DATABASE_URL.replace("+asyncpg", "+psycopg2")
# 结果: "postgresql+psycopg2://postgres:postgres@db:5432/deepaudit"

# 创建同步引擎
from sqlalchemy import create_engine
engine = create_engine(DATABASE_URL_SYNC)
```

### 9.4 Docker Compose 环境变量配置

```yaml
# docker-compose.yml

services:
  backend:
    environment:
      - DATABASE_URL=postgresql+asyncpg://postgres:postgres@db:5432/deepaudit
      - REDIS_URL=redis://redis:6379/0
      - INIT_DB_DIRECT=${INIT_DB_DIRECT:-false}  # 新增
```

### 9.5 使用方式总结

#### 9.5.1 全新环境部署

```bash
# 1. 清理数据卷
docker compose down -v

# 2. 设置初始化模式启动
INIT_DB_DIRECT=true docker compose up -d

# 3. 查看初始化日志
docker compose logs backend

# 4. 验证表结构
docker compose exec backend .venv/bin/python scripts/verify_db_schema.py
```

#### 9.5.2 已有环境升级

```bash
# 1. 正常启动（使用 Alembic）
docker compose up -d

# 2. 查看迁移日志
docker compose logs backend | grep alembic

# 3. 验证迁移状态
docker compose exec backend .venv/bin/alembic current
```

---

## 文档修订历史

| 版本 | 日期 | 修订内容 | 作者 |
|------|------|----------|------|
| v1.0 | 2026-05-21 | 初始版本，完整设计方案 | 系统架构分析 |

---

**文档状态**: 设计阶段  
**下一步**: 执行实施计划 Phase 1 - 模型导入修复  
**审批要求**: 架构师审批 + 技术负责人确认