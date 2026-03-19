/**
 * OpenCode Audit Stats Panel Component
 */

import { Server, Clock, FileText, Activity } from "lucide-react";
import type { StatsPanelProps } from "../types";
import { SESSION_STATUS_CONFIG, SERVER_STATUS_CONFIG } from "../constants";

export function StatsPanel({ session }: StatsPanelProps) {
  if (!session) {
    return (
      <div className="p-4 space-y-4">
        <div className="text-center text-muted-foreground text-sm font-mono">
          No active session
        </div>
      </div>
    );
  }

  const sessionConfig = SESSION_STATUS_CONFIG[session.status] || SESSION_STATUS_CONFIG.pending;
  const serverConfig = session.opencode_server_status 
    ? (SERVER_STATUS_CONFIG[session.opencode_server_status] || SERVER_STATUS_CONFIG.stopped)
    : null;

  const startedAt = session.started_at ? new Date(session.started_at) : null;
  const completedAt = session.completed_at ? new Date(session.completed_at) : null;
  
  const duration = startedAt 
    ? (completedAt || new Date()).getTime() - startedAt.getTime()
    : 0;
  
  const durationSeconds = Math.floor(duration / 1000);
  const durationMinutes = Math.floor(durationSeconds / 60);
  const remainingSeconds = durationSeconds % 60;

  const responseLength = session.response_content?.length || 0;

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Session Status</span>
          </div>
          <div className="flex items-center gap-2">
            {sessionConfig.icon}
            <span className={`text-xs font-mono font-bold uppercase ${sessionConfig.color}`}>
              {sessionConfig.text}
            </span>
          </div>
        </div>

        {serverConfig && (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-primary" />
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Server Status</span>
            </div>
            <div className="flex items-center gap-2">
              {serverConfig.icon}
              <span className={`text-xs font-mono font-bold uppercase ${serverConfig.color}`}>
                {serverConfig.text}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Duration</span>
          </div>
          <span className="text-sm font-mono text-foreground">
            {durationMinutes}:{remainingSeconds.toString().padStart(2, '0')}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Response</span>
          </div>
          <span className="text-sm font-mono text-foreground">
            {responseLength.toLocaleString()} chars
          </span>
        </div>
      </div>

      <div className="h-px bg-border" />

      <div className="pt-2">
        <div className="text-[10px] text-muted-foreground font-mono tracking-wider uppercase mb-2">
          Session ID
        </div>
        <div className="text-xs font-mono text-foreground/70 break-all">
          {session.id}
        </div>
      </div>
    </div>
  );
}

export default StatsPanel;
