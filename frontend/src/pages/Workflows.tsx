/**
 * Workflows Page
 * Cyberpunk Terminal Aesthetic
 */

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, RefreshCw, GitBranch, Terminal } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
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

  const handleConfigure = (workflow: Workflow, stage: "analyze" | "white" | "black") => {
    setSelectedWorkflow(workflow);
    setSelectedStage(stage);
    setConfigureDialogOpen(true);
  };

  const handleEdit = (workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setEditDialogOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="loading-spinner mx-auto" />
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">加载工作流数据...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 bg-background min-h-screen font-mono relative">
      {/* Grid background */}
      <div className="absolute inset-0 cyber-grid-subtle pointer-events-none" />

      {/* Header */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-3">
          <GitBranch className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold font-mono uppercase tracking-wider text-foreground">
            工作流管理
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadData} disabled={loading} className="cyber-btn-outline h-10">
            <RefreshCw className="w-4 h-4 mr-1" /> 刷新
          </Button>
          <Button onClick={() => setCreateDialogOpen(true)} className="cyber-btn-primary h-10">
            <Plus className="w-4 h-4 mr-1" /> 新建工作流
          </Button>
        </div>
      </div>

      {/* Stats Section */}
      {stats && <WorkflowStats stats={stats} />}

      {/* Search and Filter */}
      <div className="cyber-card p-4 flex items-center gap-4 relative z-10">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4 z-10" />
          <Input
            placeholder="搜索工作流..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="cyber-input !pl-10"
          />
        </div>
      </div>

      {/* Workflow List */}
      {filteredWorkflows.length === 0 ? (
        <div className="cyber-card p-16 text-center border-dashed relative z-10">
          <GitBranch className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-xl font-bold text-foreground mb-2">
            {searchQuery ? '未找到匹配项' : '暂无工作流'}
          </h3>
          <p className="text-muted-foreground font-mono mb-6">
            {searchQuery ? '调整搜索参数' : '创建第一个工作流开始审计流程'}
          </p>
          {!searchQuery && (
            <Button onClick={() => setCreateDialogOpen(true)} className="cyber-btn-primary">
              <Plus className="w-4 h-4 mr-2" />
              新建工作流
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 relative z-10">
          {filteredWorkflows.map((workflow) => (
            <WorkflowCard
              key={workflow.id}
              workflow={workflow}
              stats={workflowStats.get(workflow.id)?.vulnerabilities}
              onRefresh={loadData}
              onEdit={() => handleEdit(workflow)}
              onConfigure={(stage) => handleConfigure(workflow, stage)}
            />
          ))}
        </div>
      )}

      {/* Dialogs */}
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