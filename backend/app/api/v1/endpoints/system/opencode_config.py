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
    """读取 opencode.json 配置文件，保留所有字段"""
    config_path = get_opencode_config_path()
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            config = json.load(f)

        # 只补充缺失的必需字段，不覆盖已有内容
        if "model" not in config:
            config["model"] = ""
        if "provider" not in config:
            config["provider"] = ""
        if "providers" not in config:
            config["providers"] = {}
        if "mcp" not in config:
            config["mcp"] = {}

        # 确保每个 provider 都有完整的结构
        if "providers" in config:
            for provider_id, provider_data in config["providers"].items():
                if "models" not in provider_data:
                    provider_data["models"] = []
                if "api_key" not in provider_data:
                    provider_data["api_key"] = ""

        return config

    # 返回默认配置结构
    return {"model": "", "provider": "", "providers": {}, "mcp": {}}


def write_opencode_config(config: dict) -> None:
    """写入配置到 opencode.json"""
    config_path = get_opencode_config_path()
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def mask_api_key(config: dict) -> dict:
    """脱敏显示 API Key - 保持注释状态，API Key 明文显示"""
    # 不进行脱敏，直接返回原始配置
    return config


@router.get("", response_model=OpenCodeConfigResponse)
async def get_config() -> Any:
    """获取 OpenCode 配置"""
    try:
        config = read_opencode_config()
        return OpenCodeConfigResponse(success=True, config=OpenCodeConfig(**config))
    except Exception as e:
        logger.error(f"[OpenCodeConfig] 获取配置失败: {e}")
        return OpenCodeConfigResponse(success=False, error=str(e))


@router.put("", response_model=OpenCodeConfigResponse)
async def update_config(config_in: OpenCodeConfig) -> Any:
    """更新 OpenCode 配置（保留所有现有字段）"""
    try:
        # 读取现有配置
        existing_config = read_opencode_config()
        config_dict = config_in.model_dump()

        # 合并配置：保留所有 existing_config 的字段，只更新我们关心的字段
        merged_config = existing_config.copy()
        merged_config["model"] = config_dict["model"]
        merged_config["provider"] = config_dict["provider"]
        merged_config["providers"] = config_dict["providers"]

        # 写入配置
        write_opencode_config(merged_config)

        return OpenCodeConfigResponse(success=True, config=OpenCodeConfig(**merged_config))
    except Exception as e:
        logger.error(f"[OpenCodeConfig] 更新配置失败: {e}")
        return OpenCodeConfigResponse(success=False, error=str(e))


@router.get("/raw", response_model=OpenCodeConfigResponse)
async def get_raw_config() -> Any:
    """获取原始 OpenCode 配置 JSON"""
    try:
        config = read_opencode_config()
        raw_config = json.dumps(config, indent=2, ensure_ascii=False)
        return OpenCodeConfigResponse(success=True, raw=raw_config)
    except Exception as e:
        logger.error(f"[OpenCodeConfig] 获取原始配置失败: {e}")
        return OpenCodeConfigResponse(success=False, error=str(e))


@router.put("/raw", response_model=OpenCodeConfigResponse)
async def update_raw_config(raw_in: RawConfigUpdate) -> Any:
    """更新原始 OpenCode 配置 JSON（保留所有现有字段）"""
    try:
        # 解析输入
        new_config = json.loads(raw_in.raw)

        # 读取现有配置用于合并
        existing_config = read_opencode_config()

        # 合并配置：existing_config 作为基础，new_config 覆盖/补充字段
        merged_config = existing_config.copy()
        merged_config.update(new_config)

        # 写入配置
        write_opencode_config(merged_config)

        return OpenCodeConfigResponse(success=True, config=OpenCodeConfig(**merged_config))
    except json.JSONDecodeError as e:
        return OpenCodeConfigResponse(success=False, error=f"JSON 格式错误: {e}")
    except Exception as e:
        logger.error(f"[OpenCodeConfig] 更新原始配置失败: {e}")
        return OpenCodeConfigResponse(success=False, error=str(e))
