"""
Skill Management API
"""

import os
import zipfile
import tempfile
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from pathlib import Path

from app.db.session import get_db
from app.models import OpenCodeSkill, SkillCategory
from app.api.deps import get_current_user
from app.core.platform_config import ensure_dir_exists
from app.core.config import settings
from app.api.v1.endpoints.opencode.utils import (
    parse_skill_metadata_from_zip,
    parse_skill_metadata_from_zip_path,
    parse_skill_md_from_path,
    create_or_update_opencode_skill,
    get_opencode_skills_dir,
)

router = APIRouter()

# Import asyncio for the sleep
import asyncio


# ==================== Skill Endpoints ====================


@router.get("/skills")
async def list_skills(
    category: Optional[str] = Query(None, description="Filter by category"),
    is_public: Optional[bool] = Query(None, description="Filter by public status"),
    search: Optional[str] = Query(None, description="Search by name or description"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List skills with filtering and pagination"""
    query = select(OpenCodeSkill)

    filters = []
    if category:
        filters.append(OpenCodeSkill.category == category)
    if is_public is not None:
        filters.append(OpenCodeSkill.is_public == is_public)
    filters.append(OpenCodeSkill.is_active == True)

    if search:
        filters.append(
            or_(
                OpenCodeSkill.name.ilike(f"%{search}%"),
                OpenCodeSkill.description.ilike(f"%{search}%"),
            )
        )

    if filters:
        query = query.where(and_(*filters))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size).order_by(OpenCodeSkill.created_at.desc())

    result = await db.execute(query)
    skills = result.scalars().all()

    return {
        "items": [skill.to_dict() for skill in skills],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/skills/{skill_id}")
async def get_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get skill details"""
    result = await db.execute(select(OpenCodeSkill).where(OpenCodeSkill.id == skill_id))
    skill = result.scalar_one_or_none()

    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    return skill.to_dict()


@router.post("/skills/upload")
async def upload_skill(
    file: UploadFile = File(...),
    name: Optional[str] = Form(None),
    version: str = Form("1.0.0"),
    description: Optional[str] = Form(None),
    category: str = Form(SkillCategory.CUSTOM),
    is_public: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Upload a new skill - 自动从 SKILL.md 提取元数据"""
    import os
    import hashlib
    import tempfile
    from app.core.platform_config import get_opencode_skills_dir, ensure_dir_exists
    from app.core.config import settings

    file_content = await file.read()
    checksum = hashlib.sha256(file_content).hexdigest()

    # 保持原始文件名，只做基本安全检查防止路径遍历
    original_filename = file.filename or "skill"
    safe_filename = os.path.basename(original_filename)
    if not safe_filename:
        safe_filename = "skill"

    # 只接受zip格式
    if not safe_filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="只支持ZIP格式的文件")

    # 获取跨平台的OpenCode Skills目录
    opencode_skills_dir = get_opencode_skills_dir()
    ensure_dir_exists(opencode_skills_dir)

    # 确保skills zip存储目录存在
    skills_zip_dir = Path(settings.SKILLS_ZIP_STORAGE_PATH)
    skills_zip_dir.mkdir(parents=True, exist_ok=True)

    # 解析 SKILL.md 获取元数据
    metadata = parse_skill_metadata_from_zip(file_content)
    skill_dir_name = metadata.get("skill_dir_name")

    # 如果用户没有提供 name/description，则从 SKILL.md 提取
    final_name = name or metadata.get("name")
    final_description = description or metadata.get("description")

    # 如果 SKILL.md 也没有 name，则使用目录名
    if not final_name and skill_dir_name:
        final_name = skill_dir_name
    if not final_name:
        final_name = "unnamed-skill"

    # 创建临时目录用于检查zip内容
    with tempfile.TemporaryDirectory() as temp_dir:
        temp_zip_path = os.path.join(temp_dir, safe_filename)
        with open(temp_zip_path, "wb") as f:
            f.write(file_content)

        # 检查zip内容
        root_dirs = set()
        has_skill_md = False

        try:
            with zipfile.ZipFile(temp_zip_path, "r") as zip_ref:
                # 遍历zip中的所有文件
                for info in zip_ref.infolist():
                    # 获取路径的第一部分（根目录）
                    parts = info.filename.split("/")
                    if len(parts) > 0 and parts[0]:
                        root_dirs.add(parts[0])
                        # 检查是否有SKILL.md在根目录下
                        if len(parts) == 2 and parts[1] == "SKILL.md":
                            has_skill_md = True

                # 检查是否只有一个根目录
                if len(root_dirs) != 1:
                    raise HTTPException(
                        status_code=400,
                        detail=f"ZIP格式不符：必须包含且仅包含一个根目录，当前包含 {len(root_dirs)} 个",
                    )

                # 检查是否包含SKILL.md
                if not has_skill_md:
                    raise HTTPException(
                        status_code=400, detail="ZIP格式不符：根目录下必须包含SKILL.md文件"
                    )

        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"ZIP文件解析失败：{str(e)}")

        # 检查目标目录是否已存在
        skill_dir = os.path.join(opencode_skills_dir, skill_dir_name) if skill_dir_name else None
        if not skill_dir or os.path.exists(skill_dir):
            raise HTTPException(
                status_code=400,
                detail=f"技能目录 '{skill_dir_name}' 已存在或无效，请使用其他名称或删除现有技能",
            )

        # 解压到opencode_skills_dir
        with zipfile.ZipFile(temp_zip_path, "r") as zip_ref:
            zip_ref.extractall(opencode_skills_dir)

        # 保存原始zip文件到项目upload的skills目录下
        skills_zip_file_path = skills_zip_dir / safe_filename

        with open(skills_zip_file_path, "wb") as f:
            f.write(file_content)

    # 创建数据库记录
    skill = OpenCodeSkill(
        name=final_name,
        version=version,
        description=final_description,
        author=getattr(current_user, "full_name", "unknown"),
        category=category,
        file_path=str(skills_zip_file_path),
        opencode_file_path=skill_dir,
        file_size=len(file_content),
        checksum=checksum,
        is_public=is_public,
        is_active=True,
        created_by=current_user.id if hasattr(current_user, "id") else None,
    )

    db.add(skill)
    await db.commit()
    await db.refresh(skill)

    return skill.to_dict()


@router.get("/skills/{skill_id}/download")
async def download_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Download a skill as a ZIP file.

    優先返回上传时保存的原始 ZIP；若原始 ZIP 不存在但 opencode_file_path 目录存在，
    则即时打包 opencode_file_path 目录并返回。
    """
    from fastapi.responses import FileResponse, StreamingResponse
    import io
    import zipfile as _zipfile

    result = await db.execute(select(OpenCodeSkill).where(OpenCodeSkill.id == skill_id))
    skill = result.scalar_one_or_none()

    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    # 优先使用上传时保存的原始 ZIP
    if skill.file_path and os.path.isfile(skill.file_path):
        filename = os.path.basename(skill.file_path)
        return FileResponse(
            path=skill.file_path,
            media_type="application/zip",
            filename=filename,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    # fallback：从 opencode_file_path 目录即时打包
    if skill.opencode_file_path and os.path.isdir(skill.opencode_file_path):
        buf = io.BytesIO()
        base_dir = Path(skill.opencode_file_path)
        dir_name = base_dir.name
        with _zipfile.ZipFile(buf, "w", _zipfile.ZIP_DEFLATED) as zf:
            for file_path in base_dir.rglob("*"):
                if file_path.is_file():
                    arcname = dir_name / file_path.relative_to(base_dir)
                    zf.write(file_path, arcname)
        buf.seek(0)
        safe_name = f"{skill.name.replace(' ', '_')}-{skill.version}.zip"
        return StreamingResponse(
            buf,
            media_type="application/zip",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}"'},
        )

    raise HTTPException(status_code=404, detail="Skill 文件不存在，无法下载")


@router.put("/skills/{skill_id}")
async def update_skill(
    skill_id: str,
    name: Optional[str] = None,
    version: Optional[str] = None,
    description: Optional[str] = None,
    category: Optional[str] = None,
    config: Optional[dict] = None,
    is_public: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update a skill"""
    result = await db.execute(select(OpenCodeSkill).where(OpenCodeSkill.id == skill_id))
    skill = result.scalar_one_or_none()

    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    if name is not None:
        skill.name = name
    if version is not None:
        skill.version = version
    if description is not None:
        skill.description = description
    if category is not None:
        skill.category = category
    if config is not None:
        skill.config = config
    if is_public is not None:
        skill.is_public = is_public

    await db.commit()
    await db.refresh(skill)

    return skill.to_dict()


@router.delete("/skills/{skill_id}")
async def delete_skill(
    skill_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Delete a skill"""
    import os
    from app.core.platform_config import delete_file_or_dir

    result = await db.execute(select(OpenCodeSkill).where(OpenCodeSkill.id == skill_id))
    skill = result.scalar_one_or_none()

    if not skill:
        raise HTTPException(status_code=404, detail="Skill not found")

    # 获取技能目录名并删除
    deleted_files = []
    if skill.opencode_file_path:
        # 按照目录名删除整个技能目录
        if delete_file_or_dir(skill.opencode_file_path):
            deleted_files.append(skill.opencode_file_path)

    # 删除原始zip文件
    if skill.file_path:
        if delete_file_or_dir(skill.file_path):
            deleted_files.append(skill.opencode_file_path)

    # 从数据库删除记录
    await db.delete(skill)
    await db.commit()

    return {"message": "Skill deleted successfully", "deleted_files": deleted_files}


@router.post("/skills/batch-upload")
async def batch_upload_skills(
    files: List[UploadFile] = File(...),
    category: str = Form(SkillCategory.CUSTOM),
    is_public: bool = Form(False),
    version: str = Form("1.0.0"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """批量上传 skills - 自动从每个 ZIP 的 SKILL.md 提取元数据"""
    import os
    import hashlib
    import tempfile
    from app.core.platform_config import get_opencode_skills_dir, ensure_dir_exists
    from app.core.config import settings

    results = {"success": [], "failed": []}

    # 获取跨平台的OpenCode Skills目录
    opencode_skills_dir = get_opencode_skills_dir()
    ensure_dir_exists(opencode_skills_dir)

    # 确保skills zip存储目录存在
    skills_zip_dir = Path(settings.SKILLS_ZIP_STORAGE_PATH)
    skills_zip_dir.mkdir(parents=True, exist_ok=True)

    for file in files:
        try:
            file_content = await file.read()
            checksum = hashlib.sha256(file_content).hexdigest()

            # 保持原始文件名，只做基本安全检查防止路径遍历
            original_filename = file.filename or "skill"
            safe_filename = os.path.basename(original_filename)
            if not safe_filename:
                safe_filename = "skill"

            # 只接受zip格式
            if not safe_filename.endswith(".zip"):
                results["failed"].append(
                    {"filename": original_filename, "reason": "只支持ZIP格式的文件"}
                )
                continue

            # 解析 SKILL.md 获取元数据
            metadata = parse_skill_metadata_from_zip(file_content)
            skill_dir_name = metadata.get("skill_dir_name")

            # 从 SKILL.md 提取 name 和 description
            final_name = metadata.get("name")
            final_description = metadata.get("description")

            # 如果 SKILL.md 没有 name，则使用目录名
            if not final_name and skill_dir_name:
                final_name = skill_dir_name
            if not final_name:
                final_name = "unnamed-skill"

            # 创建临时目录用于检查zip内容
            with tempfile.TemporaryDirectory() as temp_dir:
                temp_zip_path = os.path.join(temp_dir, safe_filename)
                with open(temp_zip_path, "wb") as f:
                    f.write(file_content)

                # 检查zip内容
                root_dirs = set()
                has_skill_md = False

                try:
                    with zipfile.ZipFile(temp_zip_path, "r") as zip_ref:
                        # 遍历zip中的所有文件
                        for info in zip_ref.infolist():
                            # 获取路径的第一部分（根目录）
                            parts = info.filename.split("/")
                            if len(parts) > 0 and parts[0]:
                                root_dirs.add(parts[0])
                                # 检查是否有SKILL.md在根目录下
                                if len(parts) == 2 and parts[1] == "SKILL.md":
                                    has_skill_md = True

                        # 检查是否只有一个根目录
                        if len(root_dirs) != 1:
                            results["failed"].append(
                                {
                                    "filename": original_filename,
                                    "reason": f"ZIP格式不符：必须包含且仅包含一个根目录，当前包含 {len(root_dirs)} 个",
                                }
                            )
                            continue

                        # 检查是否包含SKILL.md
                        if not has_skill_md:
                            results["failed"].append(
                                {
                                    "filename": original_filename,
                                    "reason": "ZIP格式不符：根目录下必须包含SKILL.md文件",
                                }
                            )
                            continue

                except Exception as e:
                    results["failed"].append(
                        {"filename": original_filename, "reason": f"ZIP文件解析失败：{str(e)}"}
                    )
                    continue

                # 检查目标目录是否已存在
                skill_dir = (
                    os.path.join(opencode_skills_dir, skill_dir_name) if skill_dir_name else None
                )
                if not skill_dir or os.path.exists(skill_dir):
                    results["failed"].append(
                        {
                            "filename": original_filename,
                            "reason": f"技能目录 '{skill_dir_name}' 已存在或无效",
                        }
                    )
                    continue

                # 解压到opencode_skills_dir
                with zipfile.ZipFile(temp_zip_path, "r") as zip_ref:
                    zip_ref.extractall(opencode_skills_dir)

                # 保存原始zip文件到项目upload的skills目录下
                skills_zip_file_path = skills_zip_dir / safe_filename

                with open(skills_zip_file_path, "wb") as f:
                    f.write(file_content)

            # 创建数据库记录
            skill = OpenCodeSkill(
                name=final_name,
                version=version,
                description=final_description,
                author=getattr(current_user, "full_name", "unknown"),
                category=category,
                file_path=str(skills_zip_file_path),
                opencode_file_path=skill_dir,
                file_size=len(file_content),
                checksum=checksum,
                is_public=is_public,
                is_active=True,
                created_by=current_user.id if hasattr(current_user, "id") else None,
            )

            db.add(skill)
            await db.commit()
            await db.refresh(skill)

            results["success"].append({"filename": original_filename, "skill": skill.to_dict()})

        except Exception as e:
            results["failed"].append({"filename": file.filename or "unknown", "reason": str(e)})

    return results


@router.post("/skills/refresh")
async def refresh_skills(
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """
    从文件系统刷新 Skills 到数据库（使用 utils.py 工具函数）

    扫描 ~/.config/opencode/skills/ 目录，解析每个子目录的 SKILL.md，
    将不存在的 skill 添加到数据库，已存在的更新 name 和 description
    """
    skills_dir = get_opencode_skills_dir()
    ensure_dir_exists(skills_dir)

    stats = {"scanned": 0, "added": 0, "updated": 0, "skipped": 0}
    errors = []

    # 遍历 skills 目录
    for item in os.listdir(skills_dir):
        skill_path = os.path.join(skills_dir, item)
        if not os.path.isdir(skill_path):
            continue

        stats["scanned"] += 1

        # 检查 SKILL.md
        skill_md_path = os.path.join(skill_path, "SKILL.md")
        if not os.path.exists(skill_md_path):
            errors.append({"directory": item, "error": "Missing SKILL.md"})
            stats["skipped"] += 1
            continue

        try:
            # 使用工具函数解析 SKILL.md
            skill_data = parse_skill_md_from_path(skill_md_path)
            skill_data["opencode_file_path"] = skill_path

            # 检查是否已存在
            result = await db.execute(
                select(OpenCodeSkill).where(OpenCodeSkill.opencode_file_path == skill_path)
            )
            existing_skill = result.scalar_one_or_none()

            # 使用工具函数创建或更新记录
            skill, is_new = create_or_update_opencode_skill(
                db, skill_data, current_user, existing_skill
            )

            if is_new:
                stats["added"] += 1
            else:
                stats["updated"] += 1

        except Exception as e:
            errors.append({"directory": item, "error": str(e)})
            stats["skipped"] += 1

    await db.commit()

    return {
        "success": True,
        "message": "Skills refreshed successfully",
        "stats": stats,
        "errors": errors,
    }
