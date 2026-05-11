"""
OpenCode 统一工具函数库
包含 Skills、Agents、MCPs 模块的可复用函数
"""

import os
import zipfile
import tempfile
import json
import frontmatter
import httpx
import uuid
from typing import List, Optional, Tuple
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.models import OpenCodeSkill, Agent, OpenCodeAgent, OpenCodeMCP
from app.core.config import settings
from app.core.platform_config import get_opencode_skills_dir, ensure_dir_exists, delete_file_or_dir


# ========== Skills 相关函数 ==========


def parse_skill_metadata_from_zip(zip_content: bytes) -> dict:
    """从 ZIP 文件内容中解析 SKILL.md 的元数据"""
    with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as temp_file:
        temp_file.write(zip_content)
        temp_file_path = temp_file.name

    try:
        with zipfile.ZipFile(temp_file_path, "r") as zip_ref:
            skill_md_path = None
            skill_dir_name = None
            for info in zip_ref.infolist():
                parts = info.filename.split("/")
                if len(parts) == 2 and parts[1] == "SKILL.md":
                    skill_md_path = info.filename
                    skill_dir_name = parts[0]
                    break

            if not skill_md_path:
                return {"name": None, "description": None, "skill_dir_name": skill_dir_name}

            skill_md_content = zip_ref.read(skill_md_path).decode("utf-8")
            post = frontmatter.loads(skill_md_content)

            return {
                "name": post.get("name"),
                "description": post.get("description"),
                "skill_dir_name": skill_dir_name,
            }
    finally:
        os.unlink(temp_file_path)


def parse_skill_metadata_from_zip_path(zip_file_path: str) -> dict:
    """从 ZIP 文件路径中解析 SKILL.md 的元数据"""
    with zipfile.ZipFile(zip_file_path, "r") as zip_ref:
        skill_md_path = None
        skill_dir_name = None
        for info in zip_ref.infolist():
            parts = info.filename.split("/")
            if len(parts) == 2 and parts[1] == "SKILL.md":
                skill_md_path = info.filename
                skill_dir_name = parts[0]
                break

        if not skill_md_path:
            return {"name": None, "description": None, "skill_dir_name": skill_dir_name}

        skill_md_content = zip_ref.read(skill_md_path).decode("utf-8")
        post = frontmatter.loads(skill_md_content)

        return {
            "name": post.get("name"),
            "description": post.get("description"),
            "skill_dir_name": skill_dir_name,
        }


def parse_skill_md_from_path(skill_md_path: str) -> dict:
    """从文件路径解析 SKILL.md（用于刷新功能）"""
    if not os.path.exists(skill_md_path):
        return {"name": None, "description": None}

    with open(skill_md_path, "r", encoding="utf-8") as f:
        skill_content = f.read()

    post = frontmatter.loads(skill_content)

    return {
        "name": post.get("name"),
        "description": post.get("description"),
        "version": post.get("version", "1.0.0"),
        "author": post.get("author"),
        "category": post.get("category", "custom"),
    }


def validate_skill_zip_structure(zip_ref: zipfile.ZipFile) -> tuple[bool, str]:
    """验证 Skill ZIP 结构，返回(是否有效, 错误信息)"""
    root_dirs = set()
    has_skill_md = False

    for info in zip_ref.infolist():
        parts = info.filename.split("/")
        if len(parts) > 0 and parts[0]:
            root_dirs.add(parts[0])
            if len(parts) == 2 and parts[1] == "SKILL.md":
                has_skill_md = True

    if len(root_dirs) != 1:
        return False, f"ZIP格式不符：必须包含且仅包含一个根目录，当前包含 {len(root_dirs)} 个"

    if not has_skill_md:
        return False, "ZIP格式不符：根目录下必须包含SKILL.md文件"

    return True, ""


