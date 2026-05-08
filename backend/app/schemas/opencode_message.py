"""
OpenCode 消息 Schema
"""

from typing import Optional, Dict, Any, List, Union
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class PartType(str, Enum):
    TEXT = "text"
    REASONING = "reasoning"
    TOOL = "tool"
    STEP_START = "step-start"
    STEP_FINISH = "step-finish"


class TimeInfo(BaseModel):
    start: Optional[int] = None
    end: Optional[int] = None


class TokenInfo(BaseModel):
    total: Optional[int] = None
    input: Optional[int] = None
    output: Optional[int] = None
    reasoning: Optional[int] = None
    cache: Dict[str, int] = Field(default_factory=dict)


class MessageInfo(BaseModel):
    role: str
    time: Dict[str, int]
    id: str
    sessionID: str
    parentID: Optional[str] = None
    modelID: Optional[str] = None
    providerID: Optional[str] = None
    agent: Optional[str] = None
    cost: Optional[float] = None
    tokens: Optional[TokenInfo] = None
    finish: Optional[str] = None
    summary: Optional[Dict[str, Any]] = None
    path: Optional[Dict[str, str]] = None


class BasePart(BaseModel):
    type: PartType
    id: str
    sessionID: str
    messageID: str


class TextPart(BasePart):
    type: PartType = PartType.TEXT
    text: str
    time: Optional[TimeInfo] = None


class ReasoningPart(BasePart):
    type: PartType = PartType.REASONING
    text: str
    time: Optional[TimeInfo] = None


class ToolState(BaseModel):
    status: str
    input: Dict[str, Any]
    output: Optional[Any] = None
    title: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    time: Optional[TimeInfo] = None


class ToolPart(BasePart):
    type: PartType = PartType.TOOL
    callID: str
    tool: str
    state: ToolState


class StepStartPart(BasePart):
    type: PartType = PartType.STEP_START


class StepFinishPart(BasePart):
    type: PartType = PartType.STEP_FINISH
    reason: str
    cost: Optional[float] = None
    tokens: Optional[TokenInfo] = None


Part = Union[TextPart, ReasoningPart, ToolPart, StepStartPart, StepFinishPart]


class OpenCodeMessage(BaseModel):
    info: MessageInfo
    parts: List[Part]


class MessageEventType(str, Enum):
    MESSAGE_ADDED = "message_added"
    MESSAGE_UPDATED = "message_updated"
    PART_ADDED = "part_added"
    PART_UPDATED = "part_updated"
    SESSION_COMPLETED = "session_completed"


class MessageEvent(BaseModel):
    type: MessageEventType
    data: Union[OpenCodeMessage, Part, Dict[str, Any]]
    timestamp: datetime = Field(default_factory=datetime.utcnow)
