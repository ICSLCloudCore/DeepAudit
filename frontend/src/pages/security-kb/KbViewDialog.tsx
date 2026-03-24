/**
 * 安全知识库 - 查看条目对话框（Markdown 渲染）
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Edit, Calendar } from 'lucide-react';
import { toast } from 'sonner';

import { getRiskLevelMeta, getPatternTypeMeta } from './types';
import type { VulnerabilityEntry, AttackPatternEntry } from '@/shared/api/securityKb';
import { exportVulnerabilityMd, exportAttackPatternMd } from '@/shared/api/securityKb';

type Mode = 'vulnerability' | 'attack-pattern';

interface Props {
  mode: Mode;
  open: boolean;
  onClose: () => void;
  onEdit?: () => void;
  entry: VulnerabilityEntry | AttackPatternEntry | null;
}

export default function KbViewDialog({ mode, open, onClose, onEdit, entry }: Props) {
  if (!entry) return null;

  const isVuln = mode === 'vulnerability';
  const attack = !isVuln ? (entry as AttackPatternEntry) : null;
  const sev = !isVuln && attack ? getRiskLevelMeta(attack.risk_level) : null;

  const handleExport = async () => {
    try {
      if (isVuln) await exportVulnerabilityMd(entry.id, entry.slug);
      else await exportAttackPatternMd(entry.id, entry.slug);
      toast.success('已导出 .md 文件');
    } catch {
      toast.error('导出失败');
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="!w-[min(95vw,960px)] !max-w-none max-h-[90vh] flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                {/* Severity badge only for attack patterns */}
                {sev && (
                  <Badge className={`text-xs font-mono ${sev.bg} ${sev.color} border ${sev.border}`}>
                    {sev.label}
                  </Badge>
                )}
                {/* Vuln: insight report badge */}
                {isVuln && (
                  <Badge variant="outline" className="text-xs font-mono">洞察报告</Badge>
                )}
                {!isVuln && attack?.pattern_type && (() => {
                  const pt = getPatternTypeMeta(attack.pattern_type);
                  return <Badge className={`text-xs font-mono ${pt.bg} ${pt.color} border ${pt.border}`}>{pt.label}</Badge>;
                })()}
                {!isVuln && attack?.version && (
                  <Badge className="text-xs font-mono bg-primary/10 text-primary border border-primary/30">
                    v{attack.version}
                  </Badge>
                )}
                {entry.is_system && (
                  <Badge className="cyber-badge-info text-xs font-mono">系统内置</Badge>
                )}
                {!entry.is_active && (
                  <Badge variant="outline" className="text-xs font-mono opacity-50">已禁用</Badge>
                )}
              </div>
              <DialogTitle className="text-base font-bold font-mono leading-snug text-foreground">
                {entry.title}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button size="sm" variant="outline" onClick={handleExport} className="cyber-btn-outline h-8 text-xs">
                <Download className="w-3.5 h-3.5 mr-1.5" />导出 .md
              </Button>
              {!entry.is_system && onEdit && (
                <Button size="sm" onClick={onEdit} className="cyber-btn-primary h-8 text-xs">
                  <Edit className="w-3.5 h-3.5 mr-1.5" />编辑
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Meta bar — attack pattern: date only */}
        {!isVuln && entry.created_at && (
          <div className="px-6 py-2 border-b border-border flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-mono text-muted-foreground bg-muted/50 flex-shrink-0">
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(entry.created_at).toLocaleDateString('zh-CN')}
            </span>
          </div>
        )}

        {/* Vuln meta bar — simplified (date + source only) */}
        {isVuln && (
          <div className="px-6 py-2 border-b border-border flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-mono text-muted-foreground bg-muted/50 flex-shrink-0">
            {entry.created_at && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {new Date(entry.created_at).toLocaleDateString('zh-CN')}
              </span>
            )}
            {entry.source_url && (
              <a href={entry.source_url} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-primary transition-colors">
                <ExternalLink className="w-3 h-3" />来源
              </a>
            )}
          </div>
        )}

        {/* Tags (vuln: tags + go_packages; attack: tags only) */}
        {((entry.tags?.length ?? 0) > 0 || (isVuln && (entry as VulnerabilityEntry).go_packages?.length)) && (
          <div className="px-6 py-2 border-b border-border flex flex-wrap gap-1.5 flex-shrink-0">
            {(entry.tags ?? []).map(tag => (
              <Badge key={tag} variant="outline" className="text-xs font-mono cyber-badge-muted">#{tag}</Badge>
            ))}
            {isVuln && ((entry as VulnerabilityEntry).go_packages ?? []).map(pkg => (
              <Badge key={pkg} variant="outline" className="text-xs font-mono cyber-badge-info">{pkg}</Badge>
            ))}
          </div>
        )}

        {/* Summary */}
        {entry.summary && (
          <div className="px-6 py-3 border-b border-border text-sm italic text-muted-foreground flex-shrink-0">
            {entry.summary}
          </div>
        )}

        {/* Markdown Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="prose prose-invert prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {entry.content || '（暂无内容）'}
            </ReactMarkdown>
          </div>

        </div>
      </DialogContent>
    </Dialog>
  );
}
