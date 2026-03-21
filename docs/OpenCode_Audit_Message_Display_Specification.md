# OpenCode 审计消息展示规范

**版本**: 1.0  
**日期**: 2026-03-21  
**状态**: 草案

## 1. 问题分析

### 1.1 当前问题
1. **前端展示不完整**：仅显示简单的 prompt/response 文本，未展示完整的交互流程
2. **数据提取不充分**：后端仅提取 text 类型内容，忽略 reasoning、tool、step-start、step-finish 等重要类型
3. **信息展示单调**：缺少对不同类型内容的可视化区分（颜色、字体、图标等）
4. **实时更新问题**：每次新增消息都会完全刷新，影响用户体验

### 1.2 需求目标
- 提取所有有用字段并在前端用不同颜色/字体展示
- 实现增量更新而非全量刷新
- 输出完整的全部流程交互信息

## 2. 数据结构解析

### 2.1 顶层消息结构
```json
{
  "info": { ... },
  "parts": [ ... ]
}
```

### 2.2 Info 结构
| 字段 | 类型 | 说明 |
|------|------|------|
| `role` | string | 角色：user/assistant |
| `time.created` | number | 创建时间戳（毫秒） |
| `time.completed` | number | 完成时间戳（毫秒） |
| `id` | string | 消息ID |
| `sessionID` | string | 会话ID |
| `parentID` | string | 父消息ID（assistant消息） |
| `modelID` | string | 模型ID |
| `providerID` | string | 提供商ID |
| `agent` | string | Agent类型 |
| `cost` | number | 成本 |
| `tokens.total` | number | 总token数 |
| `tokens.input` | number | 输入token数 |
| `tokens.output` | number | 输出token数 |
| `tokens.reasoning` | number | 推理token数 |
| `tokens.cache.read` | number | 缓存读取token数 |
| `tokens.cache.write` | number | 缓存写入token数 |
| `finish` | string | 结束原因 |

### 2.3 Part 类型及结构

#### 2.3.1 Text 类型
```json
{
  "type": "text",
  "text": "文本内容",
  "id": "part_id",
  "sessionID": "session_id",
  "messageID": "message_id",
  "time": {
    "start": 1234567890,
    "end": 1234567890
  }
}
```

#### 2.3.2 Reasoning 类型
```json
{
  "type": "reasoning",
  "text": "推理内容",
  "id": "part_id",
  "sessionID": "session_id",
  "messageID": "message_id",
  "time": {
    "start": 1234567890,
    "end": 1234567890
  }
}
```

#### 2.3.3 Tool 类型
```json
{
  "type": "tool",
  "callID": "call_id",
  "tool": "tool_name",
  "id": "part_id",
  "sessionID": "session_id",
  "messageID": "message_id",
  "state": {
    "status": "completed",
    "input": { ... },
    "output": "输出内容",
    "title": "工具标题",
    "metadata": { ... },
    "time": {
      "start": 1234567890,
      "end": 1234567890
    }
  }
}
```

#### 2.3.4 Step-Start 类型
```json
{
  "type": "step-start",
  "id": "part_id",
  "sessionID": "session_id",
  "messageID": "message_id"
}
```

#### 2.3.5 Step-Finish 类型
```json
{
  "type": "step-finish",
  "reason": "结束原因",
  "cost": 0,
  "tokens": { ... },
  "id": "part_id",
  "sessionID": "session_id",
  "messageID": "message_id"
}
```

## 3. 解决方案设计

### 3.1 整体架构
```
┌─────────────────────────────────────────────────────────┐
│                        OpenCode Server                    │
└────────────────────────────┬────────────────────────────┘
                             │ 原始数据
                             ▼
┌─────────────────────────────────────────────────────────┐
│              后端数据提取与处理层                          │
│  - 完整提取所有字段                                      │
│  - 数据验证与标准化                                      │
│  - 增量更新机制                                          │
└────────────────────────────┬────────────────────────────┘
                             │ 结构化数据
                             ▼
┌─────────────────────────────────────────────────────────┐
│                    API 层                                 │
│  - WebSocket 流式传输                                    │
│  - REST API 获取历史数据                                 │
└────────────────────────────┬────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────┐
│              前端数据解析与渲染层                          │
│  - 类型解析器                                            │
│  - 组件渲染                                              │
│  - 状态管理                                              │
└─────────────────────────────────────────────────────────┘
```

