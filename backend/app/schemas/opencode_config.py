"""
OpenCode 配置 Schema - 基于实际 opencode.json 格式（简化版，更灵活）
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class OpenCodeConfig(BaseModel):
    """OpenCode 配置 - 使用灵活类型"""

    schema_: Optional[str] = Field(None, alias="$schema", description="JSON Schema URL")
    provider: Optional[Dict[str, Any]] = Field(None, description="所有提供商配置")
    mcp: Optional[Dict[str, Any]] = Field(None, description="MCP 配置（保留）")
    # 允许其他字段
    model_config = {"extra": "allow"}


class OpenCodeConfigResponse(BaseModel):
    """OpenCode 配置响应"""

    success: bool
    config: Optional[OpenCodeConfig] = None
    raw: Optional[str] = None
    error: Optional[str] = None


class RawConfigUpdate(BaseModel):
    """原始 JSON 配置更新"""

    raw: str = Field(..., description="原始 JSON 配置字符串")
