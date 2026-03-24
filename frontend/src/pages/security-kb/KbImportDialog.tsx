/**
 * 安全知识库 - 导入对话框
 * mode: 'single' 导入单个 .md | 'zip' 批量导入 ZIP
 */

import { useCallback, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Upload, FileText, Archive, Loader2,
  CheckCircle2, XCircle, MinusCircle, ChevronDown, ChevronUp,
} from 'lucide-react';

import type { ImportZipResponse } from '@/shared/api/securityKb';
import {
  importVulnerabilityMd, importVulnerabilityZip,
  importAttackPatternMd, importAttackPatternZip,
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

type ResultState =
  | { type: 'zip'; data: ImportZipResponse }
  | { type: 'single'; ok: boolean; reason?: string };

export default function KbImportDialog({ kbType, mode, open, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ResultState | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const SIZE_LIMIT = mode === 'single' ? 10 * 1024 * 1024 : 100 * 1024 * 1024;
  const SIZE_LABEL = mode === 'single' ? '10MB' : '100MB';
  const ACCEPT = mode === 'single' ? '.md' : '.zip';

  const reset = () => {
    setFile(null); setOverwrite(false); setResult(null);
    setShowDetails(false); setImporting(false);
  };

  const handleClose = () => {
    if (importing) return;
    reset();
    onClose();
  };

  const pickFile = (f: File) => {
    if (f.size > SIZE_LIMIT) { toast.error(`文件大小超过 ${SIZE_LABEL} 限制`); return; }
    setFile(f); setResult(null);
  };

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }, []); // eslint-disable-line

  const handleImport = async () => {
    if (!file) { toast.error('请先选择文件'); return; }
    setImporting(true); setResult(null);
    try {
      if (mode === 'single') {
        if (kbType === 'vulnerability') await importVulnerabilityMd(file, overwrite);
        else await importAttackPatternMd(file, overwrite);
        setResult({ type: 'single', ok: true });
        toast.success('导入成功');
        onImported();
      } else {
        let res: ImportZipResponse;
        if (kbType === 'vulnerability') res = await importVulnerabilityZip(file, overwrite);
        else res = await importAttackPatternZip(file, overwrite);
        setResult({ type: 'zip', data: res });
        if (res.success > 0) { toast.success(`成功导入 ${res.success} 条`); onImported(); }
        else toast.warning('导入完成，成功 0 条');
      }
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      if (mode === 'single') setResult({ type: 'single', ok: false, reason: msg || '导入失败' });
      toast.error(msg || '导入失败');
    } finally {
      setImporting(false);
    }
  };

  const kbLabel = kbType === 'vulnerability' ? '漏洞条目' : '攻击模式';
  const titleMap: Record<Mode, string> = {
    single: `导入${kbLabel} (.md)`,
    zip: `批量导入${kbLabel} (ZIP)`,
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="!w-[min(90vw,520px)] !max-w-none flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg">
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
          <DialogTitle className="flex items-center gap-3 font-mono text-foreground">
            <div className="p-2 bg-primary/20 rounded border border-primary/30">
              {mode === 'single' ? <FileText className="w-5 h-5 text-primary" /> : <Archive className="w-5 h-5 text-primary" />}
            </div>
            <div>
              <span className="text-base font-bold uppercase tracking-wider">{titleMap[mode]}</span>
              <p className="text-xs text-muted-foreground font-normal mt-0.5">大小限制 {SIZE_LABEL}{mode === 'zip' ? ' · 最多 500 个文件' : ''}</p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-5">
          {/* Drop Zone */}
          <div
            role="button"
            tabIndex={0}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200 ${
              dragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50 hover:bg-primary/5'
            }`}
            onClick={() => inputRef.current?.click()}
            onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) pickFile(f); e.target.value = ''; }}
            />
            <div className="flex flex-col items-center gap-3">
              {mode === 'single'
                ? <FileText className="w-10 h-10 text-primary/60" />
                : <Archive className="w-10 h-10 text-primary/60" />
              }
              {file ? (
                <div>
                  <p className="text-sm font-mono font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB · 点击重新选择</p>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-mono text-muted-foreground">
                    点击或拖拽上传 <span className="text-primary font-bold">{ACCEPT}</span> 文件
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Overwrite */}
          <div className="flex items-center gap-3">
            <Switch checked={overwrite} onCheckedChange={setOverwrite} />
            <Label className="text-xs font-bold text-muted-foreground uppercase cursor-pointer">
              Slug 冲突时覆盖已有条目（系统内置条目始终不覆盖）
            </Label>
          </div>

          {/* Result */}
          {result && (
            <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-3">
              {result.type === 'single' ? (
                <div className="flex items-center gap-2">
                  {result.ok
                    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                    : <XCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                  }
                  <span className="text-sm font-mono">
                    {result.ok ? '导入成功' : `导入失败：${result.reason}`}
                  </span>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-4 text-sm font-mono flex-wrap">
                    <span className="flex items-center gap-1.5 text-emerald-400">
                      <CheckCircle2 className="w-4 h-4" />成功 {result.data.success}
                    </span>
                    <span className="flex items-center gap-1.5 text-yellow-400">
                      <MinusCircle className="w-4 h-4" />跳过 {result.data.skipped}
                    </span>
                    <span className="flex items-center gap-1.5 text-red-400">
                      <XCircle className="w-4 h-4" />失败 {result.data.failed}
                    </span>
                    <span className="ml-auto text-xs text-muted-foreground">共 {result.data.total} 个</span>
                  </div>
                  {(result.data.failed > 0 || result.data.skipped > 0) && (
                    <button
                      type="button"
                      className="flex items-center gap-1 text-xs font-mono text-muted-foreground hover:text-primary transition-colors"
                      onClick={() => setShowDetails(v => !v)}
                    >
                      {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                      {showDetails ? '收起明细' : '展开明细'}
                    </button>
                  )}
                  {showDetails && (
                    <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
                      {result.data.results
                        .filter(r => r.status !== 'created' && r.status !== 'updated')
                        .map((r, i) => (
                          <div key={i} className="flex items-start gap-2 text-xs font-mono">
                            {r.status === 'skipped'
                              ? <MinusCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                              : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
                            }
                            <span className="text-muted-foreground">
                              <span className="text-foreground/70">{r.filename}</span>
                              {r.reason && <span className="ml-1">— {r.reason}</span>}
                            </span>
                          </div>
                        ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
          <Button type="button" variant="outline" onClick={handleClose} disabled={importing} className="cyber-btn-outline">取消</Button>
          <Button type="button" onClick={handleImport} disabled={!file || importing} className="cyber-btn-primary">
            {importing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            <Upload className="w-4 h-4 mr-2" />
            开始导入
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
