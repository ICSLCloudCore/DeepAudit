/**
 * OpenCode Audit Vulnerability Detail Page
 * Cyberpunk Terminal Aesthetic
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  FileText,
  Calendar,
  Shield,
  Bug,
  Code,
  Lightbulb,
  Info,
  Zap,
  User,
} from "lucide-react";
import { toast } from "sonner";

import { getVulnerability, getOpenCodeAuditTask, type AuditVulnerability, type OpenCodeAuditTask } from "@/shared/api/opencodeAuditTasks";

export default function OpenCodeAuditVulnerabilityDetail() {
  const { taskId, vulnId } = useParams<{ taskId: string; vulnId: string }>();
  const [task, setTask] = useState<OpenCodeAuditTask | null>(null);
  const [vulnerability, setVulnerability] = useState<AuditVulnerability | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (taskId && vulnId) {
      loadVulnerabilityDetail();
    }
  }, [taskId, vulnId]);

  const loadVulnerabilityDetail = async () => {
    if (!taskId || !vulnId) return;

    try {
      setLoading(true);
      const [taskData, vulnData] = await Promise.all([
        getOpenCodeAuditTask(taskId),
        getVulnerability(taskId, vulnId),
      ]);

      setTask(taskData);
      setVulnerability(vulnData);
    } catch (error) {
      console.error('Failed to load vulnerability detail:', error);
      toast.error("加载漏洞详情失败");
    } finally {
      setLoading(false);
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

  const getSeverityClasses = (severity: string) => {
    const lowerSeverity = severity.toLowerCase();
    switch (lowerSeverity) {
      case 'critical':
      case '致命':
        return 'severity-critical';
      case 'high':
      case '严重':
        return 'severity-high';
      case 'medium':
      case '一般':
        return 'severity-medium';
      case 'low':
      case '提示':
        return 'severity-low';
      default:
        return 'severity-info';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="loading-spinner mx-auto" />
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">加载漏洞详情...</p>
        </div>
      </div>
    );
  }

  if (!task || !vulnerability) {
    return (
      <div className="space-y-6 p-6 cyber-bg-elevated min-h-screen font-mono">
        <div className="flex items-center space-x-4">
          <Link to={`/tasks/opencode/${taskId}/vulnerabilities`}>
            <Button variant="outline" size="sm" className="cyber-btn-ghost h-10 w-10 p-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
        </div>
        <div className="cyber-card p-16 text-center">
          <AlertTriangle className="w-16 h-16 text-rose-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-foreground uppercase mb-2">漏洞不存在</h3>
          <p className="text-muted-foreground font-mono">请检查漏洞ID是否正确</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 cyber-bg-elevated min-h-screen font-mono relative">
      {/* Grid background */}
      <div className="absolute inset-0 cyber-grid-subtle pointer-events-none" />

      {/* Top Action Bar */}
      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center space-x-3">
          <Link to={`/tasks/opencode/${taskId}/vulnerabilities`}>
            <Button variant="outline" size="sm" className="cyber-btn-ghost h-10 w-10 p-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <span className="text-muted-foreground text-sm">返回漏洞列表</span>
        </div>
        <Badge className={`${getSeverityClasses(vulnerability.severity)} font-bold uppercase px-3 py-1 rounded text-sm`}>
          {vulnerability.severity}
        </Badge>
      </div>

      {/* Vulnerability Header */}
      <div className="cyber-card p-6 relative z-10">
        <div className="flex items-start space-x-4">
          <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
            vulnerability.severity.toLowerCase() === 'critical' || vulnerability.severity === '致命' ? 'bg-rose-500/20 text-rose-400' :
            vulnerability.severity.toLowerCase() === 'high' || vulnerability.severity === '严重' ? 'bg-orange-500/20 text-orange-400' :
            vulnerability.severity.toLowerCase() === 'medium' || vulnerability.severity === '一般' ? 'bg-amber-500/20 text-amber-400' :
              'bg-sky-500/20 text-sky-400'
          }`}>
            <Bug className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground mb-2 uppercase">
              {vulnerability.vulnerability_title}
            </h1>
            <div className="flex items-center space-x-4 text-sm text-muted-foreground">
              <div className="flex items-center space-x-1">
                <FileText className="w-4 h-4" />
                <span>{vulnerability.file_path || vulnerability.location}</span>
              </div>
              {vulnerability.line_start && (
                <div className="flex items-center space-x-1">
                  <span className="text-primary">&gt;</span>
                  <span>LINE: {vulnerability.line_start}</span>
                  {vulnerability.line_end && <span>- {vulnerability.line_end}</span>}
                </div>
              )}
              {vulnerability.cwe && (
                <Badge className="cyber-badge-muted font-mono">
                  {vulnerability.cwe}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Vulnerability Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        {/* Main Content - Left Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Vulnerability Essence */}
          {vulnerability.vulnerability_essence && (
            <div className="cyber-card p-6">
              <div className="flex items-center mb-4 border-b border-border pb-3">
                <Info className="w-5 h-5 text-muted-foreground mr-2" />
                <span className="font-bold text-muted-foreground uppercase">漏洞本质</span>
              </div>
              <p className="text-foreground leading-relaxed">
                {vulnerability.vulnerability_essence}
              </p>
            </div>
          )}

          {/* Root Cause Analysis */}
          {vulnerability.root_cause && (
            <div className="cyber-card p-6 border-rose-500/30">
              <div className="flex items-center mb-4 border-b border-rose-500/20 pb-3">
                <AlertTriangle className="w-5 h-5 text-rose-500 mr-2" />
                <span className="font-bold text-rose-500 uppercase">根因分析</span>
              </div>
              <p className="text-foreground leading-relaxed">
                {vulnerability.root_cause}
              </p>
            </div>
          )}

          {/* Security Impact */}
          {vulnerability.security_impact && (
            <div className="cyber-card p-6">
              <div className="flex items-center mb-4 border-b border-border pb-3">
                <Shield className="w-5 h-5 text-amber-500 mr-2" />
                <span className="font-bold text-amber-500 uppercase">安全影响</span>
              </div>
              <p className="text-foreground leading-relaxed">
                {vulnerability.security_impact}
              </p>
            </div>
          )}

          {/* Vulnerable Code */}
          {vulnerability.vulnerable_code && (
            <div className="cyber-card p-6">
              <div className="flex items-center justify-between mb-4 border-b border-border pb-3">
                <div className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-primary rounded flex items-center justify-center">
                    <Code className="w-3 h-3 text-foreground" />
                  </div>
                  <span className="text-emerald-500 font-bold uppercase">VULNERABLE_CODE</span>
                </div>
              </div>
              <div className="bg-slate-100 dark:bg-black/40 p-4 border border-border rounded overflow-x-auto">
                <pre className="text-sm text-emerald-600 dark:text-emerald-400 font-mono">
                  <code>{vulnerability.vulnerable_code}</code>
                </pre>
              </div>
            </div>
          )}

          {/* Dataflow */}
          {vulnerability.dataflow && (
            <div className="cyber-card p-6">
              <div className="flex items-center mb-4 border-b border-border pb-3">
                <Zap className="w-5 h-5 text-violet-500 mr-2" />
                <span className="font-bold text-violet-500 uppercase">数据流</span>
              </div>
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                {vulnerability.dataflow}
              </p>
            </div>
          )}

          {/* Exploit Steps */}
          {vulnerability.exploit_steps && (
            <div className="cyber-card p-6">
              <div className="flex items-center mb-4 border-b border-border pb-3">
                <AlertTriangle className="w-5 h-5 text-rose-500 mr-2" />
                <span className="font-bold text-rose-500 uppercase">利用步骤</span>
              </div>
              <p className="text-foreground leading-relaxed whitespace-pre-wrap">
                {vulnerability.exploit_steps}
              </p>
            </div>
          )}

          {/* Exploit POC */}
          {vulnerability.exploit_poc && (
            <div className="cyber-card p-6">
              <div className="flex items-center mb-4 border-b border-border pb-3">
                <Bug className="w-5 h-5 text-rose-500 mr-2" />
                <span className="font-bold text-rose-500 uppercase">EXPLOIT_POC</span>
              </div>
              <div className="bg-slate-100 dark:bg-black/40 p-4 border border-border rounded overflow-x-auto">
                <pre className="text-sm text-rose-600 dark:text-rose-400 font-mono">
                  <code>{vulnerability.exploit_poc}</code>
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar - Right Column */}
        <div className="space-y-6">
          {/* Quick Info Card */}
          <div className="cyber-card p-6">
            <div className="cyber-card-header !mb-4">
              <Info className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">快速信息</h3>
            </div>
            <div className="space-y-4">
              {vulnerability.cvss_score && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-1">CVSS 评分</p>
                  <p className="text-lg font-bold text-foreground">{vulnerability.cvss_score}</p>
                </div>
              )}
              {vulnerability.cvss_vector && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-1">CVSS 向量</p>
                  <p className="text-sm font-mono text-foreground break-all">{vulnerability.cvss_vector}</p>
                </div>
              )}
              {vulnerability.confidence && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-1">置信度</p>
                  <p className="text-foreground">{vulnerability.confidence}</p>
                </div>
              )}
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase mb-1">发现时间</p>
                <p className="text-foreground">{formatDate(vulnerability.created_at)}</p>
              </div>
            </div>
          </div>

          {/* Confirmation Info - 仅在已确认时显示 */}
          {vulnerability.manual_confirmation && (
            <div className="cyber-card p-6 border-emerald-500/30">
              <div className="cyber-card-header !mb-4">
                <CheckCircle className="w-5 h-5 text-emerald-500" />
                <h3 className="text-lg font-bold uppercase tracking-wider text-emerald-500">确认信息</h3>
              </div>
              <div className="space-y-4">
                {vulnerability.confirmed_by && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1">确认人</p>
                    <div className="flex items-center space-x-2">
                      <User className="w-4 h-4 text-muted-foreground" />
                      <p className="text-foreground">{vulnerability.confirmed_by}</p>
                    </div>
                  </div>
                )}
                {vulnerability.confirmed_at && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1">确认时间</p>
                    <p className="text-foreground">{formatDate(vulnerability.confirmed_at)}</p>
                  </div>
                )}
                {vulnerability.manual_confirmation_status && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1">确认结果</p>
                    <Badge className={`
                      ${vulnerability.manual_confirmation_status === '是问题' 
                        ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' 
                        : 'bg-gray-500/20 text-gray-600 dark:text-gray-400 border-gray-500/30'}
                      font-mono
                    `}>
                      {vulnerability.manual_confirmation_status}
                    </Badge>
                  </div>
                )}
                {vulnerability.manual_confirmation_notes && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1">确认备注</p>
                    <p className="text-foreground text-sm leading-relaxed">
                      {vulnerability.manual_confirmation_notes}
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Impact Assessment */}
          {(vulnerability.impact_confidentiality || vulnerability.impact_integrity || vulnerability.impact_availability) && (
            <div className="cyber-card p-6">
              <div className="cyber-card-header !mb-4">
                <Shield className="w-5 h-5 text-amber-500" />
                <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">影响评估</h3>
              </div>
              <div className="space-y-3">
                {vulnerability.impact_confidentiality && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1">机密性</p>
                    <p className="text-foreground">{vulnerability.impact_confidentiality}</p>
                  </div>
                )}
                {vulnerability.impact_integrity && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1">完整性</p>
                    <p className="text-foreground">{vulnerability.impact_integrity}</p>
                  </div>
                )}
                {vulnerability.impact_availability && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1">可用性</p>
                    <p className="text-foreground">{vulnerability.impact_availability}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Fix Suggestions */}
          {vulnerability.fix_description && (
            <div className="cyber-card p-6 border-sky-500/30">
              <div className="cyber-card-header !mb-4">
                <Lightbulb className="w-5 h-5 text-sky-500" />
                <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">修复建议</h3>
              </div>
              <p className="text-foreground leading-relaxed mb-4">
                {vulnerability.fix_description}
              </p>
              {vulnerability.fix_code_after && (
                <div className="mt-4">
                  <div className="flex items-center space-x-2 mb-2">
                    <CheckCircle className="w-4 h-4 text-emerald-500" />
                    <span className="text-emerald-500 font-bold uppercase text-sm">FIXED_CODE</span>
                  </div>
                  <div className="bg-slate-100 dark:bg-black/40 p-3 border border-border rounded overflow-x-auto">
                    <pre className="text-xs text-emerald-600 dark:text-emerald-400 font-mono">
                      <code>{vulnerability.fix_code_after}</code>
                    </pre>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Task Info */}
          <div className="cyber-card p-6">
            <div className="cyber-card-header !mb-4">
              <FileText className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">任务信息</h3>
            </div>
            <div className="space-y-3">
              <div>
                <p className="text-xs font-bold text-muted-foreground uppercase mb-1">任务名称</p>
                <Link to={`/tasks/opencode/${taskId}/vulnerabilities`} className="text-primary hover:underline">
                  {task.name || 'OpenCode审计任务'}
                </Link>
              </div>
              {task.project && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-1">项目</p>
                  <Link to={`/projects/${task.project.id}`} className="text-primary hover:underline">
                    {task.project.name}
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
