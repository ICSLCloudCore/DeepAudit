/**
 * 安全知识库 - 新建/编辑条目对话框
 * 漏洞库与攻击模式库共用，通过 mode prop 区分
 */

import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, X, Eye, Edit3 } from 'lucide-react';

import {
  SEVERITY_OPTIONS,
  LIKELIHOOD_OPTIONS,
  VULN_CATEGORY_OPTIONS,
  ATTACK_TYPE_OPTIONS,
  titleToSlug,
} from './types';
import type { VulnerabilityEntry, AttackPatternEntry } from '@/shared/api/securityKb';
import {
  createVulnerability,
  updateVulnerability,
  createAttackPattern,
  updateAttackPattern,
} from '@/shared/api/securityKb';

type Mode = 'vulnerability' | 'attack-pattern';

interface Props {
  mode: Mode;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingEntry?: VulnerabilityEntry | AttackPatternEntry | null;
}

function initVulnForm(): Record<string, unknown> {
  return {
    title: '', slug: '', cve_id: '', cwe_id: '', severity: 'medium',
    category: 'uncategorized', tags: '', summary: '', content: '',
    affected_versions: '', go_packages: '', source_url: '', is_active: true,
  };
}

function initAttackForm(): Record<string, unknown> {
  return {
    title: '', slug: '', capec_id: '', attack_type: 'other', severity: 'medium',
    likelihood: '', tags: '', summary: '', content: '', mitigations: '',
    go_packages: '', source_url: '', is_active: true,
  };
}

function entryToVulnForm(e: VulnerabilityEntry): Record<string, unknown> {
  return {
    title: e.title, slug: e.slug,
    cve_id: e.cve_id ?? '', cwe_id: e.cwe_id ?? '',
    severity: e.severity, category: e.category,
    tags: (e.tags ?? []).join(', '),
    summary: e.summary ?? '', content: e.content,
    affected_versions: e.affected_versions ?? '',
    go_packages: (e.go_packages ?? []).join(', '),
    source_url: e.source_url ?? '', is_active: e.is_active,
  };
}

function entryToAttackForm(e: AttackPatternEntry): Record<string, unknown> {
  return {
    title: e.title, slug: e.slug,
    capec_id: e.capec_id ?? '', attack_type: e.attack_type,
    severity: e.severity, likelihood: e.likelihood ?? '',
    tags: (e.tags ?? []).join(', '),
    summary: e.summary ?? '', content: e.content,
    mitigations: e.mitigations ?? '',
    go_packages: (e.go_packages ?? []).join(', '),
    source_url: e.source_url ?? '', is_active: e.is_active,
  };
}

function parseTags(raw: string): string[] {
  return raw.split(/[,，]/).map(t => t.trim()).filter(Boolean);
}

