import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Edit, Trash2, Bug, Eye, MoreHorizontal, SkipForward } from "lucide-react";
import { Link } from "react-router-dom";
import type { Workflow, WorkflowStageStatus } from "@/shared/types/workflow";
import { useState } from "react";
import { toast } from "sonner";
import { startWorkflowStage, deleteWorkflow, skipWorkflowStage } from "@/shared/api/workflows";

interface WorkflowCardProps {
  workflow: Workflow;
  stats?: {
    by_stage: { analyze: number; white: number; black: number };
  };
  onRefresh: () => void;
  onEdit: () => void;
  onConfigure: (stage: "analyze" | "white" | "black") => void;
}

const STATUS_CONFIG: Record<string, { color: string; label: string; filled: boolean }> = {
  completed: { color: "bg-green-500", label: "已完成", filled: true },
  running: { color: "bg-blue-500 animate-pulse", label: "运行中", filled: true },
  configured: { color: "bg-gray-400", label: "已配置", filled: true },
  not_configured: { color: "border-gray-400", label: "未配置", filled: false },
  skipped: { color: "border-gray-400", label: "已跳过", filled: false },
  failed: { color: "bg-red-500", label: "失败", filled: true },
};

function formatDate(dateStr: string | undefined) {
  if (!dateStr) return "--";
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function getStageTechDisplay(workflow: Workflow, stage: "analyze" | "white" | "black"): string {
  const techStack = workflow[`${stage}_tech_stack`];
  if (techStack && techStack.length > 0) {
    return techStack.slice(0, 2).join("+");
  }
  return "";
}

export default function WorkflowCard({ workflow, stats, onRefresh, onEdit, onConfigure }: WorkflowCardProps) {
  const [loading, setLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  const stages = [
    { key: "submitted", status: "completed", label: "送检", date: workflow.submitted_at },
    { key: "analyze", status: workflow.analyze_status, label: "威胁", date: workflow.analyze_started_at },
    { key: "white", status: workflow.white_status, label: "白盒", date: workflow.white_started_at },
    { key: "black", status: workflow.black_status, label: "黑盒", date: workflow.black_started_at },
    { key: "completed", status: workflow.overall_status === "completed" ? "completed" : "not_configured", label: "完成", date: workflow.completed_at },
  ];

  const handleStart = async (stage: "analyze" | "white" | "black") => {
    const stageStatus = workflow[`${stage}_status`] as WorkflowStageStatus;
    if (stageStatus === "not_configured") {
      onConfigure(stage);
      return;
    }
    if (stageStatus === "skipped") {
      toast.error("已跳过的阶段不可启动，请先取消跳过状态");
      return;
    }
    if (stageStatus === "running") {
      toast.error("阶段正在运行中");
      return;
    }
    
    setLoading(true);
    try {
      await startWorkflowStage(workflow.id, stage);
      toast.success(`${stage === "analyze" ? "威胁分析" : stage === "white" ? "白盒分析" : "黑盒分析"}阶段已启动`);
      onRefresh();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "启动失败");
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = async (stage: "analyze" | "black") => {
    setLoading(true);
    try {
      await skipWorkflowStage(workflow.id, stage);
      toast.success(`${stage === "analyze" ? "威胁分析" : "黑盒分析"}阶段已跳过`);
      onRefresh();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "跳过失败");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("确定要删除此工作流吗？删除后将同时删除关联的三个项目及任务数据。")) return;
    
    setLoading(true);
    try {
      await deleteWorkflow(workflow.id);
      toast.success("工作流已删除");
      onRefresh();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "删除失败");
    } finally {
      setLoading(false);
    }
  };

  const vulnByStage = stats?.by_stage || { analyze: 0, white: 0, black: 0 };

  return (
    <Card className="p-4" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-lg" style={{ color: "var(--cyber-text)" }}>{workflow.name}</h3>
          {workflow.description && <p className="text-sm text-muted-foreground">{workflow.description}</p>}
        </div>
        <Badge variant={workflow.overall_status === "completed" ? "default" : "secondary"}>
          {workflow.overall_status === "completed" ? "已完成" : workflow.overall_status === "in_progress" ? "进行中" : "就绪"}
        </Badge>
      </div>

      <div className="flex items-center justify-between mb-4 relative">
        <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-300 -translate-y-1/2" />
        
        {stages.map((stage) => {
          const config = STATUS_CONFIG[stage.status] || STATUS_CONFIG.not_configured;
          const techDisplay = stage.key !== "submitted" && stage.key !== "completed" 
            ? getStageTechDisplay(workflow, stage.key as "analyze" | "white" | "black")
            : "";
          
          return (
            <div key={stage.key} className="flex flex-col items-center z-10">
              <div
                className={`w-4 h-4 rounded-full ${config.filled ? config.color : `border-2 ${config.color}`} cursor-pointer hover:scale-125 transition-transform`}
                title={`${stage.label}: ${config.label}`}
                onClick={() => {
                  if (stage.key === "analyze" || stage.key === "white" || stage.key === "black") {
                    const stageKey = stage.key as "analyze" | "white" | "black";
                    if (workflow[`${stageKey}_status`] === "not_configured") {
                      onConfigure(stageKey);
                    }
                  }
                }}
              />
              <span className="text-xs text-muted-foreground mt-1">{stage.label}</span>
              <span className="text-xs text-muted-foreground">
                {config.label === "未配置" ? "点击补充" : config.label}
              </span>
              {techDisplay && (
                <span className="text-xs text-primary">{techDisplay}</span>
              )}
              <span className="text-xs text-muted-foreground">{formatDate(stage.date)}</span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug className="w-4 h-4 text-red-400" />
          <span className="text-sm">
            漏洞总数: <span className="font-bold text-red-400">{workflow.total_vulnerabilities || 0}</span>
            <span className="text-xs text-muted-foreground ml-1">
              (威胁:{vulnByStage.analyze} | 白盒:{vulnByStage.white} | 黑盒:{vulnByStage.black})
            </span>
          </span>
        </div>

        <div className="flex gap-1">
          <Link to={`/workflows/${workflow.id}`}>
            <Button size="sm" variant="ghost" title="详情">
              <Eye className="w-4 h-4" />
            </Button>
          </Link>
          <Button size="sm" variant="outline" onClick={onEdit} disabled={loading} title="编辑">
            <Edit className="w-4 h-4" />
          </Button>
          
          <div className="relative">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={() => setShowMenu(!showMenu)}
              disabled={loading}
              title="更多操作"
            >
              <MoreHorizontal className="w-4 h-4" />
            </Button>
            
            {showMenu && (
              <div 
                className="absolute right-0 top-full mt-1 bg-card border rounded-md shadow-lg z-20 py-1 min-w-[120px]"
                style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}
              >
                <button
                  className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
                  onClick={() => { setShowMenu(false); handleStart("analyze"); }}
                  disabled={workflow.analyze_status === "running"}
                >
                  <Play className="w-3 h-3" /> 启动威胁
                </button>
                <button
                  className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
                  onClick={() => { setShowMenu(false); handleStart("white"); }}
                  disabled={workflow.white_status === "running"}
                >
                  <Play className="w-3 h-3" /> 启动白盒
                </button>
                <button
                  className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
                  onClick={() => { setShowMenu(false); handleStart("black"); }}
                  disabled={workflow.black_status === "running"}
                >
                  <Play className="w-3 h-3" /> 启动黑盒
                </button>
                {workflow.analyze_status !== "skipped" && workflow.analyze_status !== "running" && (
                  <button
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
                    onClick={() => { setShowMenu(false); handleSkip("analyze"); }}
                  >
                    <SkipForward className="w-3 h-3" /> 跳过威胁
                  </button>
                )}
                {workflow.black_status !== "skipped" && workflow.black_status !== "running" && (
                  <button
                    className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted flex items-center gap-2"
                    onClick={() => { setShowMenu(false); handleSkip("black"); }}
                  >
                    <SkipForward className="w-3 h-3" /> 跳过黑盒
                  </button>
                )}
                <div className="border-t my-1" style={{ borderColor: "var(--cyber-border)" }} />
                <button
                  className="w-full px-3 py-1.5 text-sm text-left hover:bg-muted text-red-500 flex items-center gap-2"
                  onClick={() => { setShowMenu(false); handleDelete(); }}
                >
                  <Trash2 className="w-3 h-3" /> 删除
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}