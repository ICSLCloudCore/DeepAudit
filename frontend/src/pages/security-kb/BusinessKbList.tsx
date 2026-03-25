/**
 * 业务知识库 - 列表页
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
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
  Eye, Edit, Trash2, FileText, Archive, Lock, Calendar, Loader2, Tag, Package,
} from 'lucide-react';

import BusinessKbEntryDialog from './BusinessKbEntryDialog';
import BusinessKbViewDialog from './BusinessKbViewDialog';
import BusinessKbImportDialog from './BusinessKbImportDialog';
import type { BusinessKbEntry, BusinessKbTypeOption } from '@/shared/api/securityKb';
import {
  listBusinessKb, deleteBusinessKb, exportBusinessKbMd,
  exportBusinessKbZip, getBusinessKbTypes,
} from '@/shared/api/securityKb';

const PAGE_SIZE = 20;

export default function BusinessKbList() {
  const [items, setItems] = useState<BusinessKbEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState('');
  const [filterType, setFilterType] = useState<string>('');

  const [showCreate, setShowCreate] = useState(false);
  const [editingEntry, setEditingEntry] = useState<BusinessKbEntry | null>(null);
  const [viewingEntry, setViewingEntry] = useState<BusinessKbEntry | null>(null);
  const [deletingEntry, setDeletingEntry] = useState<BusinessKbEntry | null>(null);
  const [importMode, setImportMode] = useState<'single' | 'zip' | null>(null);
  const [exporting, setExporting] = useState(false);

  const [typeOptions, setTypeOptions] = useState<BusinessKbTypeOption[]>([]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    getBusinessKbTypes()
      .then(setTypeOptions)
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listBusinessKb({
        skip: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        q: q || undefined,
        kb_type: filterType || undefined,
      });
      setItems(res.items);
      setTotal(res.total);
    } catch {
      toast.error('加载业务知识库失败');
    } finally {
      setLoading(false);
    }
  }, [page, q, filterType]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [q, filterType]);

  const handleDelete = async () => {
    if (!deletingEntry) return;
    try {
      await deleteBusinessKb(deletingEntry.id);
      toast.success('已删除');
      setDeletingEntry(null);
      load();
    } catch {
      toast.error('删除失败');
    }
  };

  const handleBatchExport = async () => {
    setExporting(true);
    try {
      await exportBusinessKbZip({});
      toast.success('ZIP 已导出');
    } catch { toast.error('导出失败'); }
    finally { setExporting(false); }
  };

  const getTypeMeta = (value: string) =>
    typeOptions.find(t => t.value === value) ?? { label: value, color: 'sky' };

  const COLOR_MAP: Record<string, string> = {
    sky: 'text-sky-400 bg-sky-500/15 border-sky-500/30',
    emerald: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/30',
    orange: 'text-orange-400 bg-orange-500/15 border-orange-500/30',
    violet: 'text-violet-400 bg-violet-500/15 border-violet-500/30',
    amber: 'text-amber-400 bg-amber-500/15 border-amber-500/30',
  };

  return (
    <div className="space-y-4">
      {/* ── 过滤 + 操作工具栏 ── */}
      <div className="cyber-card p-0">
        <div className="p-4 flex flex-wrap items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground flex-shrink-0">
            共 <span className="text-primary font-bold">{total}</span> 条记录
            {loading && <Loader2 className="w-3 h-3 animate-spin ml-1 inline" />}
          </span>

          <div className="relative flex-1 min-w-[180px] max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="搜索标题、摘要..."
              className="pl-10 cyber-input h-9 text-sm"
            />
          </div>

          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="cyber-input h-9 w-36 text-xs font-mono">
              <SelectValue placeholder="全部类型" />
            </SelectTrigger>
            <SelectContent className="cyber-dialog border-border">
              <SelectItem value="" className="text-xs font-mono">全部类型</SelectItem>
              {typeOptions.map(t => (
                <SelectItem key={t.value} value={t.value} className="text-xs font-mono">{t.label}</SelectItem>
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
            <Plus className="w-4 h-4" />新建条目
          </Button>
        </div>
      </div>

      {/* Grid */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div className="cyber-card p-16">
          <div className="empty-state">
            <FileText className="empty-state-icon" />
            <p className="empty-state-title">暂无业务知识库条目</p>
            <p className="empty-state-description">点击「新建条目」添加第一条</p>
            <Button className="cyber-btn-primary h-10 px-6 mt-4" onClick={() => setShowCreate(true)}>
              <Plus className="w-4 h-4 mr-2" />新建条目
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map(entry => {
            const typeMeta = getTypeMeta(entry.kb_type);
            const colorClass = COLOR_MAP[typeMeta.color] ?? COLOR_MAP.sky;
            return (
              <BizCard
                key={entry.id}
                entry={entry}
                typeMeta={typeMeta}
                colorClass={colorClass}
                onView={() => setViewingEntry(entry)}
                onEdit={() => setEditingEntry(entry)}
                onExport={() => exportBusinessKbMd(entry.id, entry.slug).catch(() => toast.error('导出失败'))}
                onDelete={() => setDeletingEntry(entry)}
              />
            );
          })}
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
      <BusinessKbEntryDialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={load}
        typeOptions={typeOptions}
      />
      <BusinessKbEntryDialog
        open={!!editingEntry}
        onClose={() => setEditingEntry(null)}
        onSaved={load}
        editingEntry={editingEntry}
        typeOptions={typeOptions}
      />
      <BusinessKbViewDialog
        open={!!viewingEntry}
        onClose={() => setViewingEntry(null)}
        onEdit={viewingEntry && !viewingEntry.is_system ? () => { setEditingEntry(viewingEntry); setViewingEntry(null); } : undefined}
        entry={viewingEntry}
        typeOptions={typeOptions}
      />
      <BusinessKbImportDialog
        mode={importMode ?? 'single'}
        open={!!importMode}
        onClose={() => setImportMode(null)}
        onImported={load}
      />

      <AlertDialog open={!!deletingEntry} onOpenChange={v => { if (!v) setDeletingEntry(null); }}>
        <AlertDialogContent className="cyber-dialog border border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">确认删除</AlertDialogTitle>
            <AlertDialogDescription className="text-muted-foreground">
              确定要删除 <span className="text-foreground font-mono font-bold">「{deletingEntry?.title}」</span> 吗？此操作不可撤销。
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

interface CardProps {
  entry: BusinessKbEntry;
  typeMeta: { label: string; color: string };
  colorClass: string;
  onView: () => void;
  onEdit: () => void;
  onExport: () => void;
  onDelete: () => void;
}

function BizCard({ entry, typeMeta, colorClass, onView, onEdit, onExport, onDelete }: CardProps) {
  return (
    <div className={`cyber-card p-0 flex flex-col ${!entry.is_active ? 'opacity-60' : ''}`}>
      <div className="p-4 border-b border-border cursor-pointer hover:bg-primary/5 transition-colors" onClick={onView}>
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex flex-wrap gap-1.5">
            <Badge className={`text-xs font-mono border ${colorClass}`}>{typeMeta.label}</Badge>
            {entry.version && (
              <Badge variant="outline" className="text-xs font-mono text-muted-foreground">v{entry.version}</Badge>
            )}
            {entry.is_system && (
              <Badge className="cyber-badge-info text-xs font-mono"><Lock className="w-2.5 h-2.5 mr-1" />系统</Badge>
            )}
          </div>
          {!entry.is_active && (
            <Badge variant="outline" className="text-xs font-mono shrink-0 opacity-50">禁用</Badge>
          )}
        </div>
        <h3 className="text-sm font-mono font-bold line-clamp-2 leading-snug text-foreground mb-1">{entry.title}</h3>
      </div>

      {entry.summary && (
        <div className="px-4 pt-3 pb-2 cursor-pointer" onClick={onView}>
          <p className="text-xs line-clamp-3 leading-relaxed text-muted-foreground">{entry.summary}</p>
        </div>
      )}

      {(entry.products?.length ?? 0) > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1 items-center">
          <Package className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          {(entry.products ?? []).slice(0, 3).map(p => (
            <Badge key={p} variant="outline" className="text-[10px] font-mono px-1.5 py-0 cyber-badge-info">{p}</Badge>
          ))}
          {(entry.products?.length ?? 0) > 3 && (
            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">+{(entry.products?.length ?? 0) - 3}</Badge>
          )}
        </div>
      )}

      {(entry.tags?.length ?? 0) > 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-1 items-center">
          <Tag className="w-3 h-3 text-muted-foreground flex-shrink-0" />
          {(entry.tags ?? []).slice(0, 4).map(tag => (
            <Badge key={tag} variant="outline" className="text-[10px] font-mono px-1.5 py-0">#{tag}</Badge>
          ))}
          {(entry.tags?.length ?? 0) > 4 && (
            <Badge variant="outline" className="text-[10px] font-mono px-1.5 py-0">+{(entry.tags?.length ?? 0) - 4}</Badge>
          )}
        </div>
      )}

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
