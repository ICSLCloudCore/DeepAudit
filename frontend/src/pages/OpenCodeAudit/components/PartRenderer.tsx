import React from 'react';
import { Part } from '../messageTypes';
import {
  isTextPart,
  isReasoningPart,
  isToolPart,
  isStepStartPart,
  isStepFinishPart,
} from '../messageUtils';
import { TextPartComponent } from './parts/TextPartComponent';
import { ReasoningPartComponent } from './parts/ReasoningPartComponent';
import { ToolPartComponent } from './parts/ToolPartComponent';
import { StepStartPartComponent } from './parts/StepStartPartComponent';
import { StepFinishPartComponent } from './parts/StepFinishPartComponent';

interface PartRendererProps {
  part: Part;
}

export const PartRenderer: React.FC<PartRendererProps> = ({ part }) => {
  if (isTextPart(part)) {
    return <TextPartComponent part={part} />;
  }
  if (isReasoningPart(part)) {
    return <ReasoningPartComponent part={part} />;
  }
  if (isToolPart(part)) {
    return <ToolPartComponent part={part} />;
  }
  if (isStepStartPart(part)) {
    return <StepStartPartComponent part={part} />;
  }
  if (isStepFinishPart(part)) {
    return <StepFinishPartComponent part={part} />;
  }
  return <div>Unknown part type</div>;
};
