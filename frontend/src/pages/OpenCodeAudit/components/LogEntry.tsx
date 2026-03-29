/**
 * OpenCode Audit Log Entry Component
 */

import { memo, useState } from "react";
import { ChevronDown, ChevronUp, Zap, Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { LOG_TYPE_CONFIG } from "../constants";
import type { LogEntryProps } from "../types";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const LOG_TYPE_LABELS: Record<string, string> = {
  prompt: 'PROMPT',
  response: 'RESP',
  status: 'STATUS',
  error: 'ERROR',
  info: 'INFO',
  progress: 'PROG',
};

export const LogEntry = memo(function LogEntry({ item, isExpanded, onToggle }: LogEntryProps) {
  const config = LOG_TYPE_CONFIG[item.type] || LOG_TYPE_CONFIG.info;
  const isCollapsible = item.content && item.type !== 'prompt';
  const showContent = isExpanded || item.type === 'prompt';
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!item.content) return;
    try {
      await navigator.clipboard.writeText(item.content);
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      toast.error("复制失败");
    }
  };

  return (
    <div
      className={`group relative transition-all duration-300 ease-out`}
    >
      <div className={`
        relative rounded-lg border-l-3 overflow-hidden
        ${config.borderColor}
        ${isExpanded ? 'bg-slate-100 dark:bg-card/80' : 'bg-slate-50 dark:bg-card/40'}
        border border-slate-200 dark:border-transparent
      `}>
        <div className="relative px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex-shrink-0">
              {config.icon}
            </div>

            <span className={`
              text-xs font-mono font-bold uppercase tracking-wider px-2 py-1 rounded-md border
              ${item.type === 'prompt' ? 'bg-violet-500/20 text-violet-600 dark:text-violet-300 border-violet-500/30' : ''}
              ${item.type === 'response' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 border-emerald-500/30' : ''}
              ${item.type === 'status' ? 'bg-amber-500/20 text-amber-600 dark:text-amber-300 border-amber-500/30' : ''}
              ${item.type === 'error' ? 'bg-red-500/20 text-red-600 dark:text-red-300 border-red-500/30' : ''}
              ${item.type === 'info' ? 'bg-muted/80 text-foreground border-border/50' : ''}
              ${item.type === 'progress' ? 'bg-cyan-500/20 text-cyan-600 dark:text-cyan-300 border-cyan-500/30' : ''}
              flex-shrink-0
            `}>
              {LOG_TYPE_LABELS[item.type] || 'LOG'}
            </span>

            <span className="text-xs text-muted-foreground font-mono flex-shrink-0 tabular-nums">
              {item.time}
            </span>

            <Zap className="w-3 h-3 text-muted-foreground/50 flex-shrink-0" />

            <span className="text-sm text-foreground font-medium truncate flex-1">
              {item.title}
            </span>

            {item.isStreaming && (
              <span className="w-2 h-5 bg-violet-500 rounded-sm flex-shrink-0" />
            )}

            <div className="flex items-center gap-2.5 flex-shrink-0 ml-auto">
              {isCollapsible && (
                <div 
                  onClick={onToggle}
                  className={`w-6 h-6 flex items-center justify-center rounded-md cursor-pointer ${isExpanded ? 'bg-primary/20 border border-primary/30' : 'bg-muted border border-border'}`}
                >
                  {isExpanded ? (
                    <ChevronUp className="w-4 h-4 text-primary" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  )}
                </div>
              )}
            </div>
          </div>

          {showContent && item.content && (
            <div className="mt-3 overflow-hidden">
              <div className="bg-card rounded-lg border border-border overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/50">
                  <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50" />
                    <span className="text-xs text-muted-foreground font-mono uppercase">Details</span>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    <span className="font-mono">{copied ? "Copied" : "Copy"}</span>
                  </button>
                </div>
                <pre className="p-4 text-sm font-mono text-foreground/85 max-h-64 overflow-y-auto custom-scrollbar whitespace-pre-wrap break-words">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{item.content}</ReactMarkdown>
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default LogEntry;
