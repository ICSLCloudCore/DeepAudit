/**
 * Agent Management Page
 * Cyberpunk Terminal Aesthetic
 */

import React, { useState, useEffect, useRef } from "react";
import { agentApi, type Agent } from "@/shared/api/opencode";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Upload,
  Plus,
  Search,
  FileText,
  Trash2,
  Eye,
  Power,
  Bot,
  Cpu,
  Code,
  Clock,
  FolderOpen
} from "lucide-react";
import { toast } from "sonner";

interface AgentFile {
  filename: string;
  file_size: number;
  created_at: number;
  updated_at: number;
}

export default function AgentManagement() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [agentFiles, setAgentFiles] = useState<AgentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [filters, setFilters] = useState({
    agent_type: "all",
    is_active: undefined as boolean | undefined,
    search: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadAgents();
    loadAgentFiles();
  }, [filters]);

  const loadAgents = async () => {
    try {
      setLoading(true);
      const data = await agentApi.list(filters);
      setAgents(data.items);
    } catch (error) {
      console.error("Failed to load agents:", error);
      toast.error("加载 Agent 列表失败");
    } finally {
      setLoading(false);
    }
  };

  const loadAgentFiles = async () => {
    try {
      setLoadingFiles(true);
      const data = await agentApi.listFiles();
      setAgentFiles(data.files);
    } catch (error) {
      console.error("Failed to load agent files:", error);
      toast.error("加载 Agent 文件失败");
    } finally {
      setLoadingFiles(false);
    }
  };

  const toggleAgent = async (id: string, currentStatus: boolean) => {
    try {
      await agentApi.toggle(id, !currentStatus);
      toast.success(currentStatus ? "Agent 已禁用" : "Agent 已启用");
      loadAgents();
    } catch (error) {
      console.error("Failed to toggle agent:", error);
      toast.error("操作失败");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.md')) {
      toast.error('请上传 .md 格式的文件');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      await agentApi.uploadFile(formData);
      toast.success('Agent 文件上传成功！');
      loadAgentFiles();
    } catch (error) {
      console.error("Failed to upload file:", error);
      toast.error('文件上传失败，请重试');
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleDeleteFile = async (filename: string) => {
    if (!confirm(`确定要删除文件 ${filename} 吗？`)) {
      return;
    }

    try {
      await agentApi.deleteFile(filename);
      toast.success('文件删除成功！');
      loadAgentFiles();
    } catch (error) {
      console.error("Failed to delete file:", error);
      toast.error('文件删除失败');
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="space-y-6 p-6 cyber-bg-elevated min-h-screen font-mono relative">
      {/* Grid background */}
      <div className="absolute inset-0 cyber-grid-subtle pointer-events-none" />

      {/* Header Section */}
      <div className="cyber-card p-0 relative z-10">
        <div className="cyber-card-header">
          <Bot className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">Agent 管理</h3>
          <div className="ml-auto flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              size="sm"
              className="cyber-btn-outline h-8"
            >
              <Upload className="w-4 h-4 mr-2" />
              {uploading ? '上传中...' : '上传 Agent 文件'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="cyber-btn-primary h-8"
            >
              <Plus className="w-4 h-4 mr-2" />
              创建自定义 Agent
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </div>
        <div className="p-6">
          <p className="text-muted-foreground font-mono">管理系统 Agent 和自定义 Agent</p>
        </div>
      </div>

      {/* Agent Files Section */}
      <div className="cyber-card p-0 relative z-10">
        <div className="cyber-card-header">
          <FolderOpen className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">自定义 Agent 文件</h3>
          <span className="ml-auto text-xs text-muted-foreground font-mono">
            文件存储在 ~/.config/opencode/agents/ 目录
          </span>
        </div>
        <div className="p-6">
          {loadingFiles ? (
            <div className="text-center py-8">
              <div className="loading-spinner mx-auto mb-4"></div>
              <p className="text-muted-foreground font-mono">加载中...</p>
            </div>
          ) : agentFiles.length === 0 ? (
            <div className="empty-state">
              <FileText className="empty-state-icon" />
              <p className="empty-state-title">暂无自定义 Agent 文件</p>
              <p className="empty-state-description">点击上方按钮上传 .md 格式的 Agent 配置文件</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agentFiles.map((file) => (
                <div
                  key={file.filename}
                  className="cyber-card p-4 hover:border-border transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-primary/20 text-primary">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-base text-foreground mb-1 group-hover:text-primary transition-colors truncate">
                          {file.filename}
                        </h4>
                        <p className="text-xs text-muted-foreground font-mono">{formatFileSize(file.file_size)}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteFile(file.filename)}
                      className="h-8 w-8 p-0 hover:bg-rose-500/10 hover:text-rose-400"
                      title="删除文件"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="flex items-center text-xs text-muted-foreground font-mono">
                    <Clock className="w-3 h-3 mr-1" />
                    更新时间: {formatDate(file.updated_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filters Section */}
      <div className="cyber-card p-0 relative z-10">
        <div className="cyber-card-header">
          <Search className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">筛选和搜索</h3>
        </div>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">搜索 Agent</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="搜索 Agent..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="pl-10 cyber-input h-10"
                />
              </div>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">Agent 类型</label>
              <Select value={filters.agent_type} onValueChange={(val) => setFilters({ ...filters, agent_type: val })}>
                <SelectTrigger className="cyber-input h-10">
                  <SelectValue placeholder="选择类型" />
                </SelectTrigger>
                <SelectContent className="cyber-dialog border-border">
                  <SelectItem value="all">全部类型</SelectItem>
                  <SelectItem value="system">系统 Agent</SelectItem>
                  <SelectItem value="custom">自定义 Agent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-bold text-muted-foreground uppercase">状态</label>
              <Select 
                value={filters.is_active === undefined ? 'all' : filters.is_active ? 'active' : 'inactive'} 
                onValueChange={(val) => setFilters({ 
                  ...filters, 
                  is_active: val === 'all' ? undefined : val === 'active' 
                })}
              >
                <SelectTrigger className="cyber-input h-10">
                  <SelectValue placeholder="选择状态" />
                </SelectTrigger>
                <SelectContent className="cyber-dialog border-border">
                  <SelectItem value="all">全部状态</SelectItem>
                  <SelectItem value="active">已启用</SelectItem>
                  <SelectItem value="inactive">已禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      </div>

      {/* Agent List */}
      <div className="cyber-card p-0 relative z-10">
        <div className="cyber-card-header">
          <Cpu className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">Agent 列表 ({agents.length})</h3>
        </div>
        <div className="p-6">
          {loading ? (
            <div className="text-center py-12">
              <div className="loading-spinner mx-auto mb-4"></div>
              <p className="text-muted-foreground font-mono">加载中...</p>
            </div>
          ) : agents.length === 0 ? (
            <div className="empty-state">
              <Bot className="empty-state-icon" />
              <p className="empty-state-title">暂无 Agent</p>
              <p className="empty-state-description">没有找到符合条件的 Agent</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agents.map((agent) => (
                <div
                  key={agent.id}
                  className="cyber-card p-4 hover:border-border transition-all group"
                >
                  <div className="flex justify-between items-start mb-3 pb-3 border-b border-border">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        agent.agent_type === "system"
                          ? "bg-violet-500/20 text-violet-400"
                          : "bg-emerald-500/20 text-emerald-400"
                      }`}>
                        <Code className="w-5 h-5" />
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-base text-foreground mb-1 group-hover:text-primary transition-colors uppercase">
                          {agent.name}
                        </h4>
                        <div className="flex items-center gap-2">
                          <Badge className={`font-bold uppercase text-xs ${
                            agent.agent_type === "system"
                              ? "bg-violet-500/20 text-violet-400 border-violet-500/30"
                              : "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                          }`}>
                            {agent.agent_type === "system" ? "系统" : "自定义"}
                          </Badge>
                          <Badge className={`font-bold uppercase text-xs ${
                            agent.is_active
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                              : "bg-rose-500/20 text-rose-400 border-rose-500/30"
                          }`}>
                            {agent.is_active ? "启用" : "禁用"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <p className="text-muted-foreground text-sm mb-4 leading-relaxed font-mono">
                    {agent.description || "暂无描述"}
                  </p>
                  
                  <div className="flex justify-between items-center pt-3 border-t border-border">
                    <span className="text-xs text-muted-foreground font-mono">v{agent.version}</span>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => console.log("View agent:", agent.id)}
                        className="h-8 px-2 text-xs cyber-btn-ghost hover:text-primary"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        详情
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleAgent(agent.id, agent.is_active)}
                        className={`h-8 px-2 text-xs cyber-btn-ghost ${
                          agent.is_active 
                            ? "hover:text-rose-400" 
                            : "hover:text-emerald-400"
                        }`}
                      >
                        <Power className="w-3 h-3 mr-1" />
                        {agent.is_active ? "禁用" : "启用"}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}