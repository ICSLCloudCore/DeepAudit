/**
 * OpenCode会话面板组件
 * 集成到 ProjectDetail.tsx 的"项目概览"标签页
 */
import { useState, useEffect, useCallback } from "react";
import { Terminal, Send, History, Play, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";
import { PromptSelector } from "./PromptSelector";
import { StreamResponseViewer } from "./StreamResponseViewer";
import { SessionHistoryList } from "./SessionHistoryList";
import { opencodeApi, type OpenCodeSession } from "@/shared/api/opencode";
import { getPromptTemplates, type PromptTemplate } from "@/shared/api/prompts";
import { toast } from "sonner";

interface OpenCodeSessionPanelProps {
  projectId: string;
  project: any;
  onRefresh: () => void;
}

export function OpenCodeSessionPanel({ projectId, project, onRefresh }: OpenCodeSessionPanelProps) {
  const [sessions, setSessions] = useState<OpenCodeSession[]>([]);
  const [currentSession, setCurrentSession] = useState<OpenCodeSession | null>(null);
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplate[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const response = await opencodeApi.listSessions(projectId, { limit: 50 });
      setSessions(response.items);
      
      if (response.items.length > 0 && !currentSession) {
        setCurrentSession(response.items[0]);
      }
    } catch (error) {
      console.error("Failed to load sessions:", error);
    }
  }, [projectId, currentSession]);

  const loadPromptTemplates = useCallback(async () => {
    try {
      const response = await getPromptTemplates({ is_active: true, limit: 100 });
      setPromptTemplates(response.items);
    } catch (error) {
      console.error("Failed to load prompt templates:", error);
    }
  }, []);

  useEffect(() => {
    if (projectId) {
      loadSessions();
      loadPromptTemplates();
    }
  }, [projectId, loadSessions, loadPromptTemplates]);

  const handleStartOpenCode = async () => {
    try {
      setIsStarting(true);
      const response = await opencodeApi.startProjectServe(projectId);
      toast.success(response.message || "OpenCode 服务器正在启动...");
      
      // 等待一段时间后刷新项目状态
      let attempts = 0;
      const maxAttempts = 30;
      
      const checkInterval = setInterval(async () => {
        attempts++;
        await onRefresh();
        
        if (attempts >= maxAttempts) {
          clearInterval(checkInterval);
          setIsStarting(false);
          toast.error("OpenCode 服务器启动超时，请刷新页面重试");
        }
      }, 2000);
      
    } catch (error) {
      console.error("Failed to start OpenCode:", error);
      toast.error("启动 OpenCode 服务器失败");
      setIsStarting(false);
    }
  };

  const handleSendPrompt = async (content: string, templateId?: string) => {
    try {
      setIsLoading(true);
      
      let session;
      if (currentSession) {
        session = await opencodeApi.sendPrompt(currentSession.id, {
          prompt_template_id: templateId,
          prompt_content: content,
        });
      } else {
        session = await opencodeApi.createSession(projectId, {
          prompt_template_id: templateId,
          prompt_content: content,
        });
      }
      
      setCurrentSession(session);
      await loadSessions();
      onRefresh();
      toast.success("提示词已发送");
    } catch (error) {
      console.error("Failed to send prompt:", error);
      toast.error("发送提示词失败");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSession = (session: OpenCodeSession) => {
    setCurrentSession(session);
  };

  if (!project.opencode_pid) {
    return (
      <Card className="cyber-card">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <CardTitle>OpenCode 交互控制台</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <div className="empty-state">
            <Terminal className="empty-state-icon" />
            <p className="empty-state-description mb-4">请先启动 OpenCode 服务器</p>
            <Button 
              onClick={handleStartOpenCode} 
              disabled={isStarting}
              className="cyber-btn-primary"
            >
              {isStarting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  启动中...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  启动 OpenCode 服务器
                </>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="cyber-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <CardTitle>OpenCode 交互控制台</CardTitle>
            <Badge className="cyber-badge-success">运行中</Badge>
          </div>
          <Collapsible open={isHistoryOpen} onOpenChange={setIsHistoryOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="cyber-btn-outline">
                <History className="w-4 h-4 mr-2" />
                历史会话
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <Collapsible open={isHistoryOpen}>
          <CollapsibleContent>
            <SessionHistoryList
              sessions={sessions}
              currentSessionId={currentSession?.id}
              onSelectSession={handleSelectSession}
            />
          </CollapsibleContent>
        </Collapsible>

        <PromptSelector
          templates={promptTemplates}
          onSendPrompt={handleSendPrompt}
          disabled={!project.opencode_pid || isLoading}
          isLoading={isLoading}
        />

        <StreamResponseViewer
          session={currentSession}
          projectId={projectId}
        />
      </CardContent>
    </Card>
  );
}