/**
 * OpenCode 审计消息展示规范 - 工具函数和类型守卫
 */

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
  if (ms < 0) return '0ms';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString();
}
