import React from 'react';
import { StepStartPart } from '../../messageTypes';

interface StepStartPartComponentProps {
  part: StepStartPart;
}

export const StepStartPartComponent: React.FC<StepStartPartComponentProps> = ({ part }) => {
  return (
    <div className="my-4">
      <div className="flex items-center gap-2">
        <div className="flex-1 h-px bg-orange-300"></div>
        <span className="text-orange-600 font-semibold flex items-center gap-1">
          ▶️ 开始新步骤
        </span>
        <div className="flex-1 h-px bg-orange-300"></div>
      </div>
    </div>
  );
};
