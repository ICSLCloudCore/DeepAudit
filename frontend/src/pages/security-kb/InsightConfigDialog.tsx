/**
 * 洞察漏洞库 - 洞察配置对话框
 * 配置洞察开关、洞察周期、项目路径、洞察源（多选）、Prompt，支持手动立即执行
 */

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Loader2, Settings2, Rss, Clock, ToggleLeft, ToggleRight,
  CheckCircle2, CircleDashed, Calendar, RefreshCw, Play,
  FolderOpen, AlertTriangle, CheckCircle,
} from 'lucide-react';

import type {
  InsightConfig,
  InsightRunStatus,
  InsightSourceOption,
} from '@/shared/api/securityKb';
import {
  getInsightConfig,
  updateInsightConfig,
  runInsightNow,
  getInsightRunStatus,
} from '@/shared/api/securityKb';

interface Props {
  open: boolean;
  onClose: () => void;
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
  const [running, setRunning] = useState(false);

  const [enabled, setEnabled] = useState(false);
  const [intervalHours, setIntervalHours] = useState(24);
  const [selectedSources, setSelectedSources] = useState<string[]>(['github', 'nvd', 'go_vuln_db']);
  const [sourceOptions, setSourceOptions] = useState<InsightSourceOption[]>([]);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [nextRunAt, setNextRunAt] = useState<string | null>(null);
  const [projectPath, setProjectPath] = useState('');
  const [insightPrompt, setInsightPrompt] = useState('');
  const [attackPrompt, setAttackPrompt] = useState('');
  const [runStatus, setRunStatus] = useState<InsightRunStatus | null>(null);

