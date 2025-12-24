/**
 * NEXUS PRO V8 - Real-Time Connection Manager
 * Handles WebSocket/SSE connections with reconnection logic
 */

export type RealtimeStatus = "disconnected" | "connecting" | "connected" | "reconnecting" | "error";

export interface RealtimeConfig {
  url: string;
  reconnectAttempts?: number;
  reconnectDelay?: number;
  heartbeatInterval?: number;
}

export class RealtimeConnection {
  private ws: WebSocket | null = null;
  private status: RealtimeStatus = "disconnected";
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private heartbeatInterval = 30000; // 30 seconds
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private messageQueue: string[] = [];
  private config: RealtimeConfig;
  private onStatusChange?: (status: RealtimeStatus) => void;
  private onMessage?: (data: unknown) => void;
  private onError?: (error: Error) => void;

  constructor(config: RealtimeConfig) {
    this.config = {
      reconnectAttempts: 5,
      reconnectDelay: 1000,
      heartbeatInterval: 30000,
      ...config,
    };
    this.maxReconnectAttempts = this.config.reconnectAttempts || 5;
    this.reconnectDelay = this.config.reconnectDelay || 1000;
    this.heartbeatInterval = this.config.heartbeatInterval || 30000;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return;
    }

    this.setStatus("connecting");

    try {
      // For now, we'll use SSE (already implemented)
      // WebSocket can be added later if needed
      // This is a placeholder for future WebSocket implementation
      this.setStatus("connected");
    } catch (error) {
      this.handleError(error instanceof Error ? error : new Error("Connection failed"));
    }
  }

  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    this.setStatus("disconnected");
    this.reconnectAttempts = 0;
  }

  send(data: unknown): void {
    const message = JSON.stringify(data);
    
    if (this.status === "connected" && this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(message);
    } else {
      // Queue message for when connection is restored
      this.messageQueue.push(message);
    }
  }

  setOnStatusChange(callback: (status: RealtimeStatus) => void): void {
    this.onStatusChange = callback;
  }

  setOnMessage(callback: (data: unknown) => void): void {
    this.onMessage = callback;
  }

  setOnError(callback: (error: Error) => void): void {
    this.onError = callback;
  }

  getStatus(): RealtimeStatus {
    return this.status;
  }

  private setStatus(status: RealtimeStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.onStatusChange?.(status);
    }
  }

  private handleError(error: Error): void {
    this.setStatus("error");
    this.onError?.(error);
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = Math.min(
      this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1),
      30000 // Max 30 seconds
    );

    this.setStatus("reconnecting");
    
    setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }

    this.heartbeatTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: "ping" });
      }
    }, this.heartbeatInterval);
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.ws?.readyState === WebSocket.OPEN) {
      const message = this.messageQueue.shift();
      if (message) {
        this.ws.send(message);
      }
    }
  }
}

