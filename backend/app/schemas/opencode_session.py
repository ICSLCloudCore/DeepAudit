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
    agent_package_id: Optional[str] = Field(None, description="Agent 包 ID（可选）")


class StartAuditWithPromptResponse(BaseModel):
    """启动OpenCode审计响应"""

    session_id: str
    task_id: str
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


class OpenCodeInteractionType(str, Enum):
    """交互类型"""

    REQUEST = "request"
    RESPONSE = "response"
    ERROR = "error"


class OpenCodeInteractionBase(BaseModel):
    """交互记录基础Schema"""

    interaction_type: OpenCodeInteractionType
    endpoint: str
    http_method: str
    request_timestamp: datetime
    response_timestamp: Optional[datetime] = None
    duration_ms: Optional[int] = None
    request_payload: Optional[str] = None
    response_payload: Optional[str] = None
    http_status_code: Optional[int] = None
    error_message: Optional[str] = None
    error_type: Optional[str] = None


class OpenCodeInteractionCreate(OpenCodeInteractionBase):
    """创建交互记录Schema"""

    session_id: str


class OpenCodeInteractionResponse(OpenCodeInteractionBase):
    """交互记录响应Schema"""

    id: str
    session_id: str
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class OpenCodeInteractionListResponse(BaseModel):
    """交互记录列表响应"""

    items: List[OpenCodeInteractionResponse]
    total: int
