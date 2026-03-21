import React from 'react';
import { StepFinishPart } from '../../messageTypes';

interface StepFinishPartComponentProps {
  part: StepFinishPart;
}

export const StepFinishPartComponent: React.FC<StepFinishPartComponentProps> = ({ part }) => {
  return (
    <div className="my-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-orange-300"></div>
        <span className="text-orange-600 font-semibold flex items-center gap-1">
          ✅ 步骤完成
        </span>
        <div className="flex-1 h-px bg-orange-300"></div>
      </div>
      <div className="mt-2 text-sm text-gray-600 text-center">
        原因: {part.reason}
        {part.cost !== undefined && (
          <span className="ml-2">成本: ${part.cost.toFixed(4)}</span>
        )}
      </div>
    </div>
  );
};
