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

// OpenCode Session Types
export type OpenCodeSessionStatus = "active" | "closed" | "error" | "pending";
export type OpenCodeServerStatus = "starting" | "running" | "error" | "stopped";

export interface OpenCodeSession {
  id: string;
  project_id: string;
  status: OpenCodeSessionStatus;
  prompt_template_id?: string;
  prompt_content: string;
  response_content: string;
  started_at: string;
  completed_at?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AvailablePromptItem {
  id: string;
  name: string;
  description?: string;
  template_type: string;
  is_default: boolean;
  is_system: boolean;
  is_active: boolean;
}

export interface AvailablePromptsResponse {
  items: AvailablePromptItem[];
  total: number;
}

export interface StartAuditWithPromptRequest {
  prompt_template_id?: string;
  prompt_content?: string;
  variables?: Record<string, string>;
}

export interface StartAuditWithPromptResponse {
  session_id: string;
  project_id: string;
  status: OpenCodeSessionStatus;
  opencode_server_status: OpenCodeServerStatus;
  message: string;
}

export interface SessionStatusResponse {
  session_id: string;
  status: OpenCodeSessionStatus;
  prompt_content: string;
  response_content: string;
  opencode_server_status: OpenCodeServerStatus;
  started_at?: string;
  completed_at?: string;
}

// OpenCode Interaction Types
export type OpenCodeInteractionType = "request" | "response" | "error";

export interface OpenCodeInteraction {
  id: string;
  session_id: string;
  interaction_type: OpenCodeInteractionType;
  endpoint: string;
  http_method: string;
  request_timestamp: string;
  response_timestamp?: string;
  duration_ms?: number;
  request_payload?: string;
  response_payload?: string;
  http_status_code?: number;
  error_message?: string;
  error_type?: string;
  created_at: string;
  updated_at?: string;
}

export interface OpenCodeInteractionListResponse {
  items: OpenCodeInteraction[];
  total: number;
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

  refreshMcpTools: async (id: string) => {
    const response = await apiClient.post(`/opencode/mcps/${id}/refresh-tools`);
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

  // OpenCode Sessions
  listSessions: async (projectId: string, params?: {
    skip?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get(`/opencode/projects/${projectId}/sessions`, { params });
    return response.data;
  },

  createSession: async (projectId: string, data: any) => {
    const response = await apiClient.post(`/opencode/projects/${projectId}/sessions`, data);
    return response.data;
  },

  getSession: async (sessionId: string) => {
    const response = await apiClient.get(`/opencode/sessions/${sessionId}`);
    return response.data;
  },

  sendPrompt: async (sessionId: string, data: any) => {
    const response = await apiClient.post(`/opencode/sessions/${sessionId}/send-prompt`, data);
    return response.data;
  },

  closeSession: async (sessionId: string) => {
    const response = await apiClient.delete(`/opencode/sessions/${sessionId}`);
    return response.data;
  },

  // New APIs for Prompt Integration
  startAuditWithPrompt: async (projectId: string, data: StartAuditWithPromptRequest) => {
    const response = await apiClient.post(`/opencode/projects/${projectId}/audit-with-prompt`, data);
    return response.data;
  },

  getSessionStatus: async (sessionId: string) => {
    const response = await apiClient.get(`/opencode/sessions/${sessionId}/status`);
    return response.data;
  },

  getAvailablePrompts: async (projectId: string) => {
    const response = await apiClient.get(`/opencode/projects/${projectId}/available-prompts`);
    return response.data;
  },

  getSessionInteractions: async (sessionId: string, params?: {
    skip?: number;
    limit?: number;
  }) => {
    const response = await apiClient.get(`/opencode/sessions/${sessionId}/interactions`, { params });
    return response.data;
  },

  // SSE Stream
  streamSession: (sessionId: string) => {
    // Get base URL from apiClient defaults
    const baseURL = apiClient.defaults.baseURL || '';
    const url = `${baseURL}/opencode/sessions/${sessionId}/stream`;
    
    // Get token from storage
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    
    // Create a custom EventSource-like object using fetch
    const eventTarget = new EventTarget();
    let controller: AbortController | null = null;
    let isClosed = false;

    // Simple SSE parser
    const parseSSE = (buffer: string): { events: Array<{ event?: string; data: string }>; remaining: string } => {
      const events: Array<{ event?: string; data: string }> = [];
      const lines = buffer.split('\n');
      let remaining = '';
      let currentEvent: { event?: string; data: string } = { data: '' };

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];

        if (line === '') {
          // Empty line signifies end of event
          if (currentEvent.data) {
            events.push({ ...currentEvent });
            currentEvent = { data: '' };
          }
          continue;
        }

        if (i === lines.length - 1 && !buffer.endsWith('\n')) {
          // Incomplete line, keep for next chunk
          remaining = line;
          break;
        }

        if (line.startsWith('event:')) {
          currentEvent.event = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          currentEvent.data = line.slice(5).trim();
        }
        // Ignore other fields
      }

      return { events, remaining };
    };

    const connect = async () => {
      if (isClosed) return;
      
      controller = new AbortController();
      let buffer = '';
      
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Accept': 'text/event-stream',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          signal: controller.signal
        });

        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('No response body');
        }

        const decoder = new TextDecoder();
        eventTarget.dispatchEvent(new Event('open'));

        while (!isClosed) {
          const { done, value } = await reader.read();
          if (done) break;
          
          buffer += decoder.decode(value, { stream: true });
          const { events, remaining } = parseSSE(buffer);
          buffer = remaining;

          for (const event of events) {
            const customEvent = new MessageEvent(event.event || 'message', { data: event.data });
            eventTarget.dispatchEvent(customEvent);
          }
        }
      } catch (error) {
        if (!isClosed && error instanceof Error && error.name !== 'AbortError') {
          eventTarget.dispatchEvent(new ErrorEvent('error', { error }));
        }
      }
    };

    // Start connection
    connect();

    // Return EventSource-like interface
    const eventSourceLike = {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        eventTarget.addEventListener(type, listener);
      },
      removeEventListener: (type: string, listener: EventListenerOrEventListenerObject) => {
        eventTarget.removeEventListener(type, listener);
      },
      close: () => {
        isClosed = true;
        if (controller) {
          controller.abort();
        }
      },
      // Add dummy properties to satisfy TypeScript
      onerror: null,
      onmessage: null,
      onopen: null,
      readyState: 1, // 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
      url: url,
      withCredentials: false,
      // Add other EventSource properties as needed
      CLOSED: 2,
      CONNECTING: 0,
      OPEN: 1,
      dispatchEvent: (event: Event) => eventTarget.dispatchEvent(event)
    };

    return eventSourceLike as unknown as EventSource;
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
