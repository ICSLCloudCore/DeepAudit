/**
 * Findings List Component
 * 漏洞列表组件
 */

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, Shield, Search } from "lucide-react";
import type { OpenCodeFinding } from "@/shared/api/opencodeAuditTasks";

type SeverityFilter = "all" | "critical" | "high" | "medium" | "low";

interface FindingsListProps {
  findings: OpenCodeFinding[];
  severityFilter: SeverityFilter;
  onSeverityFilterChange: (filter: SeverityFilter) => void;
  selectedFinding: OpenCodeFinding | null;
  onSelectFinding: (finding: OpenCodeFinding) => void;
}

export default function FindingsList({
  findings,
  severityFilter,
  onSeverityFilterChange,
  selectedFinding,
  onSelectFinding,
}: FindingsListProps) {
  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case "critical": return "bg-rose-500/20 text-rose-500 border-rose-500/50";
      case "high": return "bg-orange-500/20 text-orange-500 border-orange-500/50";
      case "medium": return "bg-yellow-500/20 text-yellow-500 border-yellow-500/50";
      case "low": return "bg-green-500/20 text-green-500 border-green-500/50";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const getSeverityLabel = (severity: string) => {
    switch (severity) {
      case "critical": return "致命";
      case "high": return "严重";
      case "medium": return "一般";
      case "low": return "提示";
      default: return severity;
    }
  };

  const getConfirmationStatusColor = (status: string | null) => {
    switch (status) {
      case "已确认": return "bg-emerald-500/20 text-emerald-400";
      case "误报": return "bg-slate-500/20 text-slate-400";
      case "已修复": return "bg-blue-500/20 text-blue-400";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const filters: { value: SeverityFilter; label: string; color: string }[] = [
    { value: "all", label: "全部", color: "text-foreground" },
    { value: "critical", label: "致命", color: "text-rose-500" },
    { value: "high", label: "严重", color: "text-orange-500" },
    { value: "medium", label: "一般", color: "text-yellow-500" },
    { value: "low", label: "提示", color: "text-green-500" },
  ];

  return (
    <div className="cyber-card p-4 h-full flex flex-col">
      <h3 className="font-bold text-foreground uppercase tracking-wide mb-4">
        漏洞列表
      </h3>

      {/* Filter Buttons */}
      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map((filter) => (
          <Button
            key={filter.value}
            size="sm"
            onClick={() => onSeverityFilterChange(filter.value)}
            className={`h-8 px-3 text-xs ${
              severityFilter === filter.value
                ? "cyber-btn-primary"
                : "cyber-btn-outline"
            }`}
          >
            {filter.label}
          </Button>
        ))}
      </div>

      {/* Findings Count */}
      <p className="text-xs text-muted-foreground mb-4 font-mono">
        共 {findings.length} 个漏洞
      </p>

      {/* Findings List */}
      <div className="flex-1 overflow-y-auto space-y-2">
        {findings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Search className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">暂无漏洞</p>
          </div>
        ) : (
          findings.map((finding) => (
            <button
              key={finding.id}
              onClick={() => onSelectFinding(finding)}
              className={`
                w-full text-left p-3 rounded-lg border transition-all
                ${
                  selectedFinding?.id === finding.id
                    ? "bg-primary/10 border-primary shadow-lg shadow-primary/20"
                    : "bg-muted/50 border-border hover:border-primary/50 hover:bg-card/80"
                }
              `}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono text-muted-foreground">
                      {finding.vuln_id}
                    </span>
                    <Badge className={`text-xs ${getSeverityColor(finding.severity)}`}>
                      {getSeverityLabel(finding.severity)}
                    </Badge>
                    {finding.manual_confirmation_status && (
                      <Badge className={`text-xs ${getConfirmationStatusColor(finding.manual_confirmation_status)}`}>
                        {finding.manual_confirmation_status}
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm font-medium text-foreground truncate">
                    {finding.vulnerability_title}
                  </p>
                  {finding.file_path && (
                    <p className="text-xs text-muted-foreground font-mono mt-1 truncate">
                      {finding.file_path}
                      {finding.line_start && `:${finding.line_start}`}
                    </p>
                  )}
                </div>
                {finding.cvss_score && (
                  <span className="text-lg font-bold text-foreground flex-shrink-0">
                    {finding.cvss_score.toFixed(1)}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
