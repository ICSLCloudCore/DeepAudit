"""
Golang 安全知识库 API 端点
- /vulnerabilities   洞察漏洞库
- /attack-patterns   攻击模式库
"""

from __future__ import annotations

import io
import json
import uuid
import zipfile
from datetime import datetime, timezone
from typing import Any, List, Optional

import frontmatter
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import Response, StreamingResponse
from slugify import slugify
from sqlalchemy import func as sql_func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from app.api import deps
from app.db.session import get_db
from app.models.security_kb import GoAttackPatternEntry, GoVulnerabilityEntry, BusinessKbEntry
from app.services.insight_config_service import (
    load_insight_config,
    save_insight_config,
    get_source_options,
)
from app.models.user import User
from pydantic import BaseModel

from app.schemas.security_kb import (
    AttackPatternEntryCreate,
    AttackPatternEntryListResponse,
    AttackPatternEntryResponse,
    AttackPatternEntryUpdate,
    AttackPatternVersionCreate,
    AttackPatternVersionListResponse,
    ExportZipRequest,
    ImportResultItem,
    ImportZipResponse,
    VulnerabilityEntryCreate,
    VulnerabilityEntryListResponse,
    VulnerabilityEntryResponse,
    VulnerabilityEntryUpdate,
    BusinessKbEntryCreate,
    BusinessKbEntryListResponse,
    BusinessKbEntryResponse,
    BusinessKbEntryUpdate,
)

router = APIRouter()

MAX_MD_SIZE = 10 * 1024 * 1024   # 10 MB per .md file
MAX_ZIP_SIZE = 100 * 1024 * 1024  # 100 MB per zip
MAX_ZIP_FILES = 500


# ─── Helpers ────────────────────────────────────────────────────────────────


def _require_editable(entry: Any, current_user: User) -> None:
    if entry.is_system:
        raise HTTPException(status_code=403, detail="系统内置条目不允许修改或删除")
    # created_by 为 None 表示由系统/洞察任务生成，任何登录用户均可编辑
    if entry.created_by is not None and entry.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="无权操作他人条目")


def _json_loads_safe(value: str | None, default: Any = None) -> Any:
    if not value:
        return default if default is not None else []
    try:
        return json.loads(value)
    except Exception:
        return default if default is not None else []


def _generate_slug(title: str) -> str:
    result = slugify(title, max_length=200, separator="-")
    return result or "entry"


def _vuln_to_markdown(entry: GoVulnerabilityEntry) -> str:
    tags = _json_loads_safe(entry.tags)
    go_packages = _json_loads_safe(entry.go_packages)
    tags_yaml = "\n".join(f"  - {t}" for t in tags) if tags else ""
    pkgs_yaml = "\n".join(f"  - {p}" for p in go_packages) if go_packages else ""

    lines = ["---"]
    lines.append(f'title: "{entry.title}"')
    lines.append(f"slug: {entry.slug}")
    lines.append("entry_type: vulnerability_insight")
    if tags_yaml:
        lines.append(f"tags:\n{tags_yaml}")
    else:
        lines.append("tags: []")
    if pkgs_yaml:
        lines.append(f"go_packages:\n{pkgs_yaml}")
    else:
        lines.append("go_packages: []")
    if entry.source_url:
        lines.append(f'source_url: "{entry.source_url}"')
    if entry.summary:
        lines.append(f'summary: "{entry.summary}"')
    lines.append(f"is_active: {str(entry.is_active).lower()}")
    if entry.created_at:
        lines.append(f'created_at: "{entry.created_at.isoformat()}"')
    if entry.updated_at:
        lines.append(f'updated_at: "{entry.updated_at.isoformat()}"')
    lines.append("---")
    lines.append("")
    lines.append(entry.content or "")
    return "\n".join(lines)


def _attack_to_markdown(entry: GoAttackPatternEntry) -> str:
    tags = _json_loads_safe(entry.tags)
    tags_yaml = "\n".join(f"  - {t}" for t in tags) if tags else ""

    lines = ["---"]
    lines.append(f'title: "{entry.title}"')
    lines.append(f"slug: {entry.slug}")
    lines.append("entry_type: attack_pattern")
    lines.append(f"pattern_type: {entry.pattern_type}")
    lines.append(f"risk_level: {entry.risk_level}")
    if tags_yaml:
        lines.append(f"tags:\n{tags_yaml}")
    else:
        lines.append("tags: []")
    if entry.summary:
        lines.append(f'summary: "{entry.summary}"')
    lines.append(f"is_active: {str(entry.is_active).lower()}")
    if entry.created_at:
        lines.append(f'created_at: "{entry.created_at.isoformat()}"')
    if entry.updated_at:
        lines.append(f'updated_at: "{entry.updated_at.isoformat()}"')
    lines.append("---")
    lines.append("")
    lines.append(entry.content or "")
    return "\n".join(lines)


def _parse_md_to_vuln_dict(raw_bytes: bytes, filename: str = "") -> dict:
    """Parse markdown bytes into a dict compatible with VulnerabilityEntryCreate."""
    text = raw_bytes.decode("utf-8", errors="replace")
    post = frontmatter.loads(text)
    meta = post.metadata
    body = post.content.strip()

    title = meta.get("title") or (filename.replace(".md", "").replace("-", " ").title()) or "Untitled"
    slug_val = meta.get("slug") or _generate_slug(str(title))

    tags_raw = meta.get("tags", [])
    tags = list(tags_raw) if isinstance(tags_raw, (list, tuple)) else []

    pkgs_raw = meta.get("go_packages", [])
    go_packages = list(pkgs_raw) if isinstance(pkgs_raw, (list, tuple)) else []

    return {
        "title": str(title)[:200],
        "slug": str(slug_val)[:200],
        "tags": tags,
        "summary": str(meta["summary"])[:1000] if meta.get("summary") else None,
        "content": body or "（内容待补充）",
        "go_packages": go_packages,
        "source_url": str(meta["source_url"])[:500] if meta.get("source_url") else None,
        "is_active": bool(meta.get("is_active", True)),
    }


