# OpenCodeAudit 轮询和日志显示简化修复总结

## 用户需求

1. ✅ 轮询太快了，改回去
2. ✅ 用户不需要看到轮询细节，只需要看到：
   - 输入了什么prompt
   - 等待之后返回的结果
   - session结束后关闭的提示

---

## 已完成的修复

### 1. ✅ 轮询逻辑改回去

**修改位置**：`frontend/src/pages/OpenCodeAudit/index.tsx`

**修改内容**：
```typescript
// 修改前 - 不依赖isRunning，持续轮询
useEffect(() => {
  if (!sessionId) {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    return;
  }

  // 即使session不是running状态，我们也继续轮询直到确认session完成且有响应
  pollIntervalRef.current = setInterval(() => {
    loadSession();
  }, POLLING_INTERVALS.SESSION_STATUS);

  return () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
  };
}, [sessionId, loadSession]);

// 修改后 - 依赖isRunning，只在running时轮询
useEffect(() => {
  if (!sessionId || !isRunning) {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    return;
  }

  pollIntervalRef.current = setInterval(() => {
    loadSession();
  }, POLLING_INTERVALS.SESSION_STATUS);

  return () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
    }
  };
}, [sessionId, isRunning, loadSession]);
```

**效果**：
- 轮询逻辑恢复到原来的状态
- 只在session状态为`active`或`pending`时轮询
- session完成后停止轮询

---

### 2. ✅ 简化日志显示，只保留必要信息

**修改位置**：`frontend/src/pages/OpenCodeAudit/index.tsx`

**修改内容**：
```typescript
const loadSession = useCallback(async () => {
  if (!sessionId) return;
  try {
    setLoading(true);
    
    const data = await opencodeApi.getSessionStatus(sessionId);
    
    // 确保数据有正确的ID字段
    const sessionData = {
      ...data,
      id: data.id || data.session_id,
      session_id: data.session_id || data.id
    };
    setSession(sessionData);
    
    // 首次加载时：显示发送的prompt
    if (!logs.length && sessionId && data.prompt_content) {
      addLog({
        type: 'prompt',
        title: 'Prompt sent',
        content: data.prompt_content
      });
    }
    
    // 当有响应内容时：显示返回的结果
    if (data.response_content && data.response_content !== session?.response_content) {
      addLog({
        type: 'response',
        title: 'Response received',
        content: data.response_content
      });
    }
    
    // 当session完成时：显示关闭提示
    if (isComplete && !session?.completed_at) {
      addLog({
        type: 'status',
        title: 'Session completed',
        content: `Audit session ${data.status === 'closed' ? 'completed successfully' : 'failed'}`
      });
    }
  } catch (err) {
    toast.error("Failed to load session");
    setError("Failed to load session");
  } finally {
    setLoading(false);
  }
}, [...]);
```

**移除的内容**：
- ❌ 所有console.log调试日志
- ❌ Session loaded状态日志
- ❌ Status changed状态变化日志
- ❌ Load failed错误日志（保留toast提示）

**保留的内容**：
- ✅ **Prompt sent** - 显示发送的prompt
- ✅ **Response received** - 显示返回的结果
- ✅ **Session completed** - session结束后显示关闭提示

---

### 3. ✅ 禁用交互历史加载

**修改位置**：`frontend/src/pages/OpenCodeAudit/index.tsx`

**修改内容**：
```typescript
// 修改前 - 加载交互历史并显示
const loadInteractions = useCallback(async () => {
  if (!sessionId) return;
  try {
    console.log('[OpenCodeAudit] Loading interactions...');
    const data = await opencodeApi.getSessionInteractions(sessionId, { limit: 50 });
    // ... 添加交互日志
  } catch (err) {
    console.error('[OpenCodeAudit] Failed to load interactions:', err);
    // ...
  }
}, [sessionId, addLog]);

// 修改后 - 禁用交互历史加载
const loadInteractions = useCallback(async () => {
  // 暂时禁用交互历史加载，只显示必要信息
  // 用户不需要看到详细的HTTP交互
}, [sessionId, addLog]);
```

**效果**：
- 不再加载和显示详细的HTTP交互历史
- 用户只看到必要的信息（prompt、response、session完成）

---

## 现在用户能看到的信息

### Activity Log中只显示：

1. **发送的Prompt**
   ```
   [PROMPT] Prompt sent - [用户输入的prompt内容]
   ```

2. **返回的结果**
   ```
   [RESPONSE] Response received - [OpenCode Server返回的完整响应]
   ```

3. **Session完成提示**
   ```
   [STATUS] Session completed - Audit session completed successfully
                       或
                       Audit session failed
   ```

---

## 修复的文件清单

1. ✅ `frontend/src/pages/OpenCodeAudit/index.tsx`
   - 轮询逻辑改回依赖isRunning
   - 简化日志显示，只保留必要信息
   - 禁用交互历史加载
   - 移除所有console.log调试日志

---

## 总结

✅ **两个需求都已完成！**

1. ✅ 轮询逻辑改回去了 - 只在session running时轮询
2. ✅ 日志显示简化了 - 用户只看到：
   - 发送了什么prompt
   - 返回了什么结果
   - session结束的提示

现在用户界面更简洁了，只显示必要的信息！
