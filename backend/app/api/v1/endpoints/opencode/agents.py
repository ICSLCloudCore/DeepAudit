"""
Agent Package Management API
"""

import os
import zipfile
import shutil
import uuid
from typing import Optional
from pathlib import Path
from fastapi import APIRouter, Depends, File, UploadFile, Form, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.session import get_db
from app.models import Agent, OpenCodeAgent, OpenCodeSkill, User
from app.api.deps import get_current_user
from app.core.config import settings
from app.api.v1.endpoints.opencode.utils import (
    validate_zip_structure,
    validate_agent_package_structure,
    parse_skill_frontmatter,
    parse_agents_directory,
    parse_skills_directory_for_agent,
    create_agent_package_with_relations,
)

router = APIRouter()


def ensure_storage_dirs():
    """确保存储目录存在"""
    os.makedirs(settings.AGENT_PACKAGES_ZIP_STORAGE_PATH, exist_ok=True)
    os.makedirs(settings.AGENT_PACKAGES_EXTRACTED_PATH, exist_ok=True)


@router.post("/agents/upload")
async def upload_agent_package(
    file: UploadFile = File(...),
    version: str = Form("1.0.0"),
    description: Optional[str] = Form(None),
    is_public: bool = Form(False),
    category: str = Form("OTHER"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """上传Agent包"""
    ensure_storage_dirs()

    # 验证文件
    if not file.filename or not file.filename.lower().endswith(".zip"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只支持ZIP格式的文件")

    # 读取文件内容
    file_content = await file.read()

    import io

    zip_buffer = io.BytesIO(file_content)

    try:
        with zipfile.ZipFile(zip_buffer, "r") as zip_ref:
            # 验证zip结构
            if not validate_zip_structure(zip_ref):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="无效的Agent包结构，必须包含AGENTS.md、agents目录或skills目录",
                )

            # 获取原始文件名（不带zip后缀）
            original_filename = Path(file.filename).stem
            workflow_name = original_filename

            # 检查是否已存在同名的Agent包
            existing_agent = await db.execute(
                select(Agent).where(Agent.original_filename == original_filename)
            )
            existing_agent = existing_agent.scalars().first()

            if existing_agent:
                # 删除旧的关联记录
                await db.execute(
                    select(OpenCodeAgent).where(OpenCodeAgent.agent_package_id == existing_agent.id)
                )
                await db.execute(
                    select(OpenCodeSkill).where(OpenCodeSkill.agent_package_id == existing_agent.id)
                )

                # 删除旧的文件
                if existing_agent.package_file_path and os.path.exists(
                    existing_agent.package_file_path
                ):
                    os.remove(existing_agent.package_file_path)
                if existing_agent.extracted_dir_path and os.path.exists(
                    existing_agent.extracted_dir_path
                ):
                    shutil.rmtree(existing_agent.extracted_dir_path)

                # 删除旧的记录
                await db.delete(existing_agent)
                await db.commit()

            # 保存zip文件
            zip_filename = f"{original_filename}.zip"
            zip_path = os.path.join(settings.AGENT_PACKAGES_ZIP_STORAGE_PATH, zip_filename)

            with open(zip_path, "wb") as f:
                f.write(file_content)

            # 解压文件
            extract_dir = os.path.join(settings.AGENT_PACKAGES_EXTRACTED_PATH, original_filename)
            if os.path.exists(extract_dir):
                shutil.rmtree(extract_dir)
            os.makedirs(extract_dir, exist_ok=True)

            # 重置buffer位置
            zip_buffer.seek(0)
            with zipfile.ZipFile(zip_buffer, "r") as zip_ref:
                zip_ref.extractall(extract_dir)

            # 解析AGENTS.md
            agents_md_content = None
            agents_md_path = os.path.join(extract_dir, "AGENTS.md")
            if os.path.exists(agents_md_path):
                with open(agents_md_path, "r", encoding="utf-8") as f:
                    agents_md_content = f.read()

            # 解析agents目录
            package_agents = []
            agents_dir = os.path.join(extract_dir, "agents")
            if os.path.exists(agents_dir):
                for agent_file in os.listdir(agents_dir):
                    if agent_file.endswith(".md"):
                        agent_path = os.path.join(agents_dir, agent_file)
                        with open(agent_path, "r", encoding="utf-8") as f:
                            content = f.read()
                        agent_name = Path(agent_file).stem
                        package_agents.append(
                            {
                                "name": agent_name,
                                "file_name": agent_file,
                                "file_path": agent_path,
                                "file_content": content,
                            }
                        )

            # 解析skills目录
            package_skills = []
            skills_dir = os.path.join(extract_dir, "skills")
            if os.path.exists(skills_dir):
                for skill_dir_name in os.listdir(skills_dir):
                    skill_dir = os.path.join(skills_dir, skill_dir_name)
                    if os.path.isdir(skill_dir):
                        skill_md_path = os.path.join(skill_dir, "SKILL.md")
                        if os.path.exists(skill_md_path):
                            with open(skill_md_path, "r", encoding="utf-8") as f:
                                content = f.read()
                            frontmatter = parse_skill_frontmatter(content)
                            skill_name = frontmatter.get("name", skill_dir_name)
                            package_skills.append(
                                {
                                    "name": skill_name,
                                    "version": frontmatter.get("version", "1.0.0"),
                                    "description": frontmatter.get("description"),
                                    "author": frontmatter.get("author"),
                                    "category": frontmatter.get("category", "custom"),
                                    "file_path": skill_dir,
                                }
                            )

            # 创建Agent包记录
            new_agent = Agent(
                id=str(uuid.uuid4()),
                name=workflow_name,
                author=getattr(current_user, "full_name", "unknown"),
                version=version,
                description=description,
                original_filename=original_filename,
                package_file_path=zip_path,
                extracted_dir_path=extract_dir,
                agents_md_content=agents_md_content,
                agents_count=len(package_agents),
                skills_count=len(package_skills),
                is_public=is_public,
                category=category,
                created_by=current_user.id if hasattr(current_user, "id") else None,
            )

            db.add(new_agent)
            await db.commit()
            await db.refresh(new_agent)

            # 创建OpenCodeAgent记录
            for pa in package_agents:
                opencode_agent = OpenCodeAgent(
                    id=str(uuid.uuid4()),
                    agent_package_id=new_agent.id,
                    name=pa["name"],
                    file_name=pa["file_name"],
                    file_path=pa["file_path"],
                    file_content=pa["file_content"],
                )
                db.add(opencode_agent)

            # 创建OpenCodeSkill记录
            for ps in package_skills:
                opencode_skill = OpenCodeSkill(
                    id=str(uuid.uuid4()),
                    name=ps["name"],
                    version=ps["version"],
                    description=ps["description"],
                    author=ps["author"],
                    category=ps["category"],
                    file_path=ps["file_path"],
                    agent_package_id=new_agent.id,
                    is_public=False,
                    is_active=True,
                    created_by=current_user.id if hasattr(current_user, "id") else None,
                )
                db.add(opencode_skill)

            await db.commit()

            # 重新获取完整记录（包含关联数据）
            result = await db.execute(
                select(Agent)
                .options(selectinload(Agent.package_agents), selectinload(Agent.package_skills))
                .where(Agent.id == new_agent.id)
            )
            full_agent = result.scalars().first()

            return full_agent.to_dict()

    except zipfile.BadZipFile:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="无效的ZIP文件")
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"上传失败：{str(e)}"
        )