### 3.2 核心设计原则
1. **完整性**：保留所有原始数据字段
2. **可扩展性**：支持未来新增的 part 类型
3. **性能优化**：增量更新，避免全量重渲染
4. **用户体验**：清晰的视觉区分，可折叠/展开
5. **类型安全**：完整的 TypeScript 和 Pydantic 类型定义

## 4. 后端实现规范

### 4.1 数据模型

#### 4.1.1 Pydantic Schema 定义
```python
# backend/app/schemas/opencode_message.py
from typing import Optional, Dict, Any, List, Union
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum

class PartType(str, Enum):
    TEXT = "text"
    REASONING = "reasoning"
    TOOL = "tool"
    STEP_START = "step-start"
    STEP_FINISH = "step-finish"

class TimeInfo(BaseModel):
    start: Optional[int] = None
    end: Optional[int] = None

class TokenInfo(BaseModel):
    total: int
    input: int
    output: int
    reasoning: int
    cache: Dict[str, int] = Field(default_factory=dict)

class MessageInfo(BaseModel):
    role: str
    time: Dict[str, int]
    id: str
    sessionID: str
    parentID: Optional[str] = None
    modelID: Optional[str] = None
    providerID: Optional[str] = None
    agent: Optional[str] = None
    cost: Optional[float] = None
    tokens: Optional[TokenInfo] = None
    finish: Optional[str] = None
    summary: Optional[Dict[str, Any]] = None
    path: Optional[Dict[str, str]] = None

class BasePart(BaseModel):
    type: PartType
    id: str
    sessionID: str
    messageID: str

class TextPart(BasePart):
    type: PartType = PartType.TEXT
    text: str
    time: Optional[TimeInfo] = None

class ReasoningPart(BasePart):
    type: PartType = PartType.REASONING
    text: str
    time: Optional[TimeInfo] = None

class ToolState(BaseModel):
    status: str
    input: Dict[str, Any]
    output: Any
    title: str
    metadata: Optional[Dict[str, Any]] = None
    time: Optional[TimeInfo] = None

class ToolPart(BasePart):
    type: PartType = PartType.TOOL
    callID: str
    tool: str
    state: ToolState

class StepStartPart(BasePart):
    type: PartType = PartType.STEP_START

class StepFinishPart(BasePart):
    type: PartType = PartType.STEP_FINISH
    reason: str
    cost: Optional[float] = None
    tokens: Optional[TokenInfo] = None

Part = Union[TextPart, ReasoningPart, ToolPart, StepStartPart, StepFinishPart]

class OpenCodeMessage(BaseModel):
    info: MessageInfo
    parts: List[Part]

# WebSocket 事件类型
class MessageEventType(str, Enum):
    MESSAGE_ADDED = "message_added"
    MESSAGE_UPDATED = "message_updated"
    PART_ADDED = "part_added"
    PART_UPDATED = "part_updated"
    SESSION_COMPLETED = "session_completed"

class MessageEvent(BaseModel):
    type: MessageEventType
    data: Union[OpenCodeMessage, Part, Dict[str, Any]]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
```

### 4.2 API 设计

#### 4.2.1 WebSocket 接口
**端点**: `ws://{host}/api/v1/opencode/sessions/{session_id}/stream`

**消息格式**:
```json
{
  "type": "message_added",
  "data": { /* OpenCodeMessage */ },
  "timestamp": "2026-03-21T10:00:00Z"
}
```

#### 4.2.2 REST API
**获取会话消息列表**:
```
GET /api/v1/opencode/sessions/{session_id}/messages
Query Parameters:
  - limit: int (default: 50)
  - offset: int (default: 0)
```

**获取单条消息**:
```
GET /api/v1/opencode/sessions/{session_id}/messages/{message_id}
```

