/**
 * 业务知识库 - 导入对话框
 */

import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Loader2, Upload, FileText, CheckCircle2, XCircle, SkipForward } from 'lucide-react';

import type { ImportZipResponse } from '@/shared/api/securityKb';
import { importBusinessKbMd, importBusinessKbZip } from '@/shared/api/securityKb';

interface Props {
  mode: 'single' | 'zip';
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function BusinessKbImportDialog({ mode, open, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [overwrite, setOverwrite] = useState(false);
  const [loading, setLoading] = useState(false);
  const [zipResult, setZipResult] = useState<ImportZipResponse | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const accept = mode === 'single' ? '.md' : '.zip';
  const maxLabel = mode === 'single' ? '10MB' : '100MB';

  const handleImport = async () => {
    if (!file) { toast.error('请先选择文件'); return; }
    setLoading(true);
    try {
      if (mode === 'single') {
        await importBusinessKbMd(file, overwrite);
        toast.success('导入成功');
        onImported();
        onClose();
      } else {
        const res = await importBusinessKbZip(file, overwrite);
        setZipResult(res);
        if (res.success > 0) onImported();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.detail ?? '导入失败');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setFile(null);
    setZipResult(null);
    setOverwrite(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="!w-[min(90vw,560px)] !max-w-none flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg">
        <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
          <DialogTitle className="font-mono font-bold uppercase tracking-wider flex items-center gap-2">
            <Upload className="w-4 h-4 text-primary" />
            {mode === 'single' ? '导入单个 .md 文件' : '批量导入 ZIP'}
          </DialogTitle>
        </DialogHeader>

        <div className="p-6 space-y-5">
          {!zipResult ? (
            <>
              <div
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
                onClick={() => fileRef.current?.click()}
              >
                <FileText className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm font-mono text-muted-foreground">
                  {file ? file.name : `点击选择 ${accept} 文件（最大 ${maxLabel}）`}
                </p>
                {file && <p className="text-xs text-muted-foreground mt-1">{(file.size / 1024).toFixed(1)} KB</p>}
              </div>
              <input
                ref={fileRef}
                type="file"
                accept={accept}
                className="hidden"
                onChange={e => setFile(e.target.files?.[0] ?? null)}
              />

              <div className="flex items-center gap-3">
                <Switch checked={overwrite} onCheckedChange={setOverwrite} />
                <Label className="text-xs font-mono text-muted-foreground">
                  覆盖已有条目（系统内置条目始终不覆盖）
                </Label>
              </div>
            </>
          ) : (
            <div className="space-y-3">
              <div className="flex gap-4 text-xs font-mono">
                <span className="text-muted-foreground">总计 {zipResult.total}</span>
                <span className="text-emerald-400">成功 {zipResult.success}</span>
                <span className="text-yellow-400">跳过 {zipResult.skipped}</span>
                <span className="text-red-400">失败 {zipResult.failed}</span>
              </div>
              <div className="max-h-60 overflow-y-auto space-y-1">
                {zipResult.results.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-mono py-1 border-b border-border/50">
                    {r.status === 'created' || r.status === 'updated'
                      ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                      : r.status === 'skipped'
                        ? <SkipForward className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0" />
                        : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                    <span className="truncate flex-1 text-muted-foreground">{r.filename}</span>
                    <Badge variant="outline" className="text-[10px] font-mono shrink-0">{r.status}</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
          <Button variant="outline" onClick={handleClose} className="cyber-btn-outline">
            {zipResult ? '关闭' : '取消'}
          </Button>
          {!zipResult && (
            <Button onClick={handleImport} disabled={loading || !file} className="cyber-btn-primary">
              {loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              开始导入
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
