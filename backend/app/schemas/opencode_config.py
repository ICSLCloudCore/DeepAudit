"""OpenCode 配置 Schema"""

from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class ProviderConfig(BaseModel):
    """Provider 配置模型"""

    api_key: str = Field(..., description="API Key")
    base_url: Optional[str] = Field(None, description="Base URL")
    models: List[str] = Field(default_factory=list, description="模型列表")


class OpenCodeConfig(BaseModel):
    """OpenCode 配置模型"""

    model: str = Field(default="", description="默认模型")
    provider: str = Field(default="", description="默认 provider")
    providers: Dict[str, ProviderConfig] = Field(
        default_factory=dict, description="所有 provider 配置"
    )
    mcp: Optional[Dict] = Field(default_factory=dict, description="MCP 配置（保留）")


class OpenCodeConfigResponse(BaseModel):
    """OpenCode 配置响应"""

    success: bool
    config: Optional[OpenCodeConfig] = None
    raw: Optional[str] = None
    error: Optional[str] = None


class RawConfigUpdate(BaseModel):
    """原始 JSON 配置更新"""

    raw: str = Field(..., description="原始 JSON 配置字符串")
