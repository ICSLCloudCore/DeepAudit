/**
 * WorkflowTable Component
 * Cyberpunk Terminal Aesthetic
 * 
 * 根据 SDD-Workflow-Table-View.md 文档实现
 */

import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Bug } from "lucide-react";
import { Link } from "react-router-dom";
import type { Workflow, WorkflowVulnerabilityStats } from "@/shared/types/workflow";

interface WorkflowTableProps {
  workflows: Workflow[];
  workflowStats: Map<string, WorkflowVulnerabilityStats>;
}

function getProgressBadgeClass(status?: string): string {
  switch (status) {
    case 'completed': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'in_progress': return 'bg-sky-500/20 text-sky-400 border-sky-500/30';
    case 'ready': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'draft': return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
}

function getProgressLabel(status?: string): string {
  switch (status) {
    case 'completed': return '已完成';
    case 'in_progress': return '进行中';
    case 'ready': return '就绪';
    case 'draft': return '草稿';
    default: return '未知';
  }
}

function getValidationModeLabel(mode: 'wide' | 'self'): string {
  return mode === 'wide' ? '广院模式' : '自验证模式';
}

function getValidationModeBadgeClass(mode: 'wide' | 'self'): string {
  return mode === 'wide' 
    ? 'bg-sky-500/20 text-sky-400 border-sky-500/30'
    : 'bg-amber-500/20 text-amber-400 border-amber-500/30';
}

function getAuditTypeLabel(type: 'baseline' | 'differential'): string {
  return type === 'baseline' ? '基线验证' : '差异验证';
}

function getAuditTypeBadgeClass(type: 'baseline' | 'differential'): string {
  return type === 'baseline'
    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
    : 'bg-orange-500/20 text-orange-400 border-orange-500/30';
}

function formatTechStack(techStack?: string[]): string {
  if (!techStack || techStack.length === 0) {
    return '—';
  }
  return techStack.join(', ');
}

export default function WorkflowTable({ workflows, workflowStats }: WorkflowTableProps) {
  return (
    <div className="cyber-card overflow-hidden relative z-10">
      <div className="absolute inset-0 cyber-grid-subtle pointer-events-none opacity-20" />
      
      <Table className="border-0 relative">
        <TableHeader className="bg-muted/50 border-b border-border backdrop-blur-sm">
          <TableRow className="hover:bg-transparent border-border">
            <TableHead className="text-primary font-bold uppercase tracking-wider">
              领域
            </TableHead>
            <TableHead className="text-primary font-bold uppercase tracking-wider">
              产品
            </TableHead>
            <TableHead className="text-muted-foreground font-bold uppercase tracking-wider">
              版本
            </TableHead>
            <TableHead className="text-muted-foreground font-bold uppercase tracking-wider">
              验证模式
            </TableHead>
            <TableHead className="text-muted-foreground font-bold uppercase tracking-wider">
              审计类型
            </TableHead>
            <TableHead className="text-violet-400 font-bold uppercase tracking-wider">
              威胁分析
            </TableHead>
            <TableHead className="text-primary font-bold uppercase tracking-wider">
              白盒分析
            </TableHead>
            <TableHead className="text-amber-400 font-bold uppercase tracking-wider">
              黑盒分析
            </TableHead>
            <TableHead className="text-muted-foreground font-bold uppercase tracking-wider">
              进度
            </TableHead>
            <TableHead className="text-red-400 font-bold uppercase tracking-wider">
              漏洞总数
            </TableHead>
          </TableRow>
        </TableHeader>
        
        <TableBody>
          {workflows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                暂无工作流数据
              </TableCell>
            </TableRow>
          ) : (
            workflows.map((workflow) => (
              <TableRow 
                key={workflow.id}
                className="cursor-pointer hover:bg-primary/5 transition-all duration-200 border-border group"
              >
                {/* 列1：领域 */}
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className="font-mono text-xs bg-cyan-500/10 text-cyan-400 border-cyan-500/30"
                  >
                    {workflow.product_domain}
                  </Badge>
                </TableCell>
                
                {/* 列2：产品 */}
                <TableCell>
                  <Link 
                    to={`/workflows/${workflow.id}`}
                    className="text-primary hover:underline font-bold font-mono transition-all duration-200 hover:text-primary/80"
                  >
                    {workflow.full_name}
                  </Link>
                </TableCell>
                
                {/* 列3：版本 */}
                <TableCell className="font-mono text-muted-foreground text-sm">
                  {workflow.version}
                </TableCell>
                
                {/* 列4：验证模式 */}
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={`font-mono text-xs ${getValidationModeBadgeClass(workflow.validation_mode)}`}
                  >
                    {getValidationModeLabel(workflow.validation_mode)}
                  </Badge>
                </TableCell>
                
                {/* 列5：审计类型 */}
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={`font-mono text-xs ${getAuditTypeBadgeClass(workflow.audit_type)}`}
                  >
                    {getAuditTypeLabel(workflow.audit_type)}
                  </Badge>
                </TableCell>
                
                {/* 列6：威胁分析 */}
                <TableCell>
                  {workflow.analyze_project_id ? (
                    <Badge 
                      variant="outline" 
                      className="font-mono text-xs bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
                    >
                      ✓
                    </Badge>
                  ) : (
                    <Badge 
                      variant="outline" 
                      className="font-mono text-xs bg-gray-500/20 text-gray-400 border-gray-500/30"
                    >
                      —
                    </Badge>
                  )}
                </TableCell>
                
                {/* 列7：白盒分析 */}
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {formatTechStack(workflow.white_tech_stack)}
                </TableCell>
                
                {/* 列8：黑盒分析 */}
                <TableCell className="font-mono text-sm text-muted-foreground">
                  {formatTechStack(workflow.black_tech_stack)}
                </TableCell>
                
                {/* 列9：进度 */}
                <TableCell>
                  <Badge 
                    variant="outline" 
                    className={`font-mono text-xs ${getProgressBadgeClass(workflow.overall_status)}`}
                  >
                    {getProgressLabel(workflow.overall_status)}
                  </Badge>
                </TableCell>
                
                {/* 列10：漏洞总数 */}
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    <Bug className="w-3.5 h-3.5 text-red-400" />
                    <span className="font-mono font-bold text-red-400 text-sm">
                      {workflow.total_vulnerabilities || 0}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}