def _parse_md_to_attack_dict(raw_bytes: bytes, filename: str = "") -> dict:
    """Parse markdown bytes into a dict compatible with AttackPatternEntryCreate."""
    text = raw_bytes.decode("utf-8", errors="replace")
    post = frontmatter.loads(text)
    meta = post.metadata
    body = post.content.strip()

    _valid_pattern_types = {"general", "go-specific", "cloud-business", "expert-experience"}
    title = meta.get("title") or (filename.replace(".md", "").replace("-", " ").title()) or "Untitled"
    slug_val = meta.get("slug") or _generate_slug(str(title))
    # Support both old 'severity' key and new 'risk_level' key for backward compat
    risk_level = meta.get("risk_level") or meta.get("severity", "medium")
    if risk_level not in {"critical", "high", "medium", "low"}:
        risk_level = "medium"
    pattern_type = str(meta.get("pattern_type", "general"))
    if pattern_type not in _valid_pattern_types:
        pattern_type = "general"

    tags_raw = meta.get("tags", [])
    tags = list(tags_raw) if isinstance(tags_raw, (list, tuple)) else []

    return {
        "title": str(title)[:200],
        "slug": str(slug_val)[:200],
        "pattern_type": pattern_type,
        "risk_level": risk_level,
        "tags": tags,
        "summary": str(meta["summary"])[:1000] if meta.get("summary") else None,
        "content": body or "（内容待补充）",
        "is_active": bool(meta.get("is_active", True)),
    }


# ─── 漏洞库路由 ─────────────────────────────────────────────────────────────

vuln_router = APIRouter(prefix="/vulnerabilities")


