/**
 * CreateWorkflowDialog Component - 5 Step Workflow
 * Cyberpunk Terminal Aesthetic
 */

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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Package2, BookOpen, FileText, Terminal, Zap, Code, Lock, Upload, Layers, GitBranch } from "lucide-react";
import { toast } from "sonner";
import { createWorkflow, getAvailableResources } from "@/shared/api/workflows";
import type { AvailableResourcesResponse, Skill, PromptTemplate } from "@/shared/types/workflow";
import {
  PRODUCT_DOMAIN_OPTIONS,
  AUDIT_TYPE_OPTIONS,
  VALIDATION_MODE_OPTIONS,
  WHITE_TECH_STACK_OPTIONS,
  BLACK_TECH_STACK_OPTIONS,
} from "@/shared/types/workflow";

interface CreateWorkflowDialogProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface StageResources {
  agent_packages: AvailableResourcesResponse["agent_packages"];
  category_skills: Skill[];
  other_skills: Skill[];
  prompt_templates: PromptTemplate[];
}

function SkillCard({ skill, highlight }: { skill: Skill; highlight?: boolean }) {
  return (
    <div
      className={`p-2 border rounded ${
        highlight ? "bg-primary/10 border-primary/50" : "bg-muted/30 border-border"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="font-mono text-sm font-bold text-foreground">{skill.name}</span>
        <span className="text-xs text-muted-foreground font-mono">
          v{skill.version} {highlight && `[${skill.category}]`}
        </span>
      </div>
      {skill.description && (
        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{skill.description}</p>
      )}
    </div>
  );
}

export default function CreateWorkflowDialog({ open, onClose, onSuccess }: CreateWorkflowDialogProps) {
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [resourcesLoading, setResourcesLoading] = useState(false);
  
  const [productName, setProductName] = useState("");
  const [productDomain, setProductDomain] = useState("");
  const [version, setVersion] = useState("");
  const [auditType, setAuditType] = useState<"baseline" | "differential">("baseline");
  const [validationMode, setValidationMode] = useState<"wide" | "self">("self");
  const [description, setDescription] = useState("");
  
  const [analyzeSkip, setAnalyzeSkip] = useState(false);
  const [analyzeZip, setAnalyzeZip] = useState<File | null>(null);
  const [analyzeAgentPackageId, setAnalyzeAgentPackageId] = useState<string | null>(null);
  const [analyzePromptId, setAnalyzePromptId] = useState<string | null>(null);
  const [analyzeResources, setAnalyzeResources] = useState<StageResources | null>(null);
  
  const [whiteTechStack, setWhiteTechStack] = useState<string[]>([]);
  const [whiteZip, setWhiteZip] = useState<File | null>(null);
  const [whiteAgentPackageId, setWhiteAgentPackageId] = useState<string | null>(null);
  const [whitePromptId, setWhitePromptId] = useState<string | null>(null);
  const [whiteResources, setWhiteResources] = useState<StageResources | null>(null);
  
  const [blackSkip, setBlackSkip] = useState(false);
  const [blackTechStack, setBlackTechStack] = useState<string[]>([]);
  const [blackZip, setBlackZip] = useState<File | null>(null);
  const [blackAgentPackageId, setBlackAgentPackageId] = useState<string | null>(null);
  const [blackPromptId, setBlackPromptId] = useState<string | null>(null);
  const [blackResources, setBlackResources] = useState<StageResources | null>(null);

  const loadResources = async (category: "ANALYZE" | "WHITE" | "BLACK", setter: (r: StageResources) => void) => {
    setResourcesLoading(true);
    try {
      const res = await getAvailableResources(category);
      setter(res);
    } catch (error) {
      toast.error("加载资源失败");
    } finally {
      setResourcesLoading(false);
    }
  };

  useEffect(() => {
    if (step === 3 && !analyzeSkip && !analyzeResources) {
      loadResources("ANALYZE", setAnalyzeResources);
    }
  }, [step, analyzeSkip]);

  useEffect(() => {
    if (step === 4 && !whiteResources) {
      loadResources("WHITE", setWhiteResources);
    }
  }, [step]);

  useEffect(() => {
    if (step === 5 && !blackSkip && !blackResources) {
      loadResources("BLACK", setBlackResources);
    }
  }, [step, blackSkip]);

  const resetForm = () => {
    setStep(1);
    setProductName("");
    setProductDomain("");
    setVersion("");
    setAuditType("baseline");
    setValidationMode("self");
    setDescription("");
    setAnalyzeSkip(false);
    setAnalyzeZip(null);
    setAnalyzeAgentPackageId(null);
    setAnalyzePromptId(null);
    setAnalyzeResources(null);
    setWhiteTechStack([]);
    setWhiteZip(null);
    setWhiteAgentPackageId(null);
    setWhitePromptId(null);
    setWhiteResources(null);
    setBlackSkip(false);
    setBlackTechStack([]);
    setBlackZip(null);
    setBlackAgentPackageId(null);
    setBlackPromptId(null);
    setBlackResources(null);
  };

  const handleSubmit = async () => {
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
    if (!whiteZip) {
      toast.error("请上传白盒分析ZIP包");
      return;
    }
    if (whiteTechStack.length === 0) {
      toast.error("请选择白盒分析技术栈");
      return;
    }

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("product_name", productName);
      formData.append("product_domain", productDomain);
      formData.append("version", version);
      formData.append("audit_type", auditType);
      formData.append("validation_mode", validationMode);
      if (description) formData.append("description", description);
      
      formData.append("analyze_skip", String(analyzeSkip));
      if (analyzeAgentPackageId) formData.append("analyze_agent_package_id", analyzeAgentPackageId);
      if (analyzePromptId) formData.append("analyze_prompt_template_id", analyzePromptId);
      if (analyzeZip) formData.append("analyze_zip", analyzeZip);
      
      formData.append("white_zip", whiteZip);
      formData.append("white_tech_stack", JSON.stringify(whiteTechStack));
      if (whiteAgentPackageId) formData.append("white_agent_package_id", whiteAgentPackageId);
      if (whitePromptId) formData.append("white_prompt_template_id", whitePromptId);
      
      formData.append("black_skip", String(blackSkip));
      formData.append("black_tech_stack", JSON.stringify(blackTechStack));
      if (blackAgentPackageId) formData.append("black_agent_package_id", blackAgentPackageId);
      if (blackPromptId) formData.append("black_prompt_template_id", blackPromptId);
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

  const getStageIcon = (stage: string) => {
    switch (stage) {
      case "analyze": return <Zap className="w-4 h-4 text-violet-400" />;
      case "white": return <Code className="w-4 h-4 text-primary" />;
      case "black": return <Lock className="w-4 h-4 text-amber-400" />;
      default: return <Terminal className="w-4 h-4 text-primary" />;
    }
  };

  const getStageLabel = (stage: string) => {
    switch (stage) {
      case "analyze": return "威胁分析阶段";
      case "white": return "白盒分析阶段";
      case "black": return "黑盒分析阶段";
      default: return "";
    }
  };

  const renderStageUI = (
    stage: "analyze" | "white" | "black",
    techStackOptions: string[],
    techStack: string[],
    setTechStack: (v: string[]) => void,
    zipFile: File | null,
    setZipFile: (f: File | null) => void,
    agentPackageId: string | null,
    setAgentPackageId: (v: string | null) => void,
    promptId: string | null,
    setPromptId: (v: string | null) => void,
    resources: StageResources | null,
    skip?: boolean,
    setSkip?: (v: boolean) => void,
    required?: boolean,
    showTechStack?: boolean
  ) => (
    <div className="space-y-4">
      {skip !== undefined && setSkip && (
        <div className="flex items-center gap-2 p-3 border border-border rounded bg-muted/30">
          <Checkbox id={`${stage}Skip`} checked={skip} onCheckedChange={(v) => setSkip(v as boolean)} />
          <Label htmlFor={`${stage}Skip`} className="text-sm font-mono text-muted-foreground cursor-pointer">
            跳过此阶段
          </Label>
        </div>
      )}
      
      {(skip === undefined || !skip) && (
        <>
          <div className="space-y-2">
            <Label htmlFor={`${stage}Zip`} className="font-mono font-bold uppercase text-xs text-muted-foreground flex items-center gap-1">
              <Upload className="w-4 h-4" />
              上传ZIP包{required && " *"}
            </Label>
            <Input
              id={`${stage}Zip`}
              type="file"
              accept=".zip"
              onChange={(e) => setZipFile(e.target.files?.[0] || null)}
              className="cyber-input"
            />
            {zipFile && (
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {zipFile.name} ({Math.round(zipFile.size / 1024)} KB)
              </p>
            )}
          </div>

          {showTechStack && (
            <div className="space-y-2">
              <Label className="font-mono font-bold uppercase text-xs text-muted-foreground">
                {getStageIcon(stage)}
                技术栈{required && " *"}
              </Label>
              <div className="flex gap-2 mt-1 flex-wrap">
                {techStackOptions.map((opt) => (
                  <Button
                    key={opt}
                    size="sm"
                    variant={techStack.includes(opt) ? "default" : "outline"}
                    className={techStack.includes(opt) ? "cyber-btn-primary" : "cyber-btn-outline"}
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

          {resourcesLoading ? (
            <div className="flex items-center gap-2 p-3 border border-border rounded bg-muted/50">
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
              <span className="text-sm font-mono text-muted-foreground">加载资源...</span>
            </div>
          ) : resources && (
            <>
              <div className="space-y-2">
                <Label className="font-mono font-bold uppercase text-xs text-muted-foreground flex items-center gap-1">
                  <Package2 className="w-4 h-4 text-primary" />
                  Agent 包{!required && "（可选）"}
                </Label>
                <Select
                  value={agentPackageId || "__none__"}
                  onValueChange={(v) => setAgentPackageId(v === "__none__" ? null : v)}
                >
                  <SelectTrigger className="cyber-input">
                    <SelectValue placeholder="不使用 Agent 包" />
                  </SelectTrigger>
                  <SelectContent className="cyber-select-content">
                    <SelectItem value="__none__">不使用 Agent 包</SelectItem>
                    {resources.agent_packages.map((pkg) => (
                      <SelectItem key={pkg.id} value={pkg.id}>
                        <div className="flex items-center justify-between w-full font-mono">
                          <span>{pkg.name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            v{pkg.version} · {pkg.agents_count} Agents · {pkg.skills_count} Skills
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label className="font-mono font-bold uppercase text-xs text-muted-foreground flex items-center gap-1">
                  <BookOpen className="w-4 h-4 text-violet-400" />
                  阶段专属 Skill
                </Label>
                <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                  {resources.category_skills.length > 0 ? (
                    resources.category_skills.map((skill) => (
                      <SkillCard key={skill.id} skill={skill} highlight />
                    ))
                  ) : (
                    <div className="p-2 border border-border rounded bg-muted/30 text-center">
                      <p className="text-xs text-muted-foreground font-mono">暂无阶段专属 Skill</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-mono font-bold uppercase text-xs text-muted-foreground flex items-center gap-1">
                  <BookOpen className="w-4 h-4" />
                  通用 Skill (OTHER)
                </Label>
                <div className="grid grid-cols-1 gap-2 max-h-32 overflow-y-auto custom-scrollbar">
                  {resources.other_skills.length > 0 ? (
                    resources.other_skills.map((skill) => (
                      <SkillCard key={skill.id} skill={skill} />
                    ))
                  ) : (
                    <div className="p-2 border border-border rounded bg-muted/30 text-center">
                      <p className="text-xs text-muted-foreground font-mono">暂无通用 Skill</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-mono font-bold uppercase text-xs text-muted-foreground flex items-center gap-1">
                  <FileText className="w-4 h-4 text-primary" />
                  提示词模板{!required && "（可选）"}
                </Label>
                <Select
                  value={promptId || "__default__"}
                  onValueChange={(v) => setPromptId(v === "__default__" ? null : v)}
                >
                  <SelectTrigger className="cyber-input">
                    <SelectValue placeholder="使用默认模板" />
                  </SelectTrigger>
                  <SelectContent className="cyber-select-content">
                    <SelectItem value="__default__">使用默认模板</SelectItem>
                    {resources.prompt_templates.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name} {t.is_default && "(默认)"} {t.is_system && "(系统)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );

  const fullNamePreview = productName && version ? `${productName} ${version}` : "";

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="!w-[min(90vw,700px)] !max-w-none max-h-[85vh] flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg">
        <div className="flex items-center gap-2 px-4 py-3 cyber-bg-elevated border-b border-border flex-shrink-0">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <span className="ml-2 font-mono text-xs text-muted-foreground tracking-wider">
            new_workflow@godeepaudit
          </span>
        </div>

        <DialogHeader className="px-6 pt-4 flex-shrink-0">
          <DialogTitle className="font-mono text-lg uppercase tracking-wider flex items-center gap-2 text-foreground">
            <Terminal className="w-5 h-5 text-primary" />
            创建工作流 - 步骤 {step}/5
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {step === 1 && (
            <div className="space-y-4">
              <div className="p-4 border border-border rounded bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <Layers className="w-4 h-4 text-primary" />
                  <span className="text-sm font-mono font-bold text-primary uppercase">产品信息</span>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  产品是最大维度的单元，用于组织多个工作流
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="productName" className="font-mono font-bold uppercase text-xs text-muted-foreground">
                  产品名称 *
                </Label>
                <Input
                  id="productName"
                  value={productName}
                  onChange={(e) => setProductName(e.target.value)}
                  placeholder="例如：UDM"
                  className="cyber-input"
                />
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="productDomain" className="font-mono font-bold uppercase text-xs text-muted-foreground">
                  产品领域 *
                </Label>
                <Select value={productDomain} onValueChange={setProductDomain}>
                  <SelectTrigger className="cyber-input">
                    <SelectValue placeholder="选择产品领域" />
                  </SelectTrigger>
                  <SelectContent className="cyber-select-content">
                    {PRODUCT_DOMAIN_OPTIONS.map((opt) => (
                      <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="p-4 border border-border rounded bg-muted/30">
                <div className="flex items-center gap-2 mb-2">
                  <GitBranch className="w-4 h-4 text-primary" />
                  <span className="text-sm font-mono font-bold text-primary uppercase">工作流基本信息</span>
                </div>
                <p className="text-xs text-muted-foreground font-mono">
                  工作流全称将自动生成为：{fullNamePreview || "（填写产品名称和版本号后生成）"}
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="version" className="font-mono font-bold uppercase text-xs text-muted-foreground">
                  版本号 *
                </Label>
                <Input
                  id="version"
                  value={version}
                  onChange={(e) => setVersion(e.target.value)}
                  placeholder="例如：26.1.0"
                  className="cyber-input"
                />
                {fullNamePreview && (
                  <p className="text-xs text-primary font-mono mt-1">
                    工作流全称：{fullNamePreview}
                  </p>
                )}
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="auditType" className="font-mono font-bold uppercase text-xs text-muted-foreground">
                  审计类型 *
                </Label>
                <Select value={auditType} onValueChange={(v) => setAuditType(v as "baseline" | "differential")}>
                  <SelectTrigger className="cyber-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="cyber-select-content">
                    {AUDIT_TYPE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="validationMode" className="font-mono font-bold uppercase text-xs text-muted-foreground">
                  验证模式 *
                </Label>
                <Select value={validationMode} onValueChange={(v) => setValidationMode(v as "wide" | "self")}>
                  <SelectTrigger className="cyber-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="cyber-select-content">
                    {VALIDATION_MODE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="description" className="font-mono font-bold uppercase text-xs text-muted-foreground">
                  简介（可选）
                </Label>
                <Input
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="// 输入简介..."
                  className="cyber-input"
                />
              </div>
            </div>
          )}

          {step === 3 && renderStageUI(
            "analyze",
            [],
            [],
            () => {},
            analyzeZip,
            setAnalyzeZip,
            analyzeAgentPackageId,
            setAnalyzeAgentPackageId,
            analyzePromptId,
            setAnalyzePromptId,
            analyzeResources,
            analyzeSkip,
            setAnalyzeSkip,
            false,
            false
          )}

          {step === 4 && renderStageUI(
            "white",
            WHITE_TECH_STACK_OPTIONS,
            whiteTechStack,
            setWhiteTechStack,
            whiteZip,
            setWhiteZip,
            whiteAgentPackageId,
            setWhiteAgentPackageId,
            whitePromptId,
            setWhitePromptId,
            whiteResources,
            undefined,
            undefined,
            true,
            true
          )}

          {step === 5 && renderStageUI(
            "black",
            BLACK_TECH_STACK_OPTIONS,
            blackTechStack,
            setBlackTechStack,
            blackZip,
            setBlackZip,
            blackAgentPackageId,
            setBlackAgentPackageId,
            blackPromptId,
            setBlackPromptId,
            blackResources,
            blackSkip,
            setBlackSkip,
            false,
            true
          )}
        </div>

        <DialogFooter className="px-6 py-4 border-t border-border cyber-bg-elevated flex-shrink-0">
          {step > 1 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} disabled={loading} className="cyber-btn-outline">
              上一步
            </Button>
          )}
          {step < 5 ? (
            <Button onClick={() => setStep(step + 1)} disabled={loading || resourcesLoading} className="cyber-btn-primary">
              下一步
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={loading} className="cyber-btn-primary">
              {loading ? "创建中..." : "完成创建"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}