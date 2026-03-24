/**
 * 安全知识库 - 导入对话框
 * mode: 'single' 导入单个 .md | 'zip' 批量导入 ZIP
 */

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Upload,
  FileText,
  Archive,
  Loader2,
  CheckCircle2,
  XCircle,
  MinusCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

import type { ImportZipResponse } from '@/shared/api/securityKb';
import {
  importVulnerabilityMd,
  importVulnerabilityZip,
  importAttackPatternMd,
  importAttackPatternZip,
} from '@/shared/api/securityKb';

type Mode = 'single' | 'zip';
type KbType = 'vulnerability' | 'attack-pattern';

interface Props {
  kbType: KbType;
  mode: Mode;
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const ACCEPT_MAP: Record<Mode, string> = {
  single: '.md',
  zip: '.zip',
};

const SIZE_LIMIT_MAP: Record<Mode, number> = {
  single: 10 * 1024 * 1024,
  zip: 100 * 1024 * 1024,
};

const SIZE_LABEL_MAP: Record<Mode, string> = {
  single: '10MB',
  zip: '100MB',
};

type ResultState = { type: 'zip'; data: ImportZipResponse } | { type: 'single'; ok: boolean; reason?: string };

export default function KbImportDialog({ kbType, mode, open, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setOverwrite(false);
    setResult(null);
    setShowDetails(false);
    setImporting(false);
  };

  const handleClose = () => {
    if (importing) return;
    reset();
    onClose();
  };

  const pickFile = (f: File) => {
    const limit = SIZE_LIMIT_MAP[mode];
    if (f.size > limit) {
      toast.error(`文件大小超过 ${SIZE_LABEL_MAP[mode]} 限制`);
      return;
    }
    setFile(f);
    setResult(null);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }, []);

