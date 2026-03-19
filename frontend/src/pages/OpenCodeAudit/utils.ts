/**
 * OpenCode Audit Utilities
 * Helper functions for the OpenCode Audit page
 */

import type { LogItem } from "./types";

/**
 * Generate unique log ID
 */
let logIdCounter = 0;
export function generateLogId(): string {
  return `log-${++logIdCounter}`;
}

/**
 * Reset log ID counter (for testing)
 */
export function resetLogIdCounter(): void {
  logIdCounter = 0;
}

/**
 * Get current time string for logs
 */
export function getTimeString(): string {
  return new Date().toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Create a log item
 */
export function createLogItem(item: Omit<LogItem, 'id' | 'time'>): LogItem {
  return {
    ...item,
    id: generateLogId(),
    time: getTimeString(),
  };
}

/**
 * Truncate output string
 */
export function truncateOutput(output: string, maxLength: number = 1000): string {
  if (output.length <= maxLength) return output;
  return output.slice(0, maxLength) + '\n... (truncated)';
}

/**
 * Check if session is in running state
 */
export function isSessionRunning(status: string | undefined): boolean {
  return status === 'active' || status === 'pending';
}

/**
 * Check if session is complete
 */
export function isSessionComplete(status: string | undefined): boolean {
  return status === 'closed' || status === 'error';
}
