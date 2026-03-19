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
    PENDING = "pending"


class OpenCodeServerStatus(str, Enum):
    """OpenCode服务器状态"""

    STARTING = "starting"
    RUNNING = "running"
    ERROR = "error"
    STOPPED = "stopped"


class OpenCodeSessionCreate(BaseModel):
    """创建会话请求"""

    prompt_template_id: Optional[str] = Field(None, description="提示词模板ID")
    prompt_content: str = Field(..., min_length=1, max_length=10000, description="提示词内容")
    variables: Optional[Dict[str, str]] = Field(default_factory=dict, description="变量值")


class StartAuditWithPromptRequest(BaseModel):
    """启动OpenCode审计请求"""

    prompt_template_id: Optional[str] = Field(None, description="提示词模板ID")
    prompt_content: Optional[str] = Field(None, description="自定义提示词内容")
    variables: Optional[Dict[str, str]] = Field(default_factory=dict, description="变量值")


class StartAuditWithPromptResponse(BaseModel):
    """启动OpenCode审计响应"""

    session_id: str
    project_id: str
    status: OpenCodeSessionStatus
    opencode_server_status: OpenCodeServerStatus
    message: str


class SessionStatusResponse(BaseModel):
    """会话状态响应"""

    session_id: str
    status: OpenCodeSessionStatus
    prompt_content: str
    response_content: str
    opencode_server_status: OpenCodeServerStatus
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None


class AvailablePromptItem(BaseModel):
    """可用提示词项"""

    id: str
    name: str
    description: Optional[str] = None
    template_type: str
    is_default: bool
    is_system: bool
    is_active: bool


class AvailablePromptsResponse(BaseModel):
    """可用提示词列表响应"""

    items: List[AvailablePromptItem]
    total: int


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
