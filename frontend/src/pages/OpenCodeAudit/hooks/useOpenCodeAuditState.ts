/**
 * OpenCode Audit State Hook
 * Centralized state management using useReducer
 */

import { useReducer, useCallback, useMemo } from "react";
import type {
  OpenCodeAuditState,
  OpenCodeAuditAction,
  LogItem,
  OpenCodeSession,
  ConnectionStatus,
} from "../types";
import { createLogItem, isSessionRunning, isSessionComplete } from "../utils";

// ============ Initial State ============

const initialState: OpenCodeAuditState = {
  session: null,
  logs: [],
  isLoading: false,
  error: null,
  connectionStatus: 'disconnected',
  isAutoScroll: true,
  expandedLogIds: new Set(),
};

// ============ Reducer ============

function openCodeAuditReducer(
  state: OpenCodeAuditState,
  action: OpenCodeAuditAction
): OpenCodeAuditState {
  switch (action.type) {
    case 'SET_SESSION':
      return { ...state, session: action.payload };

    case 'SET_LOGS':
      return { ...state, logs: action.payload };

    case 'ADD_LOG': {
      const { id: providedId, ...logData } = action.payload;
      const newLog = providedId
        ? { ...createLogItem(logData), id: providedId }
        : createLogItem(logData);
      // 默认将新卡片展开
      const newExpandedLogIds = new Set(state.expandedLogIds);
      newExpandedLogIds.add(newLog.id);
      return { 
        ...state, 
        logs: [...state.logs, newLog],
        expandedLogIds: newExpandedLogIds
      };
    }

    case 'UPDATE_LOG': {
      const { id, updates } = action.payload;
      return {
        ...state,
        logs: state.logs.map(log =>
          log.id === id ? { ...log, ...updates } : log
        ),
      };
    }

    case 'REMOVE_LOG':
      return {
        ...state,
        logs: state.logs.filter(log => log.id !== action.payload),
      };

    case 'SET_LOADING':
      return { ...state, isLoading: action.payload };

    case 'SET_ERROR':
      return { ...state, error: action.payload };

    case 'SET_CONNECTION_STATUS':
      return { ...state, connectionStatus: action.payload };

    case 'SET_AUTO_SCROLL':
      return { ...state, isAutoScroll: action.payload };

    case 'TOGGLE_LOG_EXPANDED': {
      const newExpanded = new Set(state.expandedLogIds);
      if (newExpanded.has(action.payload)) {
        newExpanded.delete(action.payload);
      } else {
        newExpanded.add(action.payload);
      }
      return { ...state, expandedLogIds: newExpanded };
    }

    case 'RESET':
      return { ...initialState };

    default:
      return state;
  }
}

// ============ Hook ============

export function useOpenCodeAuditState() {
  const [state, dispatch] = useReducer(openCodeAuditReducer, initialState);

  // ============ Action Creators ============

  const setSession = useCallback((session: OpenCodeSession) => {
    dispatch({ type: 'SET_SESSION', payload: session });
  }, []);

  const setLogs = useCallback((logs: LogItem[]) => {
    dispatch({ type: 'SET_LOGS', payload: logs });
  }, []);

  const addLog = useCallback((log: Omit<LogItem, 'id' | 'time'>): string => {
    const newLog = createLogItem(log);
    dispatch({ type: 'ADD_LOG', payload: newLog });
    return newLog.id;
  }, []);

  const updateLog = useCallback((id: string, updates: Partial<LogItem>) => {
    dispatch({ type: 'UPDATE_LOG', payload: { id, updates } });
  }, []);

  const removeLog = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_LOG', payload: id });
  }, []);

  const setLoading = useCallback((loading: boolean) => {
    dispatch({ type: 'SET_LOADING', payload: loading });
  }, []);

  const setError = useCallback((error: string | null) => {
    dispatch({ type: 'SET_ERROR', payload: error });
  }, []);

  const setConnectionStatus = useCallback((status: ConnectionStatus) => {
    dispatch({ type: 'SET_CONNECTION_STATUS', payload: status });
  }, []);

  const setAutoScroll = useCallback((enabled: boolean) => {
    dispatch({ type: 'SET_AUTO_SCROLL', payload: enabled });
  }, []);

  const toggleLogExpanded = useCallback((id: string) => {
    dispatch({ type: 'TOGGLE_LOG_EXPANDED', payload: id });
  }, []);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // ============ Computed Values ============

  const isRunning = useMemo(() => {
    return isSessionRunning(state.session?.status);
  }, [state.session?.status]);

  const isComplete = useMemo(() => {
    return isSessionComplete(state.session?.status);
  }, [state.session?.status]);

  return {
    // State
    ...state,
    isRunning,
    isComplete,

    // Actions
    setSession,
    setLogs,
    addLog,
    updateLog,
    removeLog,
    setLoading,
    setError,
    setConnectionStatus,
    setAutoScroll,
    toggleLogExpanded,
    reset,

    // Direct dispatch for complex operations
    dispatch,
  };
}

export type OpenCodeAuditStateHook = ReturnType<typeof useOpenCodeAuditState>;
