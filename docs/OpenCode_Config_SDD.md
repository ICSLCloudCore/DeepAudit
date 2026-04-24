# OpenCode 配置管理 - 软件设计文档 (SDD)

**版本**: 2.0  
**日期**: 2026-04-24  
**作者**: DeepAudit Team

---

## 1. 概述

### 1.1 项目背景

DeepAudit 是一个 AI 驱动的智能安全代码审计平台。为了增强其 OpenCode 集成能力，需要提供一个用户友好的配置管理界面，用于管理 OpenCode 相关的模型配置。

### 1.2 功能目标

- 在左侧菜单新增 "Models" 页面入口
- 支持对 `~/.config/opencode/opencode.json` 配置文件的完整管理
- 提供可视化表单编辑和原始 JSON 编辑两种模式
- 支持供应商和模型一起配置（包含 API Key、Base URL、模型列表）
- 支持设置默认模型和默认供应商
- API Key 等敏感信息在前端显示时进行脱敏处理
- 保留现有 mcp 配置不受影响

### 1.3 范围

本文档涵盖 OpenCode 配置管理功能的前端和后端设计、实现和测试。

---

## 2. 系统架构

### 2.1 总体架构

```
┌─────────────────────────────────────────────────────────┐
│                     前端 (React)                         │
│  ┌──────────────────┐  ┌──────────────────────────┐    │
│  │  ModelManager    │  │  API 层 (opencodeConfig) │    │
│  │  页面组件        │  │  (api/opencodeConfig.ts) │    │
│  └────────┬─────────┘  └─────────────┬────────────┘    │
│           │                          │                  │
│  ┌────────▼─────────┐  ┌─────────────▼────────────┐    │
│  │  Sidebar 侧边栏  │  │  路由 (routes.tsx)       │    │
│  └──────────────────┘  └──────────────────────────┘    │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP/REST API
┌──────────────────────▼──────────────────────────────────┐
│                   后端 (FastAPI)                         │
│  ┌──────────────────────────────────────────────────┐  │
│  │  API 端点: /api/v1/opencode-config               │  │
│  │  (system/opencode_config.py)                     │  │
│  └──────────────────────┬───────────────────────────┘  │
│                         │                              │
│  ┌──────────────────────▼───────────────────────────┐  │
│  │  文件系统: ~/.config/opencode/opencode.json      │  │
│  └──────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 3. 数据模型

### 3.1 opencode.json 配置格式

```json
{
  "model": "gpt-4",
  "provider": "openai",
  "providers": {
    "openai": {
      "api_key": "sk-...",
      "base_url": "https://api.openai.com/v1",
      "models": ["gpt-4", "gpt-3.5-turbo", "gpt-4o"]
    },
    "anthropic": {
      "api_key": "sk-ant-...",
      "base_url": "https://api.anthropic.com/v1",
      "models": ["claude-3-opus-20240229", "claude-3-sonnet-20240229"]
    }
  },
  "mcp": {
    "existing-mcp": {
      "type": "remote",
      "url": "...",
      "enabled": true
    }
  }
}
```

### 3.2 前端 TypeScript 类型定义

**文件**: `frontend/src/shared/api/opencodeConfig.ts`

```typescript
export interface ProviderConfig {
  api_key: string;
  base_url?: string;
  models: string[];
}

export interface OpenCodeConfig {
  model: string;
  provider: string;
  providers: Record<string, ProviderConfig>;
  mcp?: Record<string, any>;
}

export interface OpenCodeConfigResponse {
  success: boolean;
  config?: OpenCodeConfig;
  raw?: string;
  error?: string;
}
```

### 3.3 后端 Pydantic 模型定义

**文件**: `backend/app/schemas/opencode_config.py`

```python
from typing import Dict, List, Optional
from pydantic import BaseModel, Field


class ProviderConfig(BaseModel):
    """Provider 配置模型"""
    api_key: str = Field(..., description="API Key")
    base_url: Optional[str] = Field(None, description="Base URL")
    models: List[str] = Field(default_factory=list, description="模型列表")


class OpenCodeConfig(BaseModel):
    """OpenCode 配置模型"""
    model: str = Field(default="", description="默认模型")
    provider: str = Field(default="", description="默认 provider")
    providers: Dict[str, ProviderConfig] = Field(default_factory=dict, description="所有 provider 配置")
    mcp: Optional[Dict] = Field(default_factory=dict, description="MCP 配置（保留）")


