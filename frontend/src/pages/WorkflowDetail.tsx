import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Play, Edit, Trash2, Bug, ExternalLink, RefreshCw, SkipForward, Undo } from "lucide-react";
import { toast } from "sonner";
import { 
  getWorkflow, 
  getWorkflowVulnerabilityStats, 
  deleteWorkflow, 
  skipWorkflowStage, 
  unskipWorkflowStage,
  startWorkflowStageAudit,
  updateWorkflowStageStatus
} from "@/shared/api/workflows";
import { getOpenCodeAuditTasks } from "@/shared/api/opencodeAuditTasks";
import type { Workflow, WorkflowVulnerabilityStats, WorkflowStageStatus } from "@/shared/types/workflow";
import ConfigureStageDialog from "@/components/workflow/ConfigureStageDialog";
import EditWorkflowDialog from "@/components/workflow/EditWorkflowDialog";

const STATUS_CONFIG: Record<string, { color: string; label: string; filled: boolean }> = {
  completed: { color: "bg-green-500", label: "已完成", filled: true },
  running: { color: "bg-blue-500 animate-pulse", label: "运行中", filled: true },
  configured: { color: "bg-gray-400", label: "已配置", filled: true },
  not_configured: { color: "border-gray-400", label: "未配置", filled: false },
  skipped: { color: "border-gray-400", label: "已跳过", filled: false },
  failed: { color: "bg-red-500", label: "失败", filled: true },
  cancelled: { color: "bg-orange-500", label: "已取消", filled: true },
};

