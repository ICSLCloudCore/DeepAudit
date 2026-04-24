import { apiClient } from './serverClient'

export interface ProviderConfig {
  api_key: string
  base_url?: string
  models: string[]
}

export interface OpenCodeConfig {
  model: string
  provider: string
  providers: Record<string, ProviderConfig>
  mcp?: Record<string, any>
}

export interface OpenCodeConfigResponse {
  success: boolean
  config?: OpenCodeConfig
  raw?: string
  error?: string
}

export async function getOpenCodeConfig(): Promise<OpenCodeConfigResponse> {
  const response = await apiClient.get('/opencode-config')
  return response.data
}

export async function updateOpenCodeConfig(config: OpenCodeConfig): Promise<OpenCodeConfigResponse> {
  const response = await apiClient.put('/opencode-config', config)
  return response.data
}

export async function getRawOpenCodeConfig(): Promise<OpenCodeConfigResponse> {
  const response = await apiClient.get('/opencode-config/raw')
  return response.data
}

export async function updateRawOpenCodeConfig(raw: string): Promise<OpenCodeConfigResponse> {
  const response = await apiClient.put('/opencode-config/raw', { raw })
  return response.data
}
