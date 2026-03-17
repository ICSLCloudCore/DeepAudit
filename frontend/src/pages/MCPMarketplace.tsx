// MCP Marketplace Page - Cyberpunk Terminal Aesthetic
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Server,
  Search,
  Eye,
  Zap
} from "lucide-react";
import { opencodeApi, type OpenCodeMCP } from "@/shared/api/opencode";
import { toast } from "sonner";

const MCPMarketplace: React.FC = () => {
  const [mcps, setMcps] = useState<OpenCodeMCP[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: "",
  });

  useEffect(() => {
    loadMcps();
  }, [filters]);

  const loadMcps = async () => {
    try {
      setLoading(true);
      const data = await opencodeApi.listMcps(filters);
      setMcps(data.items);
    } catch (error) {
      console.error("Failed to load mcps:", error);
      toast.error("加载 MCPs 失败");
    } finally {
      setLoading(false);
    }
  };

  const testMcpConnection = async (id: string) => {
    try {
      const result = await opencodeApi.testMcpConnection(id);
      if (result.success) {
        toast.success("连接测试成功!");
      } else {
        toast.error("连接测试失败!");
      }
    } catch (error) {
      console.error("Failed to test MCP connection:", error);
      toast.error("连接测试失败");
    }
  };

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
              onClick={() => console.log("Create MCP")}
              className="cyber-btn-primary"
            >
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
                        <Server className="w-4 h-4" />
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
                    <p className="text-muted-foreground text-sm">
                      {mcp.description || "暂无描述"}
                    </p>
                    
                    <div className="flex justify-between items-center">
                      <div className="text-xs text-muted-foreground font-mono">
                        作者: {mcp.author}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs cyber-btn-ghost text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
                          onClick={() => testMcpConnection(mcp.id)}
                        >
                          <Zap className="w-3 h-3 mr-1" />
                          测试连接
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs cyber-btn-ghost"
                          onClick={() => console.log("View MCP:", mcp.id)}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                          详情
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
    </div>
  );
};

export default MCPMarketplace;