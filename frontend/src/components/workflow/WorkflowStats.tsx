/**
 * WorkflowStats Component
 * Cyberpunk Terminal Aesthetic
 */

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { GitBranch, Shield, Bug, AlertTriangle, BarChart3, Zap, Code, Lock } from "lucide-react";
import type { WorkflowDashboardStats } from "@/shared/types/workflow";

interface WorkflowStatsProps {
  stats: WorkflowDashboardStats;
}

const COLORS = ["#38bdf8", "#22c55e", "#eab308", "#ef4444", "#a855f7", "#6366f1"];

export default function WorkflowStats({ stats }: WorkflowStatsProps) {
  const analyzeData = Object.entries(stats.analyze_tech_stack_distribution).map(
    ([name, value]) => ({ name, value })
  );
  const whiteData = Object.entries(stats.white_tech_stack_distribution).map(
    ([name, value]) => ({ name, value })
  );
  const blackData = Object.entries(stats.black_tech_stack_distribution).map(
    ([name, value]) => ({ name, value })
  );

  const hasPieData = analyzeData.length > 0 || whiteData.length > 0 || blackData.length > 0;

  return (
    <>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
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

      {/* Charts Section */}
      {hasPieData && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 relative z-10">
          {analyzeData.length > 0 && (
            <div className="cyber-card p-4">
              <div className="section-header">
                <Zap className="w-5 h-5 text-violet-400" />
                <h3 className="section-title">威胁分析技术栈</h3>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={analyzeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={70}
                    dataKey="value"
                    stroke="var(--cyber-bg)"
                    strokeWidth={2}
                  >
                    {analyzeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--cyber-bg-elevated)',
                      border: '1px solid var(--cyber-border)',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      color: 'var(--cyber-text)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {whiteData.length > 0 && (
            <div className="cyber-card p-4">
              <div className="section-header">
                <Code className="w-5 h-5 text-primary" />
                <h3 className="section-title">白盒分析技术栈</h3>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={whiteData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={70}
                    dataKey="value"
                    stroke="var(--cyber-bg)"
                    strokeWidth={2}
                  >
                    {whiteData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--cyber-bg-elevated)',
                      border: '1px solid var(--cyber-border)',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      color: 'var(--cyber-text)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {blackData.length > 0 && (
            <div className="cyber-card p-4">
              <div className="section-header">
                <Lock className="w-5 h-5 text-amber-400" />
                <h3 className="section-title">黑盒分析技术栈</h3>
              </div>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={blackData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                    outerRadius={70}
                    dataKey="value"
                    stroke="var(--cyber-bg)"
                    strokeWidth={2}
                  >
                    {blackData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--cyber-bg-elevated)',
                      border: '1px solid var(--cyber-border)',
                      borderRadius: '4px',
                      fontFamily: 'monospace',
                      fontSize: '12px',
                      color: 'var(--cyber-text)'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </>
  );
}