def create_or_update_opencode_skill(
    db: AsyncSession, skill_data: dict, current_user, existing_skill: Optional[OpenCodeSkill] = None
) -> tuple[OpenCodeSkill, bool]:
    """创建或更新 OpenCodeSkill 记录，返回(skill, is_new)"""
    from datetime import datetime

    if existing_skill:
        if skill_data.get("name"):
            existing_skill.name = skill_data["name"]
        if skill_data.get("description"):
            existing_skill.description = skill_data["description"]
        if skill_data.get("version"):
            existing_skill.version = skill_data["version"]
        if skill_data.get("author"):
            existing_skill.author = skill_data["author"]
        if skill_data.get("category"):
            existing_skill.category = skill_data["category"]
        if "config" in skill_data:
            existing_skill.config = skill_data["config"]
        if "file_path" in skill_data:
            existing_skill.file_path = skill_data["file_path"]
        if "opencode_file_path" in skill_data:
            existing_skill.opencode_file_path = skill_data["opencode_file_path"]
        existing_skill.updated_at = datetime.utcnow()
        return existing_skill, False
    else:
        new_skill = OpenCodeSkill(
            id=str(uuid.uuid4()),
            name=skill_data.get("name", "unnamed-skill"),
            version=skill_data.get("version", "1.0.0"),
            description=skill_data.get("description", ""),
            author=skill_data.get("author", getattr(current_user, "full_name", "unknown")),
            category=skill_data.get("category", "custom"),
            file_path=skill_data.get("file_path", ""),
            opencode_file_path=skill_data.get("opencode_file_path", ""),
            file_size=skill_data.get("file_size", 0),
            checksum=skill_data.get("checksum", ""),
            config=skill_data.get("config", {}),
            schema=skill_data.get("schema", {}),
            tags=skill_data.get("tags", []),
            is_public=skill_data.get("is_public", False),
            is_active=skill_data.get("is_active", True),
            agent_package_id=skill_data.get("agent_package_id"),
            created_by=current_user.id if hasattr(current_user, "id") else None,
        )
        db.add(new_skill)
        return new_skill, True


# ========== Agents 相关函数 ==========


def validate_zip_structure(zip_ref: zipfile.ZipFile) -> bool:
    """验证 Agent 包 ZIP 结构"""
    file_list = zip_ref.namelist()

    has_agents_md = any(
        f == "AGENTS.md" or (len(f.split("/")) == 2 and f.endswith("/AGENTS.md")) for f in file_list
    )
    has_agents = any(f.startswith("agents/") and f.endswith(".md") for f in file_list)

    has_skills = False
    for f in file_list:
        if f.startswith("skills/") and f != "skills/":
            parts = f.split("/")
            if len(parts) == 3 and parts[2] == "SKILL.md":
                has_skills = True
                break

    return has_agents_md or has_agents or has_skills


def validate_agent_package_structure(pkg_path: str) -> bool:
    """验证 Agent 包目录结构（用于刷新功能）"""
    has_agents_md = os.path.exists(os.path.join(pkg_path, "AGENTS.md"))
    has_agents_dir = os.path.isdir(os.path.join(pkg_path, "agents"))
    has_skills_dir = os.path.isdir(os.path.join(pkg_path, "skills"))
    return has_agents_md or has_agents_dir or has_skills_dir


def parse_skill_frontmatter(content: str) -> dict:
    """简单解析 Skill 的 frontmatter"""
    frontmatter_dict = {}
    try:
        if content.startswith("---"):
            end_idx = content.find("---", 3)
            if end_idx > 0:
                fm_content = content[3:end_idx].strip()
                for line in fm_content.split("\n"):
                    if ":" in line:
                        key, value = line.split(":", 1)
                        frontmatter_dict[key.strip()] = value.strip()
    except Exception:
        pass
    return frontmatter_dict


def parse_agents_directory(agents_dir: str) -> list[dict]:
    """解析 agents 目录，返回 agent 信息列表"""
    package_agents = []
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
    return package_agents


def parse_skills_directory_for_agent(skills_dir: str) -> list[dict]:
    """解析 skills 目录（用于 Agent 包），返回 skill 信息列表"""
    package_skills = []
    if os.path.exists(skills_dir):
        for skill_dir_name in os.listdir(skills_dir):
            skill_dir = os.path.join(skills_dir, skill_dir_name)
            if os.path.isdir(skill_dir):
                skill_md_path = os.path.join(skill_dir, "SKILL.md")
                if os.path.exists(skill_md_path):
                    with open(skill_md_path, "r", encoding="utf-8") as f:
                        content = f.read()
                    fm = parse_skill_frontmatter(content)
                    skill_name = fm.get("name", skill_dir_name)
                    package_skills.append(
                        {
                            "name": skill_name,
                            "version": fm.get("version", "1.0.0"),
                            "description": fm.get("description"),
                            "author": fm.get("author"),
                            "category": fm.get("category", "custom"),
                            "file_path": skill_dir,
                        }
                    )
    return package_skills


