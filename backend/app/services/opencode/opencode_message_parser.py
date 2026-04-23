"""
OpenCode 消息解析器服务
"""

import json
from typing import List, Dict, Any
from app.schemas.opencode_message import (
    OpenCodeMessage,
    Part,
    TextPart,
    ReasoningPart,
    ToolPart,
    StepStartPart,
    StepFinishPart,
    PartType,
)


class OpenCodeMessageParser:
    """OpenCode 消息解析器"""

    @staticmethod
    def parse_raw_message(raw_data: Dict[str, Any]) -> OpenCodeMessage:
        """解析原始消息数据"""
        info = raw_data.get("info", {})
        raw_parts = raw_data.get("parts", [])

        parts = [OpenCodeMessageParser.parse_part(part) for part in raw_parts]

        return OpenCodeMessage(info=info, parts=parts)

    @staticmethod
    def parse_part(raw_part: Dict[str, Any]) -> Part:
        """解析单个 part"""
        part_type = raw_part.get("type")

        if part_type == PartType.TEXT:
            return TextPart(**raw_part)
        elif part_type == PartType.REASONING:
            return ReasoningPart(**raw_part)
        elif part_type == PartType.TOOL:
            return ToolPart(**raw_part)
        elif part_type == PartType.STEP_START:
            return StepStartPart(**raw_part)
        elif part_type == PartType.STEP_FINISH:
            return StepFinishPart(**raw_part)
        else:
            raise ValueError(f"Unknown part type: {part_type}")

    @staticmethod
    def parse_message_array(raw_array: List[Dict[str, Any]]) -> List[OpenCodeMessage]:
        """解析消息数组"""
        return [OpenCodeMessageParser.parse_raw_message(msg) for msg in raw_array]
