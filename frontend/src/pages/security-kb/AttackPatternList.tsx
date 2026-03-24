/**
 * 攻击模式库 - 列表页
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Plus, Search, ChevronLeft, ChevronRight, Upload, Download,
  Eye, Edit, Trash2, FileText, Archive, Lock, Calendar, Loader2, Swords, GitBranch,
} from 'lucide-react';

import { SEVERITY_OPTIONS, ATTACK_TYPE_OPTIONS, getSeverityMeta } from './types';
import KbEntryDialog from './KbEntryDialog';
import KbViewDialog from './KbViewDialog';
import KbImportDialog from './KbImportDialog';
import AttackPatternVersionDialog from './AttackPatternVersionDialog';
import type { AttackPatternEntry } from '@/shared/api/securityKb';
import {
  listAttackPatterns, deleteAttackPattern,
  exportAttackPatternMd, exportAttackPatternsZip,
} from '@/shared/api/securityKb';

const PAGE_SIZE = 20;

const LIKELIHOOD_COLOR: Record<string, string> = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-sky-400',
};

export default function AttackPatternList() {
  const [items, setItems] = useState<AttackPatternEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [severity, setSeverity] = useState('');
  const [attackType, setAttackType] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [editingEntry, setEditingEntry] = useState<AttackPatternEntry | null>(null);
  const [viewingEntry, setViewingEntry] = useState<AttackPatternEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<AttackPatternEntry | null>(null);
  const [versionEntry, setVersionEntry] = useState<AttackPatternEntry | null>(null);
  const [importMode, setImportMode] = useState<'single' | 'zip' | null>(null);
  const [exporting, setExporting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listAttackPatterns({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        q: q || undefined,
        severity: severity || undefined,
        attack_type: attackType || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      toast.error('加载攻击模式库失败');
    } finally {
      setLoading(false);
    }
  }, [page, q, severity, attackType]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, severity, attackType]);

  const handleDelete = async () => {
    if (!deletingEntry) return;
    try {
      await deleteAttackPattern(deletingEntry.id);
      toast.success('已删除');
      setDeletingEntry(null);
      load();
    } catch {
      toast.error('删除失败');
    }
  };

  const handleExportMd = async (entry: AttackPatternEntry) => {
    try {
      await exportAttackPatternMd(entry.id, entry.slug);
      toast.success('已导出');
    } catch { toast.error('导出失败'); }
  };

  const handleBatchExport = async () => {
    setExporting(true);
    try {
      await exportAttackPatternsZip({ severity: severity || undefined, attack_type: attackType || undefined });
      toast.success('ZIP 已导出');
    } catch { toast.error('导出失败'); }
    finally { setExporting(false); }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="cyber-card p-0">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="搜索标题、CAPEC、摘要..."
              className="pl-10 cyber-input h-9 text-sm"
            />
          </div>

          <Select value={severity || 'all'} onValueChange={v => setSeverity(v === 'all' ? '' : v)}>
            <SelectTrigger className="cyber-input w-32 h-9 text-sm">
              <SelectValue placeholder="严重等级" />
            </SelectTrigger>
            <SelectContent className="cyber-dialog border-border">
              <SelectItem value="all">全部等级</SelectItem>
              {SEVERITY_OPTIONS.map(s => (
                <SelectItem key={s.value} value={s.value}><span className={s.color}>{s.label}</span></SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={attackType || 'all'} onValueChange={v => setAttackType(v === 'all' ? '' : v)}>
            <SelectTrigger className="cyber-input w-36 h-9 text-sm">
              <SelectValue placeholder="攻击类型" />
            </SelectTrigger>
            <SelectContent className="cyber-dialog border-border">
              <SelectItem value="all">全部类型</SelectItem>
              {ATTACK_TYPE_OPTIONS.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex-1" />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="cyber-btn-outline h-9 gap-1.5">
                <Upload className="w-4 h-4" />导入
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="cyber-dialog border-border">
              <DropdownMenuItem onClick={() => setImportMode('single')}>
                <FileText className="w-4 h-4 mr-2" />导入单个 .md
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setImportMode('zip')}>
                <Archive className="w-4 h-4 mr-2" />批量导入 ZIP
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Button variant="outline" size="sm" className="cyber-btn-outline h-9 gap-1.5" onClick={handleBatchExport} disabled={exporting}>
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            批量导出
          </Button>

          <Button size="sm" className="cyber-btn-primary h-9 gap-1.5" onClick={() => setShowCreate(true)}>
            <Plus className="w-4 h-4" />新建攻击模式
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground px-1">
        共 <span className="text-primary font-bold">{total}</span> 条攻击模式
        {loading && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
      </div>

      {/* Grid */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="cyber-card p-16">
          <div className="empty-state">
            <Swords className="empty-state-icon" />
            <p className="empty-state-title">暂无攻击模式</p>
            <p className="empty-state-description">点击「新建攻击模式」添加第一条</p>
            <Button className="cyber-btn-primary h-10 px-6 mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />新建攻击模式
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map(entry => (
            <AttackCard
              key={entry.id}
              entry={entry}
              onView={() => setViewingEntry(entry)}
              onEdit={() => setEditingEntry(entry)}
              onExport={() => handleExportMd(entry)}
              onDelete={() => setDeletingEntry(entry)}
              onVersions={() => setVersionEntry(entry)}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="ghost" size="sm" className="cyber-btn-ghost" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-mono text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="ghost" size="sm" className="cyber-btn-ghost" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Dialogs */}
      <KbEntryDialog mode="attack-pattern" open={showCreate} onClose={() => setShowCreate(false)} onSaved={load} />
      <KbEntryDialog
        mode="attack-pattern"
        open={!!editingEntry}
        onClose={() => setEditingEntry(null)}
        onSaved={load}
        editingEntry={editingEntry}
      />
      <KbViewDialog
        mode="attack-pattern"
        open={!!viewingEntry}
        onClose={() => setViewingEntry(null)}
        onEdit={viewingEntry && !viewingEntry.is_system ? () => { setEditingEntry(viewingEntry); setViewingEntry(null); } : undefined}
        entry={viewingEntry}
      />
      <KbImportDialog
        kbType="attack-pattern"
        mode={importMode ?? 'single'}
        open={!!importMode}
        onClose={() => setImportMode(null)}
        onImported={load}
      />

      {/* Version Management Dialog */}
      <AttackPatternVersionDialog
        open={!!versionEntry}
        onClose={() => setVersionEntry(null)}
        entry={versionEntry}
        onVersionChanged={load}
      />

      <AlertDialog open={!!deletingEntry} onOpenChange={v => { if (!v) setDeletingEntry(null); }}>
        <AlertDialogContent className="cyber-dialog border border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">确认删除</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              确定要删除攻击模式 <span className="text-foreground font-mono font-bold">「{deletingEntry?.title}」</span> 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="cyber-btn-outline">取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600 text-white border-0">
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── 卡片组件 ────────────────────────────────────────────────────────────────

interface CardProps {
  entry: AttackPatternEntry;
  onView: () => void;
  onEdit: () => void;
  onExport: () => void;
  onDelete: () => void;
  onVersions: () => void;
}

function AttackCard({ entry, onView, onEdit, onExport, onDelete, onVersions }: CardProps) {
  const sev = getSeverityMeta(entry.severity);

  return (
    <div className={`cyber-card p-0 flex flex-col ${!entry.is_active ? 'opacity-60' : ''}`}>
      {/* Card Header */}
      <div
        className="p-4 border-b border-border cursor-pointer hover:bg-primary/5 transition-colors"
        onClick={onView}
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge className={`text-xs font-mono ${sev.bg} ${sev.color} border ${sev.border}`}>
              {sev.label}
            </Badge>
            <Badge variant="outline" className="text-xs font-mono">{entry.attack_type}</Badge>
            {entry.likelihood && (
              <span className={`text-[10px] font-mono ${LIKELIHOOD_COLOR[entry.likelihood] ?? 'text-muted-foreground'}`}>
                利用:{entry.likelihood}
              </span>
            )}
            {entry.is_system && (
              <Badge className="cyber-badge-info text-xs font-mono">
                <Lock className="w-2.5 h-2.5 mr-1" />系统
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {/* Clickable version badge */}
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] font-mono px-1.5 py-0.5 rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
              onClick={e => { e.stopPropagation(); onVersions(); }}
              title="查看版本历史"
            >
              <GitBranch className="w-2.5 h-2.5" />
              v{entry.version ?? '1.0.0'}
            </button>
            {!entry.is_active && (
              <Badge variant="outline" className="text-xs font-mono opacity-50">禁用</Badge>
            )}
          </div>
        </div>

        <h3 className="text-sm font-mono font-bold line-clamp-2 leading-snug text-foreground mb-1">
          {entry.title}
        </h3>

        {entry.capec_id && (
          <span className="text-xs font-mono text-orange-400/80">{entry.capec_id}</span>
        )}
      </div>

      {/* Summary */}
      {entry.summary && (
        <div className="px-4 pt-3 pb-2 cursor-pointer" onClick={onView}>
          <p className="text-xs line-clamp-2 leading-relaxed text-muted-foreground">{entry.summary}</p>
        </div>
      )}

      {/* Go packages */}
      {(entry.go_packages?.length ?? 0) > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1">
          {(entry.go_packages ?? []).slice(0, 4).map(pkg => (
            <Badge key={pkg} variant="outline" className="text-[10px] font-mono px-1.5 py-0 cyber-badge-info">
              {pkg}
            </Badge>
          ))}
          {(entry.go_packages?.length ?? 0) > 4 && (
            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">
              +{(entry.go_packages?.length ?? 0) - 4}
            </Badge>
          )}
        </div>
      )}

      {/* Footer actions — always visible */}
      <div className="px-4 py-3 border-t border-border mt-auto flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
          <Calendar className="w-3 h-3" />
          {entry.created_at ? new Date(entry.created_at).toLocaleDateString('zh-CN') : '—'}
        </span>
        <div className="flex items-center gap-0.5">
          <Button size="sm" variant="ghost" className="cyber-btn-ghost h-7 w-7 p-0" title="查看" onClick={onView}>
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm" variant="ghost" className="cyber-btn-ghost h-7 w-7 p-0"
            title={entry.is_system ? '系统条目不可编辑' : '编辑'}
            disabled={entry.is_system}
            onClick={e => { e.stopPropagation(); onEdit(); }}
          >
            <Edit className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm" variant="ghost" className="cyber-btn-ghost h-7 w-7 p-0"
            title="版本管理"
            onClick={e => { e.stopPropagation(); onVersions(); }}
          >
            <GitBranch className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm" variant="ghost" className="cyber-btn-ghost h-7 w-7 p-0" title="导出 .md"
            onClick={e => { e.stopPropagation(); onExport(); }}
          >
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm" variant="ghost"
            className="h-7 w-7 p-0 hover:bg-rose-500/20 hover:text-rose-400 transition-colors"
            title={entry.is_system ? '系统条目不可删除' : '删除'}
            disabled={entry.is_system}
            onClick={e => { e.stopPropagation(); onDelete(); }}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
