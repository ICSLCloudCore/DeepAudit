/**
 * 业务知识库 - 查看条目对话框（Markdown 渲染）
 */

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Edit, Calendar, Tag, Package, Lock } from 'lucide-react';
import { toast } from 'sonner';

import type { BusinessKbEntry, BusinessKbTypeOption } from '@/shared/api/securityKb';
import { exportBusinessKbMd } from '@/shared/api/securityKb';

interface Props {
  open: boolean;
  onClose: () => void;
  onEdit?: () => void;
  entry: BusinessKbEntry | null;
  typeOptions: BusinessKbTypeOption[];
}

const COLOR_MAP: Record<string, string> = {
  sky: 'text-sky-400 bg-sky-500/15 border-sky-500/30',
  emerald: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
  orange: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
  violet: 'text-violet-400 bg-violet-500/15 border-violet-500/30',
  amber: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
};

export default function BusinessKbViewDialog({ open, onClose, onEdit, entry, typeOptions }: Props) {
  if (!entry) return null;

  const typeMeta = typeOptions.find(t => t.value === entry.kb_type)
    ?? { label: entry.kb_type, color: 'sky', description: '' };
  const colorClass = COLOR_MAP[typeMeta.color] ?? COLOR_MAP.sky;

  const handleExport = async () => {
    try {
      await exportBusinessKbMd(entry.id, entry.slug);
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
                <Badge className={`text-xs font-mono border ${colorClass}`}>{typeMeta.label}</Badge>
                {entry.version && (
                  <Badge variant="outline" className="text-xs font-mono text-muted-foreground">v{entry.version}</Badge>
                )}
                {entry.is_system && (
                  <Badge className="cyber-badge-info text-xs font-mono"><Lock className="w-2.5 h-2.5 mr-1" />系统内置</Badge>
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

        {/* Meta bar */}
        <div className="px-6 py-2 border-b border-border flex flex-wrap items-center gap-x-5 gap-y-1 text-xs font-mono text-muted-foreground bg-muted/50 flex-shrink-0">
          {entry.created_at && (
            <span className="flex items-center gap-1 flex-shrink-0">
              <Calendar className="w-3 h-3" />
              {new Date(entry.created_at).toLocaleDateString('zh-CN')}
            </span>
          )}
          {(entry.products?.length ?? 0) > 0 && (
            <span className="flex items-center gap-1 min-w-0">
              <Package className="w-3 h-3 flex-shrink-0" />
              <span className="truncate max-w-[300px]">{entry.products.join('、')}</span>
            </span>
          )}
        </div>

        {/* Tags */}
        {(entry.tags?.length ?? 0) > 0 && (
          <div className="px-6 py-2 border-b border-border flex flex-wrap gap-1.5 items-center flex-shrink-0">
            <Tag className="w-3 h-3 text-muted-foreground flex-shrink-0" />
            {(entry.tags ?? []).map(tag => (
              <Badge key={tag} variant="outline" className="text-xs font-mono">#{tag}</Badge>
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
