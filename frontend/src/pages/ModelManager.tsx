import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { RefreshCw, Save, Settings, Cpu, Plus, Edit, Trash2, Package, Key, Globe } from 'lucide-react'
import {
  getOpenCodeConfig,
  updateOpenCodeConfig,
  getRawOpenCodeConfig,
  updateRawOpenCodeConfig,
  type OpenCodeConfig,
  type ProviderConfig,
} from '@/shared/api/opencodeConfig'

export default function ModelManager() {
  const [config, setConfig] = useState<OpenCodeConfig | null>(null)
  const [rawConfig, setRawConfig] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('visual')

  // 供应商对话框状态
  const [showProviderDialog, setShowProviderDialog] = useState(false)
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null)
  const [providerForm, setProviderForm] = useState({
    id: '',
    npm: '@ai-sdk/openai-compatible',
    name: '',
    baseURL: '',
    apiKey: '',
    models: '',
  })

  // 模型对话框状态
  const [showModelDialog, setShowModelDialog] = useState(false)
  const [currentProviderId, setCurrentProviderId] = useState<string | null>(null)
  const [editingModelId, setEditingModelId] = useState<string | null>(null)
  const [modelForm, setModelForm] = useState({
    id: '',
    name: '',
  })

  const loadConfig = async () => {
    try {
      setLoading(true)
      const [configRes, rawRes] = await Promise.all([
        getOpenCodeConfig(),
        getRawOpenCodeConfig(),
      ])

      if (configRes.success && configRes.config) {
        setConfig(configRes.config)
      }
      if (rawRes.success && rawRes.raw) {
        setRawConfig(rawRes.raw)
      }
    } catch (error) {
      toast.error('加载配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  const handleSaveVisual = async () => {
    if (!config) return
    try {
      setSaving(true)
      const res = await updateOpenCodeConfig(config)
      if (res.success) {
        toast.success('配置保存成功')
        loadConfig()
      } else {
        toast.error(res.error || '保存失败')
      }
    } catch (error) {
      toast.error('保存配置失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRaw = async () => {
    try {
      setSaving(true)
      const res = await updateRawOpenCodeConfig(rawConfig)
      if (res.success) {
        toast.success('配置保存成功')
        loadConfig()
      } else {
        toast.error(res.error || '保存失败')
      }
    } catch (error) {
      toast.error('保存配置失败')
    } finally {
      setSaving(false)
    }
  }

  // 打开添加供应商对话框
  const openAddProvider = () => {
    setProviderForm({
      id: '',
      npm: '@ai-sdk/openai-compatible',
      name: '',
      baseURL: '',
      apiKey: '',
      models: '',
    })
    setEditingProviderId(null)
    setShowProviderDialog(true)
  }

  // 打开编辑供应商对话框
  const openEditProvider = (providerId: string, providerConfig: ProviderConfig) => {
    const modelsString = providerConfig.models
      ? Object.entries(providerConfig.models)
          .map(([modelId, model]) => modelId)
          .join(', ')
      : ''

    setProviderForm({
      id: providerId,
      npm: providerConfig.npm,
      name: providerConfig.name,
      baseURL: providerConfig.options?.baseURL || '',
      apiKey: providerConfig.options?.apiKey || '',
      models: modelsString,
    })
    setEditingProviderId(providerId)
    setShowProviderDialog(true)
  }

  // 保存供应商
  const handleSaveProvider = () => {
    if (!config) return

    // 解析模型列表
    const modelIds = providerForm.models
      ? providerForm.models.split(',').map((m) => m.trim()).filter((m) => m)
      : []

    const models: Record<string, { name: string }> = {}
    modelIds.forEach((modelId) => {
      models[modelId] = { name: modelId }
    })

    // 构建新的 provider
    const newProvider: ProviderConfig = {
      npm: providerForm.npm,
      name: providerForm.name,
      options: {
        baseURL: providerForm.baseURL || undefined,
        apiKey: providerForm.apiKey || undefined,
      },
      models: Object.keys(models).length > 0 ? models : undefined,
    }

    // 更新配置
    const newProviders = { ...(config.provider || {}) }

    // 如果是编辑且 ID 变了，先删除旧的
    if (editingProviderId && editingProviderId !== providerForm.id) {
      delete newProviders[editingProviderId]
    }

    newProviders[providerForm.id] = newProvider

    setConfig({
      ...config,
      provider: newProviders,
    })

    setShowProviderDialog(false)
  }

  // 删除供应商
  const handleDeleteProvider = (providerId: string) => {
    if (!config) return
    if (!confirm(`确定要删除供应商 "${providerId}" 吗？`)) return

    const newProviders = { ...(config.provider || {}) }
    delete newProviders[providerId]

    setConfig({
      ...config,
      provider: newProviders,
    })
  }

  // 打开添加模型对话框
  const openAddModel = (providerId: string) => {
    setModelForm({
      id: '',
      name: '',
    })
    setCurrentProviderId(providerId)
    setEditingModelId(null)
    setShowModelDialog(true)
  }

  // 打开编辑模型对话框
  const openEditModel = (providerId: string, modelId: string, modelName: string) => {
    setModelForm({
      id: modelId,
      name: modelName,
    })
    setCurrentProviderId(providerId)
    setEditingModelId(modelId)
    setShowModelDialog(true)
  }

  // 保存模型
  const handleSaveModel = () => {
    if (!config || !currentProviderId) return

    const providers = { ...(config.provider || {}) }
    const providerConfig = providers[currentProviderId]
    if (!providerConfig) return

    // 确保 models 存在
    const models = { ...(providerConfig.models || {}) }

    // 如果是编辑且 ID 变了，先删除旧的
    if (editingModelId && editingModelId !== modelForm.id) {
      delete models[editingModelId]
    }

    models[modelForm.id] = { name: modelForm.name || modelForm.id }

    // 更新
    providers[currentProviderId] = {
      ...providerConfig,
      models,
    }

    setConfig({
      ...config,
      provider: providers,
    })

    setShowModelDialog(false)
  }

  // 删除模型
  const handleDeleteModel = (providerId: string, modelId: string) => {
    if (!config) return
    if (!confirm(`确定要删除模型 "${modelId}" 吗？`)) return

    const providers = { ...(config.provider || {}) }
    const providerConfig = providers[providerId]
    if (!providerConfig || !providerConfig.models) return

    const newModels = { ...providerConfig.models }
    delete newModels[modelId]

    providers[providerId] = {
      ...providerConfig,
      models: newModels,
    }

    setConfig({
      ...config,
      provider: providers,
    })
  }

  // 统计数据
  const providerCount = config?.provider ? Object.keys(config.provider).length : 0
  const modelCount = config?.provider
    ? Object.values(config.provider).reduce(
        (sum, p) => sum + (p.models ? Object.keys(p.models).length : 0),
        0
      )
    : 0

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen cyber-bg-elevated">
        <div className="text-center space-y-4">
          <div className="loading-spinner mx-auto" />
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">加载中...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-6 cyber-bg-elevated min-h-screen font-mono relative">
      <div className="absolute inset-0 cyber-grid-subtle pointer-events-none" />

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 relative z-10">
        <Card className="cyber-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">供应商数量</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">{providerCount}</div>
          </CardContent>
        </Card>

        <Card className="cyber-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">模型总数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-400">{modelCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* 操作栏 */}
      <div className="cyber-card p-4 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Settings className="w-5 h-5 text-primary" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">OpenCode 配置管理</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={loadConfig}
              className="cyber-btn-outline"
              disabled={saving}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新
            </Button>
            <Button
              onClick={activeTab === 'visual' ? handleSaveVisual : handleSaveRaw}
              className="cyber-btn-primary"
              disabled={saving}
            >
              {saving ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  保存中...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4 mr-2" />
                  保存配置
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="relative z-10">
        <TabsList className="bg-muted border border-border p-1 h-auto gap-1 rounded">
          <TabsTrigger value="visual" className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs">
            可视化编辑
          </TabsTrigger>
          <TabsTrigger value="raw" className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs">
            原始 JSON
          </TabsTrigger>
        </TabsList>

        {/* 可视化编辑 */}
        <TabsContent value="visual" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Button onClick={openAddProvider} className="cyber-btn-primary">
              <Plus className="w-4 h-4 mr-2" />
              添加供应商
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
            {config?.provider && Object.entries(config.provider).map(([providerId, providerConfig]) => (
              <Card key={providerId} className="cyber-card overflow-hidden">
                <CardHeader className="pb-3 border-b border-border">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/20 rounded border border-primary/30">
                        <Package className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-base">{providerConfig.name || providerId}</CardTitle>
                        <p className="text-xs text-muted-foreground font-mono">{providerConfig.npm}</p>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 space-y-4">
                  {/* 显示配置信息 */}
                  {providerConfig.options?.baseURL && (
                    <div className="flex items-center gap-2">
                      <Globe className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-foreground font-mono truncate">{providerConfig.options.baseURL}</span>
                    </div>
                  )}
                  {providerConfig.options?.apiKey && (
                    <div className="flex items-center gap-2">
                      <Key className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-foreground font-mono truncate">
                        {providerConfig.options.apiKey.substring(0, 10)}...
                      </span>
                    </div>
                  )}

                  {/* 模型列表 */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs text-muted-foreground">模型列表</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openAddModel(providerId)}
                        className="h-7 px-2 text-xs cyber-btn-ghost"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        添加
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {providerConfig.models &&
                        Object.entries(providerConfig.models).map(([modelId, modelConfig]) => (
                          <Badge
                            key={modelId}
                            className="cyber-badge-muted group cursor-pointer"
                          >
                            {modelConfig.name || modelId}
                            <div className="ml-1 flex gap-1 opacity-0 group-hover:opacity-100">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  openEditModel(providerId, modelId, modelConfig.name || modelId)
                                }}
                                className="hover:text-primary"
                              >
                                <Edit className="w-3 h-3" />
                              </button>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleDeleteModel(providerId, modelId)
                                }}
                                className="hover:text-rose-400"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </Badge>
                        ))}
                      {(!providerConfig.models || Object.keys(providerConfig.models).length === 0) && (
                        <span className="text-xs text-muted-foreground">暂无模型</span>
                      )}
                    </div>
                  </div>

                  {/* 操作按钮 */}
                  <div className="flex items-center gap-2 pt-2 border-t border-border">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEditProvider(providerId, providerConfig)}
                      className="flex-1 h-8 cyber-btn-ghost"
                    >
                      <Edit className="w-4 h-4 mr-1" />
                      编辑
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeleteProvider(providerId)}
                      className="h-8 px-2 hover:bg-rose-500/20 hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}

            {/* 无供应商提示 */}
            {(!config?.provider || Object.keys(config.provider).length === 0) && (
              <div className="col-span-full cyber-card p-12">
                <div className="empty-state">
                  <Cpu className="empty-state-icon" />
                  <p className="empty-state-title">暂无供应商</p>
                  <p className="empty-state-description">点击"添加供应商"开始配置</p>
                  <Button onClick={openAddProvider} className="cyber-btn-primary h-12 px-8 mt-6">
                    <Plus className="w-5 h-5 mr-2" />
                    添加供应商
                  </Button>
                </div>
              </div>
            )}
          </div>
        </TabsContent>

        {/* 原始 JSON 编辑 */}
        <TabsContent value="raw" className="mt-6">
          <Card className="cyber-card">
            <CardContent className="pt-6">
              <Textarea
                value={rawConfig}
                onChange={(e) => setRawConfig(e.target.value)}
                className="font-mono text-sm min-h-[500px] cyber-input"
                placeholder="输入 JSON 配置..."
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 供应商对话框 */}
      <Dialog open={showProviderDialog} onOpenChange={setShowProviderDialog}>
        <DialogContent className="!w-[min(90vw,600px)] !max-w-none cyber-dialog border border-border rounded-lg">
          <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
            <DialogTitle className="flex items-center gap-3 font-mono text-foreground">
              <div className="p-2 bg-primary/20 rounded border border-primary/30">
                <Settings className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="text-base font-bold uppercase tracking-wider">
                  {editingProviderId ? '编辑供应商' : '添加供应商'}
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">供应商 ID *</Label>
              <Input
                value={providerForm.id}
                onChange={(e) => setProviderForm({ ...providerForm, id: e.target.value })}
                placeholder="例如: openai, anthropic, llt"
                className="cyber-input"
                disabled={!!editingProviderId}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">显示名称 *</Label>
              <Input
                value={providerForm.name}
                onChange={(e) => setProviderForm({ ...providerForm, name: e.target.value })}
                placeholder="例如: OpenAI, Anthropic"
                className="cyber-input"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">SDK 包 *</Label>
              <Input
                value={providerForm.npm}
                onChange={(e) => setProviderForm({ ...providerForm, npm: e.target.value })}
                placeholder="@ai-sdk/openai-compatible 或 @ai-sdk/openai"
                className="cyber-input"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Base URL</Label>
              <Input
                value={providerForm.baseURL}
                onChange={(e) => setProviderForm({ ...providerForm, baseURL: e.target.value })}
                placeholder="https://api.openai.com/v1"
                className="cyber-input"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">API Key</Label>
              <Input
                value={providerForm.apiKey}
                onChange={(e) => setProviderForm({ ...providerForm, apiKey: e.target.value })}
                placeholder="sk-..."
                type="password"
                className="cyber-input"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">模型列表 (逗号分隔)</Label>
              <Input
                value={providerForm.models}
                onChange={(e) => setProviderForm({ ...providerForm, models: e.target.value })}
                placeholder="gpt-4, gpt-3.5-turbo, gpt-4o"
                className="cyber-input"
              />
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
            <Button variant="outline" onClick={() => setShowProviderDialog(false)} className="cyber-btn-outline">
              取消
            </Button>
            <Button onClick={handleSaveProvider} className="cyber-btn-primary">
              {editingProviderId ? '更新' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 模型对话框 */}
      <Dialog open={showModelDialog} onOpenChange={setShowModelDialog}>
        <DialogContent className="!w-[min(90vw,500px)] !max-w-none cyber-dialog border border-border rounded-lg">
          <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
            <DialogTitle className="flex items-center gap-3 font-mono text-foreground">
              <div className="p-2 bg-primary/20 rounded border border-primary/30">
                <Cpu className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="text-base font-bold uppercase tracking-wider">
                  {editingModelId ? '编辑模型' : '添加模型'}
                </span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">模型 ID *</Label>
              <Input
                value={modelForm.id}
                onChange={(e) => setModelForm({ ...modelForm, id: e.target.value })}
                placeholder="例如: gpt-4o"
                className="cyber-input"
                disabled={!!editingModelId}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">显示名称</Label>
              <Input
                value={modelForm.name}
                onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                placeholder="例如: GPT-4o"
                className="cyber-input"
              />
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
            <Button variant="outline" onClick={() => setShowModelDialog(false)} className="cyber-btn-outline">
              取消
            </Button>
            <Button onClick={handleSaveModel} className="cyber-btn-primary">
              {editingModelId ? '更新' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
