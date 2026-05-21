/**
 * WorkflowStats Component - 统计卡片
 * Cyberpunk Terminal Aesthetic
 */

import { GitBranch, Shield, Bug, AlertTriangle } from "lucide-react";
import type { WorkflowDashboardStats } from "@/shared/types/workflow";

interface WorkflowStatsProps {
  stats: WorkflowDashboardStats;
}

export default function WorkflowStats({ stats }: WorkflowStatsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
      {/* Stats Card 1: 工作流总数 */}
      <div className="cyber-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="stat-label">工作流总数</p>
            <p className="stat-value">{stats.total_workflows}</p>
            <p className="text-sm text-emerald-400 mt-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              已完成: {stats.status_distribution.completed || 0}
            </p>
          </div>
          <div className="stat-icon text-primary">
            <GitBranch className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Stats Card 2: 漏洞总数 */}
      <div className="cyber-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="stat-label">漏洞总数</p>
            <p className="stat-value">{stats.total_vulnerabilities}</p>
            <p className="text-sm text-amber-400 mt-1 flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-amber-400" />
              待修复: {stats.total_vulnerabilities}
            </p>
          </div>
          <div className="stat-icon text-amber-400">
            <Bug className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Stats Card 3: 已完成 */}
      <div className="cyber-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="stat-label">已完成</p>
            <p className="stat-value">{stats.status_distribution.completed || 0}</p>
            <p className="text-sm text-emerald-400 mt-1 flex items-center gap-1">
              <Shield className="w-4 h-4" />
              审计完成
            </p>
          </div>
          <div className="stat-icon text-emerald-400">
            <Shield className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Stats Card 4: 进行中 */}
      <div className="cyber-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="stat-label">进行中</p>
            <p className="stat-value">{stats.status_distribution.in_progress || 0}</p>
            <p className="text-sm text-sky-400 mt-1 flex items-center gap-1">
              <AlertTriangle className="w-4 h-4" />
              正在审计
            </p>
          </div>
          <div className="stat-icon text-sky-400">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>
    </div>
  );
}