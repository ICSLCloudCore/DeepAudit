import { Card } from "@/components/ui/card";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import { GitBranch, Shield, Bug, AlertTriangle } from "lucide-react";
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
      <Card className="p-4" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/20">
            <GitBranch className="w-5 h-5 text-primary" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">工作流总数</p>
            <p className="text-2xl font-bold text-primary">{stats.total_workflows}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-red-500/20">
            <Bug className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">漏洞总数</p>
            <p className="text-2xl font-bold text-red-400">{stats.total_vulnerabilities}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-green-500/20">
            <Shield className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">已完成</p>
            <p className="text-2xl font-bold text-green-400">{stats.status_distribution.completed || 0}</p>
          </div>
        </div>
      </Card>

      <Card className="p-4" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-yellow-500/20">
            <AlertTriangle className="w-5 h-5 text-yellow-400" />
          </div>
          <div>
            <p className="text-sm text-muted-foreground">进行中</p>
            <p className="text-2xl font-bold text-yellow-400">{stats.status_distribution.in_progress || 0}</p>
          </div>
        </div>
      </Card>

      {analyzeData.length > 0 && (
        <Card className="p-4 lg:col-span-1" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
          <p className="text-sm font-medium mb-2 text-muted-foreground">威胁分析技术栈</p>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={analyzeData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={40} label>
                  {analyzeData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {whiteData.length > 0 && (
        <Card className="p-4 lg:col-span-1" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
          <p className="text-sm font-medium mb-2 text-muted-foreground">白盒分析技术栈</p>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={whiteData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={40} label>
                  {whiteData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      {blackData.length > 0 && (
        <Card className="p-4 lg:col-span-1" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
          <p className="text-sm font-medium mb-2 text-muted-foreground">黑盒分析技术栈</p>
          <div className="h-[120px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={blackData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={40} label>
                  {blackData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}
    </div>
  );
}