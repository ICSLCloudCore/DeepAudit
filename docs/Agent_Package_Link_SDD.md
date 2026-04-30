# Agent 包链接集成 - 软件设计文档 (SDD)

**版本**: 1.0  
**日期**: 2026-04-30  
**作者**: DeepAudit Team

---

## 1. 概述

### 1.1 项目背景

DeepAudit 平台已支持 Agent 包的上传和管理功能。现在需要在创建 OpenCode 审计任务时，允许用户选择（非必选）已上传的 Agent 包，并将 Agent 包的内容通过软链接的方式集成到项目的 `.opencode` 目录中供 OpenCode 使用，审计结束后清理这些软链接。

### 1.2 功能目标

1. 在 `CreateTaskDialog` 组件中新增 Agent 包选择器（非必选）
2. 当用户选择 Agent 包时，在项目目录下创建 `.opencode` 目录
3. 通过软链接（Linux 系统）将 Agent 包内容链接到 `.opencode` 目录
4. 审计任务结束后清理 `.opencode` 目录及其软链接
5. 减少存储空间使用（使用软链接而非复制）

### 1.3 范围

本文档涵盖：
- 前端 UI 修改（CreateTaskDialog 组件）
- 后端 API Schema 更新
- 后端服务层新增软链接创建和清理功能
- OpenCode 审计任务流程集成
- 错误处理和日志记录

不涉及：
- Agent 包的上传和管理功能（已存在）
- Windows 系统支持（仅 Linux）

---

## 2. 系统架构

### 2.1 工作流程图

```
用户选择项目
    ↓
点击审计按钮
    ↓
选择 OpenCode 审计
    ↓
[可选] 选择 Agent 包
    ↓
确认创建任务
    ↓
后端接收请求
    ↓
验证 Agent 包（如果有选择）
    ↓
准备项目目录（git clone / zip 解压）
    ↓
[如果有选择 Agent 包]
    - 创建 .opencode 目录
    - 遍历 Agent 包解压目录
    - 创建软链接
    ↓
启动 OpenCode server
    ↓
执行审计任务
    ↓
审计任务结束
    ↓
[如果有选择 Agent 包]
    - 清理 .opencode 目录及其软链接
```

### 2.2 目录结构

**Agent 包存储路径**:
```
uploads/
└── agent_packages/
    ├── zips/              # 原始压缩包
    └── extracted/         # 解压内容
        └── {package-name}/
            ├── AGENTS.md
            ├── agents/
            │   └── *.md
            └── skills/
                └── {skill-name}/
                    └── SKILL.md
```

**项目临时目录（审计时）**:
```
/tmp/{session-id}/ 或 C:\temp\{session-id}\
├── [项目源代码文件]
└── .opencode/          # [新增] Agent 包软链接目录
    ├── AGENTS.md      # 软链接
    ├── agents/        # 软链接
    │   └── *.md
    └── skills/        # 软链接
        └── {skill-name}/
            └── SKILL.md
```

---

## 3. 前端实现

### 3.1 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 更新 | `frontend/src/components/audit/CreateTaskDialog.tsx` | 新增 Agent 包选择器 |
| 更新 | `frontend/src/shared/api/opencode.ts` | 更新类型定义和 API 调用 |

### 3.2 TypeScript 类型更新

**文件**: `frontend/src/shared/api/opencode.ts`

更新 `StartAuditWithPromptRequest` 接口：

```typescript
export interface StartAuditWithPromptRequest {
    prompt_template_id?: string;
    prompt_content?: string;
    variables?: Record<string, string>;
    agent_package_id?: string;  // 新增：选择的 Agent 包 ID
}
```

### 3.3 CreateTaskDialog 组件更新

**文件**: `frontend/src/components/audit/CreateTaskDialog.tsx`

#### 3.3.1 新增状态和 API 调用

