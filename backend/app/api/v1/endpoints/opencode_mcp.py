"""
MCP Management API
"""

import time
import json
import httpx
import os
from pathlib import Path
from typing import List, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, and_, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.models import OpenCodeMCP, MCPType
from app.api.deps import get_current_user

router = APIRouter()


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
    
    # Ensure mcp section exists
    if "mcp" not in config:
        config["mcp"] = {}
    
    # Remove old entry if name changed
    if old_name and old_name in config["mcp"] and old_name != mcp.name:
        del config["mcp"][old_name]
    
    # Prepare MCP entry from database fields
    headers = mcp.config.get("headers", {}) if mcp.config else {}
    
    mcp_entry = {
        "type": "remote",
        "url": mcp.server_url,
        "enabled": mcp.is_active,
        "headers": headers
    }
    
    config["mcp"][mcp.name] = mcp_entry
    write_opencode_config(config)


def remove_config_mcp_entry(mcp_name: str):
    """Remove an MCP entry from opencode.json"""
    config = read_opencode_config()
    
    if "mcp" in config and mcp_name in config["mcp"]:
        del config["mcp"][mcp_name]
        write_opencode_config(config)


class MCPCreate(BaseModel):
    name: str = Field(..., description="MCP name")
    mcp_type: str = Field(default=MCPType.HTTP, description="MCP type")
    version: str = Field(default="1.0.0", description="MCP version")
    description: Optional[str] = Field(None, description="MCP description")
    server_url: Optional[str] = Field(None, description="Server URL for HTTP/SSE MCP")
    command: Optional[str] = Field(None, description="Command for stdio MCP")
    args: Optional[List[str]] = Field(None, description="Arguments for stdio MCP")
    env: Optional[dict] = Field(None, description="Environment variables for stdio MCP")
    config: Optional[dict] = Field(None, description="Additional configuration")


class MCPUpdate(BaseModel):
    name: Optional[str] = Field(None, description="MCP name")
    version: Optional[str] = Field(None, description="MCP version")
    description: Optional[str] = Field(None, description="MCP description")
    server_url: Optional[str] = Field(None, description="Server URL for HTTP/SSE MCP")
    command: Optional[str] = Field(None, description="Command for stdio MCP")
    args: Optional[List[str]] = Field(None, description="Arguments for stdio MCP")
    env: Optional[dict] = Field(None, description="Environment variables for stdio MCP")
    config: Optional[dict] = Field(None, description="Additional configuration")
    is_active: Optional[bool] = Field(None, description="Whether the MCP is active")


async def fetch_mcp_tools(server_url: str, config: Optional[dict] = None) -> dict:
    """
    Fetch tools from an HTTP MCP server
    """
    try:
        headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream"
        }
        if config and config.get("headers"):
            headers.update(config["headers"])

        # Try to connect to the MCP server
        async with httpx.AsyncClient(timeout=30.0) as client:
            # First, try to get server info (initialize session)
            init_payload = {
                "jsonrpc": "2.0",
                "id": 1,
                "method": "initialize",
                "params": {
                    "protocolVersion": "2024-11-05",
                    "capabilities": {
                        "tools": {},
                        "resources": {},
                        "prompts": {}
                    },
                    "clientInfo": {
                        "name": "DeepAudit",
                        "version": "1.0.0"
                    }
                }
            }
            
            init_response = await client.post(server_url, json=init_payload, headers=headers)
            init_response.raise_for_status()

            # Extract mcp-session-id from response headers
            session_id = init_response.headers.get("mcp-session-id") or init_response.headers.get("MCP-Session-ID")
            
            # Prepare headers for subsequent requests
            request_headers = headers.copy()
            if session_id:
                request_headers["mcp-session-id"] = session_id
            
            # Send initialized notification
            initialized_payload = {
                "jsonrpc": "2.0",
                "method": "notifications/initialized"
            }
            
            try:
                await client.post(server_url, json=initialized_payload, headers=request_headers)
            except Exception:
                # Some servers might not require this
                pass
            
            # Then list tools
            list_tools_payload = {
                "jsonrpc": "2.0",
                "id": 2,
                "method": "tools/list"
            }
            
            response = await client.post(server_url, json=list_tools_payload, headers=request_headers)
            response.raise_for_status()
            
            # Check content type and parse accordingly
            content_type = response.headers.get("content-type", "")
            
            if "text/event-stream" in content_type:
                # Handle Server-Sent Events format
                result = None
                # Parse SSE stream - look for JSON data lines
                for line in response.text.split("\n"):
                    line = line.strip()
                    if line.startswith("data:"):
                        data_str = line[5:].strip()
                        if data_str:
                            try:
                                result = json.loads(data_str)
                                break  # Take the first valid JSON data
                            except Exception:
                                continue
                
                if result is None:
                    return {
                        "success": False,
                        "error": "Failed to parse SSE response"
                    }
            else:
                # Default to JSON parsing for other content types
                result = response.json()
            
            # Check for errors
            if "error" in result:
                return {
                    "success": False,
                    "error": f"tools/list failed: {result['error'].get('message', 'Unknown error')}"
                }
            
            # Handle different response formats
            tools = []
            if "result" in result:
                if isinstance(result["result"], dict) and "tools" in result["result"]:
                    tools = result["result"]["tools"]
                elif isinstance(result["result"], list):
                    tools = result["result"]
            
            return {
                "success": True,
                "tools": tools
            }
                
    except httpx.HTTPError as e:
        return {
            "success": False,
            "error": f"HTTP connection error: {str(e)}"
        }
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to fetch tools: {str(e)}"
        }


