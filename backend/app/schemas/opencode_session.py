"""
OpenCode会话 Schema
"""

from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class OpenCodeSessionStatus(str, Enum):
    ACTIVE = "active"
    CLOSED = "closed"
    ERROR = "error"


class OpenCodeSessionCreate(BaseModel):
    """创建会话请求"""

    prompt_template_id: Optional[str] = Field(None, description="提示词模板ID")
    prompt_content: str = Field(..., min_length=1, max_length=10000, description="提示词内容")
    variables: Optional[Dict[str, str]] = Field(default_factory=dict, description="变量值")


class SendPromptRequest(BaseModel):
    """发送提示词请求"""

    prompt_template_id: Optional[str] = None
    prompt_content: Optional[str] = None
    variables: Optional[Dict[str, str]] = None


class OpenCodeSessionResponse(BaseModel):
    """会话响应"""

    id: str
    project_id: str
    status: OpenCodeSessionStatus
    prompt_template_id: Optional[str] = None
    prompt_content: str
    response_content: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    created_by: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class OpenCodeSessionListResponse(BaseModel):
    """会话列表响应"""

    items: List[OpenCodeSessionResponse]
    total: int


class OpenCodeStreamEventType(str, Enum):
    """流式事件类型"""

    DATA = "data"
    ERROR = "error"
    DONE = "done"
    HEARTBEAT = "heartbeat"


class OpenCodeStreamEvent(BaseModel):
    """流式事件数据"""

    type: OpenCodeStreamEventType
    data: Optional[str] = None
    error: Optional[str] = None
    timestamp: datetime = Field(default_factory=datetime.utcnow)
