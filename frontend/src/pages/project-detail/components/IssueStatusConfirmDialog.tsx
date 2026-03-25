import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const STATUS_LABELS: Record<string, string> = {
  true_positive: "是问题",
  false_positive: "误报",
};

interface IssueStatusConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problemTitle: string;
  newStatus: string;
  onConfirm: (notes: string) => void;
}

export function IssueStatusConfirmDialog({
  open,
  onOpenChange,
  problemTitle,
  newStatus,
  onConfirm,
}: IssueStatusConfirmDialogProps) {
  const [notes, setNotes] = useState(STATUS_LABELS[newStatus] || "");

  useEffect(() => {
    if (open) {
      setNotes(STATUS_LABELS[newStatus] || "");
    }
  }, [open, newStatus]);

  const handleConfirm = () => {
    onConfirm(notes);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="cyber-dialog border border-border">
        <DialogHeader>
          <DialogTitle className="font-mono">确认修改状态</DialogTitle>
          <DialogDescription className="text-muted-foreground font-mono">
            将问题 "<span className="text-foreground font-bold">{problemTitle}</span>" 的状态修改为 "<span className="text-foreground font-bold">{STATUS_LABELS[newStatus] || newStatus}</span>"
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="notes" className="font-mono font-bold uppercase text-xs text-muted-foreground">备注信息</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="输入备注信息..."
              className="cyber-input min-h-[100px]"
            />
          </div>
        </div>

        <DialogFooter className="flex gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="cyber-btn-outline">
            取消
          </Button>
          <Button onClick={handleConfirm} className="cyber-btn-primary">
            确认
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