# ==================== MCP Endpoints ====================


@router.get("/mcps")
async def list_mcps(
    mcp_type: Optional[str] = Query(None, description="Filter by MCP type"),
    search: Optional[str] = Query(None, description="Search by name or description"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """List MCPs with filtering and pagination"""
    query = select(OpenCodeMCP)

    filters = []
    if mcp_type:
        filters.append(OpenCodeMCP.mcp_type == mcp_type)

    if search:
        filters.append(
            or_(OpenCodeMCP.name.ilike(f"%{search}%"), OpenCodeMCP.description.ilike(f"%{search}%"))
        )

    if filters:
        query = query.where(and_(*filters))

    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar()

    offset = (page - 1) * page_size
    query = query.offset(offset).limit(page_size).order_by(OpenCodeMCP.created_at.desc())

    result = await db.execute(query)
    mcps = result.scalars().all()

    return {
        "items": [mcp.to_dict() for mcp in mcps],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/mcps/{mcp_id}")
async def get_mcp(
    mcp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Get MCP details"""
    result = await db.execute(select(OpenCodeMCP).where(OpenCodeMCP.id == mcp_id))
    mcp = result.scalar_one_or_none()

    if not mcp:
        raise HTTPException(status_code=404, detail="MCP not found")

    return mcp.to_dict()


@router.post("/mcps")
async def create_mcp(
    data: MCPCreate,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Create a new MCP and fetch tools from server"""
    # Validate based on MCP type
    if data.mcp_type == MCPType.HTTP and not data.server_url:
        raise HTTPException(status_code=400, detail="server_url is required for HTTP MCP type")
    if data.mcp_type == MCPType.STDIO and not data.command:
        raise HTTPException(status_code=400, detail="command is required for stdio MCP type")

    tools = None
    
    # For HTTP MCP, try to fetch tools immediately
    if data.mcp_type == MCPType.HTTP and data.server_url:
        result = await fetch_mcp_tools(data.server_url, data.config)
        if not result["success"]:
            raise HTTPException(status_code=400, detail=f"Failed to connect to MCP server: {result['error']}")
        tools = result["tools"]

    mcp = OpenCodeMCP(
        name=data.name,
        mcp_type=data.mcp_type,
        version=data.version,
        description=data.description,
        author=getattr(current_user, "username", "unknown"),
        server_url=data.server_url,
        command=data.command,
        args=data.args,
        env=data.env,
        config=data.config,
        tools=tools,
        is_active=True,
        created_by=current_user.id if hasattr(current_user, "id") else None,
    )

    db.add(mcp)
    await db.commit()
    await db.refresh(mcp)

    # Update opencode.json config file
    update_config_mcp_entry(mcp)

    return mcp.to_dict()


@router.put("/mcps/{mcp_id}")
async def update_mcp(
    mcp_id: str,
    data: MCPUpdate,
    refresh_tools: bool = Query(False, description="Whether to refresh tools from server"),
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Update an MCP"""
    result = await db.execute(select(OpenCodeMCP).where(OpenCodeMCP.id == mcp_id))
    mcp = result.scalar_one_or_none()

    if not mcp:
        raise HTTPException(status_code=404, detail="MCP not found")

    # Capture old name before updating
    old_name = mcp.name

    # Update fields from request data
    update_data = data.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        if hasattr(mcp, key):
            setattr(mcp, key, value)

    # Refresh tools if requested and it's an HTTP MCP
    if refresh_tools and mcp.mcp_type == MCPType.HTTP and mcp.server_url:
        tool_result = await fetch_mcp_tools(mcp.server_url, mcp.config)
        if tool_result["success"]:
            mcp.tools = tool_result["tools"]
        else:
            raise HTTPException(status_code=400, detail=f"Failed to refresh tools: {tool_result['error']}")

    await db.commit()
    await db.refresh(mcp)

    # Update opencode.json config file
    update_config_mcp_entry(mcp, old_name=old_name)

    return mcp.to_dict()


@router.delete("/mcps/{mcp_id}")
async def delete_mcp(
    mcp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Delete an MCP"""
    result = await db.execute(select(OpenCodeMCP).where(OpenCodeMCP.id == mcp_id))
    mcp = result.scalar_one_or_none()

    if not mcp:
        raise HTTPException(status_code=404, detail="MCP not found")

    mcp_name = mcp.name
    # 从数据库删除记录
    await db.delete(mcp)
    await db.commit()

    # Remove from opencode.json config file
    remove_config_mcp_entry(mcp_name)

    return {"message": "MCP deleted successfully", "mcp_name": mcp_name}


@router.post("/mcps/{mcp_id}/refresh-tools")
async def refresh_mcp_tools(
    mcp_id: str,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_current_user),
):
    """Refresh tools from MCP server"""
    result = await db.execute(select(OpenCodeMCP).where(OpenCodeMCP.id == mcp_id))
    mcp = result.scalar_one_or_none()

    if not mcp:
        raise HTTPException(status_code=404, detail="MCP not found")

    if mcp.mcp_type != MCPType.HTTP or not mcp.server_url:
        raise HTTPException(status_code=400, detail="Only HTTP MCPs support tool refresh")

    tool_result = await fetch_mcp_tools(mcp.server_url, mcp.config)
    if tool_result["success"]:
        mcp.tools = tool_result["tools"]
        await db.commit()
        await db.refresh(mcp)
        return {"success": True, "tools": tool_result["tools"], "mcp": mcp.to_dict()}
    else:
        raise HTTPException(status_code=400, detail=tool_result["error"])