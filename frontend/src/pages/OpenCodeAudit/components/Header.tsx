/**
 * OpenCode Audit Header Component
 */

import { Sparkles, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { HeaderProps } from "../types";
import { SESSION_STATUS_CONFIG, SERVER_STATUS_CONFIG } from "../constants";

export function Header({ session, isRunning, onNewAudit }: HeaderProps) {
  return (
    <header className="flex-shrink-0 h-16 border-b border-border/50 flex items-center justify-between px-6 bg-card/80 backdrop-blur-md relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/50 to-transparent" />
      
      <div className="flex items-center gap-5 relative z-10">
        <div className="flex items-center gap-3 pr-5 border-r border-border/50">
          <div className="relative group">
            <div className="relative p-2 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/30">
              <Server className="w-5 h-5 text-primary" />
              {isRunning && (
                <>
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse" />
                  <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-ping opacity-75" />
                </>
              )}
            </div>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-foreground tracking-wider text-base leading-tight">
              OPEN<span className="text-primary">CODE</span>
            </span>
            <span className="text-[10px] text-muted-foreground tracking-[0.2em] uppercase">Auditor</span>
          </div>
        </div>

        {session && (
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-muted/50 border border-border/50">
              <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">Session</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="text-foreground text-sm font-mono truncate max-w-[200px] font-medium">
                {session.id.slice(0, 8)}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider">
                  {SESSION_STATUS_CONFIG[session.status]?.text || session.status}
                </span>
                {session.opencode_server_status && (
                  <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">
                    ({SERVER_STATUS_CONFIG[session.opencode_server_status]?.text || session.opencode_server_status})
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 relative z-10">
        <Button
          variant="ghost"
          size="sm"
          onClick={onNewAudit}
          className="h-9 px-4 text-xs font-mono uppercase tracking-wider text-primary hover:text-primary/90 bg-primary/10 hover:bg-primary/20 border border-primary/30 hover:border-primary/50 transition-all duration-300 rounded-md"
        >
          <Sparkles className="w-3.5 h-3.5 mr-2" />
          <span>New Audit</span>
        </Button>
      </div>

      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-border/50 to-transparent" />
      
      {isRunning && (
        <>
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-emerald-500/60 to-transparent" />
          <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/3 h-4 bg-gradient-to-t from-emerald-500/10 to-transparent pointer-events-none" />
        </>
      )}
    </header>
  );
}

export default Header;
