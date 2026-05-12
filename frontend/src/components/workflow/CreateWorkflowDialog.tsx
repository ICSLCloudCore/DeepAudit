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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { createWorkflow } from "@/shared/api/workflows";
import {
  ANALYZE_TECH_STACK_OPTIONS,
  WHITE_TECH_STACK_OPTIONS,
  BLACK_TECH_STACK_OPTIONS,
} from "@/shared/types/workflow";

interface CreateWorkflowDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function CreateWorkflowDialog({ open, onClose, onSuccess }: CreateWorkflowDialogProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  
  const [analyzeSkip, setAnalyzeSkip] = useState(false);
  const [analyzeTechStack, setAnalyzeTechStack] = useState<string[]>([]);
  const [analyzeAgents, setAnalyzeAgents] = useState<string[]>([]);
  const [analyzeZip, setAnalyzeZip] = useState<File | null>(null);
  
  const [whiteTechStack, setWhiteTechStack] = useState<string[]>([]);
  const [whiteAgents, setWhiteAgents] = useState<string[]>([]);
  const [whiteZip, setWhiteZip] = useState<File | null>(null);
  
  const [blackSkip, setBlackSkip] = useState(false);
  const [blackTechStack, setBlackTechStack] = useState<string[]>([]);
  const [blackAgents, setBlackAgents] = useState<string[]>([]);
  const [blackZip, setBlackZip] = useState<File | null>(null);

  const resetForm = () => {
    setStep(1);
    setName("");
    setDescription("");
    setAnalyzeSkip(false);
    setAnalyzeTechStack([]);
    setAnalyzeAgents([]);
    setAnalyzeZip(null);
    setWhiteTechStack([]);
    setWhiteAgents([]);
    setWhiteZip(null);
    setBlackSkip(false);
    setBlackTechStack([]);
    setBlackAgents([]);
    setBlackZip(null);
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      toast.error("请输入工作流名称");
      return;
    }
    if (!whiteZip) {
      toast.error("请上传白盒分析ZIP包");
      return;
    }
    if (whiteTechStack.length === 0) {
      toast.error("请选择白盒分析技术栈");
      return;
    }
    if (whiteAgents.length === 0) {
      toast.error("请选择白盒分析Agent");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("name", name);
      if (description) formData.append("description", description);
      
      formData.append("analyze_skip", String(analyzeSkip));
      formData.append("analyze_tech_stack", JSON.stringify(analyzeTechStack));
      formData.append("analyze_agents", JSON.stringify(analyzeAgents));
      if (analyzeZip) formData.append("analyze_zip", analyzeZip);
      
      formData.append("white_zip", whiteZip);
      formData.append("white_tech_stack", JSON.stringify(whiteTechStack));
      formData.append("white_agents", JSON.stringify(whiteAgents));
      
      formData.append("black_skip", String(blackSkip));
      formData.append("black_tech_stack", JSON.stringify(blackTechStack));
      formData.append("black_agents", JSON.stringify(blackAgents));
      if (blackZip) formData.append("black_zip", blackZip);

      await createWorkflow(formData);
      toast.success("工作流创建成功");
      resetForm();
      onClose();
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || "创建失败");
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
      <DialogContent className="max-w-lg" style={{ background: "var(--cyber-bg)", border: "1px solid var(--cyber-border)" }}>
        <DialogHeader>
          <DialogTitle style={{ color: "var(--cyber-text)" }}>
            创建工作流 - 步骤 {step}/4
          </DialogTitle>
        </DialogHeader>

        {step === 1 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">工作流名称 *</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="输入工作流名称" />
            </div>
            <div>
              <Label htmlFor="description">简介</Label>
              <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="输入简介" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox id="analyzeSkip" checked={analyzeSkip} onCheckedChange={(v) => setAnalyzeSkip(v as boolean)} />
              <Label htmlFor="analyzeSkip">跳过此阶段</Label>
            </div>
            {!analyzeSkip && (
              <>
                <div>
                  <Label htmlFor="analyzeZip">上传ZIP包</Label>
                  <Input
                    id="analyzeZip"
                    type="file"
                    accept=".zip"
                    onChange={(e) => setAnalyzeZip(e.target.files?.[0] || null)}
                  />
                  {analyzeZip && <p className="text-sm text-muted-foreground mt-1">{analyzeZip.name}</p>}
                </div>
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
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <Label htmlFor="whiteZip">上传ZIP包 *</Label>
              <Input
                id="whiteZip"
                type="file"
                accept=".zip"
                onChange={(e) => setWhiteZip(e.target.files?.[0] || null)}
              />
              {whiteZip && <p className="text-sm text-muted-foreground mt-1">{whiteZip.name}</p>}
            </div>
            <div>
              <Label>技术栈 *</Label>
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
              <Label htmlFor="whiteAgents">Agent包 *</Label>
              <Input
                id="whiteAgents"
                value={whiteAgents.join(",")}
                onChange={(e) => setWhiteAgents(e.target.value.split(",").filter(Boolean))}
                placeholder="输入Agent ID，逗号分隔"
              />
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Checkbox id="blackSkip" checked={blackSkip} onCheckedChange={(v) => setBlackSkip(v as boolean)} />
              <Label htmlFor="blackSkip">跳过此阶段</Label>
            </div>
            {!blackSkip && (
              <>
                <div>
                  <Label htmlFor="blackZip">上传ZIP包</Label>
                  <Input
                    id="blackZip"
                    type="file"
                    accept=".zip"
                    onChange={(e) => setBlackZip(e.target.files?.[0] || null)}
                  />
                  {blackZip && <p className="text-sm text-muted-foreground mt-1">{blackZip.name}</p>}
                </div>
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
              </>
            )}
          </div>
        )}

        <DialogFooter>
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={loading}>
              上一步
            </Button>
          )}
          {step < 4 ? (
            <Button onClick={() => setStep(step + 1)} disabled={loading}>
              下一步
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "创建中..." : "完成创建"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}