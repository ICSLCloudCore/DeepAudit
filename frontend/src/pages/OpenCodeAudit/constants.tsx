/**
 * OpenCode Audit Constants
 * Shared constants for the OpenCode Audit page
 * Cassette Futurism / Terminal Retro aesthetic
 * Enhanced color palette for better visibility
 */

import React from "react";
import {
  MessageSquare, FileText, Activity, AlertTriangle, Terminal,
  CheckCircle2, XCircle, Clock, Loader2, Zap, Code,
  Server, Cpu
} from "lucide-react";

// ============ Action Verbs for Animation ============

export const ACTION_VERBS = [
  "Analyzing", "Scanning", "Probing", "Investigating",
  "Examining", "Auditing", "Testing", "Exploring",
  "Processing", "Evaluating", "Tracing", "Mapping"
];

// ============ Log Type Configurations (Enhanced colors) ============

export const LOG_TYPE_CONFIG: Record<string, {
  icon: React.ReactNode;
  borderColor: string;
  bgColor: string;
}> = {
  prompt: {
    icon: React.createElement(MessageSquare, { className: "w-4 h-4 text-violet-600 dark:text-violet-400" }),
    borderColor: "border-l-violet-500",
    bgColor: "bg-violet-500/10"
  },
  response: {
    icon: React.createElement(FileText, { className: "w-4 h-4 text-emerald-600 dark:text-emerald-400" }),
    borderColor: "border-l-emerald-500",
    bgColor: "bg-emerald-500/10"
  },
  status: {
    icon: React.createElement(Activity, { className: "w-4 h-4 text-amber-600 dark:text-amber-400" }),
    borderColor: "border-l-amber-500",
    bgColor: "bg-amber-500/10"
  },
  error: {
    icon: React.createElement(AlertTriangle, { className: "w-4 h-4 text-red-600 dark:text-red-400" }),
    borderColor: "border-l-red-500",
    bgColor: "bg-red-500/15"
  },
  info: {
    icon: React.createElement(Terminal, { className: "w-4 h-4 text-muted-foreground" }),
    borderColor: "border-l-muted-foreground",
    bgColor: "bg-muted/10"
  },
  progress: {
    icon: React.createElement(Loader2, { className: "w-4 h-4 text-cyan-600 dark:text-cyan-400 animate-spin" }),
    borderColor: "border-l-cyan-500",
    bgColor: "bg-cyan-500/10"
  },
  tool: {
    icon: React.createElement(Code, { className: "w-4 h-4 text-orange-600 dark:text-orange-400" }),
    borderColor: "border-l-orange-500",
    bgColor: "bg-orange-500/10"
  },
  step_start: {
    icon: React.createElement(Activity, { className: "w-4 h-4 text-blue-600 dark:text-blue-400" }),
    borderColor: "border-l-blue-500",
    bgColor: "bg-blue-500/10"
  },
  step_finish: {
    icon: React.createElement(CheckCircle2, { className: "w-4 h-4 text-purple-600 dark:text-purple-400" }),
    borderColor: "border-l-purple-500",
    bgColor: "bg-purple-500/10"
  },
};

export const LOG_TYPE_LABELS: Record<string, string> = {
  prompt: 'PROMPT',
  response: 'RESP',
  status: 'STATUS',
  error: 'ERROR',
  info: 'INFO',
  progress: 'PROG',
  tool: 'TOOL',
  step_start: 'START',
  step_finish: 'DONE',
};

// ============ Session Status Configurations ============

export const SESSION_STATUS_CONFIG: Record<string, {
  icon: React.ReactNode;
  color: string;
  text: string;
  animate?: boolean;
}> = {
  active: {
    icon: React.createElement("div", { className: "w-2 h-2 rounded-full bg-emerald-500 dark:bg-emerald-400" }),
    color: "text-emerald-600 dark:text-emerald-400",
    text: "Active",
    animate: true
  },
  closed: {
    icon: React.createElement(CheckCircle2, { className: "w-3 h-3 text-emerald-600 dark:text-emerald-400" }),
    color: "text-emerald-600 dark:text-emerald-400",
    text: "Completed"
  },
  error: {
    icon: React.createElement(XCircle, { className: "w-3 h-3 text-rose-600 dark:text-rose-400" }),
    color: "text-rose-600 dark:text-rose-400",
    text: "Failed"
  },
  pending: {
    icon: React.createElement(Clock, { className: "w-3 h-3 text-amber-600 dark:text-amber-400" }),
    color: "text-amber-600 dark:text-amber-400",
    text: "Pending"
  },
};

// ============ Server Status Configurations ============

export const SERVER_STATUS_CONFIG: Record<string, {
  icon: React.ReactNode;
  color: string;
  text: string;
  animate?: boolean;
}> = {
  running: {
    icon: React.createElement(Server, { className: "w-3 h-3 text-emerald-600 dark:text-emerald-400" }),
    color: "text-emerald-600 dark:text-emerald-400",
    text: "Running",
    animate: true
  },
  starting: {
    icon: React.createElement(Loader2, { className: "w-3 h-3 text-amber-600 dark:text-amber-400 animate-spin" }),
    color: "text-amber-600 dark:text-amber-400",
    text: "Starting"
  },
  error: {
    icon: React.createElement(XCircle, { className: "w-3 h-3 text-rose-600 dark:text-rose-400" }),
    color: "text-rose-600 dark:text-rose-400",
    text: "Error"
  },
  stopped: {
    icon: React.createElement("div", { className: "w-2 h-2 rounded-full bg-muted" }),
    color: "text-muted-foreground",
    text: "Stopped"
  },
};

// ============ Polling Intervals ============

export const POLLING_INTERVALS = {
  SESSION_STATUS: 2000,
};

// ============ Timeouts ============

export const TIMEOUTS = {
  SPLASH_SCREEN: 2800,
};

// ============ UI Configuration ============

export const UI_CONFIG = {
  LOG_MAX_HEIGHT: 256,
  ANIMATION_DURATION: 200,
  SCROLL_BEHAVIOR: 'smooth' as const,
};

// ============ Color Palette ============

export const COLORS = {
  primary: '#38bdf8',
  success: '#34d399',
  error: '#fb7185',
  warning: '#fbbf24',
  info: '#38bdf8',
  background: {
    primary: '#0a0a0f',
    secondary: '#0d0d12',
    tertiary: '#0b0b10',
  },
  border: {
    primary: 'rgba(255,255,255,0.1)',
    secondary: 'rgba(255,255,255,0.05)',
  }
};

// ============ ASCII Art ============

export const DEEPAUDIT_ASCII = `
╔═══════════════════════════════════════════════════════════════╗
║                                                               ║
║   ____  _____ _____ ____   ____  _____ _____ ____   _   _      ║
║  / ___|| ____| ____|  _ \\ |  _ \\| ____| ____|  _ \\ / \\ | |    ║
║ | |  _ |  _| |  _| | |_) || | | |  _| |  _| | |_) / _ \\| |    ║
║ | |_| || |___| |___|  __/ | |_| | |___| |___|  __/ ___ \\ |___ ║
║  \\____||_____|_____|_|    |____/|_____|_____|_| /_/   \\_\\_____|║
║                                                               ║
║                   [ OpenCode Auditor ]                        ║
║                                                               ║
╚═══════════════════════════════════════════════════════════════╝`;
