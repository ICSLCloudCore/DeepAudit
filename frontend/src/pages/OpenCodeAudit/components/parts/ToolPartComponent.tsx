import React, { useState } from 'react';
import { ToolPart } from '../../messageTypes';
import { formatDuration } from '../../messageUtils';

interface ToolPartComponentProps {
  part: ToolPart;
}

export const ToolPartComponent: React.FC<ToolPartComponentProps> = ({ part }) => {
  const [showInput, setShowInput] = useState(false);
  const [showOutput, setShowOutput] = useState(false);

  return (
    <div className="border border-green-200 bg-green-50 rounded-lg p-4 my-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-green-700 font-semibold">
            🔧 {part.tool}
          </span>
          <span className="text-sm text-green-600">
            {part.state.title}
          </span>
        </div>
        {part.state.time && part.state.time.start !== undefined && part.state.time.end !== undefined && (
          <span className="text-xs text-gray-500">
            {formatDuration(part.state.time.start, part.state.time.end)}
          </span>
        )}
      </div>

      <div className="space-y-2">
        <div>
          <button
            onClick={() => setShowInput(!showInput)}
            className="text-xs text-green-600 hover:text-green-800 underline"
          >
            {showInput ? '隐藏输入' : '显示输入'}
          </button>
          {showInput && (
            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
              {JSON.stringify(part.state.input, null, 2)}
            </pre>
          )}
        </div>

        <div>
          <button
            onClick={() => setShowOutput(!showOutput)}
            className="text-xs text-green-600 hover:text-green-800 underline"
          >
            {showOutput ? '隐藏输出' : '显示输出'}
          </button>
          {showOutput && (
            <pre className="mt-2 p-2 bg-gray-100 rounded text-xs overflow-x-auto">
              {typeof part.state.output === 'string'
                ? part.state.output
                : JSON.stringify(part.state.output, null, 2)}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
