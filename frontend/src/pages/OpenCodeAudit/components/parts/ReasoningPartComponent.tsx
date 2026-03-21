import React, { useState } from 'react';
import { ReasoningPart } from '../../messageTypes';

interface ReasoningPartComponentProps {
  part: ReasoningPart;
}

export const ReasoningPartComponent: React.FC<ReasoningPartComponentProps> = ({ part }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="border-l-4 border-purple-400 bg-purple-50 p-4 my-2">
      <div
        className="flex items-center gap-2 cursor-pointer mb-2"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <span className="text-purple-700 font-semibold">
          💭 推理过程
        </span>
        <span className="text-xs text-purple-500">
          {isExpanded ? '收起' : '展开'}
        </span>
      </div>
      {isExpanded && (
        <div className="text-purple-800 whitespace-pre-wrap">
          {part.text}
        </div>
      )}
    </div>
  );
};