@router.get("/agents")
async def list_agent_packages(
    search: Optional[str] = Query(None, description="搜索Agent包名称或描述"),
    is_public: Optional[bool] = Query(None, description="过滤公开或私有"),
    category: Optional[str] = Query(None, description="分类过滤"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取Agent包列表"""
    query = select(Agent)

    # 构建过滤条件
    filters = []
    if is_public is not None:
        filters.append(Agent.is_public == is_public)
    else:
        # 默认只显示自己的和公开的
        filters.append(or_(Agent.is_public == True, Agent.created_by == current_user.id))

    if category:
        filters.append(Agent.category == category)

    if search:
        filters.append(
            or_(
                Agent.name.ilike(f"%{search}%"),
                Agent.description.ilike(f"%{search}%"),
                Agent.author.ilike(f"%{search}%"),
            )
        )

    if filters:
        query = query.where(and_(*filters))

    # 获取总数
    count_query = select(func.count(Agent.id))
    if filters:
        count_query = count_query.where(and_(*filters))
    count_result = await db.execute(count_query)
    total = count_result.scalar() or 0

    # 分页查询
    offset = (page - 1) * page_size
    query = (
        query.options(selectinload(Agent.package_agents), selectinload(Agent.package_skills))
        .offset(offset)
        .limit(page_size)
        .order_by(Agent.created_at.desc())
    )

    result = await db.execute(query)
    agent_packages = result.scalars().all()

    return {
        "items": [pkg.to_dict() for pkg in agent_packages],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/agents/{agent_package_id}")
async def get_agent_package(
    agent_package_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """获取单个Agent包详情"""
    result = await db.execute(
        select(Agent)
        .options(selectinload(Agent.package_agents), selectinload(Agent.package_skills))
        .where(Agent.id == agent_package_id)
    )
    agent_package = result.scalars().first()

    if not agent_package:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent包不存在")

    # 检查权限
    if not agent_package.is_public and agent_package.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权访问此Agent包")

    return agent_package.to_dict()


@router.get("/agents/{agent_package_id}/download")
async def download_agent_package(
    agent_package_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """下载Agent包"""
    result = await db.execute(select(Agent).where(Agent.id == agent_package_id))
    agent_package = result.scalars().first()

    if not agent_package:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent包不存在")

    # 检查权限
    if not agent_package.is_public and agent_package.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权下载此Agent包")

    if not agent_package.package_file_path or not os.path.exists(agent_package.package_file_path):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="文件不存在")

    filename = f"{agent_package.original_filename}.zip"
    return FileResponse(
        path=agent_package.package_file_path,
        media_type="application/zip",
        filename=filename,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/agents/{agent_package_id}")
async def delete_agent_package(
    agent_package_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """删除Agent包"""
    result = await db.execute(
        select(Agent)
        .options(selectinload(Agent.package_agents), selectinload(Agent.package_skills))
        .where(Agent.id == agent_package_id)
    )
    agent_package = result.scalars().first()

    if not agent_package:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent包不存在")

    # 检查权限
    if agent_package.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权删除此Agent包")

    deleted_files = []

    # 删除文件
    if agent_package.package_file_path and os.path.exists(agent_package.package_file_path):
        os.remove(agent_package.package_file_path)
        deleted_files.append(agent_package.package_file_path)

    if agent_package.extracted_dir_path and os.path.exists(agent_package.extracted_dir_path):
        shutil.rmtree(agent_package.extracted_dir_path)
        deleted_files.append(agent_package.extracted_dir_path)

    # 删除记录（级联删除关联记录）
    await db.delete(agent_package)
    await db.commit()

    return {"message": "Agent包删除成功", "deleted_files": deleted_files}


@router.put("/agents/{agent_package_id}")
async def update_agent_package(
    agent_package_id: str,
    name: Optional[str] = None,
    description: Optional[str] = None,
    version: Optional[str] = None,
    is_public: Optional[bool] = None,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """更新Agent包信息"""
    result = await db.execute(select(Agent).where(Agent.id == agent_package_id))
    agent_package = result.scalars().first()

    if not agent_package:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Agent包不存在")

    # 检查权限
    if agent_package.created_by != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="无权更新此Agent包")

    # 更新字段
    if name is not None:
        agent_package.name = name
    if description is not None:
        agent_package.description = description
    if version is not None:
        agent_package.version = version
    if is_public is not None:
        agent_package.is_public = is_public

    await db.commit()
    await db.refresh(agent_package)

    return agent_package.to_dict()


@router.post("/agents/refresh")
async def refresh_agents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    从文件系统刷新 Agents 到数据库（使用 utils.py 工具函数）

    扫描 AGENT_PACKAGES_EXTRACTED_PATH 目录，解析每个子目录，
    将不存在的 agent 包添加到数据库
    """
    ensure_storage_dirs()

    stats = {"scanned": 0, "added": 0, "updated": 0, "skipped": 0}
    errors = []

    extract_dir = Path(settings.AGENT_PACKAGES_EXTRACTED_PATH)

    for item in os.listdir(extract_dir):
        pkg_path = os.path.join(extract_dir, item)
        if not os.path.isdir(pkg_path):
            continue

        stats["scanned"] += 1

        # 使用工具函数验证结构
        if not validate_agent_package_structure(pkg_path):
            errors.append({"directory": item, "error": "Invalid agent package structure"})
            stats["skipped"] += 1
            continue

        # 检查是否已存在
        result = await db.execute(select(Agent).where(Agent.original_filename == item))
        existing_agent = result.scalars().first()

        if existing_agent:
            # 已存在，跳过
            stats["skipped"] += 1
            continue

        try:
            # 1. 读取 AGENTS.md
            agents_md_content = None
            agents_md_path = os.path.join(pkg_path, "AGENTS.md")
            if os.path.exists(agents_md_path):
                with open(agents_md_path, "r", encoding="utf-8") as f:
                    agents_md_content = f.read()

            # 2. 使用工具函数解析 agents/ 目录
            package_agents = parse_agents_directory(os.path.join(pkg_path, "agents"))

            # 3. 使用工具函数解析 skills/ 目录
            package_skills = parse_skills_directory_for_agent(os.path.join(pkg_path, "skills"))

            # 4. 使用工具函数创建 Agent 包及关联记录
            package_data = {
                "name": item,
                "original_filename": item,
                "extracted_dir_path": pkg_path,
                "agents_md_content": agents_md_content,
            }

            new_agent = create_agent_package_with_relations(
                db, package_data, package_agents, package_skills, current_user
            )

            await db.commit()

            stats["added"] += 1

        except Exception as e:
            errors.append({"directory": item, "error": str(e)})
            stats["skipped"] += 1

    return {
        "success": True,
        "message": "Agents refreshed successfully",
        "stats": stats,
        "errors": errors,
    }
