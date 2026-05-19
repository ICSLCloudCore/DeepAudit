import { apiClient } from "./serverClient";
import type {
  Workflow,
  WorkflowDashboardStats,
  WorkflowVulnerabilityStats,
  WorkflowListResponse,
  AvailableResourcesResponse,
  StartAuditResponse,
} from "@/shared/types/workflow";

export async function getWorkflows(): Promise<WorkflowListResponse> {
  const response = await apiClient.get("/workflows/");
  return response.data;
}

export async function createWorkflow(formData: FormData): Promise<Workflow> {
  const response = await apiClient.post("/workflows/", formData, {
    headers: {
      "Content-Type": "multipart/form-data",
    },
  });
  return response.data;
}

export async function getWorkflowStats(): Promise<WorkflowDashboardStats> {
  const response = await apiClient.get("/workflows/stats");
  return response.data;
}

export async function getWorkflow(workflowId: string): Promise<Workflow> {
  const response = await apiClient.get(`/workflows/${workflowId}`);
  return response.data;
}

export async function updateWorkflow(
  workflowId: string,
  data: Partial<{
    name: string;
    description: string;
    product_name: string;
    product_domain: string;
    version: string;
    audit_type: string;
    validation_mode: string;
    white_tech_stack: string[];
    white_agent_package_id: string;
    black_tech_stack: string[];
    black_agent_package_id: string;
  }>
): Promise<Workflow> {
  const response = await apiClient.put(`/workflows/${workflowId}`, data);
  return response.data;
}

export async function deleteWorkflow(workflowId: string): Promise<{ message: string }> {
  const response = await apiClient.delete(`/workflows/${workflowId}`);
  return response.data;
}

export async function getWorkflowVulnerabilityStats(
  workflowId: string
): Promise<WorkflowVulnerabilityStats> {
  const response = await apiClient.get(`/workflows/${workflowId}/stats`);
  return response.data;
}

export async function startWorkflowStage(
  workflowId: string,
  stage: "analyze" | "white" | "black"
): Promise<{ message: string; workflow: Workflow }> {
  const response = await apiClient.post(`/workflows/${workflowId}/start/${stage}`);
  return response.data;
}

export async function configureWorkflowStage(
  workflowId: string,
  stage: "analyze" | "white" | "black",
  config: { tech_stack: string[]; agent_package_id?: string; prompt_template_id?: string }
): Promise<Workflow> {
  const response = await apiClient.post(`/workflows/${workflowId}/configure/${stage}`, config);
  return response.data;
}

export async function skipWorkflowStage(
  workflowId: string,
  stage: "analyze" | "black"
): Promise<Workflow> {
  const response = await apiClient.post(`/workflows/${workflowId}/skip/${stage}`);
  return response.data;
}

export async function unskipWorkflowStage(
  workflowId: string,
  stage: "analyze" | "black"
): Promise<Workflow> {
  const response = await apiClient.post(`/workflows/${workflowId}/unskip/${stage}`);
  return response.data;
}

export async function getAvailableResources(
  category: "ANALYZE" | "WHITE" | "BLACK"
): Promise<AvailableResourcesResponse> {
  const response = await apiClient.get(`/workflows/available-resources?category=${category}`);
  return response.data;
}

export async function startWorkflowStageAudit(
  workflowId: string,
  stage: "analyze" | "white" | "black"
): Promise<StartAuditResponse> {
  const response = await apiClient.post(`/workflows/${workflowId}/start-audit/${stage}`);
  return response.data;
}

export async function completeWorkflowStage(
  workflowId: string,
  stage: "analyze" | "white" | "black"
): Promise<{ message: string }> {
  const response = await apiClient.post(`/workflows/${workflowId}/complete-stage/${stage}`);
  return response.data;
}

export async function updateWorkflowStageStatus(
  workflowId: string,
  stage: "analyze" | "white" | "black",
  taskStatus: "pending" | "running" | "completed" | "failed" | "cancelled"
): Promise<{ message: string; stage: string; status: string }> {
  const response = await apiClient.post(`/workflows/${workflowId}/update-stage-status/${stage}?task_status=${taskStatus}`);
  return response.data;
}