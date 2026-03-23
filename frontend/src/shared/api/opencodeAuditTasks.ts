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

export type OpenCodeFindingStatus = 
  | 'new'
  | 'analyzing'
  | 'resolved'
  | 'false_positive';

export type OpenCodeManualConfirmationStatus =
  | '待确认'
  | '已确认'
  | '误报'
  | '已修复';

export interface OpenCodeFinding {
  id: string;
  task_id: string;
  vuln_id: string;

  // 基本信息
  severity: string;
  cvss_score: number | null;
  cvss_vector: string | null;
  cwe: string | null;
  confidence: string | null;
  location: string | null;
  file_path: string | null;
  line_start: number | null;
  line_end: number | null;
  function_name: string | null;

  // 漏洞描述
  vulnerability_title: string;
  vulnerability_essence: string | null;
  root_cause: string | null;
  security_impact: string | null;

  // 漏洞代码
  vulnerable_code: string | null;

  // 数据流路径
  dataflow_source: string | null;
  dataflow_propagation: Record<string, unknown> | null;
  dataflow_sink: string | null;
  dataflow_sanitization: string | null;
  dataflow_conclusion: string | null;

  // 利用场景
  exploit_steps: string | null;
  exploit_poc: string | null;

  // 影响
  impact_confidentiality: string | null;
  impact_integrity: string | null;
  impact_availability: string | null;

  // 修复建议
  fix_description: string | null;
  fix_code_before: string | null;
  fix_code_after: string | null;

  // 人工确认
  manual_confirmation: string | null;
  manual_confirmation_status: string | null;
  manual_confirmation_notes: string | null;
  confirmed_by: string | null;
  confirmed_at: string | null;

  // 元数据
  status: string;
  created_at: string;
  updated_at: string | null;
}

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
  findings?: OpenCodeFinding[];
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

// ============ Findings API ============

/**
 * 获取 OpenCode 审计任务的漏洞列表
 */
export async function getOpenCodeFindings(
  taskId: string,
  params?: { severity?: string }
): Promise<OpenCodeFinding[]> {
  const response = await apiClient.get(`/opencode-audit-tasks/${taskId}/findings`, { params });
  return response.data;
}

/**
 * 获取单个 OpenCode 漏洞详情
 */
export async function getOpenCodeFinding(
  taskId: string,
  findingId: string
): Promise<OpenCodeFinding> {
  const response = await apiClient.get(`/opencode-audit-tasks/${taskId}/findings/${findingId}`);
  return response.data;
}

/**
 * 更新 OpenCode 漏洞状态
 */
export interface UpdateOpenCodeFindingRequest {
  status?: string;
}

export async function updateOpenCodeFinding(
  taskId: string,
  findingId: string,
  data: UpdateOpenCodeFindingRequest
): Promise<OpenCodeFinding> {
  const response = await apiClient.put(`/opencode-audit-tasks/${taskId}/findings/${findingId}`, data);
  return response.data;
}

/**
 * 人工确认 OpenCode 漏洞
 */
export interface ManualConfirmRequest {
  manual_confirmation_status: string;
  manual_confirmation_notes?: string;
}

export async function confirmOpenCodeFinding(
  taskId: string,
  findingId: string,
  data: ManualConfirmRequest
): Promise<OpenCodeFinding> {
  const response = await apiClient.post(`/opencode-audit-tasks/${taskId}/findings/${findingId}/confirm`, data);
  return response.data;
}

/**
 * 解析 OpenCode 审计报告
 */
export interface ParseReportRequest {
  reports_directory: string;
}

export async function parseOpenCodeReport(
  taskId: string,
  data: ParseReportRequest
): Promise<{
  message: string;
  task_id: string;
  findings_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
}> {
  const response = await apiClient.post(`/opencode-audit-tasks/${taskId}/parse-report`, data);
  return response.data;
}
