import React from 'react';
import { TextPart } from '../../messageTypes';

interface TextPartComponentProps {
  part: TextPart;
}

export const TextPartComponent: React.FC<TextPartComponentProps> = ({ part }) => {
  return (
    <div className="text-gray-800 whitespace-pre-wrap">
      {part.text}
    </div>
  );
};

export default TextPartComponent;
