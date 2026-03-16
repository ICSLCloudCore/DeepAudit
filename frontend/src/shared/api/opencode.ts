// DeepAudit x OpenCode API Client
import { apiClient } from "./serverClient";

// Types
export interface Agent {
  id: string;
  name: string;
  agent_type: "system" | "custom";
  version: string;
  description: string;
  author: string;
  config: Record<string, any>;
  tools: any[];
  is_system: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface OpenCodeSkill {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: "security" | "analysis" | "utility" | "custom";
  file_path: string;
  file_size: number;
  checksum: string;
  config: Record<string, any>;
  schema: Record<string, any>;
  tags: string[];
  is_public: boolean;
  is_active: boolean;
  download_count: number;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface OpenCodeMCP {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  mcp_type: "stdio" | "sse" | "http";
  server_url: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  config: Record<string, any>;
  tools: any[];
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by: string;
}

export interface ProjectConfig {
  id: string;
  project_id: string;
  selected_agents: Array<{
    agent_id: string;
    name: string;
    config: Record<string, any>;
    priority: number;
    enabled: boolean;
  }>;
  selected_skills: Array<{
    skill_id: string;
    name: string;
    config: Record<string, any>;
    enabled: boolean;
  }>;
  selected_mcps: Array<{
    mcp_id: string;
    name: string;
    config: Record<string, any>;
    enabled: boolean;
  }>;
  created_at: string;
  updated_at: string;
}

export interface AvailableResources {
  agents: Array<{
    id: string;
    name: string;
    description: string;
    agent_type: "system" | "custom";
    is_active: boolean;
  }>;
  skills: Array<{
    id: string;
    name: string;
    description: string;
    category: string;
    is_active: boolean;
  }>;
  mcps: Array<{
    id: string;
    name: string;
    description: string;
    mcp_type: string;
    is_active: boolean;
  }>;
}

export interface TaskExecution {
  id: string;
  task_id: string;
  opencode_process_id: string;
  opencode_status: "pending" | "creating" | "running" | "cleanup" | "completed";
  process_info: Record<string, any>;
  started_at: string;
  completed_at: string;
  created_at: string;
  updated_at: string;
}

// Agent API
export const agentApi = {
  list: async (params?: {
    agent_type?: string;
    is_active?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }) => {
    const response = await apiClient.get("/agents", { params });
    return response.data;
  },

  get: async (id: string) => {
    const response = await apiClient.get(`/agents/${id}`);
    return response.data;
  },

  create: async (data: Partial<Agent>) => {
    const response = await apiClient.post("/agents", data);
    return response.data;
  },

  update: async (id: string, data: Partial<Agent>) => {
    const response = await apiClient.put(`/agents/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    const response = await apiClient.delete(`/agents/${id}`);
    return response.data;
  },

  toggle: async (id: string, is_active: boolean) => {
    const response = await apiClient.patch(`/agents/${id}/toggle`, { is_active });
    return response.data;
  },

  // Agent 文件管理
  listFiles: async () => {
    const response = await apiClient.get("/agents/files");
    return response.data;
  },

  uploadFile: async (formData: FormData) => {
    const response = await apiClient.post("/agents/files/upload", formData);
    return response.data;
  },

  deleteFile: async (filename: string) => {
    const response = await apiClient.delete(`/agents/files/${encodeURIComponent(filename)}`);
    return response.data;
  },
};

// OpenCode API (Skills & MCPs)
export const opencodeApi = {
  // Skills
  listSkills: async (params?: {
    category?: string;
    is_public?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }) => {
    const response = await apiClient.get("/opencode/skills", { params });
    return response.data;
  },

  getSkill: async (id: string) => {
    const response = await apiClient.get(`/opencode/skills/${id}`);
    return response.data;
  },

  uploadSkill: async (formData: FormData) => {
    const response = await apiClient.post("/opencode/skills/upload", formData);
    return response.data;
  },

  updateSkill: async (id: string, data: Partial<OpenCodeSkill>) => {
    const response = await apiClient.put(`/opencode/skills/${id}`, data);
    return response.data;
  },

  deleteSkill: async (id: string) => {
    const response = await apiClient.delete(`/opencode/skills/${id}`);
    return response.data;
  },

  // MCPs
  listMcps: async (params?: {
    mcp_type?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }) => {
    const response = await apiClient.get("/opencode/mcps", { params });
    return response.data;
  },

  getMcp: async (id: string) => {
    const response = await apiClient.get(`/opencode/mcps/${id}`);
    return response.data;
  },

  createMcp: async (data: Partial<OpenCodeMCP>) => {
    const response = await apiClient.post("/opencode/mcps", data);
    return response.data;
  },

  updateMcp: async (id: string, data: Partial<OpenCodeMCP>) => {
    const response = await apiClient.put(`/opencode/mcps/${id}`, data);
    return response.data;
  },

  deleteMcp: async (id: string) => {
    const response = await apiClient.delete(`/opencode/mcps/${id}`);
    return response.data;
  },

  testMcpConnection: async (id: string) => {
    const response = await apiClient.post(`/opencode/mcps/${id}/test`);
    return response.data;
  },

  // Project opencode serve
  startProjectServe: async (projectId: string) => {
    const response = await apiClient.post(`/opencode/projects/${projectId}/start`);
    return response.data;
  },

  stopProjectServe: async (projectId: string) => {
    const response = await apiClient.post(`/opencode/projects/${projectId}/stop`);
    return response.data;
  },
};

// Project Config API
export const projectConfigApi = {
  get: async (projectId: string) => {
    const response = await apiClient.get(`/projects/${projectId}/config`);
    return response.data as ProjectConfig;
  },

  update: async (projectId: string, data: Partial<ProjectConfig>) => {
    const response = await apiClient.put(`/projects/${projectId}/config`, data);
    return response.data as ProjectConfig;
  },

  getAvailableResources: async (projectId: string) => {
    const response = await apiClient.get(`/projects/${projectId}/available-resources`);
    return response.data as AvailableResources;
  },
};
