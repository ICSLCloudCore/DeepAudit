/**
 * 会话历史列表组件
 */
import { Clock, MessageSquare } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { type OpenCodeSession } from "@/shared/api/opencode";

interface SessionHistoryListProps {
  sessions: OpenCodeSession[];
  currentSessionId?: string;
  onSelectSession: (session: OpenCodeSession) => void;
}

export function SessionHistoryList({ sessions, currentSessionId, onSelectSession }: SessionHistoryListProps) {
  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPreview = (content: string) => {
    return content.slice(0, 50) + (content.length > 50 ? "..." : "");
  };

  if (sessions.length === 0) {
    return (
      <div className="empty-state py-4">
        <MessageSquare className="empty-state-icon" />
        <p className="empty-state-description">暂无历史会话</p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-[200px] rounded border border-border">
      <div className="p-2 space-y-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            className={`p-3 rounded cursor-pointer transition-all ${
              session.id === currentSessionId
                ? "bg-primary/10 border border-primary"
                : "bg-muted/50 hover:bg-muted border border-transparent"
            }`}
            onClick={() => onSelectSession(session)}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <Badge className={
                  session.status === "active" ? "cyber-badge-success" :
                  session.status === "error" ? "cyber-badge-danger" : "cyber-badge-muted"
                }>
                  {session.status}
                </Badge>
                <span className="text-xs text-muted-foreground font-mono flex items-center">
                  <Clock className="w-3 h-3 mr-1" />
                  {formatDate(session.started_at)}
                </span>
              </div>
            </div>
            <p className="text-sm text-foreground font-mono">
              {getPreview(session.prompt_content)}
            </p>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}
