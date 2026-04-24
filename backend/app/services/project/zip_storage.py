"""
ZIP文件存储服务
用于管理项目的ZIP文件持久化存储
"""

import os
import shutil
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone

from app.utils.log import logger
from app.core.config import settings
from app.core.encryption import encrypt_sensitive_data, decrypt_sensitive_data


def get_zip_storage_path() -> Path:
    """获取ZIP文件存储目录"""
    path = Path(settings.ZIP_STORAGE_PATH)
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_project_zip_path(project_id: str) -> Path:
    """获取项目ZIP文件路径"""
    return get_zip_storage_path() / f"{project_id}.zip"


def get_project_zip_meta_path(project_id: str) -> Path:
    """获取项目ZIP文件元数据路径"""
    return get_zip_storage_path() / f"{project_id}.meta"


async def save_project_zip(
    project_id: str, file_path: str, original_filename: str, password: Optional[str] = None
) -> dict:
    """
    保存项目ZIP文件

    Args:
        project_id: 项目ID
        file_path: 临时文件路径
        original_filename: 原始文件名
        password: ZIP密码（可选）

    Returns:
        文件元数据
    """
    target_path = get_project_zip_path(project_id)
    meta_path = get_project_zip_meta_path(project_id)

    # 复制文件到存储目录
    shutil.copy2(file_path, target_path)

    # 获取文件大小
    file_size = os.path.getsize(target_path)

    # 保存元数据
    meta = {
        "original_filename": original_filename,
        "file_size": file_size,
        "uploaded_at": datetime.now(timezone.utc).isoformat(),
        "project_id": project_id,
        "has_password": bool(password),
    }

    # 如果有密码，加密后存储
    if password:
        meta["encrypted_password"] = encrypt_sensitive_data(password)

    import json

    with open(meta_path, "w") as f:
        json.dump(meta, f)

    logger.info(f"✓ ZIP文件已保存: {project_id} ({file_size / 1024 / 1024:.2f} MB)")

    return meta


async def load_project_zip(project_id: str) -> Optional[str]:
    """
    加载项目ZIP文件路径

    Args:
        project_id: 项目ID

    Returns:
        ZIP文件路径，如果不存在返回None
    """
    zip_path = get_project_zip_path(project_id)

    if zip_path.exists():
        return str(zip_path)

    return None


async def get_project_zip_meta(project_id: str) -> Optional[dict]:
    """
    获取项目ZIP文件元数据

    Args:
        project_id: 项目ID

    Returns:
        元数据字典，如果不存在返回None
    """
    meta_path = get_project_zip_meta_path(project_id)

    if not meta_path.exists():
        return None

    import json

    with open(meta_path, "r") as f:
        return json.load(f)


async def delete_project_zip(project_id: str) -> bool:
    """
    删除项目ZIP文件

    Args:
        project_id: 项目ID

    Returns:
        是否成功删除
    """
    zip_path = get_project_zip_path(project_id)
    meta_path = get_project_zip_meta_path(project_id)

    deleted = False

    if zip_path.exists():
        os.remove(zip_path)
        deleted = True
        logger.info(f"✓ 已删除ZIP文件: {project_id}")

    if meta_path.exists():
        os.remove(meta_path)

    return deleted


async def has_project_zip(project_id: str) -> bool:
    """
    检查项目是否有ZIP文件

    Args:
        project_id: 项目ID

    Returns:
        是否存在ZIP文件
    """
    zip_path = get_project_zip_path(project_id)
    return zip_path.exists()


async def get_project_zip_password(project_id: str) -> Optional[str]:
    """
    获取项目ZIP文件的密码（解密后）

    Args:
        project_id: 项目ID

    Returns:
        解密后的密码，如果没有密码则返回None
    """
    meta = await get_project_zip_meta(project_id)
    if not meta or not meta.get("has_password") or not meta.get("encrypted_password"):
        return None

    try:
        return decrypt_sensitive_data(meta["encrypted_password"])
    except Exception as e:
        logger.warning(f"⚠️ 解密ZIP密码失败: {e}")
        return None