class OpenCodeConfigResponse(BaseModel):
    """OpenCode 配置响应"""
    success: bool
    config: Optional[OpenCodeConfig] = None
    raw: Optional[str] = None
    error: Optional[str] = None


class RawConfigUpdate(BaseModel):
    """原始 JSON 配置更新"""
    raw: str = Field(..., description="原始 JSON 配置字符串")
```

---

## 4. API 设计

### 4.1 API 端点概览

| 方法 | 路径 | 描述 |
|------|------|------|
| GET | `/api/v1/opencode-config` | 获取配置（解析后，API Key 脱敏） |
| PUT | `/api/v1/opencode-config` | 更新配置（完整配置对象） |
| GET | `/api/v1/opencode-config/raw` | 获取原始 JSON 配置 |
| PUT | `/api/v1/opencode-config/raw` | 更新原始 JSON 配置 |

### 4.2 详细 API 设计

#### 4.2.1 获取配置

**请求**:

```http
GET /api/v1/opencode-config
```

**响应**:

```json
{
  "success": true,
  "config": {
    "model": "gpt-4",
    "provider": "openai",
    "providers": {
      "openai": {
        "api_key": "sk-...",
        "base_url": "https://api.openai.com/v1",
        "models": ["gpt-4", "gpt-3.5-turbo"]
      }
    },
    "mcp": {}
  }
}
```

#### 4.2.2 更新配置

**请求**:

```http
PUT /api/v1/opencode-config
Content-Type: application/json

{
  "model": "claude-3-opus",
  "provider": "anthropic",
  "providers": {
    "anthropic": {
      "api_key": "sk-ant-...",
      "base_url": "https://api.anthropic.com/v1",
      "models": ["claude-3-opus"]
    }
  },
  "mcp": {}
}
```

**响应**:

```json
{
  "success": true,
  "config": {...}
}
```

---

## 5. 后端实现

### 5.1 文件结构

```
backend/
├── app/
│   ├── api/
│   │   └── v1/
│   │       ├── endpoints/
│   │       │   └── system/
│   │       │       └── opencode_config.py  [新增]
│   │       └── api.py                     [更新]
│   └── schemas/
│       └── opencode_config.py              [新增]
```

### 5.2 API 端点实现

**文件**: `backend/app/api/v1/endpoints/system/opencode_config.py`

参考 config.py 的风格，实现简洁的 API：

```python
"""OpenCode 配置 API 端点"""

from typing import Any
from pathlib import Path
from fastapi import APIRouter
import json

