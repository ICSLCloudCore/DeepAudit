/**
 * 洞察漏洞库 - 洞察配置对话框
 * 配置洞察开关、洞察周期、洞察源（多选）
 */

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Loader2, Settings2, Rss, Clock, ToggleLeft, ToggleRight,
  CheckCircle2, CircleDashed, Calendar, RefreshCw,
} from 'lucide-react';

import type {
  InsightConfig,
  InsightSourceOption,
} from '@/shared/api/securityKb';
import { getInsightConfig, updateInsightConfig } from '@/shared/api/securityKb';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 配置保存成功后回调（用于更新列表页状态徽标） */
  onSaved: (config: InsightConfig) => void;
}

const INTERVAL_PRESETS = [
  { label: '立即', hours: 0 },
  { label: '每天', hours: 24 },
  { label: '每周', hours: 168 },
  { label: '每月', hours: 720 },
];

export default function InsightConfigDialog({ open, onClose, onSaved }: Props) {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [intervalHours, setIntervalHours] = useState(24);
  const [selectedSources, setSelectedSources] = useState<string[]>(['github', 'nvd', 'go_vuln_db']);
  const [sourceOptions, setSourceOptions] = useState<InsightSourceOption[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    loadConfig();
  }, [open]);

  const loadConfig = async () => {
    setLoading(true);
    try {
      const res = await getInsightConfig();
      const c = res.config;
      setEnabled(c.enabled);
      setIntervalHours(c.interval_hours);
      setSelectedSources(c.sources);
      setLastRunAt(c.last_run_at);
      setNextRunAt(c.next_run_at);
      setSourceOptions(res.source_options);
    } catch {
      toast.error('加载洞察配置失败');
    } finally {
      setLoading(false);
    }
  };

  const toggleSource = (value: string) => {
    setSelectedSources(prev =>
      prev.includes(value) ? prev.filter(s => s !== value) : [...prev, value]
    );
  };

  const handlePreset = (hours: number) => {
    setIntervalHours(hours);
  };

  const handleSave = async () => {
    if (selectedSources.length === 0) {
      toast.error('请至少选择一个洞察源');
      return;
    }
    setSaving(true);
    try {
      const res = await updateInsightConfig({
        enabled,
        interval_hours: intervalHours,
        sources: selectedSources,
      });
      toast.success('洞察配置已保存');
      onSaved(res.config);
      onClose();
    } catch {
      toast.error('保存洞察配置失败');
    } finally {
      setSaving(false);
    }
  };

  const formatDatetime = (iso: string | null) => {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString('zh-CN', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="!w-[min(90vw,560px)] !max-w-none max-h-[85vh] flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg">
        {/* Header — custom close button so it stays visible over bg-muted */}
        <div className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded border border-primary/30 flex-shrink-0">
              <Settings2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              {/* DialogTitle must stay in DOM for a11y — hide the default one via sr-only */}
              <DialogTitle className="sr-only">洞察配置</DialogTitle>
              <span className="text-base font-bold uppercase tracking-wider font-mono text-foreground">洞察配置</span>
              <p className="text-xs text-muted-foreground font-normal mt-0.5">
                Vulnerability Insight Settings
              </p>
            </div>
          </div>
          {/* Explicit close button — visible against muted background */}
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 rounded-md w-8 h-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label="关闭"
          >
            <span className="text-lg leading-none">✕</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : (
            <>
              {/* ── 洞察开关 ── */}
              <div className="cyber-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {enabled
                      ? <ToggleRight className="w-5 h-5 text-primary" />
                      : <ToggleLeft className="w-5 h-5 text-muted-foreground" />
                    }
                    <div>
                      <p className="text-sm font-mono font-bold text-foreground">自动洞察</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {enabled ? '已启用 — 系统将按周期自动抓取漏洞情报' : '已关闭 — 仅支持手动管理条目'}
                      </p>
                    </div>
                  </div>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>
              </div>

              {/* ── 状态信息（仅启用时显示） ── */}
              {enabled && (lastRunAt || nextRunAt) && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="cyber-card p-3 flex items-start gap-2">
                    <RefreshCw className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-mono text-muted-foreground uppercase">上次运行</p>
                      <p className="text-xs font-mono text-foreground mt-0.5">{formatDatetime(lastRunAt)}</p>
                    </div>
                  </div>
                  <div className="cyber-card p-3 flex items-start gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-[10px] font-mono text-muted-foreground uppercase">下次运行</p>
                      <p className="text-xs font-mono text-foreground mt-0.5">{formatDatetime(nextRunAt)}</p>
                    </div>
                  </div>
                </div>
              )}

              <Separator />

              {/* ── 洞察周期 ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  <Label className="text-xs font-bold text-muted-foreground uppercase">
                    洞察周期
                  </Label>
                </div>

                <div className="flex flex-wrap gap-2">
                  {INTERVAL_PRESETS.map(p => (
                    <button
                      key={p.hours}
                      type="button"
                      onClick={() => handlePreset(p.hours)}
                      className={`px-4 py-2 text-xs font-mono rounded border transition-all ${
                        intervalHours === p.hours
                          ? 'bg-primary text-background border-primary'
                          : 'border-border text-muted-foreground hover:border-primary/50 hover:text-foreground'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <Separator />

              {/* ── 洞察源 ── */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Rss className="w-4 h-4 text-primary" />
                    <Label className="text-xs font-bold text-muted-foreground uppercase">
                      洞察源
                    </Label>
                  </div>
                  <span className="text-xs font-mono text-muted-foreground">
                    已选 <span className="text-primary font-bold">{selectedSources.length}</span> / {sourceOptions.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {sourceOptions.map(opt => {
                    const checked = selectedSources.includes(opt.value);
                    return (
                      <div
                        key={opt.value}
                        className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                          checked
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-border hover:border-border/80 hover:bg-muted/30'
                        }`}
                        onClick={() => toggleSource(opt.value)}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleSource(opt.value)}
                          className="mt-0.5 flex-shrink-0"
                          onClick={e => e.stopPropagation()}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-mono font-semibold text-foreground">
                              {opt.label}
                            </span>
                            {checked && (
                              <CheckCircle2 className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {selectedSources.length === 0 && (
                  <p className="text-xs text-red-400 font-mono flex items-center gap-1">
                    <CircleDashed className="w-3.5 h-3.5" />
                    请至少选择一个洞察源
                  </p>
                )}
              </div>

              {/* ── 已选洞察源摘要 ── */}
              {selectedSources.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedSources.map(s => {
                    const opt = sourceOptions.find(o => o.value === s);
                    return (
                      <Badge key={s} variant="outline" className="text-xs font-mono cyber-badge-info">
                        {opt?.label ?? s}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="cyber-btn-outline">
            取消
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || loading} className="cyber-btn-primary">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            保存配置
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
