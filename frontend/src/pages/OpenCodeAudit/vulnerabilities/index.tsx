/**
 * OpenCode Audit Vulnerabilities Page
 * Cyberpunk Terminal Aesthetic
 */

import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Clock,
  FileText,
  Calendar,
  GitBranch,
  Shield,
  Bug,
  TrendingUp,
  Download,
  Code,
  Lightbulb,
  Info,
  Zap,
  XCircle,
  Terminal,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { toast } from "sonner";

import { getVulnerabilities, getOpenCodeAuditTask, scanImportVulnerabilities, type AuditVulnerability, type OpenCodeAuditTask, type PaginatedAuditVulnerabilities } from "@/shared/api/opencodeAuditTasks";

function parseAIExplanation(aiExplanation: string) {
  try {
    const parsed = JSON.parse(aiExplanation);
    if (parsed.xai) {
      return parsed.xai;
    }
    if (parsed.what || parsed.why || parsed.how) {
      return parsed;
    }
    return null;
  } catch (error) {
    return null;
  }
}

const PAGE_SIZE = 20;

type TabType = 'all' | 'critical' | 'high' | 'medium' | 'low';

interface TabState {
  page: number;
  total: number;
  total_pages: number;
  items: AuditVulnerability[];
  loaded: boolean;
}

const initialTabState: TabState = {
  page: 1,
  total: 0,
  total_pages: 0,
  items: [],
  loaded: false,
};

