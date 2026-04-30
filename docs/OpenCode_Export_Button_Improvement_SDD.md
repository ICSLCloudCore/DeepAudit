# OpenCode 导出按钮功能改进 - 软件设计文档 (SDD)

**版本**: 1.1  
**日期**: 2026-04-30  
**作者**: DeepAudit Team

---

## 1. 概述

### 1.1 项目背景

当前 DeepAudit 平台的 OpenCode 审计页面中，导出 Markdown 和 JSON 报告的按钮仅在审计任务状态为 `completed`（已完成）时才显示。但在实际使用场景中，用户可能希望在任务进行中或未完成时也能尝试导出报告，查看是否已有部分报告生成。此外，当找不到报告文件时，当前实现直接返回 404 错误，用户体验不佳。

### 1.2 功能目标

1. 移除所有按钮的状态限制（包括"查看问题"、"导出 Markdown"、"导出 JSON"），只要有 `auditTask` 数据就显示
2. 当后端找不到报告文件时，返回包含"无报告"信息的默认内容，而非 404 错误
3. 改善用户体验，让用户在任务进行中也能尝试查看问题或导出

### 1.3 范围

本文档涵盖：
- 前端 OpenCodeAudit 页面的按钮显示逻辑修改
- 后端 Markdown 和 JSON 报告导出接口的错误处理修改
- 无报告时的默认内容生成

不涉及：
- 报告文件的生成逻辑（保持现有逻辑不变）
- 其他类型报告的导出（如 HTML、PDF）

---

## 2. 系统架构

### 2.1 当前工作流程

```
用户打开 OpenCode 审计页面
    ↓
检查 auditTask 是否存在且 status === 'completed'
    ↓
[如果是] 显示导出按钮
    ↓
用户点击导出按钮
    ↓
前端调用后端导出 API
    ↓
后端查找报告文件
    ↓
[找到文件] 返回文件 | [未找到] 返回 404 错误
```

### 2.2 改进后工作流程

```
用户打开 OpenCode 审计页面
    ↓
检查 auditTask 是否存在
    ↓
[如果是] 显示导出按钮（无论状态如何）
    ↓
用户点击导出按钮
    ↓
前端调用后端导出 API
    ↓
后端查找报告文件
    ↓
[找到文件] 返回文件 | [未找到] 返回默认"无报告"内容
```

---

## 3. 前端实现

### 3.1 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 更新 | `frontend/src/pages/OpenCodeAudit/index.tsx` | 移除按钮显示的状态限制 |

### 3.2 OpenCodeAudit 组件更新

**文件**: `frontend/src/pages/OpenCodeAudit/index.tsx`

#### 3.2.1 修改按钮显示条件

**原代码**（第 389 行）：
```tsx
{auditTask?.status === 'completed' && (
    <div className="flex-shrink-0 p-4 border-t border-border space-y-3">
        {/* 查看问题按钮 */}
        <Button
            className="w-full gap-2"
            onClick={() => {
                if (taskId) {
                    navigate(`/tasks/opencode/${taskId}/vulnerabilities`);
                }
            }}
        >
            <FileText className="w-4 h-4" />
            查看问题
        </Button>
        
        {/* 导出 Markdown 按钮 */}
        <Button
            className="w-full gap-2"
            variant="secondary"
            onClick={handleExportMD}
            disabled={exportingMD}
        >
            {exportingMD ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <FileText className="w-4 h-4" />
            )}
            导出 Markdown 报告
        </Button>
        
        {/* 导出 JSON 按钮 */}
        <Button
            className="w-full gap-2"
            variant="secondary"
            onClick={handleExportJSON}
            disabled={exportingJSON}
        >
            {exportingJSON ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <FileJson className="w-4 h-4" />
            )}
            导出 JSON 报告
        </Button>
    </div>
)}
```

**修改后**：
```tsx
{auditTask && (
    <div className="flex-shrink-0 p-4 border-t border-border space-y-3">
        {/* 查看问题按钮 - 始终显示 */}
        <Button
            className="w-full gap-2"
            onClick={() => {
                if (taskId) {
                    navigate(`/tasks/opencode/${taskId}/vulnerabilities`);
                }
            }}
        >
            <FileText className="w-4 h-4" />
            查看问题
        </Button>
        
        {/* 导出 Markdown 按钮 - 始终显示 */}
        <Button
            className="w-full gap-2"
            variant="secondary"
            onClick={handleExportMD}
            disabled={exportingMD}
        >
            {exportingMD ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <FileText className="w-4 h-4" />
            )}
            导出 Markdown 报告
        </Button>
        
        {/* 导出 JSON 按钮 - 始终显示 */}
        <Button
            className="w-full gap-2"
            variant="secondary"
            onClick={handleExportJSON}
            disabled={exportingJSON}
        >
            {exportingJSON ? (
                <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
                <FileJson className="w-4 h-4" />
            )}
            导出 JSON 报告
        </Button>
    </div>
)}
```

