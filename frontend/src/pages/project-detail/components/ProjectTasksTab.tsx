import { Link } from "react-router-dom";
import {
  FileText,
  Play,
  Activity,
  Terminal,
  XCircle,
  Download,
  ArrowUpRight,
  Bot,
  Code2,
  Calendar,
  CheckCircle
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { AuditTask } from "@/shared/types";
import type { UnifiedTask } from "@/shared/types";

export function ProjectTasksTab(props: {
  unifiedTasks: UnifiedTask[];
  onCreateTask: () => void;
  formatDate: (dateString: string) => string;
  renderStatusBadge: (status: string) => React.ReactNode;
  renderStatusIcon: (status: string) => React.ReactNode;
  // 新增 props
  handleCancelTask: (taskId: string) => void;
  handleCancelAgentTask: (taskId: string) => void;
  handleCancelOpenCodeTask: (taskId: string) => void;
  handleOpenExportDialog: (task: any) => void;
  handleOpenAgentExportDialog: (task: any) => void;
  cancellingTaskId: string | null;
  cancellingAgentTaskId: string | null;
  cancellingOpenCodeTaskId: string | null;
  exportingTaskId: string | null;
}) {
  const {
    unifiedTasks,
    onCreateTask,
    formatDate,
    renderStatusBadge,
    renderStatusIcon,
    // 新增 props 解构
    handleCancelTask,
    handleCancelAgentTask,
    handleCancelOpenCodeTask,
    handleOpenExportDialog,
    handleOpenAgentExportDialog,
    cancellingTaskId,
    cancellingAgentTaskId,
    cancellingOpenCodeTaskId,
    exportingTaskId,
  } = props;

  // ============ 按钮渲染函数 ============
  // Agent 任务按钮
  const renderAgentTaskButtons = (task: any) => (
    <div className="flex gap-3">
      {(task.status === 'running' || task.status === 'pending') && (
        <>
          <Link to={`/agent-audit/${task.id}`}>
            <Button size="sm" className="cyber-btn bg-sky-500/90 border-sky-500/50 text-foreground hover:bg-sky-500 h-9">
              <Terminal className="w-4 h-4 mr-2" />
              查看实时流
            </Button>
          </Link>
          <Button
            size="sm"
            className="cyber-btn bg-rose-500/90 border-rose-500/50 text-foreground hover:bg-rose-500 h-9"
            onClick={() => handleCancelAgentTask(task.id)}
            disabled={cancellingAgentTaskId === task.id}
          >
            <XCircle className="w-4 h-4 mr-2" />
            {cancellingAgentTaskId === task.id ? '取消中...' : '取消'}
          </Button>
        </>
      )}
      {(task.status === 'completed' || (task.findings_count != null && task.findings_count > 0)) && (
        <Button
          size="sm"
          className="cyber-btn-outline h-9"
          onClick={() => handleOpenAgentExportDialog(task)}
          disabled={exportingTaskId === task.id}
        >
          <Download className="w-4 h-4 mr-2" />
          {exportingTaskId === task.id ? '加载中...' : '导出报告'}
        </Button>
      )}
      <Link to={`/agent-audit/${task.id}`}>
        <Button size="sm" className="cyber-btn-outline h-9">
          <FileText className="w-4 h-4 mr-2" />
          查看详情
        </Button>
      </Link>
    </div>
  );

  // 普通审计任务按钮
  const renderAuditTaskButtons = (task: any) => (
    <div className="flex gap-3">
      {(task.status === 'running' || task.status === 'pending') && (
        <Button
          size="sm"
          className="cyber-btn bg-rose-500/90 border-rose-500/50 text-foreground hover:bg-rose-500 h-9"
          onClick={() => handleCancelTask(task.id)}
          disabled={cancellingTaskId === task.id}
        >
          <XCircle className="w-4 h-4 mr-2" />
          {cancellingTaskId === task.id ? '取消中...' : '取消'}
        </Button>
      )}
      {(task.issues_count > 0 || task.status === 'completed') && (
        <Button
          size="sm"
          className="cyber-btn-outline h-9"
          onClick={() => handleOpenExportDialog(task)}
          disabled={exportingTaskId === task.id}
        >
          <Download className="w-4 h-4 mr-2" />
          {exportingTaskId === task.id ? '加载中...' : '导出报告'}
        </Button>
      )}
      <Link to={`/tasks/${task.id}`}>
        <Button size="sm" className="cyber-btn-outline h-9">
          <FileText className="w-4 h-4 mr-2" />
          查看详情
        </Button>
      </Link>
    </div>
  );

  // OpenCode 任务按钮
  const renderOpenCodeTaskButtons = (task: any) => (
    <div className="flex gap-3">
      {(task.status === 'running' || task.status === 'pending') && (
        <Button
          size="sm"
          className="cyber-btn bg-rose-500/90 border-rose-500/50 text-foreground hover:bg-rose-500 h-9"
          onClick={() => handleCancelOpenCodeTask(task.id)}
          disabled={cancellingOpenCodeTaskId === task.id}
        >
          <XCircle className="w-4 h-4 mr-2" />
          {cancellingOpenCodeTaskId === task.id ? '取消中...' : '取消'}
        </Button>
      )}
      {task.opencode_session_id && (
        <Link to={`/opencode-audit/${task.opencode_session_id}/tasks/${task.id}`}>
          <Button size="sm" className="cyber-btn-outline h-9">
            <Terminal className="w-4 h-4 mr-2" />
            查看实时流
          </Button>
        </Link>
      )}
      <Link to={`/tasks/opencode/${task.id}/vulnerabilities`}>
        <Button size="sm" className="cyber-btn-outline h-9">
          <FileText className="w-4 h-4 mr-2" />
          查看问题
        </Button>
      </Link>
    </div>
  );

  return (
    <>
      <div className="flex items-center justify-between">
        <div className="section-header mb-0 pb-0 border-0">
          <FileText className="w-5 h-5 text-primary" />
          <h3 className="section-title">审计任务列表</h3>
        </div>
        <Button onClick={onCreateTask} className="cyber-btn-primary">
          <Play className="w-4 h-4 mr-2" />
          新建任务
        </Button>
      </div>

      {unifiedTasks.length > 0 ? (
        <div className="space-y-4">
          {unifiedTasks.map((wrappedTask) => {
            const isAuditTask = wrappedTask.kind === "audit";
            const isAgentTask = wrappedTask.kind === "agent";
            const isOpenCodeTask = wrappedTask.kind === "opencode";
            const task: any = wrappedTask.task as any;

            const issueCount = isAuditTask 
              ? (task.issues_count ?? 0) 
              : (task.findings_count ?? 0);
            const totalFiles = task.total_files ?? 0;
            const totalLines = task.total_lines ?? "-";
            const score = isOpenCodeTask 
              ? (typeof task.security_score === "number" ? task.security_score : 0)
              : (typeof task.quality_score === "number" ? task.quality_score : 0);

            // 确定详情跳转链接
            let detailLink = "";
             if (isOpenCodeTask && task.opencode_session_id) {
               detailLink = `/opencode-audit/${task.opencode_session_id}/tasks/${task.id}`;
            } else if (isAgentTask) {
              detailLink = `/agent-audit/${task.id}`;
            } else {
              detailLink = `/tasks/${task.id}`;
            }

            // 确定任务类型标签
            let taskTypeLabel = "";
            let taskBadgeLabel = "";
            if (isOpenCodeTask) {
              taskTypeLabel = task.project?.name || task.name || "OpenCode 审计任务";
              taskBadgeLabel = "OPENCODE";
            } else if (isAgentTask) {
              taskTypeLabel = task.name || "Agent 审计任务";
              taskBadgeLabel = "AGENT";
            } else {
              taskTypeLabel = (task as AuditTask).task_type === "repository" ? "审计任务" : "即时分析任务";
              taskBadgeLabel = "AUDIT";
            }

            // 确定 Badge 类名
            let badgeClassName = "cyber-badge-muted";
            if (isOpenCodeTask) {
              badgeClassName = "cyber-badge-warning";
            } else if (isAgentTask) {
              badgeClassName = "cyber-badge-info";
            }

            return (
              <div key={`${wrappedTask.kind}:${task.id}`} className="cyber-card p-6">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-10 h-10 rounded-lg flex items-center justify-center ${task.status === "completed"
                        ? "bg-emerald-500/20"
                        : task.status === "running"
                          ? "bg-sky-500/20"
                          : task.status === "failed"
                            ? "bg-rose-500/20"
                            : "bg-muted"
                        }`}
                    >
                      {renderStatusIcon(task.status)}
                    </div>
                    <div>
                      <h4 className="font-bold text-foreground uppercase">
                        {taskTypeLabel}
                      </h4>
                      <p className="text-sm text-muted-foreground font-mono">创建于 {formatDate(task.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={badgeClassName}>
                      {taskBadgeLabel}
                    </Badge>
                    {renderStatusBadge(task.status)}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 font-mono">
                  <div className="text-center p-3 bg-muted rounded-lg border border-border">
                    <p className="text-2xl font-bold text-foreground">{totalFiles}</p>
                    <p className="text-xs text-muted-foreground uppercase">总文件数</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg border border-border">
                    <p className="text-2xl font-bold text-foreground">{totalLines}</p>
                    <p className="text-xs text-muted-foreground uppercase">代码行数</p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg border border-border">
                    <p className="text-2xl font-bold text-amber-400">{issueCount}</p>
                    <p className="text-xs text-muted-foreground uppercase">
                      {isOpenCodeTask ? "发现问题" : isAuditTask ? "发现问题" : "发现漏洞"}
                    </p>
                  </div>
                  <div className="text-center p-3 bg-muted rounded-lg border border-border">
                    <p className="text-2xl font-bold text-primary">{score.toFixed(1)}</p>
                    <p className="text-xs text-muted-foreground uppercase">
                      {isOpenCodeTask ? "安全评分" : "质量评分"}
                    </p>
                  </div>
                </div>

                {task.status === "completed" && typeof score === "number" && (
                  <div className="space-y-2 mb-4">
                    <div className="flex items-center justify-between text-sm font-mono">
                      <span className="text-muted-foreground">
                        {isOpenCodeTask ? "安全评分" : "质量评分"}
                      </span>
                      <span className="text-foreground font-bold">{score.toFixed(1)}/100</span>
                    </div>
                    <Progress value={score} className="h-2 bg-muted [&>div]:bg-primary" />
                  </div>
                )}

                <div className="flex items-center justify-between pt-4 border-t border-border">
                  <div className="flex items-center space-x-4 text-sm text-muted-foreground font-mono">
                    <div className="flex items-center">
                      <Calendar className="w-4 h-4 mr-2" />
                      {formatDate(task.created_at)}
                    </div>
                    {task.completed_at && (
                      <div className="flex items-center">
                        <CheckCircle className="w-4 h-4 mr-2" />
                        {formatDate(task.completed_at)}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-3">
                    {isAgentTask ? (
                      renderAgentTaskButtons(task)
                    ) : isOpenCodeTask ? (
                      renderOpenCodeTaskButtons(task)
                    ) : (
                      renderAuditTaskButtons(task)
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="cyber-card p-12 text-center">
          <Activity className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-bold text-foreground mb-2 uppercase">暂无审计任务</h3>
          <p className="text-sm text-muted-foreground mb-6 font-mono">创建第一个审计任务开始代码质量分析</p>
          <Button onClick={onCreateTask} className="cyber-btn-primary">
            <Play className="w-4 h-4 mr-2" />
            创建任务
          </Button>
        </div>
      )}
    </>
  );
}


