import React from 'react';
import { OpenCodeMessage } from '../messageTypes';
import { PartRenderer } from './PartRenderer';
import { MessageHeader } from './MessageHeader';

interface MessageItemProps {
  message: OpenCodeMessage;
}

export const MessageItem: React.FC<MessageItemProps> = ({ message }) => {
  const isUser = message.info.role === 'user';

  return (
    <div className={`flex flex-col ${isUser ? 'items-end' : 'items-start'}`}>
      <MessageHeader info={message.info} />
      <div className={`max-w-4xl w-full ${isUser ? 'bg-blue-50' : 'bg-white'} rounded-lg shadow-sm border p-4`}>
        {message.parts.map((part) => (
          <PartRenderer key={part.id} part={part} />
        ))}
      </div>
    </div>
  );
};

export default MessageItem;
