/**
 * OpenCode Audit Types
 * Type definitions for the OpenCode Audit page
 */

// ============ 导入新的消息类型 ============
import type { OpenCodeMessage, Part } from './messageTypes';

// ============ Log Types ============

export type LogType =
  | 'prompt'
  | 'response'
  | 'status'
  | 'error'
  | 'info'
  | 'progress';

export interface LogItem {
  id: string;
  time: string;
  type: LogType;
  title: string;
  content?: string;
  isStreaming?: boolean;
}

// ============ Connection Types ============

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// ============ State Types ============

export interface OpenCodeSession {
  session_id: string;
  id?: string;
  project_id: string;
  status: 'pending' | 'active' | 'closed' | 'error';
  prompt_content: string;
  response_content: string;
  opencode_server_status: 'starting' | 'running' | 'error' | 'stopped';
  started_at?: string;
  completed_at?: string;
}

export interface OpenCodeAuditState {
  session: OpenCodeSession | null;
  logs: LogItem[];
  messages: OpenCodeMessage[]; // 新增：结构化消息列表
  isLoading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
  isAutoScroll: boolean;
  expandedLogIds: Set<string>;
  expandedParts: Set<string>; // 新增：展开的 Part ID 集合
  showProgressLogs: boolean; // 新增：是否显示进度日志
}

// ============ Action Types ============

export type OpenCodeAuditAction =
  | { type: 'SET_SESSION'; payload: OpenCodeSession }
  | { type: 'SET_LOGS'; payload: LogItem[] }
  | { type: 'ADD_LOG'; payload: Omit<LogItem, 'id' | 'time'> & { id?: string } }
  | { type: 'UPDATE_LOG'; payload: { id: string; updates: Partial<LogItem> } }
  | { type: 'REMOVE_LOG'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'SET_CONNECTION_STATUS'; payload: ConnectionStatus }
  | { type: 'SET_AUTO_SCROLL'; payload: boolean }
  | { type: 'TOGGLE_LOG_EXPANDED'; payload: string }
  // 新增：消息相关 actions
  | { type: 'SET_MESSAGES'; payload: OpenCodeMessage[] }
  | { type: 'ADD_MESSAGE'; payload: OpenCodeMessage }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; updates: Partial<OpenCodeMessage> } }
  | { type: 'ADD_PART'; payload: { messageId: string; part: Part } }
  | { type: 'TOGGLE_PART_EXPANDED'; payload: string }
  | { type: 'TOGGLE_SHOW_PROGRESS_LOGS' }
  | { type: 'RESET' };

// ============ Component Props ============

export interface LogEntryProps {
  item: LogItem;
  isExpanded: boolean;
  onToggle: () => void;
}

export interface StatsPanelProps {
  session: OpenCodeSession | null;
}

export interface HeaderProps {
  session: OpenCodeSession | null;
  isRunning: boolean;
  onNewAudit: () => void;
}

export interface ActivityLogProps {
  logs: LogItem[];
  isConnected: boolean;
  isRunning: boolean;
  isAutoScroll: boolean;
  expandedIds: Set<string>;
  onToggleAutoScroll: () => void;
  onToggleExpand: (id: string) => void;
}
