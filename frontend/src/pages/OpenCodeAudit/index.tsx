/**
 * OpenCode Audit Page - Modular Implementation
 * Main entry point for the OpenCode Audit feature
 * Cassette Futurism / Terminal Retro aesthetic
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Terminal, Loader2, ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import { SplashScreen, Header, LogEntry, StatsPanel } from "./components";
import { useOpenCodeAuditState } from "./hooks";
import { ACTION_VERBS, POLLING_INTERVALS } from "./constants";
import { createLogItem } from "./utils";
import type { LogItem } from "./types";

import {
  opencodeApi,
  type OpenCodeInteraction,
} from "@/shared/api/opencode";

import { createOpenCodeSessionStream } from "@/shared/api/opencodeSessionStream";

function OpenCodeAuditPageContent() {
  const { sessionId, projectId } = useParams<{ sessionId?: string; projectId?: string }>();
  const navigate = useNavigate();
  
  const {
    session, logs, messages, isLoading, error,
    isAutoScroll, expandedLogIds, isRunning, isComplete,
    setSession, setLogs, addLog, updateLog, removeLog,
    setLoading, setError, setAutoScroll, toggleLogExpanded,
    setMessages, // 新增
    reset, dispatch,
  } = useOpenCodeAuditState();

  const [showSplash, setShowSplash] = useState(!sessionId);
  const [statusVerb, setStatusVerb] = useState(ACTION_VERBS[0]);
  const [statusDots, setStatusDots] = useState(0);
  const [sseConnected, setSseConnected] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previousSessionIdRef = useRef<string | undefined>(undefined);
  const streamHandlerRef = useRef<any>(null);
  const lastContentRef = useRef<string>('');

  useEffect(() => {
    if (sessionId !== previousSessionIdRef.current) {
      reset();
      setShowSplash(!sessionId);
    }
    previousSessionIdRef.current = sessionId;
  }, [sessionId, reset]);

  useEffect(() => {
    if (!isRunning) return;
    const dotTimer = setInterval(() => setStatusDots(d => (d + 1) % 4), 500);
    const verbTimer = setInterval(() => {
      setStatusVerb(ACTION_VERBS[Math.floor(Math.random() * ACTION_VERBS.length)]);
    }, 5000);
    return () => {
      clearInterval(dotTimer);
      clearInterval(verbTimer);
    };
  }, [isRunning]);

  const loadSession = useCallback(async () => {
    if (!sessionId) return;
    try {
      // 如果 SSE 已连接，就不再通过轮询更新，避免冲突
      if (sseConnected && !isComplete) {
        return;
      }
      
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
      if (data.response_content) {
        // 检查是否已经有 response log 了
        const hasResponseLog = logs.some(log => log.type === 'response');
        if (!hasResponseLog) {
          addLog({
            type: 'response',
            title: 'Response received',
            content: data.response_content
          });
        } else {
          // 如果已经有 response log，更新它的内容
          const responseLogIndex = logs.findIndex(log => log.type === 'response');
          if (responseLogIndex !== -1) {
            const lastLog = logs[responseLogIndex];
            updateLog(lastLog.id, { content: data.response_content });
          }
        }
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
  }, [sessionId, setSession, setLoading, setError, addLog, logs.length, session?.response_content, session?.completed_at, isComplete, sseConnected]);

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

  useEffect(() => {
    if (!sessionId) {
      setShowSplash(true);
      return;
    }
    setShowSplash(false);
    loadSession();
    loadInteractions();
  }, [sessionId, loadSession, loadInteractions]);

  useEffect(() => {
    if (!sessionId || !isRunning) {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      if (streamHandlerRef.current) {
        streamHandlerRef.current.disconnect();
        streamHandlerRef.current = null;
      }
      setSseConnected(false);
      return;
    }

    // 重置 lastContent
    lastContentRef.current = '';

    // 启动 SSE 流式连接
    const handler = createOpenCodeSessionStream(sessionId, {
      onData: (newData, accumulated) => {
        // 只在内容真正变化时更新，避免闪烁
        if (accumulated !== lastContentRef.current) {
          lastContentRef.current = accumulated;
          // 实时更新 session 的响应内容，但保留 status 等其他字段，避免状态闪烁
          setSession(prev => {
            if (!prev) return null;
            return {
              ...prev,
              response_content: accumulated,
              // 确保 status 保持不变，避免闪烁
              status: prev.status
            };
          });
          
          // 更新最后一条 response log（如果存在）
          if (logs.length > 0 && logs[logs.length - 1].type === 'response') {
            const lastLog = logs[logs.length - 1];
            updateLog(lastLog.id, { content: accumulated });
          }
        }
      },
      onDone: () => {
        console.log('[OpenCodeStream] Stream completed');
        setSseConnected(false);
        // 会话完成时，重新加载会话以获取最新状态
        loadSession();
      },
      onError: (error) => {
        console.error('[OpenCodeStream] Stream error:', error);
        setSseConnected(false);
        // 出错时也尝试重新加载会话
        loadSession();
      }
    });
    
    streamHandlerRef.current = handler;
    handler.connect();
    setSseConnected(true);

    // 只有在 SSE 连接失败时才使用轮询作为备用
    // 暂时注释掉轮询，避免与 SSE 冲突造成闪烁
    // pollIntervalRef.current = setInterval(() => {
    //   loadSession();
    // }, POLLING_INTERVALS.SESSION_STATUS);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
      if (streamHandlerRef.current) {
        streamHandlerRef.current.disconnect();
      }
      setSseConnected(false);
    };
  }, [sessionId, isRunning, setSession, addLog, updateLog, logs]);

  useEffect(() => {
    if (isAutoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isAutoScroll]);

  // 新增：SSE 失败回退机制 - 如果 SSE 没有连接，启动轮询
  useEffect(() => {
    if (!sessionId || !isRunning) {
      return;
    }

    // 如果 SSE 没有连接，启动轮询作为备用
    if (!sseConnected && !pollIntervalRef.current) {
      console.log('[OpenCode] SSE not connected, starting polling as fallback');
      pollIntervalRef.current = setInterval(() => {
        loadSession();
      }, POLLING_INTERVALS.SESSION_STATUS);
    } else if (sseConnected && pollIntervalRef.current) {
      // 如果 SSE 连接了，停止轮询
      console.log('[OpenCode] SSE connected, stopping polling');
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [sessionId, isRunning, sseConnected, loadSession]);

  const handleNewAudit = () => {
    setShowSplash(true);
  };

  const handleSplashComplete = () => {
    if (projectId) {
      addLog({
        type: 'info',
        title: 'Starting OpenCode audit...',
        content: 'Initializing audit session'
      });
      
      toast.info("Starting OpenCode audit...");
    } else {
      toast.error("Project ID not found");
    }
  };

  if (showSplash && !sessionId) {
    return <SplashScreen onComplete={handleSplashComplete} />;
  }

  if (isLoading && !session) {
    return (
      <div className="h-screen bg-background flex items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 cyber-grid opacity-30" />
        <div className="absolute inset-0 vignette pointer-events-none" />
        <div className="flex items-center gap-3 text-muted-foreground relative z-10">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
          <span className="font-mono text-sm tracking-wide">LOADING OPENDCODE SESSION...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden relative">
      <div className="absolute inset-0 cyber-grid opacity-20 dark:opacity-30 pointer-events-none" />
      
      <Header
        session={session}
        isRunning={isRunning}
        onNewAudit={handleNewAudit}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <div className="w-3/4 flex flex-col border-r border-border relative">
          <div className="flex-shrink-0 h-12 border-b border-border flex items-center justify-between px-5 bg-card">
            <div className="flex items-center gap-4 text-xs text-muted-foreground">
              <div className="flex items-center gap-2.5">
                <Terminal className="w-4 h-4 text-primary" />
                <span className="uppercase font-bold tracking-wider text-foreground text-sm">Activity Log</span>
              </div>
              <Badge variant="outline" className="h-6 px-2 text-xs border-border text-muted-foreground font-mono bg-muted">
                {logs.length} entries
              </Badge>
            </div>

            <button
              onClick={() => setAutoScroll(!isAutoScroll)}
              className={`
                flex items-center gap-2 text-xs px-3 py-1.5 rounded-md font-mono uppercase tracking-wider
                ${isAutoScroll
                  ? 'bg-primary/15 text-primary border border-primary/50'
                  : 'text-muted-foreground hover:text-foreground border border-border hover:bg-muted'
                }
              `}
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Auto-scroll</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-muted/30">
            {logs.length === 0 ? (
              <div className="h-full flex items-center justify-center">
                <div className="text-center text-muted-foreground">
                  {isRunning ? (
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                      <span className="text-sm font-mono tracking-wide">
                        WAITING FOR OPENDCODE ACTIVITY...
                      </span>
                    </div>
                  ) : (
                    <span className="text-sm font-mono tracking-wide">
                      NO ACTIVITY YET
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {logs.map(item => (
                  <LogEntry
                    key={item.id}
                    item={item}
                    isExpanded={expandedLogIds.has(item.id)}
                    onToggle={() => toggleLogExpanded(item.id)}
                  />
                ))}
              </div>
            )}
            <div ref={logEndRef} />
          </div>

          {session && (
            <div className="flex-shrink-0 h-10 border-t border-border flex items-center justify-between px-5 text-xs bg-card relative overflow-hidden">
              <span className="relative z-10">
                {isRunning ? (
                  <span className="flex items-center gap-2.5 text-emerald-600 dark:text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    <span className="font-mono font-semibold">{statusVerb}{'.'.repeat(statusDots)}</span>
                  </span>
                ) : isComplete ? (
                  <span className="flex items-center gap-2 text-muted-foreground font-mono">
                    <span className={`w-2 h-2 rounded-full ${session.status === 'closed' ? 'bg-emerald-500' : session.status === 'error' ? 'bg-rose-500' : 'bg-amber-500'}`} />
                    AUDIT {session.status?.toUpperCase()}
                  </span>
                ) : (
                  <span className="text-muted-foreground font-mono">READY</span>
                )}
              </span>
            </div>
          )}
        </div>

        <div className="w-1/4 flex flex-col bg-background relative">
          <div className="flex-shrink-0 p-4 bg-card border-b border-border">
            <StatsPanel session={session} />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function OpenCodeAuditPage() {
  return <OpenCodeAuditPageContent />;
}
