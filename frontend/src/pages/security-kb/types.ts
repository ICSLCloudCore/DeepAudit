/**
 * 安全知识库本地类型与常量
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';

export const SEVERITY_OPTIONS = [
  { value: 'critical', label: '严重', color: 'text-red-400',    bg: 'bg-red-500/20',    border: 'border-red-500/40' },
  { value: 'high',     label: '高',   color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/40' },
  { value: 'medium',   label: '中',   color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/40' },
  { value: 'low',      label: '低',   color: 'text-sky-400',    bg: 'bg-sky-500/20',    border: 'border-sky-500/40' },
] as const;

// Note: VULN_CATEGORY_OPTIONS and LIKELIHOOD_OPTIONS removed in previous refactor

export const PATTERN_TYPE_OPTIONS = [
  { value: 'general',           label: '通用攻击模式',    color: 'text-sky-400',     bg: 'bg-sky-500/15',     border: 'border-sky-500/30' },
  { value: 'go-specific',       label: 'Go特有攻击模式',  color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
  { value: 'cloud-business',    label: '云核业务攻击模式', color: 'text-violet-400',  bg: 'bg-violet-500/15',  border: 'border-violet-500/30' },
  { value: 'expert-experience', label: '专家经验模式',    color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30' },
];

export function getSeverityMeta(severity: string) {
  return SEVERITY_OPTIONS.find(s => s.value === severity) ?? SEVERITY_OPTIONS[3];
}

export function getPatternTypeMeta(patternType: string) {
  return PATTERN_TYPE_OPTIONS.find(p => p.value === patternType)
    ?? { value: patternType, label: patternType, color: 'text-muted-foreground', bg: 'bg-muted/20', border: 'border-border' };
}

/** 由 title 生成 slug（仅前端用于预填，后端最终校验） */
export function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[\u4e00-\u9fa5]+/g, '')        // 去除中文（后端 slugify 能处理中文）
    .replace(/[^a-z0-9\-\s]/g, '')
    .trim()
    .replace(/[\s\-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100)
    || 'entry';
}
