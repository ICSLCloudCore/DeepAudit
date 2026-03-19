/**
 * OpenCode Server 交互日志查看器组件
 * 用于展示所有与OpenCode Server的请求/响应报文
 */
import { useState, useEffect, useRef } from "react";
import { Terminal, RefreshCw, Trash2, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface OpenCodeLogEntry {
  timestamp: string;
  direction: "request" | "response" | "error";
  endpoint: string;
  data: any;
}

interface OpenCodeLogViewerProps {
  className?: string;
}

// 模拟的日志数据 - 实际应该从后端API获取
const mockLogs: OpenCodeLogEntry[] = [
  {
    timestamp: new Date().toISOString(),
    direction: "request",
    endpoint: "/session",
    data: { title: "DeepAudit Audit Session" }
  },
  {
    timestamp: new Date(Date.now() + 100).toISOString(),
    direction: "response",
    endpoint: "/session",
    data: { id: "session-123", status: "created" }
  },
  {
    timestamp: new Date(Date.now() + 200).toISOString(),
    direction: "request",
    endpoint: "/session/session-123/message",
    data: { parts: [{ type: "text", text: "请审计这个代码库..." } }
  },
  {
    timestamp: new Date(Date.now() + 300).toISOString(),
    direction: "response",
    endpoint: "/session/session-123/message",
    data: { status: "accepted", message_id: "msg-456" }
  },
  {
    timestamp: new Date(Date.now() + 3000).toISOString(),
    direction: "response",
    endpoint: "/session/session-123/message",
    data: { parts: [{ type: "text", text: "审计完成，发现3个问题..." } }
];

export function OpenCodeLogViewer({ className }: OpenCodeLogViewerProps) {
  const [logs, setLogs] = useState<OpenCodeLogEntry[]>([]);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 初始化时添加模拟日志
    setLogs(mockLogs);
  }, []);

  useEffect(() => {
    // 自动滚动到底部
    if (scrollRef.current && autoRefresh) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoRefresh]);

  const handleClear = () => {
    setLogs([]);
  };

  const handleCopy = () => {
    const logText = logs.map(log => 
      `[${log.timestamp}] [${log.direction.toUpperCase()}] ${log.endpoint}\n${JSON.stringify(log.data, null, 2)}`
    ).join('\n\n');
    navigator.clipboard.writeText(logText);
  };

  const formatJson = (data: any) => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const getDirectionColor = (direction: string) => {
    switch (direction) {
      case 'request':
        return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'response':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'error':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getDirectionLabel = (direction: string) => {
    switch (direction) {
      case 'request':
        return '→ 请求';
      case 'response':
        return '← 响应';
      case 'error':
        return '✕ 错误';
      default:
        return direction;
    }
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <CardTitle className="text-lg">OpenCode Server 交互日志</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={autoRefresh ? 'bg-emerald-50' : ''}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${autoRefresh ? 'animate-spin' : ''}`} />
              {autoRefresh ? '自动刷新' : '暂停刷新'}
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              <Copy className="w-4 h-4 mr-2" />
              复制
            </Button>
            <Button variant="outline" size="sm" onClick={handleClear}>
              <Trash2 className="w-4 h-4 mr-2" />
              清空
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full rounded-md border" ref={scrollRef}>
          <div className="p-4 space-y-3">
            {logs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Terminal className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>暂无OpenCode Server交互日志</p>
              </div>
            ) : (
              logs.map((log, index) => (
                <div
                  key={index}
                  className={`border rounded-lg p-3 ${getDirectionColor(log.direction)} border`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={getDirectionColor(log.direction)}>
                        {getDirectionLabel(log.direction)}
                      </Badge>
                      <code className="text-sm font-mono">{log.endpoint}</code>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="text-xs font-mono bg-background p-2 rounded mt-2 overflow-x-auto">
                    {formatJson(log.data)}
                  </pre>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