function formatDate(dateStr: string | undefined) {
  if (!dateStr) return "--";
  const date = new Date(dateStr);
  return date.toLocaleDateString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function WorkflowDetail() {
  const { id } = useParams<{ id: string }>();
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [stats, setStats] = useState<WorkflowVulnerabilityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [pollingEnabled, setPollingEnabled] = useState(true);
  
  const [configureDialogOpen, setConfigureDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedStage, setSelectedStage] = useState<"analyze" | "white" | "black">("white");

  const workflowRef = useRef<Workflow | null>(null);
  useEffect(() => {
    workflowRef.current = workflow;
  }, [workflow]);

  const syncStageStatus = useCallback(async (workflowData: Workflow) => {
    if (!id) return;
    
    const stages = ["analyze", "white", "black"] as const;
    
    for (const stage of stages) {
      const projectId = workflowData[`${stage}_project_id`];
      const stageStatus = workflowData[`${stage}_status`];
      
      if (!projectId || stageStatus !== "running") continue;
      
      try {
        const tasks = await getOpenCodeAuditTasks({ project_id: projectId });
        
        const latestTask = tasks.sort((a, b) => 
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0];
        
        if (latestTask) {
          await updateWorkflowStageStatus(id, stage, latestTask.status as any);
        } else {
          await updateWorkflowStageStatus(id, stage, "cancelled");
        }
      } catch (error) {
        console.error(`Failed to sync stage ${stage}:`, error);
      }
    }
  }, [id]);

  const loadData = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const workflowData = await getWorkflow(id);
      setWorkflow(workflowData);
      
      await syncStageStatus(workflowData);
      
      const updatedWorkflow = await getWorkflow(id);
      setWorkflow(updatedWorkflow);
      
      const statsData = await getWorkflowVulnerabilityStats(id);
      setStats(statsData);
      
      const hasRunning = ["analyze", "white", "black"].some(
        s => updatedWorkflow[`${s}_status`] === "running"
      );
      if (hasRunning) {
        setPollingEnabled(true);
      }
    } catch (error) {
      toast.error("加载工作流详情失败");
    } finally {
      setLoading(false);
    }
  }, [id, syncStageStatus]);

  useEffect(() => {
    if (id) loadData();
  }, [id, loadData]);

  useEffect(() => {
    if (!id || !pollingEnabled) return;
    
    const checkAndPoll = async () => {
      const currentWorkflow = workflowRef.current;
      if (!currentWorkflow) return;
      
      const hasRunningStage = ["analyze", "white", "black"].some(
        stage => currentWorkflow[`${stage}_status`] === "running"
      );
      
      if (!hasRunningStage) {
        setPollingEnabled(false);
        return;
      }
      
      try {
        await syncStageStatus(currentWorkflow);
        
        const updatedWorkflow = await getWorkflow(id);
        setWorkflow(updatedWorkflow);
        
        const stillRunning = ["analyze", "white", "black"].some(
          stage => updatedWorkflow[`${stage}_status`] === "running"
        );
        
        if (!stillRunning) {
          setPollingEnabled(false);
        }
        
        const statsData = await getWorkflowVulnerabilityStats(id);
        setStats(statsData);
      } catch (error) {
        console.error("Polling error:", error);
      }
    };
    
    const pollInterval = setInterval(checkAndPoll, 10000);
    
    return () => clearInterval(pollInterval);
  }, [id, pollingEnabled, syncStageStatus]);

  useEffect(() => {
    return () => setPollingEnabled(false);
  }, []);

  const handleStart = async (stage: "analyze" | "white" | "black") => {
    if (!workflow) return;
    const stageStatus = workflow[`${stage}_status`] as WorkflowStageStatus;
    
    if (stageStatus === "not_configured") {
      setSelectedStage(stage);
      setConfigureDialogOpen(true);
      return;
    }
    
    if (stageStatus === "skipped") {
      toast.error("已跳过的阶段不可启动");
      return;
    }
    
    if (stageStatus === "running") {
      toast.info("阶段正在运行中，请点击项目详情查看进度");
      return;
    }
    
    try {
      await startWorkflowStageAudit(workflow.id, stage);
      toast.success("审计已启动");
      setPollingEnabled(true);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "启动失败");
    }
  };

  const handleSkip = async (stage: "analyze" | "black") => {
    if (!workflow) return;
    try {
      await skipWorkflowStage(workflow.id, stage);
      toast.success(`${stage === "analyze" ? "威胁分析" : "黑盒分析"}阶段已跳过`);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "跳过失败");
    }
  };

  const handleUnskip = async (stage: "analyze" | "black") => {
    if (!workflow) return;
    try {
      await unskipWorkflowStage(workflow.id, stage);
      toast.success(`${stage === "analyze" ? "威胁分析" : "黑盒分析"}阶段已取消跳过`);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "取消跳过失败");
    }
  };

  const handleDelete = async () => {
    if (!workflow) return;
    if (!confirm("确定要删除此工作流吗？删除后将同时删除关联的三个项目及任务数据。")) return;
    
    try {
      await deleteWorkflow(workflow.id);
      toast.success("工作流已删除");
      window.location.href = "/workflows";
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "删除失败");
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-muted-foreground">加载中...</div>;
  }

  if (!workflow) {
    return <div className="p-6 text-center text-muted-foreground">工作流不存在</div>;
  }

  const stages = [
    { key: "submitted", status: "completed", label: "送检", date: workflow.submitted_at },
    { key: "analyze", status: workflow.analyze_status, label: "威胁", date: workflow.analyze_started_at, project_id: workflow.analyze_project_id },
    { key: "white", status: workflow.white_status, label: "白盒", date: workflow.white_started_at, project_id: workflow.white_project_id },
    { key: "black", status: workflow.black_status, label: "黑盒", date: workflow.black_started_at, project_id: workflow.black_project_id },
    { key: "completed", status: workflow.overall_status === "completed" ? "completed" : "not_configured", label: "完成", date: workflow.completed_at },
  ];

  const renderStageButtons = (stage: "analyze" | "white" | "black", projectId: string | undefined, status: string) => {
    const canRestart = status === "completed" || status === "cancelled" || status === "failed";
    
    return (
      <div className="flex flex-wrap gap-2 mt-4">
        {/* 配置并启动 */}
        {status === "not_configured" && (
          <Button size="sm" onClick={() => handleStart(stage)}>
            <Play className="w-4 h-4 mr-1" /> 配置并启动
          </Button>
        )}
        
        {/* 启动审计 */}
        {status === "configured" && (
          <Button size="sm" onClick={() => handleStart(stage)}>
            <Play className="w-4 h-4 mr-1" /> 启动审计
          </Button>
        )}
        
        {/* 重新启动 */}
        {canRestart && (
          <>
            <Button size="sm" onClick={() => handleStart(stage)}>
              <Play className="w-4 h-4 mr-1" /> 重新启动
            </Button>
            {projectId && (
              <Link to={`/projects/${projectId}`}>
                <Button size="sm" variant="outline">
                  <ExternalLink className="w-4 h-4 mr-1" /> 项目详情
                </Button>
              </Link>
            )}
          </>
        )}
        
        {/* 运行中 */}
        {status === "running" && projectId && (
          <Link to={`/projects/${projectId}`}>
            <Button size="sm" className="cyber-btn-primary">
              <ExternalLink className="w-4 h-4 mr-1" /> 项目详情
            </Button>
          </Link>
        )}
        
        {/* 跳过按钮（仅威胁和黑盒） */}
        {stage !== "white" && status !== "skipped" && status !== "running" && !canRestart && (
          <Button size="sm" variant="outline" onClick={() => handleSkip(stage as "analyze" | "black")}>
            <SkipForward className="w-4 h-4 mr-1" /> 跳过
          </Button>
        )}
        
        {/* 取消跳过 */}
        {stage !== "white" && status === "skipped" && (
          <Button size="sm" variant="outline" onClick={() => handleUnskip(stage as "analyze" | "black")}>
            <Undo className="w-4 h-4 mr-1" /> 取消跳过
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link to="/workflows">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" /> 返回
            </Button>
          </Link>
          <h1 className="text-2xl font-bold" style={{ color: "var(--cyber-text)" }}>{workflow.name}</h1>
          <Badge variant={workflow.overall_status === "completed" ? "default" : "secondary"}>
            {workflow.overall_status === "completed" ? "已完成" : workflow.overall_status === "in_progress" ? "进行中" : "就绪"}
          </Badge>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
          <Button variant="outline" size="sm" onClick={() => setEditDialogOpen(true)}>
            <Edit className="w-4 h-4 mr-1" /> 编辑
          </Button>
          <Button variant="destructive" size="sm" onClick={handleDelete}>
            <Trash2 className="w-4 h-4 mr-1" /> 删除
          </Button>
        </div>
      </div>

      {workflow.description && (
        <p className="text-muted-foreground">{workflow.description}</p>
      )}

      <Card className="p-6" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
        <h3 className="font-semibold mb-4" style={{ color: "var(--cyber-text)" }}>流程进度</h3>
        
        <div className="flex items-center justify-between mb-6 relative">
          <div className="absolute top-1/2 left-0 right-0 h-0.5 bg-gray-300 -translate-y-1/2" />
          
          {stages.map((stage) => {
            const config = STATUS_CONFIG[stage.status] || STATUS_CONFIG.not_configured;
            return (
              <div key={stage.key} className="flex flex-col items-center z-10">
                <div
                  className={`w-6 h-6 rounded-full ${config.filled ? config.color : `border-2 ${config.color}`} cursor-pointer hover:scale-125 transition-transform`}
                  title={`${stage.label}: ${config.label}`}
                />
                <span className="text-sm font-medium mt-2" style={{ color: "var(--cyber-text)" }}>{stage.label}</span>
                <span className="text-xs text-muted-foreground">{config.label}</span>
                <span className="text-xs text-muted-foreground">{formatDate(stage.date)}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {stats && (
        <Card className="p-6" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
          <h3 className="font-semibold mb-4" style={{ color: "var(--cyber-text)" }}>
            <Bug className="w-4 h-4 mr-2 inline" /> 漏洞统计
          </h3>
          
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">漏洞总数</p>
              <p className="text-2xl font-bold text-red-400">{stats.vulnerabilities.total}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">威胁分析</p>
              <p className="text-xl font-semibold" style={{ color: "var(--cyber-text)" }}>
                {stats.vulnerabilities.by_stage.analyze || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">白盒分析</p>
              <p className="text-xl font-semibold" style={{ color: "var(--cyber-text)" }}>
                {stats.vulnerabilities.by_stage.white || 0}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">黑盒分析</p>
              <p className="text-xl font-semibold" style={{ color: "var(--cyber-text)" }}>
                {stats.vulnerabilities.by_stage.black || 0}
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Critical</p>
              <p className="text-lg font-bold text-red-500">{stats.vulnerabilities.by_severity.critical || 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">High</p>
              <p className="text-lg font-bold text-orange-500">{stats.vulnerabilities.by_severity.high || 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Medium</p>
              <p className="text-lg font-bold text-yellow-500">{stats.vulnerabilities.by_severity.medium || 0}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Low</p>
              <p className="text-lg font-bold text-blue-500">{stats.vulnerabilities.by_severity.low || 0}</p>
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* 威胁分析阶段 */}
        <Card className="p-4" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
          <h4 className="font-semibold mb-2" style={{ color: "var(--cyber-text)" }}>威胁分析阶段</h4>
          <p className="text-sm text-muted-foreground mb-2">状态: {STATUS_CONFIG[workflow.analyze_status]?.label || workflow.analyze_status}</p>
          {workflow.analyze_tech_stack && workflow.analyze_tech_stack.length > 0 && (
            <p className="text-sm text-muted-foreground mb-2">技术栈: {workflow.analyze_tech_stack.join(", ")}</p>
          )}
          {renderStageButtons("analyze", workflow.analyze_project_id, workflow.analyze_status)}
        </Card>

        {/* 白盒分析阶段 */}
        <Card className="p-4" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
          <h4 className="font-semibold mb-2" style={{ color: "var(--cyber-text)" }}>白盒分析阶段</h4>
          <p className="text-sm text-muted-foreground mb-2">状态: {STATUS_CONFIG[workflow.white_status]?.label || workflow.white_status}</p>
          {workflow.white_tech_stack && workflow.white_tech_stack.length > 0 && (
            <p className="text-sm text-muted-foreground mb-2">技术栈: {workflow.white_tech_stack.join(", ")}</p>
          )}
          {renderStageButtons("white", workflow.white_project_id, workflow.white_status)}
        </Card>

        {/* 黑盒分析阶段 */}
        <Card className="p-4" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
          <h4 className="font-semibold mb-2" style={{ color: "var(--cyber-text)" }}>黑盒分析阶段</h4>
          <p className="text-sm text-muted-foreground mb-2">状态: {STATUS_CONFIG[workflow.black_status]?.label || workflow.black_status}</p>
          {workflow.black_tech_stack && workflow.black_tech_stack.length > 0 && (
            <p className="text-sm text-muted-foreground mb-2">技术栈: {workflow.black_tech_stack.join(", ")}</p>
          )}
          {renderStageButtons("black", workflow.black_project_id, workflow.black_status)}
        </Card>
      </div>

      <ConfigureStageDialog
        open={configureDialogOpen}
        workflow={workflow}
        stage={selectedStage}
        onClose={() => setConfigureDialogOpen(false)}
        onSuccess={loadData}
      />

      <EditWorkflowDialog
        open={editDialogOpen}
        workflow={workflow}
        onClose={() => setEditDialogOpen(false)}
        onSuccess={loadData}
      />
    </div>
  );
}