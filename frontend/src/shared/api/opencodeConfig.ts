import { apiClient } from './serverClient'

export interface ProviderOptions {
  baseURL?: string
  apiKey?: string
  headers?: Record<string, any>
}

export interface ModelConfig {
  name: string
}

export interface ProviderConfig {
  npm: string
  name: string
  options?: ProviderOptions
  models?: Record<string, ModelConfig>
}

export interface OpenCodeConfig {
  "$schema"?: string
  provider?: Record<string, ProviderConfig>
  mcp?: Record<string, any>
  [key: string]: any
}

export interface OpenCodeConfigResponse {
  success: boolean
  config?: OpenCodeConfig
  raw?: string
  error?: string
}

// 获取配置
export async function getOpenCodeConfig(): Promise<OpenCodeConfigResponse> {
  const response = await apiClient.get('/opencode-config')
  return response.data
}

// 更新配置
export async function updateOpenCodeConfig(config: OpenCodeConfig): Promise<OpenCodeConfigResponse> {
  const response = await apiClient.put('/opencode-config', config)
  return response.data
}

// 获取原始配置
export async function getRawOpenCodeConfig(): Promise<OpenCodeConfigResponse> {
  const response = await apiClient.get('/opencode-config/raw')
  return response.data
}

// 更新原始配置
export async function updateRawOpenCodeConfig(raw: string): Promise<OpenCodeConfigResponse> {
  const response = await apiClient.put('/opencode-config/raw', { raw })
  return response.data
}