  // 轮询洞察状态
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!open) {
      stopPolling();
      return;
    }
    loadConfig();
    loadRunStatus();
  }, [open]);

  const startPolling = () => {
    if (pollRef.current) return;
    pollRef.current = setInterval(async () => {
      try {
        const s = await getInsightRunStatus();
        setRunStatus(s);
        if (!s.running) {
          stopPolling();
          setRunning(false);
          // 刷新 last_run_at
          loadConfig();
        }
      } catch { /* 静默 */ }
    }, 2000);
  };

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

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
      setProjectPath(c.insight_project_path ?? '');
      setInsightPrompt(c.insight_prompt ?? '');
      setAttackPrompt(c.attack_pattern_prompt ?? '');
    } catch {
      toast.error('加载洞察配置失败');
    } finally {
      setLoading(false);
    }
  };

  const loadRunStatus = async () => {
    try {
      const s = await getInsightRunStatus();
      setRunStatus(s);
      if (s.running) {
        setRunning(true);
        startPolling();
      }
    } catch { /* 静默 */ }
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
        insight_project_path: projectPath,
        insight_prompt: insightPrompt,
        attack_pattern_prompt: attackPrompt,
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

  const handleRunNow = async () => {
    if (!projectPath.trim()) {
      toast.error('请先填写洞察项目路径');
      return;
    }
    // 先保存当前配置，再触发执行
    try {
      await updateInsightConfig({
        enabled,
        interval_hours: intervalHours,
        sources: selectedSources,
        insight_project_path: projectPath,
        insight_prompt: insightPrompt,
        attack_pattern_prompt: attackPrompt,
      });
    } catch {
      toast.error('保存配置失败，无法启动洞察');
      return;
    }
    setRunning(true);
    try {
      const res = await runInsightNow();
      if (res.success) {
        toast.success(res.message);
        setRunStatus(res.status);
        startPolling();
      } else {
        toast.error(res.message);
        setRunning(false);
      }
    } catch {
      toast.error('启动洞察失败');
      setRunning(false);
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
    <Dialog open={open} onOpenChange={v => { if (!v) { stopPolling(); onClose(); } }}>
      <DialogContent className="!w-[min(90vw,640px)] !max-w-none max-h-[90vh] flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/20 rounded border border-primary/30 flex-shrink-0">
              <Settings2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <DialogTitle className="sr-only">洞察配置</DialogTitle>
              <span className="text-base font-bold uppercase tracking-wider font-mono text-foreground">洞察配置</span>
              <p className="text-xs text-muted-foreground font-normal mt-0.5">
                Vulnerability Insight Settings
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { stopPolling(); onClose(); }}
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
                        {enabled ? '已启用 — 系统将按周期自动抓取漏洞情报' : '已关闭 — 仅支持手动触发'}
                      </p>
                    </div>
                  </div>
                  <Switch checked={enabled} onCheckedChange={setEnabled} />
                </div>
              </div>

              {/* ── 运行状态 ── */}
              {runStatus && (
                <div className={`cyber-card p-3 flex items-start gap-3 ${
                  runStatus.running ? 'border-primary/40 bg-primary/5' :
                  runStatus.status === 'error' ? 'border-red-500/40 bg-red-500/5' :
                  runStatus.status === 'success' ? 'border-emerald-500/40 bg-emerald-500/5' : ''
                }`}>
                  {runStatus.running ? (
                    <Loader2 className="w-4 h-4 text-primary animate-spin mt-0.5 flex-shrink-0" />
                  ) : runStatus.status === 'error' ? (
                    <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
                  ) : runStatus.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                  ) : null}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-mono font-bold text-foreground">
                      {runStatus.running ? '洞察进行中...' :
                       runStatus.status === 'error' ? '最近一次洞察失败' :
                       runStatus.status === 'success' ? '最近一次洞察完成' : '待机'}
                    </p>
                    {runStatus.running && runStatus.pid && (
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                        PID: {runStatus.pid}{runStatus.port ? ` · 端口: ${runStatus.port}` : ''}
                      </p>
                    )}
                    {runStatus.last_error && (
                      <p className="text-[10px] text-red-400 font-mono mt-0.5 truncate">{runStatus.last_error}</p>
                    )}
                    {runStatus.last_report && !runStatus.running && (
                      <p className="text-[10px] text-muted-foreground font-mono mt-0.5">{runStatus.last_report}</p>
                    )}
                  </div>
                </div>
              )}

              {/* ── 上次/下次运行 ── */}
              {(lastRunAt || nextRunAt) && (
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

              {/* ── 洞察项目路径 ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-primary" />
                  <Label className="text-xs font-bold text-muted-foreground uppercase">
                    洞察项目路径
                  </Label>
                </div>
                <Input
                  value={projectPath}
                  onChange={e => setProjectPath(e.target.value)}
                  placeholder="例如 /workspace/my-go-project"
                  className="cyber-input font-mono text-sm"
                />
                <p className="text-[10px] text-muted-foreground font-mono">
                  opencode serve 将在该目录下启动，对该项目进行安全洞察分析
                </p>
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

              <Separator />

              {/* ── 洞察 Prompt ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" />
                  <Label className="text-xs font-bold text-muted-foreground uppercase">
                    全局洞察 Prompt
                  </Label>
                </div>
                <Textarea
                  value={insightPrompt}
                  onChange={e => setInsightPrompt(e.target.value)}
                  rows={6}
                  className="cyber-input font-mono text-xs resize-y"
                  placeholder="发送给 opencode 的洞察分析指令..."
                />
              </div>

              {/* ── 攻击模式提取 Prompt ── */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Settings2 className="w-4 h-4 text-primary" />
                  <Label className="text-xs font-bold text-muted-foreground uppercase">
                    攻击模式提取 Prompt
                  </Label>
                </div>
                <Textarea
                  value={attackPrompt}
                  onChange={e => setAttackPrompt(e.target.value)}
                  rows={6}
                  className="cyber-input font-mono text-xs resize-y"
                  placeholder="基于洞察结果提取攻击模式的指令..."
                />
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0 flex items-center justify-between gap-3 px-6 py-4 bg-muted border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={handleRunNow}
            disabled={running || loading || saving}
            className="cyber-btn-outline gap-2"
          >
            {running
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Play className="w-4 h-4" />
            }
            {running ? '洞察中...' : '立即执行洞察'}
          </Button>
          <div className="flex gap-3">
            <Button type="button" variant="outline" onClick={() => { stopPolling(); onClose(); }} disabled={saving} className="cyber-btn-outline">
              取消
            </Button>
            <Button type="button" onClick={handleSave} disabled={saving || loading} className="cyber-btn-primary">
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              保存配置
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
