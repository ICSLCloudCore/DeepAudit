/**
 * 安全知识库 - 查看条目对话框（Markdown 渲染）
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Download, Edit, ExternalLink, Calendar, Tag } from 'lucide-react';

import { getSeverityMeta } from './types';
import type { VulnerabilityEntry, AttackPatternEntry } from '@/shared/api/securityKb';
import {
  exportVulnerabilityMd,
  exportAttackPatternMd,
} from '@/shared/api/securityKb';
import { toast } from 'sonner';

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

  const sev = getSeverityMeta(entry.severity);
  const isVuln = mode === 'vulnerability';
  const vuln = isVuln ? (entry as VulnerabilityEntry) : null;
  const attack = !isVuln ? (entry as AttackPatternEntry) : null;

  const handleExport = async () => {
    try {
      if (isVuln) {
        await exportVulnerabilityMd(entry.id, entry.slug);
      } else {
        await exportAttackPatternMd(entry.id, entry.slug);
      }
      toast.success('已导出 .md 文件');
    } catch {
      toast.error('导出失败');
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-5xl max-h-[90vh] flex flex-col p-0"
        style={{ background: 'var(--cyber-bg)', border: '1px solid var(--cyber-border)' }}
      >
        {/* Header */}
        <DialogHeader
          className="px-6 pt-5 pb-3 border-b flex-shrink-0"
          style={{ borderColor: 'var(--cyber-border)' }}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2 flex-wrap">
                <Badge className={`text-xs font-mono ${sev.bg} ${sev.color} border ${sev.border}`}>
                  {sev.label}
                </Badge>
                {isVuln && vuln?.category && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {vuln.category}
                  </Badge>
                )}
                {!isVuln && attack?.attack_type && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {attack.attack_type}
                  </Badge>
                )}
                {entry.is_system && (
                  <Badge className="text-xs font-mono bg-primary/10 text-primary border border-primary/30">
                    系统内置
                  </Badge>
                )}
                {!entry.is_active && (
                  <Badge variant="outline" className="text-xs font-mono opacity-50">已禁用</Badge>
                )}
              </div>
              <DialogTitle
                className="text-lg font-mono leading-snug"
                style={{ color: 'var(--cyber-text)' }}
              >
                {entry.title}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button size="sm" variant="outline" onClick={handleExport} className="font-mono text-xs h-8">
                <Download className="w-3.5 h-3.5 mr-1.5" />导出 .md
              </Button>
              {!entry.is_system && onEdit && (
                <Button size="sm" onClick={onEdit} className="font-mono text-xs h-8">
                  <Edit className="w-3.5 h-3.5 mr-1.5" />编辑
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Meta bar */}
        <div
          className="px-6 py-2 border-b flex flex-wrap gap-x-5 gap-y-1.5 text-xs font-mono flex-shrink-0"
          style={{ borderColor: 'var(--cyber-border)', color: 'var(--cyber-text-muted)', background: 'var(--cyber-bg-elevated)' }}
        >
          {isVuln && vuln?.cve_id && (
            <span className="flex items-center gap-1"><Tag className="w-3 h-3" />CVE: {vuln.cve_id}</span>
          )}
          {isVuln && vuln?.cwe_id && (
            <span className="flex items-center gap-1"><Tag className="w-3 h-3" />CWE: {vuln.cwe_id}</span>
          )}
          {!isVuln && attack?.capec_id && (
            <span className="flex items-center gap-1"><Tag className="w-3 h-3" />CAPEC: {attack.capec_id}</span>
          )}
          {!isVuln && attack?.likelihood && (
            <span>利用可能性: {attack.likelihood}</span>
          )}
          {isVuln && vuln?.affected_versions && (
            <span>受影响版本: {vuln.affected_versions}</span>
          )}
          {entry.created_at && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {new Date(entry.created_at).toLocaleDateString('zh-CN')}
            </span>
          )}
          {entry.source_url && (
            <a
              href={entry.source_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-primary transition-colors"
            >
              <ExternalLink className="w-3 h-3" />来源
            </a>
          )}
        </div>

        {/* Tags & packages */}
        {((entry.tags?.length ?? 0) > 0 || (entry.go_packages?.length ?? 0) > 0) && (
          <div
            className="px-6 py-2 border-b flex flex-wrap gap-1.5 flex-shrink-0"
            style={{ borderColor: 'var(--cyber-border)' }}
          >
            {(entry.tags ?? []).map(tag => (
              <Badge
                key={tag}
                variant="outline"
                className="text-xs font-mono"
                style={{ borderColor: 'var(--cyber-border-accent)', color: 'var(--cyber-text-muted)' }}
              >
                #{tag}
              </Badge>
            ))}
            {(entry.go_packages ?? []).map(pkg => (
              <Badge
                key={pkg}
                variant="outline"
                className="text-xs font-mono bg-primary/5 text-primary/80 border-primary/30"
              >
                {pkg}
              </Badge>
            ))}
          </div>
        )}

        {/* Summary */}
        {entry.summary && (
          <div
            className="px-6 py-3 border-b text-sm flex-shrink-0 italic"
            style={{ borderColor: 'var(--cyber-border)', color: 'var(--cyber-text-muted)' }}
          >
            {entry.summary}
          </div>
        )}

        {/* Markdown Content */}
        <ScrollArea className="flex-1 min-h-0">
          <div className="px-6 py-5">
            <div
              className="prose prose-invert prose-sm max-w-none"
              style={{ '--tw-prose-headings': 'hsl(var(--primary))', '--tw-prose-code': 'var(--cyber-text)' } as React.CSSProperties}
            >
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {entry.content || '（暂无内容）'}
              </ReactMarkdown>
            </div>

            {/* Mitigations for attack patterns */}
            {!isVuln && attack?.mitigations && (
              <>
                <div className="mt-8 pt-6 border-t" style={{ borderColor: 'var(--cyber-border)' }}>
                  <h3 className="text-sm font-mono font-semibold mb-3 text-primary">防御措施</h3>
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {attack.mitigations}
                    </ReactMarkdown>
                  </div>
                </div>
              </>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
