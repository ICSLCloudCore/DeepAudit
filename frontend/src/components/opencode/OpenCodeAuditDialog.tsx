/**
 * OpenCode审计对话框组件
 */
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Label } from "@/components/ui/label";
import { BookOpen, Edit3, Terminal } from "lucide-react";
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
        
        const defaultTemplate = (response.items || []).find((t) => t.is_default);
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
          
          const defaultTemplate = mappedPrompts.find((t) => t.is_default);
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

  const selectedTemplate = availablePrompts.find((t) => t.id === selectedTemplateId);

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
      onClose();
      resetForm();
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

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Terminal className="w-5 h-5 text-emerald-400" />
            OpenCode 审计
          </DialogTitle>
          <DialogDescription>
            选择提示词模板或输入自定义提示词，启动 OpenCode 代码审计
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "template" | "custom")}>
            <TabsList className="grid grid-cols-2">
              <TabsTrigger value="template">
                <BookOpen className="w-4 h-4 mr-2" />
                提示词模板
              </TabsTrigger>
              <TabsTrigger value="custom">
                <Edit3 className="w-4 h-4 mr-2" />
                自定义提示词
              </TabsTrigger>
            </TabsList>

            <TabsContent value="template" className="space-y-4 pt-4">
              <div className="space-y-2">
                <Label>选择提示词模板</Label>
                <Select
                  value={selectedTemplateId}
                  onValueChange={setSelectedTemplateId}
                  disabled={isLoading}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择提示词模板" />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePrompts.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        <div className="flex items-center gap-2">
                          <span>{t.name}</span>
                          {t.is_default && (
                            <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded">
                              默认
                            </span>
                          )}
                          {t.is_system && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                              系统
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {selectedTemplate && (
                <div className="p-3 bg-muted/50 rounded border border-border">
                  <p className="text-sm text-muted-foreground mb-2">
                    {selectedTemplate.description || "暂无描述"}
                  </p>
                  <div className="flex gap-2">
                    <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded">
                      {selectedTemplate.template_type}
                    </span>
                  </div>
                </div>
              )}
            </TabsContent>

            <TabsContent value="custom" className="pt-4">
              <div className="space-y-2">
                <Label>自定义提示词</Label>
                <Textarea
                  value={customPrompt}
                  onChange={(e) => setCustomPrompt(e.target.value)}
                  placeholder="输入自定义提示词..."
                  rows={6}
                  className="font-mono"
                />
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex items-center space-x-2">
            <Checkbox
              id="autoStart"
              checked={autoStartServer}
              onCheckedChange={(checked) =>
                setAutoStartServer(checked as boolean)
              }
            />
            <Label htmlFor="autoStart" className="text-sm">
              自动启动 OpenCode 服务器（如未启动）
            </Label>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={handleClose} disabled={isStarting}>
            取消
          </Button>
          <Button
            onClick={handleStart}
            disabled={
              isStarting ||
              isLoading ||
              (mode === "template" && !selectedTemplate) ||
              (mode === "custom" && !customPrompt.trim())
            }
          >
            {isStarting ? "启动中..." : "启动审计"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
