# SDD: OpenCode 消息完成时写入方案

**文档版本**：1.0
**日期**：2026-05-09
**作者**：DeepAudit Team
**设计原则**：只在消息完成时写入，无需更新逻辑

---

## 1. 概述

### 1.1 问题背景

根据 `docs/example/opencode_message_contents.csv` 中的数据，发现以下问题：

1. **reason消息和response消息 text_content 为空**
   - message_index=1 的 reasoning 消息：`text_content` 为空
   - message_index=1 的 response 消息：`text_content` 为空
   - message_index=2 的 response 消息：`text_content` 为空

2. **tool类型消息结构不完整**
   - tool 消息中的 `state.title`、`state.output` 等字段为空
   - 只保存了早期不完整的数据

**根因分析**：
- OpenCode Server 是流式返回消息的
- 早期轮询时，`reasoning`、`text`、`tool` 的内容还不完整
- 代码在第1次保存后，后续因存在性检查而不再更新
- 导致数据库中永远保留的是第1次保存的不完整数据

### 1.2 当前数据流转

```
OpenCode Server (流式返回)
       ↓ (每次轮询获取最新数据)
后台轮询任务 (poll_opencode_result_with_updates)
       ↓ (立即写入，不判断是否完成)
save_part_to_database (存在就跳过，不更新)
       ↓
opencode_message_contents 表 (保存了不完整数据)
       ↓
SSE流 (前端读取展示)
       ↓
前端展示 (数据不完整)
```

### 1.3 目标

✅ **只在完成时写入**：判断消息完成后再写入数据库
✅ **无需更新逻辑**：每个part只写入一次
✅ **解决空内容问题**：确保最终保存的是完整数据
✅ **减少数据库压力**：大幅减少写入次数
✅ **保持数据模型不变**：不修改表结构

---

## 2. 完成判断标准

基于 `docs/example/message.json` 中的消息结构和 `backend/app/schemas/opencode_message.py` 中的类型定义：

### 2.1 各类型判断标准

| Part 类型 | 判断字段 | 完成条件 |
|-----------|---------|---------|
| `TextPart` | `part.time.end` | `time.end` 不为 `None` |
| `ReasoningPart` | `part.time.end` | `time.end` 不为 `None` |
| `ToolPart` | `part.state.time.end` 或 `part.state.status` | `state.time.end` 不为 `None` **或** `state.status == "completed"` |
| `StepStartPart` | (无time字段) | **总是写入** |
| `StepFinishPart` | (无time字段) | **总是写入** |

### 2.2 判断函数设计

**函数签名**：
```python
def is_part_completed(part: Part) -> bool:
    """判断part是否已完成"""
```

**实现逻辑**：
```python
def is_part_completed(part: Part) -> bool:
    # TextPart 和 ReasoningPart: 检查 time.end
    if isinstance(part, (TextPart, ReasoningPart)):
        return part.time is not None and part.time.end is not None
    
    # ToolPart: 检查 state.time.end 或 state.status == "completed"
    elif isinstance(part, ToolPart):
        time_complete = part.state.time is not None and part.state.time.end is not None
        status_complete = part.state.status == "completed"
        return time_complete or status_complete
    
    # StepStartPart 和 StepFinishPart: 总是认为已完成
    else:
        return True
```

---

## 3. 详细设计

### 3.1 修改文件

**主要修改文件**：
- `backend/app/services/opencode/opencode_session_service.py`

### 3.2 代码修改位置

**位置**：`opencode_session_service.py:1259-1350`（`save_part_to_database` 函数和轮询循环）

### 3.3 方案1：在轮询循环中判断（推荐）

**修改位置**：轮询循环中调用 `save_part_to_database` 之前

**变更前**：
```python
for msg in messages[record_index:]:
    # 处理每个 part
    for part in msg.parts:
        await save_part_to_database(
            msg_index=record_index,
            part=part,
            db_session_id=db_session_id,
            audit_task_id=audit_task_id,
            opencode_message_id=message_id,
            role=msg.info.role,
        )
```

