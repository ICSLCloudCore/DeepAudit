/**
 * 安全知识库本地类型与常量
 */

export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type Likelihood = 'high' | 'medium' | 'low';

export const SEVERITY_OPTIONS = [
  { value: 'critical', label: '严重', color: 'text-red-400',    bg: 'bg-red-500/20',    border: 'border-red-500/40' },
  { value: 'high',     label: '高',   color: 'text-orange-400', bg: 'bg-orange-500/20', border: 'border-orange-500/40' },
  { value: 'medium',   label: '中',   color: 'text-yellow-400', bg: 'bg-yellow-500/20', border: 'border-yellow-500/40' },
  { value: 'low',      label: '低',   color: 'text-sky-400',    bg: 'bg-sky-500/20',    border: 'border-sky-500/40' },
] as const;

export const LIKELIHOOD_OPTIONS = [
  { value: 'high',   label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low',    label: '低' },
] as const;

// Note: VULN_CATEGORY_OPTIONS removed — vulnerability insights no longer use category classification

export const ATTACK_TYPE_OPTIONS = [
  { value: 'injection',       label: '注入攻击' },
  { value: 'traversal',       label: '路径遍历' },
  { value: 'deserialization', label: '反序列化' },
  { value: 'ssrf',            label: 'SSRF' },
  { value: 'xxe',             label: 'XXE' },
  { value: 'dos',             label: 'DoS/DDoS' },
  { value: 'privilege',       label: '权限提升' },
  { value: 'supply-chain',    label: '供应链攻击' },
  { value: 'social',          label: '社会工程' },
  { value: 'other',           label: '其他' },
];

export function getSeverityMeta(severity: string) {
  return SEVERITY_OPTIONS.find(s => s.value === severity) ?? SEVERITY_OPTIONS[3];
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