  const handleImport = async () => {
    if (!file) { toast.error('请先选择文件'); return; }
    setImporting(true);
    setResult(null);
    try {
      if (mode === 'single') {
        if (kbType === 'vulnerability') {
          await importVulnerabilityMd(file, overwrite);
        } else {
          await importAttackPatternMd(file, overwrite);
        }
        setResult({ type: 'single', ok: true });
        toast.success('导入成功');
        onImported();
      } else {
        let res: ImportZipResponse;
        if (kbType === 'vulnerability') {
          res = await importVulnerabilityZip(file, overwrite);
        } else {
          res = await importAttackPatternZip(file, overwrite);
        }
        setResult({ type: 'zip', data: res });
        if (res.success > 0) {
          toast.success(`成功导入 ${res.success} 条`);
          onImported();
        } else {
          toast.warning(`导入完成，成功 0 条`);
        }
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (mode === 'single') {
        setResult({ type: 'single', ok: false, reason: msg || '导入失败' });
      }
      toast.error(msg || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const titleMap: Record<Mode, string> = {
    single: kbType === 'vulnerability' ? '导入漏洞条目 (.md)' : '导入攻击模式 (.md)',
    zip: kbType === 'vulnerability' ? '批量导入漏洞条目 (ZIP)' : '批量导入攻击模式 (ZIP)',
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent
        className="max-w-lg flex flex-col p-0"
        style={{ background: 'var(--cyber-bg)', border: '1px solid var(--cyber-border)' }}
      >
        <DialogHeader className="px-6 pt-5 pb-3 border-b" style={{ borderColor: 'var(--cyber-border)' }}>
          <DialogTitle className="font-mono text-primary">{titleMap[mode]}</DialogTitle>
        </DialogHeader>

        <div className="px-6 py-5 space-y-5">
          {/* Drop Zone */}
          <div
            role="button"
            tabIndex={0}
            className={`
              border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200
              ${dragging ? 'border-primary bg-primary/10' : 'border-border/50 hover:border-primary/50 hover:bg-primary/5'}
            `}
            style={{ borderColor: dragging ? 'hsl(var(--primary))' : undefined }}
            onClick={() => inputRef.current?.click()}
            onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT_MAP[mode]}
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
            />
            <div className="flex flex-col items-center gap-3">
              {mode === 'single'
                ? <FileText className="w-10 h-10 text-primary/60" />
                : <Archive className="w-10 h-10 text-primary/60" />
              }
              {file ? (
                <div className="space-y-1">
                  <p className="text-sm font-mono font-medium" style={{ color: 'var(--cyber-text)' }}>
                    {file.name}
                  </p>
                  <p className="text-xs" style={{ color: 'var(--cyber-text-muted)' }}>
                    {(file.size / 1024).toFixed(1)} KB · 点击重新选择
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  <p className="text-sm font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
                    点击或拖拽上传 <span className="text-primary">{ACCEPT_MAP[mode]}</span> 文件
                  </p>
                  <p className="text-xs" style={{ color: 'var(--cyber-text-muted)' }}>
                    大小限制 {SIZE_LABEL_MAP[mode]}
                    {mode === 'zip' && ' · ZIP 内最多 500 个 .md 文件'}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Overwrite toggle */}
          <div className="flex items-center gap-3">
            <Switch checked={overwrite} onCheckedChange={setOverwrite} />
            <Label className="text-sm font-mono" style={{ color: 'var(--cyber-text-muted)' }}>
              slug 冲突时覆盖已有条目（系统内置条目始终不覆盖）
            </Label>
          </div>

          {/* Result area */}
          {result && (
            <div
              className="rounded-xl border p-4 space-y-3"
              style={{ background: 'var(--cyber-bg-elevated)', borderColor: 'var(--cyber-border)' }}
            >
              {result.type === 'single' ? (
                <div className="flex items-center gap-2">
                  {result.ok
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    : <XCircle className="w-4 h-4 text-red-400" />
                  }
                  <span className="text-sm font-mono" style={{ color: 'var(--cyber-text)' }}>
                    {result.ok ? '导入成功' : `导入失败：${result.reason}`}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4 text-sm font-mono">
                    <span className="flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">成功 {result.data.success}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <MinusCircle className="w-4 h-4 text-yellow-400" />
                      <span className="text-yellow-400">跳过 {result.data.skipped}</span>
                    </span>
                    <span className="flex items-center gap-1.5">
                      <XCircle className="w-4 h-4 text-red-400" />
                      <span className="text-red-400">失败 {result.data.failed}</span>
                    </span>
                    <span className="ml-auto text-xs" style={{ color: 'var(--cyber-text-muted)' }}>
                      共 {result.data.total} 个文件
                    </span>
                  </div>
                  {(result.data.failed > 0 || result.data.skipped > 0) && (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs font-mono hover:text-primary transition-colors"
                      style={{ color: 'var(--cyber-text-muted)' }}
                      onClick={() => setShowDetails(v => !v)}
                    >
                      {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {showDetails ? '收起明细' : '展开明细'}
                    </button>
                  )}
                  {showDetails && (
                    <ScrollArea className="max-h-48">
                      <div className="space-y-1.5 pr-2">
                        {result.data.results
                          .filter(r => r.status !== 'created')
                          .map((r, i) => (
                            <div key={i} className="flex items-start gap-2 text-xs font-mono">
                              {r.status === 'skipped'
                                ? <MinusCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                                : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                              }
                              <span style={{ color: 'var(--cyber-text-muted)' }}>
                                <span className="text-white/70">{r.filename}</span>
                                {r.reason && <span className="ml-1">— {r.reason}</span>}
                              </span>
                            </div>
                          ))}
                      </div>
                    </ScrollArea>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t" style={{ borderColor: 'var(--cyber-border)' }}>
          <Button variant="ghost" onClick={handleClose} disabled={importing}>取消</Button>
          <Button onClick={handleImport} disabled={!file || importing} className="font-mono">
            {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Upload className="w-4 h-4 mr-2" />
            开始导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
