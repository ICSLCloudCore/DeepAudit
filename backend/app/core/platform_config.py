"""
跨平台配置目录工具
"""

import os
import sys
import shutil

from app.utils.log import logger


def get_config_dir() -> str:
    """获取跨平台的配置目录

    Returns:
        str: 配置目录路径
    """
    # 所有平台都使用 ~/.config/opencode
    home = os.path.expanduser("~")
    return os.path.join(home, ".config", "opencode")


def get_opencode_skills_dir() -> str:
    """获取OpenCode Skills目录

    Returns:
        str: Skills目录路径
    """
    config_dir = get_config_dir()
    skills_dir = os.path.join(config_dir, "skills")
    return skills_dir


def get_opencode_agents_dir() -> str:
    """获取OpenCode Agents目录

    Returns:
        str: Agents目录路径
    """
    config_dir = get_config_dir()
    agents_dir = os.path.join(config_dir, "agents")
    return agents_dir


def ensure_dir_exists(dir_path: str) -> None:
    """确保目录存在，不存在则创建

    Args:
        dir_path: 目录路径
    """
    os.makedirs(dir_path, exist_ok=True)


def delete_file_or_dir(path: str) -> bool:
    """删除文件或目录

    Args:
        path: 文件或目录路径

    Returns:
        bool: 是否成功删除
    """
    if not path or not os.path.exists(path):
        return False

    try:
        if os.path.isfile(path):
            os.remove(path)
            return True
        elif os.path.isdir(path):
            shutil.rmtree(path)
            return True
        return False
    except Exception as e:
        logger.warning(f"Warning: Failed to delete {path}: {e}")
        return False
