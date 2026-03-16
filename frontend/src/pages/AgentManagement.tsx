// Agent Management Page
import React, { useState, useEffect, useRef } from "react";
import { agentApi, type Agent } from "@/shared/api/opencode";

interface AgentFile {
  filename: string;
  file_size: number;
  created_at: number;
  updated_at: number;
}

const AgentManagementPage: React.FC = () => {
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
    } finally {
      setLoadingFiles(false);
    }
  };

  const toggleAgent = async (id: string, currentStatus: boolean) => {
    try {
      await agentApi.toggle(id, !currentStatus);
      loadAgents();
    } catch (error) {
      console.error("Failed to toggle agent:", error);
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
      alert('请上传 .md 格式的文件');
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append('file', file);
      await agentApi.uploadFile(formData);
      alert('Agent 文件上传成功！');
      loadAgentFiles();
    } catch (error) {
      console.error("Failed to upload file:", error);
      alert('文件上传失败，请重试');
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
      alert('文件删除成功！');
      loadAgentFiles();
    } catch (error) {
      console.error("Failed to delete file:", error);
      alert('文件删除失败，请重试');
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
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-cyan-400">Agent 管理</h1>
            <p className="text-gray-400 mt-2">管理系统 Agent 和自定义 Agent</p>
          </div>
          <div className="flex gap-3">
            <button
              className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition flex items-center gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {uploading ? '上传中...' : '上传 Agent 文件'}
            </button>
            <button className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg transition">
              创建自定义 Agent
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".md"
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>
        </div>

        {/* Agent 文件列表 */}
        <div className="bg-gray-800 rounded-lg p-6 mb-6 border border-gray-700">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-cyan-300">自定义 Agent 文件</h2>
            <span className="text-sm text-gray-400">
              文件存储在 ~/.config/opencode/agents/ 目录
            </span>
          </div>
          
          {loadingFiles ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-cyan-500 mx-auto"></div>
              <p className="text-gray-400 mt-2">加载中...</p>
            </div>
          ) : agentFiles.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>暂无自定义 Agent 文件</p>
              <p className="text-sm mt-2">点击上方按钮上传 .md 格式的 Agent 配置文件</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {agentFiles.map((file) => (
                <div
                  key={file.filename}
                  className="bg-gray-700/50 rounded-lg p-4 border border-gray-600 hover:border-cyan-500 transition"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-cyan-900/50 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-medium truncate">{file.filename}</h3>
                        <p className="text-sm text-gray-400">{formatFileSize(file.file_size)}</p>
                      </div>
                    </div>
                    <button
                      className="text-red-400 hover:text-red-300 transition"
                      onClick={() => handleDeleteFile(file.filename)}
                      title="删除文件"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <div className="text-xs text-gray-500">
                    <p>更新时间: {formatDate(file.updated_at)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6 flex flex-wrap gap-4">
          <input
            type="text"
            placeholder="搜索 Agent..."
            className="px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          <select
            className="px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
            value={filters.agent_type}
            onChange={(e) => setFilters({ ...filters, agent_type: e.target.value })}
          >
            <option value="all">全部类型</option>
            <option value="system">系统 Agent</option>
            <option value="custom">自定义 Agent</option>
          </select>
        </div>

        {/* Agent List */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mx-auto"></div>
            <p className="text-gray-400 mt-4">加载中...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {agents.map((agent) => (
              <div
                key={agent.id}
                className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-cyan-500 transition"
              >
                <div className="flex justify-between items-start mb-3">
                  <div>
                    <h3 className="text-lg font-semibold">{agent.name}</h3>
                    <span className={`text-xs px-2 py-1 rounded ${
                      agent.agent_type === "system"
                        ? "bg-purple-600"
                        : "bg-green-600"
                    }`}>
                      {agent.agent_type === "system" ? "系统" : "自定义"}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <span className={`text-xs px-2 py-1 rounded ${
                      agent.is_active ? "bg-green-600" : "bg-red-600"
                    }`}>
                      {agent.is_active ? "启用" : "禁用"}
                    </span>
                  </div>
                </div>
                <p className="text-gray-400 text-sm mb-3">
                  {agent.description || "暂无描述"}
                </p>
                <div className="flex justify-between items-center text-sm text-gray-500">
                  <span>v{agent.version}</span>
                  <div className="flex gap-2">
                    <button
                      className="text-cyan-400 hover:text-cyan-300"
                      onClick={() => console.log("View agent:", agent.id)}
                    >
                      详情
                    </button>
                    <button
                      className="text-yellow-400 hover:text-yellow-300"
                      onClick={() => toggleAgent(agent.id, agent.is_active)}
                    >
                      {agent.is_active ? "禁用" : "启用"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentManagementPage;
