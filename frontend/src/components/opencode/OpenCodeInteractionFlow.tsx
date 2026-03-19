/**
 * OpenCode 交互流程展示组件
 * 可视化展示与OpenCode Server的完整交互流程
 */
import { useState, useEffect, useRef } from "react";
import {
  Terminal,
  CheckCircle2,
  Clock,
  Send,
  Server,
  MessageSquare,
  Activity,
  AlertCircle,
  RotateCcw,
  Copy,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

type InteractionStatus = "pending" | "running" | "completed" | "error";

interface InteractionStep {
  id: string;
  name: string;
  description: string;
  status: InteractionStatus;
  timestamp?: Date;
  duration?: number;
  request?: any;
  response?: any;
  error?: string;
}

interface OpenCodeInteractionFlowProps {
  sessionId?: string;
  className?: string;
  onRefresh?: () => void;
}

const initialSteps: InteractionStep[] = [
  {
    id: "health-check",
    name: "健康检查",
    description: "检查OpenCode Server是否在线",
    status: "pending",
  },
  {
    id: "create-session",
    name: "创建会话",
    description: "在OpenCode Server上创建新会话",
    status: "pending",
  },
  {
    id: "send-prompt",
    name: "发送提示词",
    description: "发送审计提示词到OpenCode Server",
    status: "pending",
  },
  {
    id: "poll-result",
    name: "获取结果",
    description: "轮询OpenCode Server获取审计结果",
    status: "pending",
  },
];

const statusColors = {
  pending: "text-gray-400 bg-gray-100 border-gray-200",
  running: "text-blue-600 bg-blue-50 border-blue-200",
  completed: "text-emerald-600 bg-emerald-50 border-emerald-200",
  error: "text-red-600 bg-red-50 border-red-200",
};

const statusIcons = {
  pending: Clock,
  running: Activity,
  completed: CheckCircle2,
  error: AlertCircle,
};

export function OpenCodeInteractionFlow({
  sessionId,
  className,
  onRefresh,
}: OpenCodeInteractionFlowProps) {
  const [steps, setSteps] = useState<InteractionStep[]>(initialSteps);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const completedSteps = steps.filter((s) => s.status === "completed").length;
    setProgress((completedSteps / steps.length) * 100);
  }, [steps]);

  const updateStep = (
    stepId: string,
    updates: Partial<InteractionStep>
  ) => {
    setSteps((prev) =>
      prev.map((step) =>
        step.id === stepId
          ? { ...step, ...updates, timestamp: new Date() }
          : step
      )
    );
  };

  const startFlow = () => {
    setSteps(initialSteps.map((s) => ({ ...s, status: "pending" })));
    setIsRunning(true);
    
    simulateFlow();
  };

  const simulateFlow = async () => {
    const stepOrder = ["health-check", "create-session", "send-prompt", "poll-result"];
    
    for (let i = 0; i < stepOrder.length; i++) {
      const stepId = stepOrder[i];
      
      updateStep(stepId, { status: "running" });
      await new Promise((r) => setTimeout(r, 1000));
      
      if (stepId === "health-check") {
        updateStep(stepId, {
          status: "completed",
          duration: 1000,
          request: null,
          response: { healthy: true, version: "1.0.0" },
        });
      } else if (stepId === "create-session") {
        updateStep(stepId, {
          status: "completed",
          duration: 1200,
          request: { title: "DeepAudit Audit Session" },
          response: { id: "session-12345", title: "DeepAudit Audit Session" },
        });
      } else if (stepId === "send-prompt") {
        updateStep(stepId, {
          status: "completed",
          duration: 2500,
          request: { parts: [{ type: "text", "text": "请审计这个代码库..." }] },
          response: { info: { id: "msg-67890" } },
        });
      } else if (stepId === "poll-result") {
        updateStep(stepId, {
          status: "completed",
          duration: 8000,
          request: null,
          response: {
            parts: [
              {
                type: "text",
                text: "这是审计结果...",
              },
            ],
          },
        });
      }
    }
    
    setIsRunning(false);
  };

  const formatDuration = (ms?: number) => {
    if (!ms) return "";
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const formatJson = (data: any) => {
    try {
      return JSON.stringify(data, null, 2);
    } catch {
      return String(data);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const StepIcon = ({ status }: { status: InteractionStatus }) => {
    const Icon = statusIcons[status];
    return (
      <Icon
        className={`w-5 h-5 ${
          status === "running" ? "animate-spin" : ""
        }`}
      />
    );
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            <CardTitle className="text-lg">OpenCode 交互流程</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={startFlow}
              disabled={isRunning}
            >
              <RotateCcw className={`w-4 h-4 mr-2 ${isRunning ? "animate-spin" : ""}`} />
              {isRunning ? "运行中..." : "重新模拟"}
            </Button>
            {onRefresh && (
              <Button variant="outline" size="sm" onClick={onRefresh}>
                刷新
              </Button>
            )}
          </div>
        </div>
        <div className="mt-2">
          <Progress value={progress} className="h-2" />
        </div>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full" ref={scrollRef}>
          <div className="space-y-3 pr-4">
            {steps.map((step, index) => (
              <Collapsible
                key={step.id}
                open={expandedStep === step.id}
                onOpenChange={(open) => setExpandedStep(open ? step.id : null)}
              >
                <div
                  className={`border rounded-lg p-4 transition-all ${
                    statusColors[step.status]
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                          statusColors[step.status]
                        }`}
                      >
                        <StepIcon status={step.status} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{step.name}</span>
                          {step.duration && (
                            <Badge variant="outline" className="text-xs">
                              {formatDuration(step.duration)}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {step.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        className={`${
                          step.status === "completed"
                            ? "bg-emerald-100 text-emerald-700"
                            : step.status === "running"
                            ? "bg-blue-100 text-blue-700"
                            : step.status === "error"
                            ? "bg-red-100 text-red-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {step.status === "pending"
                          ? "等待中"
                          : step.status === "running"
                          ? "进行中"
                          : step.status === "completed"
                          ? "已完成"
                          : "错误"}
                      </Badge>
                      {(step.request || step.response || step.error) && (
                        <CollapsibleTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            {expandedStep === step.id ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </Button>
                        </CollapsibleTrigger>
                      )}
                    </div>
                  </div>

                  <CollapsibleContent className="mt-4 pt-4 border-t">
                    <div className="space-y-4">
                      {step.request && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-blue-600 flex items-center gap-2">
                              <Send className="w-4 h-4" />
                              请求
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => copyToClipboard(formatJson(step.request))}
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              复制
                            </Button>
                          </div>
                          <pre className="text-xs font-mono bg-blue-50 p-3 rounded overflow-x-auto">
                            {formatJson(step.request)}
                          </pre>
                        </div>
                      )}

                      {step.response && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-emerald-600 flex items-center gap-2">
                              <MessageSquare className="w-4 h-4" />
                              响应
                            </span>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => copyToClipboard(formatJson(step.response))}
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              复制
                            </Button>
                          </div>
                          <pre className="text-xs font-mono bg-emerald-50 p-3 rounded overflow-x-auto">
                            {formatJson(step.response)}
                          </pre>
                        </div>
                      )}

                      {step.error && (
                        <div>
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-sm font-semibold text-red-600 flex items-center gap-2">
                              <AlertCircle className="w-4 h-4" />
                              错误
                            </span>
                          </div>
                          <pre className="text-xs font-mono bg-red-50 p-3 rounded overflow-x-auto text-red-700">
                            {step.error}
                          </pre>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </div>
              </Collapsible>
            ))}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
