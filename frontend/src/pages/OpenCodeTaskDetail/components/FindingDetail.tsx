/**
 * Finding Detail Component
 * 漏洞详情组件
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertTriangle,
  Shield,
  FileText,
  Code2,
  Zap,
  CheckCircle,
  XCircle,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import {
  confirmOpenCodeFinding,
  type OpenCodeFinding,
  type ManualConfirmRequest,
} from "@/shared/api/opencodeAuditTasks";

interface FindingDetailProps {
  finding: OpenCodeFinding | null;
  taskId: string;
  onFindingUpdated: () => void;
}

export default function FindingDetail({
  finding,
  taskId,
  onFindingUpdated,
}: FindingDetailProps) {
  const [confirming, setConfirming] = useState(false);
  const [confirmStatus, setConfirmStatus] = useState<string>("");
  const [confirmNotes, setConfirmNotes] = useState("");

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
      case "已确认": return "bg-emerald-500/20 text-emerald-400 border-emerald-500/50";
      case "误报": return "bg-slate-500/20 text-slate-400 border-slate-500/50";
      case "已修复": return "bg-blue-500/20 text-blue-400 border-blue-500/50";
      default: return "bg-muted text-muted-foreground border-border";
    }
  };

  const handleConfirm = async (status: string) => {
    if (!finding) return;
    
    try {
      setConfirming(true);
      const request: ManualConfirmRequest = {
        manual_confirmation_status: status,
        manual_confirmation_notes: confirmNotes || undefined,
      };
      await confirmOpenCodeFinding(taskId, finding.id, request);
      toast.success("确认成功");
      onFindingUpdated();
      setConfirmStatus("");
      setConfirmNotes("");
    } catch (error) {
      console.error("Failed to confirm finding:", error);
      toast.error("确认失败");
    } finally {
      setConfirming(false);
    }
  };

  if (!finding) {
    return (
      <div className="cyber-card p-16 text-center h-full flex items-center justify-center">
        <div>
          <FileText className="w-16 h-16 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-bold text-foreground mb-2">选择一个漏洞</h3>
          <p className="text-muted-foreground text-sm">从左侧列表中选择一个漏洞查看详情</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cyber-card p-6 h-full overflow-y-auto">
      {/* Header */}
      <div className="mb-6 pb-4 border-b border-border">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-mono text-muted-foreground">
                {finding.vuln_id}
              </span>
              <Badge className={getSeverityColor(finding.severity)}>
                {getSeverityLabel(finding.severity)}
              </Badge>
              {finding.manual_confirmation_status && (
                <Badge className={getConfirmationStatusColor(finding.manual_confirmation_status)}>
                  {finding.manual_confirmation_status}
                </Badge>
              )}
              {finding.cvss_score && (
                <Badge className="bg-primary/20 text-primary border-primary/50">
                  CVSS {finding.cvss_score.toFixed(1)}
                </Badge>
              )}
            </div>
            <h2 className="text-xl font-bold text-foreground">
              {finding.vulnerability_title}
            </h2>
          </div>
        </div>

        {/* Location */}
        {finding.file_path && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground font-mono">
            <FileText className="w-4 h-4" />
            <span>{finding.file_path}</span>
            {finding.line_start && (
              <span>:{finding.line_start}</span>
            )}
            {finding.function_name && (
              <span className="text-primary">({finding.function_name})</span>
            )}
          </div>
        )}

        {/* Metadata */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 text-sm">
          {finding.cwe && (
            <div>
              <p className="text-muted-foreground uppercase text-xs">CWE</p>
              <p className="text-foreground">{finding.cwe}</p>
            </div>
          )}
          {finding.confidence && (
            <div>
              <p className="text-muted-foreground uppercase text-xs">置信度</p>
              <p className="text-foreground">{finding.confidence}</p>
            </div>
          )}
          {finding.cvss_vector && (
            <div className="col-span-2">
              <p className="text-muted-foreground uppercase text-xs">CVSS 向量</p>
              <p className="text-foreground font-mono text-xs truncate">{finding.cvss_vector}</p>
            </div>
          )}
        </div>
      </div>

      {/* Content Sections */}
      <div className="space-y-6">
        {/* Vulnerability Description */}
        <Section title="漏洞描述" icon={<AlertTriangle className="w-5 h-5" />}>
          {finding.vulnerability_essence && (
            <SubSection title="漏洞本质">
              <p className="text-foreground">{finding.vulnerability_essence}</p>
            </SubSection>
          )}
          {finding.root_cause && (
            <SubSection title="根因分析">
              <p className="text-foreground">{finding.root_cause}</p>
            </SubSection>
          )}
          {finding.security_impact && (
            <SubSection title="安全影响">
              <p className="text-foreground">{finding.security_impact}</p>
            </SubSection>
          )}
        </Section>

        {/* Impact Analysis */}
        {(finding.impact_confidentiality || finding.impact_integrity || finding.impact_availability) && (
          <Section title="影响分析" icon={<Shield className="w-5 h-5" />}>
            <div className="grid grid-cols-3 gap-4">
              {finding.impact_confidentiality && (
                <ImpactItem label="机密性" level={finding.impact_confidentiality} />
              )}
              {finding.impact_integrity && (
                <ImpactItem label="完整性" level={finding.impact_integrity} />
              )}
              {finding.impact_availability && (
                <ImpactItem label="可用性" level={finding.impact_availability} />
              )}
            </div>
          </Section>
        )}

        {/* Vulnerable Code */}
        {finding.vulnerable_code && (
          <Section title="漏洞代码" icon={<Code2 className="w-5 h-5" />}>
            <CodeBlock code={finding.vulnerable_code} />
          </Section>
        )}

        {/* Data Flow */}
        {(finding.dataflow_source || finding.dataflow_sink || finding.dataflow_conclusion) && (
          <Section title="数据流分析" icon={<Zap className="w-5 h-5" />}>
            {finding.dataflow_source && (
              <SubSection title="污点源">
                <p className="text-foreground">{finding.dataflow_source}</p>
              </SubSection>
            )}
            {finding.dataflow_sink && (
              <SubSection title="汇聚点">
                <p className="text-foreground">{finding.dataflow_sink}</p>
              </SubSection>
            )}
            {finding.dataflow_sanitization && (
              <SubSection title="净化检查">
                <p className="text-foreground">{finding.dataflow_sanitization}</p>
              </SubSection>
            )}
            {finding.dataflow_conclusion && (
              <SubSection title="结论">
                <p className="text-foreground">{finding.dataflow_conclusion}</p>
              </SubSection>
            )}
            {finding.dataflow_propagation && (
              <SubSection title="传播路径">
                <pre className="bg-muted p-4 rounded-lg text-xs overflow-x-auto">
                  {JSON.stringify(finding.dataflow_propagation, null, 2)}
                </pre>
              </SubSection>
            )}
          </Section>
        )}

        {/* Exploit Scenario */}
        {(finding.exploit_steps || finding.exploit_poc) && (
          <Section title="利用场景" icon={<AlertTriangle className="w-5 h-5" />}>
            {finding.exploit_steps && (
              <SubSection title="攻击步骤">
                <p className="text-foreground whitespace-pre-line">{finding.exploit_steps}</p>
              </SubSection>
            )}
            {finding.exploit_poc && (
              <SubSection title="PoC">
                <CodeBlock code={finding.exploit_poc} />
              </SubSection>
            )}
          </Section>
        )}

        {/* Fix Suggestion */}
        {(finding.fix_description || finding.fix_code_before || finding.fix_code_after) && (
          <Section title="修复建议" icon={<Wrench className="w-5 h-5" />}>
            {finding.fix_description && (
              <SubSection title="修复说明">
                <p className="text-foreground">{finding.fix_description}</p>
              </SubSection>
            )}
            {finding.fix_code_before && (
              <SubSection title="修复前">
                <CodeBlock code={finding.fix_code_before} />
              </SubSection>
            )}
            {finding.fix_code_after && (
              <SubSection title="修复后">
                <CodeBlock code={finding.fix_code_after} />
              </SubSection>
            )}
          </Section>
        )}

        {/* Manual Confirmation */}
        <Section title="人工确认" icon={<CheckCircle className="w-5 h-5" />}>
          {!finding.manual_confirmation_status ? (
            <div className="space-y-4">
              <p className="text-muted-foreground text-sm">请确认此漏洞的状态</p>
              <Textarea
                placeholder="添加备注（可选）"
                value={confirmNotes}
                onChange={(e) => setConfirmNotes(e.target.value)}
                className="cyber-input"
                rows={3}
              />
              <div className="flex gap-3">
                <Button
                  className="cyber-btn bg-emerald-500/90 border-emerald-500/50 hover:bg-emerald-500"
                  onClick={() => handleConfirm("已确认")}
                  disabled={confirming}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  确认漏洞
                </Button>
                <Button
                  className="cyber-btn bg-slate-500/90 border-slate-500/50 hover:bg-slate-500"
                  onClick={() => handleConfirm("误报")}
                  disabled={confirming}
                >
                  <XCircle className="w-4 h-4 mr-2" />
                  误报
                </Button>
                <Button
                  className="cyber-btn bg-blue-500/90 border-blue-500/50 hover:bg-blue-500"
                  onClick={() => handleConfirm("已修复")}
                  disabled={confirming}
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  已修复
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Badge className={getConfirmationStatusColor(finding.manual_confirmation_status)}>
                  {finding.manual_confirmation_status}
                </Badge>
                {finding.confirmed_at && (
                  <span className="text-sm text-muted-foreground">
                    {new Date(finding.confirmed_at).toLocaleString('zh-CN')}
                  </span>
                )}
              </div>
              {finding.manual_confirmation_notes && (
                <p className="text-foreground">{finding.manual_confirmation_notes}</p>
              )}
              <Button
                className="cyber-btn-outline mt-2"
                onClick={() => {
                  // Reset confirmation to allow re-confirm
                  const reset = async () => {
                    try {
                      setConfirming(true);
                      const request: ManualConfirmRequest = {
                        manual_confirmation_status: "待确认",
                      };
                      await confirmOpenCodeFinding(taskId, finding.id, request);
                      toast.success("已重置确认状态");
                      onFindingUpdated();
                    } catch (error) {
                      console.error("Failed to reset confirmation:", error);
                      toast.error("重置失败");
                    } finally {
                      setConfirming(false);
                    }
                  };
                  reset();
                }}
                disabled={confirming}
              >
                重新确认
              </Button>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="text-primary">{icon}</div>
        <h3 className="font-bold text-foreground uppercase tracking-wide">{title}</h3>
      </div>
      <div className="pl-7">{children}</div>
    </div>
  );
}

function SubSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2 mb-4 last:mb-0">
      <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">{title}</h4>
      {children}
    </div>
  );
}

function CodeBlock({ code }: { code: string }) {
  return (
    <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm font-mono text-foreground">
      <code>{code}</code>
    </pre>
  );
}

function ImpactItem({ label, level }: { label: string; level: string }) {
  const getLevelColor = (l: string) => {
    switch (l.toLowerCase()) {
      case "high": return "text-rose-500";
      case "medium": return "text-yellow-500";
      case "low": return "text-green-500";
      default: return "text-muted-foreground";
    }
  };

  const getLevelLabel = (l: string) => {
    switch (l.toLowerCase()) {
      case "high": return "高";
      case "medium": return "中";
      case "low": return "低";
      default: return l;
    }
  };

  return (
    <div className="text-center p-3 bg-muted rounded-lg">
      <p className="text-sm text-muted-foreground mb-1">{label}</p>
      <p className={`text-lg font-bold ${getLevelColor(level)}`}>{getLevelLabel(level)}</p>
    </div>
  );
}
