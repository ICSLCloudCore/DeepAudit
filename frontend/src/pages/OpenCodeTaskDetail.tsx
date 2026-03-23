/**
 * OpenCode Task Detail Page
 * OpenCode 审计任务详情页
 */

import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  ArrowLeft,
  Calendar,
  CheckCircle,
  Activity,
  Shield,
  AlertTriangle,
  Clock,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  getOpenCodeAuditTask,
  getOpenCodeFindings,
  type OpenCodeAuditTask,
  type OpenCodeFinding,
} from "@/shared/api/opencodeAuditTasks";
import FindingsList from "./OpenCodeTaskDetail/components/FindingsList";
import FindingDetail from "./OpenCodeTaskDetail/components/FindingDetail";

type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";

export default function OpenCodeTaskDetail() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();

  const [task, setTask] = useState<OpenCodeAuditTask | null>(null);
  const [findings, setFindings] = useState<OpenCodeFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [selectedFinding, setSelectedFinding] = useState<OpenCodeFinding | null>(null);

  useEffect(() => {
    if (taskId) {
      loadTaskData(taskId);
    }
  }, [taskId]);

  const loadTaskData = async (id: string) => {
    try {
      setLoading(true);
      const [taskData, findingsData] = await Promise.all([
        getOpenCodeAuditTask(id),
        getOpenCodeFindings(id),
      ]);
      setTask(taskData);
      setFindings(findingsData);
    } catch (error) {
      console.error("Failed to load task data:", error);
      toast.error("加载任务数据失败");
    } finally {
      setLoading(false);
    }
  };

  const filteredFindings = severityFilter === "all"
    ? findings
    : findings.filter(f => f.severity === severityFilter);

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "text-rose-500";
      case "high": return "text-orange-500";
      case "medium": return "text-yellow-500";
      case "low": return "text-green-500";
      default: return "text-muted-foreground";
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="cyber-badge-success">完成</Badge>;
      case 'running':
        return <Badge className="cyber-badge-info">运行中</Badge>;
      case 'failed':
        return <Badge className="cyber-badge-danger">失败</Badge>;
      case 'cancelled':
        return <Badge className="cyber-badge-muted">已取消</Badge>;
      default:
        return <Badge className="cyber-badge-muted">等待中</Badge>;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="loading-spinner mx-auto" />
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">加载任务数据...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="cyber-card p-16 text-center">
        <AlertTriangle className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-xl font-bold text-foreground mb-2">任务不存在</h3>
        <Button className="cyber-btn-primary" onClick={() => navigate("/audit-tasks")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          返回任务列表
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 cyber-bg-elevated min-h-screen font-mono relative">
      <div className="absolute inset-0 cyber-grid-subtle pointer-events-none" />

      {/* Header */}
      <div className="relative z-10">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => navigate("/audit-tasks")}
              className="cyber-btn-outline h-9"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              返回
            </Button>
            <div>
              <h1 className="text-2xl font-bold text-foreground uppercase tracking-wide">
                {task.name || 'OpenCode 审计任务'}
              </h1>
              <p className="text-muted-foreground font-mono text-sm">
                {task.project?.name || '未知项目'}
              </p>
            </div>
          </div>
          {getStatusBadge(task.status)}
        </div>

        {/* Task Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 relative z-10 mb-6">
          <div className="cyber-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">发现问题</p>
                <p className="stat-value text-amber-400">{task.findings_count}</p>
              </div>
              <div className="stat-icon text-amber-400">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="cyber-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">致命</p>
                <p className="stat-value text-rose-500">{task.critical_count}</p>
              </div>
              <div className="stat-icon text-rose-500">
                <Shield className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="cyber-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">严重</p>
                <p className="stat-value text-orange-500">{task.high_count}</p>
              </div>
              <div className="stat-icon text-orange-500">
                <AlertTriangle className="w-6 h-6" />
              </div>
            </div>
          </div>

          <div className="cyber-card p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="stat-label">安全评分</p>
                <p className="stat-value text-primary">{task.security_score.toFixed(1)}</p>
              </div>
              <div className="stat-icon text-primary">
                <Activity className="w-6 h-6" />
              </div>
            </div>
          </div>
        </div>

        {/* Task Info Card */}
        <div className="cyber-card p-6 relative z-10 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground uppercase mb-1">任务描述</p>
                <p className="text-foreground">{task.description || '无描述'}</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="flex items-center">
                  <Calendar className="w-4 h-4 mr-2 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">
                    创建: {formatDate(task.created_at)}
                  </span>
                </div>
                {task.completed_at && (
                  <div className="flex items-center">
                    <CheckCircle className="w-4 h-4 mr-2 text-emerald-400" />
                    <span className="text-sm text-muted-foreground">
                      完成: {formatDate(task.completed_at)}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground uppercase mb-2">审计进度</p>
                <Progress
                  value={task.progress_percentage || 0}
                  className="h-2 bg-muted [&>div]:bg-primary"
                />
                <p className="text-right text-xs text-muted-foreground mt-1">
                  {task.progress_percentage.toFixed(0)}% 完成
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">文件数</p>
                  <p className="text-foreground font-bold">{task.total_files}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">代码行</p>
                  <p className="text-foreground font-bold">{task.total_lines.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Severity Distribution */}
        {task.findings_count > 0 && (
          <div className="cyber-card p-4 relative z-10 mb-6">
            <p className="text-sm text-muted-foreground uppercase mb-3">严重程度分布</p>
            <div className="flex gap-6 font-mono text-sm">
              {task.critical_count > 0 && (
                <span className="text-rose-500 font-bold">致命: {task.critical_count}</span>
              )}
              {task.high_count > 0 && (
                <span className="text-orange-500 font-bold">严重: {task.high_count}</span>
              )}
              {task.medium_count > 0 && (
                <span className="text-yellow-500 font-bold">一般: {task.medium_count}</span>
              )}
              {task.low_count > 0 && (
                <span className="text-green-500 font-bold">提示: {task.low_count}</span>
              )}
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
          {/* Findings List */}
          <div className="lg:col-span-1">
            <FindingsList
              findings={filteredFindings}
              severityFilter={severityFilter}
              onSeverityFilterChange={setSeverityFilter}
              selectedFinding={selectedFinding}
              onSelectFinding={setSelectedFinding}
            />
          </div>

          {/* Finding Detail */}
          <div className="lg:col-span-2">
            <FindingDetail
              finding={selectedFinding}
              taskId={taskId!}
              onFindingUpdated={() => loadTaskData(taskId!)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