**说明**：
- "查看问题"按钮移除状态限制，只要有 auditTask 就显示
- "导出 Markdown 报告"和"导出 JSON 报告"按钮移除状态限制，只要有 auditTask 就显示

---

## 4. 后端实现

### 4.1 文件变更清单

| 操作 | 文件路径 | 说明 |
|------|---------|------|
| 更新 | `backend/app/api/v1/endpoints/opencode/audit_tasks.py` | 修改 Markdown 和 JSON 导出接口 |

### 4.2 Markdown 报告导出接口更新

**文件**: `backend/app/api/v1/endpoints/opencode/audit_tasks.py`

#### 4.2.1 新增导入

在文件顶部新增导入：
```python
import tempfile
from pathlib import Path
```

#### 4.2.2 修改 export_report_md 函数

**原代码**（第 898-900 行）：
```python
if not report_files:
    logger.error(f"[OpenCode Report Export] No MD report files found!")
    raise HTTPException(status_code=404, detail="未找到 Markdown 报告文件")
```

**修改后**：
```python
if not report_files:
    logger.warning(f"[OpenCode Report Export] No MD report files found, returning default content")
    
    # 创建临时 Markdown 文件，返回"无报告"内容
    with tempfile.NamedTemporaryFile(mode='w', suffix='.md', delete=False) as f:
        f.write("# OpenCode 审计报告\n\n")
        f.write("## 状态\n\n")
        f.write("暂无报告生成，请等待审计任务完成后重试。\n\n")
        f.write("## 任务信息\n\n")
        f.write(f"- 任务 ID: {task_id}\n")
        f.write(f"- 任务状态: {task.status}\n")
        f.write(f"- 创建时间: {task.created_at}\n")
        if task.started_at:
            f.write(f"- 开始时间: {task.started_at}\n")
        temp_md_path = f.name
    
    try:
        filename = f"opencode-audit-report-{task_id[:8]}-no-report.md"
        logger.info(f"[OpenCode Report Export] Serving default MD content: {filename}")
        logger.info(f"[OpenCode Report Export] ========== EXPORT MD REPORT END ==========")
        return FileResponse(path=temp_md_path, media_type="text/markdown", filename=filename)
    finally:
        # 延迟删除临时文件（FileResponse 读取后再删除）
        import asyncio
        async def delete_temp_file():
            await asyncio.sleep(1)  # 等待 1 秒确保文件已被读取
            try:
                Path(temp_md_path).unlink(missing_ok=True)
                logger.info(f"[OpenCode Report Export] Deleted temporary MD file: {temp_md_path}")
            except Exception as e:
                logger.error(f"[OpenCode Report Export] Failed to delete temporary MD file: {e}")
        
        # 在后台运行删除任务
        asyncio.create_task(delete_temp_file())
```

### 4.3 JSON 报告导出接口更新

**文件**: `backend/app/api/v1/endpoints/opencode/audit_tasks.py`

#### 4.3.1 修改 export_report_json 函数

**原代码**（第 966-968 行）：
```python
if not report_files:
    logger.error(f"[OpenCode Report Export] No JSON report files found!")
    raise HTTPException(status_code=404, detail="未找到 JSON 报告文件")
```

**修改后**：
```python
if not report_files:
    logger.warning(f"[OpenCode Report Export] No JSON report files found, returning default content")
    
    # 创建临时 JSON 文件，返回"无报告"内容
    import json
    default_json = {
        "metadata": {
            "export_date": datetime.utcnow().isoformat(),
            "version": "1.0.0",
            "format": "JSON",
            "status": "no_report_available"
        },
        "task": {
            "id": task_id,
            "status": task.status,
            "created_at": task.created_at.isoformat() if task.created_at else None,
            "started_at": task.started_at.isoformat() if task.started_at else None,
            "project_id": task.project_id
        },
        "message": "暂无报告生成，请等待审计任务完成后重试。",
        "issues": [],
        "summary": {
            "total_issues": 0,
            "critical": 0,
            "high": 0,
            "medium": 0,
            "low": 0
        }
    }
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.json', delete=False) as f:
        json.dump(default_json, f, indent=2, ensure_ascii=False)
        temp_json_path = f.name
    
    try:
        filename = f"opencode-audit-report-{task_id[:8]}-no-report.json"
        logger.info(f"[OpenCode Report Export] Serving default JSON content: {filename}")
        logger.info(f"[OpenCode Report Export] ========== EXPORT JSON REPORT END ==========")
        return FileResponse(path=temp_json_path, media_type="application/json", filename=filename)
    finally:
        # 延迟删除临时文件
        import asyncio
        async def delete_temp_file():
            await asyncio.sleep(1)
            try:
                Path(temp_json_path).unlink(missing_ok=True)
                logger.info(f"[OpenCode Report Export] Deleted temporary JSON file: {temp_json_path}")
            except Exception as e:
                logger.error(f"[OpenCode Report Export] Failed to delete temporary JSON file: {e}")
        
        asyncio.create_task(delete_temp_file())
```

