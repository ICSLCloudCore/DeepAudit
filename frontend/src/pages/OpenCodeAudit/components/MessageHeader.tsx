import React from 'react';
import { MessageInfo } from '../messageTypes';
import { formatTimestamp } from '../messageUtils';

interface MessageHeaderProps {
  info: MessageInfo;
}

export const MessageHeader: React.FC<MessageHeaderProps> = ({ info }) => {
  const isUser = info.role === 'user';

  return (
    <div className="flex items-center justify-between mb-2 px-1">
      <div className="flex items-center gap-2">
        <span className="text-xl">
          {isUser ? '👤' : '🤖'}
        </span>
        <span className="font-semibold text-gray-700">
          {isUser ? '用户' : '助手'}
        </span>
        {info.agent && (
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
            {info.agent}
          </span>
        )}
      </div>
      <div className="text-xs text-gray-400">
        {formatTimestamp(info.time.created)}
      </div>
    </div>
  );
};
