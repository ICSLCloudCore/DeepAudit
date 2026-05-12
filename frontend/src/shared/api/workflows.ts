import { apiClient } from "./serverClient";
import type {
  Workflow,
  WorkflowDashboardStats,
  WorkflowVulnerabilityStats,
  WorkflowListResponse,
  CreateWorkflowForm,
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
  data: Partial<CreateWorkflowForm>
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
  config: { tech_stack: string[]; agents: string[] }
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