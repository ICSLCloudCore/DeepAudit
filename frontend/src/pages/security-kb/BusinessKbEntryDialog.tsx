/**
 * 业务知识库 - 新建/编辑条目对话框
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
import { Loader2, Eye, Edit3, BookMarked } from 'lucide-react';

import { titleToSlug } from './types';
import type { BusinessKbEntry, BusinessKbTypeOption } from '@/shared/api/securityKb';
import { createBusinessKb, updateBusinessKb } from '@/shared/api/securityKb';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  editingEntry?: BusinessKbEntry | null;
  typeOptions: BusinessKbTypeOption[];
}

function initForm() {
  return {
    title: '', slug: '', kb_type: '', version: '1.0.0',
    tags: '', products: '', summary: '', content: '', is_active: true,
  };
}

function entryToForm(e: BusinessKbEntry) {
  return {
    title: e.title, slug: e.slug, kb_type: e.kb_type, version: e.version,
    tags: (e.tags ?? []).join(', '),
    products: (e.products ?? []).join(', '),
    summary: e.summary ?? '', content: e.content ?? '', is_active: e.is_active,
  };
}

export default function BusinessKbEntryDialog({ open, onClose, onSaved, editingEntry, typeOptions }: Props) {
  const isEdit = !!editingEntry;
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const [slugManual, setSlugManual] = useState(false);
  const [form, setForm] = useState(initForm);

  useEffect(() => {
    if (!open) return;
    if (editingEntry) {
      setForm(entryToForm(editingEntry));
      setSlugManual(true);
    } else {
      const defaultType = typeOptions[0]?.value ?? '';
      setForm({ ...initForm(), kb_type: defaultType });
      setSlugManual(false);
    }
    setPreview(false);
  }, [open, editingEntry, typeOptions]);

  const set = (k: keyof ReturnType<typeof initForm>, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }));

  const handleTitleChange = (v: string) => {
    set('title', v);
    if (!slugManual) set('slug', titleToSlug(v));
  };

  const handleSave = async () => {
    if (!form.title.trim()) { toast.error('请填写标题'); return; }
    if (!form.slug.trim()) { toast.error('请填写 Slug'); return; }
    if (!form.kb_type) { toast.error('请选择类型'); return; }
    if (!form.content.trim()) { toast.error('请填写正文内容'); return; }

    const tags = form.tags.split(',').map(t => t.trim()).filter(Boolean);
    const products = form.products.split(',').map(p => p.trim()).filter(Boolean);

    setSaving(true);
    try {
      if (isEdit && editingEntry) {
        await updateBusinessKb(editingEntry.id, {
          title: form.title, kb_type: form.kb_type, version: form.version,
          tags, products, summary: form.summary || undefined,
          content: form.content, is_active: form.is_active,
        });
        toast.success('已更新');
      } else {
        await createBusinessKb({
          title: form.title, slug: form.slug, kb_type: form.kb_type, version: form.version,
          tags, products, summary: form.summary || undefined,
          content: form.content, is_active: form.is_active,
        });
        toast.success('已创建');
      }
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="!w-[min(95vw,860px)] !max-w-none max-h-[90vh] flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg">
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
          <DialogTitle className="font-mono font-bold uppercase tracking-wider flex items-center gap-2">
            <BookMarked className="w-4 h-4 text-primary" />
            {isEdit ? '编辑业务知识库条目' : '新建业务知识库条目'}
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Title + Slug */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground uppercase">标题 *</Label>
              <Input value={form.title} onChange={e => handleTitleChange(e.target.value)}
                placeholder="条目标题" className="cyber-input font-mono text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground uppercase">Slug *</Label>
              <Input
                value={form.slug} disabled={isEdit}
                onChange={e => { setSlugManual(true); set('slug', e.target.value); }}
                placeholder="url-friendly-slug" className="cyber-input font-mono text-sm"
              />
            </div>
          </div>

          {/* Type + Version */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground uppercase">类型 *</Label>
              <Select value={form.kb_type} onValueChange={v => set('kb_type', v)}>
                <SelectTrigger className="cyber-input font-mono text-sm">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent className="cyber-dialog border-border">
                  {typeOptions.map(t => (
                    <SelectItem key={t.value} value={t.value} className="font-mono text-sm">
                      {t.label}
                      {t.description && <span className="text-muted-foreground ml-2 text-xs">— {t.description}</span>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground uppercase">版本</Label>
              <Input value={form.version} onChange={e => set('version', e.target.value)}
                placeholder="1.0.0" className="cyber-input font-mono text-sm" />
            </div>
          </div>

          {/* Tags + Products */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground uppercase">标签（逗号分隔）</Label>
              <Input value={form.tags} onChange={e => set('tags', e.target.value)}
                placeholder="标签1, 标签2" className="cyber-input font-mono text-sm" />
              {form.tags && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {form.tags.split(',').map(t => t.trim()).filter(Boolean).map(t => (
                    <Badge key={t} variant="outline" className="text-[10px] font-mono">#{t}</Badge>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-mono text-muted-foreground uppercase">涉及产品（逗号分隔）</Label>
              <Input value={form.products} onChange={e => set('products', e.target.value)}
                placeholder="产品A, 产品B" className="cyber-input font-mono text-sm" />
              {form.products && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {form.products.split(',').map(p => p.trim()).filter(Boolean).map(p => (
                    <Badge key={p} variant="outline" className="text-[10px] font-mono cyber-badge-info">{p}</Badge>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Summary */}
          <div className="space-y-1.5">
            <Label className="text-xs font-mono text-muted-foreground uppercase">摘要</Label>
            <Textarea value={form.summary} onChange={e => set('summary', e.target.value)}
              placeholder="简要描述（可选）" rows={2} className="cyber-input font-mono text-sm resize-none" />
          </div>

          {/* Content */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-mono text-muted-foreground uppercase">正文（Markdown）*</Label>
              <button
                type="button"
                onClick={() => setPreview(p => !p)}
                className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
              >
                {preview ? <Edit3 className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                {preview ? '编辑' : '预览'}
              </button>
            </div>
            {preview ? (
              <div className="min-h-[240px] p-4 rounded-lg border border-border bg-background overflow-y-auto prose prose-invert prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{form.content || '（暂无内容）'}</ReactMarkdown>
              </div>
            ) : (
              <Textarea
                value={form.content}
                onChange={e => set('content', e.target.value)}
                placeholder="# 标题&#10;&#10;正文内容（支持 Markdown 格式）"
                rows={12}
                className="cyber-input font-mono text-sm resize-y"
              />
            )}
          </div>

          {/* is_active */}
          <div className="flex items-center gap-3">
            <Switch checked={form.is_active} onCheckedChange={v => set('is_active', v)} />
            <Label className="text-xs font-mono text-muted-foreground">启用此条目</Label>
          </div>
        </div>

        <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
          <Button variant="outline" onClick={onClose} disabled={saving} className="cyber-btn-outline">取消</Button>
          <Button onClick={handleSave} disabled={saving} className="cyber-btn-primary">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {isEdit ? '保存更改' : '创建条目'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
