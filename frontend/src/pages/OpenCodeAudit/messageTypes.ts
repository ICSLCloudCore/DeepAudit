/**
 * OpenCode 审计消息展示规范 - 类型定义
 */

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
  total?: number;
  input?: number;
  output?: number;
  reasoning?: number;
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
