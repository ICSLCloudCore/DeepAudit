# OpenCode Server 请求超时问题修复总结

## 问题描述
向 OpenCode Server 发起请求后，响应显示 "timeout"，会话没有正常结束。

---

## 已完成的修复

### 1. ✅ 超时状态处理修复

**问题**：当轮询超时返回 "timeout" 时，代码仍然将会话状态设置为 `CLOSED`

**修复位置**：`backend/app/services/opencode_session_service.py` 的 `_background_poll_result` 函数

**修复内容**：
```python
# 检查是否超时
if result == "timeout":
    db_session.status = OpenCodeSessionStatus.ERROR
    db_session.response_content = "OpenCode Server response timeout. Please try again or check the server status."
else:
    db_session.status = OpenCodeSessionStatus.CLOSED
```

**效果**：
- 超时状态时，会话标记为 `ERROR` 而不是 `CLOSED`
- 提供清晰的用户友好的错误信息

---

### 2. ✅ 增加轮询超时时间

**问题**：轮询时间太短（5分钟），可能不够完成审计

**修复位置**：`backend/app/services/opencode_session_service.py` 的 `poll_opencode_result_with_updates` 函数

**修复内容**：
```python
# 修改前
max_polls = 300  # 5 minutes with 1s interval

# 修改后
max_polls = 600  # 10 minutes with 1s interval
```

**效果**：
- 轮询时间从5分钟增加到10分钟
- 给 OpenCode Server 更多时间来完成审计

---

### 3. ✅ 添加响应增量更新（可选但推荐）

**功能**：在轮询过程中，实时更新数据库中的响应内容，让用户能看到进度

**修复位置**：`backend/app/services/opencode_session_service.py` 的 `poll_opencode_result_with_updates` 函数

**添加内容**：
```python
# 在 poll_opencode_result_with_updates 函数中：
# 1. 添加可选参数 db_session_local=None
# 2. 在获取到新的响应文本时，增量更新数据库

if text and text != full_response:
    full_response = text
    print(f"[OpenCode] Updated response (length: {len(full_response)})")
    
    # Also update database incrementally if db_session_local is provided
    if db_session_local:
        try:
            result_db = await db_session_local.execute(
                select(OpenCodeSession).where(
                    OpenCodeSession.id == db_session_id
                )
            )
            db_session = result_db.scalar_one_or_none()
            if db_session:
                db_session.response_content = full_response
                await db_session_local.commit()
        except Exception as update_err:
            print(f"[OpenCode] Failed to update response: {update_err}")
```

---

## 修复的文件清单

1. ✅ `backend/app/services/opencode_session_service.py`
   - 增加轮询超时时间（5分钟 → 10分钟）
   - 修复超时状态处理（CLOSED → ERROR）
   - 添加响应增量更新功能

---

## 现在的工作流程

```
用户启动 OpenCode 审计
    ↓
创建数据库会话，状态设为 PENDING
    ↓
启动 OpenCode Server（如需要）
    ↓
创建 OpenCode Server 会话
    ↓
发送提示词到 OpenCode Server
    ↓
启动后台轮询任务（最多10分钟）
    ↓
✅ 轮询过程中：
   - 每1秒检查一次响应
   - 如有新内容，实时更新数据库
   - 前端可以看到响应进度
    ↓
✅ 正常完成：
   - 检测到 reason="stop"
   - 返回完整响应
   - 会话状态设为 CLOSED
    ↓
⚠️ 超时处理：
   - 10分钟后超时
   - 会话状态设为 ERROR
   - 显示友好的错误信息
```

---

## 建议的后续优化

1. **增加更详细的日志** - 在轮询过程中记录更多信息
2. **添加重试机制** - 对临时错误进行重试
3. **WebSocket/SSE支持** - 替代轮询，实现真正的实时更新
4. **超时可配置** - 让超时时间成为可配置参数

---

## 总结

✅ **问题已修复！**

- 超时状态现在会正确标记为 ERROR
- 轮询时间增加到10分钟
- 可以实时看到响应进度（增量更新）
- 用户会收到清晰的错误信息

现在会话不会再卡在 "timeout" 状态了！