def create_opencode_agent_record(agent_package_id: str, agent_data: dict) -> OpenCodeAgent:
    """创建 OpenCodeAgent 记录"""
    return OpenCodeAgent(
        id=str(uuid.uuid4()),
        agent_package_id=agent_package_id,
        name=agent_data["name"],
        file_name=agent_data["file_name"],
        file_path=agent_data["file_path"],
        file_content=agent_data["file_content"],
    )


def create_opencode_skill_for_agent(
    agent_package_id: str, skill_data: dict, current_user, category: Optional[str] = None
) -> OpenCodeSkill:
    """创建 OpenCodeSkill 记录（用于 Agent 包）"""
    return OpenCodeSkill(
        id=str(uuid.uuid4()),
        name=skill_data["name"],
        version=skill_data.get("version", "1.0.0"),
        description=skill_data.get("description", ""),
        author=skill_data.get("author", getattr(current_user, "full_name", "unknown")),
        category=category or skill_data.get("category", "custom"),
        file_path=skill_data["file_path"],
        agent_package_id=agent_package_id,
        is_public=False,
        is_active=True,
        created_by=current_user.id if hasattr(current_user, "id") else None,
    )


def create_agent_package_with_relations(
    db: AsyncSession,
    package_data: dict,
    package_agents: list[dict],
    package_skills: list[dict],
    current_user,
    category: Optional[str] = None,
) -> Agent:
    """创建 Agent 包及关联记录（OpenCodeAgent、OpenCodeSkill）"""
    new_agent = Agent(
        id=str(uuid.uuid4()),
        name=package_data.get("name", package_data.get("original_filename", "unnamed-agent")),
        author=package_data.get("author", getattr(current_user, "full_name", "unknown")),
        version=package_data.get("version", "1.0.0"),
        description=package_data.get("description", ""),
        original_filename=package_data.get("original_filename", ""),
        package_file_path=package_data.get("package_file_path", ""),
        extracted_dir_path=package_data.get("extracted_dir_path", ""),
        agents_md_content=package_data.get("agents_md_content"),
        agents_count=len(package_agents),
        skills_count=len(package_skills),
        is_public=package_data.get("is_public", False),
        category=category,
        created_by=current_user.id if hasattr(current_user, "id") else None,
    )
    db.add(new_agent)

    for pa in package_agents:
        op_agent = create_opencode_agent_record(new_agent.id, pa)
        db.add(op_agent)

    for ps in package_skills:
        op_skill = create_opencode_skill_for_agent(
            new_agent.id, ps, current_user, category=category
        )
        db.add(op_skill)

    return new_agent


# ========== MCPs 相关函数 ==========


def get_opencode_config_path() -> Path:
    """Get the path to opencode.json config file"""
    config_dir = Path.home() / ".config" / "opencode"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir / "opencode.json"


def read_opencode_config() -> dict:
    """Read opencode.json config file, create if doesn't exist"""
    config_path = get_opencode_config_path()
    if config_path.exists():
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"mcp": {}}


def write_opencode_config(config: dict):
    """Write config to opencode.json"""
    config_path = get_opencode_config_path()
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def update_config_mcp_entry(mcp: OpenCodeMCP, old_name: Optional[str] = None):
    """Update or add an MCP entry to opencode.json"""
    config = read_opencode_config()

    if "mcp" not in config:
        config["mcp"] = {}

    if old_name and old_name in config["mcp"] and old_name != mcp.name:
        del config["mcp"][old_name]

    headers = mcp.config.get("headers", {}) if mcp.config else {}

    mcp_entry = {
        "type": "remote",
        "url": mcp.server_url,
        "enabled": mcp.is_active,
        "headers": headers,
    }

    config["mcp"][mcp.name] = mcp_entry
    write_opencode_config(config)


def remove_config_mcp_entry(mcp_name: str):
    """Remove an MCP entry from opencode.json"""
    config = read_opencode_config()

    if "mcp" in config and mcp_name in config["mcp"]:
        del config["mcp"][mcp_name]
        write_opencode_config(config)


