export enum WorkflowStageStatus {
  NOT_CONFIGURED = 'not_configured',
  CONFIGURED = 'configured',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  CANCELLED = 'cancelled'
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  owner_id: string;
  
  submitted_at: string;
  completed_at?: string;
  
  analyze_status: WorkflowStageStatus;
  analyze_project_id?: string;
  analyze_tech_stack?: string[];
  analyze_agent_package_id?: string;
  analyze_prompt_template_id?: string;
  analyze_started_at?: string;
  analyze_completed_at?: string;
  
  white_status: WorkflowStageStatus;
  white_project_id?: string;
  white_tech_stack?: string[];
  white_agent_package_id?: string;
  white_prompt_template_id?: string;
  white_started_at?: string;
  white_completed_at?: string;
  
  black_status: WorkflowStageStatus;
  black_project_id?: string;
  black_tech_stack?: string[];
  black_agent_package_id?: string;
  black_prompt_template_id?: string;
  black_started_at?: string;
  black_completed_at?: string;
  
  created_at: string;
  updated_at?: string;
  is_active: boolean;
  
  overall_status?: string;
  total_vulnerabilities?: number;
}

export interface WorkflowDashboardStats {
  total_workflows: number;
  total_vulnerabilities: number;
  analyze_tech_stack_distribution: Record<string, number>;
  white_tech_stack_distribution: Record<string, number>;
  black_tech_stack_distribution: Record<string, number>;
  status_distribution: Record<string, number>;
}

export interface WorkflowVulnerabilityStats {
  workflow_id: string;
  overall_status: string;
  vulnerabilities: {
    total: number;
    by_severity: Record<string, number>;
    by_stage: Record<string, number>;
    by_status: Record<string, number>;
  };
  stages: Record<string, {
    status: WorkflowStageStatus;
    project_id?: string;
    vulnerability_count: number;
  }>;
}

export interface AgentPackage {
  id: string;
  name: string;
  author?: string;
  version: string;
  description?: string;
  category: string;
  agents_count: number;
  skills_count: number;
  is_public: boolean;
  package_agents?: Array<{ id: string; name: string }>;
  package_skills?: Array<{ id: string; name: string; version: string; description?: string }>;
}

export interface Skill {
  id: string;
  name: string;
  version: string;
  description?: string;
  author?: string;
  category: string;
  is_public: boolean;
}

export interface PromptTemplate {
  id: string;
  name: string;
  description?: string;
  template_type: string;
  is_default: boolean;
  is_system: boolean;
}

export interface AvailableResourcesResponse {
  agent_packages: AgentPackage[];
  category_skills: Skill[];
  other_skills: Skill[];
  prompt_templates: PromptTemplate[];
}

export interface CreateWorkflowForm {
  name: string;
  description?: string;
  
  analyze_skip?: boolean;
  analyze_tech_stack?: string[];
  analyze_agent_package_id?: string;
  analyze_prompt_template_id?: string;
  
  white_tech_stack: string[];
  white_agent_package_id?: string;
  white_prompt_template_id?: string;
  
  black_skip?: boolean;
  black_tech_stack?: string[];
  black_agent_package_id?: string;
  black_prompt_template_id?: string;
}

export interface WorkflowListResponse {
  workflows: Workflow[];
  total: number;
}

export const ANALYZE_TECH_STACK_OPTIONS = ['PS', 'CS&IMS', 'HV', 'PLT'];
export const WHITE_TECH_STACK_OPTIONS = ['c', 'go', 'normal'];
export const BLACK_TECH_STACK_OPTIONS = ['linux', 'docker', 'kubeletes', 'CSP', 'CGP'];

export interface StartAuditResponse {
  message: string;
  session_id: string;
  task_id: string;
  project_id: string;
}