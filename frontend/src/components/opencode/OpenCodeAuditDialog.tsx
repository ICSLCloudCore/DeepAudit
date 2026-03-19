/**
 * OpenCode Audit Dialog
 * Cyberpunk Terminal Aesthetic
 */
import { useState, useEffect, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { BookOpen, Edit3, Terminal, Zap, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  opencodeApi,
  type AvailablePromptItem,
  type StartAuditWithPromptResponse,
} from "@/shared/api/opencode";
import { getPromptTemplates, type PromptTemplate } from "@/shared/api/prompts";

interface OpenCodeAuditDialogProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onStart: (response: StartAuditWithPromptResponse) => void;
}

export function OpenCodeAuditDialog({
  open,
  projectId,
  onClose,
  onStart,
}: OpenCodeAuditDialogProps) {
  const [mode, setMode] = useState<"template" | "custom">("template");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [customPrompt, setCustomPrompt] = useState("");
  const [autoStartServer, setAutoStartServer] = useState(true);
  const [availablePrompts, setAvailablePrompts] = useState<AvailablePromptItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    if (open && projectId) {
      loadAvailablePrompts();
    }
  }, [open, projectId]);

  const loadAvailablePrompts = async () => {
    try {
      setIsLoading(true);
      console.log("[OpenCodeAuditDialog] Loading available prompts for project:", projectId);
      
      try {
        const response = await opencodeApi.getAvailablePrompts(projectId);
        console.log("[OpenCodeAuditDialog] Available prompts response:", response);
        setAvailablePrompts(response.items || []);
        
        const defaultTemplate = (response.items || []).find((t: AvailablePromptItem) => t.is_default);
        if (defaultTemplate) {
          setSelectedTemplateId(defaultTemplate.id);
        }
      } catch (opencodeError: any) {
        console.warn("[OpenCodeAuditDialog] Failed to load from opencode API, falling back to prompts API:", opencodeError);
        
        try {
          const fallbackResponse = await getPromptTemplates({ is_active: true, limit: 100 });
          console.log("[OpenCodeAuditDialog] Fallback prompts response:", fallbackResponse);
          
          const mappedPrompts: AvailablePromptItem[] = (fallbackResponse.items || []).map((t: PromptTemplate) => ({
            id: t.id,
            name: t.name,
            description: t.description,
            template_type: t.template_type,
            is_default: t.is_default,
            is_system: t.is_system,
            is_active: t.is_active,
          }));
          
          setAvailablePrompts(mappedPrompts);
          
          const defaultTemplate = mappedPrompts.find((t: AvailablePromptItem) => t.is_default);
          if (defaultTemplate) {
            setSelectedTemplateId(defaultTemplate.id);
          }
          
          toast.info("使用备选提示词列表");
        } catch (fallbackError) {
          console.error("[OpenCodeAuditDialog] Both APIs failed:", fallbackError);
          toast.error("加载提示词列表失败，请使用自定义提示词");
          setAvailablePrompts([]);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const selectedTemplate = useMemo(
    () => availablePrompts.find((t: AvailablePromptItem) => t.id === selectedTemplateId),
    [availablePrompts, selectedTemplateId]
  );

  const handleStart = async () => {
    try {
      setIsStarting(true);

      let prompt_template_id: string | undefined;
      let prompt_content: string | undefined;

      if (mode === "template" && selectedTemplate) {
        prompt_template_id = selectedTemplate.id;
      } else if (mode === "custom" && customPrompt.trim()) {
        prompt_content = customPrompt;
      }

      if (!prompt_template_id && !prompt_content) {
        toast.error("请选择提示词模板或输入自定义提示词");
        return;
      }

      const response = await opencodeApi.startAuditWithPrompt(projectId, {
        prompt_template_id,
        prompt_content,
      });

      toast.success(response.message || "审计已启动");
      onStart(response);
      handleClose();
    } catch (error: any) {
      console.error("Failed to start audit:", error);
      toast.error(error.response?.data?.detail || "启动审计失败");
    } finally {
      setIsStarting(false);
    }
  };

  const resetForm = () => {
    setMode("template");
    setSelectedTemplateId("");
    setCustomPrompt("");
    setAutoStartServer(true);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const canStart = useMemo(() => {
    if (isStarting || isLoading) return false;
    if (mode === "template") return !!selectedTemplate;
    if (mode === "custom") return !!customPrompt.trim();
    return false;
  }, [isStarting, isLoading, mode, selectedTemplate, customPrompt]);

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="!w-[min(90vw,680px)] !max-w-none max-h-[85vh] flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg">
        {/* Header */}
        <DialogHeader className="px-5 py-4 border-b border-border flex-shrink-0 bg-muted">
          <DialogTitle className="flex items-center gap-3 font-mono text-foreground">
            <div className="p-2 bg-primary/20 rounded border border-primary/30">
              <Terminal className="w-5 h-5 text-primary" />
            </div>
            <div>
              <span className="text-base font-bold uppercase tracking-wider">OpenCode 审计</span>
              <p className="text-xs text-muted-foreground font-normal mt-0.5">
                Intelligent Code Analysis
              </p>
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* 模式选择 */}
          <div className="space-y-3">
            <span className="text-sm font-mono font-bold uppercase text-muted-foreground">
              选择模式
            </span>
            
            <Tabs value={mode} onValueChange={(v) => setMode(v as "template" | "custom")} className="w-full">
              <TabsList className="grid grid-cols-2 w-full bg-muted border border-border">
                <TabsTrigger value="template" className="font-mono text-xs font-bold uppercase">
                  <BookOpen className="w-4 h-4 mr-2" />
                  提示词模板
                </TabsTrigger>
                <TabsTrigger value="custom" className="font-mono text-xs font-bold uppercase">
                  <Edit3 className="w-4 h-4 mr-2" />
                  自定义提示词
                </TabsTrigger>
              </TabsList>

              <TabsContent value="template" className="space-y-4 pt-4">
                <div className="space-y-2">
                  <Label className="text-xs font-mono font-bold uppercase text-muted-foreground">
                    选择提示词模板
                  </Label>
                  {isLoading ? (
                    <div className="flex items-center gap-2 p-3 border border-border rounded bg-muted/50">
                      <Loader2 className="w-4 h-4 animate-spin text-primary" />
                      <span className="text-sm font-mono text-muted-foreground">加载中...</span>
                    </div>
                  ) : (
                    <Select
                      value={selectedTemplateId}
                      onValueChange={setSelectedTemplateId}
                      disabled={isLoading}
                    >
                      <SelectTrigger className="h-10 cyber-input">
                        <SelectValue placeholder="选择提示词模板" />
                      </SelectTrigger>
                      <SelectContent className="cyber-dialog border-border">
                        {availablePrompts.map((t: AvailablePromptItem) => (
                          <SelectItem key={t.id} value={t.id} className="font-mono">
                            <div className="flex items-center gap-2">
                              <span>{t.name}</span>
                              {t.is_default && (
                                <Badge className="ml-1 bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border-0 text-xs">
                                  默认
                                </Badge>
                              )}
                              {t.is_system && (
                                <Badge className="ml-1 bg-blue-500/20 text-blue-600 dark:text-blue-400 border-0 text-xs">
                                  系统
                                </Badge>
                              )}
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                {selectedTemplate && (
                  <div className="p-4 border border-border rounded bg-violet-50 dark:bg-violet-950/20 space-y-3">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-violet-600 dark:text-violet-400" />
                      <span className="font-mono text-sm font-bold text-violet-700 dark:text-violet-300 uppercase">
                        模板详情
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground font-mono">
                      {selectedTemplate.description || "暂无描述"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-muted text-foreground border-0 font-mono text-xs">
                        {selectedTemplate.template_type}
                      </Badge>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="custom" className="pt-4">
                <div className="space-y-2">
                  <Label className="text-xs font-mono font-bold uppercase text-muted-foreground">
                    自定义提示词
                  </Label>
                  <Textarea
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    placeholder="输入自定义提示词..."
                    rows={8}
                    className="cyber-input font-mono text-sm resize-none"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* 选项 */}
          <div className="flex items-center space-x-3 p-3 border border-dashed border-border rounded bg-muted/50">
            <Checkbox
              id="autoStart"
              checked={autoStartServer}
              onCheckedChange={(checked) =>
                setAutoStartServer(checked as boolean)
              }
              className="border-border data-[state=checked]:bg-primary data-[state=checked]:border-primary"
            />
            <Label htmlFor="autoStart" className="text-sm font-mono text-muted-foreground cursor-pointer">
              自动启动 OpenCode 服务器（如未启动）
            </Label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex-shrink-0 flex justify-end gap-3 px-5 py-4 bg-muted border-t border-border">
          <Button
            variant="ghost"
            onClick={handleClose}
            disabled={isStarting}
            className="px-4 h-10 font-mono text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            取消
          </Button>
          <Button
            onClick={handleStart}
            disabled={!canStart}
            className="px-5 h-10 cyber-btn-primary font-mono font-bold uppercase"
          >
            {isStarting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                启动中...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                启动审计
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}