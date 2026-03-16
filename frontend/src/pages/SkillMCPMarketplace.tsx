// Skill & MCP Marketplace Page
import React, { useState, useEffect } from "react";
import { opencodeApi, type OpenCodeSkill, type OpenCodeMCP } from "@/shared/api/opencode";

const SkillMCPMarketplace: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"skills" | "mcps">("skills");
  const [skills, setSkills] = useState<OpenCodeSkill[]>([]);
  const [mcps, setMcps] = useState<OpenCodeMCP[]>([]);
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

  useEffect(() => {
    if (activeTab === "skills") {
      loadSkills();
    } else {
      loadMcps();
    }
  }, [activeTab, filters]);

  const loadSkills = async () => {
    try {
      setLoading(true);
      const data = await opencodeApi.listSkills(filters);
      setSkills(data.items);
    } catch (error) {
      console.error("Failed to load skills:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadMcps = async () => {
    try {
      setLoading(true);
      const data = await opencodeApi.listMcps(filters);
      setMcps(data.items);
    } catch (error) {
      console.error("Failed to load mcps:", error);
    } finally {
      setLoading(false);
    }
  };

  const testMcpConnection = async (id: string) => {
    try {
      const result = await opencodeApi.testMcpConnection(id);
      alert(`连接测试${result.success ? "成功" : "失败"}!`);
    } catch (error) {
      console.error("Failed to test MCP connection:", error);
    }
  };

  const handleUploadSkill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadForm.file) {
      alert("请选择要上传的文件");
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
      alert("Skill 上传成功！");
      setShowUploadDialog(false);
      setUploadForm({
        name: "",
        version: "1.0.0",
        description: "",
        category: "custom",
        is_public: false,
        file: null,
      });
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
      
      alert(errorMessage);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteSkill = async () => {
    if (!skillToDelete) return;

    try {
      setDeleting(true);
      await opencodeApi.deleteSkill(skillToDelete.id);
      alert("Skill 删除成功！");
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
      
      alert(errorMessage);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-cyan-400">Skill & MCP 市场</h1>
            <p className="text-gray-400 mt-2">浏览和管理 OpenCode Skills 和 MCPs</p>
          </div>
          <button 
            className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg transition"
            onClick={() => activeTab === "skills" && setShowUploadDialog(true)}
          >
            {activeTab === "skills" ? "上传 Skill" : "创建 MCP"}
          </button>
        </div>

        {/* Upload Dialog */}
        {showUploadDialog && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-bold mb-4">上传新 Skill</h2>
              <form onSubmit={handleUploadSkill}>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Skill 名称 *</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                    value={uploadForm.name}
                    onChange={(e) => setUploadForm({ ...uploadForm, name: e.target.value })}
                    required
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">版本</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                    value={uploadForm.version}
                    onChange={(e) => setUploadForm({ ...uploadForm, version: e.target.value })}
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">描述</label>
                  <textarea
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                    rows={3}
                    value={uploadForm.description}
                    onChange={(e) => setUploadForm({ ...uploadForm, description: e.target.value })}
                  />
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">分类</label>
                  <select
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                    value={uploadForm.category}
                    onChange={(e) => setUploadForm({ ...uploadForm, category: e.target.value as any })}
                  >
                    <option value="security">安全</option>
                    <option value="analysis">分析</option>
                    <option value="utility">工具</option>
                    <option value="custom">自定义</option>
                  </select>
                </div>
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Skill 文件 *</label>
                  <input
                    type="file"
                    className="w-full px-3 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
                    onChange={(e) => setUploadForm({ ...uploadForm, file: e.target.files?.[0] || null })}
                    required
                  />
                </div>
                <div className="mb-6 flex items-center">
                  <input
                    type="checkbox"
                    id="is_public"
                    className="mr-2"
                    checked={uploadForm.is_public}
                    onChange={(e) => setUploadForm({ ...uploadForm, is_public: e.target.checked })}
                  />
                  <label htmlFor="is_public" className="text-sm">公开分享</label>
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition"
                    onClick={() => setShowUploadDialog(false)}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 rounded-lg transition disabled:opacity-50"
                    disabled={uploading}
                  >
                    {uploading ? "上传中..." : "上传"}
                  </button>
                </div>
              </form>
            </div>
           </div>
         )}

         {/* Delete Confirmation Dialog */}
         {showDeleteDialog && skillToDelete && (
           <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
             <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
               <h2 className="text-xl font-bold mb-4 text-red-400">确认删除 Skill</h2>
               <div className="mb-6">
                 <p className="text-gray-300 mb-2">
                   确定要删除 Skill <span className="font-semibold text-white">{skillToDelete.name}</span> 吗？
                 </p>
                 <p className="text-gray-400 text-sm">
                   此操作将同时删除文件和数据库记录，且无法恢复。
                 </p>
               </div>
               <div className="flex gap-3">
                 <button
                   type="button"
                   className="flex-1 px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded-lg transition"
                   onClick={() => {
                     setShowDeleteDialog(false);
                     setSkillToDelete(null);
                   }}
                 >
                   取消
                 </button>
                 <button
                   type="button"
                   className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition disabled:opacity-50"
                   onClick={handleDeleteSkill}
                   disabled={deleting}
                 >
                   {deleting ? "删除中..." : "确认删除"}
                 </button>
               </div>
             </div>
           </div>
         )}

         {/* Tabs */}
        <div className="flex gap-4 mb-6">
          <button
            className={`px-4 py-2 rounded-lg transition ${
              activeTab === "skills"
                ? "bg-cyan-600"
                : "bg-gray-800 hover:bg-gray-700"
            }`}
            onClick={() => setActiveTab("skills")}
          >
            Skills
          </button>
          <button
            className={`px-4 py-2 rounded-lg transition ${
              activeTab === "mcps"
                ? "bg-purple-600"
                : "bg-gray-800 hover:bg-gray-700"
            }`}
            onClick={() => setActiveTab("mcps")}
          >
            MCPs
          </button>
        </div>

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-4 mb-6 flex flex-wrap gap-4">
          <input
            type="text"
            placeholder={`搜索 ${activeTab === "skills" ? "Skills" : "MCPs"}...`}
            className="px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          />
          {activeTab === "skills" && (
            <select
              className="px-4 py-2 bg-gray-700 rounded-lg border border-gray-600 focus:border-cyan-500 focus:outline-none"
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
            >
              <option value="">全部分类</option>
              <option value="security">安全</option>
              <option value="analysis">分析</option>
              <option value="utility">工具</option>
              <option value="custom">自定义</option>
            </select>
          )}
        </div>

        {/* Content */}
        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500 mx-auto"></div>
            <p className="text-gray-400 mt-4">加载中...</p>
          </div>
        ) : activeTab === "skills" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-cyan-500 transition"
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-semibold">{skill.name}</h3>
                  <span className="text-xs px-2 py-1 rounded bg-cyan-600">
                    {skill.category}
                  </span>
                </div>
                <p className="text-gray-400 text-sm mb-3">
                  {skill.description || "暂无描述"}
                </p>
                <div className="flex justify-between items-center text-sm text-gray-500">
                  <div>
                    <span>v{skill.version}</span>
                    <span className="ml-2">作者: {skill.author}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="text-cyan-400 hover:text-cyan-300"
                      onClick={() => console.log("View skill:", skill.id)}
                    >
                      详情
                    </button>
                    <button
                      className="text-red-400 hover:text-red-300"
                      onClick={() => {
                        setSkillToDelete(skill);
                        setShowDeleteDialog(true);
                      }}
                    >
                      删除
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {mcps.map((mcp) => (
              <div
                key={mcp.id}
                className="bg-gray-800 rounded-lg p-4 border border-gray-700 hover:border-purple-500 transition"
              >
                <div className="flex justify-between items-start mb-3">
                  <h3 className="text-lg font-semibold">{mcp.name}</h3>
                  <span className="text-xs px-2 py-1 rounded bg-purple-600">
                    {mcp.mcp_type}
                  </span>
                </div>
                <p className="text-gray-400 text-sm mb-3">
                  {mcp.description || "暂无描述"}
                </p>
                <div className="flex justify-between items-center text-sm text-gray-500">
                  <div>
                    <span>v{mcp.version}</span>
                    <span className="ml-2">作者: {mcp.author}</span>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="text-purple-400 hover:text-purple-300"
                      onClick={() => testMcpConnection(mcp.id)}
                    >
                      测试连接
                    </button>
                    <button
                      className="text-cyan-400 hover:text-cyan-300"
                      onClick={() => console.log("View MCP:", mcp.id)}
                    >
                      详情
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default SkillMCPMarketplace;