### 4.3 数据提取服务
```python
# backend/app/services/opencode_message_parser.py
import json
from typing import List, Dict, Any
from app.schemas.opencode_message import (
    OpenCodeMessage, Part, TextPart, ReasoningPart, 
    ToolPart, StepStartPart, StepFinishPart, PartType
)

class OpenCodeMessageParser:
    """OpenCode 消息解析器"""
    
    @staticmethod
    def parse_raw_message(raw_data: Dict[str, Any]) -> OpenCodeMessage:
        """解析原始消息数据"""
        info = raw_data.get("info", {})
        raw_parts = raw_data.get("parts", [])
        
        parts = [OpenCodeMessageParser.parse_part(part) for part in raw_parts]
        
        return OpenCodeMessage(
            info=info,
            parts=parts
        )
    
    @staticmethod
    def parse_part(raw_part: Dict[str, Any]) -> Part:
        """解析单个 part"""
        part_type = raw_part.get("type")
        
        if part_type == PartType.TEXT:
            return TextPart(**raw_part)
        elif part_type == PartType.REASONING:
            return ReasoningPart(**raw_part)
        elif part_type == PartType.TOOL:
            return ToolPart(**raw_part)
        elif part_type == PartType.STEP_START:
            return StepStartPart(**raw_part)
        elif part_type == PartType.STEP_FINISH:
            return StepFinishPart(**raw_part)
        else:
            raise ValueError(f"Unknown part type: {part_type}")
    
    @staticmethod
    def parse_message_array(raw_array: List[Dict[str, Any]]) -> List[OpenCodeMessage]:
        """解析消息数组"""
        return [OpenCodeMessageParser.parse_raw_message(msg) for msg in raw_array]
```

## 5. 前端实现规范

### 5.1 TypeScript 类型定义
```typescript
// frontend/src/pages/OpenCodeAudit/messageTypes.ts
export enum PartType {
  TEXT = 'text',
  REASONING = 'reasoning',
  TOOL = 'tool',
  STEP_START = 'step-start',
  STEP_FINISH = 'step-finish',
}

export interface TimeInfo {
  start?: number;
  end?: number;
}

export interface TokenInfo {
  total: number;
  input: number;
  output: number;
  reasoning: number;
  cache: Record<string, number>;
}

export interface MessageInfo {
  role: 'user' | 'assistant';
  time: {
    created: number;
    completed?: number;
  };
  id: string;
  sessionID: string;
  parentID?: string;
  modelID?: string;
  providerID?: string;
  agent?: string;
  cost?: number;
  tokens?: TokenInfo;
  finish?: string;
  summary?: Record<string, any>;
  path?: {
    cwd: string;
    root: string;
  };
}

export interface BasePart {
  type: PartType;
  id: string;
  sessionID: string;
  messageID: string;
}

export interface TextPart extends BasePart {
  type: PartType.TEXT;
  text: string;
  time?: TimeInfo;
}

export interface ReasoningPart extends BasePart {
  type: PartType.REASONING;
  text: string;
  time?: TimeInfo;
}

export interface ToolState {
  status: string;
  input: Record<string, any>;
  output: any;
  title: string;
  metadata?: Record<string, any>;
  time?: TimeInfo;
}

export interface ToolPart extends BasePart {
  type: PartType.TOOL;
  callID: string;
  tool: string;
  state: ToolState;
}

export interface StepStartPart extends BasePart {
  type: PartType.STEP_START;
}

export interface StepFinishPart extends BasePart {
  type: PartType.STEP_FINISH;
  reason: string;
  cost?: number;
  tokens?: TokenInfo;
}

export type Part = TextPart | ReasoningPart | ToolPart | StepStartPart | StepFinishPart;

export interface OpenCodeMessage {
  info: MessageInfo;
  parts: Part[];
}

export enum MessageEventType {
  MESSAGE_ADDED = 'message_added',
  MESSAGE_UPDATED = 'message_updated',
  PART_ADDED = 'part_added',
  PART_UPDATED = 'part_updated',
  SESSION_COMPLETED = 'session_completed',
}

export interface MessageEvent {
  type: MessageEventType;
  data: OpenCodeMessage | Part | Record<string, any>;
  timestamp: string;
}
```

