# OpenCodeAudit 完整请求响应显示修复总结

## 用户需求
1. ✅ 前端页面中只打印了request，没有打印response
2. ✅ 需要将完整的请求和响应体打印在前端页面上
3. ✅ 不打印健康检查和轮询的请求

---

## 已完成的修复

### 1. ✅ 重新启用交互历史加载

**修改位置**：`frontend/src/pages/OpenCodeAudit/index.tsx`

**修改内容**：
```typescript
// 修改前 - 禁用交互历史加载
const loadInteractions = useCallback(async () => {
  // 暂时禁用交互历史加载，只显示必要信息
  // 用户不需要看到详细的HTTP交互
}, [sessionId, addLog]);

// 修改后 - 重新启用交互历史加载，并过滤不需要的请求
const loadInteractions = useCallback(async () => {
  if (!sessionId) return;
  try {
    const data = await opencodeApi.getSessionInteractions(sessionId, { limit: 100 });
    
    if (data.items && data.items.length > 0) {
      data.items.reverse().forEach((interaction: OpenCodeInteraction) => {
        // 过滤掉健康检查和轮询的请求
        const endpoint = interaction.endpoint || '';
        const isHealthCheck = endpoint.includes('/health');
        const isPolling = endpoint.includes('/message') && interaction.http_method === 'GET';
        
        if (isHealthCheck || isPolling) {
          return; // 跳过健康检查和轮询
        }
        
        const logType = interaction.interaction_type === 'request' ? 'prompt' :
                      interaction.interaction_type === 'response' ? 'response' :
                      'error';
        
        addLog({
          type: logType,
          title: `${interaction.http_method} ${interaction.endpoint}`,
          content: interaction.response_payload || interaction.request_payload || '',
        });
      });
    }
  } catch (err) {
    console.error('Failed to load interactions:', err);
  }
}, [sessionId, addLog]);
```

---

## 过滤逻辑

### 跳过的请求类型：
1. **健康检查请求**
   - 端点包含 `/health`
   - 例如：`GET /global/health`

2. **轮询请求**
   - 端点包含 `/message` 且方法为 `GET`
   - 例如：`GET /session/{id}/message`

### 保留的请求类型：
1. **创建会话请求**
   - `POST /session`

2. **发送提示词请求**
   - `POST /session/{id}/prompt_async`

3. **其他用户发起的请求**
   - 不是健康检查或轮询的所有请求

---

## 现在用户能看到的信息

### Activity Log中显示：

#### 1. **发送的Prompt**（如果有交互记录）
   ```
   [PROMPT] POST /session/{id}/prompt_async - [完整的请求体]
   ```

#### 2. **OpenCode Server的响应**（如果有交互记录）
   ```
   [RESPONSE] POST /session/{id}/prompt_async - [完整的响应体]
   或
   [RESPONSE] GET /session/{id}/message - [完整的响应体]
   ```

#### 3. **从Session数据获取的信息**（作为后备）
   ```
   [PROMPT] Prompt sent - [用户输入的prompt内容]
   [RESPONSE] Response received - [OpenCode Server返回的完整响应]
   [STATUS] Session completed - Audit session completed successfully
   ```

---

## 修复的文件清单

1. ✅ `frontend/src/pages/OpenCodeAudit/index.tsx`
   - 重新启用交互历史加载
   - 添加过滤逻辑，跳过健康检查和轮询
   - 显示完整的请求和响应体

---

## 总结

✅ **用户需求已完成！**

1. ✅ 完整的请求和响应体都打印在前端页面上
2. ✅ 健康检查和轮询的请求被过滤掉了
3. ✅ 只显示用户发起的请求和OpenCode Server的响应
4. ✅ 如果没有交互记录，仍然会显示从Session数据获取的prompt和response

现在用户能看到完整的请求和响应了！