```tsx
const [selectedAgentPackageId, setSelectedAgentPackageId] = useState<string | null>(null);
const [agentPackages, setAgentPackages] = useState<AgentPackage[]>([]);
const [agentPackagesLoading, setAgentPackagesLoading] = useState(false);

// 加载 Agent 包列表
const loadAgentPackages = async () => {
    try {
        setAgentPackagesLoading(true);
        const response = await opencodeApi.listAgentPackages({ page_size: 100 });
        setAgentPackages(response.items);
    } catch (error) {
        console.error("Failed to load agent packages:", error);
    } finally {
        setAgentPackagesLoading(false);
    }
};

// 在组件挂载时加载
useEffect(() => {
    if (auditType === 'opencode') {
        loadAgentPackages();
    }
}, [auditType]);
```

#### 3.3.2 新增 Agent 包选择器 UI

在 OpenCode 配置区域添加 Agent 包选择器：

```tsx
{auditType === 'opencode' && (
    <div className="space-y-4">
        {/* 现有的 prompt 配置 */}
        
        {/* 新增：Agent 包选择器 */}
        <div className="space-y-2">
            <label className="text-sm font-medium text-foreground flex items-center gap-1">
                <Package2 className="w-4 h-4 text-primary" />
                Agent 包（可选）
            </label>
            <p className="text-xs text-muted-foreground">
                选择已上传的 Agent 包，将通过软链接集成到审计环境
            </p>
            {agentPackagesLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="loading-spinner w-4 h-4" />
                    加载中...
                </div>
            ) : (
                <Select
                    value={selectedAgentPackageId || ""}
                    onValueChange={(value) => setSelectedAgentPackageId(value || null)}
                >
                    <SelectTrigger className="cyber-input">
                        <SelectValue placeholder="不使用 Agent 包" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="">不使用 Agent 包</SelectItem>
                        {agentPackages.map((pkg) => (
                            <SelectItem key={pkg.id} value={pkg.id}>
                                <div className="flex items-center justify-between w-full">
                                    <span>{pkg.name}</span>
                                    <span className="text-xs text-muted-foreground ml-2">
                                        v{pkg.version} • {pkg.agents_count} Agents • {pkg.skills_count} Skills
                                    </span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            )}
        </div>
    </div>
)}
```

#### 3.3.3 更新创建任务调用

```tsx
const handleCreateTask = async () => {
    // 现有的验证逻辑
    
    try {
        setIsSubmitting(true);
        
        const requestData: StartAuditWithPromptRequest = {
            prompt_template_id: selectedPromptId || undefined,
            prompt_content: customPrompt || undefined,
            variables: promptVariables,
            agent_package_id: selectedAgentPackageId || undefined,  // 新增
        };
        
        // 调用 API
        const result = await opencodeApi.startAuditWithPrompt(projectId!, requestData);
        
        // 现有的成功处理逻辑
    } catch (error) {
        // 现有的错误处理逻辑
    } finally {
        setIsSubmitting(false);
    }
};
```

---

## 4. 后端实现

### 4.1 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 更新 | `backend/app/api/v1/endpoints/opencode/audit_tasks.py` | 更新请求 Schema |
| 更新 | `backend/app/services/opencode/opencode_session_service.py` | 新增软链接创建和清理功能 |

### 4.2 API Schema 更新

**文件**: `backend/app/api/v1/endpoints/opencode/audit_tasks.py`

更新 `CreateOpenCodeAuditTask` 或 `StartAuditWithPromptRequest` Schema：

```python
from pydantic import BaseModel, Field
from typing import Optional

class StartAuditWithPromptRequest(BaseModel):
    prompt_template_id: Optional[str] = Field(None, description="提示词模板 ID")
    prompt_content: Optional[str] = Field(None, description="自定义提示词内容")
    variables: Optional[Dict[str, str]] = Field(None, description="提示词变量")
    agent_package_id: Optional[str] = Field(None, description="Agent 包 ID（可选）")  # 新增
```

### 4.3 OpenCodeSessionService 新增功能

**文件**: `backend/app/services/opencode/opencode_session_service.py`

#### 4.3.1 新增导入

```python
import os
from pathlib import Path
from typing import Optional
from app.models import Agent
from app.core.config import settings
```