### 5.2 类型守卫与解析器
```typescript
// frontend/src/pages/OpenCodeAudit/messageUtils.ts
import {
  Part,
  PartType,
  TextPart,
  ReasoningPart,
  ToolPart,
  StepStartPart,
  StepFinishPart,
  OpenCodeMessage,
} from './messageTypes';

export function isTextPart(part: Part): part is TextPart {
  return part.type === PartType.TEXT;
}

export function isReasoningPart(part: Part): part is ReasoningPart {
  return part.type === PartType.REASONING;
}

export function isToolPart(part: Part): part is ToolPart {
  return part.type === PartType.TOOL;
}

export function isStepStartPart(part: Part): part is StepStartPart {
  return part.type === PartType.STEP_START;
}

export function isStepFinishPart(part: Part): part is StepFinishPart {
  return part.type === PartType.STEP_FINISH;
}

export function parseRawMessage(raw: any): OpenCodeMessage {
  return raw as OpenCodeMessage;
}

export function formatDuration(start: number, end: number): string {
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}
```

### 5.3 组件设计

#### 5.3.1 消息列表组件
```tsx
// components/MessageList.tsx
import React from 'react';
import { OpenCodeMessage } from '../messageTypes';
import { MessageItem } from './MessageItem';

interface MessageListProps {
  messages: OpenCodeMessage[];
  isStreaming?: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, isStreaming }) => {
  return (
    <div className="flex flex-col gap-4 p-4">
      {messages.map((message) => (
        <MessageItem key={message.info.id} message={message} />
      ))}
      {isStreaming && (
        <div className="animate-pulse text-gray-400">正在生成...</div>
      )}
    </div>
  );
};
```

#### 5.3.2 单条消息组件
```tsx
// components/MessageItem.tsx
import React from 'react';
import { OpenCodeMessage } from '../messageTypes';
import { PartRenderer } from './PartRenderer';
import { MessageHeader } from './MessageHeader';

interface MessageItemProps {
  message: OpenCodeMessage;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const isUser = message.info.role === 'user';
  
  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <MessageHeader info={message.info} />
      <div className={`max-w-4xl w-full ${isUser ? 'bg-blue-50' : 'bg-white'} rounded-lg shadow-sm border`}>
        {message.parts.map((part) => (
          <PartRenderer key={part.id} part={part} />
        ))}
      </div>
    </div>
  );
};
```

#### 5.3.3 Part 渲染器
```tsx
// components/PartRenderer.tsx
import React from 'react';
import { Part } from '../messageTypes';
import {
  isTextPart,
  isReasoningPart,
  isToolPart,
  isStepStartPart,
  isStepFinishPart,
} from '../messageUtils';
import { TextPartComponent } from './parts/TextPartComponent';
import { ReasoningPartComponent } from './parts/ReasoningPartComponent';
import { ToolPartComponent } from './parts/ToolPartComponent';
import { StepStartPartComponent } from './parts/StepStartPartComponent';
import { StepFinishPartComponent } from './parts/StepFinishPartComponent';

interface PartRendererProps {
  part: Part;
}

export const PartRenderer: React.FC<PartRendererProps> = ({ part }) => {
  if (isTextPart(part)) {
    return <TextPartComponent part={part} />;
  }
  if (isReasoningPart(part)) {
    return <ReasoningPartComponent part={part} />;
  }
  if (isToolPart(part)) {
    return <ToolPartComponent part={part} />;
  }
  if (isStepStartPart(part)) {
    return <StepStartPartComponent part={part} />;
  }
  if (isStepFinishPart(part)) {
    return <StepFinishPartComponent part={part} />;
  }
  return <div>Unknown part type</div>;
};
```