function VulnerabilitiesList({ 
  task,
  taskId,
  tabStates,
  activeTab,
  setActiveTab,
  onLoadTab,
}: { 
  task: OpenCodeAuditTask | null,
  taskId: string,
  tabStates: Record<TabType, TabState>;
  activeTab: TabType;
  setActiveTab: (tab: TabType) => void;
  onLoadTab: (tab: TabType, page: number) => Promise<void>;
}) {
  const getSeverityClasses = (severity: string) => {
    const lowerSeverity = severity.toLowerCase();
    switch (lowerSeverity) {
      case 'critical':
      case '致命':
        return 'severity-critical';
      case 'high':
      case '严重':
        return 'severity-high';
      case 'medium':
      case '一般':
        return 'severity-medium';
      case 'low':
      case '提示':
        return 'severity-low';
      default:
        return 'severity-info';
    }
  };

  const getTypeIcon = () => {
    return <Shield className="w-4 h-4" />;
  };

  const getTabCount = (tab: TabType): number => {
    if (!task) return 0;
    switch (tab) {
      case 'all': return task.findings_count || 0;
      case 'critical': return task.critical_count || 0;
      case 'high': return task.high_count || 0;
      case 'medium': return task.medium_count || 0;
      case 'low': return task.low_count || 0;
      default: return 0;
    }
  };

  const renderVulnerability = (vuln: AuditVulnerability, index: number) => (
    <div key={vuln.id || index} className="cyber-card p-4 hover:border-border transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start space-x-3">
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
            vuln.severity.toLowerCase() === 'critical' || vuln.severity === '致命' ? 'bg-rose-500/20 text-rose-400' :
            vuln.severity.toLowerCase() === 'high' || vuln.severity === '严重' ? 'bg-orange-500/20 text-orange-400' :
            vuln.severity.toLowerCase() === 'medium' || vuln.severity === '一般' ? 'bg-amber-500/20 text-amber-400' :
              'bg-sky-500/20 text-sky-400'
          }`}>
            {getTypeIcon()}
          </div>
          <div className="flex-1">
            <h4 className="font-bold text-base text-foreground mb-1 group-hover:text-primary transition-colors uppercase">
              {vuln.vulnerability_title}
            </h4>
            <div className="flex items-center space-x-1 text-xs text-muted-foreground font-mono">
              <FileText className="w-3 h-3" />
              <span className="bg-muted px-2 py-0.5 rounded border border-border">
                {vuln.file_path || vuln.location}
              </span>
            </div>
            {vuln.line_start && (
              <div className="flex items-center space-x-1 text-xs text-muted-foreground mt-1 font-mono">
                <span className="text-primary">&gt;</span>
                <span>LINE: {vuln.line_start}</span>
                {vuln.line_end && <span>- {vuln.line_end}</span>}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`${getSeverityClasses(vuln.severity)} font-bold uppercase px-2 py-1 rounded text-xs`}>
            {vuln.severity}
          </Badge>
          {vuln.cwe && (
            <Badge className="cyber-badge-muted font-mono text-xs">
              {vuln.cwe}
            </Badge>
          )}
          <Link to={`/tasks/opencode/${taskId}/vulnerabilities/${vuln.id}`}>
            <Button variant="outline" size="sm" className="cyber-btn-ghost h-8 px-3 text-xs font-mono">
              查看详情
            </Button>
          </Link>
        </div>
      </div>

      {vuln.vulnerability_essence && (
        <div className="bg-muted border border-border p-3 mb-3 rounded font-mono">
          <div className="flex items-center mb-1 border-b border-border pb-1">
            <Info className="w-3 h-3 text-muted-foreground mr-1" />
            <span className="font-bold text-muted-foreground text-xs uppercase">漏洞本质</span>
          </div>
          <p className="text-foreground text-xs leading-relaxed mt-1">
            {vuln.vulnerability_essence}
          </p>
        </div>
      )}

      {vuln.root_cause && (
        <div className="bg-rose-500/10 border border-rose-500/30 p-3 mb-3 rounded font-mono">
          <div className="flex items-center mb-1 border-b border-rose-500/20 pb-1">
            <AlertTriangle className="w-3 h-3 text-rose-600 dark:text-rose-400 mr-1" />
            <span className="font-bold text-rose-700 dark:text-rose-300 text-xs uppercase">根因分析</span>
          </div>
          <p className="text-rose-800 dark:text-rose-200/80 text-xs leading-relaxed">
            {vuln.root_cause}
          </p>
        </div>
      )}

      {vuln.vulnerable_code && (
        <div className="cyber-bg-elevated p-3 mb-3 border border-border rounded">
          <div className="flex items-center justify-between mb-2 border-b border-border pb-1">
            <div className="flex items-center space-x-1">
              <div className="w-4 h-4 bg-primary rounded flex items-center justify-center">
                <Code className="w-2 h-2 text-foreground" />
              </div>
              <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold font-mono uppercase">
                VULNERABLE_CODE
              </span>
            </div>
          </div>
          <div className="bg-slate-100 dark:bg-black/40 p-2 border border-border rounded">
            <pre className="text-xs text-emerald-700 dark:text-emerald-400 font-mono overflow-x-auto">
              <code>{vuln.vulnerable_code}</code>
            </pre>
          </div>
        </div>
      )}

      {vuln.fix_description && (
        <div className="bg-sky-500/10 border border-sky-500/30 p-3 rounded font-mono">
          <div className="flex items-center mb-2 border-b border-sky-500/20 pb-1">
            <div className="w-5 h-5 bg-sky-500/20 border border-sky-500/40 rounded flex items-center justify-center mr-2">
              <Lightbulb className="w-3 h-3 text-sky-600 dark:text-sky-400" />
            </div>
            <span className="font-bold text-sky-700 dark:text-sky-300 text-sm uppercase">修复建议</span>
          </div>
          <p className="text-sky-800 dark:text-sky-200/80 text-xs leading-relaxed">
            {vuln.fix_description}
          </p>
        </div>
      )}

      {vuln.fix_code_after && (
        <div className="cyber-bg-elevated p-3 mt-3 border border-border rounded">
          <div className="flex items-center justify-between mb-2 border-b border-border pb-1">
            <div className="flex items-center space-x-1">
              <div className="w-4 h-4 bg-emerald-500 rounded flex items-center justify-center">
                <CheckCircle className="w-2 h-2 text-foreground" />
              </div>
              <span className="text-emerald-600 dark:text-emerald-400 text-xs font-bold font-mono uppercase">
                FIXED_CODE
              </span>
            </div>
          </div>
          <div className="bg-slate-100 dark:bg-black/40 p-2 border border-border rounded">
            <pre className="text-xs text-emerald-700 dark:text-emerald-400 font-mono overflow-x-auto">
              <code>{vuln.fix_code_after}</code>
            </pre>
          </div>
        </div>
      )}
    </div>
  );

  const renderPagination = () => {
    const currentState = tabStates[activeTab];
    if (currentState.total_pages <= 1) return null;
    
    return (
      <div className="flex items-center justify-between mt-6 cyber-card p-4">
        <div className="text-sm text-muted-foreground font-mono">
          第 {currentState.page} 页 / 共 {currentState.total_pages} 页，共 {currentState.total} 条
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="cyber-btn-outline"
            disabled={currentState.page <= 1}
            onClick={() => onLoadTab(activeTab, currentState.page - 1)}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            上一页
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="cyber-btn-outline"
            disabled={currentState.page >= currentState.total_pages}
            onClick={() => onLoadTab(activeTab, currentState.page + 1)}
          >
            下一页
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    );
  };

  const currentState = tabStates[activeTab];
  if (currentState.total === 0) {
    return (
      <div className="cyber-card p-16 text-center border-dashed">
        <CheckCircle className="w-16 h-16 text-emerald-600 dark:text-emerald-400 mx-auto mb-4" />
        <h3 className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mb-2 uppercase">代码质量优秀！</h3>
        <p className="text-emerald-600 dark:text-emerald-400/80 mb-4 font-mono">恭喜！没有发现任何问题</p>
        <div className="bg-emerald-500/10 border border-emerald-500/30 p-4 max-w-md mx-auto rounded">
          <p className="text-emerald-700 dark:text-emerald-300/80 text-sm font-mono">
            您的代码通过了所有质量检查，包括安全性、性能、可维护性等各个方面的评估。
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabType)} className="w-full">
        <TabsList className="grid w-full grid-cols-5 bg-muted border border-border p-1 h-auto gap-1 rounded">
          <TabsTrigger value="all" className="data-[state=active]:bg-primary data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs">
            全部 ({getTabCount('all')})
          </TabsTrigger>
          <TabsTrigger value="critical" className="data-[state=active]:bg-rose-500 data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs">
            致命 ({getTabCount('critical')})
          </TabsTrigger>
          <TabsTrigger value="high" className="data-[state=active]:bg-orange-500 data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs">
            严重 ({getTabCount('high')})
          </TabsTrigger>
          <TabsTrigger value="medium" className="data-[state=active]:bg-amber-500 data-[state=active]:text-background font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs">
            一般 ({getTabCount('medium')})
          </TabsTrigger>
          <TabsTrigger value="low" className="data-[state=active]:bg-sky-500 data-[state=active]:text-foreground font-mono font-bold uppercase py-2 text-muted-foreground transition-all rounded-sm text-xs">
            提示 ({getTabCount('low')})
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="space-y-4 mt-6">
          {currentState.items.map((vuln, index) => renderVulnerability(vuln, index))}
        </TabsContent>
      </Tabs>
      {renderPagination()}
    </div>
  );
}

export default function OpenCodeAuditVulnerabilities() {
  const { taskId } = useParams<{ taskId: string }>();
  const [task, setTask] = useState<OpenCodeAuditTask | null>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [tabStates, setTabStates] = useState<Record<TabType, TabState>>({
    all: { ...initialTabState },
    critical: { ...initialTabState },
    high: { ...initialTabState },
    medium: { ...initialTabState },
    low: { ...initialTabState },
  });

  const getSeverityFilter = (tab: TabType): string | undefined => {
    switch (tab) {
      case 'critical': return 'critical';
      case 'high': return 'high';
      case 'medium': return 'medium';
      case 'low': return 'low';
      default: return undefined;
    }
  };

  const loadTabData = async (tab: TabType, page: number = 1) => {
    if (!taskId) return;

    try {
      const severity = getSeverityFilter(tab);
      const vulnsData: PaginatedAuditVulnerabilities = await getVulnerabilities(taskId, { 
        severity, 
        page, 
        page_size: PAGE_SIZE 
      });

      setTabStates(prev => ({
        ...prev,
        [tab]: {
          page: vulnsData.page,
          total: vulnsData.total,
          total_pages: vulnsData.total_pages,
          items: vulnsData.items,
          loaded: true,
        }
      }));
    } catch (error) {
      console.error('Failed to load tab data:', error);
      toast.error("加载漏洞列表失败");
    }
  };

  useEffect(() => {
    if (taskId) {
      const init = async () => {
        setLoading(true);
        try {
          const taskData = await getOpenCodeAuditTask(taskId);
          setTask(taskData);
          await loadTabData('all', 1);
        } catch (error) {
          console.error('Failed to initialize:', error);
          toast.error("加载任务数据失败");
        } finally {
          setLoading(false);
        }
      };
      init();
    }
  }, [taskId]);

  useEffect(() => {
    if (taskId && !tabStates[activeTab].loaded) {
      loadTabData(activeTab, 1);
    }
  }, [taskId, activeTab]);

  const handleTabChange = (newTab: TabType) => {
    setActiveTab(newTab);
  };

  const handleLoadTab = async (tab: TabType, page: number) => {
    await loadTabData(tab, page);
  };

  const handleScanImport = async () => {
    if (!taskId) return;

    try {
      setScanning(true);
      const result = await scanImportVulnerabilities(taskId);
      toast.success(`扫描完成: 导入 ${result.findings_count} 个漏洞`);
      
      // 重新加载任务数据和所有标签
      const taskData = await getOpenCodeAuditTask(taskId);
      setTask(taskData);
      
      // 重置所有标签状态
      setTabStates({
        all: { ...initialTabState },
        critical: { ...initialTabState },
        high: { ...initialTabState },
        medium: { ...initialTabState },
        low: { ...initialTabState },
      });
      
      // 重新加载当前标签
      await loadTabData(activeTab, 1);
    } catch (error) {
      console.error('Failed to scan import vulnerabilities:', error);
      toast.error("扫描导入失败，请确保已调用 skill 导出报告");
    } finally {
      setScanning(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="cyber-badge-success">完成</Badge>;
      case 'running':
        return <Badge className="cyber-badge-info">运行中</Badge>;
      case 'failed':
        return <Badge className="cyber-badge-danger">失败</Badge>;
      case 'cancelled':
        return <Badge className="cyber-badge-muted">已取消</Badge>;
      default:
        return <Badge className="cyber-badge-muted">等待中</Badge>;
    }
  };

  const severityCounts = {
    critical: task?.critical_count || 0,
    high: task?.high_count || 0,
    medium: task?.medium_count || 0,
    low: task?.low_count || 0,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="text-center space-y-4">
          <div className="loading-spinner mx-auto" />
          <p className="text-muted-foreground font-mono text-sm uppercase tracking-wider">加载漏洞列表...</p>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div className="space-y-6 p-6 cyber-bg-elevated min-h-screen font-mono relative">
        <div className="flex items-center space-x-4">
          <Link to="/audit-tasks">
            <Button variant="outline" size="sm" className="cyber-btn-ghost h-10 w-10 p-0">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
        </div>
        <div className="cyber-card p-16 text-center">
          <AlertTriangle className="w-16 h-16 text-rose-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold text-foreground uppercase mb-2">任务不存在</h3>
          <p className="text-muted-foreground font-mono">请检查任务ID是否正确</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6 cyber-bg-elevated min-h-screen font-mono relative">
      {/* Grid background */}
      <div className="absolute inset-0 cyber-grid-subtle pointer-events-none" />

      {/* Top Action Bar */}
      <div className="flex items-center justify-between relative z-10">
        <Link to="/audit-tasks">
          <Button variant="outline" size="sm" className="cyber-btn-ghost h-10 w-10 p-0">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>

        <div className="flex items-center space-x-3">
          <Button
            variant="outline"
            size="sm"
            onClick={handleScanImport}
            disabled={scanning}
            className="cyber-btn-ghost"
          >
            {scanning ? (
              <>
                <div className="loading-spinner w-4 h-4 mr-2" />
                扫描中...
              </>
            ) : (
              <>
                <Zap className="w-4 h-4 mr-2" />
                扫描导入
              </>
            )}
          </Button>
          {getStatusBadge(task.status)}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 relative z-10">
        <div className="cyber-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">总漏洞数</p>
              <p className="stat-value text-rose-400">{task.findings_count || 0}</p>
            </div>
            <div className="stat-icon text-rose-400">
              <Bug className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="cyber-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">致命/严重</p>
              <p className="stat-value text-orange-400">
                {severityCounts.critical + severityCounts.high}
              </p>
            </div>
            <div className="stat-icon text-orange-400">
              <AlertTriangle className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="cyber-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">质量评分</p>
              <p className="stat-value text-emerald-400">{task.quality_score.toFixed(1)}</p>
            </div>
            <div className="stat-icon text-emerald-400">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
        </div>

        <div className="cyber-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="stat-label">代码行数</p>
              <p className="stat-value text-violet-400">
                {task.total_lines.toLocaleString()}
              </p>
            </div>
            <div className="stat-icon text-violet-400">
              <FileText className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Task Info */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
        <div className="lg:col-span-2">
          <div className="cyber-card p-0">
            <div className="cyber-card-header">
              <Shield className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">任务信息</h3>
            </div>
            <div className="p-6 space-y-4 font-mono">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-1">任务名称</p>
                  <p className="text-base font-bold text-foreground">
                    {task.name || 'OpenCode审计任务'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-1">目标分支</p>
                  <p className="text-base font-bold text-foreground flex items-center">
                    <GitBranch className="w-4 h-4 mr-1" />
                    {task.branch_name || '默认分支'}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-1">创建时间</p>
                  <p className="text-base font-bold text-foreground flex items-center">
                    <Calendar className="w-4 h-4 mr-1" />
                    {formatDate(task.created_at)}
                  </p>
                </div>
                {task.completed_at && (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1">完成时间</p>
                    <p className="text-base font-bold text-foreground flex items-center">
                      <CheckCircle className="w-4 h-4 mr-1" />
                      {formatDate(task.completed_at)}
                    </p>
                  </div>
                )}
              </div>

              {task.description && (
                <div>
                  <p className="text-xs font-bold text-muted-foreground uppercase mb-1">任务描述</p>
                  <p className="text-sm text-foreground">{task.description}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div>
          <div className="cyber-card p-0">
            <div className="cyber-card-header">
              <FileText className="w-5 h-5 text-primary" />
              <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">项目信息</h3>
            </div>
            <div className="p-6 space-y-4 font-mono">
              {task.project ? (
                <>
                  <div>
                    <p className="text-xs font-bold text-muted-foreground uppercase mb-1">项目名称</p>
                    <Link to={`/projects/${task.project.id}`} className="text-base font-bold text-primary hover:underline">
                      {task.project.name}
                    </Link>
                  </div>
                  {task.project.description && (
                    <div>
                      <p className="text-xs font-bold text-muted-foreground uppercase mb-1">项目描述</p>
                      <p className="text-sm text-foreground">{task.project.description}</p>
                    </div>
                  )}
                </>
              ) : (
                <p className="text-muted-foreground font-bold">项目信息不可用</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Vulnerabilities List */}
      {task.findings_count > 0 && taskId && (
        <div className="cyber-card p-0 relative z-10">
          <div className="cyber-card-header">
            <Bug className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold uppercase tracking-wider text-foreground">
              发现的漏洞 ({task.findings_count})
            </h3>
          </div>
          <div className="p-6">
            <VulnerabilitiesList 
              task={task}
              taskId={taskId} 
              tabStates={tabStates}
              activeTab={activeTab}
              setActiveTab={handleTabChange}
              onLoadTab={handleLoadTab}
            />
          </div>
        </div>
      )}
    </div>
  );
}
