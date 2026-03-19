/**
 * OpenCode Audit Splash Screen Component
 * Terminal Retro / Cassette Futurism aesthetic
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { Shield, Zap } from "lucide-react";

interface SplashScreenProps {
  onComplete: () => void;
}

const BOOT_SEQUENCE = [
  { text: "[INIT] Loading OpenCode Core...", delay: 0, type: 'init' },
  { text: "[SCAN] Prompt Analysis Engine", delay: 200, type: 'scan' },
  { text: "[LOAD] Session Configuration", delay: 400, type: 'load' },
  { text: "[SYNC] OpenCode Server Connection", delay: 600, type: 'sync' },
  { text: "[READY] System Online", delay: 800, type: 'ready' },
];

const COMMANDS: Record<string, { action: string; output?: string }> = {
  audit: { action: "start", output: "Initializing OpenCode audit configuration..." },
  start: { action: "start", output: "Initializing OpenCode audit configuration..." },
  scan: { action: "start", output: "Initializing OpenCode audit configuration..." },
  help: { action: "help" },
  clear: { action: "clear" },
};

const HELP_TEXT = `
Available commands:
  audit, start, scan  - Start a new OpenCode audit
  help                - Show this help message
  clear               - Clear terminal

Type 'audit' to begin a new OpenCode security audit.
`;

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [bootLogs, setBootLogs] = useState<string[]>([]);
  const [showLogo, setShowLogo] = useState(false);
  const [bootComplete, setBootComplete] = useState(false);
  const [commandHistory, setCommandHistory] = useState<Array<{ input: string; output?: string; isError?: boolean }>>([]);
  const [currentInput, setCurrentInput] = useState("");
  const [cursorBlink, setCursorBlink] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const initializedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    setTimeout(() => setShowLogo(true), 100);

    BOOT_SEQUENCE.forEach(({ text, delay }) => {
      setTimeout(() => {
        setBootLogs(prev => [...prev, text]);
      }, delay + 400);
    });

    setTimeout(() => setBootComplete(true), 1200);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setCursorBlink(b => !b), 530);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [bootLogs, commandHistory]);

  useEffect(() => {
    if (bootComplete && inputRef.current) {
      inputRef.current.focus();
    }
  }, [bootComplete]);

  const executeCommand = useCallback((cmd: string) => {
    const trimmedCmd = cmd.trim().toLowerCase();

    if (!trimmedCmd) return;

    const command = COMMANDS[trimmedCmd];

    if (!command) {
      setCommandHistory(prev => [...prev, {
        input: cmd,
        output: `Command not found: ${trimmedCmd}. Type 'help' for available commands.`,
        isError: true
      }]);
      return;
    }

    switch (command.action) {
      case "start":
        setCommandHistory(prev => [...prev, {
          input: cmd,
          output: command.output
        }]);
        setTimeout(() => {
          onCompleteRef.current();
        }, 500);
        break;

      case "help":
        setCommandHistory(prev => [...prev, {
          input: cmd,
          output: HELP_TEXT
        }]);
        break;

      case "clear":
        setCommandHistory([]);
        setBootLogs([]);
        break;
    }
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      executeCommand(currentInput);
      setCurrentInput("");
    }
  };

  const handleTerminalClick = () => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className="h-screen bg-gray-100 dark:bg-black flex flex-col overflow-hidden relative cyber-splash">
      <div className="absolute inset-0 bg-gradient-to-br from-gray-50 via-gray-100 to-gray-200 dark:from-black dark:via-gray-950 dark:to-black pointer-events-none" />
      <div className="absolute inset-0 cyber-grid opacity-20 dark:opacity-30 pointer-events-none" />
      
      <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden hidden dark:block">
        <div className="scan-line" />
      </div>
      
      <div className="absolute inset-0 pointer-events-none z-10 crt-effect hidden dark:block" />
      
      <div className="absolute inset-0 pointer-events-none z-10 dark:hidden" style={{ background: "radial-gradient(ellipse at center, transparent 0%, transparent 50%, rgba(0,0,0,0.15) 100%)" }} />
      <div className="absolute inset-0 pointer-events-none z-10 hidden dark:block" style={{ background: "radial-gradient(ellipse at center, transparent 0%, transparent 40%, rgba(0,0,0,0.7) 100%)" }} />

      <div className="flex-1 flex items-center justify-center p-4 relative z-30">
        <div className="w-full max-w-2xl">
          <div className={`text-center mb-10 transition-all duration-1000 ${showLogo ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-8"}`}>
            <div className="logo-glitch relative inline-block">
              <div className="text-5xl sm:text-6xl md:text-7xl font-bold tracking-wider mb-3 font-mono relative logo-text">
                <span className="text-primary">OPEN</span>
                <span className="text-gray-800 dark:text-white">CODE</span>
                <span className="text-primary">AUDIT</span>
              </div>
            </div>
            <div className="flex items-center justify-center gap-3 text-gray-500 dark:text-gray-400 text-sm tracking-[0.3em] uppercase mt-4">
              <div className="w-12 h-px bg-gradient-to-r from-transparent via-primary/40 dark:via-cyan-500/50 to-transparent" />
              <Shield className="w-4 h-4 text-primary/70 dark:text-cyan-500/70" />
              <span className="dark:cyber-text">OpenCode Auditor</span>
              <Shield className="w-4 h-4 text-primary/70 dark:text-cyan-500/70" />
              <div className="w-12 h-px bg-gradient-to-r from-transparent via-primary/40 dark:via-cyan-500/50 to-transparent" />
            </div>
          </div>

          <div className="relative rounded-xl overflow-hidden bg-white dark:bg-transparent border border-gray-200 dark:border-transparent shadow-xl dark:shadow-none" onClick={handleTerminalClick}>
            <div className="relative flex items-center gap-3 px-4 py-2.5 bg-gray-100 dark:bg-gray-950 border-b border-gray-200 dark:border-primary/20">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-400 dark:bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-400 dark:bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-400 dark:bg-green-500" />
              </div>
              <div className="flex-1 flex items-center justify-center gap-2">
                <span className="text-primary/60 text-xs">▶</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 font-mono tracking-[0.15em] uppercase">root@opencode:~#</span>
                <span className="w-2 h-4 bg-primary/80 animate-pulse" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-emerald-600 dark:text-emerald-500/80 font-mono">LIVE</span>
              </div>
            </div>

            <div ref={terminalRef} className="relative p-5 font-mono text-sm h-80 overflow-y-auto custom-scrollbar bg-gray-50 dark:bg-gray-950/95">
              {bootLogs.map((log, i) => (
                <div key={`boot-${i}`} className={`mb-2 flex items-center gap-2 ${
                  log.includes("[READY]") ? "text-emerald-600 dark:text-emerald-400" :
                  log.includes("[INIT]") ? "text-primary" :
                  log.includes("[SCAN]") ? "text-violet-600 dark:text-violet-400" :
                  log.includes("[LOAD]") ? "text-amber-600 dark:text-amber-400" :
                  log.includes("[SYNC]") ? "text-cyan-600 dark:text-cyan-400" :
                  "text-gray-500"
                }`}>
                  <span className="text-emerald-600 dark:text-emerald-500/60">$</span>
                  <span>{log}</span>
                </div>
              ))}

              {bootComplete && (
                <div className="mt-5 mb-4 pt-4 border-t border-gray-200 dark:border-primary/20">
                  <div className="flex items-center gap-2 text-primary mb-2">
                    <Zap className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
                    <span className="font-semibold text-cyan-600 dark:text-cyan-400">// SYSTEM READY</span>
                  </div>
                  <div className="text-gray-600 dark:text-gray-400 text-sm pl-6">
                    Execute <span className="text-emerald-600 dark:text-emerald-400 font-bold px-2 py-0.5 bg-emerald-500/10 dark:bg-emerald-500/20 border border-emerald-500/30 rounded">'audit'</span> to initialize OpenCode audit protocol
                  </div>
                </div>
              )}

              {commandHistory.map((entry, i) => (
                <div key={`cmd-${i}`} className="mb-2">
                  <div className="flex items-center gap-2 text-foreground">
                    <span className="text-emerald-500">$</span>
                    <span>{entry.input}</span>
                  </div>
                  {entry.output && (
                    <div className={`ml-4 mt-1 whitespace-pre-wrap text-xs ${entry.isError ? "text-red-400" : "text-muted-foreground"}`}>
                      {entry.output}
                    </div>
                  )}
                </div>
              ))}

              {bootComplete && (
                <div className="flex items-center gap-2 text-foreground">
                  <span className="text-emerald-500">$</span>
                  <div className="flex-1 relative">
                    <input
                      ref={inputRef}
                      type="text"
                      value={currentInput}
                      onChange={(e) => setCurrentInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      className="absolute inset-0 w-full bg-transparent text-transparent outline-none border-none"
                      style={{ caretColor: "transparent" }}
                      spellCheck={false}
                      autoComplete="off"
                      autoFocus
                    />
                    <span className="text-foreground">{currentInput}</span>
                    <span className={`inline-block w-2 h-4 bg-emerald-400 ml-0.5 align-middle transition-opacity ${cursorBlink ? "opacity-100" : "opacity-0"}`} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .cyber-grid {
          background-image: linear-gradient(rgba(255,107,44,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,44,0.15) 1px, transparent 1px);
          background-size: 50px 50px;
          animation: gridMove 20s linear infinite;
        }
        .dark .cyber-grid {
          background-image: linear-gradient(rgba(255,107,44,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,107,44,0.1) 1px, transparent 1px);
        }
        @keyframes gridMove {
          0% { background-position: 0 0; }
          100% { background-position: 50px 50px; }
        }
        .scan-line {
          position: absolute;
          width: 100%;
          height: 2px;
          background: linear-gradient(90deg, transparent, rgba(255,107,44,0.5), rgba(0,255,255,0.3), transparent);
          box-shadow: 0 0 10px rgba(255,107,44,0.5), 0 0 20px rgba(0,255,255,0.3);
          animation: scanLine 4s linear infinite;
        }
        @keyframes scanLine {
          0% { top: -2px; opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { top: 100%; opacity: 0; }
        }
        .crt-effect {
          background: repeating-linear-gradient(0deg, rgba(0, 0, 0, 0.15), rgba(0, 0, 0, 0.15) 1px, transparent 1px, transparent 2px);
        }
      `}</style>
    </div>
  );
}

export default SplashScreen;