#### 5.3.4 各类型 Part 组件示例
```tsx
// components/parts/ReasoningPartComponent.tsx
import React, { useState } from 'react';
import { ReasoningPart } from '../../messageTypes';

interface ReasoningPartComponentProps {
  part: ReasoningPart;
}

export const ReasoningPartComponent: React.FC<ReasoningPartComponentProps> = ({ part }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  
  return (
    <div className="border-l-4 border-purple-400 bg-purple-50 p-4 my-2">
      <div 
        className="flex items-center gap-2 cursor-pointer mb-2"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-purple-700 font-semibold">
          💭 推理过程
        </span>
        <span className="text-xs text-purple-500">
          {isExpanded ? '收起' : '展开'}
        </span>
      </div>
      {isExpanded && (
        <div className="text-purple-800 whitespace-pre-wrap">
          {part.text}
        </div>
      )}
    </div>
  );
};

// components/parts/ToolPartComponent.tsx
import React, { useState } from 'react';
import { ToolPart } from '../../messageTypes';
import { formatDuration } from '../../messageUtils';

interface ToolPartComponentProps {
  part: ToolPart;
}

export const ToolPartComponent: React.FC<ToolPartComponentProps> = ({ part }) => {
  const [showInput, setShowInput] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  
  return (
    <div className="border border-green-200 bg-green-50 rounded-lg p-4 my-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-green-700 font-semibold">
            🔧 {part.tool}
          </span>
          <span className="text-sm text-green-600">
            {part.state.title}
          </span>
        </div>
        {part.state.time && (
          <span className="text-xs text-gray-500">
            {formatDuration(part.state.time.start!, part.state.time.end!)}
          </span>
        )}
      </div>
      
      <div className="space-y-2">
        <div>
          <button
            onClick={() => setShowInput(!showInput)}
            className="text-xs text-green-600 hover:text-green-800 underline"
          >
            {showInput ? '隐藏输入' : '显示输入'}
          </button>
          {showInput && (
            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
              {JSON.stringify(part.state.input, null, 2)}
            </pre>
          )}
        </div>
        
        <div>
          <button
            onClick={() => setShowOutput(!showOutput)}
            className="text-xs text-green-600 hover:text-green-800 underline"
          >
            {showOutput ? '隐藏输出' : '显示输出'}
          </button>
          {showOutput && (
            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
              {typeof part.state.output === 'string' 
                ? part.state.output 
                : JSON.stringify(part.state.output, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
```

## 6. 字段提取清单

### 6.1 Message Info 字段
| 字段 | 是否必须 | 展示位置 | 说明 |
|------|----------|----------|------|
| `role` | ✅ | 消息头 | 用户/助手标识 |
| `time.created` | ✅ | 消息头 | 创建时间 |
| `time.completed` | ✅ | 消息头 | 完成时间 |
| `id` | ✅ | 内部使用 | 消息ID |
| `sessionID` | ✅ | 内部使用 | 会话ID |
| `modelID` | 可选 | 消息详情 | 模型名称 |
| `tokens.total` | 可选 | 统计面板 | 总token数 |
| `tokens.input` | 可选 | 统计面板 | 输入token数 |
| `tokens.output` | 可选 | 统计面板 | 输出token数 |
| `tokens.reasoning` | 可选 | 统计面板 | 推理token数 |
| `cost` | 可选 | 统计面板 | 成本 |
| `agent` | 可选 | 消息头 | Agent类型 |

### 6.2 Part 字段
| Part 类型 | 关键字段 | 展示方式 |
|-----------|----------|----------|
| `text` | `text` | 正常文本 |
| `reasoning` | `text` | 紫色背景，可折叠 |
| `tool` | `tool`, `state.title`, `state.input`, `state.output` | 绿色边框，输入输出可折叠 |
| `step-start` | - | 分隔线 + "开始新步骤" |
| `step-finish` | `reason`, `tokens`, `cost` | 分隔线 + 完成信息 |

## 7. 可视化规范

### 7.1 颜色方案
| 元素 | 颜色 | 说明 |
|------|------|------|
| 用户消息 | 🔵 蓝色系 | `bg-blue-50`, `border-blue-200` |
| 助手消息 | ⚪ 白色系 | `bg-white`, `border-gray-200` |
| Text 部分 | ⚫ 默认 | 正常文本样式 |
| Reasoning 部分 | 🟣 紫色系 | `bg-purple-50`, `border-l-purple-400` |
| Tool 部分 | 🟢 绿色系 | `bg-green-50`, `border-green-200` |
| Step 分隔线 | 🟠 橙色系 | `border-orange-300` |

