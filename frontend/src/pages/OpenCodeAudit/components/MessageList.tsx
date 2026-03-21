import React from 'react';
import { OpenCodeMessage } from '../messageTypes';
import { MessageItem } from './MessageItem';

interface MessageListProps {
  messages: OpenCodeMessage[];
  isStreaming?: boolean;
}

export const MessageList: React.FC<MessageListProps> = ({ messages, isStreaming }) => {
  return (
    <div className="flex flex-col gap-4 p-4">
      {messages.map((message) => (
        <MessageItem key={message.info.id} message={message} />
      ))}
      {isStreaming && (
        <div className="animate-pulse text-gray-400">正在生成...</div>
      )}
    </div>
  );
};
