// Skill Marketplace Page - Cyberpunk Terminal Aesthetic
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import {
  Package,
  Upload,
  Search,
  Filter,
  Trash2,
  Eye,
  AlertTriangle,
  Globe,
  Shield,
  Cpu,
  Database,
  Terminal,
  FileText,
  AlertCircle
} from "lucide-react";
import { useRef } from "react";
import { Label } from "@/components/ui/label";
import { opencodeApi, type OpenCodeSkill } from "@/shared/api/opencode";
import { toast } from "sonner";

const SkillMarketplace: React.FC = () => {
  const [skills, setSkills] = useState<OpenCodeSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    category: "",
    search: "",
  });
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [uploadForm, setUploadForm] = useState({
    name: "",
    version: "1.0.0",
    description: "",
    category: "custom" as const,
    is_public: false,
    file: null as File | null,
  });
  const [uploading, setUploading] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [skillToDelete, setSkillToDelete] = useState<OpenCodeSkill | null>(null);
  const [deleting, setDeleting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadSkills();
  }, [filters]);

  const loadSkills = async () => {
    try {
      setLoading(true);
      const data = await opencodeApi.listSkills(filters);
      setSkills(data.items);
    } catch (error) {
      console.error("Failed to load skills:", error);
      toast.error("加载 Skills 失败");
    } finally {
      setLoading(false);
    }
  };

  const handleUploadSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.file) {
      toast.error("请选择要上传的文件");
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", uploadForm.file);
      formData.append("name", uploadForm.name);
      formData.append("version", uploadForm.version);
      formData.append("description", uploadForm.description);
      formData.append("category", uploadForm.category);
      formData.append("is_public", uploadForm.is_public.toString());

      await opencodeApi.uploadSkill(formData);
      toast.success("Skill 上传成功！");
      setShowUploadDialog(false);
      setUploadForm({
        name: "",
        version: "1.0.0",
        description: "",
        category: "custom",
        is_public: false,
        file: null,
      });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      loadSkills();
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
      setUploading(false);
    }
  };

  const handleDeleteSkill = async () => {
    if (!skillToDelete) return;

    try {
      setDeleting(true);
      await opencodeApi.deleteSkill(skillToDelete.id);
      toast.success("Skill 删除成功！");
      setShowDeleteDialog(false);
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
      setDeleting(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'security': return <Shield className="w-4 h-4" />;
      case 'analysis': return <Cpu className="w-4 h-4" />;
      case 'utility': return <Database className="w-4 h-4" />;
      default: return <Package className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'security': return 'text-rose-400 bg-rose-500/20';
      case 'analysis': return 'text-sky-400 bg-sky-500/20';
      case 'utility': return 'text-amber-400 bg-amber-500/20';
      default: return 'text-violet-400 bg-violet-500/20';
    }
  };

  return (
    <div className="space-y-6 p-6 cyber-bg-elevated min-h-screen font-mono relative">
      {/* Grid background */}
      <div className="absolute inset-0 cyber-grid-subtle pointer-events-none" />

      {/* Header Card */}
      <div className="cyber-card p-0 relative z-10">
        <div className="cyber-card-header">
          <Package className="w-5 h-5 text-primary" />
          <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">Skill 市场</h3>
          <div className="ml-auto">
            <Button
              variant="outline"
              onClick={() => setShowUploadDialog(true)}
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

      {/* Main Content Card */}
      <div className="cyber-card p-0 relative z-10">
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
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                />
              </div>
              <div className="sm:w-48">
                <label className="text-xs font-bold text-muted-foreground uppercase mb-2 block flex items-center gap-2">
                  <Filter className="w-3 h-3" />
                  分类
                </label>
                <Select
                  value={filters.category}
                  onValueChange={(value) => setFilters({ ...filters, category: value })}
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

          {/* Content */}
          {loading ? (
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
                <div
                  key={skill.id}
                  className="cyber-card p-4 hover:border-primary transition-all group"
                >
                  <div className="flex justify-between items-start mb-3 pb-3 border-b border-border">
                    <div className="flex items-start space-x-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${getCategoryColor(skill.category)}`}>
                        {getCategoryIcon(skill.category)}
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-base text-foreground mb-1 group-hover:text-primary transition-colors uppercase">{skill.name}</h4>
                        <div className="flex items-center space-x-1 text-xs text-muted-foreground font-mono">
                          <span className="text-primary">{`>`}</span>
                          <span>v{skill.version}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="cyber-badge-muted">
                        {skill.category}
                      </Badge>
                    </div>
                    {skill.is_public && (
                      <Badge className="cyber-badge-muted">
                        <Globe className="w-3 h-3 mr-1" />
                        公开
                      </Badge>
                    )}
                  </div>

                  <div className="space-y-3">
                    <p className="text-muted-foreground text-sm">
                      {skill.description || "暂无描述"}
                    </p>
                    
                    <div className="flex justify-between items-center">
                      <div className="text-xs text-muted-foreground font-mono">
                        作者: {skill.author}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs cyber-btn-ghost"
                          onClick={() => console.log("View skill:", skill.id)}
                        >
                          <Eye className="w-3 h-3 mr-1" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 text-xs cyber-btn-ghost text-rose-400 hover:text-rose-300 hover:bg-rose-500/10"
                          onClick={() => {
                            setSkillToDelete(skill);
                            setShowDeleteDialog(true);
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

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent className="!w-[min(90vw,700px)] !max-w-none max-h-[85vh] flex flex-col p-0 gap-0 cyber-dialog border border-border rounded-lg">
          {/* Terminal Header */}
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
                <Label htmlFor="skill-name" className="font-mono font-bold uppercase text-xs text-muted-foreground">Skill 名称 *</Label>
                <Input
                  id="skill-name"
                  type="text"
                  className="cyber-input"
                  value={uploadForm.name}
                  onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                  placeholder="输入 Skill 名称"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="skill-version" className="font-mono font-bold uppercase text-xs text-muted-foreground">版本</Label>
                <Input
                  id="skill-version"
                  type="text"
                  className="cyber-input"
                  value={uploadForm.version}
                  onChange={(e) => setUploadForm({ ...uploadForm, version: e.target.value })}
                  placeholder="1.0.0"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="skill-description" className="font-mono font-bold uppercase text-xs text-muted-foreground">描述</Label>
                <Textarea
                  id="skill-description"
                  className="cyber-input min-h-[80px]"
                  rows={3}
                  value={uploadForm.description}
                  onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                  placeholder="// Skill 描述..."
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="skill-category" className="font-mono font-bold uppercase text-xs text-muted-foreground">分类</Label>
                <Select
                  value={uploadForm.category}
                  onValueChange={(value) => setUploadForm({ ...uploadForm, category: value as any })}
                >
                  <SelectTrigger id="skill-category" className="cyber-input">
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

                {!uploadForm.file ? (
                  <div
                    className="border border-dashed border-border bg-muted/50 rounded p-6 text-center hover:bg-muted hover:border-border transition-colors cursor-pointer group"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Upload className="w-10 h-10 text-muted-foreground mx-auto mb-3 group-hover:text-primary transition-colors" />
                    <h3 className="text-base font-bold text-foreground uppercase mb-1">上传 Skill 文件</h3>
                    <p className="text-xs font-mono text-muted-foreground mb-3">
                      选择 .zip Skill 文件
                    </p>
                    <input
                      ref={fileInputRef}
                      id="skill-file"
                      type="file"
                      accept=".zip"
                      onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                      className="hidden"
                      disabled={uploading}
                      required
                    />
                    <Button
                      type="button"
                      variant="outline"
                      className="cyber-btn-outline h-8 text-xs"
                      disabled={uploading}
                      onClick={(e) => {
                        e.stopPropagation();
                        fileInputRef.current?.click();
                      }}
                    >
                      <FileText className="w-3 h-3 mr-2" />
                      选择文件
                    </Button>
                  </div>
                ) : (
                  <div className="border border-border bg-muted/50 p-4 flex items-center justify-between rounded">
                    <div className="flex items-center space-x-3 overflow-hidden">
                      <div className="w-10 h-10 bg-muted border border-border rounded flex items-center justify-center flex-shrink-0">
                        <FileText className="w-5 h-5 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-mono font-bold text-sm text-foreground truncate">{uploadForm.file.name}</p>
                        <p className="font-mono text-xs text-muted-foreground">{(uploadForm.file.size / 1024).toFixed(2)} KB</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setUploadForm({ ...uploadForm, file: null });
                        if (fileInputRef.current) {
                          fileInputRef.current.value = '';
                        }
                      }}
                      disabled={uploading}
                      className="hover:bg-rose-500/10 hover:text-rose-400"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}

                  <div className="bg-amber-500/10 border border-amber-500/30 p-3 rounded">
                  <div className="flex items-start space-x-3">
                    <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5" />
                    <div className="text-xs font-mono text-amber-300">
                      <p className="font-bold mb-1 uppercase">上传说明:</p>
                      <ul className="space-y-0.5 list-disc list-inside text-amber-400/80">
                        <li>仅支持 ZIP 格式</li>
                        <li>确保文件包含完整的 Skill 配置</li>
                        <li>包含必要的元数据和工具定义</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="is_public"
                  checked={uploadForm.is_public}
                  onCheckedChange={(checked) => setUploadForm({ ...uploadForm, is_public: checked as boolean })}
                />
                <label htmlFor="is_public" className="text-sm text-muted-foreground font-mono cursor-pointer">
                  公开分享
                </label>
              </div>

              <div className="flex justify-end space-x-4 pt-4 border-t border-border mt-auto">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowUploadDialog(false)}
                  className="cyber-btn-outline"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  className="cyber-btn-primary"
                  disabled={uploading}
                >
                  {uploading ? (
                    <>
                      <div className="loading-spinner w-4 h-4 mr-2"></div>
                      上传中...
                    </>
                  ) : (
                    "上传"
                  )}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
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
              确定要删除 Skill <span className="font-bold text-primary">{skillToDelete?.name}</span> 吗？
            </p>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setShowDeleteDialog(false);
                setSkillToDelete(null);
              }}
              className="cyber-btn-outline"
            >
              取消
            </Button>
            <Button
              type="button"
              onClick={handleDeleteSkill}
              disabled={deleting}
              className="cyber-btn-primary bg-rose-500/20 text-rose-400 border-rose-500/30 hover:bg-rose-500/30"
            >
              {deleting ? (
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
    </div>
  );
};

export default SkillMarketplace;
