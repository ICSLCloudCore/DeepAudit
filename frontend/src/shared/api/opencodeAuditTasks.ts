/**
 * OpenCode Audit Tasks API
 * OpenCode 审计任务相关的 API 调用
 */

import { apiClient } from "./serverClient";

// ============ Types ============

export type OpenCodeAuditTaskStatus = 
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface OpenCodeAuditTask {
  id: string;
  project_id: string;
  name: string | null;
  description: string | null;
  task_type: string;
  status: OpenCodeAuditTaskStatus;
  current_step: string | null;

  // 分支信息
  branch_name: string | null;

  // OpenCode相关
  opencode_session_id: string | null;
  opencode_prompt_template_id: string | null;
  prompt_content: string | null;

  // 进度统计
  total_files: number;
  processed_files: number;
  total_lines: number;
  findings_count: number;

  // 严重程度统计
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;

  // 评分
  quality_score: number;
  security_score: number;

  // 进度
  progress_percentage: number;

  // 时间
  created_at: string;
  started_at: string | null;
  completed_at: string | null;

  // 错误信息
  error_message: string | null;

  // 关联数据
  project?: {
    id: string;
    name: string;
    description?: string;
  };
}

export interface CreateOpenCodeAuditTaskRequest {
  project_id: string;
  name?: string;
  description?: string;
  branch_name?: string;
  opencode_prompt_template_id?: string;
  prompt_content?: string;
  audit_config?: Record<string, unknown>;
  target_files?: string[];
  exclude_patterns?: string[];
}

export interface UpdateOpenCodeAuditTaskRequest {
  name?: string;
  description?: string;
}

export interface UpdateOpenCodeAuditTaskStatusRequest {
  status: OpenCodeAuditTaskStatus;
  current_step?: string;
  error_message?: string;
  processed_files?: number;
  findings_count?: number;
  critical_count?: number;
  high_count?: number;
  medium_count?: number;
  low_count?: number;
}

// ============ API Functions ============

/**
 * 获取 OpenCode 审计任务列表
 */
export async function getOpenCodeAuditTasks(params?: {
  project_id?: string;
  status?: string;
  search?: string;
}): Promise<OpenCodeAuditTask[]> {
  const response = await apiClient.get("/opencode-audit-tasks/", { params });
  return response.data;
}

/**
 * 创建 OpenCode 审计任务
 */
export async function createOpenCodeAuditTask(
  data: CreateOpenCodeAuditTaskRequest
): Promise<OpenCodeAuditTask> {
  const response = await apiClient.post("/opencode-audit-tasks/", data);
  return response.data;
}

/**
 * 获取单个 OpenCode 审计任务
 */
export async function getOpenCodeAuditTask(taskId: string): Promise<OpenCodeAuditTask> {
  const response = await apiClient.get(`/opencode-audit-tasks/${taskId}`);
  return response.data;
}

/**
 * 更新 OpenCode 审计任务
 */
export async function updateOpenCodeAuditTask(
  taskId: string,
  data: UpdateOpenCodeAuditTaskRequest
): Promise<OpenCodeAuditTask> {
  const response = await apiClient.put(`/opencode-audit-tasks/${taskId}`, data);
  return response.data;
}

/**
 * 更新 OpenCode 审计任务状态
 */
export async function updateOpenCodeAuditTaskStatus(
  taskId: string,
  data: UpdateOpenCodeAuditTaskStatusRequest
): Promise<OpenCodeAuditTask> {
  const response = await apiClient.patch(`/opencode-audit-tasks/${taskId}/status`, data);
  return response.data;
}

/**
 * 取消 OpenCode 审计任务
 */
export async function cancelOpenCodeAuditTask(
  taskId: string
): Promise<{ message: string; task_id: string }> {
  const response = await apiClient.post(`/opencode-audit-tasks/${taskId}/cancel`);
  return response.data;
}

/**
 * 删除 OpenCode 审计任务
 */
export async function deleteOpenCodeAuditTask(
  taskId: string
): Promise<{ message: string; task_id: string }> {
  const response = await apiClient.delete(`/opencode-audit-tasks/${taskId}`);
  return response.data;
}