#### 4.3.2 新增 link_agent_package_to_project 方法

```python
def link_agent_package_to_project(project_dir: str, agent_package: Agent) -> None:
    """
    将 Agent 包内容通过软链接链接到项目目录的 .opencode 文件夹
    
    Args:
        project_dir: 项目目录路径
        agent_package: Agent 包对象，需包含 extracted_dir_path
    """
    logger.info(f"[OpenCode] Linking agent package to project: {agent_package.name}")
    
    # 验证 Agent 包解压目录存在
    if not agent_package.extracted_dir_path:
        raise ValueError("Agent package has no extracted directory path")
    
    agent_source_dir = Path(agent_package.extracted_dir_path)
    if not agent_source_dir.exists():
        raise FileNotFoundError(f"Agent package directory not found: {agent_source_dir}")
    
    # 创建 .opencode 目录（如果已存在则先清理）
    opencode_dir = Path(project_dir) / ".opencode"
    
    if opencode_dir.exists():
        logger.info(f"[OpenCode] Cleaning existing .opencode directory: {opencode_dir}")
        # 安全删除：检查是否都是软链接
        for item in opencode_dir.iterdir():
            if item.is_symlink():
                item.unlink()
            elif item.is_dir():
                # 递归删除目录（谨慎，只删除我们创建的）
                import shutil
                shutil.rmtree(item)
            else:
                item.unlink()
        # 删除空目录
        if opencode_dir.exists():
            opencode_dir.rmdir()
    
    # 创建新的 .opencode 目录
    opencode_dir.mkdir(parents=True, exist_ok=True)
    logger.info(f"[OpenCode] Created .opencode directory: {opencode_dir}")
    
    # 遍历 Agent 包解压目录的内容，创建软链接
    linked_count = 0
    for item in agent_source_dir.iterdir():
        target_path = opencode_dir / item.name
        source_path = item.absolute()
        
        # 创建软链接
        try:
            os.symlink(source_path, target_path)
            linked_count += 1
            logger.info(f"[OpenCode] Created symlink: {target_path} -> {source_path}")
        except OSError as e:
            logger.error(f"[OpenCode] Failed to create symlink for {item.name}: {e}")
            raise
    
    logger.info(f"[OpenCode] Successfully linked {linked_count} items from agent package")
```

#### 4.3.3 新增 cleanup_agent_package_links 方法

```python
def cleanup_agent_package_links(project_dir: str) -> None:
    """
    清理项目目录中的 .opencode 文件夹及其软链接
    
    Args:
        project_dir: 项目目录路径
    """
    opencode_dir = Path(project_dir) / ".opencode"
    
    if not opencode_dir.exists():
        logger.info(f"[OpenCode] .opencode directory not found, skipping cleanup")
        return
    
    logger.info(f"[OpenCode] Cleaning up .opencode directory: {opencode_dir}")
    
    try:
        import shutil
        shutil.rmtree(opencode_dir)
        logger.info(f"[OpenCode] Successfully cleaned up .opencode directory")
    except Exception as e:
        logger.error(f"[OpenCode] Failed to cleanup .opencode directory: {e}")
        # 不抛出异常，继续执行后续流程
```

#### 4.3.4 更新 start_opencode_server 方法

在项目目录准备好后、启动 OpenCode server 前调用链接功能：

```python
async def start_opencode_server(...):
    # ... 现有的项目目录准备代码 ...
    
    # 新增：链接 Agent 包（如果有）
    agent_package = kwargs.get('agent_package')
    if agent_package:
        link_agent_package_to_project(project_path, agent_package)
    
    # ... 现有的启动 OpenCode server 代码 ...
```

#### 4.3.5 更新 _background_poll_result 方法

在审计任务结束时调用清理功能：

```python
async def _background_poll_result(...):
    try:
        # ... 现有的轮询和处理逻辑 ...
        
    finally:
        # 新增：清理 Agent 包链接
        if project_path:
            cleanup_agent_package_links(project_path)
        
        # ... 现有的清理逻辑 ...
```

