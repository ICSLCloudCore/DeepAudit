"""
Golang 安全知识库 API 端点
- /vulnerabilities   洞察漏洞库
- /attack-patterns   攻击模式库
"""

from __future__ import annotations

import io
import json
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
from app.models.security_kb import GoAttackPatternEntry, GoVulnerabilityEntry
from app.models.user import User
from app.schemas.security_kb import (
    AttackPatternEntryCreate,
    AttackPatternEntryListResponse,
    AttackPatternEntryResponse,
    AttackPatternEntryUpdate,
    ExportZipRequest,
    ImportResultItem,
    ImportZipResponse,
    VulnerabilityEntryCreate,
    VulnerabilityEntryListResponse,
    VulnerabilityEntryResponse,
    VulnerabilityEntryUpdate,
)

router = APIRouter()

MAX_MD_SIZE = 10 * 1024 * 1024   # 10 MB per .md file
MAX_ZIP_SIZE = 100 * 1024 * 1024  # 100 MB per zip
MAX_ZIP_FILES = 500


# ─── Helpers ────────────────────────────────────────────────────────────────


def _require_editable(entry: Any, current_user: User) -> None:
    if entry.is_system:
        raise HTTPException(status_code=403, detail="系统内置条目不允许修改或删除")
    if entry.created_by != current_user.id and not current_user.is_superuser:
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
    lines.append("entry_type: vulnerability")
    if entry.cve_id:
        lines.append(f"cve_id: {entry.cve_id}")
    if entry.cwe_id:
        lines.append(f"cwe_id: {entry.cwe_id}")
    lines.append(f"severity: {entry.severity}")
    lines.append(f"category: {entry.category}")
    if tags_yaml:
        lines.append(f"tags:\n{tags_yaml}")
    else:
        lines.append("tags: []")
    if entry.affected_versions:
        lines.append(f'affected_versions: "{entry.affected_versions}"')
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
    go_packages = _json_loads_safe(entry.go_packages)
    tags_yaml = "\n".join(f"  - {t}" for t in tags) if tags else ""
    pkgs_yaml = "\n".join(f"  - {p}" for p in go_packages) if go_packages else ""

    lines = ["---"]
    lines.append(f'title: "{entry.title}"')
    lines.append(f"slug: {entry.slug}")
    lines.append("entry_type: attack_pattern")
    if entry.capec_id:
        lines.append(f"capec_id: {entry.capec_id}")
    lines.append(f"attack_type: {entry.attack_type}")
    lines.append(f"severity: {entry.severity}")
    if entry.likelihood:
        lines.append(f"likelihood: {entry.likelihood}")
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
    if entry.mitigations:
        lines.append(f'mitigations: |')
        for mline in entry.mitigations.splitlines():
            lines.append(f"  {mline}")
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
    severity = meta.get("severity", "medium")
    if severity not in {"critical", "high", "medium", "low"}:
        severity = "medium"

    tags_raw = meta.get("tags", [])
    tags = list(tags_raw) if isinstance(tags_raw, (list, tuple)) else []

    pkgs_raw = meta.get("go_packages", [])
    go_packages = list(pkgs_raw) if isinstance(pkgs_raw, (list, tuple)) else []

    return {
        "title": str(title)[:200],
        "slug": str(slug_val)[:200],
        "cve_id": str(meta["cve_id"])[:50] if meta.get("cve_id") else None,
        "cwe_id": str(meta["cwe_id"])[:50] if meta.get("cwe_id") else None,
        "severity": severity,
        "category": str(meta.get("category", "uncategorized"))[:100],
        "tags": tags,
        "summary": str(meta["summary"])[:1000] if meta.get("summary") else None,
        "content": body or "（内容待补充）",
        "affected_versions": str(meta["affected_versions"])[:500] if meta.get("affected_versions") else None,
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

    title = meta.get("title") or (filename.replace(".md", "").replace("-", " ").title()) or "Untitled"
    slug_val = meta.get("slug") or _generate_slug(str(title))
    severity = meta.get("severity", "medium")
    if severity not in {"critical", "high", "medium", "low"}:
        severity = "medium"
    likelihood = meta.get("likelihood")
    if likelihood not in {"high", "medium", "low", None}:
        likelihood = None

    tags_raw = meta.get("tags", [])
    tags = list(tags_raw) if isinstance(tags_raw, (list, tuple)) else []

    pkgs_raw = meta.get("go_packages", [])
    go_packages = list(pkgs_raw) if isinstance(pkgs_raw, (list, tuple)) else []

    return {
        "title": str(title)[:200],
        "slug": str(slug_val)[:200],
        "capec_id": str(meta["capec_id"])[:50] if meta.get("capec_id") else None,
        "attack_type": str(meta.get("attack_type", "other"))[:100],
        "severity": severity,
        "likelihood": likelihood,
        "tags": tags,
        "summary": str(meta["summary"])[:1000] if meta.get("summary") else None,
        "content": body or "（内容待补充）",
        "mitigations": str(meta["mitigations"]) if meta.get("mitigations") else None,
        "go_packages": go_packages,
        "source_url": str(meta["source_url"])[:500] if meta.get("source_url") else None,
        "is_active": bool(meta.get("is_active", True)),
    }


# ─── 漏洞库路由 ─────────────────────────────────────────────────────────────

vuln_router = APIRouter(prefix="/vulnerabilities")


@vuln_router.get("", response_model=VulnerabilityEntryListResponse)
async def list_vulnerabilities(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    q: Optional[str] = Query(None, description="关键词搜索"),
    severity: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    is_system: Optional[bool] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    base_filter = or_(
        GoVulnerabilityEntry.is_system == True,
        GoVulnerabilityEntry.created_by == current_user.id,
    )
    query = select(GoVulnerabilityEntry).where(base_filter)

    if q:
        like = f"%{q}%"
        query = query.where(
            or_(
                GoVulnerabilityEntry.title.ilike(like),
                GoVulnerabilityEntry.summary.ilike(like),
                GoVulnerabilityEntry.cve_id.ilike(like),
                GoVulnerabilityEntry.cwe_id.ilike(like),
            )
        )
    if severity:
        query = query.where(GoVulnerabilityEntry.severity == severity)
    if category:
        query = query.where(GoVulnerabilityEntry.category == category)
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
    severity: Optional[str] = Query(None),
    attack_type: Optional[str] = Query(None),
    is_system: Optional[bool] = Query(None),
    is_active: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(deps.get_current_user),
) -> Any:
    base_filter = or_(
        GoAttackPatternEntry.is_system == True,
        GoAttackPatternEntry.created_by == current_user.id,
    )
    query = select(GoAttackPatternEntry).where(base_filter)

    if q:
        like = f"%{q}%"
        query = query.where(
            or_(
                GoAttackPatternEntry.title.ilike(like),
                GoAttackPatternEntry.summary.ilike(like),
                GoAttackPatternEntry.capec_id.ilike(like),
            )
        )
    if severity:
        query = query.where(GoAttackPatternEntry.severity == severity)
    if attack_type:
        query = query.where(GoAttackPatternEntry.attack_type == attack_type)
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
        d["go_packages"] = _json_loads_safe(e.go_packages)
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

    entry = GoAttackPatternEntry(
        **{k: v for k, v in data.model_dump().items() if k not in ("tags", "go_packages")},
        tags=json.dumps(data.tags, ensure_ascii=False),
        go_packages=json.dumps(data.go_packages, ensure_ascii=False),
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
    )
    query = select(GoAttackPatternEntry).where(base_filter)
    if body.ids:
        query = query.where(GoAttackPatternEntry.id.in_(body.ids))
    if body.severity:
        query = query.where(GoAttackPatternEntry.severity == body.severity)
    if body.attack_type:
        query = query.where(GoAttackPatternEntry.attack_type == body.attack_type)

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
    d["go_packages"] = _json_loads_safe(entry.go_packages)
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
            if k in ("tags", "go_packages"):
                setattr(existing, k, json.dumps(v, ensure_ascii=False))
            else:
                setattr(existing, k, v)
        existing.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(existing)
        return existing

    entry = GoAttackPatternEntry(
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


# ─── 注册子路由 ─────────────────────────────────────────────────────────────

router.include_router(vuln_router)
router.include_router(attack_router)
