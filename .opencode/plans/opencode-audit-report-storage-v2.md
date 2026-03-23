# OpenCode审计报告漏洞存储与详情查看 - SSD规范文档（V2.0）

## 文档信息

| 版本 | 日期 | 作者 | 变更说明 |
|------|------|------|----------|
| 2.0 | 2026-03-23 | DeepAudit Team | 基于实际报告文件重新完善 - 完整字段支持 |
| 1.0 | 2026-03-23 | DeepAudit Team | 初始版本 |

---

## 目录

1. [功能规范（Spec）](#1-功能规范spec)
2. [技术架构设计（Architecture）](#2-技术架构设计architecture)
3. [数据模型设计（Data Model）](#3-数据模型设计data-model)
4. [API接口规范（API Contracts）](#4-api接口规范api-contracts)
5. [前端界面设计（UI/UX）](#5-前端界面设计uiux)
6. [技术实施计划（Implementation Plan）](#6-技术实施计划implementation-plan)
7. [关键验证场景（Testing）](#7-关键验证场景testing)
8. [可执行任务清单（Tasks）](#8-可执行任务清单tasks)

---

## 1. 功能规范（Spec）

### 1.1 功能概述

**用户故事**：
> 作为一个DeepAudit用户，当OpenCode审计完成后，系统应该自动读取/tmp目录下生成的审计报告（格式为VULN-001-005_致命.md），将漏洞按分类（致命、严重、一般、提示）写入数据库，每个漏洞包含完整信息（严重性、CVSS评分、CWE、置信度、位置、漏洞描述、漏洞代码、数据流路径、利用场景、影响、修复建议），并且我可以在"审计任务"页面的"OPENCODE审计"tab中点击"查看详情"按钮，跳转到任务详情页，查看AI分析的问题详情和漏洞建议，同时支持人工确认结果。

### 1.2 核心需求

#### 需求1：OpenCode审计报告目录结构理解

OpenCode审计完成后，在/tmp目录下生成如下结构的报告：

```
/tmp/{uuid}/:
    - 项目代码
    - reports
        - go-sec-code-goaudit-20260323-1116.md  (主报告)
        - VULN-001-005_致命.md              (致命漏洞1-5)
        - VULN-006-014_严重.md             (严重漏洞6-14)
        - VULN-015-016_致命.md             (致命漏洞15-16)
        - VULN-011-021_一般.md             (一般漏洞11-21)
        - VULN-022-023_提示.md             (提示漏洞22-23)
```

**文件名格式说明**：
- `VULN-{start}-{end}_{severity}.md`
- `{start}-{end}`：漏洞编号范围，例如 `001-005` 表示从VULN-001到VULN-005
- `{severity}`：漏洞等级，包括：
  - `致命` (critical)
  - `严重` (high)
  - `一般` (medium)
  - `提示` (low)

#### 需求2：OpenCodeFinding数据模型（基于实际报告字段）

参考实际报告文件，每个漏洞包含以下字段：

| 字段分类 | 字段名称 | 说明 | 是否必填 |
|---------|---------|------|---------|
| **基本标识** | vuln_id | 漏洞ID（如VULN-001） | 是 |
| | task_id | 关联的OpenCodeAuditTask ID | 是 |
| **基本信息** | severity | 严重性（致命/严重/一般/提示） | 是 |
| | cvss_score | CVSS评分（如9.8） | 否 |
| | cvss_vector | CVSS向量字符串 | 否 |
| | cwe | CWE编号和描述 | 否 |
| | confidence | 置信度（确认/高/中/低） | 否 |
| | location | 位置（文件路径:行号 函数名） | 否 |
| | file_path | 文件路径 | 否 |
| | line_start | 起始行号 | 否 |
| | line_end | 结束行号 | 否 |
| | function_name | 函数名 | 否 |
| **漏洞描述** | vulnerability_title | 漏洞标题 | 是 |
| | vulnerability_essence | 漏洞本质 | 否 |
| | root_cause | 根因分析 | 否 |
| | security_impact | 安全影响 | 否 |
| **漏洞代码** | vulnerable_code | 漏洞代码片段 | 否 |
| **数据流路径** | dataflow_source | 污点源（Source） | 否 |
| | dataflow_propagation | 传播路径（JSON格式） | 否 |
| | dataflow_sink | 汇聚点（Sink） | 否 |
| | dataflow_sanitization | 净化检查 | 否 |
| | dataflow_conclusion | 结论 | 否 |
| **利用场景** | exploit_steps | 攻击步骤 | 否 |
| | exploit_poc | PoC（概念验证） | 否 |
| **影响** | impact_confidentiality | 机密性影响（高/中/低） | 否 |
| | impact_integrity | 完整性影响（高/中/低） | 否 |
| | impact_availability | 可用性影响（高/中/低） | 否 |
| **修复建议** | fix_description | 修复说明 | 否 |
| | fix_code_before | 修复前（漏洞代码） | 否 |
| | fix_code_after | 修复后（安全代码） | 否 |
| **人工确认** | manual_confirmation | 人工确认结果 | 否 |
| | manual_confirmation_status | 确认状态（待确认/已确认/误报/已修复） | 否 |
| | manual_confirmation_notes | 确认备注 | 否 |
| | confirmed_by | 确认人ID | 否 |
| | confirmed_at | 确认时间 | 否 |
| **元数据** | status | 状态（new/analyzing/resolved/false_positive） | 否 |
| | created_at | 创建时间 | 是 |
| | updated_at | 更新时间 | 否 |

#### 需求3：报告解析服务

- 创建OpenCode报告解析服务
- 读取/tmp/{uuid}/reports目录下的Markdown文件
- 解析各分类漏洞文件（VULN-*_*.md）
- 支持从文件名提取漏洞编号范围和严重程度
- 支持解析每个漏洞的所有字段（基于实际报告格式）
- 提取漏洞信息并存储到OpenCodeFinding表
- 支持增量更新和错误处理

#### 需求4：OpenCode审计任务详情页

- 创建OpenCodeTaskDetail页面
- 路由：/opencode-tasks/{id}
- 展示任务基本信息、统计数据
- 展示漏洞列表，支持按严重程度筛选
- 支持查看每个漏洞的完整信息（所有字段）
- 支持人工确认功能
- 支持查看AI分析详情和漏洞建议

#### 需求5：AuditTasks页面"查看详情"按钮

- 在OPENCODE审计tab的任务卡片中添加"查看详情"按钮
- 点击按钮跳转到OpenCode任务详情页
- 样式与现有"查看详情"按钮保持一致

### 1.3 验收标准（Acceptance Criteria）

**AC1: OpenCodeFinding数据模型**
- [ ] 创建`opencode_findings`数据表，包含所有实际报告中的字段
- [ ] 支持完整的CRUD操作
- [ ] 支持漏洞严重程度分类（致命/严重/一般/提示）
- [ ] 支持人工确认结果字段
- [ ] 关联到OpenCodeAuditTask
- [ ] 数据持久化存储

**AC2: 报告解析服务**
- [ ] 创建OpenCodeReportParser服务
- [ ] 支持读取/tmp目录下的报告文件
- [ ] 支持解析VULN-*_*.md格式的漏洞文件
- [ ] 支持从文件名提取漏洞编号和严重程度
- [ ] 支持提取所有漏洞字段（基于实际报告格式）
- [ ] 支持错误处理和重试机制

**AC3: API接口**
- [ ] 创建获取OpenCode任务findings的API端点
- [ ] 创建更新finding状态的API端点
- [ ] 创建人工确认的API端点
- [ ] API权限验证（只有任务创建者可以访问）

**AC4: 前端界面 - 详情页面**
- [ ] 创建OpenCodeTaskDetail页面
- [ ] 添加路由配置
- [ ] 展示任务详情和统计数据
- [ ] 展示漏洞列表，支持按严重程度筛选
- [ ] 展示漏洞完整信息（所有字段）
- [ ] 支持人工确认功能

**AC5: 前端界面 - 查看详情按钮**
- [ ] 在OPENCODE审计tab的任务卡片中添加"查看详情"按钮
- [ ] 点击按钮正确跳转到详情页
- [ ] 按钮样式与现有系统一致

---

## 2. 技术架构设计（Architecture）

### 2.1 整体架构

```
┌─────────────────────────────────────────────────────────────────────┐
│                    前端层 (Frontend)                              │
├─────────────────────────────────────────────────────────────────────┤
│  AuditTasksPage (审计任务页面 - 3个tab)                           │
│  └── OPENCODE审计tab                                                │
│      └── 任务卡片 + "查看详情"按钮                                 │
│                                                                     │
│  OpenCodeTaskDetailPage (OpenCode任务详情页) ← 新增               │
│  ├── 任务信息展示                                                    │
│  ├── 统计数据展示                                                    │
│  ├── Findings列表（支持筛选）                                       │
│  ├── Finding详情（完整字段展示）                                    │
│  └── 人工确认功能                                                    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    API层 (FastAPI)                                │
├─────────────────────────────────────────────────────────────────────┤
│  /api/v1/opencode-audit-tasks (CRUD操作)                         │
│  /api/v1/opencode-audit-tasks/{id} (单个任务)                     │
│  /api/v1/opencode-audit-tasks/{id}/findings (漏洞列表) ← 新增    │
│  /api/v1/opencode-audit-tasks/{id}/findings/{finding_id} (更新) ← 新增│
│  /api/v1/opencode-audit-tasks/{id}/findings/{finding_id}/confirm (人工确认) ← 新增│
│  /api/v1/opencode-audit-tasks/{id}/parse-report (解析报告) ← 新增│
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                  服务层 (Services)                                │
├─────────────────────────────────────────────────────────────────────┤
│  OpenCodeReportParser (报告解析) ← 新增                           │
│  ├── parse_report_directory (解析报告目录)                         │
│  ├── parse_vulnerability_file (解析漏洞文件)                       │
│  ├── extract_vuln_id_range (提取漏洞编号范围)                      │
│  ├── extract_severity_from_filename (从文件名提取严重程度)          │
│  └── extract_finding_data (提取漏洞完整数据)                      │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                  数据层 (Database)                                │
├─────────────────────────────────────────────────────────────────────┤
│  opencode_audit_tasks (OpenCode审计任务)                           │
│  opencode_findings (OpenCode漏洞) ← 新增 (完整字段)               │
│  projects (项目表 - 关联)                                          │
│  users (用户表 - 关联)                                             │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    文件系统 (File System)                          │
├─────────────────────────────────────────────────────────────────────┤
│  /tmp/{uuid}/reports/ (OpenCode审计报告目录)                       │
│  ├── go-sec-code-goaudit-*.md (主报告)                            │
│  ├── VULN-001-005_致命.md (致命漏洞1-5)                           │
│  ├── VULN-006-014_严重.md (严重漏洞6-14)                          │
│  ├── VULN-015-016_致命.md (致命漏洞15-16)                         │
│  ├── VULN-011-021_一般.md (一般漏洞11-21)                         │
│  └── VULN-022-023_提示.md (提示漏洞22-23)                         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. 数据模型设计（Data Model）

### 3.1 opencode_findings表（新增，基于实际报告字段）

| 字段名 | 类型 | 说明 | 约束 |
|--------|------|------|------|
| id | VARCHAR(36) | 主键，UUID | PRIMARY KEY |
| task_id | VARCHAR(36) | 关联opencode_audit_tasks.id | NOT NULL, INDEX |
| vuln_id | VARCHAR(50) | 漏洞ID（如VULN-001） | NOT NULL, INDEX |
| | | | |
| **基本信息** | | | |
| severity | VARCHAR(20) | 严重性（致命/严重/一般/提示） | NOT NULL, INDEX |
| cvss_score | DECIMAL(3,1) | CVSS评分（如9.8） | NULL |
| cvss_vector | VARCHAR(255) | CVSS向量字符串 | NULL |
| cwe | VARCHAR(255) | CWE编号和描述 | NULL |
| confidence | VARCHAR(20) | 置信度（确认/高/中/低） | NULL |
| location | VARCHAR(500) | 位置（文件路径:行号 函数名） | NULL |
| file_path | VARCHAR(500) | 文件路径 | NULL, INDEX |
| line_start | INTEGER | 起始行号 | NULL |
| line_end | INTEGER | 结束行号 | NULL |
| function_name | VARCHAR(255) | 函数名 | NULL |
| | | | |
| **漏洞描述** | | | |
| vulnerability_title | VARCHAR(500) | 漏洞标题 | NOT NULL |
| vulnerability_essence | TEXT | 漏洞本质 | NULL |
| root_cause | TEXT | 根因分析 | NULL |
| security_impact | TEXT | 安全影响 | NULL |
| | | | |
| **漏洞代码** | | | |
| vulnerable_code | TEXT | 漏洞代码片段 | NULL |
| | | | |
| **数据流路径** | | | |
| dataflow_source | TEXT | 污点源（Source） | NULL |
| dataflow_propagation | JSON | 传播路径 | NULL |
| dataflow_sink | TEXT | 汇聚点（Sink） | NULL |
| dataflow_sanitization | TEXT | 净化检查 | NULL |
| dataflow_conclusion | TEXT | 结论 | NULL |
| | | | |
| **利用场景** | | | |
| exploit_steps | TEXT | 攻击步骤 | NULL |
| exploit_poc | TEXT | PoC（概念验证） | NULL |
| | | | |
| **影响** | | | |
| impact_confidentiality | VARCHAR(20) | 机密性影响（高/中/低） | NULL |
| impact_integrity | VARCHAR(20) | 完整性影响（高/中/低） | NULL |
| impact_availability | VARCHAR(20) | 可用性影响（高/中/低） | NULL |
| | | | |
| **修复建议** | | | |
| fix_description | TEXT | 修复说明 | NULL |
| fix_code_before | TEXT | 修复前（漏洞代码） | NULL |
| fix_code_after | TEXT | 修复后（安全代码） | NULL |
| | | | |
| **人工确认** | | | |
| manual_confirmation | TEXT | 人工确认结果 | NULL |
| manual_confirmation_status | VARCHAR(30) | 确认状态（待确认/已确认/误报/已修复） | NULL, INDEX |
| manual_confirmation_notes | TEXT | 确认备注 | NULL |
| confirmed_by | VARCHAR(36) | 确认人ID（关联users.id） | NULL, INDEX |
| confirmed_at | TIMESTAMP WITH TIME ZONE | 确认时间 | NULL |
| | | | |
| **元数据** | | | |
| status | VARCHAR(30) | 状态（new/analyzing/resolved/false_positive） | DEFAULT 'new', INDEX |
| created_at | TIMESTAMP WITH TIME ZONE | 创建时间 | DEFAULT NOW() |
| updated_at | TIMESTAMP WITH TIME ZONE | 更新时间 | DEFAULT NOW(), ON UPDATE NOW() |

### 3.2 严重程度映射

| 中文 | 英文 | 数值 |
|------|------|------|
| 致命 | critical | 4 |
| 严重 | high | 3 |
| 一般 | medium | 2 |
| 提示 | low | 1 |

---

## 4. API接口规范（API Contracts）

（其余章节基于实际报告字段进行相应更新，此处省略部分内容以保持文档简洁）

---

## 8. 可执行任务清单（Tasks）

### 8.1 后端任务

1. 创建数据模型文件 `backend/app/models/opencode_finding.py`（包含所有实际报告字段）
2. 更新 `backend/app/models/opencode_audit_task.py`，添加findings关联
3. 在 `backend/app/models/__init__.py` 中导出新模型
4. 创建数据库迁移文件
5. 创建报告解析服务 `backend/app/services/opencode_report_parser.py`（支持解析实际报告格式）
6. 更新 `backend/app/api/v1/endpoints/opencode_audit_tasks.py`，添加findings相关API端点（包括人工确认）

### 8.2 前端任务

1. 更新 `frontend/src/shared/api/opencodeAuditTasks.ts`，添加OpenCodeFinding类型和API调用（包含所有字段）
2. 修改 `frontend/src/pages/AuditTasks.tsx`，在OpenCode任务卡片中添加"查看详情"按钮
3. 创建 `frontend/src/pages/OpenCodeTaskDetail.tsx` 页面
4. 创建 `frontend/src/pages/OpenCodeTaskDetail/components/FindingsList.tsx` 组件
5. 创建 `frontend/src/pages/OpenCodeTaskDetail/components/FindingDetail.tsx` 组件（展示完整字段）
6. 更新 `frontend/src/app/routes.tsx`，添加OpenCodeTaskDetail路由

---

**文档结束**