### 4.4 API 端点更新

**文件**: `backend/app/api/v1/endpoints/opencode/audit_tasks.py`

更新创建审计任务的端点，处理 agent_package_id：

```python
from sqlalchemy import select
from app.models import Agent

@router.post("/projects/{project_id}/audit-with-prompt")
async def start_audit_with_prompt(
    project_id: str,
    request: StartAuditWithPromptRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # ... 现有的验证和逻辑 ...
    
    # 新增：验证 Agent 包（如果有提供）
    agent_package = None
    if request.agent_package_id:
        result = await db.execute(
            select(Agent).where(Agent.id == request.agent_package_id)
        )
        agent_package = result.scalar_one_or_none()
        
        if not agent_package:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Agent package not found: {request.agent_package_id}"
            )
        
        # 验证权限（仅创建者或公开的可使用）
        if not agent_package.is_public and agent_package.created_by != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You don't have permission to use this agent package"
            )
        
        if not agent_package.extracted_dir_path:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Agent package has no extracted directory"
            )
        
        logger.info(f"[OpenCode] Will use agent package: {agent_package.name}")
    
    # ... 现有的调用 service 代码 ...
    # 传递 agent_package 给 service
    
    # ... 现有的响应返回 ...
```

---

## 5. 数据模型（无变更）

本功能不需要新增或修改数据库模型，使用已有的 `Agent` 模型。

---

## 6. 错误处理

### 6.1 错误场景

| 场景 | 错误处理 |
|------|---------|
| Agent 包不存在 | 返回 404 Not Found |
| 无权限使用 Agent 包 | 返回 403 Forbidden |
| Agent 包无解压目录 | 返回 400 Bad Request |
| 软链接创建失败 | 记录错误日志，终止任务，返回 500 |
| 清理失败 | 记录错误日志，不影响任务完成 |

### 6.2 日志记录

关键操作都需要记录日志：
- Agent 包选择信息
- 软链接创建开始和结束
- 每个软链接的创建
- 清理操作开始和结束
- 任何错误信息

---

## 7. 测试计划

### 7.1 功能测试

- [ ] 前端：Agent 包选择器正常显示和加载
- [ ] 前端：可以正常选择和取消选择 Agent 包
- [ ] 前端：选择 Agent 包后任务创建正常
- [ ] 后端：验证 Agent 包存在性和权限正常
- [ ] 后端：软链接创建功能正常
- [ ] 后端：软链接清理功能正常
- [ ] 端到端：选择 Agent 包的审计任务完整流程正常
- [ ] 端到端：不选择 Agent 包的审计任务不受影响

### 7.2 安全测试

- [ ] 验证私有 Agent 包权限控制正常
- [ ] 验证不存在的 Agent 包处理正常
- [ ] 验证软链接创建的安全性（路径遍历防护）

---

## 8. 部署说明

### 8.1 部署步骤

1. **前端部署**:
   - 更新 `CreateTaskDialog.tsx`
   - 更新 `opencode.ts` 类型定义
   - 构建和部署前端

2. **后端部署**:
   - 更新 `audit_tasks.py` API Schema
   - 更新 `opencode_session_service.py` 服务逻辑
   - 重启后端服务

### 8.2 回滚计划

如果出现问题，回滚到前一版本的代码即可，无需数据库变更。

---

## 9. 附录

### 9.1 参考文档

- `docs/Agent_Package_Management_SDD.md` - Agent 包管理功能设计文档
- `backend/app/models/opencode/agent.py` - Agent 模型定义
- `backend/app/api/v1/endpoints/opencode/agents.py` - Agent 包 API

### 9.2 注意事项

1. **平台限制**: 本功能仅在 Linux 系统上测试和支持
2. **软链接 vs 硬链接**: 使用软链接（symlink）而非硬链接，因为硬链接不能跨文件系统且不支持目录
3. **清理时机**: 清理操作在 finally 块中执行，确保即使任务失败也会清理
4. **并发安全**: 每个审计任务使用独立的临时目录，不会相互影响

---

**文档结束**
