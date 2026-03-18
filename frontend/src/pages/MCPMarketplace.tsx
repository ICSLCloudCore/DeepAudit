// MCP Marketplace Page - Cyberpunk Terminal Aesthetic
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Server,
  Search,
  Eye,
  Plus,
  Edit2,
  Trash2,
  Save,
  Terminal,
  Globe,
  RefreshCw,
  Wrench,
} from "lucide-react";
import { opencodeApi, type OpenCodeMCP } from "@/shared/api/opencode";
import { toast } from "sonner";

interface MCPFormData {
  name: string;
  mcp_type: "stdio" | "sse" | "http";
  version: string;
  description: string;
  server_url: string;
  command: string;
  args: string;
  env: string;
  config: string;
}

const MCPMarketplace: React.FC = () => {
  const [mcps, setMcps] = useState<OpenCodeMCP[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: "",
    mcp_type: "",
  });
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditSheetOpen, setIsEditSheetOpen] = useState(false);
  const [isViewSheetOpen, setIsViewSheetOpen] = useState(false);
  const [isDeleteAlertOpen, setIsDeleteAlertOpen] = useState(false);
  const [selectedMcp, setSelectedMcp] = useState<OpenCodeMCP | null>(null);
  const [formData, setFormData] = useState<MCPFormData>({
    name: "",
    mcp_type: "http",
    version: "1.0.0",
    description: "",
    server_url: "",
    command: "",
    args: "",
    env: "",
    config: "",
  });
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [refreshingTools, setRefreshingTools] = useState<string | null>(null);

  useEffect(() => {
    loadMcps();
  }, [filters]);

  const loadMcps = async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (filters.search) params.search = filters.search;
      if (filters.mcp_type) params.mcp_type = filters.mcp_type;
      const data = await opencodeApi.listMcps(params);
      setMcps(data.items);
    } catch (error) {
      console.error("Failed to load mcps:", error);
      toast.error("加载 MCPs 失败");
    } finally {
      setLoading(false);
    }
  };


  const refreshMcpTools = async (id: string) => {
    try {
      setRefreshingTools(id);
      const result = await opencodeApi.refreshMcpTools(id);
      if (result.success) {
        toast.success(`工具刷新成功! 工具数量: ${result.tools?.length || 0}`);
        loadMcps();
      }
    } catch (error) {
      console.error("Failed to refresh MCP tools:", error);
      toast.error("工具刷新失败");
    } finally {
      setRefreshingTools(null);
    }
  };

  const handleCreateMcp = async () => {
    if (!formData.name) {
      toast.error("请输入 MCP 名称");
      return;
    }
    if (formData.mcp_type === "http" && !formData.server_url) {
      toast.error("请输入服务器 URL");
      return;
    }
    try {
      setFormSubmitting(true);
      const data: any = {
        name: formData.name,
        mcp_type: formData.mcp_type,
        version: formData.version,
        description: formData.description || undefined,
      };

      if (formData.mcp_type === "stdio") {
        data.command = formData.command || undefined;
        if (formData.args) {
          try {
            data.args = JSON.parse(formData.args);
          } catch {
            data.args = formData.args.split("\n").filter(Boolean);
          }
        }
        if (formData.env) {
          try {
            data.env = JSON.parse(formData.env);
          } catch {
            data.env = {};
          }
        }
      } else if (formData.mcp_type === "sse" || formData.mcp_type === "http") {
        data.server_url = formData.server_url || undefined;
      }

      if (formData.config) {
        try {
          data.config = JSON.parse(formData.config);
        } catch {
          data.config = {};
        }
      }

      await opencodeApi.createMcp(data);
      toast.success("MCP 创建成功!");
      setIsCreateDialogOpen(false);
      resetForm();
      loadMcps();
    } catch (error: any) {
      console.error("Failed to create MCP:", error);
      toast.error(`创建 MCP 失败: ${error.response?.data?.detail || error.message}`);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleUpdateMcp = async () => {
    if (!selectedMcp) return;
    if (!formData.name) {
      toast.error("请输入 MCP 名称");
      return;
    }
    try {
      setFormSubmitting(true);
      const data: any = {};

      if (formData.name !== selectedMcp.name) data.name = formData.name;
      if (formData.version !== selectedMcp.version) data.version = formData.version;
      if (formData.description !== selectedMcp.description) data.description = formData.description;
      if (formData.server_url !== selectedMcp.server_url) data.server_url = formData.server_url;
      if (formData.command !== selectedMcp.command) data.command = formData.command;

      if (formData.args) {
        try {
          const parsedArgs = JSON.parse(formData.args);
          data.args = parsedArgs;
        } catch {
          const splitArgs = formData.args.split("\n").filter(Boolean);
          data.args = splitArgs;
        }
      }

      if (formData.env) {
        try {
          data.env = JSON.parse(formData.env);
        } catch {
          data.env = {};
        }
      }

      if (formData.config) {
        try {
          data.config = JSON.parse(formData.config);
        } catch {
          data.config = {};
        }
      }

      await opencodeApi.updateMcp(selectedMcp.id, data);
      toast.success("MCP 更新成功!");
      setIsEditSheetOpen(false);
      resetForm();
      loadMcps();
    } catch (error: any) {
      console.error("Failed to update MCP:", error);
      toast.error(`更新 MCP 失败: ${error.response?.data?.detail || error.message}`);
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDeleteMcp = async () => {
    if (!selectedMcp) return;
    try {
      await opencodeApi.deleteMcp(selectedMcp.id);
      toast.success(`MCP "${selectedMcp.name}" 删除成功!`);
      setIsDeleteAlertOpen(false);
      setSelectedMcp(null);
      loadMcps();
    } catch (error) {
      console.error("Failed to delete MCP:", error);
      toast.error("删除 MCP 失败");
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      mcp_type: "http",
      version: "1.0.0",
      description: "",
      server_url: "",
      command: "",
      args: "",
      env: "",
      config: "",
    });
    setSelectedMcp(null);
  };

  const openCreateDialog = () => {
    resetForm();
    setIsCreateDialogOpen(true);
  };

  const openEditSheet = (mcp: OpenCodeMCP) => {
    setSelectedMcp(mcp);
    setFormData({
      name: mcp.name || "",
      mcp_type: mcp.mcp_type || "http",
      version: mcp.version || "1.0.0",
      description: mcp.description || "",
      server_url: mcp.server_url || "",
      command: mcp.command || "",
      args: mcp.args ? (Array.isArray(mcp.args) ? mcp.args.join("\n") : JSON.stringify(mcp.args, null, 2)) : "",
      env: mcp.env ? JSON.stringify(mcp.env, null, 2) : "",
      config: mcp.config ? JSON.stringify(mcp.config, null, 2) : "",
    });
    setIsEditSheetOpen(true);
  };

  const openViewSheet = (mcp: OpenCodeMCP) => {
    setSelectedMcp(mcp);
    setIsViewSheetOpen(true);
  };

  const openDeleteAlert = (mcp: OpenCodeMCP) => {
    setSelectedMcp(mcp);
    setIsDeleteAlertOpen(true);
  };

  const renderMcpForm = (isEdit: boolean = false) => (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="name" className="font-mono font-bold uppercase text-xs text-muted-foreground">MCP 名称 *</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="输入 MCP 名称"
            className="cyber-input"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="version" className="font-mono font-bold uppercase text-xs text-muted-foreground">版本</Label>
          <Input
            id="version"
            value={formData.version}
            onChange={(e) => setFormData({ ...formData, version: e.target.value })}
            placeholder="1.0.0"
            className="cyber-input"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mcp_type" className="font-mono font-bold uppercase text-xs text-muted-foreground">MCP 类型</Label>
        <Select
          value={formData.mcp_type}
          onValueChange={(value: any) => setFormData({ ...formData, mcp_type: value })}
        >
          <SelectTrigger id="mcp_type" className="cyber-input">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="cyber-dialog border-border">
            <SelectItem value="http">http (HTTP 服务器)</SelectItem>
            <SelectItem value="sse">sse (Server-Sent Events)</SelectItem>
            <SelectItem value="stdio">stdio (标准输入输出)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="description" className="font-mono font-bold uppercase text-xs text-muted-foreground">描述</Label>
        <Textarea
          id="description"
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          placeholder="// MCP 描述..."
          rows={3}
          className="cyber-input min-h-[80px]"
        />
      </div>

      {formData.mcp_type === "stdio" ? (
        <>
          <div className="space-y-1.5">
            <Label htmlFor="command" className="font-mono font-bold uppercase text-xs text-muted-foreground">命令</Label>
            <Input
              id="command"
              value={formData.command}
              onChange={(e) => setFormData({ ...formData, command: e.target.value })}
              placeholder="例如: node /path/to/server.js"
              className="cyber-input"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="args" className="font-mono font-bold uppercase text-xs text-muted-foreground">参数 (JSON 或每行一个)</Label>
            <Textarea
              id="args"
              value={formData.args}
              onChange={(e) => setFormData({ ...formData, args: e.target.value })}
              placeholder='["--arg1", "value1"] 或每行一个参数'
              rows={3}
              className="cyber-input font-mono text-sm"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="env" className="font-mono font-bold uppercase text-xs text-muted-foreground">环境变量 (JSON)</Label>
            <Textarea
              id="env"
              value={formData.env}
              onChange={(e) => setFormData({ ...formData, env: e.target.value })}
              placeholder='{"ENV_VAR": "value"}'
              rows={3}
              className="cyber-input font-mono text-sm"
            />
          </div>
        </>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="server_url" className="font-mono font-bold uppercase text-xs text-muted-foreground">服务器 URL *</Label>
          <Input
            id="server_url"
            value={formData.server_url}
            onChange={(e) => setFormData({ ...formData, server_url: e.target.value })}
            placeholder="https://example.com/mcp"
            className="cyber-input"
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="config" className="font-mono font-bold uppercase text-xs text-muted-foreground">配置 (JSON)</Label>
        <Textarea
          id="config"
          value={formData.config}
          onChange={(e) => setFormData({ ...formData, config: e.target.value })}
          placeholder='{"headers": {"Authorization": "Bearer token"}}'
          rows={3}
          className="cyber-input font-mono text-sm"
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6 p-6 cyber-bg-elevated min-h-screen font-mono relative">
      {/* Grid background */}
      <div className="absolute inset-0 cyber-grid-subtle pointer-events-none" />

      {/* Header Card */}
      <div className="cyber-card p-0 relative z-10">
        <div className="cyber-card-header">
          <Server className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">MCP 市场</h3>
          <div className="ml-auto">
            <Button
              variant="outline"
              onClick={openCreateDialog}
              className="cyber-btn-primary"
            >
              <Plus className="w-4 h-4 mr-2" />
              创建 MCP
            </Button>
          </div>
        </div>
        <div className="p-6">
          <p className="text-muted-foreground font-mono">浏览和管理 OpenCode MCPs</p>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="cyber-card p-0 relative z-10">
        <div className="p-6 space-y-6">
          {/* Filters */}
          <div className="cyber-bg-elevated border border-border p-4 rounded-lg mb-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block flex items-center gap-2">
                  <Search className="w-3 h-3" />
                  搜索
                </label>
                <Input
                  type="text"
                  placeholder="搜索 MCPs..."
                  className="cyber-input"
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
              <div className="w-full sm:w-48">
                <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block flex items-center gap-2">
                  类型
                </label>
                <Select
                  value={filters.mcp_type}
                  onValueChange={(value) => setFilters({ ...filters, mcp_type: value })}
                >
                  <SelectTrigger className="cyber-input">
                    <SelectValue placeholder="全部类型" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部类型</SelectItem>
                    <SelectItem value="stdio">stdio</SelectItem>
                    <SelectItem value="sse">sse</SelectItem>
                    <SelectItem value="http">http</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Content */}
          {loading ? (
            <div className="text-center py-12">
              <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
              <p className="text-muted-foreground font-mono">加载中...</p>
            </div>
          ) : mcps.length === 0 ? (
            <div className="empty-state">
              <Server className="empty-state-icon" />
              <p className="empty-state-title">暂无 MCPs</p>
              <p className="empty-state-description">添加您的第一个 MCP 开始使用</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {mcps.map((mcp) => (
                <div
                  key={mcp.id}
                  className="cyber-card p-4 hover:border-primary transition-all group"
                >
                  <div className="flex justify-between items-start mb-3 pb-3 border-b border-border">
                    <div className="flex items-start space-x-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-violet-400 bg-violet-500/20">
                        {mcp.mcp_type === "stdio" ? (
                          <Terminal className="w-4 h-4" />
                        ) : mcp.mcp_type === "sse" || mcp.mcp_type === "http" ? (
                          <Globe className="w-4 h-4" />
                        ) : (
                          <Server className="w-4 h-4" />
                        )}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-base text-foreground mb-1 group-hover:text-primary transition-colors uppercase">{mcp.name}</h4>
                        <div className="flex items-center space-x-1 text-xs text-muted-foreground font-mono">
                          <span className="text-primary">{`>`}</span>
                          <span>v{mcp.version}</span>
                        </div>
                      </div>
                    </div>
                    <Badge className="cyber-badge-muted">
                      {mcp.mcp_type}
                    </Badge>
                  </div>

                  <div className="space-y-3">
                    <p className="text-muted-foreground text-sm line-clamp-2">
                      {mcp.description || "暂无描述"}
                    </p>
                    
                    {/* Tools display */}
                    {mcp.tools && mcp.tools.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono">
                          <Wrench className="w-3 h-3" />
                          <span>工具 ({mcp.tools.length})</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {mcp.tools.slice(0, 3).map((tool: any, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs px-2 py-0.5">
                              {tool.name}
                            </Badge>
                          ))}
                          {mcp.tools.length > 3 && (
                            <Badge variant="outline" className="text-xs px-2 py-0.5">
                              +{mcp.tools.length - 3}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}
                    
                    <div className="flex justify-between items-center">
                      <div className="text-xs text-muted-foreground font-mono">
                        作者: {mcp.author}
                      </div>
                      <div className="flex gap-1">
                        {mcp.mcp_type === "http" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs cyber-btn-ghost text-green-400 hover:text-green-300 hover:bg-green-500/10"
                            onClick={() => refreshMcpTools(mcp.id)}
                            disabled={refreshingTools === mcp.id}
                          >
                            <RefreshCw className={`w-3 h-3 mr-1 ${refreshingTools === mcp.id ? 'animate-spin' : ''}`} />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs cyber-btn-ghost"
                          onClick={() => openViewSheet(mcp)}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs cyber-btn-ghost text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                          onClick={() => openEditSheet(mcp)}
                        >
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs cyber-btn-ghost text-red-400 hover:text-red-300 hover:bg-red-500/10"
                          onClick={() => openDeleteAlert(mcp)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create MCP Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="!w-[min(90vw,700px)] !max-w-none max-h-[85vh] flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg overflow-hidden">
          {/* Terminal Header */}
          <div className="flex items-center gap-2 px-4 py-3 cyber-bg-elevated border-b border-border flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="ml-2 font-mono text-xs text-muted-foreground tracking-wider">
              create_mcp@godeepaudit
            </span>
          </div>

          <DialogHeader className="px-6 pt-4 flex-shrink-0">
            <DialogTitle className="font-mono text-lg uppercase tracking-wider flex items-center gap-2 text-foreground">
              <Terminal className="w-5 h-5 text-primary" />
              创建新 MCP
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6">
            <div className="py-4">
              {renderMcpForm()}
            </div>
          </div>

          <DialogFooter className="px-6 pb-6 pt-4 border-t border-border flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsCreateDialogOpen(false)}
              disabled={formSubmitting}
              className="cyber-btn-outline"
            >
              取消
            </Button>
            <Button
              onClick={handleCreateMcp}
              disabled={formSubmitting}
              className="cyber-btn-primary"
            >
              {formSubmitting ? (
                <>
                  <div className="loading-spinner w-4 h-4 mr-2"></div>
                  创建中...
                </>
              ) : (
                "创建"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit MCP Dialog */}
      <Dialog open={isEditSheetOpen} onOpenChange={setIsEditSheetOpen}>
        <DialogContent className="!w-[min(90vw,700px)] !max-w-none max-h-[85vh] flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg overflow-hidden">
          {/* Terminal Header */}
          <div className="flex items-center gap-2 px-4 py-3 cyber-bg-elevated border-b border-border flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="ml-2 font-mono text-xs text-muted-foreground tracking-wider">
              edit_mcp@godeepaudit
            </span>
          </div>

          <DialogHeader className="px-6 pt-4 flex-shrink-0">
            <DialogTitle className="font-mono text-lg uppercase tracking-wider flex items-center gap-2 text-foreground">
              <Edit2 className="w-5 h-5 text-primary" />
              编辑 MCP
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6">
            <div className="py-4">
              {renderMcpForm(true)}
            </div>
          </div>

          <DialogFooter className="px-6 pb-6 pt-4 border-t border-border flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsEditSheetOpen(false)}
              disabled={formSubmitting}
              className="cyber-btn-outline"
            >
              取消
            </Button>
            <Button
              onClick={handleUpdateMcp}
              disabled={formSubmitting}
              className="cyber-btn-primary"
            >
              {formSubmitting ? (
                <>
                  <div className="loading-spinner w-4 h-4 mr-2"></div>
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  保存
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View MCP Dialog */}
      <Dialog open={isViewSheetOpen} onOpenChange={setIsViewSheetOpen}>
        <DialogContent className="!w-[min(90vw,700px)] !max-w-none max-h-[85vh] flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg overflow-hidden">
          {/* Terminal Header */}
          <div className="flex items-center gap-2 px-4 py-3 cyber-bg-elevated border-b border-border flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="ml-2 font-mono text-xs text-muted-foreground tracking-wider">
              view_mcp@godeepaudit
            </span>
          </div>

          <DialogHeader className="px-6 pt-4 flex-shrink-0">
            <DialogTitle className="font-mono text-lg uppercase tracking-wider flex items-center gap-2 text-foreground">
              <Eye className="w-5 h-5 text-primary" />
              MCP 详情
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6">
            <div className="py-4 space-y-6">
              {selectedMcp && (
                <>
                  <div className="space-y-5">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="view-name" className="font-mono font-bold uppercase text-xs text-muted-foreground">MCP 名称</Label>
                        <Input
                          id="view-name"
                          value={selectedMcp.name}
                          readOnly
                          className="cyber-input bg-muted/50"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="view-version" className="font-mono font-bold uppercase text-xs text-muted-foreground">版本</Label>
                        <Input
                          id="view-version"
                          value={`v${selectedMcp.version}`}
                          readOnly
                          className="cyber-input bg-muted/50"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="view-type" className="font-mono font-bold uppercase text-xs text-muted-foreground">MCP 类型</Label>
                      <div className="cyber-input bg-muted/50 h-10 px-3 flex items-center">
                        <Badge className="cyber-badge-muted">{selectedMcp.mcp_type}</Badge>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="view-description" className="font-mono font-bold uppercase text-xs text-muted-foreground">描述</Label>
                      <Textarea
                        id="view-description"
                        value={selectedMcp.description || "暂无描述"}
                        readOnly
                        rows={3}
                        className="cyber-input min-h-[80px] bg-muted/50"
                      />
                    </div>

                    {selectedMcp.mcp_type === "stdio" ? (
                      <>
                        <div className="space-y-1.5">
                          <Label htmlFor="view-command" className="font-mono font-bold uppercase text-xs text-muted-foreground">命令</Label>
                          <Input
                            id="view-command"
                            value={selectedMcp.command || "未设置"}
                            readOnly
                            className="cyber-input bg-muted/50"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="view-args" className="font-mono font-bold uppercase text-xs text-muted-foreground">参数</Label>
                          <Textarea
                            id="view-args"
                            value={
                              selectedMcp.args
                                ? typeof selectedMcp.args === "string"
                                  ? selectedMcp.args
                                  : JSON.stringify(selectedMcp.args, null, 2)
                                : "未设置"
                            }
                            readOnly
                            rows={3}
                            className="cyber-input font-mono text-sm bg-muted/50"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <Label htmlFor="view-env" className="font-mono font-bold uppercase text-xs text-muted-foreground">环境变量</Label>
                          <Textarea
                            id="view-env"
                            value={selectedMcp.env ? JSON.stringify(selectedMcp.env, null, 2) : "未设置"}
                            readOnly
                            rows={3}
                            className="cyber-input font-mono text-sm bg-muted/50"
                          />
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1.5">
                        <Label htmlFor="view-server-url" className="font-mono font-bold uppercase text-xs text-muted-foreground">服务器 URL</Label>
                        <Input
                          id="view-server-url"
                          value={selectedMcp.server_url || "未设置"}
                          readOnly
                          className="cyber-input bg-muted/50"
                        />
                      </div>
                    )}

                    <div className="space-y-1.5">
                      <Label htmlFor="view-config" className="font-mono font-bold uppercase text-xs text-muted-foreground">配置</Label>
                      <Textarea
                        id="view-config"
                        value={selectedMcp.config ? JSON.stringify(selectedMcp.config, null, 2) : "未设置"}
                        readOnly
                        rows={3}
                        className="cyber-input font-mono text-sm bg-muted/50"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label className="font-mono font-bold uppercase text-xs text-muted-foreground">作者</Label>
                      <Input
                        value={selectedMcp.author}
                        readOnly
                        className="cyber-input bg-muted/50"
                      />
                    </div>
                  </div>

                  {/* Tools section */}
                  {selectedMcp.tools && selectedMcp.tools.length > 0 && (
                    <div className="border-t border-border pt-4 space-y-4">
                      <h4 className="text-sm font-bold uppercase text-muted-foreground flex items-center gap-2">
                        <Wrench className="w-4 h-4" />
                        工具列表 ({selectedMcp.tools.length})
                      </h4>
                      <div className="space-y-3">
                        {selectedMcp.tools.map((tool: any, idx: number) => (
                          <div key={idx} className="p-3 bg-background border border-border rounded-lg">
                            <div className="font-mono text-sm font-bold text-foreground">{tool.name}</div>
                            {tool.description && (
                              <div className="text-sm text-muted-foreground mt-1">{tool.description}</div>
                            )}
                            {tool.inputSchema && (
                              <details className="mt-2">
                                <summary className="text-xs text-muted-foreground cursor-pointer">输入参数</summary>
                                <pre className="mt-2 p-2 bg-muted rounded text-xs font-mono overflow-x-auto">
                                  {JSON.stringify(tool.inputSchema, null, 2)}
                                </pre>
                              </details>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="border-t border-border pt-4 space-y-2">
                    <div className="text-xs text-muted-foreground">
                      <p>ID: <span className="font-mono">{selectedMcp.id}</span></p>
                      <p>创建时间: <span className="font-mono">{selectedMcp.created_at}</span></p>
                      {selectedMcp.updated_at && (
                        <p>更新时间: <span className="font-mono">{selectedMcp.updated_at}</span></p>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <DialogFooter className="px-6 pb-6 pt-4 border-t border-border flex-shrink-0">
            <Button
              variant="outline"
              onClick={() => setIsViewSheetOpen(false)}
              className="cyber-btn-outline"
            >
              关闭
            </Button>
            {selectedMcp && (
              <Button
                onClick={() => {
                  setIsViewSheetOpen(false);
                  openEditSheet(selectedMcp);
                }}
                className="cyber-btn-primary"
              >
                <Edit2 className="w-4 h-4 mr-2" />
                编辑
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={isDeleteAlertOpen} onOpenChange={setIsDeleteAlertOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              您确定要删除 MCP "{selectedMcp?.name}" 吗？此操作无法撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteMcp}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MCPMarketplace;