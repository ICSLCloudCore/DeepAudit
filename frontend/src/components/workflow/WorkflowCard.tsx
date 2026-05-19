/**
 * WorkflowCard Component
 * Cyberpunk Terminal Aesthetic
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2, Bug, Eye, GitBranch, Zap, Code, Lock, CheckCircle, Clock, AlertCircle } from "lucide-react";
import { Link } from "react-router-dom";
import type { Workflow } from "@/shared/types/workflow";
import { useState } from "react";
import { toast } from "sonner";
import { deleteWorkflow } from "@/shared/api/workflows";

interface WorkflowCardProps {
  workflow: Workflow;
  stats?: {
    by_stage: { analyze: number; white: number; black: number };
  };
  onRefresh: () => void;
  onEdit: () => void;
  onConfigure: (stage: "analyze" | "white" | "black") => void;
}

const STATUS_CONFIG: Record<string, { color: string; glowColor: string; label: string; filled: boolean; icon?: React.ReactNode }> = {
  completed: { color: "bg-emerald-500", glowColor: "#22c55e", label: "已完成", filled: true, icon: <CheckCircle className="w-3 h-3" /> },
  running: { color: "bg-sky-500 animate-pulse", glowColor: "#0ea5e9", label: "运行中", filled: true, icon: <Clock className="w-3 h-3" /> },
  configured: { color: "bg-gray-400", glowColor: "#9ca3af", label: "已配置", filled: true },
  not_configured: { color: "border-gray-400", glowColor: "#9ca3af", label: "未配置", filled: false },
  skipped: { color: "border-gray-400", glowColor: "#9ca3af", label: "已跳过", filled: false },
  failed: { color: "bg-red-500", glowColor: "#ef4444", label: "失败", filled: true, icon: <AlertCircle className="w-3 h-3" /> },
};

function formatDate(dateStr: string | undefined) {
  if (!dateStr) return "--";
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
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

export default function WorkflowCard({ workflow, stats, onRefresh, onEdit, onConfigure }: WorkflowCardProps) {
  const [loading, setLoading] = useState(false);

  const stages = [
    { key: "submitted", status: "completed", label: "送检", date: workflow.submitted_at },
    { key: "analyze", status: workflow.analyze_status, label: "威胁", date: workflow.analyze_started_at },
    { key: "white", status: workflow.white_status, label: "白盒", date: workflow.white_started_at },
    { key: "black", status: workflow.black_status, label: "黑盒", date: workflow.black_started_at },
    { key: "completed", status: workflow.overall_status === "completed" ? "completed" : "not_configured", label: "完成", date: workflow.completed_at },
  ];

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
  
  const auditTypeLabel = workflow.audit_type === 'baseline' ? '基线验证' : '差异验证';
  const validationModeLabel = workflow.validation_mode === 'wide' ? '广院模式' : '自验证模式';

  return (
    <div className="cyber-card flex flex-col h-full group">
      <div className="p-4 border-b border-border bg-muted/50 flex justify-between items-start">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 border border-border bg-muted rounded flex items-center justify-center">
            <GitBranch className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h3 className="font-bold text-base text-foreground group-hover:text-primary transition-colors">
              <Link to={`/workflows/${workflow.id}`}>{workflow.full_name}</Link>
            </h3>
            <div className="flex gap-2 mt-1">
              <Badge variant="outline" className="text-xs font-mono">{workflow.product_domain}</Badge>
              <Badge variant="outline" className="text-xs font-mono">{auditTypeLabel}</Badge>
            </div>
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
      <div className="p-4 flex-1 space-y-5">
        {/* Pipeline Progress - Vertical layout with dots above line */}
        <div className="relative py-3">
          {/* Gradient connector line - covers all 5 stages */}
          <div 
            className="absolute top-10 h-1.5 rounded-full overflow-hidden" 
            style={{ left: '14px', right: '14px' }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500/60 via-primary/70 to-amber-500/60" />
            <div className="absolute inset-0 bg-gradient-to-r from-violet-500/30 via-primary/40 to-amber-500/30 blur-sm" />
          </div>
          
          {/* Stage nodes */}
          <div className="flex justify-between items-start relative">
            {stages.map((stage, idx) => {
              const config = STATUS_CONFIG[stage.status] || STATUS_CONFIG.not_configured;
              
              return (
                <div 
                  key={stage.key} 
                  className="flex flex-col items-center min-w-[52px] max-w-[60px] group/stage"
                  style={{ marginLeft: idx === 0 ? 0 : undefined, marginRight: idx === stages.length - 1 ? 0 : undefined }}
                >
                  {/* Status dot */}
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center mb-3 ${
                      config.filled ? config.color : `border-2 ${config.color} bg-muted`
                    } cursor-pointer hover:scale-110 transition-all duration-200`}
                    style={config.filled ? { boxShadow: `0 0 12px ${config.glowColor}, 0 0 24px ${config.glowColor}40` } : {}}
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
                  
                  {/* Stage label - prominent */}
                  <span className="text-sm font-mono font-bold text-foreground uppercase tracking-wide mb-1">
                    {stage.label}
                  </span>
                  
                  {/* Status label */}
                  <span className="text-xs text-muted-foreground font-mono">
                    {config.label === "未配置" ? (
                      <span className="text-primary cursor-pointer hover:underline font-bold">点击配置</span>
                    ) : config.label}
                  </span>
                  
                  {/* Timestamp */}
                  <span className="text-xs text-muted-foreground font-mono opacity-70 mt-0.5">
                    {formatDate(stage.date)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Vulnerability Stats - 4-column grid */}
        <div className="grid grid-cols-4 gap-2 p-3 border border-border rounded-lg bg-muted/20">
          {/* Total - prominent */}
          <div className="flex flex-col items-center justify-center p-2 rounded bg-red-500/10 border border-red-500/20">
            <Bug className="w-4 h-4 text-red-400 mb-1" />
            <span className="text-lg font-bold font-mono text-red-400">{workflow.total_vulnerabilities || 0}</span>
            <span className="text-xs font-mono text-muted-foreground">漏洞总数</span>
          </div>
          
          {/* Analyze stage */}
          <div className="flex flex-col items-center justify-center p-2 rounded bg-violet-500/10 border border-violet-500/20">
            <Zap className="w-4 h-4 text-violet-400 mb-1" />
            <span className="text-base font-bold font-mono text-violet-400">{vulnByStage.analyze}</span>
            <span className="text-xs font-mono text-muted-foreground">威胁</span>
          </div>
          
          {/* White stage */}
          <div className="flex flex-col items-center justify-center p-2 rounded bg-primary/10 border border-primary/20">
            <Code className="w-4 h-4 text-primary mb-1" />
            <span className="text-base font-bold font-mono text-primary">{vulnByStage.white}</span>
            <span className="text-xs font-mono text-muted-foreground">白盒</span>
          </div>
          
          {/* Black stage */}
          <div className="flex flex-col items-center justify-center p-2 rounded bg-amber-500/10 border border-amber-500/20">
            <Lock className="w-4 h-4 text-amber-400 mb-1" />
            <span className="text-base font-bold font-mono text-amber-400">{vulnByStage.black}</span>
            <span className="text-xs font-mono text-muted-foreground">黑盒</span>
          </div>
        </div>
      </div>

      {/* Card Footer - 3 columns */}
      <div className="p-4 border-t border-border bg-muted/50 grid grid-cols-3 gap-2">
        <Link to={`/workflows/${workflow.id}`}>
          <Button variant="outline" className="w-full cyber-btn-outline h-8 text-xs">
            <Eye className="w-3 h-3 mr-1" />详情
          </Button>
        </Link>
        
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