async def fetch_mcp_tools(server_url: str, config: Optional[dict] = None) -> dict:
    """
    Fetch tools from an HTTP MCP server
    """
    try:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if config and config.get("headers"):
            headers.update(config["headers"])

        async with httpx.AsyncClient(timeout=30.0) as client:
            init_payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {"tools": {}, "resources": {}, "prompts": {}},
                    "clientInfo": {"name": "DeepAudit", "version": "1.0.0"},
                },
            }

            init_response = await client.post(server_url, json=init_payload, headers=headers)
            init_response.raise_for_status()

            session_id = init_response.headers.get("mcp-session-id") or init_response.headers.get(
                "MCP-Session-ID"
            )

            request_headers = headers.copy()
            if session_id:
                request_headers["mcp-session-id"] = session_id

            initialized_payload = {"jsonrpc": "2.0", "method": "notifications/initialized"}

            try:
                await client.post(server_url, json=initialized_payload, headers=request_headers)
            except Exception:
                pass

            list_tools_payload = {"jsonrpc": "2.0", "id": 2, "method": "tools/list"}

            response = await client.post(
                server_url, json=list_tools_payload, headers=request_headers
            )
            response.raise_for_status()

            content_type = response.headers.get("content-type", "")

            if "text/event-stream" in content_type:
                result = None
                for line in response.text.split("\n"):
                    line = line.strip()
                    if line.startswith("data:"):
                        data_str = line[5:].strip()
                        if data_str:
                            try:
                                result = json.loads(data_str)
                                break
                            except Exception:
                                continue

                if result is None:
                    return {"success": False, "error": "Failed to parse SSE response"}
            else:
                result = response.json()

            if "error" in result:
                return {
                    "success": False,
                    "error": f"tools/list failed: {result['error'].get('message', 'Unknown error')}",
                }

            tools = []
            if "result" in result:
                if isinstance(result["result"], dict) and "tools" in result["result"]:
                    tools = result["result"]["tools"]
                elif isinstance(result["result"], list):
                    tools = result["result"]

            return {"success": True, "tools": tools}

    except httpx.HTTPError as e:
        return {"success": False, "error": f"HTTP connection error: {str(e)}"}
    except Exception as e:
        return {"success": False, "error": f"Failed to fetch tools: {str(e)}"}


def create_or_update_opencode_mcp(
    db: AsyncSession, mcp_data: dict, current_user, existing_mcp: Optional[OpenCodeMCP] = None
) -> tuple[OpenCodeMCP, bool]:
    """创建或更新 OpenCodeMCP 记录，返回(mcp, is_new)"""
    from datetime import datetime

    if existing_mcp:
        if mcp_data.get("name"):
            existing_mcp.name = mcp_data["name"]
        if mcp_data.get("mcp_type"):
            existing_mcp.mcp_type = mcp_data["mcp_type"]
        if mcp_data.get("version"):
            existing_mcp.version = mcp_data["version"]
        if mcp_data.get("description"):
            existing_mcp.description = mcp_data["description"]
        if mcp_data.get("author"):
            existing_mcp.author = mcp_data["author"]
        if mcp_data.get("server_url"):
            existing_mcp.server_url = mcp_data["server_url"]
        if mcp_data.get("command"):
            existing_mcp.command = mcp_data["command"]
        if "args" in mcp_data:
            existing_mcp.args = mcp_data["args"]
        if "env" in mcp_data:
            existing_mcp.env = mcp_data["env"]
        if "config" in mcp_data:
            existing_mcp.config = mcp_data["config"]
        if "tools" in mcp_data:
            existing_mcp.tools = mcp_data["tools"]
        if "tags" in mcp_data:
            existing_mcp.tags = mcp_data["tags"]
        if "is_active" in mcp_data:
            existing_mcp.is_active = mcp_data["is_active"]
        existing_mcp.updated_at = datetime.utcnow()
        return existing_mcp, False
    else:
        new_mcp = OpenCodeMCP(
            id=str(uuid.uuid4()),
            name=mcp_data.get("name", "unnamed-mcp"),
            mcp_type=mcp_data.get("mcp_type", "http"),
            version=mcp_data.get("version", "1.0.0"),
            description=mcp_data.get("description", ""),
            author=mcp_data.get("author", getattr(current_user, "full_name", "unknown")),
            server_url=mcp_data.get("server_url", ""),
            command=mcp_data.get("command", ""),
            args=mcp_data.get("args", []),
            env=mcp_data.get("env", {}),
            config=mcp_data.get("config", {}),
            tools=mcp_data.get("tools", []),
            tags=mcp_data.get("tags", []),
            is_active=mcp_data.get("is_active", True),
            created_by=current_user.id if hasattr(current_user, "id") else None,
        )
        db.add(new_mcp)
        return new_mcp, True
