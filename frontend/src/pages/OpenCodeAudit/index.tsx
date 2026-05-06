/**
 * OpenCode Audit Page - Modular Implementation
 * Main entry point for the OpenCode Audit feature
 * Cassette Futurism / Terminal Retro aesthetic
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Terminal, Loader2, ArrowDown, Sparkles, FileText, FileJson } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { exportOpenCodeToMD, exportOpenCodeToJSON } from "@/features/reports/services/reportExport";
import {
  getOpenCodeAuditTask,
  type OpenCodeAuditTask,
  cancelOpenCodeAuditTask,
  manualCompleteOpenCodeAuditTask,
} from "@/shared/api/opencodeAuditTasks";

import { SplashScreen, Header, LogEntry, StatsPanel, MessageList } from "./components";
import { useOpenCodeAuditState } from "./hooks";
import { ACTION_VERBS } from "./constants";

import { opencodeApi } from "@/shared/api/opencode";

function OpenCodeAuditPageContent() {
  const { sessionId, taskId, projectId } = useParams<{ sessionId?: string; taskId?: string; projectId?: string }>();
  const navigate = useNavigate();
  
  const {
    session, logs, messages, isLoading,
    isAutoScroll, expandedLogIds, isRunning, isComplete, showProgressLogs,
    setSession, addLog,
    setLoading, setError, setAutoScroll, toggleLogExpanded, toggleShowProgressLogs,
    reset,
  } = useOpenCodeAuditState();

  const [showSplash, setShowSplash] = useState(!sessionId);
  const [statusVerb, setStatusVerb] = useState(ACTION_VERBS[0]);
  const [statusDots, setStatusDots] = useState(0);
  const [firstRun, setFirstRun] = useState(true);
  const [exportingMD, setExportingMD] = useState(false);
  const [exportingJSON, setExportingJSON] = useState(false);
  const [auditTask, setAuditTask] = useState<OpenCodeAuditTask | null>(null);
  const [loadingAuditTask, setLoadingAuditTask] = useState(false);

  const logEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const previousSessionIdRef = useRef<string | undefined>(undefined);

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
  }, [sessionId, setSession, setLoading, setError]);

  useEffect(() => {
    if (!sessionId) {
      setShowSplash(true);
      return;
    }
    setShowSplash(false);
    loadSession();
  }, [sessionId, loadSession]);

  // 加载 Audit Task 数据
  useEffect(() => {
    if (!taskId) return;

    const loadAuditTask = async () => {
      setLoadingAuditTask(true);
      try {
        const taskData = await getOpenCodeAuditTask(taskId);
        setAuditTask(taskData);
      } catch (err) {
        console.error("Failed to load audit task:", err);
        toast.error("Failed to load audit task");
      } finally {
        setLoadingAuditTask(false);
      }
    };

    loadAuditTask();
  }, [taskId]);

  // 监听 taskId 变化，切换 task 时重置状态
  useEffect(() => {
    if (taskId) {
      console.log('[OpenCode Audit] Task ID changed, resetting state...');
      reset();
      setFirstRun(true);
      setShowSplash(false);
    }
  }, [taskId, reset]);

  // SSE Stream Effect
  useEffect(() => {
    if (!sessionId || !taskId || !firstRun) {
      return;
    }
    try {
      const eventSource = opencodeApi.streamSession(sessionId);
      eventSourceRef.current = eventSource;

      eventSource.addEventListener('message', (event) => {
        const { content_type, text_content, time } = JSON.parse(event.data);
        addLog({
          type: content_type === 'response' ? 'response' : 
                content_type === 'reasoning' ? 'progress' :
                content_type === 'user_prompt' ? 'prompt' : 'info',
          title: content_type === 'user_prompt' ? '用户发送的 Prompt' : "",
          content: text_content,
          isStreaming: false,
          time,
        });
      });

      eventSource.addEventListener('done', async (event) => {
        // Refresh session status
        await loadSession();
        const { content_type, time } = JSON.parse(event.data);
        addLog({
          type: content_type === 'closed' ? 'status' : 'error',
          title: "",
          content: "Audit Completed.",
          isStreaming: false,
          time,
        });
        setFirstRun(false);
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
    };
  }, [sessionId, isRunning, addLog, loadSession, isComplete]);

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

  const handleExportMD = async () => {
    const taskId = auditTask?.id;
    console.log('[OpenCode Export] handleExportMD called');
    console.log('[OpenCode Export] auditTask:', auditTask);
    console.log('[OpenCode Export] auditTask.id:', auditTask?.id);
    
    if (!taskId) {
      console.error('[OpenCode Export] No taskId available!');
      toast.error("任务 ID 不存在，无法导出报告");
      return;
    }
    
    console.log('[OpenCode Export] Using taskId:', taskId);
    setExportingMD(true);
    try {
      await exportOpenCodeToMD(taskId);
      toast.success("Markdown 报告已导出");
    } catch (error) {
      console.error("导出失败:", error);
      toast.error("导出失败，请重试");
    } finally {
      setExportingMD(false);
    }
  };

  const handleExportJSON = async () => {
    const taskId = auditTask?.id;
    console.log('[OpenCode Export] handleExportJSON called');
    console.log('[OpenCode Export] auditTask:', auditTask);
    console.log('[OpenCode Export] auditTask.id:', auditTask?.id);
    
    if (!taskId) {
      console.error('[OpenCode Export] No taskId available!');
      toast.error("任务 ID 不存在，无法导出报告");
      return;
    }
    
    console.log('[OpenCode Export] Using taskId:', taskId);
    setExportingJSON(true);
    try {
      await exportOpenCodeToJSON(taskId);
      toast.success("JSON 报告已导出");
    } catch (error) {
      console.error("导出失败:", error);
      toast.error("导出失败，请重试");
    } finally {
      setExportingJSON(false);
    }
  };

  // 取消审计任务
  const handleCancel = async () => {
    if (!taskId) {
      toast.error("缺少必要参数");
      return;
    }

    try {
      toast.loading("正在取消审计...");

      // 使用新的 API，后端会处理所有清理工作
      const updatedTask = await cancelOpenCodeAuditTask(taskId);
      setAuditTask(updatedTask);

      // 断开 SSE 连接（如果有）
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      toast.dismiss();
      toast.success("审计已取消");
    } catch (error) {
      console.error("取消失败:", error);
      toast.dismiss();
      toast.error("取消失败，请重试");
    }
  };

  // 完成审计任务
  const handleComplete = async () => {
    if (!taskId) {
      toast.error("缺少必要参数");
      return;
    }

    try {
      toast.loading("正在完成审计...");

      // 使用新的 API，后端会处理所有清理和漏洞导入工作
      const updatedTask = await manualCompleteOpenCodeAuditTask(taskId);
      setAuditTask(updatedTask);

      // 断开 SSE 连接（如果有）
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      toast.dismiss();
      toast.success("审计已完成");
    } catch (error) {
      console.error("完成失败:", error);
      toast.dismiss();
      toast.error("完成失败，请重试");
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
        auditTask={auditTask}
        onCancel={handleCancel}
        onComplete={handleComplete}
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

            <div className="flex items-center gap-2">
              <button
                onClick={() => toggleShowProgressLogs()}
                className={`
                  flex items-center gap-2 text-xs px-3 py-1.5 rounded-md font-mono uppercase tracking-wider
                  ${showProgressLogs
                    ? 'bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 border border-cyan-500/50'
                    : 'text-muted-foreground hover:text-foreground border border-border hover:bg-muted'
                  }
                `}
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>THINKING</span>
              </button>
              
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
                        WAITING FOR ANALYSE RESPONSE...
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
                {logs.filter(item => showProgressLogs || item.type !== 'progress').map(item => (
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

          {/* 查看问题和导出按钮 - 始终显示 */}
          {auditTask && (
            <div className="flex-shrink-0 p-4 border-t border-border space-y-3">
              <Button
                className="w-full gap-2"
                onClick={() => {
                  if (taskId) {
                    navigate(`/tasks/opencode/${taskId}/vulnerabilities`);
                  }
                }}
              >
                <FileText className="w-4 h-4" />
                查看问题
              </Button>

              <Button
                className="w-full gap-2"
                variant="secondary"
                onClick={handleExportMD}
                disabled={exportingMD}
              >
                {exportingMD ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileText className="w-4 h-4" />
                )}
                导出 Markdown 报告
              </Button>

              <Button
                className="w-full gap-2"
                variant="secondary"
                onClick={handleExportJSON}
                disabled={exportingJSON}
              >
                {exportingJSON ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FileJson className="w-4 h-4" />
                )}
                导出 JSON 报告
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OpenCodeAuditPage() {
  return <OpenCodeAuditPageContent />;
}
