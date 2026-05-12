/**
 * WorkflowCard Component
 * Cyberpunk Terminal Aesthetic
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Edit, Trash2, Bug, Eye, MoreHorizontal, SkipForward, Calendar, GitBranch, Zap, Code, Lock, CheckCircle, Clock, AlertCircle, Terminal } from "lucide-react";
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

const STATUS_CONFIG: Record<string, { color: string; label: string; filled: boolean; icon?: React.ReactNode }> = {
  completed: { color: "bg-emerald-500", label: "已完成", filled: true, icon: <CheckCircle className="w-3 h-3" /> },
  running: { color: "bg-sky-500 animate-pulse", label: "运行中", filled: true, icon: <Clock className="w-3 h-3" /> },
  configured: { color: "bg-gray-400", label: "已配置", filled: true },
  not_configured: { color: "border-gray-400", label: "未配置", filled: false },
  skipped: { color: "border-gray-400", label: "已跳过", filled: false },
  failed: { color: "bg-red-500", label: "失败", filled: true, icon: <AlertCircle className="w-3 h-3" /> },
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

function getOverallStatusLabel(status: string): string {
  switch (status) {
    case "completed": return "已完成";
    case "in_progress": return "进行中";
    case "ready": return "就绪";
    case "draft": return "草稿";
    default: return "未知";
  }
}

function getOverallStatusBadgeClass(status: string): string {
  switch (status) {
    case "completed": return "cyber-badge-success";
    case "in_progress": return "cyber-badge-info";
    case "ready": return "cyber-badge-warning";
    default: return "cyber-badge-muted";
  }
}

function getStageIcon(stage: string) {
  switch (stage) {
    case "analyze": return <Zap className="w-3 h-3" />;
    case "white": return <Code className="w-3 h-3" />;
    case "black": return <Lock className="w-3 h-3" />;
    default: return null;
  }
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
    <div className="cyber-card flex flex-col h-full group">
      {/* Card Header */}
      <div className="p-4 border-b border-border bg-muted/50 flex justify-between items-start">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 border border-border bg-muted rounded flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
              <Link to={`/workflows/${workflow.id}`}>{workflow.name}</Link>
            </h3>
            {workflow.description && (
              <p className="text-xs text-muted-foreground font-mono line-clamp-1 border-l-2 border-border pl-2 mt-1">
                {workflow.description}
              </p>
            )}
          </div>
        </div>
        <Badge className={getOverallStatusBadgeClass(workflow.overall_status || "draft")}>
          {getOverallStatusLabel(workflow.overall_status || "draft")}
        </Badge>
      </div>

      {/* Card Body - Pipeline */}
      <div className="p-4 flex-1 space-y-4">
        {/* Pipeline Progress */}
        <div className="flex items-center justify-between relative">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-muted -translate-y-1/2" />
          
          {stages.map((stage) => {
            const config = STATUS_CONFIG[stage.status] || STATUS_CONFIG.not_configured;
            const techDisplay = stage.key !== "submitted" && stage.key !== "completed" 
              ? getStageTechDisplay(workflow, stage.key as "analyze" | "white" | "black")
              : "";
            
            return (
              <div key={stage.key} className="flex flex-col items-center z-10 group/stage">
                <div
                  className={`w-5 h-5 rounded-full flex items-center justify-center ${
                    config.filled ? config.color : `border-2 ${config.color} bg-muted`
                  } cursor-pointer hover:scale-125 transition-all`}
                  title={`${stage.label}: ${config.label}`}
                  onClick={() => {
                    if (stage.key === "analyze" || stage.key === "white" || stage.key === "black") {
                      const stageKey = stage.key as "analyze" | "white" | "black";
                      if (workflow[`${stageKey}_status`] === "not_configured") {
                        onConfigure(stageKey);
                      }
                    }
                  }}
                >
                  {config.icon && <span className="text-white">{config.icon}</span>}
                </div>
                <span className="text-xs font-mono font-bold text-muted-foreground mt-1 uppercase">{stage.label}</span>
                <span className="text-xs text-muted-foreground">
                  {config.label === "未配置" ? (
                    <span className="text-primary cursor-pointer hover:underline">点击补充</span>
                  ) : config.label}
                </span>
                {techDisplay && (
                  <span className="text-xs font-mono text-primary font-bold">{techDisplay}</span>
                )}
                <span className="text-xs text-muted-foreground">{formatDate(stage.date)}</span>
              </div>
            );
          })}
        </div>

        {/* Vulnerability Stats */}
        <div className="flex items-center gap-2 bg-muted/30 p-2 border border-border rounded">
          <Bug className="w-4 h-4 text-red-400" />
          <span className="text-sm font-mono">
            漏洞总数: <span className="font-bold text-red-400">{workflow.total_vulnerabilities || 0}</span>
          </span>
          <span className="text-xs text-muted-foreground font-mono ml-auto">
            威胁:{vulnByStage.analyze} | 白盒:{vulnByStage.white} | 黑盒:{vulnByStage.black}
          </span>
        </div>

        {/* Tech Stack Tags */}
        <div className="flex flex-wrap gap-1">
          {workflow.analyze_tech_stack && workflow.analyze_tech_stack.length > 0 && (
            workflow.analyze_tech_stack.slice(0, 2).map((tech) => (
              <span key={`analyze-${tech}`} className="text-xs font-mono font-bold border border-violet-500/30 px-1.5 py-0.5 bg-violet-500/10 text-violet-400 rounded">
                <Zap className="w-3 h-3 inline mr-0.5" />{tech}
              </span>
            ))
          )}
          {workflow.white_tech_stack && workflow.white_tech_stack.length > 0 && (
            workflow.white_tech_stack.slice(0, 2).map((tech) => (
              <span key={`white-${tech}`} className="text-xs font-mono font-bold border border-primary/30 px-1.5 py-0.5 bg-primary/10 text-primary rounded">
                <Code className="w-3 h-3 inline mr-0.5" />{tech}
              </span>
            ))
          )}
          {workflow.black_tech_stack && workflow.black_tech_stack.length > 0 && (
            workflow.black_tech_stack.slice(0, 2).map((tech) => (
              <span key={`black-${tech}`} className="text-xs font-mono font-bold border border-amber-500/30 px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded">
                <Lock className="w-3 h-3 inline mr-0.5" />{tech}
              </span>
            ))
          )}
        </div>
      </div>

      {/* Card Footer */}
      <div className="p-4 border-t border-border bg-muted/50 grid grid-cols-4 gap-2">
        <Link to={`/workflows/${workflow.id}`}>
          <Button variant="outline" className="w-full cyber-btn-outline h-8 text-xs">
            <Eye className="w-3 h-3 mr-1" />详情
          </Button>
        </Link>
        
        <div className="relative">
          <Button 
            size="sm" 
            className="w-full cyber-btn-primary h-8 text-xs"
            onClick={() => setShowMenu(!showMenu)}
            disabled={loading}
          >
            <Play className="w-3 h-3 mr-1" />启动
          </Button>
          
          {showMenu && (
            <div 
              className="absolute left-0 top-full mt-1 bg-card border rounded-md shadow-lg z-20 py-1 min-w-[100px]"
              style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}
            >
              {workflow.analyze_status !== "skipped" && (
                <button
                  className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted flex items-center gap-2 font-mono"
                  onClick={() => { setShowMenu(false); handleStart("analyze"); }}
                  disabled={workflow.analyze_status === "running"}
                >
                  <Zap className="w-3 h-3 text-violet-400" /> 威胁
                </button>
              )}
              <button
                className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted flex items-center gap-2 font-mono"
                onClick={() => { setShowMenu(false); handleStart("white"); }}
                disabled={workflow.white_status === "running"}
              >
                <Code className="w-3 h-3 text-primary" /> 白盒
              </button>
              {workflow.black_status !== "skipped" && (
                <button
                  className="w-full px-3 py-1.5 text-xs text-left hover:bg-muted flex items-center gap-2 font-mono"
                  onClick={() => { setShowMenu(false); handleStart("black"); }}
                  disabled={workflow.black_status === "running"}
                >
                  <Lock className="w-3 h-3 text-amber-400" /> 黑盒
                </button>
              )}
            </div>
          )}
        </div>
        
        <Button size="sm" variant="outline" className="cyber-btn-outline h-8" onClick={onEdit} disabled={loading}>
          <Edit className="w-3 h-3" />
        </Button>
        <Button size="sm" variant="outline" className="cyber-btn-outline h-8 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30" onClick={handleDelete} disabled={loading}>
          <Trash2 className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}