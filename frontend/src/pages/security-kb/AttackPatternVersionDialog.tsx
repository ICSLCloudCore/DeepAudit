/**
 * 攻击模式版本管理对话框
 * - 展示当前攻击模式的所有版本列表
 * - 支持新建版本（继承父版本内容 + 可覆盖字段）
 * - 支持将任意版本设为"最新版本"
 * - 支持查看指定版本详情
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import {
  Loader2, GitBranch, Plus, Star, StarOff,
  Calendar, User, ChevronRight, CheckCircle2,
  ArrowUpCircle, Eye,
} from 'lucide-react';
import { getSeverityMeta, getPatternTypeMeta } from './types';
import type { AttackPatternEntry, AttackPatternVersionCreate } from '@/shared/api/securityKb';
import {
  listAttackPatternVersions,
  createAttackPatternVersion,
  setAttackPatternLatestVersion,
} from '@/shared/api/securityKb';
import KbViewDialog from './KbViewDialog';

interface Props {
  open: boolean;
  onClose: () => void;
  entry: AttackPatternEntry | null;
  onVersionChanged: () => void;
}

type PanelView = 'list' | 'new';

export default function AttackPatternVersionDialog({ open, onClose, entry, onVersionChanged }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<AttackPatternEntry[]>([]);
  const [view, setView] = useState<PanelView>('list');
  const [viewingVersion, setViewingVersion] = useState<AttackPatternEntry | null>(null);

  // New version form
  const [newVersion, setNewVersion] = useState('');
  const [versionNotes, setVersionNotes] = useState('');
  const [contentOverride, setContentOverride] = useState('');

  useEffect(() => {
    if (!open || !entry) return;
    setView('list');
    setNewVersion('');
    setVersionNotes('');
    setContentOverride('');
    loadVersions();
  }, [open, entry]);

  const loadVersions = async () => {
    if (!entry) return;
    setLoading(true);
    try {
      const res = await listAttackPatternVersions(entry.id);
      // Sort: newest first
      setVersions([...res.versions].sort((a, b) =>
        new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime()
      ));
    } catch {
      toast.error('加载版本列表失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateVersion = async () => {
    if (!entry) return;
    const v = newVersion.trim();
    if (!v) { toast.error('请填写版本号'); return; }
    // Simple semver-like validation
    if (!/^[\d]+[\d.\-a-zA-Z]*$/.test(v)) {
      toast.error('版本号格式不正确，建议使用如 2.0.0 格式');
      return;
    }
    setSaving(true);
    try {
      const payload: AttackPatternVersionCreate = {
        version: v,
        version_notes: versionNotes.trim() || undefined,
        content: contentOverride.trim() || undefined,
      };
      await createAttackPatternVersion(entry.id, payload);
      toast.success(`版本 ${v} 已创建`);
      onVersionChanged();
      setView('list');
      setNewVersion('');
      setVersionNotes('');
      setContentOverride('');
      await loadVersions();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || '创建版本失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSetLatest = async (v: AttackPatternEntry) => {
    if (v.is_latest) return;
    try {
      await setAttackPatternLatestVersion(v.id);
      toast.success(`版本 ${v.version} 已设为最新版本`);
      onVersionChanged();
      await loadVersions();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || '操作失败');
    }
  };

  const suggestNextVersion = () => {
    if (versions.length === 0) return '1.0.0';
    const latest = versions.find(v => v.is_latest) ?? versions[0];
    const parts = latest.version.split('.');
    if (parts.length >= 3) {
      const patch = parseInt(parts[2] ?? '0', 10);
      return `${parts[0]}.${parts[1]}.${patch + 1}`;
    }
    const minor = parseInt(parts[1] ?? '0', 10);
    return `${parts[0]}.${minor + 1}`;
  };

  if (!entry) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
        <DialogContent className="!w-[min(92vw,680px)] !max-w-none max-h-[88vh] flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg">
          {/* Header */}
          <div className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-primary/20 rounded border border-primary/30 flex-shrink-0">
                <GitBranch className="w-5 h-5 text-primary" />
              </div>
              <div className="min-w-0">
                <DialogTitle className="sr-only">版本管理</DialogTitle>
                <span className="text-base font-bold uppercase tracking-wider font-mono text-foreground">版本管理</span>
                <p className="text-xs text-muted-foreground font-mono truncate mt-0.5">
                  {entry.title}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {view === 'list' && (
                <Button
                  size="sm"
                  className="cyber-btn-primary h-8 gap-1.5 text-xs"
                  onClick={() => { setNewVersion(suggestNextVersion()); setView('new'); }}
                >
                  <Plus className="w-3.5 h-3.5" />新建版本
                </Button>
              )}
              {view === 'new' && (
                <Button size="sm" variant="outline" className="cyber-btn-outline h-8 text-xs"
                  onClick={() => setView('list')}>
                  ← 返回
                </Button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                aria-label="关闭"
              >
                <span className="text-lg leading-none">✕</span>
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {view === 'list' ? (
              <div className="p-5 space-y-3">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  </div>
                ) : versions.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground text-sm font-mono">
                    暂无版本记录
                  </div>
                ) : (
                  versions.map((v, idx) => {
                              const sev = getSeverityMeta(v.severity);
                              const pt = getPatternTypeMeta(v.pattern_type);
                    const isFirst = idx === 0;
                    return (
                      <div
                        key={v.id}
                        className={`rounded-xl border p-4 transition-all ${
                          v.is_latest
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-border bg-muted/20 hover:bg-muted/40'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          {/* Left: version info */}
                          <div className="flex items-start gap-3 min-w-0">
                            {/* Version indicator */}
                            <div className={`mt-0.5 flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center ${
                              v.is_latest ? 'bg-primary/20 border border-primary/40' : 'bg-muted border border-border'
                            }`}>
                              {v.is_latest
                                ? <Star className="w-4 h-4 text-primary" />
                                : <GitBranch className="w-4 h-4 text-muted-foreground" />
                              }
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono font-bold text-sm text-foreground">
                                  v{v.version}
                                </span>
                                {v.is_latest && (
                                  <Badge className="text-[10px] font-mono bg-primary/10 text-primary border border-primary/30">
                                    <CheckCircle2 className="w-2.5 h-2.5 mr-1" />最新版本
                                  </Badge>
                                )}
                                <Badge className={`text-[10px] font-mono ${pt.bg} ${pt.color} border ${pt.border}`}>
                                    {pt.label}
                                  </Badge>
                                  <Badge className={`text-[10px] font-mono ${sev.bg} ${sev.color} border ${sev.border}`}>
                                    {sev.label}
                                  </Badge>
                              </div>

                              {v.version_notes && (
                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                                  {v.version_notes}
                                </p>
                              )}

                              <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono text-muted-foreground flex-wrap">
                                <span className="flex items-center gap-1">
                                  <Calendar className="w-3 h-3" />
                                  {v.created_at ? new Date(v.created_at).toLocaleDateString('zh-CN') : '—'}
                                </span>
                                <span className="font-mono text-muted-foreground/60">{v.slug}</span>
                              </div>
                            </div>
                          </div>

                          {/* Right: actions */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <Button
                              size="sm" variant="ghost"
                              className="cyber-btn-ghost h-7 px-2 text-xs gap-1"
                              onClick={() => setViewingVersion(v)}
                              title="查看此版本"
                            >
                              <Eye className="w-3.5 h-3.5" />查看
                            </Button>
                            {!v.is_latest && !v.is_system && (
                              <Button
                                size="sm" variant="ghost"
                                className="cyber-btn-ghost h-7 px-2 text-xs gap-1"
                                onClick={() => handleSetLatest(v)}
                                title="设为最新版本"
                              >
                                <ArrowUpCircle className="w-3.5 h-3.5" />设为最新
                              </Button>
                            )}
                          </div>
                        </div>

                        {/* Branch line */}
                        {idx < versions.length - 1 && (
                          <div className="ml-4 mt-3 flex items-center gap-2">
                            <div className="w-px h-4 bg-border" />
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              /* New version form */
              <div className="p-5 space-y-5">
                <div className="cyber-card p-4 space-y-1">
                  <p className="text-xs font-mono text-muted-foreground uppercase font-bold">继承自</p>
                  <p className="text-sm font-mono font-semibold text-foreground">
                    {entry.title} <span className="text-primary">v{entry.version}</span>
                  </p>
                  <p className="text-xs text-muted-foreground">新版本将继承所有字段，只有填写的字段会被覆盖</p>
                </div>

                <Separator />

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">
                    版本号 <span className="text-red-400">*</span>
                  </Label>
                  <div className="flex items-center gap-3">
                    <Input
                      value={newVersion}
                      onChange={e => setNewVersion(e.target.value)}
                      placeholder="如 2.0.0、1.1.0"
                      className="cyber-input font-mono w-40"
                    />
                    <span className="text-xs text-muted-foreground font-mono">
                      建议: <button type="button" className="text-primary hover:underline"
                        onClick={() => setNewVersion(suggestNextVersion())}>
                        {suggestNextVersion()}
                      </button>
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">变更说明</Label>
                  <Textarea
                    value={versionNotes}
                    onChange={e => setVersionNotes(e.target.value)}
                    placeholder="描述本版本相对上一版本的主要变更..."
                    rows={3}
                    className="cyber-input resize-none"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">
                    覆盖正文内容（可选，留空则完全继承父版本）
                  </Label>
                  <Textarea
                    value={contentOverride}
                    onChange={e => setContentOverride(e.target.value)}
                    placeholder={'# 攻击模式标题\n\n## 描述\n\n...'}
                    rows={8}
                    className="cyber-input font-mono text-sm text-emerald-400 resize-y"
                    style={{ minHeight: '160px' }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {view === 'new' && (
            <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
              <Button type="button" variant="outline" onClick={() => setView('list')} disabled={saving} className="cyber-btn-outline">
                取消
              </Button>
              <Button type="button" onClick={handleCreateVersion} disabled={saving} className="cyber-btn-primary">
                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                创建新版本
              </Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* View a specific version */}
      <KbViewDialog
        mode="attack-pattern"
        open={!!viewingVersion}
        onClose={() => setViewingVersion(null)}
        entry={viewingVersion}
      />
    </>
  );
}
