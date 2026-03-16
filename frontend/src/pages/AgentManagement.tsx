// Agent Management Page
import React, { useState, useEffect } from "react";
import { agentApi, type Agent } from "@/shared/api/opencode";

const AgentManagementPage: React.FC = () => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    agent_type: "all",
    is_active: undefined as boolean | undefined,
    search: "",
  });

  useEffect(() => {
    loadAgents();
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

  const toggleAgent = async (id: string, currentStatus: boolean) => {
    try {
      await agentApi.toggle(id, !currentStatus);
      loadAgents();
    } catch (error) {
      console.error("Failed to toggle agent:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-cyan-400">Agent 管理</h1>
            <p className="text-gray-400 mt-2">管理系统 Agent 和自定义 Agent</p>
          </div>
          <button className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg transition">
            创建自定义 Agent
          </button>
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