from app.utils.log import logger
from app.schemas.opencode_config import (
    OpenCodeConfig,
    OpenCodeConfigResponse,
    RawConfigUpdate
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
    return {
        "model": "",
        "provider": "",
        "providers": {},
        "mcp": {}
    }


def write_opencode_config(config: dict):
    """写入配置到 opencode.json"""
    config_path = get_opencode_config_path()
    with open(config_path, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2, ensure_ascii=False)


def mask_api_key(config: dict) -> dict:
    """脱敏显示 API Key"""
    masked = config.copy()
    if "providers" in masked:
        for provider_id, provider_config in masked["providers"].items():
            if "api_key" in provider_config and provider_config["api_key"]:
                key = provider_config["api_key"]
                if len(key) > 8:
                    masked["providers"][provider_id]["api_key"] = key[:8] + "..."
                else:
                    masked["providers"][provider_id]["api_key"] = "***"
    return masked


@router.get("", response_model=OpenCodeConfigResponse)
async def get_config() -> Any:
    """获取 OpenCode 配置（API Key 脱敏）"""
    try:
        config = read_opencode_config()
        masked_config = mask_api_key(config)
        return OpenCodeConfigResponse(
            success=True,
            config=OpenCodeConfig(**masked_config)
        )
    except Exception as e:
        logger.error(f"[OpenCodeConfig] 获取配置失败: {e}")
        return OpenCodeConfigResponse(
            success=False,
            error=str(e)
        )


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
        
        return OpenCodeConfigResponse(
            success=True,
            config=OpenCodeConfig(**masked_config)
        )
    except Exception as e:
        logger.error(f"[OpenCodeConfig] 更新配置失败: {e}")
        return OpenCodeConfigResponse(
            success=False,
            error=str(e)
        )


@router.get("/raw", response_model=OpenCodeConfigResponse)
async def get_raw_config() -> Any:
    """获取原始 OpenCode 配置 JSON（API Key 脱敏）"""
    try:
        config = read_opencode_config()
        masked_config = mask_api_key(config)
        raw = json.dumps(masked_config, indent=2, ensure_ascii=False)
        return OpenCodeConfigResponse(
            success=True,
            raw=raw
        )
    except Exception as e:
        logger.error(f"[OpenCodeConfig] 获取原始配置失败: {e}")
        return OpenCodeConfigResponse(
            success=False,
            error=str(e)
        )


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
        masked_config = mask_api_key(config_dict)
        
        return OpenCodeConfigResponse(
            success=True,
            config=OpenCodeConfig(**masked_config)
        )
    except json.JSONDecodeError as e:
        return OpenCodeConfigResponse(
            success=False,
            error=f"JSON 格式错误: {e}"
        )
    except Exception as e:
        logger.error(f"[OpenCodeConfig] 更新原始配置失败: {e}")
        return OpenCodeConfigResponse(
            success=False,
            error=str(e)
        )
```

### 5.3 路由注册更新

**文件**: `backend/app/api/v1/endpoints/__init__.py`

```python
# 向后兼容的导出

class _RouterWrapper:
    def __init__(self, router):
        self.router = router

from .system.config import router as config_router
from .system.opencode_config import router as opencode_config_router

config = _RouterWrapper(config_router)
opencode_config = _RouterWrapper(opencode_config_router)

__all__ = [
    # ... 其他导出
    "opencode_config"
]
```

**文件**: `backend/app/api/v1/api.py`

```python
from fastapi import APIRouter
from app.api.v1.endpoints import opencode_config

api_router = APIRouter()
api_router.include_router(opencode_config.router, prefix="/opencode-config", tags=["opencode-config"])
```

---

## 6. 前端实现

### 6.1 文件结构

```
frontend/src/
├── pages/
│   └── ModelManager.tsx               [新增]
├── app/
│   └── routes.tsx                     [更新]
├── components/layout/
│   └── Sidebar.tsx                    [更新]
└── shared/api/
    └── opencodeConfig.ts              [新增]
```

### 6.2 API 层实现

**文件**: `frontend/src/shared/api/opencodeConfig.ts`

```typescript
import { apiClient } from './serverClient';

export interface ProviderConfig {
  api_key: string;
  base_url?: string;
  models: string[];
}

export interface OpenCodeConfig {
  model: string;
  provider: string;
  providers: Record<string, ProviderConfig>;
  mcp?: Record<string, any>;
}

export interface OpenCodeConfigResponse {
  success: boolean;
  config?: OpenCodeConfig;
  raw?: string;
  error?: string;
}

// 获取配置
export async function getOpenCodeConfig(): Promise<OpenCodeConfigResponse> {
  const response = await apiClient.get('/opencode-config');
  return response.data;
}

// 更新配置
export async function updateOpenCodeConfig(config: OpenCodeConfig): Promise<OpenCodeConfigResponse> {
  const response = await apiClient.put('/opencode-config', config);
  return response.data;
}

// 获取原始配置
export async function getRawOpenCodeConfig(): Promise<OpenCodeConfigResponse> {
  const response = await apiClient.get('/opencode-config/raw');
  return response.data;
}

// 更新原始配置
export async function updateRawOpenCodeConfig(raw: string): Promise<OpenCodeConfigResponse> {
  const response = await apiClient.put('/opencode-config/raw', { raw });
  return response.data;
}
```

### 6.3 主页面实现

**文件**: `frontend/src/pages/ModelManager.tsx`

参考 PromptManager 的风格，实现简洁的界面：

```tsx
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { RefreshCw, Save, Settings, Cpu, CheckCircle2, Plus, Edit, Trash2 } from 'lucide-react';
import {
  getOpenCodeConfig,
  updateOpenCodeConfig,
  getRawOpenCodeConfig,
  updateRawOpenCodeConfig,
  type OpenCodeConfig,
  type ProviderConfig
} from '@/shared/api/opencodeConfig';

export default function ModelManager() {
  const [config, setConfig] = useState<OpenCodeConfig | null>(null);
  const [rawConfig, setRawConfig] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('visual');
  
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [providerForm, setProviderForm] = useState({
    id: '',
    api_key: '',
    base_url: '',
    models: ''
  });

  const loadConfig = async () => {
    try {
      setLoading(true);
      const [configRes, rawRes] = await Promise.all([
        getOpenCodeConfig(),
        getRawOpenCodeConfig()
      ]);
      
      if (configRes.success && configRes.config) {
        setConfig(configRes.config);
      }
      if (rawRes.success && rawRes.raw) {
        setRawConfig(rawRes.raw);
      }
    } catch (error) {
      toast.error('加载配置失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSaveVisual = async () => {
    if (!config) return;
    try {
      setSaving(true);
      const res = await updateOpenCodeConfig(config);
      if (res.success) {
        toast.success('配置保存成功');
        loadConfig();
      } else {
        toast.error(res.error || '保存失败');
      }
    } catch (error) {
      toast.error('保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRaw = async () => {
    try {
      setSaving(true);
      const res = await updateRawOpenCodeConfig(rawConfig);
      if (res.success) {
        toast.success('配置保存成功');
        loadConfig();
      } else {
        toast.error(res.error || '保存失败');
      }
    } catch (error) {
      toast.error('保存配置失败');
    } finally {
      setSaving(false);
    }
  };

  const openAddProvider = () => {
    setProviderForm({
      id: '',
      api_key: '',
      base_url: '',
      models: ''
    });
    setEditingProvider(null);
    setShowProviderDialog(true);
  };

  const openEditProvider = (providerId: string, providerConfig: ProviderConfig) => {
    setProviderForm({
      id: providerId,
      api_key: providerConfig.api_key,
      base_url: providerConfig.base_url || '',
      models: providerConfig.models.join(', ')
    });
    setEditingProvider(providerId);
    setShowProviderDialog(true);
  };

  const handleSaveProvider = () => {
    if (!config) return;
    
    const modelList = providerForm.models.split(',')
      .map(m => m.trim())
      .filter(m => m);
    
    const newProviders = { ...config.providers };
    
    if (editingProvider && editingProvider !== providerForm.id) {
      delete newProviders[editingProvider];
    }
    
    newProviders[providerForm.id] = {
      api_key: providerForm.api_key,
      base_url: providerForm.base_url || undefined,
      models: modelList
    };
    
    setConfig({
      ...config,
      providers: newProviders
    });
    
    setShowProviderDialog(false);
  };

  const handleDeleteProvider = (providerId: string) => {
    if (!config) return;
    if (!confirm(`确定要删除供应商 "${providerId}" 吗？`)) return;
    
    const newProviders = { ...config.providers };
    delete newProviders[providerId];
    
    let newModel = config.model;
    let newProvider = config.provider;
    
    if (config.provider === providerId) {
      newProvider = '';
      newModel = '';
    }
    
    setConfig({
      ...config,
      provider: newProvider,
      model: newModel,
      providers: newProviders
    });
  };

  const handleSetDefaultModel = (providerId: string, modelName: string) => {
    if (!config) return;
    setConfig({
      ...config,
      provider: providerId,
      model: modelName
    });
  };

  const handleSetDefaultProvider = (providerId: string) => {
    if (!config) return;
    const providerConfig = config.providers[providerId];
    setConfig({
      ...config,
      provider: providerId,
      model: providerConfig.models[0] || ''
    });
  };

  const providerCount = Object.keys(config?.providers || {}).length;
  const modelCount = Object.values(config?.providers || {}).reduce(
    (sum, p) => sum + p.models.length,
    0
  );
  const currentDefaultModel = config?.model ? `${config.provider}/${config.model}` : '未设置';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen cyber-bg-elevated">
        <div className="text-center space-y-4">
          <div className="loading-spinner mx-auto" />
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">加载中...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 cyber-bg-elevated min-h-screen font-mono relative">
      <div className="absolute inset-0 cyber-grid-subtle pointer-events-none" />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
        <Card className="cyber-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">供应商数量</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{providerCount}</div>
          </CardContent>
        </Card>
        
        <Card className="cyber-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">模型总数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-400">{modelCount}</div>
          </CardContent>
        </Card>
        
        <Card className="cyber-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">当前默认模型</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-amber-400">{currentDefaultModel}</div>
          </CardContent>
        </Card>
      </div>

      <div className="cyber-card p-4 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">OpenCode 配置管理</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              onClick={loadConfig} 
              className="cyber-btn-outline"
              disabled={saving}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新
            </Button>
            <Button 
              onClick={activeTab === 'visual' ? handleSaveVisual : handleSaveRaw}
              className="cyber-btn-primary"
              disabled={saving}
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  保存配置
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="relative z-10">
        <TabsList className="bg-muted border border-border p-1 h-auto gap-1 rounded">
          <TabsTrigger value="visual" className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs">
            可视化编辑
          </TabsTrigger>
          <TabsTrigger value="raw" className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs">
            原始 JSON
          </TabsTrigger>
        </TabsList>

        <TabsContent value="visual" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Button onClick={openAddProvider} className="cyber-btn-primary">
              <Plus className="w-4 h-4 mr-2" />
              添加供应商
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(config?.providers || {}).map(([providerId, providerConfig]) => {
              const isDefaultProvider = config?.provider === providerId;
              
              return (
                <Card key={providerId} className="cyber-card overflow-hidden">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-primary" />
                        <CardTitle className="text-base">{providerId}</CardTitle>
                      </div>
                      {isDefaultProvider && (
                        <Badge className="cyber-badge-success">默认供应商</Badge>
                      )}
                    </div>
                  </CardHeader>
                  
                  <CardContent className="pt-4 space-y-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">API Key</Label>
                      <div className="text-sm text-foreground font-mono truncate">
                        {providerConfig.api_key}
                      </div>
                    </div>
                    
                    {providerConfig.base_url && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Base URL</Label>
                        <div className="text-sm text-foreground font-mono truncate">
                          {providerConfig.base_url}
                        </div>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">模型列表</Label>
                      <div className="flex flex-wrap gap-2">
                        {providerConfig.models.map((modelName) => {
                          const isDefaultModel = isDefaultProvider && config?.model === modelName;
                          return (
                            <Badge 
                              key={modelName}
                              className={`${isDefaultModel ? 'cyber-badge-success' : 'cyber-badge-muted'} cursor-pointer`}
                              onClick={() => handleSetDefaultModel(providerId, modelName)}
                            >
                              {modelName}
                              {isDefaultModel && <CheckCircle2 className="w-3 h-3 ml-1" />}
                            </Badge>
                          );
                        })}
                        {providerConfig.models.length === 0 && (
                          <span className="text-xs text-muted-foreground">暂无模型</span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      {!isDefaultProvider && (
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleSetDefaultProvider(providerId)}
                          className="flex-1 h-8 cyber-btn-ghost"
                        >
                          设为默认
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => openEditProvider(providerId, providerConfig)}
                        className="flex-1 h-8 cyber-btn-ghost"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        编辑
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => handleDeleteProvider(providerId)}
                        className="h-8 px-2 hover:bg-rose-500/20 hover:text-rose-400"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            
            {Object.keys(config?.providers || {}).length === 0 && (
              <div className="col-span-full cyber-card p-12">
                <div className="empty-state">
                  <Cpu className="empty-state-icon" />
                  <p className="empty-state-title">暂无供应商</p>
                  <p className="empty-state-description">点击"添加供应商"开始配置</p>
                  <Button 
                    onClick={openAddProvider} 
                    className="cyber-btn-primary h-12 px-8 mt-6"
                  >
                    <Plus className="w-5 h-5 mr-2" />
                    添加供应商
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        <TabsContent value="raw" className="mt-6">
          <Card className="cyber-card">
            <CardContent className="pt-6">
              <Textarea
                value={rawConfig}
                onChange={(e) => setRawConfig(e.target.value)}
                className="font-mono text-sm min-h-[500px] cyber-input"
                placeholder="输入 JSON 配置..."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showProviderDialog} onOpenChange={setShowProviderDialog}>
        <DialogContent className="!w-[min(90vw,600px)] !max-w-none cyber-dialog border border-border rounded-lg">
          <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
            <DialogTitle className="flex items-center gap-3 font-mono text-foreground">
              <div className="p-2 bg-primary/20 rounded border border-primary/30">
                <Settings className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="text-base font-bold uppercase tracking-wider">
                  {editingProvider ? '编辑供应商' : '添加供应商'}
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>
          
          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">供应商 ID *</Label>
              <Input
                value={providerForm.id}
                onChange={(e) => setProviderForm({ ...providerForm, id: e.target.value })}
                placeholder="例如: openai, anthropic, qwen"
                className="cyber-input"
                disabled={!!editingProvider}
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">API Key *</Label>
              <Input
                value={providerForm.api_key}
                onChange={(e) => setProviderForm({ ...providerForm, api_key: e.target.value })}
                placeholder="输入 API Key"
                className="cyber-input"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Base URL</Label>
              <Input
                value={providerForm.base_url}
                onChange={(e) => setProviderForm({ ...providerForm, base_url: e.target.value })}
                placeholder="例如: https://api.openai.com/v1"
                className="cyber-input"
              />
            </div>
            
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">模型列表 (逗号分隔)</Label>
              <Input
                value={providerForm.models}
                onChange={(e) => setProviderForm({ ...providerForm, models: e.target.value })}
                placeholder="例如: gpt-4, gpt-3.5-turbo, gpt-4o"
                className="cyber-input"
              />
            </div>
          </div>
          
          <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
            <Button variant="outline" onClick={() => setShowProviderDialog(false)} className="cyber-btn-outline">
              取消
            </Button>
            <Button onClick={handleSaveProvider} className="cyber-btn-primary">
              {editingProvider ? '更新' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

---

## 7. 路由和侧边栏更新

### 7.1 路由配置更新

**文件**: `frontend/src/app/routes.tsx`

```typescript
import ModelManager from '@/pages/ModelManager';

const routes: RouteConfig[] = [
  // ... 现有路由
  {
    name: "Models",
    path: "/models",
    element: <ModelManager />,
    visible: true
  }
];
```

### 7.2 侧边栏更新

**文件**: `frontend/src/components/layout/Sidebar.tsx`

```typescript
import { Cpu } from 'lucide-react';

const routeIcons: Record<string, React.ReactNode> = {
  // ... 现有图标
  '/models': <Cpu className="w-[18px] h-[18px]" />
};
```

---

## 8. 安全考虑

### 8.1 敏感信息处理

- API Key 在前端显示时进行脱敏（显示前 8 位 + "..."）
- 不在日志中输出完整的 API Key
- 配置文件权限设置为用户只读

### 8.2 输入验证

- 验证 JSON 格式正确性
- 保留现有 mcp 配置不被覆盖

### 8.3 文件操作

- 确保配置目录存在且权限正确
- 异常处理和错误恢复
- 避免配置文件损坏

---

## 9. 测试计划

### 9.1 单元测试

- 配置读写函数测试
- API Key 脱敏函数测试
- API 端点测试

### 9.2 集成测试

- 端到端配置编辑流程测试
- 可视化编辑和原始 JSON 编辑切换测试
- mcp 配置保留测试

### 9.3 UI 测试

- 页面加载和渲染测试
- 交互功能测试
- 错误提示测试

---

## 10. 部署说明

### 10.1 后端部署

1. 将新文件添加到项目
2. 更新路由注册
3. 重启后端服务

### 10.2 前端部署

1. 将新文件添加到项目
2. 构建前端
3. 部署更新

---

## 11. 附录

### 11.1 常用供应商配置示例

**OpenAI**:

```json
{
  "api_key": "sk-...",
  "base_url": "https://api.openai.com/v1",
  "models": ["gpt-4", "gpt-3.5-turbo", "gpt-4o"]
}
```

**Anthropic**:

```json
{
  "api_key": "sk-ant-...",
  "base_url": "https://api.anthropic.com/v1",
  "models": ["claude-3-opus-20240229", "claude-3-sonnet-20240229"]
}
```

**Qwen (通义千问)**:

```json
{
  "api_key": "...",
  "base_url": "https://dashscope.aliyuncs.com/compatible-mode/v1",
  "models": ["qwen-max", "qwen-plus"]
}
```

**DeepSeek**:

```json
{
  "api_key": "sk-...",
  "base_url": "https://api.deepseek.com/v1",
  "models": ["deepseek-chat", "deepseek-coder"]
}
```

---

**文档结束**