@vuln_router.get("", response_model=VulnerabilityEntryListResponse)
async def list_vulnerabilities(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    q: Optional[str] = Query(None, description="关键词搜索"),
    is_system: Optional[bool] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    base_filter = or_(
        GoVulnerabilityEntry.is_system == True,
        GoVulnerabilityEntry.created_by == current_user.id,
        GoVulnerabilityEntry.created_by == None,
    )
    query = select(GoVulnerabilityEntry).where(base_filter)

    if q:
        like = f"%{q}%"
        query = query.where(
            or_(
                GoVulnerabilityEntry.title.ilike(like),
                GoVulnerabilityEntry.summary.ilike(like),
            )
        )
    if is_system is not None:
        query = query.where(GoVulnerabilityEntry.is_system == is_system)
    if is_active is not None:
        query = query.where(GoVulnerabilityEntry.is_active == is_active)

    count_query = select(sql_func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(
        GoVulnerabilityEntry.is_system.desc(),
        GoVulnerabilityEntry.created_at.desc(),
    ).offset(skip).limit(limit)

    result = await db.execute(query)
    items = result.scalars().all()

    def _serialize(e: GoVulnerabilityEntry) -> dict:
        d = {c.name: getattr(e, c.name) for c in e.__table__.columns}
        d["tags"] = _json_loads_safe(e.tags)
        d["go_packages"] = _json_loads_safe(e.go_packages)
        return d

    return VulnerabilityEntryListResponse(
        items=[VulnerabilityEntryResponse.model_validate(_serialize(e)) for e in items],
        total=total,
        skip=skip,
        limit=limit,
    )


@vuln_router.post("", response_model=VulnerabilityEntryResponse, status_code=201)
async def create_vulnerability(
    data: VulnerabilityEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    existing = (await db.execute(
        select(GoVulnerabilityEntry).where(GoVulnerabilityEntry.slug == data.slug)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail=f"slug '{data.slug}' 已存在")

    entry = GoVulnerabilityEntry(
        **{k: v for k, v in data.model_dump().items() if k not in ("tags", "go_packages")},
        tags=json.dumps(data.tags, ensure_ascii=False),
        go_packages=json.dumps(data.go_packages, ensure_ascii=False),
        is_system=False,
        created_by=current_user.id,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return _vuln_response(entry)


@vuln_router.get("/{entry_id}", response_model=VulnerabilityEntryResponse)
async def get_vulnerability(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    entry = await _get_vuln_or_404(entry_id, db)
    _check_read_access(entry, current_user)
    return _vuln_response(entry)


@vuln_router.put("/{entry_id}", response_model=VulnerabilityEntryResponse)
async def update_vulnerability(
    entry_id: str,
    data: VulnerabilityEntryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    entry = await _get_vuln_or_404(entry_id, db)
    _require_editable(entry, current_user)

    update_data = data.model_dump(exclude_unset=True)
    if "tags" in update_data:
        update_data["tags"] = json.dumps(update_data["tags"], ensure_ascii=False)
    if "go_packages" in update_data:
        update_data["go_packages"] = json.dumps(update_data["go_packages"], ensure_ascii=False)

    for k, v in update_data.items():
        setattr(entry, k, v)
    entry.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(entry)
    return _vuln_response(entry)


@vuln_router.delete("/{entry_id}", status_code=204)
async def delete_vulnerability(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> None:
    entry = await _get_vuln_or_404(entry_id, db)
    _require_editable(entry, current_user)
    await db.delete(entry)
    await db.commit()


@vuln_router.get("/{entry_id}/export")
async def export_vulnerability_md(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Response:
    entry = await _get_vuln_or_404(entry_id, db)
    _check_read_access(entry, current_user)
    md_content = _vuln_to_markdown(entry)
    return Response(
        content=md_content.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{entry.slug}.md"'},
    )


@vuln_router.post("/import", response_model=VulnerabilityEntryResponse, status_code=201)
async def import_vulnerability_md(
    file: UploadFile = File(...),
    overwrite: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    raw = await file.read()
    if len(raw) > MAX_MD_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过 10MB 限制")

    parsed = _parse_md_to_vuln_dict(raw, file.filename or "")
    entry = await _upsert_vuln(parsed, overwrite, current_user, db)
    return _vuln_response(entry)


@vuln_router.post("/import-zip", response_model=ImportZipResponse)
async def import_vulnerability_zip(
    file: UploadFile = File(...),
    overwrite: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    raw = await file.read()
    if len(raw) > MAX_ZIP_SIZE:
        raise HTTPException(status_code=400, detail="ZIP 文件大小超过 100MB 限制")

    results: List[ImportResultItem] = []
    success = skipped = failed = 0

    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        md_files = [n for n in zf.namelist() if n.lower().endswith(".md")]
        if len(md_files) > MAX_ZIP_FILES:
            raise HTTPException(status_code=400, detail=f"ZIP 内文件数量超过 {MAX_ZIP_FILES} 限制")

        for name in md_files:
            fname = name.split("/")[-1]
            try:
                content = zf.read(name)
                parsed = _parse_md_to_vuln_dict(content, fname)
                entry = await _upsert_vuln(parsed, overwrite, current_user, db, raise_on_skip=False)
                if entry is None:
                    skipped += 1
                    results.append(ImportResultItem(filename=fname, status="skipped", reason="slug 已存在且未开启覆盖"))
                else:
                    success += 1
                    results.append(ImportResultItem(filename=fname, status="created", id=entry.id, slug=entry.slug))
            except Exception as exc:
                failed += 1
                results.append(ImportResultItem(filename=fname, status="failed", reason=str(exc)))

    return ImportZipResponse(
        total=len(md_files),
        success=success,
        skipped=skipped,
        failed=failed,
        results=results,
    )


@vuln_router.post("/export-zip")
async def export_vulnerability_zip(
    body: ExportZipRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> StreamingResponse:
    base_filter = or_(
        GoVulnerabilityEntry.is_system == True,
        GoVulnerabilityEntry.created_by == current_user.id,
        GoVulnerabilityEntry.created_by == None,
    )
    query = select(GoVulnerabilityEntry).where(base_filter)
    if body.ids:
        query = query.where(GoVulnerabilityEntry.id.in_(body.ids))
    if body.severity:
        query = query.where(GoVulnerabilityEntry.severity == body.severity)
    if body.category:
        query = query.where(GoVulnerabilityEntry.category == body.category)

    result = await db.execute(query)
    entries = result.scalars().all()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for e in entries:
            zf.writestr(f"{e.slug}.md", _vuln_to_markdown(e))
    buf.seek(0)

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="vulnerabilities_export_{ts}.zip"'},
    )


# ─── 漏洞库内部辅助 ─────────────────────────────────────────────────────────


async def _get_vuln_or_404(entry_id: str, db: AsyncSession) -> GoVulnerabilityEntry:
    entry = (await db.execute(
        select(GoVulnerabilityEntry).where(GoVulnerabilityEntry.id == entry_id)
    )).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="条目不存在")
    return entry


def _check_read_access(entry: Any, current_user: User) -> None:
    if not entry.is_system and entry.created_by != current_user.id and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="无权查看此条目")


def _vuln_response(entry: GoVulnerabilityEntry) -> VulnerabilityEntryResponse:
    d = {c.name: getattr(entry, c.name) for c in entry.__table__.columns}
    d["tags"] = _json_loads_safe(entry.tags)
    d["go_packages"] = _json_loads_safe(entry.go_packages)
    return VulnerabilityEntryResponse.model_validate(d)


async def _upsert_vuln(
    parsed: dict,
    overwrite: bool,
    current_user: User,
    db: AsyncSession,
    raise_on_skip: bool = True,
) -> Optional[GoVulnerabilityEntry]:
    slug = parsed["slug"]
    existing = (await db.execute(
        select(GoVulnerabilityEntry).where(GoVulnerabilityEntry.slug == slug)
    )).scalar_one_or_none()

    if existing:
        if existing.is_system:
            if raise_on_skip:
                raise HTTPException(status_code=400, detail="系统内置条目不允许覆盖")
            return None
        if not overwrite:
            if raise_on_skip:
                raise HTTPException(status_code=400, detail=f"slug '{slug}' 已存在，请开启覆盖选项")
            return None
        for k, v in parsed.items():
            if k in ("tags", "go_packages"):
                setattr(existing, k, json.dumps(v, ensure_ascii=False))
            else:
                setattr(existing, k, v)
        existing.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        return existing

    entry = GoVulnerabilityEntry(
        **{k: v for k, v in parsed.items() if k not in ("tags", "go_packages")},
        tags=json.dumps(parsed.get("tags", []), ensure_ascii=False),
        go_packages=json.dumps(parsed.get("go_packages", []), ensure_ascii=False),
        is_system=False,
        created_by=current_user.id,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


# ─── 攻击模式库路由 ──────────────────────────────────────────────────────────

attack_router = APIRouter(prefix="/attack-patterns")


@attack_router.get("", response_model=AttackPatternEntryListResponse)
async def list_attack_patterns(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    q: Optional[str] = Query(None),
    risk_level: Optional[str] = Query(None),
    pattern_type: Optional[str] = Query(None),
    is_system: Optional[bool] = Query(None),
    is_active: Optional[bool] = Query(None),
    all_versions: bool = Query(False, description="为 True 时返回所有版本，默认只返回最新版本"),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    base_filter = or_(
        GoAttackPatternEntry.is_system == True,
        GoAttackPatternEntry.created_by == current_user.id,
        GoAttackPatternEntry.created_by == None,
    )
    query = select(GoAttackPatternEntry).where(base_filter)

    # By default only show latest version of each pattern
    if not all_versions:
        query = query.where(GoAttackPatternEntry.is_latest == True)

    if q:
        like = f"%{q}%"
        query = query.where(
            or_(
                GoAttackPatternEntry.title.ilike(like),
                GoAttackPatternEntry.summary.ilike(like),
            )
        )
    if risk_level:
        query = query.where(GoAttackPatternEntry.risk_level == risk_level)
    if pattern_type:
        query = query.where(GoAttackPatternEntry.pattern_type == pattern_type)
    if is_system is not None:
        query = query.where(GoAttackPatternEntry.is_system == is_system)
    if is_active is not None:
        query = query.where(GoAttackPatternEntry.is_active == is_active)

    count_query = select(sql_func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(
        GoAttackPatternEntry.is_system.desc(),
        GoAttackPatternEntry.created_at.desc(),
    ).offset(skip).limit(limit)

    result = await db.execute(query)
    items = result.scalars().all()

    def _serialize(e: GoAttackPatternEntry) -> dict:
        d = {c.name: getattr(e, c.name) for c in e.__table__.columns}
        d["tags"] = _json_loads_safe(e.tags)
        return d

    return AttackPatternEntryListResponse(
        items=[AttackPatternEntryResponse.model_validate(_serialize(e)) for e in items],
        total=total,
        skip=skip,
        limit=limit,
    )


@attack_router.post("", response_model=AttackPatternEntryResponse, status_code=201)
async def create_attack_pattern(
    data: AttackPatternEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    existing = (await db.execute(
        select(GoAttackPatternEntry).where(GoAttackPatternEntry.slug == data.slug)
    )).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail=f"slug '{data.slug}' 已存在")

    new_id = str(uuid.uuid4())
    entry = GoAttackPatternEntry(
        id=new_id,
        pattern_id=new_id,       # 首版：pattern_id == id
        version=data.version or "1.0.0",
        version_notes=data.version_notes,
        is_latest=True,
        parent_id=None,
        **{k: v for k, v in data.model_dump().items()
           if k not in ("tags", "version", "version_notes")},
        tags=json.dumps(data.tags, ensure_ascii=False),
        is_system=False,
        created_by=current_user.id,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return _attack_response(entry)


@attack_router.get("/{entry_id}", response_model=AttackPatternEntryResponse)
async def get_attack_pattern(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    entry = await _get_attack_or_404(entry_id, db)
    _check_read_access(entry, current_user)
    return _attack_response(entry)


@attack_router.put("/{entry_id}", response_model=AttackPatternEntryResponse)
async def update_attack_pattern(
    entry_id: str,
    data: AttackPatternEntryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    entry = await _get_attack_or_404(entry_id, db)
    _require_editable(entry, current_user)

    update_data = data.model_dump(exclude_unset=True)
    if "tags" in update_data:
        update_data["tags"] = json.dumps(update_data["tags"], ensure_ascii=False)
    if "go_packages" in update_data:
        update_data["go_packages"] = json.dumps(update_data["go_packages"], ensure_ascii=False)

    for k, v in update_data.items():
        setattr(entry, k, v)
    entry.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(entry)
    return _attack_response(entry)


@attack_router.delete("/{entry_id}", status_code=204)
async def delete_attack_pattern(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> None:
    entry = await _get_attack_or_404(entry_id, db)
    _require_editable(entry, current_user)
    await db.delete(entry)
    await db.commit()


@attack_router.get("/{entry_id}/export")
async def export_attack_pattern_md(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Response:
    entry = await _get_attack_or_404(entry_id, db)
    _check_read_access(entry, current_user)
    md_content = _attack_to_markdown(entry)
    return Response(
        content=md_content.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{entry.slug}.md"'},
    )


@attack_router.post("/import", response_model=AttackPatternEntryResponse, status_code=201)
async def import_attack_pattern_md(
    file: UploadFile = File(...),
    overwrite: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    raw = await file.read()
    if len(raw) > MAX_MD_SIZE:
        raise HTTPException(status_code=400, detail="文件大小超过 10MB 限制")

    parsed = _parse_md_to_attack_dict(raw, file.filename or "")
    entry = await _upsert_attack(parsed, overwrite, current_user, db)
    return _attack_response(entry)


@attack_router.post("/import-zip", response_model=ImportZipResponse)
async def import_attack_pattern_zip(
    file: UploadFile = File(...),
    overwrite: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    raw = await file.read()
    if len(raw) > MAX_ZIP_SIZE:
        raise HTTPException(status_code=400, detail="ZIP 文件大小超过 100MB 限制")

    results: List[ImportResultItem] = []
    success = skipped = failed = 0

    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        md_files = [n for n in zf.namelist() if n.lower().endswith(".md")]
        if len(md_files) > MAX_ZIP_FILES:
            raise HTTPException(status_code=400, detail=f"ZIP 内文件数量超过 {MAX_ZIP_FILES} 限制")

        for name in md_files:
            fname = name.split("/")[-1]
            try:
                content = zf.read(name)
                parsed = _parse_md_to_attack_dict(content, fname)
                entry = await _upsert_attack(parsed, overwrite, current_user, db, raise_on_skip=False)
                if entry is None:
                    skipped += 1
                    results.append(ImportResultItem(filename=fname, status="skipped", reason="slug 已存在且未开启覆盖"))
                else:
                    success += 1
                    results.append(ImportResultItem(filename=fname, status="created", id=entry.id, slug=entry.slug))
            except Exception as exc:
                failed += 1
                results.append(ImportResultItem(filename=fname, status="failed", reason=str(exc)))

    return ImportZipResponse(
        total=len(md_files),
        success=success,
        skipped=skipped,
        failed=failed,
        results=results,
    )


@attack_router.post("/export-zip")
async def export_attack_pattern_zip(
    body: ExportZipRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> StreamingResponse:
    base_filter = or_(
        GoAttackPatternEntry.is_system == True,
        GoAttackPatternEntry.created_by == current_user.id,
        GoAttackPatternEntry.created_by == None,
    )
    query = select(GoAttackPatternEntry).where(base_filter)
    if body.ids:
        query = query.where(GoAttackPatternEntry.id.in_(body.ids))
    if body.severity:
        query = query.where(GoAttackPatternEntry.risk_level == body.severity)
    if body.attack_type:
        query = query.where(GoAttackPatternEntry.pattern_type == body.attack_type)

    result = await db.execute(query)
    entries = result.scalars().all()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for e in entries:
            zf.writestr(f"{e.slug}.md", _attack_to_markdown(e))
    buf.seek(0)

    ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H-%M-%S")
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="attack_patterns_export_{ts}.zip"'},
    )


# ─── 攻击模式内部辅助 ────────────────────────────────────────────────────────


async def _get_attack_or_404(entry_id: str, db: AsyncSession) -> GoAttackPatternEntry:
    entry = (await db.execute(
        select(GoAttackPatternEntry).where(GoAttackPatternEntry.id == entry_id)
    )).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="条目不存在")
    return entry


def _attack_response(entry: GoAttackPatternEntry) -> AttackPatternEntryResponse:
    d = {c.name: getattr(entry, c.name) for c in entry.__table__.columns}
    d["tags"] = _json_loads_safe(entry.tags)
    # Ensure version/type fields always present for older rows
    d.setdefault("pattern_id", entry.id)
    d.setdefault("version", "1.0.0")
    d.setdefault("version_notes", None)
    d.setdefault("is_latest", True)
    d.setdefault("parent_id", None)
    d.setdefault("pattern_type", "general")
    d.setdefault("risk_level", "medium")
    return AttackPatternEntryResponse.model_validate(d)


async def _upsert_attack(
    parsed: dict,
    overwrite: bool,
    current_user: User,
    db: AsyncSession,
    raise_on_skip: bool = True,
) -> Optional[GoAttackPatternEntry]:
    slug = parsed["slug"]
    existing = (await db.execute(
        select(GoAttackPatternEntry).where(GoAttackPatternEntry.slug == slug)
    )).scalar_one_or_none()

    if existing:
        if existing.is_system:
            if raise_on_skip:
                raise HTTPException(status_code=400, detail="系统内置条目不允许覆盖")
            return None
        if not overwrite:
            if raise_on_skip:
                raise HTTPException(status_code=400, detail=f"slug '{slug}' 已存在，请开启覆盖选项")
            return None
        for k, v in parsed.items():
            if k == "tags":
                setattr(existing, k, json.dumps(v, ensure_ascii=False))
            elif k not in ("pattern_id", "is_latest", "parent_id"):
                setattr(existing, k, v)
        existing.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        return existing

    new_id = str(uuid.uuid4())
    entry = GoAttackPatternEntry(
        id=new_id,
        pattern_id=parsed.get("pattern_id") or new_id,
        version=parsed.get("version") or "1.0.0",
        version_notes=parsed.get("version_notes"),
        is_latest=True,
        parent_id=parsed.get("parent_id"),
        **{k: v for k, v in parsed.items()
           if k not in ("tags", "pattern_id", "version",
                        "version_notes", "is_latest", "parent_id")},
        tags=json.dumps(parsed.get("tags", []), ensure_ascii=False),
        is_system=False,
        created_by=current_user.id,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return entry


# ─── 版本管理路由 ─────────────────────────────────────────────────────────────

@attack_router.get("/{entry_id}/versions", response_model=AttackPatternVersionListResponse)
async def list_attack_pattern_versions(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """获取某一攻击模式的所有版本（通过任意版本的 id 均可查询）"""
    # Resolve pattern_id from the given entry
    entry = await _get_attack_or_404(entry_id, db)
    _check_read_access(entry, current_user)
    pattern_id = entry.pattern_id or entry.id

    result = await db.execute(
        select(GoAttackPatternEntry)
        .where(GoAttackPatternEntry.pattern_id == pattern_id)
        .order_by(GoAttackPatternEntry.created_at.asc())
    )
    versions = result.scalars().all()
    return AttackPatternVersionListResponse(
        pattern_id=pattern_id,
        versions=[_attack_response(v) for v in versions],
    )


@attack_router.post("/{entry_id}/versions", response_model=AttackPatternEntryResponse, status_code=201)
async def create_attack_pattern_version(
    entry_id: str,
    data: AttackPatternVersionCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """基于现有版本创建新版本（继承所有字段，仅覆盖提供的字段）"""
    parent = await _get_attack_or_404(entry_id, db)
    _check_read_access(parent, current_user)

    pattern_id = parent.pattern_id or parent.id

    # Check version number uniqueness within this pattern
    dup = (await db.execute(
        select(GoAttackPatternEntry).where(
            GoAttackPatternEntry.pattern_id == pattern_id,
            GoAttackPatternEntry.version == data.version,
        )
    )).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=400, detail=f"版本 {data.version} 已存在于该攻击模式中")

    # Build slug for new version: base-slug + -v{version_no_dots}
    version_suffix = data.version.replace(".", "")
    parent_base_slug = parent.slug.split("-v")[0]  # strip previous version suffix if present
    new_slug = f"{parent_base_slug}-v{version_suffix}"

    # Ensure slug uniqueness globally
    slug_candidate = new_slug
    counter = 1
    while (await db.execute(
        select(GoAttackPatternEntry).where(GoAttackPatternEntry.slug == slug_candidate)
    )).scalar_one_or_none():
        slug_candidate = f"{new_slug}-{counter}"
        counter += 1

    # Mark old is_latest False
    old_latest = (await db.execute(
        select(GoAttackPatternEntry).where(
            GoAttackPatternEntry.pattern_id == pattern_id,
            GoAttackPatternEntry.is_latest == True,
        )
    )).scalar_one_or_none()
    if old_latest:
        old_latest.is_latest = False

    # Inherit fields from parent, override with provided data
    new_id = str(uuid.uuid4())
    parent_tags = _json_loads_safe(parent.tags)

    new_entry = GoAttackPatternEntry(
        id=new_id,
        pattern_id=pattern_id,
        version=data.version,
        version_notes=data.version_notes,
        is_latest=True,
        parent_id=parent.id,
        slug=slug_candidate,
        title=data.title or parent.title,
        pattern_type=data.pattern_type or parent.pattern_type,
        risk_level=data.risk_level or parent.risk_level,
        tags=json.dumps(data.tags if data.tags is not None else parent_tags, ensure_ascii=False),
        summary=data.summary if data.summary is not None else parent.summary,
        content=data.content or parent.content,
        is_system=False,
        is_active=data.is_active if data.is_active is not None else parent.is_active,
        created_by=current_user.id,
    )
    db.add(new_entry)
    await db.commit()
    await db.refresh(new_entry)
    return _attack_response(new_entry)


@attack_router.put("/{entry_id}/set-latest", response_model=AttackPatternEntryResponse)
async def set_attack_pattern_latest_version(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    """将指定版本设置为该攻击模式的最新版本（is_latest=True）"""
    entry = await _get_attack_or_404(entry_id, db)
    _check_read_access(entry, current_user)
    if entry.is_system:
        raise HTTPException(status_code=403, detail="系统内置条目不允许修改")

    pattern_id = entry.pattern_id or entry.id

    # Clear all is_latest for this pattern
    all_versions = (await db.execute(
        select(GoAttackPatternEntry).where(GoAttackPatternEntry.pattern_id == pattern_id)
    )).scalars().all()
    for v in all_versions:
        v.is_latest = False
    entry.is_latest = True
    await db.commit()
    await db.refresh(entry)
    return _attack_response(entry)


# ─── 洞察配置路由 ────────────────────────────────────────────────────────────


class InsightConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    interval_hours: Optional[int] = None
    sources: Optional[List[str]] = None
    insight_project_path: Optional[str] = None
    insight_prompt: Optional[str] = None
    attack_pattern_prompt: Optional[str] = None


@router.get("/insight-config")
async def get_insight_config(
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """获取洞察配置（配置项 + 可选源列表）"""
    config = load_insight_config()
    return {
        "config": config,
        "source_options": get_source_options(),
    }


@router.put("/insight-config")
async def update_insight_config(
    body: InsightConfigUpdate,
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """更新洞察配置并持久化到 JSON 文件"""
    current = load_insight_config()
    if body.enabled is not None:
        current["enabled"] = body.enabled
    if body.interval_hours is not None:
        if body.interval_hours < 0:
            raise HTTPException(status_code=400, detail="interval_hours 最小值为 0")
        current["interval_hours"] = body.interval_hours
    if body.sources is not None:
        current["sources"] = body.sources
    if body.insight_project_path is not None:
        current["insight_project_path"] = body.insight_project_path
    if body.insight_prompt is not None:
        current["insight_prompt"] = body.insight_prompt
    if body.attack_pattern_prompt is not None:
        current["attack_pattern_prompt"] = body.attack_pattern_prompt
    saved = save_insight_config(current)
    return {"config": saved, "source_options": get_source_options()}


@router.post("/insight/run")
async def run_insight_now(
    background_tasks: Any = None,
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """立即触发一次洞察执行（后台异步运行）"""
    import asyncio as _asyncio
    from app.services.insight_runner_service import run_insight, get_insight_status

    status = get_insight_status()
    if status["running"]:
        return {"success": False, "message": "洞察正在运行中，请稍后再试", "status": status}

    _asyncio.create_task(run_insight())
    return {"success": True, "message": "洞察已启动，正在后台运行", "status": get_insight_status()}


@router.get("/insight/status")
async def get_insight_run_status(
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """获取洞察执行状态"""
    from app.services.insight_runner_service import get_insight_status
    return get_insight_status()


# ─── 业务知识库路由 ──────────────────────────────────────────────────────────

business_kb_router = APIRouter(prefix="/business-kb")


def _biz_serialize(e: BusinessKbEntry) -> dict:
    d = {c.name: getattr(e, c.name) for c in e.__table__.columns}
    d["tags"] = _json_loads_safe(e.tags)
    d["products"] = _json_loads_safe(e.products)
    return d


def _biz_to_markdown(entry: BusinessKbEntry) -> str:
    tags = _json_loads_safe(entry.tags)
    products = _json_loads_safe(entry.products)
    tags_yaml = "\n".join(f"  - {t}" for t in tags) if tags else ""
    prods_yaml = "\n".join(f"  - {p}" for p in products) if products else ""

    lines = ["---"]
    lines.append(f'title: "{entry.title}"')
    lines.append(f"slug: {entry.slug}")
    lines.append("entry_type: business_kb")
    lines.append(f"kb_type: {entry.kb_type}")
    lines.append(f"version: {entry.version}")
    if tags_yaml:
        lines.append(f"tags:\n{tags_yaml}")
    else:
        lines.append("tags: []")
    if prods_yaml:
        lines.append(f"products:\n{prods_yaml}")
    else:
        lines.append("products: []")
    if entry.summary:
        lines.append(f'summary: "{entry.summary}"')
    lines.append(f"is_active: {str(entry.is_active).lower()}")
    if entry.created_at:
        lines.append(f'created_at: "{entry.created_at.isoformat()}"')
    lines.append("---")
    lines.append("")
    lines.append(entry.content or "")
    return "\n".join(lines)


def _parse_md_to_biz_dict(raw_bytes: bytes, filename: str = "") -> dict:
    text = raw_bytes.decode("utf-8", errors="replace")
    post = frontmatter.loads(text)
    meta = post.metadata
    body = post.content.strip()

    title = meta.get("title") or (filename.replace(".md", "").replace("-", " ").title()) or "Untitled"
    slug_val = meta.get("slug") or _generate_slug(str(title))
    tags_raw = meta.get("tags", [])
    tags = list(tags_raw) if isinstance(tags_raw, (list, tuple)) else []
    prods_raw = meta.get("products", [])
    products = list(prods_raw) if isinstance(prods_raw, (list, tuple)) else []

    return {
        "title": str(title)[:200],
        "slug": str(slug_val)[:200],
        "kb_type": str(meta.get("kb_type", "protocol-standard"))[:100],
        "version": str(meta.get("version", "1.0.0"))[:50],
        "tags": tags,
        "products": products,
        "summary": str(meta["summary"])[:1000] if meta.get("summary") else None,
        "content": body or "（内容待补充）",
        "is_active": bool(meta.get("is_active", True)),
    }


@business_kb_router.get("", response_model=BusinessKbEntryListResponse)
async def list_business_kb(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    q: Optional[str] = Query(None),
    kb_type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    base_filter = or_(BusinessKbEntry.is_system == True, BusinessKbEntry.created_by == current_user.id)
    query = select(BusinessKbEntry).where(base_filter)
    if q:
        like = f"%{q}%"
        query = query.where(or_(BusinessKbEntry.title.ilike(like), BusinessKbEntry.summary.ilike(like)))
    if kb_type:
        query = query.where(BusinessKbEntry.kb_type == kb_type)
    if is_active is not None:
        query = query.where(BusinessKbEntry.is_active == is_active)

    total = (await db.execute(select(sql_func.count()).select_from(query.subquery()))).scalar() or 0
    query = query.order_by(BusinessKbEntry.is_system.desc(), BusinessKbEntry.created_at.desc()).offset(skip).limit(limit)
    items = (await db.execute(query)).scalars().all()
    return BusinessKbEntryListResponse(
        items=[BusinessKbEntryResponse.model_validate(_biz_serialize(e)) for e in items],
        total=total, skip=skip, limit=limit,
    )


@business_kb_router.post("", response_model=BusinessKbEntryResponse, status_code=201)
async def create_business_kb(
    data: BusinessKbEntryCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    existing = (await db.execute(select(BusinessKbEntry).where(BusinessKbEntry.slug == data.slug))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail=f"slug '{data.slug}' 已存在")
    entry = BusinessKbEntry(
        **{k: v for k, v in data.model_dump().items() if k not in ("tags", "products")},
        tags=json.dumps(data.tags, ensure_ascii=False),
        products=json.dumps(data.products, ensure_ascii=False),
        is_system=False,
        created_by=current_user.id,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return BusinessKbEntryResponse.model_validate(_biz_serialize(entry))


@business_kb_router.get("/{entry_id}", response_model=BusinessKbEntryResponse)
async def get_business_kb(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    entry = (await db.execute(select(BusinessKbEntry).where(BusinessKbEntry.id == entry_id))).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="条目不存在")
    return BusinessKbEntryResponse.model_validate(_biz_serialize(entry))


@business_kb_router.put("/{entry_id}", response_model=BusinessKbEntryResponse)
async def update_business_kb(
    entry_id: str,
    data: BusinessKbEntryUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    entry = (await db.execute(select(BusinessKbEntry).where(BusinessKbEntry.id == entry_id))).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="条目不存在")
    _require_editable(entry, current_user)
    update_data = data.model_dump(exclude_unset=True)
    for field, val in update_data.items():
        if field == "tags":
            entry.tags = json.dumps(val, ensure_ascii=False)
        elif field == "products":
            entry.products = json.dumps(val, ensure_ascii=False)
        else:
            setattr(entry, field, val)
    entry.updated_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(entry)
    return BusinessKbEntryResponse.model_validate(_biz_serialize(entry))


@business_kb_router.delete("/{entry_id}", status_code=204)
async def delete_business_kb(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> None:
    entry = (await db.execute(select(BusinessKbEntry).where(BusinessKbEntry.id == entry_id))).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="条目不存在")
    _require_editable(entry, current_user)
    await db.delete(entry)
    await db.commit()


@business_kb_router.get("/{entry_id}/export")
async def export_business_kb_md(
    entry_id: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    entry = (await db.execute(select(BusinessKbEntry).where(BusinessKbEntry.id == entry_id))).scalar_one_or_none()
    if not entry:
        raise HTTPException(status_code=404, detail="条目不存在")
    md = _biz_to_markdown(entry)
    filename = f"{entry.slug}.md"
    return Response(
        content=md.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@business_kb_router.post("/export-zip")
async def export_business_kb_zip(
    body: ExportZipRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    base_filter = or_(BusinessKbEntry.is_system == True, BusinessKbEntry.created_by == current_user.id)
    query = select(BusinessKbEntry).where(base_filter)
    if body.ids:
        query = query.where(BusinessKbEntry.id.in_(body.ids))
    items = (await db.execute(query)).scalars().all()

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for e in items:
            zf.writestr(f"{e.slug}.md", _biz_to_markdown(e).encode("utf-8"))
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="business-kb-export.zip"'},
    )


@business_kb_router.post("/import")
async def import_business_kb_md(
    file: UploadFile = File(...),
    overwrite: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    if not file.filename or not file.filename.endswith(".md"):
        raise HTTPException(status_code=400, detail="只支持 .md 文件")
    raw = await file.read()
    if len(raw) > MAX_MD_SIZE:
        raise HTTPException(status_code=400, detail="文件超过 10MB 限制")
    try:
        d = _parse_md_to_biz_dict(raw, file.filename or "")
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"解析失败: {exc}")

    existing = (await db.execute(select(BusinessKbEntry).where(BusinessKbEntry.slug == d["slug"]))).scalar_one_or_none()
    if existing:
        if not overwrite or existing.is_system:
            raise HTTPException(status_code=409, detail=f"slug '{d['slug']}' 已存在")
        _require_editable(existing, current_user)
        for k, v in d.items():
            if k == "tags":
                existing.tags = json.dumps(v, ensure_ascii=False)
            elif k == "products":
                existing.products = json.dumps(v, ensure_ascii=False)
            else:
                setattr(existing, k, v)
        existing.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        return BusinessKbEntryResponse.model_validate(_biz_serialize(existing))

    entry = BusinessKbEntry(
        **{k: v for k, v in d.items() if k not in ("tags", "products")},
        tags=json.dumps(d["tags"], ensure_ascii=False),
        products=json.dumps(d["products"], ensure_ascii=False),
        is_system=False, created_by=current_user.id,
    )
    db.add(entry)
    await db.commit()
    await db.refresh(entry)
    return BusinessKbEntryResponse.model_validate(_biz_serialize(entry))


@business_kb_router.post("/import-zip")
async def import_business_kb_zip(
    file: UploadFile = File(...),
    overwrite: bool = Form(False),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    raw = await file.read()
    if len(raw) > MAX_ZIP_SIZE:
        raise HTTPException(status_code=400, detail="ZIP 超过 100MB 限制")
    results = []
    success = skipped = failed = 0
    with zipfile.ZipFile(io.BytesIO(raw)) as zf:
        md_names = [n for n in zf.namelist() if n.endswith(".md")][:MAX_ZIP_FILES]
        for name in md_names:
            try:
                data_bytes = zf.read(name)
                d = _parse_md_to_biz_dict(data_bytes, name.split("/")[-1])
                existing = (await db.execute(
                    select(BusinessKbEntry).where(BusinessKbEntry.slug == d["slug"])
                )).scalar_one_or_none()
                if existing:
                    if not overwrite or existing.is_system:
                        skipped += 1
                        results.append(ImportResultItem(filename=name, status="skipped", slug=d["slug"], reason="已存在"))
                        continue
                    for k, v in d.items():
                        if k == "tags":
                            existing.tags = json.dumps(v, ensure_ascii=False)
                        elif k == "products":
                            existing.products = json.dumps(v, ensure_ascii=False)
                        else:
                            setattr(existing, k, v)
                    existing.updated_at = datetime.now(timezone.utc)
                    await db.commit()
                    success += 1
                    results.append(ImportResultItem(filename=name, status="updated", id=existing.id, slug=existing.slug))
                else:
                    entry = BusinessKbEntry(
                        **{k: v for k, v in d.items() if k not in ("tags", "products")},
                        tags=json.dumps(d["tags"], ensure_ascii=False),
                        products=json.dumps(d["products"], ensure_ascii=False),
                        is_system=False, created_by=current_user.id,
                    )
                    db.add(entry)
                    await db.commit()
                    await db.refresh(entry)
                    success += 1
                    results.append(ImportResultItem(filename=name, status="created", id=entry.id, slug=entry.slug))
            except Exception as exc:
                failed += 1
                results.append(ImportResultItem(filename=name, status="failed", reason=str(exc)))
    return ImportZipResponse(total=len(md_names), success=success, skipped=skipped, failed=failed, results=results)


@business_kb_router.get("/types/options")
async def get_business_kb_types(
    current_user: Any = Depends(deps.get_current_user),
) -> Any:
    """返回业务知识库类型选项（从配置文件读取）"""
    from app.services.business_kb_type_service import load_business_kb_types
    return load_business_kb_types()


# ─── 注册子路由 ─────────────────────────────────────────────────────────────

router.include_router(vuln_router)
router.include_router(attack_router)
router.include_router(business_kb_router)
