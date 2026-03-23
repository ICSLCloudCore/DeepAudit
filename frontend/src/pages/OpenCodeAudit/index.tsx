/**
 * OpenCode Audit Page - Modular Implementation
 * Main entry point for the OpenCode Audit feature
 * Cassette Futurism / Terminal Retro aesthetic
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Terminal, Loader2, ArrowDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import { SplashScreen, Header, LogEntry, StatsPanel, MessageList } from "./components";
import { useOpenCodeAuditState } from "./hooks";
import { ACTION_VERBS } from "./constants";

import { opencodeApi } from "@/shared/api/opencode";

function OpenCodeAuditPageContent() {
  const { sessionId, projectId } = useParams<{ sessionId?: string; projectId?: string }>();
  
  const {
    session, logs, messages, isLoading,
    isAutoScroll, expandedLogIds, isRunning, isComplete,
    setSession, addLog, updateLog,
    setLoading, setError, setAutoScroll, toggleLogExpanded,
    reset,
  } = useOpenCodeAuditState();

  const [showSplash, setShowSplash] = useState(!sessionId);
  const [statusVerb, setStatusVerb] = useState(ACTION_VERBS[0]);
  const [statusDots, setStatusDots] = useState(0);
  const [sseConnected, setSseConnected] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const previousSessionIdRef = useRef<string | undefined>(undefined);
  const streamingLogIdsRef = useRef<Map<string, string>>(new Map());
  
  // Use refs to avoid including frequently changing values in useEffect dependencies
  const addLogRef = useRef(addLog);
  const updateLogRef = useRef(updateLog);
  const loadSessionRef = useRef<typeof loadSession | null>(null);
  const logsRef = useRef(logs);
  const isCompleteRef = useRef(isComplete);

  // Update refs when values change
  useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  useEffect(() => {
    updateLogRef.current = updateLog;
  }, [updateLog]);

  useEffect(() => {
    logsRef.current = logs;
  }, [logs]);

  useEffect(() => {
    isCompleteRef.current = isComplete;
  }, [isComplete]);

  useEffect(() => {
    if (sessionId !== previousSessionIdRef.current) {
      reset();
      streamingLogIdsRef.current.clear();
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
    } catch (err) {
      toast.error("Failed to load session");
      setError("Failed to load session");
    } finally {
      setLoading(false);
    }
  }, [sessionId, setSession, setLoading, setError, addLog, logs.length]);

  // Update loadSession ref after it's defined
  useEffect(() => {
    loadSessionRef.current = loadSession;
  }, [loadSession]);

  useEffect(() => {
    if (!sessionId) {
      setShowSplash(true);
      return;
    }
    setShowSplash(false);
    loadSession();
  }, [sessionId, loadSession]);

  // SSE Stream Effect
  useEffect(() => {
    if (!sessionId) {
      return ;
    }
    try {
      const eventSource = opencodeApi.streamSession(sessionId);
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data);
          const { content_type, text_content } = data;
          const logKey = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          // 为每条消息创建新的日志卡片
          const logId = addLogRef.current({
            type: content_type === 'response' ? 'response' : 
                  content_type === 'reasoning' ? 'progress' : 'info',
            title: "",
            content: text_content,
            isStreaming: false // 不再流式更新，每条消息独立
          });
          streamingLogIdsRef.current.set(logKey, logId);
        } catch (parseError) {
          console.error('Failed to parse SSE message:', parseError);
        }
      });

      eventSource.addEventListener('done', async () => {
        // Mark all streaming logs as complete
        streamingLogIdsRef.current.forEach((logId) => {
          updateLogRef.current(logId, { isStreaming: false });
        });
        streamingLogIdsRef.current.clear();
        
        // Refresh session status
        if (loadSessionRef.current) {
          await loadSessionRef.current();
        }
        
        // Add completion log
        if (!isCompleteRef.current) {
          addLogRef.current({
            type: 'status',
            title: 'Session completed',
            content: 'Audit session has completed'
          });
        }
      });

      eventSource.addEventListener('error', (error) => {
        console.error('SSE connection error:', error);
        eventSource.close();
        eventSourceRef.current = null;
      });
    } catch (err) {
      console.error('Failed to create SSE connection:', err);
    }

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      setSseConnected(false);
    };
  }, [sessionId, isRunning]);

  useEffect(() => {
    if (isAutoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isAutoScroll]);

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
            {messages.length > 0 ? (
              <MessageList messages={messages} isStreaming={isRunning} />
            ) : logs.length === 0 ? (
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