export default function KbEntryDialog({ mode, open, onClose, onSaved, editingEntry }: Props) {
  const isEditing = !!editingEntry;
  const [form, setForm] = useState<Record<string, unknown>>(() =>
    mode === 'vulnerability' ? initVulnForm() : initAttackForm()
  );
  const [slugManual, setSlugManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorTab, setEditorTab] = useState<'edit' | 'preview'>('edit');
  const [contentTab, setContentTab] = useState<'main' | 'mitigation'>('main');
  const slugInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSlugManual(false);
    setEditorTab('edit');
    setContentTab('main');
    if (editingEntry) {
      setForm(
        mode === 'vulnerability'
          ? entryToVulnForm(editingEntry as VulnerabilityEntry)
          : entryToAttackForm(editingEntry as AttackPatternEntry)
      );
      setSlugManual(true);
    } else {
      setForm(mode === 'vulnerability' ? initVulnForm() : initAttackForm());
    }
  }, [open, editingEntry, mode]);

  const set = (key: string, value: unknown) => setForm(prev => ({ ...prev, [key]: value }));

  const handleTitleChange = (v: string) => {
    set('title', v);
    if (!slugManual) set('slug', titleToSlug(v));
  };

  const handleSlugChange = (v: string) => {
    set('slug', v.toLowerCase().replace(/[^a-z0-9\-]/g, ''));
    setSlugManual(true);
  };

  const handleSubmit = async () => {
    const title = String(form.title ?? '').trim();
    const slug = String(form.slug ?? '').trim();
    const content = String(form.content ?? '').trim();

    if (!title) { toast.error('标题不能为空'); return; }
    if (!slug) { toast.error('Slug 不能为空'); return; }
    if (!content) { toast.error('正文内容不能为空'); return; }

    setSaving(true);
    try {
      if (mode === 'vulnerability') {
        const payload = {
          title, slug,
          cve_id: String(form.cve_id ?? '').trim() || undefined,
          cwe_id: String(form.cwe_id ?? '').trim() || undefined,
          severity: String(form.severity) as 'critical' | 'high' | 'medium' | 'low',
          category: String(form.category ?? 'uncategorized'),
          tags: parseTags(String(form.tags ?? '')),
          summary: String(form.summary ?? '').trim() || undefined,
          content,
          affected_versions: String(form.affected_versions ?? '').trim() || undefined,
          go_packages: parseTags(String(form.go_packages ?? '')),
          source_url: String(form.source_url ?? '').trim() || undefined,
          is_active: Boolean(form.is_active),
        };
        if (isEditing && editingEntry) {
          await updateVulnerability(editingEntry.id, payload);
        } else {
          await createVulnerability(payload);
        }
      } else {
        const payload = {
          title, slug,
          capec_id: String(form.capec_id ?? '').trim() || undefined,
          attack_type: String(form.attack_type ?? 'other'),
          severity: String(form.severity) as 'critical' | 'high' | 'medium' | 'low',
          likelihood: (String(form.likelihood ?? '').trim() || undefined) as 'high' | 'medium' | 'low' | undefined,
          tags: parseTags(String(form.tags ?? '')),
          summary: String(form.summary ?? '').trim() || undefined,
          content,
          mitigations: String(form.mitigations ?? '').trim() || undefined,
          go_packages: parseTags(String(form.go_packages ?? '')),
          source_url: String(form.source_url ?? '').trim() || undefined,
          is_active: Boolean(form.is_active),
        };
        if (isEditing && editingEntry) {
          await updateAttackPattern(editingEntry.id, payload);
        } else {
          await createAttackPattern(payload);
        }
      }
      toast.success(isEditing ? '更新成功' : '创建成功');
      onSaved();
      onClose();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      toast.error(msg || (isEditing ? '更新失败' : '创建失败'));
    } finally {
      setSaving(false);
    }
  };

  const title = isEditing
    ? (mode === 'vulnerability' ? '编辑漏洞条目' : '编辑攻击模式')
    : (mode === 'vulnerability' ? '新建漏洞条目' : '新建攻击模式');

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent
        className="max-w-4xl max-h-[90vh] flex flex-col p-0"
        style={{ background: 'var(--cyber-bg)', border: '1px solid var(--cyber-border)' }}
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b" style={{ borderColor: 'var(--cyber-border)' }}>
          <DialogTitle className="font-mono text-primary">{title}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 px-6 py-4">
          <div className="space-y-5">
            {/* Row 1: 标题 + Slug */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
                  标题 <span className="text-red-400">*</span>
                </Label>
                <Input
                  value={String(form.title ?? '')}
                  onChange={e => handleTitleChange(e.target.value)}
                  placeholder="条目标题..."
                  className="font-mono text-sm"
                  style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-mono flex items-center gap-2" style={{ color: 'var(--cyber-text-muted)' }}>
                  Slug <span className="text-red-400">*</span>
                  {!slugManual && (
                    <span className="text-[10px] text-primary/60 bg-primary/10 px-1.5 py-0.5 rounded">自动生成</span>
                  )}
                  {slugManual && (
                    <span className="text-[10px] text-yellow-400/80 bg-yellow-500/10 px-1.5 py-0.5 rounded">已自定义</span>
                  )}
                </Label>
                <Input
                  ref={slugInputRef}
                  value={String(form.slug ?? '')}
                  onChange={e => handleSlugChange(e.target.value)}
                  placeholder="kebab-case-identifier"
                  className="font-mono text-sm"
                  style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
                />
              </div>
            </div>

            {/* Row 2: 严重等级 + 分类 + 特定字段 */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
                  严重等级 <span className="text-red-400">*</span>
                </Label>
                <Select value={String(form.severity)} onValueChange={v => set('severity', v)}>
                  <SelectTrigger style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map(s => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className={s.color}>{s.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {mode === 'vulnerability' ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
                      漏洞分类 <span className="text-red-400">*</span>
                    </Label>
                    <Select value={String(form.category)} onValueChange={v => set('category', v)}>
                      <SelectTrigger style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {VULN_CATEGORY_OPTIONS.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>CVE 编号</Label>
                    <Input
                      value={String(form.cve_id ?? '')}
                      onChange={e => set('cve_id', e.target.value)}
                      placeholder="CVE-2024-XXXX"
                      className="font-mono text-sm"
                      style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
                      攻击类型 <span className="text-red-400">*</span>
                    </Label>
                    <Select value={String(form.attack_type)} onValueChange={v => set('attack_type', v)}>
                      <SelectTrigger style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ATTACK_TYPE_OPTIONS.map(c => (
                          <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>利用可能性</Label>
                    <Select
                      value={String(form.likelihood ?? '')}
                      onValueChange={v => set('likelihood', v === 'none' ? '' : v)}
                    >
                      <SelectTrigger style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}>
                        <SelectValue placeholder="选择..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">不指定</SelectItem>
                        {LIKELIHOOD_OPTIONS.map(l => (
                          <SelectItem key={l.value} value={l.value}>{l.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              )}
            </div>

            {/* Row 3: 附加字段 */}
            <div className="grid grid-cols-2 gap-4">
              {mode === 'vulnerability' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>CWE 编号</Label>
                  <Input
                    value={String(form.cwe_id ?? '')}
                    onChange={e => set('cwe_id', e.target.value)}
                    placeholder="CWE-89"
                    className="font-mono text-sm"
                    style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
                  />
                </div>
              )}
              {mode === 'vulnerability' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>受影响版本</Label>
                  <Input
                    value={String(form.affected_versions ?? '')}
                    onChange={e => set('affected_versions', e.target.value)}
                    placeholder=">= go1.0.0"
                    className="font-mono text-sm"
                    style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
                  />
                </div>
              )}
              {mode === 'attack-pattern' && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>CAPEC 编号</Label>
                  <Input
                    value={String(form.capec_id ?? '')}
                    onChange={e => set('capec_id', e.target.value)}
                    placeholder="CAPEC-126"
                    className="font-mono text-sm"
                    style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
                  />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>来源 URL</Label>
                <Input
                  value={String(form.source_url ?? '')}
                  onChange={e => set('source_url', e.target.value)}
                  placeholder="https://..."
                  className="font-mono text-sm"
                  style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
                />
              </div>
            </div>

            {/* Row 4: 标签 + Go 包 */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
                  标签（逗号分隔）
                </Label>
                <Input
                  value={String(form.tags ?? '')}
                  onChange={e => set('tags', e.target.value)}
                  placeholder="sql-injection, database/sql"
                  className="font-mono text-sm"
                  style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
                  相关 Go 包（逗号分隔）
                </Label>
                <Input
                  value={String(form.go_packages ?? '')}
                  onChange={e => set('go_packages', e.target.value)}
                  placeholder="database/sql, os"
                  className="font-mono text-sm"
                  style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
                />
              </div>
            </div>

            {/* Row 5: 摘要 */}
            <div className="space-y-1.5">
              <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
                摘要（用于列表展示，≤ 500 字）
              </Label>
              <Textarea
                value={String(form.summary ?? '')}
                onChange={e => set('summary', e.target.value)}
                placeholder="一句话描述该条目..."
                rows={2}
                maxLength={500}
                style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
              />
            </div>

            {/* Row 6: Markdown 正文（带预览） */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
                  {mode === 'vulnerability' ? 'Markdown 正文' : 'Markdown 正文'}
                  {mode === 'attack-pattern' && (
                    <span className="ml-2 text-[10px] opacity-60">（防御措施请在下方单独填写）</span>
                  )}
                  <span className="text-red-400 ml-1">*</span>
                </Label>
                <div className="flex items-center gap-1">
                  <Button
                    size="sm"
                    variant={editorTab === 'edit' ? 'default' : 'ghost'}
                    className="h-6 px-2 text-xs"
                    onClick={() => setEditorTab('edit')}
                  >
                    <Edit3 className="w-3 h-3 mr-1" />编辑
                  </Button>
                  <Button
                    size="sm"
                    variant={editorTab === 'preview' ? 'default' : 'ghost'}
                    className="h-6 px-2 text-xs"
                    onClick={() => setEditorTab('preview')}
                  >
                    <Eye className="w-3 h-3 mr-1" />预览
                  </Button>
                </div>
              </div>
              {editorTab === 'edit' ? (
                <Textarea
                  value={String(form.content ?? '')}
                  onChange={e => set('content', e.target.value)}
                  placeholder="# 标题&#10;&#10;## 描述&#10;&#10;..."
                  rows={12}
                  className="font-mono text-sm resize-y"
                  style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)', minHeight: '240px' }}
                  onKeyDown={e => {
                    if (e.key === 'Tab') {
                      e.preventDefault();
                      const el = e.currentTarget;
                      const start = el.selectionStart;
                      const end = el.selectionEnd;
                      const val = el.value;
                      el.value = val.substring(0, start) + '  ' + val.substring(end);
                      el.selectionStart = el.selectionEnd = start + 2;
                      set('content', el.value);
                    }
                  }}
                />
              ) : (
                <div
                  className="prose prose-invert prose-sm max-w-none rounded-md border p-4 min-h-[240px] overflow-auto"
                  style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
                >
                  {String(form.content ?? '').trim() ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {String(form.content ?? '')}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-muted-foreground italic text-sm">暂无内容...</p>
                  )}
                </div>
              )}
            </div>

            {/* Row 7: 防御措施（仅攻击模式） */}
            {mode === 'attack-pattern' && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
                    防御措施（Markdown）
                  </Label>
                  <div className="flex items-center gap-1">
                    <Button
                      size="sm"
                      variant={contentTab === 'main' ? 'default' : 'ghost'}
                      className="h-6 px-2 text-xs"
                      onClick={() => setContentTab('main')}
                    >
                      <Edit3 className="w-3 h-3 mr-1" />编辑
                    </Button>
                    <Button
                      size="sm"
                      variant={contentTab === 'mitigation' ? 'default' : 'ghost'}
                      className="h-6 px-2 text-xs"
                      onClick={() => setContentTab('mitigation')}
                    >
                      <Eye className="w-3 h-3 mr-1" />预览
                    </Button>
                  </div>
                </div>
                {contentTab === 'main' ? (
                  <Textarea
                    value={String(form.mitigations ?? '')}
                    onChange={e => set('mitigations', e.target.value)}
                    placeholder="## 防御措施&#10;&#10;- 使用 filepath.Clean 清洗路径&#10;..."
                    rows={6}
                    className="font-mono text-sm resize-y"
                    style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)', minHeight: '120px' }}
                  />
                ) : (
                  <div
                    className="prose prose-invert prose-sm max-w-none rounded-md border p-4 min-h-[120px] overflow-auto"
                    style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
                  >
                    {String(form.mitigations ?? '').trim() ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {String(form.mitigations ?? '')}
                      </ReactMarkdown>
                    ) : (
                      <p className="text-muted-foreground italic text-sm">暂无防御措施...</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Row 8: 启用开关 */}
            <div className="flex items-center gap-3 pt-1">
              <Switch
                checked={Boolean(form.is_active)}
                onCheckedChange={v => set('is_active', v)}
              />
              <Label className="text-sm font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
                启用此条目
              </Label>
            </div>

            {/* 标签预览 */}
            {String(form.tags ?? '').trim() && (
              <div className="flex flex-wrap gap-1.5">
                {parseTags(String(form.tags ?? '')).map(tag => (
                  <Badge
                    key={tag}
                    variant="outline"
                    className="text-xs font-mono px-2 py-0.5"
                    style={{ borderColor: 'var(--cyber-border-accent)', color: 'var(--cyber-text-muted)' }}
                  >
                    #{tag}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t" style={{ borderColor: 'var(--cyber-border)' }}>
          <Button variant="ghost" onClick={onClose} disabled={saving}>取消</Button>
          <Button onClick={handleSubmit} disabled={saving} className="font-mono">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEditing ? '保存修改' : '创建条目'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
