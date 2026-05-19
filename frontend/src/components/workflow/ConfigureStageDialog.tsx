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
  const [agentPackageId, setAgentPackageId] = useState<string>("");
  const [promptTemplateId, setPromptTemplateId] = useState<string>("");
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const needsTechStack = stage === "white" || stage === "black";

  const handleSaveAndStart = async () => {
    if (!workflow) return;
    
    if (needsTechStack && techStack.length === 0) {
      toast.error("请选择技术栈");
      return;
    }

    setLoading(true);
    try {
      const config: any = {};
      if (needsTechStack && techStack.length > 0) {
        config.tech_stack = techStack;
      }
      if (agentPackageId) {
        config.agent_package_id = agentPackageId;
      }
      if (promptTemplateId) {
        config.prompt_template_id = promptTemplateId;
      }
      
      await configureWorkflowStage(workflow.id, stage, config);
      await startWorkflowStage(workflow.id, stage);
      toast.success(`${STAGE_LABELS[stage]}阶段已配置并启动`);
      resetForm();
      onClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "配置失败");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setTechStack([]);
    setAgentPackageId("");
    setPromptTemplateId("");
    setZipFile(null);
  };

  const handleClose = () => {
    resetForm();
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
            <Label htmlFor="zip">上传ZIP包（可选）</Label>
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

          {needsTechStack && (
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
          )}

          <div>
            <Label htmlFor="agentPackageId">Agent包 ID（可选）</Label>
            <Input
              id="agentPackageId"
              value={agentPackageId}
              onChange={(e) => setAgentPackageId(e.target.value)}
              placeholder="输入Agent Package ID"
            />
          </div>

          <div>
            <Label htmlFor="promptTemplateId">Prompt模板 ID（可选）</Label>
            <Input
              id="promptTemplateId"
              value={promptTemplateId}
              onChange={(e) => setPromptTemplateId(e.target.value)}
              placeholder="输入Prompt Template ID"
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