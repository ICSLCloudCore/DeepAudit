import { useState, useEffect } from "react";
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
import { updateWorkflow } from "@/shared/api/workflows";
import type { Workflow } from "@/shared/types/workflow";
import {
  ANALYZE_TECH_STACK_OPTIONS,
  WHITE_TECH_STACK_OPTIONS,
  BLACK_TECH_STACK_OPTIONS,
} from "@/shared/types/workflow";

interface EditWorkflowDialogProps {
  open: boolean;
  workflow: Workflow | null;
  onClose: () => void;
  onSuccess: () => void;
}

export default function EditWorkflowDialog({
  open,
  workflow,
  onClose,
  onSuccess,
}: EditWorkflowDialogProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [analyzeTechStack, setAnalyzeTechStack] = useState<string[]>([]);
  const [analyzeAgents, setAnalyzeAgents] = useState<string[]>([]);
  const [whiteTechStack, setWhiteTechStack] = useState<string[]>([]);
  const [whiteAgents, setWhiteAgents] = useState<string[]>([]);
  const [blackTechStack, setBlackTechStack] = useState<string[]>([]);
  const [blackAgents, setBlackAgents] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (workflow) {
      setName(workflow.name);
      setDescription(workflow.description || "");
      setAnalyzeTechStack(workflow.analyze_tech_stack || []);
      setAnalyzeAgents(workflow.analyze_agents || []);
      setWhiteTechStack(workflow.white_tech_stack || []);
      setWhiteAgents(workflow.white_agents || []);
      setBlackTechStack(workflow.black_tech_stack || []);
      setBlackAgents(workflow.black_agents || []);
    }
  }, [workflow]);

  const resetForm = () => {
    setName("");
    setDescription("");
    setAnalyzeTechStack([]);
    setAnalyzeAgents([]);
    setWhiteTechStack([]);
    setWhiteAgents([]);
    setBlackTechStack([]);
    setBlackAgents([]);
  };

  const handleSubmit = async () => {
    if (!workflow) return;
    if (!name.trim()) {
      toast.error("请输入工作流名称");
      return;
    }

    setLoading(true);
    try {
      await updateWorkflow(workflow.id, {
        name,
        description,
        analyze_tech_stack: analyzeTechStack,
        analyze_agents: analyzeAgents,
        white_tech_stack: whiteTechStack,
        white_agents: whiteAgents,
        black_tech_stack: blackTechStack,
        black_agents: blackAgents,
      });
      toast.success("工作流已更新");
      resetForm();
      onClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "更新失败");
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--cyber-text)" }}>编辑工作流</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <div className="space-y-4 border-b pb-4" style={{ borderColor: "var(--cyber-border)" }}>
            <h4 className="font-medium text-sm text-muted-foreground">基本信息</h4>
            <div>
              <Label htmlFor="name">工作流名称</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="输入工作流名称" />
            </div>
            <div>
              <Label htmlFor="description">简介</Label>
              <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="输入简介" />
            </div>
          </div>

          {workflow && workflow.analyze_status !== "skipped" && (
            <div className="space-y-4 border-b pb-4" style={{ borderColor: "var(--cyber-border)" }}>
              <h4 className="font-medium text-sm text-muted-foreground">威胁分析阶段</h4>
              <div>
                <Label>技术栈</Label>
                <div className="flex gap-2 mt-1">
                  {ANALYZE_TECH_STACK_OPTIONS.map((opt) => (
                    <Button
                      key={opt}
                      size="sm"
                      variant={analyzeTechStack.includes(opt) ? "default" : "outline"}
                      onClick={() => {
                        setAnalyzeTechStack(
                          analyzeTechStack.includes(opt)
                            ? analyzeTechStack.filter((t) => t !== opt)
                            : [...analyzeTechStack, opt]
                        );
                      }}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="analyzeAgents">Agent包</Label>
                <Input
                  id="analyzeAgents"
                  value={analyzeAgents.join(",")}
                  onChange={(e) => setAnalyzeAgents(e.target.value.split(",").filter(Boolean))}
                  placeholder="输入Agent ID，逗号分隔"
                />
              </div>
            </div>
          )}

          <div className="space-y-4 border-b pb-4" style={{ borderColor: "var(--cyber-border)" }}>
            <h4 className="font-medium text-sm text-muted-foreground">白盒分析阶段</h4>
            <div>
              <Label>技术栈</Label>
              <div className="flex gap-2 mt-1">
                {WHITE_TECH_STACK_OPTIONS.map((opt) => (
                  <Button
                    key={opt}
                    size="sm"
                    variant={whiteTechStack.includes(opt) ? "default" : "outline"}
                    onClick={() => {
                      setWhiteTechStack(
                        whiteTechStack.includes(opt)
                          ? whiteTechStack.filter((t) => t !== opt)
                          : [...whiteTechStack, opt]
                      );
                    }}
                  >
                    {opt}
                  </Button>
                ))}
              </div>
            </div>
            <div>
              <Label htmlFor="whiteAgents">Agent包</Label>
              <Input
                id="whiteAgents"
                value={whiteAgents.join(",")}
                onChange={(e) => setWhiteAgents(e.target.value.split(",").filter(Boolean))}
                placeholder="输入Agent ID，逗号分隔"
              />
            </div>
          </div>

          {workflow && workflow.black_status !== "skipped" && (
            <div className="space-y-4">
              <h4 className="font-medium text-sm text-muted-foreground">黑盒分析阶段</h4>
              <div>
                <Label>技术栈</Label>
                <div className="flex gap-2 mt-1 flex-wrap">
                  {BLACK_TECH_STACK_OPTIONS.map((opt) => (
                    <Button
                      key={opt}
                      size="sm"
                      variant={blackTechStack.includes(opt) ? "default" : "outline"}
                      onClick={() => {
                        setBlackTechStack(
                          blackTechStack.includes(opt)
                            ? blackTechStack.filter((t) => t !== opt)
                            : [...blackTechStack, opt]
                        );
                      }}
                    >
                      {opt}
                    </Button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="blackAgents">Agent包</Label>
                <Input
                  id="blackAgents"
                  value={blackAgents.join(",")}
                  onChange={(e) => setBlackAgents(e.target.value.split(",").filter(Boolean))}
                  placeholder="输入Agent ID，逗号分隔"
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            取消
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}