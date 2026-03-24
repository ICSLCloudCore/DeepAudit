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
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Eye, Edit3, Bug, Swords } from 'lucide-react';

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

function initVulnForm() {
  return {
    title: '', slug: '', cve_id: '', cwe_id: '', severity: 'medium',
    category: 'uncategorized', tags: '', summary: '', content: '',
    affected_versions: '', go_packages: '', source_url: '', is_active: true,
  };
}

function initAttackForm() {
  return {
    title: '', slug: '', capec_id: '', attack_type: 'other', severity: 'medium',
    likelihood: 'none', tags: '', summary: '', content: '', mitigations: '',
    go_packages: '', source_url: '', is_active: true,
    version: '1.0.0', version_notes: '',
  };
}

function entryToVulnForm(e: VulnerabilityEntry) {
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

function entryToAttackForm(e: AttackPatternEntry) {
  return {
    title: e.title, slug: e.slug,
    capec_id: e.capec_id ?? '', attack_type: e.attack_type,
    severity: e.severity, likelihood: e.likelihood ?? 'none',
    tags: (e.tags ?? []).join(', '),
    summary: e.summary ?? '', content: e.content,
    mitigations: e.mitigations ?? '',
    go_packages: (e.go_packages ?? []).join(', '),
    source_url: e.source_url ?? '', is_active: e.is_active,
    version: e.version ?? '1.0.0', version_notes: e.version_notes ?? '',
  };
}

function parseTags(raw: string): string[] {
  return raw.split(/[,，]/).map(t => t.trim()).filter(Boolean);
}

type VulnForm = ReturnType<typeof initVulnForm>;
type AttackForm = ReturnType<typeof initAttackForm>;

export default function KbEntryDialog({ mode, open, onClose, onSaved, editingEntry }: Props) {
  const isEditing = !!editingEntry;
  const isVuln = mode === 'vulnerability';

  const [vulnForm, setVulnForm] = useState<VulnForm>(initVulnForm);
  const [attackForm, setAttackForm] = useState<AttackForm>(initAttackForm);
  const [slugManual, setSlugManual] = useState(false);
  const [saving, setSaving] = useState(false);
  const [contentPreview, setContentPreview] = useState(false);
  const [mitigationPreview, setMitigationPreview] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSlugManual(false);
    setContentPreview(false);
    setMitigationPreview(false);
    if (editingEntry) {
      if (isVuln) setVulnForm(entryToVulnForm(editingEntry as VulnerabilityEntry));
      else setAttackForm(entryToAttackForm(editingEntry as AttackPatternEntry));
      setSlugManual(true);
    } else {
      setVulnForm(initVulnForm());
      setAttackForm(initAttackForm());
    }
  }, [open, editingEntry, mode, isVuln]);

  const setV = (key: keyof VulnForm, value: unknown) =>
    setVulnForm(prev => ({ ...prev, [key]: value }));
  const setA = (key: keyof AttackForm, value: unknown) =>
    setAttackForm(prev => ({ ...prev, [key]: value }));

  const handleTitleChange = (v: string) => {
    if (isVuln) {
      setV('title', v);
      if (!slugManual) setV('slug', titleToSlug(v));
    } else {
      setA('title', v);
      if (!slugManual) setA('slug', titleToSlug(v));
    }
  };

  const handleSlugChange = (v: string) => {
    const clean = v.toLowerCase().replace(/[^a-z0-9\-]/g, '');
    if (isVuln) setV('slug', clean);
    else setA('slug', clean);
    setSlugManual(true);
  };

  const handleSubmit = async () => {
    const form = isVuln ? vulnForm : attackForm;
    const title = form.title.trim();
    const slug = form.slug.trim();
    const content = form.content.trim();

    if (!title) { toast.error('标题不能为空'); return; }
    if (!slug) { toast.error('Slug 不能为空'); return; }
    if (!content) { toast.error('正文内容不能为空'); return; }

    setSaving(true);
    try {
      if (isVuln) {
        const f = vulnForm;
        const payload = {
          title, slug,
          cve_id: f.cve_id.trim() || undefined,
          cwe_id: f.cwe_id.trim() || undefined,
          severity: f.severity as 'critical' | 'high' | 'medium' | 'low',
          category: f.category,
          tags: parseTags(f.tags),
          summary: f.summary.trim() || undefined,
          content,
          affected_versions: f.affected_versions.trim() || undefined,
          go_packages: parseTags(f.go_packages),
          source_url: f.source_url.trim() || undefined,
          is_active: f.is_active,
        };
        if (isEditing && editingEntry) await updateVulnerability(editingEntry.id, payload);
        else await createVulnerability(payload);
      } else {
        const f = attackForm;
        const payload = {
          title, slug,
          capec_id: f.capec_id.trim() || undefined,
          attack_type: f.attack_type,
          severity: f.severity as 'critical' | 'high' | 'medium' | 'low',
          likelihood: (f.likelihood === 'none' ? undefined : f.likelihood) as 'high' | 'medium' | 'low' | undefined,
          tags: parseTags(f.tags),
          summary: f.summary.trim() || undefined,
          content,
          mitigations: f.mitigations.trim() || undefined,
          go_packages: parseTags(f.go_packages),
          source_url: f.source_url.trim() || undefined,
          is_active: f.is_active,
          version: f.version.trim() || '1.0.0',
          version_notes: f.version_notes.trim() || undefined,
        };
        if (isEditing && editingEntry) await updateAttackPattern(editingEntry.id, payload);
        else await createAttackPattern(payload);
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

  const dialogTitle = isEditing
    ? (isVuln ? '编辑漏洞条目' : '编辑攻击模式')
    : (isVuln ? '新建漏洞条目' : '新建攻击模式');

  const form = isVuln ? vulnForm : attackForm;
  const tags = parseTags(form.tags);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="!w-[min(92vw,860px)] !max-w-none max-h-[90vh] flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg">
        {/* Header */}
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
          <DialogTitle className="flex items-center gap-3 font-mono text-foreground">
            <div className="p-2 bg-primary/20 rounded border border-primary/30">
              {isVuln
                ? <Bug className="w-5 h-5 text-primary" />
                : <Swords className="w-5 h-5 text-primary" />
              }
            </div>
            <div>
              <span className="text-base font-bold uppercase tracking-wider">{dialogTitle}</span>
              <p className="text-xs text-muted-foreground font-normal mt-0.5">
                {isVuln ? 'Golang Vulnerability Entry' : 'Attack Pattern Entry'}
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        {/* Body — scrollable */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">

          {/* Row 1: 标题 + Slug */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                标题 <span className="text-red-400">*</span>
              </Label>
              <Input
                value={form.title}
                onChange={e => handleTitleChange(e.target.value)}
                placeholder="条目标题..."
                className="cyber-input"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                Slug <span className="text-red-400">*</span>
                {!slugManual
                  ? <span className="text-[10px] normal-case font-normal text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">自动</span>
                  : <span className="text-[10px] normal-case font-normal text-yellow-400/80 bg-yellow-500/10 px-1.5 py-0.5 rounded">已自定义</span>
                }
              </Label>
              <Input
                value={form.slug}
                onChange={e => handleSlugChange(e.target.value)}
                placeholder="kebab-case-identifier"
                className="cyber-input font-mono"
              />
            </div>
          </div>

          {/* Row 2: 严重等级 + 分类/攻击类型 + 附加字段 */}
          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                严重等级 <span className="text-red-400">*</span>
              </Label>
              <Select value={form.severity} onValueChange={v => isVuln ? setV('severity', v) : setA('severity', v)}>
                <SelectTrigger className="cyber-input"><SelectValue /></SelectTrigger>
                <SelectContent className="cyber-dialog border-border">
                  {SEVERITY_OPTIONS.map(s => (
                    <SelectItem key={s.value} value={s.value}>
                      <span className={s.color}>{s.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {isVuln ? (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">
                    漏洞分类 <span className="text-red-400">*</span>
                  </Label>
                  <Select value={vulnForm.category} onValueChange={v => setV('category', v)}>
                    <SelectTrigger className="cyber-input"><SelectValue /></SelectTrigger>
                    <SelectContent className="cyber-dialog border-border">
                      {VULN_CATEGORY_OPTIONS.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">CVE 编号</Label>
                  <Input value={vulnForm.cve_id} onChange={e => setV('cve_id', e.target.value)} placeholder="CVE-2024-XXXX" className="cyber-input font-mono" />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">
                    攻击类型 <span className="text-red-400">*</span>
                  </Label>
                  <Select value={attackForm.attack_type} onValueChange={v => setA('attack_type', v)}>
                    <SelectTrigger className="cyber-input"><SelectValue /></SelectTrigger>
                    <SelectContent className="cyber-dialog border-border">
                      {ATTACK_TYPE_OPTIONS.map(c => (
                        <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">利用可能性</Label>
                  <Select value={attackForm.likelihood} onValueChange={v => setA('likelihood', v)}>
                    <SelectTrigger className="cyber-input"><SelectValue /></SelectTrigger>
                    <SelectContent className="cyber-dialog border-border">
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

          {/* Row 3: 附加元数据 */}
          <div className="grid grid-cols-2 gap-4">
            {isVuln ? (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">CWE 编号</Label>
                  <Input value={vulnForm.cwe_id} onChange={e => setV('cwe_id', e.target.value)} placeholder="CWE-89" className="cyber-input font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">受影响版本</Label>
                  <Input value={vulnForm.affected_versions} onChange={e => setV('affected_versions', e.target.value)} placeholder=">= go1.0.0" className="cyber-input font-mono" />
                </div>
              </>
            ) : (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">CAPEC 编号</Label>
                  <Input value={attackForm.capec_id} onChange={e => setA('capec_id', e.target.value)} placeholder="CAPEC-126" className="cyber-input font-mono" />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-muted-foreground uppercase">来源 URL</Label>
                  <Input value={attackForm.source_url} onChange={e => setA('source_url', e.target.value)} placeholder="https://..." className="cyber-input font-mono" />
                </div>
              </>
            )}
          </div>

          {/* Row 4: 标签 + Go 包 + 来源 URL (vuln) */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">标签（逗号分隔）</Label>
              <Input value={form.tags} onChange={e => isVuln ? setV('tags', e.target.value) : setA('tags', e.target.value)} placeholder="sql-injection, database/sql" className="cyber-input font-mono" />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">相关 Go 包（逗号分隔）</Label>
              <Input value={form.go_packages} onChange={e => isVuln ? setV('go_packages', e.target.value) : setA('go_packages', e.target.value)} placeholder="database/sql, os" className="cyber-input font-mono" />
            </div>
          </div>

          {isVuln && (
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">来源 URL</Label>
              <Input value={vulnForm.source_url} onChange={e => setV('source_url', e.target.value)} placeholder="https://nvd.nist.gov/..." className="cyber-input font-mono" />
            </div>
          )}

          {/* 版本信息（仅攻击模式，且仅新建时显示版本号） */}
          {!isVuln && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase">
                  版本号
                  {isEditing && <span className="ml-1 text-[10px] font-normal normal-case text-muted-foreground/60">（如需更新版本请使用"版本管理"）</span>}
                </Label>
                <Input
                  value={attackForm.version}
                  onChange={e => setA('version', e.target.value)}
                  placeholder="1.0.0"
                  className="cyber-input font-mono"
                  readOnly={isEditing}
                  style={isEditing ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase">版本说明</Label>
                <Input
                  value={attackForm.version_notes}
                  onChange={e => setA('version_notes', e.target.value)}
                  placeholder="初始版本"
                  className="cyber-input"
                />
              </div>
            </div>
          )}

          {/* 标签预览 */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {tags.map(tag => (
                <Badge key={tag} variant="outline" className="text-xs font-mono cyber-badge-muted">#{tag}</Badge>
              ))}
            </div>
          )}

          {/* 摘要 */}
          <div className="space-y-2">
            <Label className="text-xs font-bold text-muted-foreground uppercase">摘要（列表展示用，≤500字）</Label>
            <Textarea
              value={form.summary}
              onChange={e => isVuln ? setV('summary', e.target.value) : setA('summary', e.target.value)}
              placeholder="一句话描述该条目..."
              rows={2}
              maxLength={500}
              className="cyber-input resize-none"
            />
          </div>

          {/* Markdown 正文 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-bold text-muted-foreground uppercase">
                Markdown 正文 <span className="text-red-400">*</span>
              </Label>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant={!contentPreview ? 'default' : 'outline'}
                  className="h-7 px-3 text-xs cyber-btn-ghost"
                  onClick={() => setContentPreview(false)}
                >
                  <Edit3 className="w-3 h-3 mr-1" />编辑
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={contentPreview ? 'default' : 'outline'}
                  className="h-7 px-3 text-xs cyber-btn-ghost"
                  onClick={() => setContentPreview(true)}
                >
                  <Eye className="w-3 h-3 mr-1" />预览
                </Button>
              </div>
            </div>
            {!contentPreview ? (
              <Textarea
                value={form.content}
                onChange={e => isVuln ? setV('content', e.target.value) : setA('content', e.target.value)}
                placeholder={'# 标题\n\n## 漏洞描述\n\n...\n\n## 修复方案\n\n...'}
                rows={12}
                className="cyber-input font-mono text-sm text-emerald-400 resize-y"
                style={{ minHeight: '240px' }}
                onKeyDown={e => {
                  if (e.key === 'Tab') {
                    e.preventDefault();
                    const el = e.currentTarget;
                    const start = el.selectionStart;
                    const end = el.selectionEnd;
                    const val = el.value;
                    el.value = `${val.substring(0, start)}  ${val.substring(end)}`;
                    el.selectionStart = el.selectionEnd = start + 2;
                    if (isVuln) setV('content', el.value);
                    else setA('content', el.value);
                  }
                }}
              />
            ) : (
              <div className="cyber-input min-h-[240px] overflow-auto p-4 prose prose-invert prose-sm max-w-none">
                {form.content.trim()
                  ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{form.content}</ReactMarkdown>
                  : <p className="text-muted-foreground italic text-sm">暂无内容...</p>
                }
              </div>
            )}
          </div>

          {/* 防御措施（仅攻击模式） */}
          {!isVuln && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold text-muted-foreground uppercase">防御措施（Markdown，可选）</Label>
                <div className="flex items-center gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant={!mitigationPreview ? 'default' : 'outline'}
                    className="h-7 px-3 text-xs cyber-btn-ghost"
                    onClick={() => setMitigationPreview(false)}
                  >
                    <Edit3 className="w-3 h-3 mr-1" />编辑
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={mitigationPreview ? 'default' : 'outline'}
                    className="h-7 px-3 text-xs cyber-btn-ghost"
                    onClick={() => setMitigationPreview(true)}
                  >
                    <Eye className="w-3 h-3 mr-1" />预览
                  </Button>
                </div>
              </div>
              {!mitigationPreview ? (
                <Textarea
                  value={attackForm.mitigations}
                  onChange={e => setA('mitigations', e.target.value)}
                  placeholder={'## 防御措施\n\n- 使用 filepath.Clean 清洗路径\n- 验证路径前缀...'}
                  rows={6}
                  className="cyber-input font-mono text-sm text-emerald-400 resize-y"
                  style={{ minHeight: '120px' }}
                />
              ) : (
                <div className="cyber-input min-h-[120px] overflow-auto p-4 prose prose-invert prose-sm max-w-none">
                  {attackForm.mitigations.trim()
                    ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{attackForm.mitigations}</ReactMarkdown>
                    : <p className="text-muted-foreground italic text-sm">暂无防御措施...</p>
                  }
                </div>
              )}
            </div>
          )}

          {/* 启用开关 */}
          <div className="flex items-center gap-3 pt-1">
            <Switch
              checked={form.is_active}
              onCheckedChange={v => isVuln ? setV('is_active', v) : setA('is_active', v)}
            />
            <Label className="text-xs font-bold text-muted-foreground uppercase cursor-pointer">
              启用此条目
            </Label>
          </div>
        </div>

        {/* Footer */}
        <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving} className="cyber-btn-outline">
            取消
          </Button>
          <Button type="button" onClick={handleSubmit} disabled={saving} className="cyber-btn-primary">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEditing ? '保存修改' : '创建条目'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
