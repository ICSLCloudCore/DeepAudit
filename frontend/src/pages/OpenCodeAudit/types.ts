/**
 * OpenCode Audit Types
 * Type definitions for the OpenCode Audit page
 */

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
  id: string;
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
  isLoading: boolean;
  error: string | null;
  connectionStatus: ConnectionStatus;
  isAutoScroll: boolean;
  expandedLogIds: Set<string>;
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
