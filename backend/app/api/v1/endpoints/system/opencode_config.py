"""OpenCode 配置 API 端点"""

from typing import Any
from pathlib import Path
from fastapi import APIRouter
import json

from app.utils.log import logger
from app.schemas.opencode_config import (
    OpenCodeConfig,
    OpenCodeConfigResponse,
    RawConfigUpdate,
)

router = APIRouter()


def get_opencode_config_path() -> Path:
    """获取 opencode.json 配置文件路径"""
    config_dir = Path.home() / ".config" / "opencode"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir / "opencode.json"


def read_opencode_config() -> dict:
    """读取 opencode.json 配置文件"""
    config_path = get_opencode_config_path()
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    # 返回默认配置结构
    return {"model": "", "provider": "", "providers": {}, "mcp": {}}


def write_opencode_config(config: dict) -> None:
    """写入配置到 opencode.json"""
    config_path = get_opencode_config_path()
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def mask_api_key(config: dict) -> dict:
    """脱敏显示 API Key"""
    masked_config = config.copy()
    # if "providers" in masked_config:
    #     for provider_id, provider_data in masked_config["providers"].items():
    #         if "api_key" in provider_data and provider_data["api_key"]:
    #             key = provider_data["api_key"]
    #             if len(key) > 8:
    #                 masked_config["providers"][provider_id]["api_key"] = key[:8] + "..."
    #             else:
    #                 masked_config["providers"][provider_id]["api_key"] = "***"
    return masked_config


@router.get("", response_model=OpenCodeConfigResponse)
async def get_config() -> Any:
    """获取 OpenCode 配置（API Key 脱敏）"""
    try:
        config = read_opencode_config()
        masked_config = mask_api_key(config)
        return OpenCodeConfigResponse(success=True, config=OpenCodeConfig(**masked_config))
    except Exception as e:
        logger.error(f"[OpenCodeConfig] 获取配置失败: {e}")
        return OpenCodeConfigResponse(success=False, error=str(e))


@router.put("", response_model=OpenCodeConfigResponse)
async def update_config(config_in: OpenCodeConfig) -> Any:
    """更新 OpenCode 配置（保留 mcp）"""
    try:
        # 读取现有配置，保留 mcp
        existing_config = read_opencode_config()

        # 准备新配置
        config_dict = config_in.model_dump()

        # 保留现有的 mcp 配置
        if "mcp" in existing_config:
            config_dict["mcp"] = existing_config["mcp"]

        # 写入配置
        write_opencode_config(config_dict)

        # 返回脱敏后的配置
        masked_config = mask_api_key(config_dict)

        return OpenCodeConfigResponse(success=True, config=OpenCodeConfig(**masked_config))
    except Exception as e:
        logger.error(f"[OpenCodeConfig] 更新配置失败: {e}")
        return OpenCodeConfigResponse(success=False, error=str(e))


@router.get("/raw", response_model=OpenCodeConfigResponse)
async def get_raw_config() -> Any:
    """获取原始 OpenCode 配置 JSON（API Key 脱敏）"""
    try:
        config = read_opencode_config()
        masked_config = mask_api_key(config)
        raw_config = json.dumps(masked_config, indent=2, ensure_ascii=False)
        return OpenCodeConfigResponse(success=True, raw=raw_config)
    except Exception as e:
        logger.error(f"[OpenCodeConfig] 获取原始配置失败: {e}")
        return OpenCodeConfigResponse(success=False, error=str(e))


@router.put("/raw", response_model=OpenCodeConfigResponse)
async def update_raw_config(raw_in: RawConfigUpdate) -> Any:
    """更新原始 OpenCode 配置 JSON（保留 mcp）"""
    try:
        # 解析输入
        config_dict = json.loads(raw_in.raw)

        # 保留现有的 mcp 配置
        existing_config = read_opencode_config()
        if "mcp" in existing_config and "mcp" not in config_dict:
            config_dict["mcp"] = existing_config["mcp"]

        # 写入配置
        write_opencode_config(config_dict)

        # 返回脱敏后的配置
        masked_config = (config_dict)

        return OpenCodeConfigResponse(success=True, config=OpenCodeConfig(**masked_config))
    except json.JSONDecodeError as e:
        return OpenCodeConfigResponse(success=False, error=f"JSON 格式错误: {e}")
    except Exception as e:
        logger.error(f"[OpenCodeConfig] 更新原始配置失败: {e}")
        return OpenCodeConfigResponse(success=False, error=str(e))
