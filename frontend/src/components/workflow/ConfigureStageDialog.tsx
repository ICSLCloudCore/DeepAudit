import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { configureWorkflowStage, startWorkflowStage } from "@/shared/api/workflows";
import type { Workflow } from "@/shared/types/workflow";
import {
  ANALYZE_TECH_STACK_OPTIONS,
  WHITE_TECH_STACK_OPTIONS,
  BLACK_TECH_STACK_OPTIONS,
} from "@/shared/types/workflow";

interface ConfigureStageDialogProps {
  open: boolean;
  workflow: Workflow | null;
  stage: "analyze" | "white" | "black";
  onClose: () => void;
  onSuccess: () => void;
}

const STAGE_LABELS: Record<string, string> = {
  analyze: "威胁分析",
  white: "白盒分析",
  black: "黑盒分析",
};

const TECH_STACK_OPTIONS: Record<string, string[]> = {
  analyze: ANALYZE_TECH_STACK_OPTIONS,
  white: WHITE_TECH_STACK_OPTIONS,
  black: BLACK_TECH_STACK_OPTIONS,
};

export default function ConfigureStageDialog({
  open,
  workflow,
  stage,
  onClose,
  onSuccess,
}: ConfigureStageDialogProps) {
  const [techStack, setTechStack] = useState<string[]>([]);
  const [agents, setAgents] = useState<string[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSaveAndStart = async () => {
    if (!workflow) return;
    
    if (techStack.length === 0) {
      toast.error("请选择技术栈");
      return;
    }
    if (agents.length === 0) {
      toast.error("请选择Agent包");
      return;
    }

    setLoading(true);
    try {
      await configureWorkflowStage(workflow.id, stage, { tech_stack: techStack, agents });
      await startWorkflowStage(workflow.id, stage);
      toast.success(`${STAGE_LABELS[stage]}阶段已配置并启动`);
      setTechStack([]);
      setAgents([]);
      setZipFile(null);
      onClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "配置失败");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setTechStack([]);
    setAgents([]);
    setZipFile(null);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--cyber-text)" }}>
            补充{STAGE_LABELS[stage]}参数
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="zip">上传ZIP包</Label>
            <Input
              id="zip"
              type="file"
              accept=".zip"
              onChange={(e) => setZipFile(e.target.files?.[0] || null)}
            />
            {zipFile && (
              <p className="text-xs text-muted-foreground mt-1">{zipFile.name} ({Math.round(zipFile.size / 1024)} KB)</p>
            )}
          </div>

          <div>
            <Label>技术栈 *</Label>
            <div className="flex gap-2 mt-1 flex-wrap">
              {TECH_STACK_OPTIONS[stage].map((opt) => (
                <Button
                  key={opt}
                  size="sm"
                  variant={techStack.includes(opt) ? "default" : "outline"}
                  onClick={() => {
                    setTechStack(
                      techStack.includes(opt)
                        ? techStack.filter((t) => t !== opt)
                        : [...techStack, opt]
                    );
                  }}
                >
                  {opt}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="agents">Agent包 *</Label>
            <Input
              id="agents"
              value={agents.join(",")}
              onChange={(e) => setAgents(e.target.value.split(",").filter(Boolean))}
              placeholder="输入Agent ID，逗号分隔"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleSaveAndStart} disabled={loading}>
            {loading ? "保存中..." : "保存并启动"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}