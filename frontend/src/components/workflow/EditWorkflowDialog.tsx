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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { updateWorkflow } from "@/shared/api/workflows";
import type { Workflow } from "@/shared/types/workflow";
import {
  PRODUCT_DOMAIN_OPTIONS,
  AUDIT_TYPE_OPTIONS,
  VALIDATION_MODE_OPTIONS,
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
  const [productName, setProductName] = useState("");
  const [productDomain, setProductDomain] = useState("");
  const [version, setVersion] = useState("");
  const [auditType, setAuditType] = useState<"baseline" | "differential">("baseline");
  const [validationMode, setValidationMode] = useState<"wide" | "self">("self");
  const [description, setDescription] = useState("");
  const [whiteTechStack, setWhiteTechStack] = useState<string[]>([]);
  const [blackTechStack, setBlackTechStack] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (workflow) {
      setProductName(workflow.product_name);
      setProductDomain(workflow.product_domain);
      setVersion(workflow.version);
      setAuditType(workflow.audit_type);
      setValidationMode(workflow.validation_mode);
      setDescription(workflow.description || "");
      setWhiteTechStack(workflow.white_tech_stack || []);
      setBlackTechStack(workflow.black_tech_stack || []);
    }
  }, [workflow]);

  const resetForm = () => {
    setProductName("");
    setProductDomain("");
    setVersion("");
    setAuditType("baseline");
    setValidationMode("self");
    setDescription("");
    setWhiteTechStack([]);
    setBlackTechStack([]);
  };

  const handleSubmit = async () => {
    if (!workflow) return;
    if (!productName.trim()) {
      toast.error("请输入产品名称");
      return;
    }
    if (!productDomain) {
      toast.error("请选择产品领域");
      return;
    }
    if (!version.trim()) {
      toast.error("请输入版本号");
      return;
    }

    setLoading(true);
    try {
      await updateWorkflow(workflow.id, {
        product_name: productName,
        product_domain: productDomain,
        version: version,
        audit_type: auditType,
        validation_mode: validationMode,
        description,
        white_tech_stack: whiteTechStack,
        black_tech_stack: blackTechStack,
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
            <h4 className="font-medium text-sm text-muted-foreground">产品信息</h4>
            <div>
              <Label htmlFor="productName">产品名称</Label>
              <Input id="productName" value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="例如：UDM" />
            </div>
            <div>
              <Label htmlFor="productDomain">产品领域</Label>
              <Select value={productDomain} onValueChange={setProductDomain}>
                <SelectTrigger>
                  <SelectValue placeholder="选择产品领域" />
                </SelectTrigger>
                <SelectContent>
                  {PRODUCT_DOMAIN_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-4 border-b pb-4" style={{ borderColor: "var(--cyber-border)" }}>
            <h4 className="font-medium text-sm text-muted-foreground">工作流基本信息</h4>
            <div>
              <Label htmlFor="version">版本号</Label>
              <Input id="version" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="例如：26.1.0" />
            </div>
            <div>
              <Label htmlFor="auditType">审计类型</Label>
              <Select value={auditType} onValueChange={(v) => setAuditType(v as "baseline" | "differential")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {AUDIT_TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="validationMode">验证模式</Label>
              <Select value={validationMode} onValueChange={(v) => setValidationMode(v as "wide" | "self")}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VALIDATION_MODE_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="description">简介</Label>
              <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="输入简介" />
            </div>
          </div>

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