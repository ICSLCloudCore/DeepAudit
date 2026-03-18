/**
 * 提示词选择器组件
 */
import { useState } from "react";
import { Send, BookOpen, Edit3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { type PromptTemplate } from "@/shared/api/prompts";

interface PromptSelectorProps {
  templates: PromptTemplate[];
  onSendPrompt: (content: string, templateId?: string) => Promise<void>;
  disabled?: boolean;
  isLoading?: boolean;
}

export function PromptSelector({ templates, onSendPrompt, disabled, isLoading }: PromptSelectorProps) {
  const [mode, setMode] = useState<"template" | "custom">("template");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [customPrompt, setCustomPrompt] = useState("");

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const handleSend = async () => {
    let content = "";
    let templateId: string | undefined;

    if (mode === "template" && selectedTemplate) {
      content = selectedTemplate.content_zh || selectedTemplate.content_en || "";
      templateId = selectedTemplate.id;
    } else if (mode === "custom" && customPrompt.trim()) {
      content = customPrompt;
    }

    if (!content.trim()) {
      return;
    }

    await onSendPrompt(content, templateId);
    
    if (mode === "custom") {
      setCustomPrompt("");
    }
  };

  return (
    <div className="space-y-3">
      <Tabs value={mode} onValueChange={(v) => setMode(v as "template" | "custom")}>
        <TabsList className="grid grid-cols-2">
          <TabsTrigger value="template">
            <BookOpen className="w-4 h-4 mr-2" />
            提示词库
          </TabsTrigger>
          <TabsTrigger value="custom">
            <Edit3 className="w-4 h-4 mr-2" />
            自定义
          </TabsTrigger>
        </TabsList>

        <TabsContent value="template" className="space-y-3 pt-2">
          <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
            <SelectTrigger>
              <SelectValue placeholder="选择提示词模板" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {selectedTemplate && (
            <div className="p-3 bg-muted/50 rounded border border-border">
              <p className="text-xs text-muted-foreground font-mono mb-1">
                {selectedTemplate.description || "暂无描述"}
              </p>
              <p className="text-sm text-foreground/80 font-mono line-clamp-3">
                {selectedTemplate.content_zh || selectedTemplate.content_en}
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="custom" className="pt-2">
          <Textarea
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder="输入自定义提示词..."
            rows={4}
            className="cyber-input font-mono"
            disabled={disabled}
          />
        </TabsContent>
      </Tabs>

      <Button
        onClick={handleSend}
        disabled={disabled || isLoading || (mode === "template" && !selectedTemplate) || (mode === "custom" && !customPrompt.trim())}
        className="w-full cyber-btn-primary"
      >
        <Send className="w-4 h-4 mr-2" />
        {isLoading ? "发送中..." : "发送提示词"}
      </Button>
    </div>
  );
}
