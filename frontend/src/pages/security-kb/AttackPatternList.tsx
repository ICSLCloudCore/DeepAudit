/**
 * 攻击模式库 - 列表页
 */

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import {
  Plus,
  Search,
  ChevronLeft,
  ChevronRight,
  Upload,
  Download,
  Eye,
  Edit,
  Trash2,
  FileText,
  Archive,
  Lock,
  Calendar,
  Loader2,
  Swords,
} from 'lucide-react';

import { SEVERITY_OPTIONS, ATTACK_TYPE_OPTIONS, getSeverityMeta } from './types';
import KbEntryDialog from './KbEntryDialog';
import KbViewDialog from './KbViewDialog';
import KbImportDialog from './KbImportDialog';
import type { AttackPatternEntry } from '@/shared/api/securityKb';
import {
  listAttackPatterns,
  deleteAttackPattern,
  exportAttackPatternMd,
  exportAttackPatternsZip,
} from '@/shared/api/securityKb';

const PAGE_SIZE = 20;

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
  const [importMode, setImportMode] = useState<'single' | 'zip' | null>(null);
  const [exporting, setExporting] = useState(false);

  const totalPages = Math.ceil(total / PAGE_SIZE);

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
    } catch {
      toast.error('导出失败');
    }
  };

  const handleBatchExport = async () => {
    setExporting(true);
    try {
      await exportAttackPatternsZip({
        severity: severity || undefined,
        attack_type: attackType || undefined,
      });
      toast.success('ZIP 已导出');
    } catch {
      toast.error('导出失败');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="搜索标题、CAPEC、摘要..."
            className="pl-9 font-mono text-sm h-9"
            style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
          />
        </div>

        <Select value={severity || 'all'} onValueChange={v => setSeverity(v === 'all' ? '' : v)}>
          <SelectTrigger
            className="w-32 h-9 font-mono text-sm"
            style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
          >
            <SelectValue placeholder="严重等级" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部等级</SelectItem>
            {SEVERITY_OPTIONS.map(s => (
              <SelectItem key={s.value} value={s.value}>
                <span className={s.color}>{s.label}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={attackType || 'all'} onValueChange={v => setAttackType(v === 'all' ? '' : v)}>
          <SelectTrigger
            className="w-36 h-9 font-mono text-sm"
            style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
          >
            <SelectValue placeholder="攻击类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            {ATTACK_TYPE_OPTIONS.map(c => (
              <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex-1" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="font-mono h-9 gap-2">
              <Upload className="w-3.5 h-3.5" />导入
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem onClick={() => setImportMode('single')}>
              <FileText className="w-4 h-4 mr-2" />导入单个 .md
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setImportMode('zip')}>
              <Archive className="w-4 h-4 mr-2" />批量导入 ZIP
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          variant="outline"
          size="sm"
          className="font-mono h-9 gap-2"
          onClick={handleBatchExport}
          disabled={exporting}
        >
          {exporting
            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
            : <Download className="w-3.5 h-3.5" />
          }
          批量导出
        </Button>

        <Button size="sm" className="font-mono h-9 gap-2" onClick={() => setShowCreate(true)}>
          <Plus className="w-3.5 h-3.5" />新建
        </Button>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
        共 <span className="text-primary font-semibold">{total}</span> 条攻击模式
        {loading && <Loader2 className="w-3 h-3 animate-spin ml-1" />}
      </div>

      {/* Grid */}
      {loading && items.length === 0 ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center h-40 rounded-xl border border-dashed gap-3"
          style={{ borderColor: 'var(--cyber-border)' }}
        >
          <Swords className="w-8 h-8 text-muted-foreground/40" />
          <p className="text-sm font-mono text-muted-foreground">暂无攻击模式，点击「新建」添加</p>
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
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
            {page} / {totalPages}
          </span>
          <Button variant="ghost" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
      )}

      {/* Dialogs */}
      <KbEntryDialog
        mode="attack-pattern"
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={load}
      />
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
        onEdit={viewingEntry && !viewingEntry.is_system ? () => {
          setEditingEntry(viewingEntry);
          setViewingEntry(null);
        } : undefined}
        entry={viewingEntry}
      />
      <KbImportDialog
        kbType="attack-pattern"
        mode={importMode ?? 'single'}
        open={!!importMode}
        onClose={() => setImportMode(null)}
        onImported={load}
      />

      <AlertDialog open={!!deletingEntry} onOpenChange={v => { if (!v) setDeletingEntry(null); }}>
        <AlertDialogContent style={{ background: 'var(--cyber-bg)', border: '1px solid var(--cyber-border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="font-mono">确认删除</AlertDialogTitle>
            <AlertDialogDescription style={{ color: 'var(--cyber-text-muted)' }}>
              确定要删除攻击模式 <span className="text-white font-mono">「{deletingEntry?.title}」</span> 吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-red-500 hover:bg-red-600">
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
}

const LIKELIHOOD_COLOR: Record<string, string> = {
  high: 'text-red-400',
  medium: 'text-yellow-400',
  low: 'text-sky-400',
};

function AttackCard({ entry, onView, onEdit, onExport, onDelete }: CardProps) {
  const sev = getSeverityMeta(entry.severity);

  return (
    <div
      className="group rounded-xl border p-4 flex flex-col gap-3 hover:border-primary/50 transition-all duration-200 cursor-pointer"
      style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
      onClick={onView}
    >
      {/* Top badges */}
      <div className="flex items-center gap-2 flex-wrap">
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
          <Badge className="text-xs font-mono bg-primary/10 text-primary border border-primary/30 ml-auto">
            <Lock className="w-2.5 h-2.5 mr-1" />系统
          </Badge>
        )}
        {!entry.is_active && (
          <Badge variant="outline" className="text-xs font-mono opacity-40">已禁用</Badge>
        )}
      </div>

      {/* Title */}
      <h3
        className="text-sm font-mono font-semibold line-clamp-2 leading-snug"
        style={{ color: 'var(--cyber-text)' }}
      >
        {entry.title}
      </h3>

      {/* CAPEC */}
      {entry.capec_id && (
        <span className="text-xs font-mono text-orange-400/80">{entry.capec_id}</span>
      )}

      {/* Summary */}
      {entry.summary && (
        <p className="text-xs line-clamp-2 leading-relaxed" style={{ color: 'var(--cyber-text-muted)' }}>
          {entry.summary}
        </p>
      )}

      {/* Go packages */}
      {(entry.go_packages?.length ?? 0) > 0 && (
        <div className="flex flex-wrap gap-1">
          {(entry.go_packages ?? []).slice(0, 4).map(pkg => (
            <Badge key={pkg} variant="outline" className="text-[10px] font-mono px-1.5 py-0 bg-primary/5 text-primary/70 border-primary/20">
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

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-1">
        <span className="flex items-center gap-1 text-[10px] font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
          <Calendar className="w-3 h-3" />
          {entry.created_at ? new Date(entry.created_at).toLocaleDateString('zh-CN') : '—'}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={e => e.stopPropagation()}>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="查看" onClick={onView}>
            <Eye className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0"
            title="编辑"
            disabled={entry.is_system}
            onClick={onEdit}
          >
            <Edit className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="导出 .md" onClick={onExport}>
            <Download className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 w-7 p-0 hover:text-red-400"
            title={entry.is_system ? '系统内置条目不可删除' : '删除'}
            disabled={entry.is_system}
            onClick={onDelete}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
