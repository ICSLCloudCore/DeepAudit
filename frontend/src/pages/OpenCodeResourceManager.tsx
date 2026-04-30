/**
 * OpenCode Resource Manager - Unified Interface
 * Models, Skills, Agents, MCPs in one place
 */

import React, { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Terminal,
  Cpu,
  Code2,
  Bot,
  Server,
  Package,
  Upload,
  Download,
  Search,
  Filter,
  Trash2,
  Plus,
  Edit,
  Settings,
  RefreshCw,
  Save,
  Key,
  Globe,
  Shield,
  Database,
  FileText,
  AlertTriangle,
  AlertCircle,
  FolderOpen,
  Clock,
  Power,
  Eye,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";

// API imports
import {
  opencodeApi,
  agentApi,
  type OpenCodeSkill,
  type Agent,
  type OpenCodeMCP,
  type AgentPackage,
} from "@/shared/api/opencode";
import {
  getOpenCodeConfig,
  updateOpenCodeConfig,
  getRawOpenCodeConfig,
  updateRawOpenCodeConfig,
  type ProviderConfig,
  type OpenCodeConfig as OpenCodeConfigType,
} from "@/shared/api/opencodeConfig";

export default function OpenCodeResourceManager() {
  const [activeTab, setActiveTab] = useState("models");

  // ============== MODELS TAB STATE ==============
  const [openCodeConfig, setOpenCodeConfig] = useState<OpenCodeConfigType | null>(null);
  const [rawConfig, setRawConfig] = useState<string>("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [providerSaving, setProviderSaving] = useState(false);
  const [modelSaving, setModelSaving] = useState(false);
  const [modelFilters, setModelFilters] = useState({ search: "" });

  // Provider dialog
  const [showProviderDialog, setShowProviderDialog] = useState(false);
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [providerForm, setProviderForm] = useState({
    id: "",
    npm: "@ai-sdk/openai-compatible",
    name: "",
    baseURL: "",
    apiKey: "",
    models: "",
  });

  // Model dialog
  const [showModelDialog, setShowModelDialog] = useState(false);
  const [currentProviderId, setCurrentProviderId] = useState<string | null>(null);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [modelForm, setModelForm] = useState({
    id: "",
    name: "",
  });

  // ============== SKILLS TAB STATE ==============
  const [skills, setSkills] = useState<OpenCodeSkill[]>([]);
  const [skillsLoading, setSkillsLoading] = useState(true);
  const [skillFilters, setSkillFilters] = useState({
    category: "",
    search: "",
  });
  const [showSkillUploadDialog, setShowSkillUploadDialog] = useState(false);
  const [skillUploadForm, setSkillUploadForm] = useState({
    version: "1.0.0",
    category: "custom" as const,
    is_public: false,
    files: [] as File[],
  });
  const [skillUploading, setSkillUploading] = useState(false);
  const [skillUploadResults, setSkillUploadResults] = useState<{ success: any[]; failed: any[] } | null>(null);
  const [showSkillDeleteDialog, setShowSkillDeleteDialog] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState<OpenCodeSkill | null>(null);
  const [skillDeleting, setSkillDeleting] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const skillFileInputRef = useRef<HTMLInputElement>(null);

  // ============== AGENTS TAB STATE (Agent Packages) ==============
  const [agentPackages, setAgentPackages] = useState<AgentPackage[]>([]);
  const [agentPackagesLoading, setAgentPackagesLoading] = useState(true);
  const [agentPackageFilters, setAgentPackageFilters] = useState({
    search: "",
    is_public: undefined as boolean | undefined,
  });
  const [showAgentPackageUploadDialog, setShowAgentPackageUploadDialog] = useState(false);
  const [agentPackageUploading, setAgentPackageUploading] = useState(false);
  const [showAgentPackageDeleteDialog, setShowAgentPackageDeleteDialog] = useState(false);
  const [agentPackageToDelete, setAgentPackageToDelete] = useState<AgentPackage | null>(null);
  const [agentPackageDeleting, setAgentPackageDeleting] = useState(false);
  const [downloadingAgentPackageId, setDownloadingAgentPackageId] = useState<string | null>(null);
  const [selectedAgentPackage, setSelectedAgentPackage] = useState<AgentPackage | null>(null);
  const [showAgentPackageDetailsDialog, setShowAgentPackageDetailsDialog] = useState(false);
  const agentPackageFileInputRef = useRef<HTMLInputElement>(null);

  // ============== MCPS TAB STATE ==============
  const [mcps, setMcps] = useState<OpenCodeMCP[]>([]);
  const [mcpsLoading, setMcpsLoading] = useState(true);
  const [mcpFilters, setMcpFilters] = useState({
    mcp_type: "",
    search: "",
  });
  const [showMcpCreateDialog, setShowMcpCreateDialog] = useState(false);
  const [showMcpEditDialog, setShowMcpEditDialog] = useState(false);
  const [showMcpViewDialog, setShowMcpViewDialog] = useState(false);
  const [showMcpDeleteDialog, setShowMcpDeleteDialog] = useState(false);
  const [selectedMcp, setSelectedMcp] = useState<OpenCodeMCP | null>(null);
  const [mcpForm, setMcpForm] = useState({
    name: "",
    mcp_type: "stdio" as const,
    version: "1.0.0",
    description: "",
    server_url: "",
    command: "",
    args: "",
    env: "",
  });
  const [mcpFormSubmitting, setMcpFormSubmitting] = useState(false);
  const [refreshingTools, setRefreshingTools] = useState<string | null>(null);

  // ============== LOAD DATA ==============
  useEffect(() => {
    // Load all data on page initialization
    loadModels();
    loadSkills();
    loadAgentPackages();
    loadMcps();
  }, []);

  useEffect(() => {
    if (activeTab === "skills") {
      loadSkills();
    }
  }, [activeTab, skillFilters]);

  useEffect(() => {
    if (activeTab === "agents") {
      loadAgentPackages();
    }
  }, [activeTab, agentPackageFilters]);

  useEffect(() => {
    if (activeTab === "mcps") {
      loadMcps();
    }
  }, [activeTab, mcpFilters]);

  // ============== MODELS FUNCTIONS ==============
  const loadModels = async () => {
    try {
      setModelsLoading(true);
      const [configRes, rawRes] = await Promise.all([
        getOpenCodeConfig(),
        getRawOpenCodeConfig(),
      ]);

      if (configRes.success && configRes.config) {
        setOpenCodeConfig(configRes.config);
      }
      if (rawRes.success && rawRes.raw) {
        setRawConfig(rawRes.raw);
      }
    } catch (error) {
      toast.error("加载配置失败");
    } finally {
      setModelsLoading(false);
    }
  };

  const handleRefresh = async () => {
    try {
      setRefreshing(true);

      // Parallel refresh calls
      const [skillsResult, agentsResult, mcpsResult] = await Promise.allSettled([
        opencodeApi.refreshSkills(),
        opencodeApi.refreshAgents(),
        opencodeApi.refreshMcps(),
      ]);

      // First refresh the models (existing logic)
      await loadModels();

      // Then reload all lists
      await Promise.all([
        loadSkills(),
        loadAgentPackages(),
        loadMcps(),
      ]);

      // Build summary message
      let summary = "刷新完成！";
      if (skillsResult.status === "fulfilled") {
        summary += ` Skills(+${skillsResult.value.stats.added}/~${skillsResult.value.stats.updated})`;
      }
      if (agentsResult.status === "fulfilled") {
        summary += ` Agents(+${agentsResult.value.stats.added}/~${agentsResult.value.stats.updated})`;
      }
      if (mcpsResult.status === "fulfilled") {
        summary += ` MCPs(+${mcpsResult.value.stats.added}/~${mcpsResult.value.stats.updated})`;
      }

      toast.success(summary);
    } catch (error) {
      console.error("Failed to refresh:", error);
      toast.error("刷新失败");
    } finally {
      setRefreshing(false);
    }
  };

  const handleSaveVisual = async () => {
    if (!openCodeConfig) return;
    try {
      setSaving(true);
      const res = await updateOpenCodeConfig(openCodeConfig);
      if (res.success) {
        toast.success("配置保存成功");
        loadModels();
      } else {
        toast.error(res.error || "保存失败");
      }
    } catch (error) {
      toast.error("保存配置失败");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRaw = async () => {
    try {
      setSaving(true);
      const res = await updateRawOpenCodeConfig(rawConfig);
      if (res.success) {
        toast.success("配置保存成功");
        loadModels();
      } else {
        toast.error(res.error || "保存失败");
      }
    } catch (error) {
      toast.error("保存配置失败");
    } finally {
      setSaving(false);
    }
  };

  const openAddProvider = () => {
    setProviderForm({
      id: "",
      npm: "@ai-sdk/openai-compatible",
      name: "",
      baseURL: "",
      apiKey: "",
      models: "",
    });
    setEditingProviderId(null);
    setShowProviderDialog(true);
  };

  const openEditProvider = (providerId: string, providerConfig: ProviderConfig) => {
    const modelsString = providerConfig.models
      ? Object.entries(providerConfig.models)
          .map(([modelId, model]) => modelId)
          .join(", ")
      : "";

    setProviderForm({
      id: providerId,
      npm: providerConfig.npm,
      name: providerConfig.name,
      baseURL: providerConfig.options?.baseURL || "",
      apiKey: providerConfig.options?.apiKey || "",
      models: modelsString,
    });
    setEditingProviderId(providerId);
    setShowProviderDialog(true);
  };

  const handleSaveProvider = async () => {
    if (!openCodeConfig) return;

    try {
      setProviderSaving(true);

      const modelIds = providerForm.models
        ? providerForm.models.split(",").map((m) => m.trim()).filter((m) => m)
        : [];

      const models: Record<string, { name: string }> = {};
      modelIds.forEach((modelId) => {
        models[modelId] = { name: modelId };
      });

      const newProvider: ProviderConfig = {
        npm: providerForm.npm,
        name: providerForm.name,
        options: {
          baseURL: providerForm.baseURL || undefined,
          apiKey: providerForm.apiKey || undefined,
        },
        models: Object.keys(models).length > 0 ? models : undefined,
      };

      const newProviders = { ...(openCodeConfig.provider || {}) };

      if (editingProviderId && editingProviderId !== providerForm.id) {
        delete newProviders[editingProviderId];
      }

      newProviders[providerForm.id] = newProvider;

      const newConfig = {
        ...openCodeConfig,
        provider: newProviders,
      };

      setOpenCodeConfig(newConfig);
      
      const res = await updateOpenCodeConfig(newConfig);
      if (res.success) {
        toast.success(editingProviderId ? "供应商更新成功！" : "供应商添加成功！");
        setShowProviderDialog(false);
        loadModels();
      } else {
        toast.error(res.error || "保存失败");
      }
    } catch (error) {
      toast.error("保存失败");
    } finally {
      setProviderSaving(false);
    }
  };

  const handleDeleteProvider = async (providerId: string) => {
    if (!openCodeConfig) return;
    if (!confirm(`确定要删除供应商 "${providerId}" 吗？`)) return;

    try {
      setProviderSaving(true);
      
      const newProviders = { ...(openCodeConfig.provider || {}) };
      delete newProviders[providerId];

      const newConfig = {
        ...openCodeConfig,
        provider: newProviders,
      };

      setOpenCodeConfig(newConfig);
      
      const res = await updateOpenCodeConfig(newConfig);
      if (res.success) {
        toast.success("供应商删除成功！");
        loadModels();
      } else {
        toast.error(res.error || "删除失败");
      }
    } catch (error) {
      toast.error("删除失败");
    } finally {
      setProviderSaving(false);
    }
  };

  const openAddModel = (providerId: string) => {
    setModelForm({ id: "", name: "" });
    setCurrentProviderId(providerId);
    setEditingModelId(null);
    setShowModelDialog(true);
  };

  const openEditModel = (providerId: string, modelId: string, modelName: string) => {
    setModelForm({ id: modelId, name: modelName });
    setCurrentProviderId(providerId);
    setEditingModelId(modelId);
    setShowModelDialog(true);
  };

  const handleSaveModel = async () => {
    if (!openCodeConfig || !currentProviderId) return;

    try {
      setModelSaving(true);

      const providers = { ...(openCodeConfig.provider || {}) };
      const providerConfig = providers[currentProviderId];
      if (!providerConfig) return;

      const models = { ...(providerConfig.models || {}) };

      if (editingModelId && editingModelId !== modelForm.id) {
        delete models[editingModelId];
      }

      models[modelForm.id] = { name: modelForm.name || modelForm.id };

      providers[currentProviderId] = {
        ...providerConfig,
        models,
      };

      const newConfig = {
        ...openCodeConfig,
        provider: providers,
      };

      setOpenCodeConfig(newConfig);

      const res = await updateOpenCodeConfig(newConfig);
      if (res.success) {
        toast.success(editingModelId ? "模型更新成功！" : "模型添加成功！");
        setShowModelDialog(false);
        loadModels();
      } else {
        toast.error(res.error || "保存失败");
      }
    } catch (error) {
      toast.error("保存失败");
    } finally {
      setModelSaving(false);
    }
  };

  const handleDeleteModel = async (providerId: string, modelId: string) => {
    if (!openCodeConfig) return;
    if (!confirm(`确定要删除模型 "${modelId}" 吗？`)) return;

    try {
      setModelSaving(true);

      const providers = { ...(openCodeConfig.provider || {}) };
      const providerConfig = providers[providerId];
      if (!providerConfig || !providerConfig.models) return;

      const newModels = { ...providerConfig.models };
      delete newModels[modelId];

      providers[providerId] = {
        ...providerConfig,
        models: newModels,
      };

      const newConfig = {
        ...openCodeConfig,
        provider: providers,
      };

      setOpenCodeConfig(newConfig);

      const res = await updateOpenCodeConfig(newConfig);
      if (res.success) {
        toast.success("模型删除成功！");
        loadModels();
      } else {
        toast.error(res.error || "删除失败");
      }
    } catch (error) {
      toast.error("删除失败");
    } finally {
      setModelSaving(false);
    }
  };

  const providerCount = openCodeConfig?.provider ? Object.keys(openCodeConfig.provider).length : 0;
  const modelCount = openCodeConfig?.provider
    ? Object.values(openCodeConfig.provider).reduce(
        (sum, p) => sum + (p.models ? Object.keys(p.models).length : 0),
        0
      )
    : 0;
  const skillCount = skills.length;
  const agentPackageCount = agentPackages.length;
  const agentCount = agentPackages.reduce((sum, pkg) => sum + pkg.agents_count, 0);
  const mcpCount = mcps.length;

  // ============== SKILLS FUNCTIONS ==============
  const loadSkills = async () => {
    try {
      setSkillsLoading(true);
      const data = await opencodeApi.listSkills(skillFilters);
      setSkills(data.items);
    } catch (error) {
      console.error("Failed to load skills:", error);
      toast.error("加载 Skills 失败");
    } finally {
      setSkillsLoading(false);
    }
  };

  const handleUploadSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (skillUploadForm.files.length === 0) {
      toast.error("请选择要上传的文件");
      return;
    }

    try {
      setSkillUploading(true);
      setSkillUploadResults(null);

      if (skillUploadForm.files.length === 1) {
        const formData = new FormData();
        formData.append("file", skillUploadForm.files[0]);
        formData.append("version", skillUploadForm.version);
        formData.append("category", skillUploadForm.category);
        formData.append("is_public", skillUploadForm.is_public.toString());

        await opencodeApi.uploadSkill(formData);
        toast.success("Skill 上传成功！");
        setShowSkillUploadDialog(false);
        resetSkillUploadForm();
        loadSkills();
      } else {
        const formData = new FormData();
        skillUploadForm.files.forEach((file) => {
          formData.append("files", file);
        });
        formData.append("version", skillUploadForm.version);
        formData.append("category", skillUploadForm.category);
        formData.append("is_public", skillUploadForm.is_public.toString());

        const result = await opencodeApi.batchUploadSkills(formData);
        setSkillUploadResults(result);

        if (result.success.length > 0) {
          toast.success(
            `成功上传 ${result.success.length} 个 Skill${
              result.failed.length > 0 ? `，${result.failed.length} 个失败` : ""
            }`
          );
        }
        if (result.failed.length > 0 && result.success.length === 0) {
          toast.error(`全部 ${result.failed.length} 个 Skill 上传失败`);
        }

        if (result.success.length > 0) {
          loadSkills();
        }
      }
    } catch (error: any) {
      console.error("Failed to upload skill:", error);
      let errorMessage = "Skill 上传失败";

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        if (status === 401) {
          errorMessage = "上传失败：未登录或登录已过期，请重新登录";
        } else if (status === 403) {
          errorMessage = "上传失败：没有权限上传Skill";
        } else if (status === 413) {
          errorMessage = "上传失败：文件太大";
        } else if (status === 422) {
          errorMessage = "上传失败：请求参数错误";
        } else if (status === 500) {
          errorMessage = "上传失败：服务器错误";
        } else if (data && data.detail) {
          errorMessage = `上传失败：${data.detail}`;
        } else if (data && data.message) {
          errorMessage = `上传失败：${data.message}`;
        }
      } else if (error.request) {
        errorMessage = "上传失败：无法连接到服务器，请检查网络连接";
      } else {
        errorMessage = `上传失败：${error.message || "未知错误"}`;
      }

      toast.error(errorMessage);
    } finally {
      setSkillUploading(false);
    }
  };

  const resetSkillUploadForm = () => {
    setSkillUploadForm({
      version: "1.0.0",
      category: "custom",
      is_public: false,
      files: [],
    });
    setSkillUploadResults(null);
    if (skillFileInputRef.current) {
      skillFileInputRef.current.value = "";
    }
  };

  const handleDeleteSkill = async () => {
    if (!skillToDelete) return;

    try {
      setSkillDeleting(true);
      await opencodeApi.deleteSkill(skillToDelete.id);
      toast.success("Skill 删除成功！");
      setShowSkillDeleteDialog(false);
      setSkillToDelete(null);
      loadSkills();
    } catch (error: any) {
      console.error("Failed to delete skill:", error);
      let errorMessage = "Skill 删除失败";

      if (error.response) {
        const status = error.response.status;
        const data = error.response.data;

        if (status === 401) {
          errorMessage = "删除失败：未登录或登录已过期，请重新登录";
        } else if (status === 403) {
          errorMessage = "删除失败：没有权限删除该Skill";
        } else if (status === 404) {
          errorMessage = "删除失败：Skill不存在";
        } else if (status === 500) {
          errorMessage = "删除失败：服务器错误";
        } else if (data && data.detail) {
          errorMessage = `删除失败：${data.detail}`;
        } else if (data && data.message) {
          errorMessage = `删除失败：${data.message}`;
        }
      } else if (error.request) {
        errorMessage = "删除失败：无法连接到服务器，请检查网络连接";
      } else {
        errorMessage = `删除失败：${error.message || "未知错误"}`;
      }

      toast.error(errorMessage);
    } finally {
      setSkillDeleting(false);
    }
  };

  const handleDownloadSkill = async (skill: OpenCodeSkill) => {
    try {
      setDownloadingId(skill.id);
      await opencodeApi.downloadSkill(skill.id, skill.name, skill.version);
      toast.success(`${skill.name} 下载成功`);
    } catch (error: any) {
      const msg = error?.response?.data?.detail ?? error?.message ?? "下载失败";
      toast.error(`下载失败：${msg}`);
    } finally {
      setDownloadingId(null);
    }
  };

  const getSkillCategoryIcon = (category: string) => {
    switch (category) {
      case "security":
        return <Shield className="w-4 h-4" />;
      case "analysis":
        return <Cpu className="w-4 h-4" />;
      case "utility":
        return <Database className="w-4 h-4" />;
      default:
        return <Package className="w-4 h-4" />;
    }
  };

  const getSkillCategoryColor = (category: string) => {
    switch (category) {
      case "security":
        return "text-rose-400 bg-rose-500/20";
      case "analysis":
        return "text-sky-400 bg-sky-500/20";
      case "utility":
        return "text-amber-400 bg-amber-500/20";
      default:
        return "text-violet-400 bg-violet-500/20";
    }
  };

  // ============== AGENT PACKAGES FUNCTIONS ==============
  const loadAgentPackages = async () => {
    try {
      setAgentPackagesLoading(true);
      const data = await opencodeApi.listAgentPackages(agentPackageFilters);
      setAgentPackages(data.items);
    } catch (error) {
      console.error("Failed to load agent packages:", error);
      toast.error("加载 Agent 包列表失败");
    } finally {
      setAgentPackagesLoading(false);
    }
  };

  const handleAgentPackageFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleAgentPackageUpload(file);
    }
  };

  const handleAgentPackageUpload = async (file: File) => {
    try {
      setAgentPackageUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      await opencodeApi.uploadAgentPackage(formData);
      toast.success("Agent 包上传成功！");
      setShowAgentPackageUploadDialog(false);
      loadAgentPackages();
    } catch (error: any) {
      console.error("Failed to upload agent package:", error);
      let errorMessage = "Agent 包上传失败";
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      }
      toast.error(errorMessage);
    } finally {
      setAgentPackageUploading(false);
      if (agentPackageFileInputRef.current) {
        agentPackageFileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteAgentPackage = async () => {
    if (!agentPackageToDelete) return;
    try {
      setAgentPackageDeleting(true);
      await opencodeApi.deleteAgentPackage(agentPackageToDelete.id);
      toast.success("Agent 包删除成功！");
      setShowAgentPackageDeleteDialog(false);
      setAgentPackageToDelete(null);
      loadAgentPackages();
    } catch (error: any) {
      console.error("Failed to delete agent package:", error);
      let errorMessage = "Agent 包删除失败";
      if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      }
      toast.error(errorMessage);
    } finally {
      setAgentPackageDeleting(false);
    }
  };

  const handleDownloadAgentPackage = async (pkg: AgentPackage) => {
    try {
      setDownloadingAgentPackageId(pkg.id);
      await opencodeApi.downloadAgentPackage(pkg.id, pkg.original_filename || pkg.name);
      toast.success(`${pkg.name} 下载成功`);
    } catch (error: any) {
      const msg = error?.response?.data?.detail ?? error?.message ?? "下载失败";
      toast.error(`下载失败：${msg}`);
    } finally {
      setDownloadingAgentPackageId(null);
    }
  };

  const handleViewAgentPackageDetails = async (pkg: AgentPackage) => {
    try {
      const detailedPkg = await opencodeApi.getAgentPackage(pkg.id);
      setSelectedAgentPackage(detailedPkg);
      setShowAgentPackageDetailsDialog(true);
    } catch (error) {
      console.error("Failed to load agent package details:", error);
      toast.error("加载 Agent 包详情失败");
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  const formatDate = (timestamp: number): string => {
    return new Date(timestamp * 1000).toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ============== MCPS FUNCTIONS ==============
  const loadMcps = async () => {
    try {
      setMcpsLoading(true);
      const params: any = {};
      if (mcpFilters.search) params.search = mcpFilters.search;
      if (mcpFilters.mcp_type) params.mcp_type = mcpFilters.mcp_type;
      const data = await opencodeApi.listMcps(params);
      setMcps(data.items);
    } catch (error) {
      console.error("Failed to load mcps:", error);
      toast.error("加载 MCPs 失败");
    } finally {
      setMcpsLoading(false);
    }
  };

  const resetMcpForm = () => {
    setMcpForm({
      name: "",
      mcp_type: "stdio",
      version: "1.0.0",
      description: "",
      server_url: "",
      command: "",
      args: "",
      env: "",
    });
  };

  const openCreateMcp = () => {
    resetMcpForm();
    setShowMcpCreateDialog(true);
  };

  const openEditMcp = (mcp: OpenCodeMCP) => {
    setSelectedMcp(mcp);
    setMcpForm({
      name: mcp.name,
      mcp_type: mcp.mcp_type,
      version: mcp.version,
      description: mcp.description,
      server_url: mcp.server_url,
      command: mcp.command,
      args: mcp.args?.join("\n") || "",
      env: Object.entries(mcp.env || {})
        .map(([k, v]) => `${k}=${v}`)
        .join("\n"),
    });
    setShowMcpEditDialog(true);
  };

  const openViewMcp = (mcp: OpenCodeMCP) => {
    setSelectedMcp(mcp);
    setShowMcpViewDialog(true);
  };

  const openDeleteMcp = (mcp: OpenCodeMCP) => {
    setSelectedMcp(mcp);
    setShowMcpDeleteDialog(true);
  };

  const handleCreateMcp = async () => {
    try {
      setMcpFormSubmitting(true);
      const args = mcpForm.args
        ? mcpForm.args.split("\n").filter((a) => a.trim())
        : [];
      const env: Record<string, string> = {};
      mcpForm.env?.split("\n").forEach((line) => {
        const [key, value] = line.split("=");
        if (key && value) {
          env[key.trim()] = value.trim();
        }
      });

      await opencodeApi.createMcp({
        name: mcpForm.name,
        mcp_type: mcpForm.mcp_type,
        version: mcpForm.version,
        description: mcpForm.description,
        server_url: mcpForm.server_url,
        command: mcpForm.command,
        args,
        env,
      });
      toast.success("MCP 创建成功！");
      setShowMcpCreateDialog(false);
      resetMcpForm();
      loadMcps();
    } catch (error: any) {
      console.error("Failed to create mcp:", error);
      toast.error(error?.response?.data?.detail || "创建失败");
    } finally {
      setMcpFormSubmitting(false);
    }
  };

  const handleUpdateMcp = async () => {
    if (!selectedMcp) return;
    try {
      setMcpFormSubmitting(true);
      const args = mcpForm.args
        ? mcpForm.args.split("\n").filter((a) => a.trim())
        : [];
      const env: Record<string, string> = {};
      mcpForm.env?.split("\n").forEach((line) => {
        const [key, value] = line.split("=");
        if (key && value) {
          env[key.trim()] = value.trim();
        }
      });

      await opencodeApi.updateMcp(selectedMcp.id, {
        name: mcpForm.name,
        mcp_type: mcpForm.mcp_type,
        version: mcpForm.version,
        description: mcpForm.description,
        server_url: mcpForm.server_url,
        command: mcpForm.command,
        args,
        env,
      });
      toast.success("MCP 更新成功！");
      setShowMcpEditDialog(false);
      loadMcps();
    } catch (error: any) {
      console.error("Failed to update mcp:", error);
      toast.error(error?.response?.data?.detail || "更新失败");
    } finally {
      setMcpFormSubmitting(false);
    }
  };

  const handleDeleteMcp = async () => {
    if (!selectedMcp) return;
    try {
      setMcpFormSubmitting(true);
      await opencodeApi.deleteMcp(selectedMcp.id);
      toast.success("MCP 删除成功！");
      setShowMcpDeleteDialog(false);
      loadMcps();
    } catch (error: any) {
      console.error("Failed to delete mcp:", error);
      toast.error(error?.response?.data?.detail || "删除失败");
    } finally {
      setMcpFormSubmitting(false);
    }
  };

  const toggleMcpActive = async (id: string, currentStatus: boolean) => {
    try {
      const mcp = mcps.find((m) => m.id === id);
      if (!mcp) return;

      await opencodeApi.updateMcp(id, { is_active: !currentStatus });
      toast.success(currentStatus ? "MCP 已禁用" : "MCP 已启用");
      loadMcps();
    } catch (error: any) {
      console.error("Failed to toggle mcp:", error);
      toast.error(error?.response?.data?.detail || "操作失败");
    }
  };

  const refreshMcpTools = async (id: string) => {
    try {
      setRefreshingTools(id);
      await opencodeApi.refreshMcpTools(id);
      toast.success("工具列表刷新成功！");
      loadMcps();
    } catch (error: any) {
      console.error("Failed to refresh tools:", error);
      toast.error(error?.response?.data?.detail || "刷新失败");
    } finally {
      setRefreshingTools(null);
    }
  };

  const getMcpTypeColor = (type: string) => {
    switch (type) {
      case "stdio":
        return "text-emerald-400 bg-emerald-500/20";
      case "sse":
        return "text-sky-400 bg-sky-500/20";
      case "http":
        return "text-violet-400 bg-violet-500/20";
      default:
        return "text-muted-foreground bg-muted";
    }
  };

  // ============== RENDER ==============
  return (
    <div className="space-y-6 p-6 cyber-bg-elevated min-h-screen font-mono relative">
      {/* Grid background */}
      <div className="absolute inset-0 cyber-grid-subtle pointer-events-none" />

      {/* Header */}
      <div className="cyber-card p-0 relative z-10">
        <div className="cyber-card-header">
          <Terminal className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">Opencode 管理</h3>
        </div>
        <div className="p-6">
          <p className="text-muted-foreground font-mono">统一管理Models、Skills、Agents 和 MCPs</p>
        </div>
      </div>

      {/* Unified Dashboard Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4 relative z-10">
        <Card className="cyber-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Package className="w-4 h-4 text-emerald-400" />
              Models
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-emerald-400">{modelCount}</div>
          </CardContent>
        </Card>

        <Card className="cyber-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Code2 className="w-4 h-4 text-violet-400" />
              Skills
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-violet-400">{skillCount}</div>
          </CardContent>
        </Card>

        <Card className="cyber-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Bot className="w-4 h-4 text-amber-400" />
              编排
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-amber-400">{agentPackageCount}</div>
          </CardContent>
        </Card>

        <Card className="cyber-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Bot className="w-4 h-4 text-pink-400" />
              Agents
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-pink-400">{agentCount}</div>
          </CardContent>
        </Card>

        <Card className="cyber-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <Server className="w-4 h-4 text-sky-400" />
              MCPs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-sky-400">{mcpCount}</div>
          </CardContent>
        </Card>
      </div>

       {/* Tabs */}
       <Tabs value={activeTab} onValueChange={setActiveTab} className="relative z-10">
         <div className="flex items-center justify-between gap-4">
           <TabsList className="bg-muted border border-border p-1 h-auto gap-1 rounded flex-1">
             <TabsTrigger
               value="models"
               className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs"
             >
               <Cpu className="w-4 h-4 mr-2" />
               Models
             </TabsTrigger>
             <TabsTrigger
               value="skills"
               className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs"
             >
               <Code2 className="w-4 h-4 mr-2" />
               Skills
             </TabsTrigger>
             <TabsTrigger
               value="agents"
               className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs"
             >
               <Bot className="w-4 h-4 mr-2" />
               Agents
             </TabsTrigger>
             <TabsTrigger
               value="mcps"
               className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs"
             >
               <Server className="w-4 h-4 mr-2" />
               MCPs
             </TabsTrigger>
             <TabsTrigger
               value="file"
               className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs"
             >
               <FileText className="w-4 h-4 mr-2" />
               文件管理
             </TabsTrigger>
           </TabsList>
           
            <Button
              variant="outline"
              onClick={handleRefresh}
              className="cyber-btn-outline"
              disabled={saving || refreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
              刷新
            </Button>
         </div>

         {/* ============== MODELS TAB CONTENT ============== */}
         <TabsContent value="models" className="mt-6 space-y-6">
           {modelsLoading ? (
             <div className="flex items-center justify-center py-12">
               <div className="text-center space-y-4">
                 <div className="loading-spinner mx-auto mb-4"></div>
                 <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">加载中...</p>
               </div>
             </div>
           ) : (
             <>
               {/* Header */}
               <div className="cyber-card p-0">
                 <div className="cyber-card-header">
                   <Settings className="w-5 h-5 text-primary" />
                   <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">OpenCode 配置管理</h3>
                   <div className="ml-auto">
                     <Button onClick={openAddProvider} className="cyber-btn-primary">
                       <Plus className="w-4 h-4 mr-2" />
                       添加供应商
                     </Button>
                   </div>
                 </div>
                 <div className="p-6">
                   <p className="text-muted-foreground font-mono">管理 OpenCode 模型供应商和模型配置</p>
                 </div>
               </div>

               {/* Main content */}
               <div className="cyber-card p-0">
                 <div className="p-6 space-y-6">
                   {/* Filters */}
                   <div className="cyber-bg-elevated border border-border p-4 rounded-lg mb-6">
                     <div className="flex flex-col sm:flex-row gap-4">
                       <div className="flex-1">
                         <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block flex items-center gap-2">
                           <Search className="w-3 h-3" />
                           搜索
                         </label>
                         <Input
                           type="text"
                           placeholder="搜索供应商或模型..."
                           className="cyber-input"
                           value={modelFilters.search}
                           onChange={(e) => setModelFilters({ ...modelFilters, search: e.target.value })}
                         />
                       </div>
                     </div>
                   </div>

                   {/* Providers list */}
                   {(!openCodeConfig?.provider || Object.keys(openCodeConfig.provider).length === 0) ? (
                     <div className="empty-state">
                       <Cpu className="empty-state-icon" />
                       <p className="empty-state-title">暂无供应商</p>
                       <p className="empty-state-description">点击上方按钮添加供应商</p>
                     </div>
                   ) : (
                     <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2">
                       {Object.entries(openCodeConfig.provider)
                         .filter(([providerId, providerConfig]) => {
                           if (!modelFilters.search) return true;
                           const searchLower = modelFilters.search.toLowerCase();
                           if (providerId.toLowerCase().includes(searchLower)) return true;
                           if (providerConfig.name?.toLowerCase().includes(searchLower)) return true;
                           if (providerConfig.npm?.toLowerCase().includes(searchLower)) return true;
                           if (providerConfig.options?.baseURL?.toLowerCase().includes(searchLower)) return true;
                           if (providerConfig.models) {
                             return Object.entries(providerConfig.models).some(
                               ([modelId, modelConfig]) =>
                                 modelId.toLowerCase().includes(searchLower) ||
                                 modelConfig.name?.toLowerCase().includes(searchLower)
                             );
                           }
                           return false;
                         })
                         .map(([providerId, providerConfig]) => (
                           <div key={providerId} className="cyber-card p-4 hover:border-border transition-all">
                             <div className="flex items-start justify-between mb-3 pb-3 border-b border-border">
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

                             <div className="space-y-4">
                               {providerConfig.options?.baseURL && (
                                 <div className="flex items-center gap-2">
                                   <Globe className="w-4 h-4 text-muted-foreground" />
                                   <span className="text-sm text-foreground font-mono truncate">
                                     {providerConfig.options.baseURL}
                                   </span>
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
                                     Object.entries(providerConfig.models)
                                       .filter(([modelId, modelConfig]) => {
                                         if (!modelFilters.search) return true;
                                         const searchLower = modelFilters.search.toLowerCase();
                                         return (
                                           modelId.toLowerCase().includes(searchLower) ||
                                           modelConfig.name?.toLowerCase().includes(searchLower)
                                         );
                                       })
                                       .map(([modelId, modelConfig]) => (
                                         <Badge
                                           key={modelId}
                                           className="cyber-badge-muted group cursor-pointer"
                                         >
                                           {modelConfig.name || modelId}
                                           <div className="ml-1 flex gap-1 opacity-0 group-hover:opacity-100">
                                             <button
                                               onClick={(e) => {
                                                 e.stopPropagation();
                                                 openEditModel(providerId, modelId, modelConfig.name || modelId);
                                               }}
                                               className="hover:text-primary"
                                             >
                                               <Edit className="w-3 h-3" />
                                             </button>
                                             <button
                                               onClick={(e) => {
                                                 e.stopPropagation();
                                                 handleDeleteModel(providerId, modelId);
                                               }}
                                               className="hover:text-rose-400"
                                             >
                                               <Trash2 className="w-3 h-3" />
                                             </button>
                                           </div>
                                         </Badge>
                                       ))}
                                   {(!providerConfig.models ||
                                     Object.entries(providerConfig.models).filter(([modelId, modelConfig]) => {
                                       if (!modelFilters.search) return true;
                                       const searchLower = modelFilters.search.toLowerCase();
                                       return (
                                         modelId.toLowerCase().includes(searchLower) ||
                                         modelConfig.name?.toLowerCase().includes(searchLower)
                                       );
                                     }).length === 0) && (
                                     <span className="text-xs text-muted-foreground">暂无模型</span>
                                   )}
                                 </div>
                               </div>

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
                                   className="h-8 px-2 hover:bg-rose-500/10 hover:text-rose-400"
                                 >
                                   <Trash2 className="w-4 h-4" />
                                 </Button>
                               </div>
                             </div>
                           </div>
                         ))}
                     </div>
                   )}
                 </div>
               </div>
              </>
            )}
           </TabsContent>

        {/* ============== SKILLS TAB CONTENT ============== */}
        <TabsContent value="skills" className="mt-6 space-y-6">
          {/* Header card */}
          <div className="cyber-card p-0">
            <div className="cyber-card-header">
              <Package className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">Skill 管理</h3>
              <div className="ml-auto">
                <Button
                  variant="outline"
                  onClick={() => setShowSkillUploadDialog(true)}
                  className="cyber-btn-primary"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  上传 Skill
                </Button>
              </div>
            </div>
            <div className="p-6">
              <p className="text-muted-foreground font-mono">浏览和管理 OpenCode Skills</p>
            </div>
          </div>

          {/* Main content */}
          <div className="cyber-card p-0">
            <div className="p-6 space-y-6">
              {/* Filters */}
              <div className="cyber-bg-elevated border border-border p-4 rounded-lg mb-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block flex items-center gap-2">
                      <Search className="w-3 h-3" />
                      搜索
                    </label>
                    <Input
                      type="text"
                      placeholder="搜索 Skills..."
                      className="cyber-input"
                      value={skillFilters.search}
                      onChange={(e) => setSkillFilters({ ...skillFilters, search: e.target.value })}
                    />
                  </div>
                  <div className="sm:w-48">
                    <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block flex items-center gap-2">
                      <Filter className="w-3 h-3" />
                      分类
                    </label>
                    <Select
                      value={skillFilters.category}
                      onValueChange={(val) => setSkillFilters({ ...skillFilters, category: val === "all" ? "" : val })}
                    >
                      <SelectTrigger className="cyber-input">
                        <SelectValue placeholder="全部分类" />
                      </SelectTrigger>
                      <SelectContent className="cyber-dialog border-border">
                        <SelectItem value="all">全部分类</SelectItem>
                        <SelectItem value="security">安全</SelectItem>
                        <SelectItem value="analysis">分析</SelectItem>
                        <SelectItem value="utility">工具</SelectItem>
                        <SelectItem value="custom">自定义</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Skills list */}
              {skillsLoading ? (
                <div className="text-center py-12">
                  <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
                  <p className="text-muted-foreground font-mono">加载中...</p>
                </div>
              ) : skills.length === 0 ? (
                <div className="empty-state">
                  <Package className="empty-state-icon" />
                  <p className="empty-state-title">暂无 Skills</p>
                  <p className="empty-state-description">上传您的第一个 Skill 开始使用</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {skills.map((skill) => (
                    <div key={skill.id} className="cyber-card p-4 hover:border-primary transition-all group">
                      <div className="flex justify-between items-start mb-3 pb-3 border-b border-border">
                        <div className="flex items-start space-x-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getSkillCategoryColor(skill.category)}`}>
                            {getSkillCategoryIcon(skill.category)}
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-base text-foreground mb-1 group-hover:text-primary transition-colors uppercase">
                              {skill.name}
                            </h4>
                            <div className="flex items-center space-x-1 text-xs text-muted-foreground font-mono">
                              <span className="text-primary">{">"}</span>
                              <span>v{skill.version}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className="cyber-badge-muted">{skill.category}</Badge>
                        </div>
                        {skill.is_public && (
                          <Badge className="cyber-badge-muted">
                            <Globe className="w-3 h-3 mr-1" />
                            公开
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-3">
                        <p className="text-muted-foreground text-sm">{skill.description || "暂无描述"}</p>

                        <div className="flex justify-between items-center">
                          <div className="text-xs text-muted-foreground font-mono">作者: {skill.author}</div>
                          <div className="flex gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs cyber-btn-ghost"
                              title="下载 ZIP"
                              disabled={downloadingId === skill.id}
                              onClick={() => handleDownloadSkill(skill)}
                            >
                              {downloadingId === skill.id ? (
                                <div className="loading-spinner w-3 h-3 mr-1" />
                              ) : (
                                <Download className="w-3 h-3 mr-1" />
                              )}
                              下载
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs cyber-btn-ghost text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                              title="删除"
                              onClick={() => {
                                setSkillToDelete(skill);
                                setShowSkillDeleteDialog(true);
                              }}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                              删除
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        {/* ============== AGENTS TAB CONTENT (AGENT PACKAGES) ============== */}
        <TabsContent value="agents" className="mt-6 space-y-6">
          {/* Header */}
          <div className="cyber-card p-0">
            <div className="cyber-card-header">
              <Bot className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">Agent 包管理</h3>
             <div className="ml-auto flex items-center gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowAgentPackageUploadDialog(true)}
                  disabled={agentPackageUploading}
                  className="cyber-btn-primary"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  {agentPackageUploading ? "上传中..." : "上传 Agent 包"}
                </Button>
               </div>
            </div>
              <div className="p-6">
                <p className="text-muted-foreground font-mono">管理 Agent 包，包含 Agents 和 Skills</p>
              </div>
            </div>

            {/* Main content */}
            <div className="cyber-card p-0">
              <div className="p-6 space-y-6">
                {/* Filters */}
                <div className="cyber-bg-elevated border border-border p-4 rounded-lg mb-6">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                      <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block flex items-center gap-2">
                        <Search className="w-3 h-3" />
                        搜索
                      </label>
                      <Input
                        type="text"
                        placeholder="搜索 Agent 包..."
                        className="cyber-input"
                        value={agentPackageFilters.search}
                        onChange={(e) => setAgentPackageFilters({ ...agentPackageFilters, search: e.target.value })}
                      />
                    </div>
                    <div className="sm:w-48">
                      <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block flex items-center gap-2">
                        <Filter className="w-3 h-3" />
                        可见性
                      </label>
                      <Select
                        value={agentPackageFilters.is_public === undefined ? "all" : agentPackageFilters.is_public ? "public" : "private"}
                        onValueChange={(val) => setAgentPackageFilters({ ...agentPackageFilters, is_public: val === "all" ? undefined : val === "public" })}
                      >
                        <SelectTrigger className="cyber-input">
                          <SelectValue placeholder="全部" />
                        </SelectTrigger>
                        <SelectContent className="cyber-dialog border-border">
                          <SelectItem value="all">全部</SelectItem>
                          <SelectItem value="public">公开</SelectItem>
                          <SelectItem value="private">私有</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {/* Agent Packages grid */}
                {agentPackagesLoading ? (
                  <div className="text-center py-12">
                    <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
                    <p className="text-muted-foreground font-mono">加载中...</p>
                  </div>
                ) : agentPackages.length === 0 ? (
                  <div className="empty-state">
                    <Bot className="empty-state-icon" />
                    <p className="empty-state-title">暂无 Agent 包</p>
                    <p className="empty-state-description">点击上方按钮上传 Agent 包</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {agentPackages.map((pkg) => (
                      <div key={pkg.id} className="cyber-card p-4 hover:border-primary transition-all group">
                        <div className="flex justify-between items-start mb-3 pb-3 border-b border-border">
                          <div className="flex items-start space-x-3">
                            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-primary bg-primary/20">
                              <Package className="w-5 h-5" />
                            </div>
                            <div className="flex-1">
                              <h4 className="font-bold text-base text-foreground mb-1 group-hover:text-primary transition-colors uppercase">
                                {pkg.name}
                              </h4>
                              <div className="flex items-center space-x-1 text-xs text-muted-foreground font-mono">
                                <span className="text-primary">{">"}</span>
                                <span>v{pkg.version}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {pkg.is_public && (
                              <Badge className="cyber-badge-muted">
                                <Globe className="w-3 h-3 mr-1" />
                                公开
                              </Badge>
                            )}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <p className="text-muted-foreground text-sm">{pkg.description || "暂无描述"}</p>
                          
                          <div className="flex gap-4 text-xs text-muted-foreground font-mono">
                            <div className="flex items-center gap-1">
                              <Bot className="w-3 h-3" />
                              <span>{pkg.agents_count} 个 Agent</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Code2 className="w-3 h-3" />
                              <span>{pkg.skills_count} 个 Skill</span>
                            </div>
                          </div>

                          <div className="flex justify-between items-center pt-2">
                            <div className="text-xs text-muted-foreground font-mono">
                              {pkg.author && `作者: ${pkg.author}`}
                            </div>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs cyber-btn-ghost"
                                title="查看详情"
                                onClick={() => handleViewAgentPackageDetails(pkg)}
                              >
                                <Eye className="w-3 h-3 mr-1" />
                                详情
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs cyber-btn-ghost"
                                title="下载"
                                disabled={downloadingAgentPackageId === pkg.id}
                                onClick={() => handleDownloadAgentPackage(pkg)}
                              >
                                {downloadingAgentPackageId === pkg.id ? (
                                  <div className="loading-spinner w-3 h-3 mr-1" />
                                ) : (
                                  <Download className="w-3 h-3 mr-1" />
                                )}
                                下载
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-xs cyber-btn-ghost text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                                title="删除"
                                onClick={() => {
                                  setAgentPackageToDelete(pkg);
                                  setShowAgentPackageDeleteDialog(true);
                                }}
                              >
                                <Trash2 className="w-3 h-3 mr-1" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </TabsContent>

        {/* ============== MCPS TAB CONTENT ============== */}
        <TabsContent value="mcps" className="mt-6 space-y-6">
          {/* Header */}
          <div className="cyber-card p-0">
            <div className="cyber-card-header">
              <Server className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">MCP 管理</h3>
              <div className="ml-auto">
                <Button variant="outline" onClick={openCreateMcp} className="cyber-btn-primary">
                  <Plus className="w-4 h-4 mr-2" />
                  添加 MCP
                </Button>
              </div>
            </div>
            <div className="p-6">
              <p className="text-muted-foreground font-mono">管理 MCP (Model Context Protocol) 配置</p>
            </div>
          </div>

          {/* Main content */}
          <div className="cyber-card p-0">
            <div className="p-6 space-y-6">
              {/* Filters */}
              <div className="cyber-bg-elevated border border-border p-4 rounded-lg mb-6">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block flex items-center gap-2">
                      <Search className="w-3 h-3" />
                      搜索
                    </label>
                    <Input
                      type="text"
                      placeholder="搜索 MCPs..."
                      className="cyber-input"
                      value={mcpFilters.search}
                      onChange={(e) => setMcpFilters({ ...mcpFilters, search: e.target.value })}
                    />
                  </div>
                  <div className="sm:w-48">
                    <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block flex items-center gap-2">
                      <Filter className="w-3 h-3" />
                      类型
                    </label>
                    <Select
                      value={mcpFilters.mcp_type}
                      onValueChange={(val) => setMcpFilters({ ...mcpFilters, mcp_type: val === "all" ? "" : val })}
                    >
                      <SelectTrigger className="cyber-input">
                        <SelectValue placeholder="全部类型" />
                      </SelectTrigger>
                      <SelectContent className="cyber-dialog border-border">
                        <SelectItem value="all">全部类型</SelectItem>
                        <SelectItem value="stdio">stdio</SelectItem>
                        <SelectItem value="sse">sse</SelectItem>
                        <SelectItem value="http">http</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* MCPs list */}
              {mcpsLoading ? (
                <div className="text-center py-12">
                  <div className="loading-spinner w-8 h-8 mx-auto mb-4"></div>
                  <p className="text-muted-foreground font-mono">加载中...</p>
                </div>
              ) : mcps.length === 0 ? (
                <div className="empty-state">
                  <Server className="empty-state-icon" />
                  <p className="empty-state-title">暂无 MCPs</p>
                  <p className="empty-state-description">点击"添加 MCP"开始配置</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {mcps.map((mcp) => (
                    <div key={mcp.id} className="cyber-card p-4 hover:border-primary transition-all group">
                      <div className="flex justify-between items-start mb-3 pb-3 border-b border-border">
                        <div className="flex items-start space-x-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getMcpTypeColor(mcp.mcp_type)}`}>
                            <Server className="w-5 h-5" />
                          </div>
                          <div className="flex-1">
                            <h4 className="font-bold text-base text-foreground mb-1 group-hover:text-primary transition-colors uppercase">
                              {mcp.name}
                            </h4>
                            <div className="flex items-center space-x-1 text-xs text-muted-foreground font-mono">
                              <span className="text-primary">{">"}</span>
                              <span>v{mcp.version}</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getMcpTypeColor(mcp.mcp_type)}>{mcp.mcp_type}</Badge>
                          <Badge className={mcp.is_active ? "cyber-badge-success" : "cyber-badge-muted"}>
                            {mcp.is_active ? "启用" : "禁用"}
                          </Badge>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <p className="text-muted-foreground text-sm">{mcp.description}</p>

                        <div className="flex justify-between items-center">
                          <div className="text-xs text-muted-foreground font-mono">
                            工具: {mcp.tools?.length || 0}
                          </div>
                          <div className="flex gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs cyber-btn-ghost"
                              title="查看"
                              onClick={() => openViewMcp(mcp)}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              查看
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs cyber-btn-ghost"
                              title="刷新工具"
                              disabled={refreshingTools === mcp.id}
                              onClick={() => refreshMcpTools(mcp.id)}
                            >
                              {refreshingTools === mcp.id ? (
                                <div className="loading-spinner w-3 h-3 mr-1" />
                              ) : (
                                <RefreshCw className="w-3 h-3 mr-1" />
                              )}
                              刷新
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className={`h-7 px-2 text-xs cyber-btn-ghost ${
                                mcp.is_active
                                  ? "text-amber-400 hover:text-amber-300 hover:bg-amber-500/10"
                                  : "text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                              }`}
                              title={mcp.is_active ? "禁用" : "启用"}
                              onClick={() => toggleMcpActive(mcp.id, mcp.is_active)}
                            >
                              <Power className="w-3 h-3 mr-1" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs cyber-btn-ghost"
                              title="编辑"
                              onClick={() => openEditMcp(mcp)}
                            >
                              <Edit className="w-3 h-3 mr-1" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 px-2 text-xs cyber-btn-ghost text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                              title="删除"
                              onClick={() => openDeleteMcp(mcp)}
                            >
                              <Trash2 className="w-3 h-3 mr-1" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
         </TabsContent>

        {/* ============== FILE MANAGEMENT TAB CONTENT ============== */}
        <TabsContent value="file" className="mt-6 space-y-6">
          {/* Header */}
          <div className="cyber-card p-0">
            <div className="cyber-card-header">
              <FileText className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">文件管理</h3>
              <div className="ml-auto">
                <Button
                  onClick={handleSaveRaw}
                  className="cyber-btn-primary ml-2"
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
            <div className="p-6">
              <p className="text-muted-foreground font-mono">直接编辑 opencode.json 原始配置文件</p>
            </div>
          </div>

          {/* Raw JSON editor */}
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

         {/* ============== MODELS DIALOGS ============== */}
         {/* Provider Dialog */}
         <Dialog open={showProviderDialog} onOpenChange={setShowProviderDialog}>
                 <DialogContent className="!w-[min(90vw,600px)] !max-w-none cyber-dialog border border-border rounded-lg">
                   <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
                     <DialogTitle className="flex items-center gap-3 font-mono text-foreground">
                       <div className="p-2 bg-primary/20 rounded border border-primary/30">
                         <Settings className="w-5 h-5 text-primary" />
                       </div>
                       <div>
                         <span className="text-base font-bold uppercase tracking-wider">
                           {editingProviderId ? "编辑供应商" : "添加供应商"}
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
                         placeholder="例如: openai, anthropic, llm"
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
                      <Button
                        variant="outline"
                        onClick={() => setShowProviderDialog(false)}
                        className="cyber-btn-outline"
                        disabled={providerSaving}
                      >
                        取消
                      </Button>
                      <Button 
                        onClick={handleSaveProvider} 
                        className="cyber-btn-primary"
                        disabled={providerSaving}
                      >
                        {providerSaving ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            保存中...
                          </>
                        ) : (
                          editingProviderId ? "更新" : "添加"
                        )}
                      </Button>
                    </DialogFooter>
                 </DialogContent>
               </Dialog>

         {/* Model Dialog */}
         <Dialog open={showModelDialog} onOpenChange={setShowModelDialog}>
                 <DialogContent className="!w-[min(90vw,500px)] !max-w-none cyber-dialog border border-border rounded-lg">
                   <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
                     <DialogTitle className="flex items-center gap-3 font-mono text-foreground">
                       <div className="p-2 bg-primary/20 rounded border border-primary/30">
                         <Cpu className="w-5 h-5 text-primary" />
                       </div>
                       <div>
                         <span className="text-base font-bold uppercase tracking-wider">
                           {editingModelId ? "编辑模型" : "添加模型"}
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
                      <Button
                        variant="outline"
                        onClick={() => setShowModelDialog(false)}
                        className="cyber-btn-outline"
                        disabled={modelSaving}
                      >
                        取消
                      </Button>
                      <Button 
                        onClick={handleSaveModel} 
                        className="cyber-btn-primary"
                        disabled={modelSaving}
                      >
                        {modelSaving ? (
                          <>
                            <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                            保存中...
                          </>
                        ) : (
                          editingModelId ? "更新" : "添加"
                        )}
                     </Button>
                   </DialogFooter>
                 </DialogContent>
               </Dialog>
        </Tabs>

        {/* ============== SKILLS UPLOAD DIALOG ============== */}
      <Dialog
        open={showSkillUploadDialog}
        onOpenChange={(open) => {
          setShowSkillUploadDialog(open);
          if (!open) resetSkillUploadForm();
        }}
      >
        <DialogContent className="!w-[min(90vw,700px)] !max-w-none max-h-[85vh] flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg">
          <div className="flex items-center gap-2 px-4 py-3 cyber-bg-elevated border-b border-border flex-shrink-0">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="ml-2 font-mono text-xs text-muted-foreground tracking-wider">
              upload_skill@godeepaudit
            </span>
          </div>

          <DialogHeader className="px-6 pt-4 flex-shrink-0">
            <DialogTitle className="font-mono text-lg uppercase tracking-wider flex items-center gap-2 text-foreground">
              <Terminal className="w-5 h-5 text-primary" />
              上传新 Skill
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6">
            <form onSubmit={handleUploadSkill} className="flex flex-col gap-5">
              <div className="space-y-1.5">
                <Label className="font-mono font-bold uppercase text-xs text-muted-foreground">版本</Label>
                <Input
                  type="text"
                  className="cyber-input"
                  value={skillUploadForm.version}
                  onChange={(e) => setSkillUploadForm({ ...skillUploadForm, version: e.target.value })}
                  placeholder="1.0.0"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="font-mono font-bold uppercase text-xs text-muted-foreground">分类</Label>
                <Select
                  value={skillUploadForm.category}
                  onValueChange={(val) => setSkillUploadForm({ ...skillUploadForm, category: val as any })}
                >
                  <SelectTrigger className="cyber-input">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="cyber-dialog border-border">
                    <SelectItem value="security">安全</SelectItem>
                    <SelectItem value="analysis">分析</SelectItem>
                    <SelectItem value="utility">工具</SelectItem>
                    <SelectItem value="custom">自定义</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                <Label className="font-mono font-bold uppercase text-xs text-muted-foreground">Skill 文件 *</Label>

                {skillUploadForm.files.length === 0 ? (
                  <div
                    className="border border-dashed border-border bg-muted/50 rounded p-6 text-center hover:bg-muted hover:border-border transition-colors cursor-pointer group"
                    onClick={() => skillFileInputRef.current?.click()}
                  >
                    <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3 group-hover:text-primary transition-colors" />
                    <h3 className="text-base font-bold text-foreground uppercase mb-1">上传 Skill 文件</h3>
                    <p className="text-xs font-mono text-muted-foreground mb-3">选择一个或多个 .zip Skill 文件</p>
                    <input
                      ref={skillFileInputRef}
                      type="file"
                      accept=".zip"
                      multiple
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setSkillUploadForm({ ...skillUploadForm, files });
                      }}
                      className="hidden"
                      disabled={skillUploading}
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="cyber-btn-outline h-8 text-xs"
                      disabled={skillUploading}
                      onClick={(e) => {
                        e.stopPropagation();
                        skillFileInputRef.current?.click();
                      }}
                    >
                      <FileText className="w-3 h-3 mr-2" />
                      选择文件
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-mono text-foreground">
                        已选择 {skillUploadForm.files.length} 个文件
                      </span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSkillUploadForm({ ...skillUploadForm, files: [] });
                          if (skillFileInputRef.current) {
                            skillFileInputRef.current.value = "";
                          }
                        }}
                        disabled={skillUploading}
                        className="h-7 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        清空
                      </Button>
                    </div>
                    <div className="border border-border bg-muted/50 rounded max-h-[200px] overflow-y-auto">
                      {skillUploadForm.files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-3 border-b border-border last:border-b-0">
                          <div className="flex items-center space-x-3 overflow-hidden">
                            <div className="w-8 h-8 bg-muted border border-border rounded flex items-center justify-center flex-shrink-0">
                              <FileText className="w-4 h-4 text-primary" />
                            </div>
                            <div className="min-w-0">
                              <p className="font-mono text-sm text-foreground truncate">{file.name}</p>
                              <p className="font-mono text-xs text-muted-foreground">
                                {(file.size / 1024).toFixed(2)} KB
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5" />
                    <div className="text-xs font-mono text-amber-300">
                      <p className="font-bold mb-1 uppercase">上传说明:</p>
                      <ul className="space-y-0.5 list-disc list-inside text-amber-400/80">
                        <li>仅支持 ZIP 格式</li>
                        <li>ZIP 根目录下必须包含 SKILL.md 文件</li>
                        <li>自动从 SKILL.md 提取 name 和 description</li>
                        <li>支持批量上传多个文件</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              {/* Upload results */}
              {skillUploadResults && (
                <div className="space-y-3">
                  {skillUploadResults.success.length > 0 && (
                    <div className="bg-green-500/10 border border-green-500/30 p-3 rounded">
                      <p className="text-sm font-mono text-green-400 font-bold mb-2">
                        ✓ 成功上传 {skillUploadResults.success.length} 个 Skill
                      </p>
                      <div className="space-y-1 max-h-[100px] overflow-y-auto">
                        {skillUploadResults.success.map((item, index) => (
                          <p key={index} className="text-xs font-mono text-green-300">
                            {item.skill?.name || item.filename}
                          </p>
                        ))}
                      </div>
                    </div>
                  )}
                  {skillUploadResults.failed.length > 0 && (
                    <div className="bg-rose-500/10 border border-rose-500/30 p-3 rounded">
                      <p className="text-sm font-mono text-rose-400 font-bold mb-2">
                        ✗ 失败 {skillUploadResults.failed.length} 个 Skill
                      </p>
                      <div className="space-y-1 max-h-[100px] overflow-y-auto">
                        {skillUploadResults.failed.map((item, index) => (
                          <div key={index} className="text-xs font-mono">
                            <span className="text-rose-300">{item.filename}: </span>
                            <span className="text-rose-200">{item.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="skill-public"
                  checked={skillUploadForm.is_public}
                  onCheckedChange={(checked) =>
                    setSkillUploadForm({ ...skillUploadForm, is_public: checked as boolean })
                  }
                />
                <label htmlFor="skill-public" className="text-sm text-muted-foreground font-mono cursor-pointer">
                  公开分享
                </label>
              </div>

              <div className="flex justify-end space-x-4 pt-4 border-t border-border mt-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowSkillUploadDialog(false)}
                  className="cyber-btn-outline"
                >
                  {skillUploadResults ? "关闭" : "取消"}
                </Button>
                {!skillUploadResults && (
                  <Button
                    type="submit"
                    className="cyber-btn-primary"
                    disabled={skillUploading || skillUploadForm.files.length === 0}
                  >
                    {skillUploading ? (
                      <>
                        <div className="loading-spinner w-4 h-4 mr-2"></div>
                        上传中...
                      </>
                    ) : skillUploadForm.files.length > 1 ? (
                      `批量上传 ${skillUploadForm.files.length} 个`
                    ) : (
                      "上传"
                    )}
                  </Button>
                )}
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============== SKILLS DELETE DIALOG ============== */}
      <Dialog open={showSkillDeleteDialog} onOpenChange={setShowSkillDeleteDialog}>
        <DialogContent className="cyber-dialog border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold uppercase tracking-wider text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              确认删除 Skill
            </DialogTitle>
            <DialogDescription className="text-muted-foreground font-mono">
              此操作将同时删除文件和数据库记录，且无法恢复。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-foreground font-mono">
              确定要删除 Skill{" "}
              <span className="font-bold text-primary">{skillToDelete?.name}</span> 吗？
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowSkillDeleteDialog(false);
                setSkillToDelete(null);
              }}
              className="cyber-btn-outline"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleDeleteSkill}
              disabled={skillDeleting}
              className="cyber-btn-primary bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500/30"
            >
              {skillDeleting ? (
                <>
                  <div className="loading-spinner w-4 h-4 mr-2"></div>
                  删除中...
                </>
              ) : (
                "确认删除"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== MCPS CREATE DIALOG ============== */}
      <Dialog open={showMcpCreateDialog} onOpenChange={setShowMcpCreateDialog}>
        <DialogContent className="!w-[min(90vw,600px)] !max-w-none cyber-dialog border border-border rounded-lg">
          <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
            <DialogTitle className="flex items-center gap-3 font-mono text-foreground">
              <div className="p-2 bg-primary/20 rounded border border-primary/30">
                <Plus className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="text-base font-bold uppercase tracking-wider">添加 MCP</span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">名称 *</Label>
              <Input
                value={mcpForm.name}
                onChange={(e) => setMcpForm({ ...mcpForm, name: e.target.value })}
                placeholder="my-mcp"
                className="cyber-input"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">类型 *</Label>
              <Select
                value={mcpForm.mcp_type}
                onValueChange={(val) => setMcpForm({ ...mcpForm, mcp_type: val as any })}
              >
                <SelectTrigger className="cyber-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="cyber-dialog border-border">
                  <SelectItem value="stdio">stdio</SelectItem>
                  <SelectItem value="sse">sse</SelectItem>
                  <SelectItem value="http">http</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">版本</Label>
              <Input
                value={mcpForm.version}
                onChange={(e) => setMcpForm({ ...mcpForm, version: e.target.value })}
                placeholder="1.0.0"
                className="cyber-input"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">描述</Label>
              <Textarea
                value={mcpForm.description}
                onChange={(e) => setMcpForm({ ...mcpForm, description: e.target.value })}
                placeholder="MCP 描述..."
                className="cyber-input"
              />
            </div>

            {mcpForm.mcp_type === "http" && (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Server URL *</Label>
                <Input
                  value={mcpForm.server_url}
                  onChange={(e) => setMcpForm({ ...mcpForm, server_url: e.target.value })}
                  placeholder="https://example.com/mcp"
                  className="cyber-input"
                />
              </div>
            )}

            {mcpForm.mcp_type !== "http" && (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Command *</Label>
                <Input
                  value={mcpForm.command}
                  onChange={(e) => setMcpForm({ ...mcpForm, command: e.target.value })}
                  placeholder="npx"
                  className="cyber-input"
                />
              </div>
            )}

            {mcpForm.mcp_type !== "http" && (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Args (每行一个)</Label>
                <Textarea
                  value={mcpForm.args}
                  onChange={(e) => setMcpForm({ ...mcpForm, args: e.target.value })}
                  placeholder="-p @modelcontextprotocol/server-filesystem\n/path/to/files"
                  className="cyber-input font-mono"
                  rows={3}
                />
              </div>
            )}

            {mcpForm.mcp_type !== "http" && (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Env (每行 KEY=VALUE)</Label>
                <Textarea
                  value={mcpForm.env}
                  onChange={(e) => setMcpForm({ ...mcpForm, env: e.target.value })}
                  placeholder="API_KEY=xxx"
                  className="cyber-input font-mono"
                  rows={3}
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
            <Button
              variant="outline"
              onClick={() => setShowMcpCreateDialog(false)}
              className="cyber-btn-outline"
            >
              取消
            </Button>
            <Button
              onClick={handleCreateMcp}
              className="cyber-btn-primary"
              disabled={mcpFormSubmitting || !mcpForm.name}
            >
              {mcpFormSubmitting ? (
                <>
                  <div className="loading-spinner w-4 h-4 mr-2" />
                  创建中...
                </>
              ) : (
                "添加"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== MCPS EDIT DIALOG ============== */}
      <Dialog open={showMcpEditDialog} onOpenChange={setShowMcpEditDialog}>
        <DialogContent className="!w-[min(90vw,600px)] !max-w-none cyber-dialog border border-border rounded-lg">
          <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
            <DialogTitle className="flex items-center gap-3 font-mono text-foreground">
              <div className="p-2 bg-primary/20 rounded border border-primary/30">
                <Edit className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="text-base font-bold uppercase tracking-wider">编辑 MCP</span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">名称 *</Label>
              <Input
                value={mcpForm.name}
                onChange={(e) => setMcpForm({ ...mcpForm, name: e.target.value })}
                className="cyber-input"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">类型 *</Label>
              <Select
                value={mcpForm.mcp_type}
                onValueChange={(val) => setMcpForm({ ...mcpForm, mcp_type: val as any })}
              >
                <SelectTrigger className="cyber-input">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="cyber-dialog border-border">
                  <SelectItem value="stdio">stdio</SelectItem>
                  <SelectItem value="sse">sse</SelectItem>
                  <SelectItem value="http">http</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">版本</Label>
              <Input
                value={mcpForm.version}
                onChange={(e) => setMcpForm({ ...mcpForm, version: e.target.value })}
                className="cyber-input"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-xs font-bold text-muted-foreground uppercase">描述</Label>
              <Textarea
                value={mcpForm.description}
                onChange={(e) => setMcpForm({ ...mcpForm, description: e.target.value })}
                className="cyber-input"
              />
            </div>

            {mcpForm.mcp_type === "http" && (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Server URL *</Label>
                <Input
                  value={mcpForm.server_url}
                  onChange={(e) => setMcpForm({ ...mcpForm, server_url: e.target.value })}
                  className="cyber-input"
                />
              </div>
            )}

            {mcpForm.mcp_type !== "http" && (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Command *</Label>
                <Input
                  value={mcpForm.command}
                  onChange={(e) => setMcpForm({ ...mcpForm, command: e.target.value })}
                  className="cyber-input"
                />
              </div>
            )}

            {mcpForm.mcp_type !== "http" && (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Args (每行一个)</Label>
                <Textarea
                  value={mcpForm.args}
                  onChange={(e) => setMcpForm({ ...mcpForm, args: e.target.value })}
                  className="cyber-input font-mono"
                  rows={3}
                />
              </div>
            )}

            {mcpForm.mcp_type !== "http" && (
              <div className="space-y-2">
                <Label className="text-xs font-bold text-muted-foreground uppercase">Env (每行 KEY=VALUE)</Label>
                <Textarea
                  value={mcpForm.env}
                  onChange={(e) => setMcpForm({ ...mcpForm, env: e.target.value })}
                  className="cyber-input font-mono"
                  rows={3}
                />
              </div>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
            <Button
              variant="outline"
              onClick={() => setShowMcpEditDialog(false)}
              className="cyber-btn-outline"
            >
              取消
            </Button>
            <Button
              onClick={handleUpdateMcp}
              className="cyber-btn-primary"
              disabled={mcpFormSubmitting || !mcpForm.name}
            >
              {mcpFormSubmitting ? (
                <>
                  <div className="loading-spinner w-4 h-4 mr-2" />
                  保存中...
                </>
              ) : (
                "保存"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== MCPS VIEW DIALOG ============== */}
      <Dialog open={showMcpViewDialog} onOpenChange={setShowMcpViewDialog}>
        <DialogContent className="!w-[min(90vw,700px)] !max-w-none cyber-dialog border border-border rounded-lg">
          <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
            <DialogTitle className="flex items-center gap-3 font-mono text-foreground">
              <div className="p-2 bg-primary/20 rounded border border-primary/30">
                <Eye className="w-5 h-5 text-primary" />
              </div>
              <div>
                <span className="text-base font-bold uppercase tracking-wider">查看 MCP</span>
              </div>
            </DialogTitle>
          </DialogHeader>

          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            {selectedMcp && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground uppercase">名称</Label>
                    <p className="text-foreground font-mono">{selectedMcp.name}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground uppercase">类型</Label>
                    <p className="text-foreground font-mono">{selectedMcp.mcp_type}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground uppercase">版本</Label>
                    <p className="text-foreground font-mono">{selectedMcp.version}</p>
                  </div>
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground uppercase">作者</Label>
                    <p className="text-foreground font-mono">{selectedMcp.author}</p>
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold text-muted-foreground uppercase">描述</Label>
                  <p className="text-foreground font-mono">{selectedMcp.description}</p>
                </div>

                {selectedMcp.mcp_type === "http" && selectedMcp.server_url && (
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Server URL</Label>
                    <p className="text-foreground font-mono">{selectedMcp.server_url}</p>
                  </div>
                )}

                {selectedMcp.mcp_type !== "http" && selectedMcp.command && (
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Command</Label>
                    <p className="text-foreground font-mono">{selectedMcp.command}</p>
                  </div>
                )}

                {selectedMcp.mcp_type !== "http" && selectedMcp.args && selectedMcp.args.length > 0 && (
                  <div>
                    <Label className="text-xs font-bold text-muted-foreground uppercase">Args</Label>
                    <div className="bg-muted border border-border rounded p-2 font-mono text-xs">
                      {selectedMcp.args.join("\n")}
                    </div>
                  </div>
                )}

                <div>
                  <Label className="text-xs font-bold text-muted-foreground uppercase">工具列表</Label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {selectedMcp.tools && selectedMcp.tools.length > 0 ? (
                      selectedMcp.tools.map((tool: any, index: number) => (
                        <Badge key={index} className="cyber-badge-muted">
                          {tool.name}
                        </Badge>
                      ))
                    ) : (
                      <span className="text-xs text-muted-foreground">暂无工具</span>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
            <Button
              variant="outline"
              onClick={() => setShowMcpViewDialog(false)}
              className="cyber-btn-outline"
            >
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ============== MCPS DELETE DIALOG ============== */}
      <Dialog open={showMcpDeleteDialog} onOpenChange={setShowMcpDeleteDialog}>
        <DialogContent className="cyber-dialog border-border">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold uppercase tracking-wider text-rose-400 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5" />
              确认删除 MCP
            </DialogTitle>
            <DialogDescription className="text-muted-foreground font-mono">
              此操作将同时删除数据库记录，且无法恢复。
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-foreground font-mono">
              确定要删除 MCP{" "}
              <span className="font-bold text-primary">{selectedMcp?.name}</span> 吗？
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowMcpDeleteDialog(false);
                setSelectedMcp(null);
              }}
              className="cyber-btn-outline"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleDeleteMcp}
              disabled={mcpFormSubmitting}
              className="cyber-btn-primary bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500/30"
            >
              {mcpFormSubmitting ? (
                <>
                  <div className="loading-spinner w-4 h-4 mr-2"></div>
                  删除中...
                </>
              ) : (
                "确认删除"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
       </Dialog>

       {/* ============== AGENT PACKAGE UPLOAD DIALOG ============== */}
       <Dialog
         open={showAgentPackageUploadDialog}
         onOpenChange={(open) => {
           setShowAgentPackageUploadDialog(open);
         }}
       >
         <DialogContent className="!w-[min(90vw,600px)] !max-w-none cyber-dialog border border-border rounded-lg">
           <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
             <DialogTitle className="flex items-center gap-3 font-mono text-foreground">
               <div className="p-2 bg-primary/20 rounded border border-primary/30">
                 <Upload className="w-5 h-5 text-primary" />
               </div>
               <div>
                 <span className="text-base font-bold uppercase tracking-wider">上传 Agent 包</span>
               </div>
             </DialogTitle>
           </DialogHeader>

           <div className="p-6 space-y-4">
             <div className="space-y-4">
               <Label className="font-mono font-bold uppercase text-xs text-muted-foreground">Agent 包文件 *</Label>

               <div
                 className="border border-dashed border-border bg-muted/50 rounded p-6 text-center hover:bg-muted hover:border-border transition-colors cursor-pointer group"
                 onClick={() => agentPackageFileInputRef.current?.click()}
               >
                 <Package className="w-10 h-10 text-muted-foreground mx-auto mb-3 group-hover:text-primary transition-colors" />
                 <h3 className="text-base font-bold text-foreground uppercase mb-1">上传 Agent 包</h3>
                 <p className="text-xs font-mono text-muted-foreground mb-3">选择 .zip Agent 包文件</p>
                 <input
                   ref={agentPackageFileInputRef}
                   type="file"
                   accept=".zip"
                   onChange={(e) => {
                     const file = e.target.files?.[0];
                     if (file) handleAgentPackageUpload(file);
                   }}
                   className="hidden"
                   disabled={agentPackageUploading}
                   required
                 />
                 <Button
                   type="button"
                   variant="outline"
                   className="cyber-btn-outline h-8 text-xs"
                   disabled={agentPackageUploading}
                   onClick={(e) => {
                     e.stopPropagation();
                     agentPackageFileInputRef.current?.click();
                   }}
                 >
                   <FileText className="w-3 h-3 mr-2" />
                   选择文件
                 </Button>
               </div>

               <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded">
                 <div className="flex items-start space-x-3">
                   <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5" />
                   <div className="text-xs font-mono text-amber-300">
                     <p className="font-bold mb-1 uppercase">上传说明:</p>
                     <ul className="space-y-0.5 list-disc list-inside text-amber-400/80">
                       <li>仅支持 ZIP 格式</li>
                       <li>ZIP 根目录下必须包含 AGENTS.md 文件</li>
                       <li>可选包含 skills/ 目录</li>
                     </ul>
                   </div>
                 </div>
               </div>
             </div>
           </div>

           <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
             <Button
               variant="outline"
               onClick={() => setShowAgentPackageUploadDialog(false)}
               className="cyber-btn-outline"
               disabled={agentPackageUploading}
             >
               取消
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

       {/* ============== AGENT PACKAGE DELETE DIALOG ============== */}
       <Dialog open={showAgentPackageDeleteDialog} onOpenChange={setShowAgentPackageDeleteDialog}>
         <DialogContent className="cyber-dialog border-border">
           <DialogHeader>
             <DialogTitle className="text-lg font-bold uppercase tracking-wider text-rose-400 flex items-center gap-2">
               <AlertTriangle className="w-5 h-5" />
               确认删除 Agent 包
             </DialogTitle>
             <DialogDescription className="text-muted-foreground font-mono">
               此操作将同时删除所有相关的 Agents、Skills 和文件，且无法恢复。
             </DialogDescription>
           </DialogHeader>
           <div className="py-4">
             <p className="text-foreground font-mono">
               确定要删除 Agent 包{" "}
               <span className="font-bold text-primary">{agentPackageToDelete?.name}</span> 吗？
             </p>
           </div>
           <DialogFooter>
             <Button
               type="button"
               variant="outline"
               onClick={() => {
                 setShowAgentPackageDeleteDialog(false);
                 setAgentPackageToDelete(null);
               }}
               className="cyber-btn-outline"
             >
               取消
             </Button>
             <Button
               type="button"
               onClick={handleDeleteAgentPackage}
               disabled={agentPackageDeleting}
               className="cyber-btn-primary bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500/30"
             >
               {agentPackageDeleting ? (
                 <>
                   <div className="loading-spinner w-4 h-4 mr-2"></div>
                   删除中...
                 </>
               ) : (
                 "确认删除"
               )}
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>

       {/* ============== AGENT PACKAGE DETAILS DIALOG ============== */}
       <Dialog open={showAgentPackageDetailsDialog} onOpenChange={setShowAgentPackageDetailsDialog}>
         <DialogContent className="!w-[min(90vw,800px)] !max-w-none cyber-dialog border border-border rounded-lg">
           <DialogHeader className="px-6 py-4 border-b border-border flex-shrink-0 bg-muted">
             <DialogTitle className="flex items-center gap-3 font-mono text-foreground">
               <div className="p-2 bg-primary/20 rounded border border-primary/30">
                 <Eye className="w-5 h-5 text-primary" />
               </div>
               <div>
                 <span className="text-base font-bold uppercase tracking-wider">Agent 包详情</span>
               </div>
             </DialogTitle>
           </DialogHeader>

           <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
             {selectedAgentPackage && (
               <>
                 <div className="grid grid-cols-2 gap-4">
                   <div>
                     <Label className="text-xs font-bold text-muted-foreground uppercase">名称</Label>
                     <p className="text-foreground font-mono">{selectedAgentPackage.name}</p>
                   </div>
                   <div>
                     <Label className="text-xs font-bold text-muted-foreground uppercase">版本</Label>
                     <p className="text-foreground font-mono">{selectedAgentPackage.version}</p>
                   </div>
                   {selectedAgentPackage.author && (
                     <div>
                       <Label className="text-xs font-bold text-muted-foreground uppercase">作者</Label>
                       <p className="text-foreground font-mono">{selectedAgentPackage.author}</p>
                     </div>
                   )}
                   <div>
                     <Label className="text-xs font-bold text-muted-foreground uppercase">可见性</Label>
                     <Badge className={selectedAgentPackage.is_public ? "cyber-badge-primary" : "cyber-badge-muted"}>
                       {selectedAgentPackage.is_public ? "公开" : "私有"}
                     </Badge>
                   </div>
                 </div>

                 {selectedAgentPackage.description && (
                   <div>
                     <Label className="text-xs font-bold text-muted-foreground uppercase">描述</Label>
                     <p className="text-foreground font-mono">{selectedAgentPackage.description}</p>
                   </div>
                 )}

                 {/* Agents 列表 */}
                 <div>
                   <Label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                     <Bot className="w-3 h-3" />
                     Agents ({selectedAgentPackage.package_agents?.length || 0})
                   </Label>
                   {selectedAgentPackage.package_agents && selectedAgentPackage.package_agents.length > 0 ? (
                     <div className="mt-2 space-y-2">
                       {selectedAgentPackage.package_agents.map((agent, index) => (
                         <div key={index} className="border border-border bg-muted/50 rounded p-3">
                           <div className="flex justify-between items-center">
                             <div>
                               <p className="font-mono text-sm text-foreground font-bold">{agent.name}</p>
                               <p className="font-mono text-xs text-muted-foreground">{agent.file_name}</p>
                             </div>
                           </div>
                         </div>
                       ))}
                     </div>
                   ) : (
                     <p className="text-xs text-muted-foreground mt-2">暂无 Agents</p>
                   )}
                 </div>

                 {/* Skills 列表 */}
                 <div>
                   <Label className="text-xs font-bold text-muted-foreground uppercase flex items-center gap-2">
                     <Code2 className="w-3 h-3" />
                     Skills ({selectedAgentPackage.package_skills?.length || 0})
                   </Label>
                   {selectedAgentPackage.package_skills && selectedAgentPackage.package_skills.length > 0 ? (
                     <div className="mt-2 space-y-2">
                       {selectedAgentPackage.package_skills.map((skill, index) => (
                         <div key={index} className="border border-border bg-muted/50 rounded p-3">
                           <div className="flex justify-between items-center">
                             <div>
                               <p className="font-mono text-sm text-foreground font-bold">{skill.name}</p>
                               <p className="font-mono text-xs text-muted-foreground">v{skill.version} · {skill.category}</p>
                             </div>
                           </div>
                           {skill.description && (
                             <p className="font-mono text-xs text-muted-foreground mt-1">{skill.description}</p>
                           )}
                         </div>
                       ))}
                     </div>
                   ) : (
                     <p className="text-xs text-muted-foreground mt-2">暂无 Skills</p>
                   )}
                 </div>
               </>
             )}
           </div>

           <DialogFooter className="flex-shrink-0 flex justify-end gap-3 px-6 py-4 bg-muted border-t border-border">
             <Button
               variant="outline"
               onClick={() => setShowAgentPackageDetailsDialog(false)}
               className="cyber-btn-outline"
             >
               关闭
             </Button>
           </DialogFooter>
         </DialogContent>
       </Dialog>
     </div>
   );
 }