**变更后**：
```python
# 新增：完成判断函数
def is_part_completed(part: Part) -> bool:
    if isinstance(part, (TextPart, ReasoningPart)):
        return part.time is not None and part.time.end is not None
    elif isinstance(part, ToolPart):
        time_complete = part.state.time is not None and part.state.time.end is not None
        status_complete = part.state.status == "completed"
        return time_complete or status_complete
    else:
        return True

for msg in messages[record_index:]:
    # 处理每个 part
    for part in msg.parts:
        # 新增：只在完成时写入
        if not is_part_completed(part):
            logger.debug(f"[OpenCode] Part not completed yet, skipping: type={part.type}, id={part.id}")
            continue
        
        await save_part_to_database(
            msg_index=record_index,
            part=part,
            db_session_id=db_session_id,
            audit_task_id=audit_task_id,
            opencode_message_id=message_id,
            role=msg.info.role,
        )
```

### 3.4 方案2：在 save_part_to_database 中判断

**修改位置**：`save_part_to_database` 函数开头

**变更**：
```python
async def save_part_to_database(...):
    # 新增：先判断是否完成
    def is_completed(p: Part) -> bool:
        if isinstance(p, (TextPart, ReasoningPart)):
            return p.time is not None and p.time.end is not None
        elif isinstance(p, ToolPart):
            time_ok = p.state.time is not None and p.state.time.end is not None
            status_ok = p.state.status == "completed"
            return time_ok or status_ok
        else:
            return True
    
    if not is_completed(part):
        logger.debug(f"[OpenCode] Part not completed, skipping save: {part.type}")
        return
    
    # 原有逻辑继续...
```

### 3.5 推荐实施方案

**推荐方案1**：在轮询循环中判断
- 优点：逻辑更清晰，提前过滤，减少函数调用
- 建议：将 `is_part_completed` 作为内部函数或提取为独立函数

### 3.6 导入更新

需要确保导入了必要的类型：
```python
from app.schemas.opencode_message import (
    Part,
    TextPart,
    ReasoningPart,
    ToolPart,
    StepStartPart,
    StepFinishPart,
)
```

---

## 4. 数据流转图

### 4.1 新的数据流程

```
OpenCode Server (流式返回)
       ↓ (每次轮询获取最新数据)
后台轮询任务 (poll_opencode_result_with_updates)
       ↓ (判断是否完成)
is_part_completed(part)?
       ├─ No → 跳过，等待下一轮
       └─ Yes → 继续
       ↓
save_part_to_database (存在就跳过，不更新)
       ↓
opencode_message_contents 表 (保存完整数据)
       ↓
SSE流 (前端读取展示)
       ↓
前端展示 (数据完整)
```

### 4.2 各类型消息时序

**TextPart 时序**：
```
轮询1: text="", time.end=None → 跳过
轮询2: text="...", time.end=None → 跳过
轮询3: text="完整内容", time.end=1234567 → 写入 ✓
```

**ReasoningPart 时序**：
```
轮询1: text="思考中...", time.end=None → 跳过
轮询2: text="完整思考过程", time.end=1234567 → 写入 ✓
```

**ToolPart 时序**：
```
轮询1: state={status:"running", title:None} → 跳过
轮询2: state={status:"completed", title:"结果", time.end=1234567} → 写入 ✓
```

---

## 5. 实施清单

| 阶段 | 文件 | 操作 | 优先级 |
|------|------|------|--------|
| 1 | `opencode_session_service.py` | 添加 `is_part_completed` 函数 | 高 |
| 2 | `opencode_session_service.py` | 在轮询循环中添加完成判断 | 高 |
| 3 | `opencode_session_service.py` | 添加调试日志（可选） | 中 |

---

## 6. 风险评估

| 风险 | 影响 | 概率 | 缓解措施 |
|------|------|------|----------|
| 前端看不到实时进度 | 中 | 高 | 确认业务需求，接受只看最终结果 |
| 判断逻辑错误导致不写入 | 高 | 中 | 加强单元测试，添加日志验证 |
| ToolPart status判断不准确 | 中 | 低 | 同时检查 time.end 和 status，双重保险 |
| 消息永远不完成（异常情况） | 中 | 低 | 设置超时机制，或添加强制写入逻辑 |

---

## 7. 测试计划

### 7.1 测试用例

