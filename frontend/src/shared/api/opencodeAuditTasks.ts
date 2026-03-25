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

// ============ 漏洞相关 Types ============

export interface AuditVulnerability {
  id: string;
  task_id: string;
  vuln_id: string;
  severity: string;
  cvss_score?: number;
  cvss_vector?: string;
  cwe?: string;
  confidence?: string;
  location?: string;
  file_path?: string;
  line_start?: number;
  line_end?: number;
  vulnerability_title: string;
  vulnerability_essence?: string;
  root_cause?: string;
  security_impact?: string;
  vulnerable_code?: string;
  dataflow?: string;
  exploit_steps?: string;
  exploit_poc?: string;
  impact_confidentiality?: string;
  impact_integrity?: string;
  impact_availability?: string;
  fix_description?: string;
  fix_code_before?: string;
  fix_code_after?: string;
  manual_confirmation?: boolean;
  manual_confirmation_status?: string;
  manual_confirmation_notes?: string;
  confirmed_by?: string;
  confirmed_at?: string;
  status?: string;
  created_at: string;
  updated_at: string;
}

export interface ImportVulnerabilitiesRequest {
  report_path?: string;
  report_data?: Record<string, unknown>;
}

export interface ImportVulnerabilitiesResponse {
  message: string;
  imported_count: number;
  total_in_report: number;
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

// ============ 漏洞相关 API Functions ============

/**
 * 导入漏洞
 */
export async function importVulnerabilities(
  taskId: string,
  data: ImportVulnerabilitiesRequest
): Promise<ImportVulnerabilitiesResponse> {
  const response = await apiClient.post(`/opencode-audit-tasks/${taskId}/import-vulns`, data);
  return response.data;
}

/**
 * 获取漏洞列表
 */
export async function getVulnerabilities(
  taskId: string,
  params?: {
    severity?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }
): Promise<AuditVulnerability[]> {
  const response = await apiClient.get(`/opencode-audit-tasks/${taskId}/vulnerabilities`, { params });
  return response.data;
}

/**
 * 获取单个漏洞详情
 */
export async function getVulnerability(
  taskId: string,
  vulnId: string
): Promise<AuditVulnerability> {
  const response = await apiClient.get(`/opencode-audit-tasks/${taskId}/vulnerabilities/${vulnId}`);
  return response.data;
}

/**
 * 扫描并导入漏洞报告
 * 用户在调用 skill 导出 JSON 报告后调用此接口
 */
export async function scanImportVulnerabilities(
  taskId: string
): Promise<{
  message: string;
  findings_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
}> {
  const response = await apiClient.post(`/opencode-audit-tasks/${taskId}/scan-import-vulns`);
  return response.data;
}

/**
 * 更新漏洞状态
 */
export async function updateVulnerability(
  taskId: string,
  vulnId: string,
  data: { status: string; notes?: string }
): Promise<any> {
  const response = await apiClient.patch(`/opencode-audit-tasks/${taskId}/vulnerabilities/${vulnId}`, data);
  return response.data;
}
