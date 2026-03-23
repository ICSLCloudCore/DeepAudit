import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';
import { OpenCodeMessage } from '../messageTypes';
import { PartRenderer } from './PartRenderer';
import { MessageHeader } from './MessageHeader';
import { isTextPart, isReasoningPart } from '../messageUtils';

interface MessageItemProps {
  message: OpenCodeMessage;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const isUser = message.info.role === 'user';
  const [copied, setCopied] = useState(false);

  // 提取消息中的文本内容
  const getMessageText = () => {
    return message.parts
      .filter((part) => isTextPart(part) || isReasoningPart(part))
      .map((part) => (part as any).text)
      .join('\n\n');
  };

  const handleCopy = async () => {
    const text = getMessageText();
    if (!text) {
      toast.info("没有可复制的内容");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("已复制到剪贴板");
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
      toast.error("复制失败");
    }
  };

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <MessageHeader info={message.info} />
      <div className={`max-w-4xl w-full ${isUser ? 'bg-blue-50' : 'bg-white'} rounded-lg shadow-sm border overflow-hidden`}>
        {/* 复制按钮区域 */}
        <div className="flex items-center justify-end px-3 py-2 border-b border-gray-100 bg-gray-50">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 transition-colors"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
            <span className="font-mono">{copied ? "Copied" : "Copy"}</span>
          </button>
        </div>
        {/* 消息内容 */}
        <div className="p-4">
          {message.parts.map((part) => (
            <PartRenderer key={part.id} part={part} />
          ))}
        </div>
      </div>
    </div>
  );
};

export default MessageItem;
