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
import { RefreshCw, Save, Settings, Cpu, CheckCircle2, Plus, Edit, Trash2 } from 'lucide-react'
import {
  getOpenCodeConfig,
  updateOpenCodeConfig,
  getRawOpenCodeConfig,
  updateRawOpenCodeConfig,
  type OpenCodeConfig,
  type ProviderConfig
} from '@/shared/api/opencodeConfig'

export default function ModelManager() {
  const [config, setConfig] = useState<OpenCodeConfig | null>(null)
  const [rawConfig, setRawConfig] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [activeTab, setActiveTab] = useState('visual')

  const [showProviderDialog, setShowProviderDialog] = useState(false)
  const [editingProvider, setEditingProvider] = useState<string | null>(null)
  const [providerForm, setProviderForm] = useState({
    id: '',
    api_key: '',
    base_url: '',
    models: ''
  })

  const loadConfig = async () => {
    try {
      setLoading(true)
      const [configRes, rawRes] = await Promise.all([
        getOpenCodeConfig(),
        getRawOpenCodeConfig()
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

  const openAddProvider = () => {
    setProviderForm({
      id: '',
      api_key: '',
      base_url: '',
      models: ''
    })
    setEditingProvider(null)
    setShowProviderDialog(true)
  }

  const openEditProvider = (providerId: string, providerConfig: ProviderConfig) => {
    setProviderForm({
      id: providerId,
      api_key: providerConfig.api_key,
      base_url: providerConfig.base_url || '',
      models: providerConfig.models.join(', ')
    })
    setEditingProvider(providerId)
    setShowProviderDialog(true)
  }

  const handleSaveProvider = () => {
    if (!config) return

    const modelList = providerForm.models.split(',')
      .map(m => m.trim())
      .filter(m => m)

    const newProviders = { ...config.providers }

    if (editingProvider && editingProvider !== providerForm.id) {
      delete newProviders[editingProvider]
    }

    newProviders[providerForm.id] = {
      api_key: providerForm.api_key,
      base_url: providerForm.base_url || undefined,
      models: modelList
    }

    setConfig({
      ...config,
      providers: newProviders
    })

    setShowProviderDialog(false)
  }

  const handleDeleteProvider = (providerId: string) => {
    if (!config) return
    if (!confirm(`确定要删除供应商 "${providerId}" 吗？`)) return

    const newProviders = { ...config.providers }
    delete newProviders[providerId]

    let newModel = config.model
    let newProvider = config.provider

    if (config.provider === providerId) {
      newProvider = ''
      newModel = ''
    }

    setConfig({
      ...config,
      provider: newProvider,
      model: newModel,
      providers: newProviders
    })
  }

  const handleSetDefaultModel = (providerId: string, modelName: string) => {
    if (!config) return
    setConfig({
      ...config,
      provider: providerId,
      model: modelName
    })
  }

  const handleSetDefaultProvider = (providerId: string) => {
    if (!config) return
    const providerConfig = config.providers[providerId]
    setConfig({
      ...config,
      provider: providerId,
      model: providerConfig.models[0] || ''
    })
  }

  const providerCount = Object.keys(config?.providers || {}).length
  const modelCount = Object.values(config?.providers || {}).reduce(
    (sum, p) => sum + p.models.length,
    0
  )
  const currentDefaultModel = config?.model
    ? `${config.provider}/${config.model}`
    : '未设置'

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 relative z-10">
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

        <Card className="cyber-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">当前默认模型</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xl font-bold text-amber-400">{currentDefaultModel}</div>
          </CardContent>
        </Card>
      </div>

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

        <TabsContent value="visual" className="mt-6 space-y-4">
          <div className="flex justify-end">
            <Button onClick={openAddProvider} className="cyber-btn-primary">
              <Plus className="w-4 h-4 mr-2" />
              添加供应商
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {Object.entries(config?.providers || {}).map(([providerId, providerConfig]) => {
              const isDefaultProvider = config?.provider === providerId

              return (
                <Card key={providerId} className="cyber-card overflow-hidden">
                  <CardHeader className="pb-3 border-b border-border">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-5 h-5 text-primary" />
                        <CardTitle className="text-base">{providerId}</CardTitle>
                      </div>
                      {isDefaultProvider && (
                        <Badge className="cyber-badge-success">默认供应商</Badge>
                      )}
                    </div>
                  </CardHeader>

                  <CardContent className="pt-4 space-y-4">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">API Key</Label>
                      <div className="text-sm text-foreground font-mono truncate">
                        {providerConfig.api_key}
                      </div>
                    </div>

                    {providerConfig.base_url && (
                      <div className="space-y-1">
                        <Label className="text-xs text-muted-foreground">Base URL</Label>
                        <div className="text-sm text-foreground font-mono truncate">
                          {providerConfig.base_url}
                        </div>
                      </div>
                    )}

                    <div className="space-y-2">
                      <Label className="text-xs text-muted-foreground">模型列表</Label>
                      <div className="flex flex-wrap gap-2">
                        {providerConfig.models.map((modelName) => {
                          const isDefaultModel = isDefaultProvider && config?.model === modelName
                          return (
                            <Badge
                              key={modelName}
                              className={`${isDefaultModel ? 'cyber-badge-success' : 'cyber-badge-muted'} cursor-pointer`}
                              onClick={() => handleSetDefaultModel(providerId, modelName)}
                            >
                              {modelName}
                              {isDefaultModel && <CheckCircle2 className="w-3 h-3 ml-1" />}
                            </Badge>
                          )
                        })}
                        {providerConfig.models.length === 0 && (
                          <span className="text-xs text-muted-foreground">暂无模型</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-2 border-t border-border">
                      {!isDefaultProvider && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSetDefaultProvider(providerId)}
                          className="flex-1 h-8 cyber-btn-ghost"
                        >
                          设为默认
                        </Button>
                      )}
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
              )
            })}

            {Object.keys(config?.providers || {}).length === 0 && (
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

      <Dialog open={showProviderDialog} onOpenChange={setShowProviderDialog}>
        <DialogContent className="!w-[min(90vw,600px)] !max-w-none cyber-dialog border border-border rounded-lg">
          <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
            <DialogTitle className="flex items-center gap-3 font-mono text-foreground">
              <div className="p-2 bg-primary/20 rounded border border-primary/30">
                <Settings className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="text-base font-bold uppercase tracking-wider">
                  {editingProvider ? '编辑供应商' : '添加供应商'}
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
                placeholder="例如: openai, anthropic, qwen"
                className="cyber-input"
                disabled={!!editingProvider}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">API Key *</Label>
              <Input
                value={providerForm.api_key}
                onChange={(e) => setProviderForm({ ...providerForm, api_key: e.target.value })}
                placeholder="输入 API Key"
                className="cyber-input"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">Base URL</Label>
              <Input
                value={providerForm.base_url}
                onChange={(e) => setProviderForm({ ...providerForm, base_url: e.target.value })}
                placeholder="例如: https://api.openai.com/v1"
                className="cyber-input"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">模型列表 (逗号分隔)</Label>
              <Input
                value={providerForm.models}
                onChange={(e) => setProviderForm({ ...providerForm, models: e.target.value })}
                placeholder="例如: gpt-4, gpt-3.5-turbo, gpt-4o"
                className="cyber-input"
              />
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
            <Button variant="outline" onClick={() => setShowProviderDialog(false)} className="cyber-btn-outline">
              取消
            </Button>
            <Button onClick={handleSaveProvider} className="cyber-btn-primary">
              {editingProvider ? '更新' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