#### 4.3.2 新增 datetime 导入（如果需要）

确保文件顶部有 `datetime` 导入：
```python
from datetime import datetime
```

---

## 5. 数据模型（无变更）

本功能不需要新增或修改数据库模型。

---

## 6. 错误处理

### 6.1 错误场景

| 场景 | 原处理 | 新处理 |
|------|--------|--------|
| 任务未完成 | 不显示导出按钮 | 显示导出按钮，用户可点击 |
| 找不到报告文件 | 返回 404 错误 | 返回默认"无报告"内容 |
| 临时文件创建失败 | 不适用 | 记录错误日志，返回 500 |
| 临时文件删除失败 | 不适用 | 记录错误日志，不影响响应 |

### 6.2 日志记录

关键操作都需要记录日志：
- 当找不到报告文件时，记录 WARNING 级别日志
- 临时文件的创建和删除
- 默认内容的返回

---

## 7. 测试计划

### 7.1 功能测试

- [ ] 前端：任务进行中时所有按钮正常显示
- [ ] 前端：任务失败时所有按钮正常显示
- [ ] 前端：任务取消时所有按钮正常显示
- [ ] 前端：任务完成时所有按钮正常显示（保持原有功能）
- [ ] 后端：找不到 Markdown 文件时返回默认内容
- [ ] 后端：找不到 JSON 文件时返回默认内容
- [ ] 后端：找到文件时正常返回文件（保持原有功能）
- [ ] 端到端：任务进行中点击导出按钮，收到默认内容
- [ ] 端到端：任务完成后点击导出按钮，收到正常报告
- [ ] 端到端：任务进行中点击"查看问题"按钮，能正常跳转

### 7.2 用户体验测试

- [ ] 验证"无报告"内容清晰易读
- [ ] 验证导出的默认文件格式正确
- [ ] 验证临时文件正确清理（磁盘空间不泄漏）

---

## 8. 部署说明

### 8.1 部署步骤

1. **前端部署**:
   - 更新 `frontend/src/pages/OpenCodeAudit/index.tsx`
   - 构建和部署前端

2. **后端部署**:
   - 更新 `backend/app/api/v1/endpoints/opencode/audit_tasks.py`
   - 重启后端服务

### 8.2 回滚计划

如果出现问题，回滚到前一版本的代码即可，无需数据库变更。

---

## 9. 附录

### 9.1 默认内容示例

#### Markdown 默认内容
```markdown
# OpenCode 审计报告

## 状态

暂无报告生成，请等待审计任务完成后重试。

## 任务信息

- 任务 ID: abc12345-...
- 任务状态: running
- 创建时间: 2026-04-30T10:00:00
- 开始时间: 2026-04-30T10:01:00
```

#### JSON 默认内容
```json
{
  "metadata": {
    "export_date": "2026-04-30T10:30:00.000000",
    "version": "1.0.0",
    "format": "JSON",
    "status": "no_report_available"
  },
  "task": {
    "id": "abc12345-def6-7890-ghij-klmnopqrstuv",
    "status": "running",
    "created_at": "2026-04-30T10:00:00",
    "started_at": "2026-04-30T10:01:00",
    "project_id": "proj12345-..."
  },
  "message": "暂无报告生成，请等待审计任务完成后重试。",
  "issues": [],
  "summary": {
    "total_issues": 0,
    "critical": 0,
    "high": 0,
    "medium": 0,
    "low": 0
  }
}
```

### 9.2 参考文档

- `frontend/src/pages/OpenCodeAudit/index.tsx` - OpenCode 审计页面组件
- `backend/app/api/v1/endpoints/opencode/audit_tasks.py` - OpenCode 审计任务 API
- `frontend/src/features/reports/services/reportExport.ts` - 报告导出服务

### 9.3 注意事项

1. **临时文件清理**: 使用 `asyncio.create_task()` 在后台延迟删除临时文件，确保文件已被 `FileResponse` 读取
2. **"查看问题"按钮**: 该按钮现在也始终显示，后端漏洞列表 API 已支持在任务未完成时返回空列表
3. **日志级别**: 找不到报告文件时使用 WARNING 级别而非 ERROR，因为这是预期的场景而非错误
4. **向后兼容**: 找到报告文件时的行为保持不变，确保现有功能不受影响

---

**文档结束**
