/**
 * 流式响应查看器组件
 */
import { useState, useEffect, useRef } from "react";
import { Activity, AlertCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { type OpenCodeSession } from "@/shared/api/opencode";
import { createOpenCodeSessionStream } from "@/shared/api/opencodeSessionStream";

interface StreamResponseViewerProps {
  session: OpenCodeSession | null;
  projectId: string;
}

export function StreamResponseViewer({ session, projectId }: StreamResponseViewerProps) {
  const [streamingContent, setStreamingContent] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamHandler, setStreamHandler] = useState<any>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [streamingContent, session?.response_content]);

  useEffect(() => {
    if (streamHandler) {
      streamHandler.disconnect();
    }

    if (session && session.status === "active") {
      const handler = createOpenCodeSessionStream(session.id, {
        onData: (chunk, accumulated) => {
          setStreamingContent(accumulated);
        },
        onError: (error) => {
          console.error("Stream error:", error);
          setIsStreaming(false);
        },
        onDone: () => {
          setIsStreaming(false);
        },
      });

      setStreamHandler(handler);
      setIsStreaming(true);
      setStreamingContent("");
      handler.connect();
    } else {
      setIsStreaming(false);
      setStreamingContent("");
    }

    return () => {
      if (streamHandler) {
        streamHandler.disconnect();
      }
    };
  }, [session?.id, session?.status]);

  const displayContent = isStreaming ? streamingContent : (session?.response_content || "");

  if (!session) {
    return (
      <Card className="cyber-card">
        <CardContent className="empty-state py-8">
          <Activity className="empty-state-icon" />
          <p className="empty-state-description">选择或创建会话以开始</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="cyber-card">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm">
            AI 响应
            {isStreaming && (
              <Badge className="ml-2 cyber-badge-info animate-pulse">
                生成中...
              </Badge>
            )}
          </CardTitle>
          <Badge className={
            session.status === "active" ? "cyber-badge-success" :
            session.status === "error" ? "cyber-badge-danger" : "cyber-badge-muted"
          }>
            {session.status === "active" ? "活跃" :
             session.status === "closed" ? "已关闭" : "错误"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[300px] rounded border border-border p-4 font-mono" ref={scrollRef}>
          {displayContent ? (
            <div className="text-sm whitespace-pre-wrap">
              {displayContent}
            </div>
          ) : (
            <div className="empty-state py-8">
              <Activity className="empty-state-icon" />
              <p className="empty-state-description">等待AI响应...</p>
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