| ID | 测试场景 | 预期结果 |
|----|---------|---------|
| 1 | TextPart time.end 为 None | 不写入 |
| 2 | TextPart time.end 有值 | 正常写入，内容完整 |
| 3 | ReasoningPart time.end 为 None | 不写入 |
| 4 | ReasoningPart time.end 有值 | 正常写入，内容完整 |
| 5 | ToolPart state.status="running" | 不写入 |
| 6 | ToolPart state.status="completed" | 正常写入，state完整 |
| 7 | ToolPart state.time.end 有值 | 正常写入，state完整 |
| 8 | StepStartPart | 总是写入 |
| 9 | StepFinishPart | 总是写入 |
| 10 | 端到端测试：完整审计流程 | 所有消息完整保存 |

---

## 8. 回退计划

如果新方案出现问题，可以快速回退：

**回退步骤**：
1. 移除轮询循环中的完成判断逻辑
2. 恢复到每次都调用 `save_part_to_database`
3. 移除 `is_part_completed` 函数
4. 重启服务

**回退影响**：
- 恢复到原有的行为（可能保存不完整数据）
- 不影响数据模型和现有数据

---

## 9. 对前端展示的影响

### 9.1 用户体验变化

| 方面 | 之前 | 之后 |
|------|------|------|
| 实时性 | 可以看到中间过程 | 只能看到最终结果 |
| 数据完整性 | 可能有空内容 | 数据总是完整的 |
| 等待体验 | 可以看到进度 | 需要等待完成才能看到内容 |

### 9.2 SSE流行为

SSE流的代码不需要修改，因为：
- 继续从 `opencode_message_contents` 表读取
- 只是数据写入的时机变晚了
- 一旦数据写入，前端就能立即通过SSE看到

---

## 附录 A：消息完成判断示例

### A.1 TextPart 完成示例

```json
{
  "type": "text",
  "text": "找到20个Go文件...",
  "time": {
    "start": 1778227948817,
    "end": 1778227964168   ← 有end值 → 完成
  },
  "id": "prt_xxx",
  "sessionID": "ses_xxx",
  "messageID": "msg_xxx"
}
```

### A.2 TextPart 未完成示例

```json
{
  "type": "text",
  "text": "找到20个Go文件...",
  "time": {
    "start": 1778227948817   ← 没有end → 未完成
  },
  "id": "prt_xxx",
  "sessionID": "ses_xxx",
  "messageID": "msg_xxx"
}
```

### A.3 ToolPart 完成示例（status方式）

```json
{
  "type": "tool",
  "tool": "glob",
  "state": {
    "status": "completed",   ← status=completed → 完成
    "input": {"pattern": "**/*.go"},
    "output": "...",
    "title": "tmp/xxx",
    "time": {
      "start": 1778227890978,
      "end": null
    }
  },
  "id": "prt_xxx"
}
```

### A.4 ToolPart 完成示例（time.end方式）

```json
{
  "type": "tool",
  "tool": "glob",
  "state": {
    "status": "success",
    "input": {"pattern": "**/*.go"},
    "output": "...",
    "title": "tmp/xxx",
    "time": {
      "start": 1778227890978,
      "end": 1778227946352  ← 有end值 → 完成
    }
  },
  "id": "prt_xxx"
}
```

---

## 附录 B：参考数据

### B.1 问题数据示例（来自 docs/example/opencode_message_contents.csv）

| id | session_id | message_index | content_type | text_content |
|----|-----------|--------------|-------------|-------------|
| 10e425... | 8c713f... | 1 | reasoning | **(空)** |
| 6964b2... | 8c713f... | 1 | response | **(空)** |
| a8a36d... | 8c713f... | 1 | tool | `{"state":{"title":null,"output":null}}` |
| 88311b... | de7ee9... | 2 | response | **(空)** |

### B.2 预期修复后的数据

| id | session_id | message_index | content_type | text_content |
|----|-----------|--------------|-------------|-------------|
| 10e425... | 8c713f... | 1 | reasoning | `"用户要求遍历目录..."` |
| 6964b2... | 8c713f... | 1 | response | `"我来帮你审计..."` |
| a8a36d... | 8c713f... | 1 | tool | `{"state":{"title":"tmp/xxx","output":"..."}}` |
| 88311b... | de7ee9... | 2 | response | `"找到20个Go文件..."` |

---

**文档结束**
