/**
 * Golang 安全知识库 API
 */

import { apiClient } from './serverClient';

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Likelihood = 'high' | 'medium' | 'low';

// ─── 漏洞库类型 ────────────────────────────────────────────────────────────

export interface VulnerabilityEntry {
  id: string;
  title: string;
  slug: string;
  tags: string[];
  summary?: string;
  content: string;
  go_packages: string[];
  source_url?: string;
  is_system: boolean;
  is_active: boolean;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface VulnerabilityEntryCreate {
  title: string;
  slug: string;
  tags?: string[];
  summary?: string;
  content: string;
  go_packages?: string[];
  source_url?: string;
  is_active?: boolean;
}

export type VulnerabilityEntryUpdate = Partial<Omit<VulnerabilityEntryCreate, 'slug'>>;

// ─── 攻击模式类型 ──────────────────────────────────────────────────────────

export interface AttackPatternEntry {
  id: string;
  pattern_id: string;
  version: string;
  version_notes?: string;
  is_latest: boolean;
  parent_id?: string;
  title: string;
  slug: string;
  capec_id?: string;
  attack_type: string;
  severity: Severity;
  likelihood?: Likelihood;
  tags: string[];
  summary?: string;
  content: string;
  mitigations?: string;
  go_packages: string[];
  source_url?: string;
  is_system: boolean;
  is_active: boolean;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AttackPatternEntryCreate {
  title: string;
  slug: string;
  capec_id?: string;
  attack_type: string;
  severity: Severity;
  likelihood?: Likelihood;
  tags?: string[];
  summary?: string;
  content: string;
  mitigations?: string;
  go_packages?: string[];
  source_url?: string;
  is_active?: boolean;
  version?: string;
  version_notes?: string;
}

export type AttackPatternEntryUpdate = Partial<Omit<AttackPatternEntryCreate, 'slug'>> & {
  version_notes?: string;
};

// ─── 版本管理类型 ─────────────────────────────────────────────────────────────

export interface AttackPatternVersionCreate {
  version: string;
  version_notes?: string;
  title?: string;
  summary?: string;
  content?: string;
  mitigations?: string;
  severity?: Severity;
  likelihood?: Likelihood;
  tags?: string[];
  go_packages?: string[];
  source_url?: string;
  is_active?: boolean;
}

export interface AttackPatternVersionListResponse {
  pattern_id: string;
  versions: AttackPatternEntry[];
}

// ─── 公共类型 ───────────────────────────────────────────────────────────────

export interface KbListResponse<T> {
  items: T[];
  total: number;
  skip: number;
  limit: number;
}

export interface KbListParams {
  skip?: number;
  limit?: number;
  q?: string;
  // attack pattern filters (not used for vulnerability insights)
  attack_type?: string;
  is_system?: boolean;
  is_active?: boolean;
}

export interface ImportZipResultItem {
  filename: string;
  status: 'created' | 'updated' | 'skipped' | 'failed';
  id?: string;
  slug?: string;
  reason?: string;
}

export interface ImportZipResponse {
  total: number;
  success: number;
  skipped: number;
  failed: number;
  results: ImportZipResultItem[];
}

export interface ExportZipRequest {
  ids?: string[];
  severity?: string;
  category?: string;
  attack_type?: string;
}

// ─── 工具函数 ───────────────────────────────────────────────────────────────

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTimestamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ─── 洞察漏洞库 API ─────────────────────────────────────────────────────────

const VULN_BASE = '/security-kb/vulnerabilities';

export async function listVulnerabilities(
  params?: KbListParams,
): Promise<KbListResponse<VulnerabilityEntry>> {
  const response = await apiClient.get(VULN_BASE, { params });
  return response.data;
}

export async function getVulnerability(id: string): Promise<VulnerabilityEntry> {
  const response = await apiClient.get(`${VULN_BASE}/${id}`);
  return response.data;
}

export async function createVulnerability(
  data: VulnerabilityEntryCreate,
): Promise<VulnerabilityEntry> {
  const response = await apiClient.post(VULN_BASE, data);
  return response.data;
}

export async function updateVulnerability(
  id: string,
  data: VulnerabilityEntryUpdate,
): Promise<VulnerabilityEntry> {
  const response = await apiClient.put(`${VULN_BASE}/${id}`, data);
  return response.data;
}

export async function deleteVulnerability(id: string): Promise<void> {
  await apiClient.delete(`${VULN_BASE}/${id}`);
}

export async function exportVulnerabilityMd(id: string, slug: string): Promise<void> {
  const response = await apiClient.get(`${VULN_BASE}/${id}/export`, {
    responseType: 'blob',
  });
  triggerDownload(response.data as Blob, `${slug}.md`);
}

export async function importVulnerabilityMd(
  file: File,
  overwrite: boolean,
): Promise<VulnerabilityEntry> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('overwrite', String(overwrite));
  const response = await apiClient.post(`${VULN_BASE}/import`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function importVulnerabilityZip(
  file: File,
  overwrite: boolean,
): Promise<ImportZipResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('overwrite', String(overwrite));
  const response = await apiClient.post(`${VULN_BASE}/import-zip`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function exportVulnerabilitiesZip(params: ExportZipRequest): Promise<void> {
  const response = await apiClient.post(`${VULN_BASE}/export-zip`, params, {
    responseType: 'blob',
  });
  triggerDownload(response.data as Blob, `vulnerabilities_export_${exportTimestamp()}.zip`);
}

// ─── 攻击模式库 API ─────────────────────────────────────────────────────────

const ATTACK_BASE = '/security-kb/attack-patterns';

export async function listAttackPatterns(
  params?: KbListParams,
): Promise<KbListResponse<AttackPatternEntry>> {
  const response = await apiClient.get(ATTACK_BASE, { params });
  return response.data;
}

export async function getAttackPattern(id: string): Promise<AttackPatternEntry> {
  const response = await apiClient.get(`${ATTACK_BASE}/${id}`);
  return response.data;
}

export async function createAttackPattern(
  data: AttackPatternEntryCreate,
): Promise<AttackPatternEntry> {
  const response = await apiClient.post(ATTACK_BASE, data);
  return response.data;
}

export async function updateAttackPattern(
  id: string,
  data: AttackPatternEntryUpdate,
): Promise<AttackPatternEntry> {
  const response = await apiClient.put(`${ATTACK_BASE}/${id}`, data);
  return response.data;
}

export async function deleteAttackPattern(id: string): Promise<void> {
  await apiClient.delete(`${ATTACK_BASE}/${id}`);
}

export async function exportAttackPatternMd(id: string, slug: string): Promise<void> {
  const response = await apiClient.get(`${ATTACK_BASE}/${id}/export`, {
    responseType: 'blob',
  });
  triggerDownload(response.data as Blob, `${slug}.md`);
}

export async function importAttackPatternMd(
  file: File,
  overwrite: boolean,
): Promise<AttackPatternEntry> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('overwrite', String(overwrite));
  const response = await apiClient.post(`${ATTACK_BASE}/import`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function importAttackPatternZip(
  file: File,
  overwrite: boolean,
): Promise<ImportZipResponse> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('overwrite', String(overwrite));
  const response = await apiClient.post(`${ATTACK_BASE}/import-zip`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export async function listAttackPatternVersions(
  entryId: string,
): Promise<AttackPatternVersionListResponse> {
  const response = await apiClient.get(`${ATTACK_BASE}/${entryId}/versions`);
  return response.data;
}

export async function createAttackPatternVersion(
  entryId: string,
  data: AttackPatternVersionCreate,
): Promise<AttackPatternEntry> {
  const response = await apiClient.post(`${ATTACK_BASE}/${entryId}/versions`, data);
  return response.data;
}

export async function setAttackPatternLatestVersion(entryId: string): Promise<AttackPatternEntry> {
  const response = await apiClient.put(`${ATTACK_BASE}/${entryId}/set-latest`);
  return response.data;
}

export async function exportAttackPatternsZip(params: ExportZipRequest): Promise<void> {
  const response = await apiClient.post(`${ATTACK_BASE}/export-zip`, params, {
    responseType: 'blob',
  });
  triggerDownload(
    response.data as Blob,
    `attack_patterns_export_${exportTimestamp()}.zip`,
  );
}

// ─── 洞察配置 API ─────────────────────────────────────────────────────────────

export interface InsightSourceOption {
  value: string;
  label: string;
  description: string;
}

export interface InsightConfig {
  enabled: boolean;
  interval_hours: number;
  sources: string[];
  last_run_at: string | null;
  next_run_at: string | null;
}

export interface InsightConfigResponse {
  config: InsightConfig;
  source_options: InsightSourceOption[];
}

export interface InsightConfigUpdate {
  enabled?: boolean;
  interval_hours?: number;
  sources?: string[];
}

const INSIGHT_BASE = '/security-kb/insight-config';

export async function getInsightConfig(): Promise<InsightConfigResponse> {
  const response = await apiClient.get(INSIGHT_BASE);
  return response.data;
}

export async function updateInsightConfig(data: InsightConfigUpdate): Promise<InsightConfigResponse> {
  const response = await apiClient.put(INSIGHT_BASE, data);
  return response.data;
}