### 7.2 图标方案
| 元素 | 图标 | Unicode |
|------|------|---------|
| 用户消息 | 👤 | `U+1F464` |
| 助手消息 | 🤖 | `U+1F916` |
| Reasoning | 💭 | `U+1F4AD` |
| Tool | 🔧 | `U+1F527` |
| Step Start | ▶️ | `U+25B6` |
| Step Finish | ✅ | `U+2705` |
| 展开/收起 | 🔽/🔼 | `U+1F53D`/`U+1F53C` |

### 7.3 字体与间距
- **消息间距**: 1rem (16px)
- **Part 间距**: 0.5rem (8px)
- **内边距**: 1rem (16px)
- **字体大小**: 
  - 正文: 14px
  - 标题: 16px semibold
  - 元数据: 12px

### 7.4 动画效果
- 新消息出现: 淡入动画 (fade in)
- 展开/收起: 平滑过渡 (smooth transition)
- 流式输出: 打字机效果 (typewriter)

## 8. 状态管理更新

### 8.1 新的状态类型
```typescript
// 更新 types.ts
export interface OpenCodeAuditState {
  session: OpenCodeSession | null;
  messages: OpenCodeMessage[]; // 替换原来的 logs
  isLoading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
  isAutoScroll: boolean;
  expandedParts: Set<string>;
}

export type OpenCodeAuditAction =
  | { type: 'SET_SESSION'; payload: OpenCodeSession }
  | { type: 'SET_MESSAGES'; payload: OpenCodeMessage[] }
  | { type: 'ADD_MESSAGE'; payload: OpenCodeMessage }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<OpenCodeMessage> } }
  | { type: 'ADD_PART'; payload: { messageId: string; part: Part } }
  | { type: 'TOGGLE_PART_EXPANDED'; payload: string }
  // ... 其他现有 actions
```

## 9. 实施计划

### 阶段 1: 后端开发 (2-3天)
- [ ] 创建 Pydantic schema 定义
- [ ] 实现消息解析服务
- [ ] 更新数据库模型（如需）
- [ ] 实现 WebSocket 端点
- [ ] 实现 REST API 端点
- [ ] 编写单元测试

### 阶段 2: 前端类型和基础 (1-2天)
- [ ] 创建 TypeScript 类型定义
- [ ] 实现类型守卫和工具函数
- [ ] 更新状态管理
- [ ] 实现 WebSocket 连接管理

### 阶段 3: 前端组件开发 (3-4天)
- [ ] 实现 MessageList 组件
- [ ] 实现 MessageItem 组件
- [ ] 实现 PartRenderer 组件
- [ ] 实现各 Part 类型组件
  - [ ] TextPartComponent
  - [ ] ReasoningPartComponent
  - [ ] ToolPartComponent
  - [ ] StepStartPartComponent
  - [ ] StepFinishPartComponent
- [ ] 实现 MessageHeader 组件

### 阶段 4: 集成与测试 (2-3天)
- [ ] 前后端集成
- [ ] 实现增量更新
- [ ] 性能优化
- [ ] 用户体验优化
- [ ] 端到端测试
- [ ] 修复 bug

### 阶段 5: 文档与收尾 (1天)
- [ ] 更新 API 文档
- [ ] 代码审查
- [ ] 最终测试
- [ ] 部署准备

## 10. 附录

### 10.1 参考文件
- `logs/log.txt` - 原始数据示例
- `frontend/src/pages/OpenCodeAudit/types.ts` - 现有类型定义
- `backend/app/schemas/opencode_session.py` - 现有 schema

### 10.2 工具推荐
- React 18+
- TypeScript 5+
- Tailwind CSS 3+
- Pydantic 2+
- FastAPI
- WebSocket API

### 10.3 注意事项
1. 保持向后兼容 - 逐步迁移，不破坏现有功能
2. 性能优先 - 大数据量时考虑虚拟滚动
3. 可访问性 - 添加适当的 ARIA 标签
4. 国际化 - 文本支持 i18n
5. 错误处理 - 优雅处理解析错误和网络错误

---

**文档结束**
