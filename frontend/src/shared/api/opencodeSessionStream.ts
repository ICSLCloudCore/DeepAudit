/**
 * OpenCode会话流式事件处理器
 * 参考 agentStream.ts 的实现模式
 */

import type { OpenCodeMessage } from "../../pages/OpenCodeAudit/messageTypes";

export interface OpenCodeSessionStreamOptions {
  onData?: (newData: string, accumulated: string) => void;
  onDone?: () => void;
  onError?: (error: string) => void;
  onHeartbeat?: () => void;
  onMessage?: (message: OpenCodeMessage) => void;
}

export type OpenCodeStreamEventType = 'data' | 'error' | 'done' | 'heartbeat';

export interface OpenCodeStreamEvent {
  type: OpenCodeStreamEventType;
  data?: string;
  error?: string;
  message?: OpenCodeMessage;
  timestamp?: string;
}

export class OpenCodeSessionStreamHandler {
  private sessionId: string;
  private options: OpenCodeSessionStreamOptions;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private abortController: AbortController | null = null;
  private isConnected = false;
  private isDisconnecting = false;
  private responseBuffer: string = "";

  constructor(sessionId: string, options: OpenCodeSessionStreamOptions = {}) {
    this.sessionId = sessionId;
    this.options = options;
  }

  connect(): void {
    this.isDisconnecting = false;

    if (this.isConnected) {
      return;
    }

    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (!token) {
      this.options.onError?.('未登录');
      return;
    }

    this.connectWithFetch(token);
  }

  private async connectWithFetch(token: string): Promise<void> {
    if (this.isDisconnecting) {
      return;
    }

    const url = `/api/v1/opencode/sessions/${this.sessionId}/stream`;

    this.abortController = new AbortController();

    try {
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
        },
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      this.isConnected = true;
      this.responseBuffer = "";

      this.reader = response.body?.getReader() || null;
      if (!this.reader) {
        throw new Error('无法获取响应流');
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (this.isDisconnecting) {
          console.log('[OpenCodeSessionStream] Disconnecting, breaking loop');
          break;
        }

        const { done, value } = await this.reader.read();

        if (done) {
          console.log('[OpenCodeSessionStream] Reader done, stream ended');
          break;
        }

        buffer += decoder.decode(value, { stream: true });

        const events = this.parseSSE(buffer);
        buffer = events.remaining;

        if (events.parsed.length > 0) {
          const eventTypes = events.parsed.map(e => e.type);
          console.log(`[OpenCodeSessionStream] Received ${events.parsed.length} events:`, eventTypes);
        }

        for (const event of events.parsed) {
          this.handleEvent(event);
          if (event.type === 'data' && event.data) {
            await new Promise(resolve => setTimeout(resolve, 5));
          }
        }
      }

      if (this.reader) {
        this.reader.releaseLock();
        this.reader = null;
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        return;
      }

      this.isConnected = false;
      console.error('Stream connection error:', error);
      this.options.onError?.(`连接失败: ${error}`);
    } finally {
      if (this.reader) {
        try {
          this.reader.releaseLock();
        } catch {
        }
        this.reader = null;
      }
    }
  }

  private parseSSE(buffer: string): { parsed: OpenCodeStreamEvent[]; remaining: string } {
    const parsed: OpenCodeStreamEvent[] = [];
    const lines = buffer.split('\n');
    let remaining = '';
    let currentEvent: Partial<OpenCodeStreamEvent> = {};

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      if (line === '') {
        if (currentEvent.type) {
          parsed.push(currentEvent as OpenCodeStreamEvent);
          currentEvent = {};
        }
        continue;
      }

      if (i === lines.length - 1 && !buffer.endsWith('\n')) {
        remaining = line;
        break;
      }

      if (line.startsWith('event:')) {
        currentEvent.type = line.slice(6).trim() as OpenCodeStreamEventType;
      } else if (line.startsWith('data:')) {
        try {
          const data = JSON.parse(line.slice(5).trim());
          currentEvent = { ...currentEvent, ...data };
        } catch {
        }
      }
    }

    return { parsed, remaining };
  }

  private handleEvent(event: any): void {
    // 检查是否是 message 类型的事件
    if (event.type === 'data' && event.message) {
      this.options.onMessage?.(event.message);
      return;
    }

    switch (event.type) {
      case 'data':
        if (event.data) {
          this.responseBuffer += event.data;
          this.options.onData?.(event.data, this.responseBuffer);
        }
        break;

      case 'error':
        this.options.onError?.(event.error || '未知错误');
        break;

      case 'done':
        this.options.onDone?.();
        this.disconnect();
        break;

      case 'heartbeat':
        this.options.onHeartbeat?.();
        break;
    }
  }

  disconnect(): void {
    this.isDisconnecting = true;
    this.isConnected = false;

    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {
      }
      this.abortController = null;
    }

    if (this.reader) {
      const reader = this.reader;
      this.reader = null;

      Promise.resolve().then(() => {
        try {
          reader.cancel().catch(() => {
          }).finally(() => {
            try {
              reader.releaseLock();
            } catch {
            }
          });
        } catch {
        }
      });
    }
  }

  get connected(): boolean {
    return this.isConnected;
  }

  get accumulatedResponse(): string {
    return this.responseBuffer;
  }
}

export function createOpenCodeSessionStream(
  sessionId: string,
  options: OpenCodeSessionStreamOptions = {}
): OpenCodeSessionStreamHandler {
  return new OpenCodeSessionStreamHandler(sessionId, options);
}
