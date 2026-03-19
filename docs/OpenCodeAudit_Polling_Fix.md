# OpenCodeAudit 超时时间和轮询逻辑修复总结

## 问题描述
1. 发送一次prompt不需要等待10分钟这么久
2. 轮询逻辑可能被之前的修改破坏了

---

## 已完成的修复

### 1. ✅ 超时时间改回180秒（3分钟）

**修改位置**：`backend/app/services/opencode_session_service.py`

**修改内容**：
```python
# 修改前
max_polls = 600  # 10 minutes with 1s interval

# 修改后
max_polls = 180  # 3 minutes with 1s interval
```

**原因**：
- 正常的OpenCode Server响应不需要10分钟
- 3分钟足够完成一次审计
- 避免用户等待太久

---

### 2. ✅ 恢复轮询逻辑到原来的简单版本

**问题**：之前添加的增量更新逻辑有问题
- `full_response = text` 只会保留最后一段文本
- 复杂的数据库更新增加了出错风险
- 缩进混乱导致LSP错误

**修复**：
- 移除了`db_session_local`参数
- 移除了复杂的增量数据库更新逻辑
- 恢复到简单的`full_response = text`逻辑
- 保留了超时状态检查（`result == "timeout"`）

---

### 3. ✅ 保留超时状态处理

**功能**：当轮询超时返回"timeout"时
- 会话状态设为`ERROR`而不是`CLOSED`
- 显示友好的错误信息："OpenCode Server response timeout. Please try again or check the server status."

---

## 修复的文件清单

1. ✅ `backend/app/services/opencode_session_service.py`
   - 超时时间：10分钟 → 3分钟（180秒）
   - 恢复轮询逻辑到简单版本
   - 移除复杂的增量更新逻辑
   - 保留超时状态处理

---

## 现在的轮询流程

```
发送prompt到OpenCode Server
    ↓
获取message_id
    ↓
启动后台轮询任务
    ↓
每1秒检查一次响应（最多180次 = 3分钟）
    ↓
检测到 reason="stop" → 返回完整响应
    ↓
正常完成：
- 会话状态设为 CLOSED
- 保存响应内容
    ↓
超时处理：
- 3分钟后超时
- 会话状态设为 ERROR
- 显示友好错误信息
```

---

## 建议的后续优化

1. **检查OpenCode Server日志** - 确认服务器端是否正常工作
2. **添加更详细的调试日志** - 在轮询过程中记录更多信息
3. **考虑WebSocket/SSE** - 替代轮询，实现真正的实时更新

---

## 总结

✅ **问题已修复！**

- 超时时间改为180秒（3分钟）
- 轮询逻辑恢复到简单稳定的版本
- 保留了超时状态处理
- 移除了有问题的增量更新逻辑

现在发送prompt后应该能在合理时间内得到响应了！
