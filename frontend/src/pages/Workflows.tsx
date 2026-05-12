import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { getWorkflows, getWorkflowStats, getWorkflowVulnerabilityStats } from "@/shared/api/workflows";
import type { Workflow, WorkflowDashboardStats, WorkflowVulnerabilityStats } from "@/shared/types/workflow";
import WorkflowStats from "@/components/workflow/WorkflowStats";
import WorkflowCard from "@/components/workflow/WorkflowCard";
import CreateWorkflowDialog from "@/components/workflow/CreateWorkflowDialog";
import ConfigureStageDialog from "@/components/workflow/ConfigureStageDialog";
import EditWorkflowDialog from "@/components/workflow/EditWorkflowDialog";

export default function Workflows() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [workflowStats, setWorkflowStats] = useState<Map<string, WorkflowVulnerabilityStats>>(new Map());
  const [stats, setStats] = useState<WorkflowDashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [configureDialogOpen, setConfigureDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [selectedStage, setSelectedStage] = useState<"analyze" | "white" | "black">("white");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [workflowData, statsData] = await Promise.all([
        getWorkflows(),
        getWorkflowStats(),
      ]);
      setWorkflows(workflowData.workflows);
      setStats(statsData);
      
      const statsMap = new Map<string, WorkflowVulnerabilityStats>();
      for (const wf of workflowData.workflows) {
        const vulnStats = await getWorkflowVulnerabilityStats(wf.id);
        statsMap.set(wf.id, vulnStats);
      }
      setWorkflowStats(statsMap);
    } catch (error) {
      toast.error("加载工作流数据失败");
    } finally {
      setLoading(false);
    }
  };

  const filteredWorkflows = workflows.filter((wf) =>
    wf.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleConfigure = (stage: "analyze" | "white" | "black") => {
    setSelectedStage(stage);
    setConfigureDialogOpen(true);
  };

  const handleEdit = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setEditDialogOpen(true);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: "var(--cyber-text)" }}>
          工作流管理
        </h1>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> 新建工作流
          </Button>
        </div>
      </div>

      {stats && <WorkflowStats stats={stats} />}

      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="搜索工作流..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : filteredWorkflows.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          {searchQuery ? "未找到匹配的工作流" : "暂无工作流，点击新建创建第一个工作流"}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filteredWorkflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              stats={workflowStats.get(workflow.id)?.vulnerabilities}
              onRefresh={loadData}
              onEdit={() => handleEdit(workflow)}
              onConfigure={handleConfigure}
            />
          ))}
        </div>
      )}

      <CreateWorkflowDialog
        open={createDialogOpen}
        onClose={() => setCreateDialogOpen(false)}
        onSuccess={loadData}
      />

      <ConfigureStageDialog
        open={configureDialogOpen}
        workflow={selectedWorkflow}
        stage={selectedStage}
        onClose={() => {
          setConfigureDialogOpen(false);
          setSelectedWorkflow(null);
        }}
        onSuccess={loadData}
      />

      <EditWorkflowDialog
        open={editDialogOpen}
        workflow={selectedWorkflow}
        onClose={() => {
          setEditDialogOpen(false);
          setSelectedWorkflow(null);
        }}
        onSuccess={loadData}
      />
    </div>
  );
}