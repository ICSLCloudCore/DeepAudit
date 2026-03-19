/**
 * OpenCode Audit Status Badge Component
 */

import { SESSION_STATUS_CONFIG, SERVER_STATUS_CONFIG } from "../constants";

interface StatusBadgeProps {
  status: string;
  type?: "session" | "server";
}

export function StatusBadge({ status, type = "session" }: StatusBadgeProps) {
  const config = type === "session" 
    ? (SESSION_STATUS_CONFIG[status] || SESSION_STATUS_CONFIG.pending)
    : (SERVER_STATUS_CONFIG[status] || SERVER_STATUS_CONFIG.stopped);

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-bold uppercase tracking-wider ${config.color}`}>
      {config.icon}
      {config.text}
    </span>
  );
}

export default StatusBadge;
