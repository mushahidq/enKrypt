import {
  ConnectionStatus,
  SocketClientOptions,
  TwoPartyEcdsaMessage,
  PendingRequest,
  TwoPartyEcdsaResponse,
} from "@enkryptcom/types";

import { WebSocket, MessageEvent } from "ws";

export class WebSocketClient {
  private ws: WebSocket | null = null;

  private readonly host: string;
  private readonly port: string;

  private readonly pendingRequests = new Map<string, PendingRequest>();
  private reconnectAttempts = 0;
  private closedByUser = false;

  onUnsolicitedMessage?: (message: TwoPartyEcdsaMessage) => void;

  private readonly requestTimeoutMs: number;
  private readonly reconnectDelayMs: number;
  private readonly maxReconnectAttempts: number;
  private readonly onStatusChange?: (status: ConnectionStatus) => void;

  constructor(opts: SocketClientOptions) {
    this.host = opts.host;
    this.port = opts.port;
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 3000;
    this.reconnectDelayMs = opts.reconnectDelayMs ?? 2000;
    this.maxReconnectAttempts = opts.maxReconnectAttempts ?? Infinity;
    this.onStatusChange = opts.onStatusChange;
  }

  private setStatus(status: ConnectionStatus): void {
    this.onStatusChange?.(status);
  }

  private open(): Promise<void> {
    this.setStatus(
      this.reconnectAttempts > 0
        ? ConnectionStatus.reconnecting
        : ConnectionStatus.connecting,
    );

    const url = "ws://" + this.host + ":" + this.port;

    const ws = new WebSocket(url);
    // ws.binaryType = "arraybuffer";
    this.ws = ws;

    return new Promise<void>((resolve, reject) => {
      let settled = false;

      const finish = (callback: () => void) => {
        if (!settled) {
          settled = true;
          callback();
        }
      };

      ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.setStatus(ConnectionStatus.open);
        finish(resolve);
      };

      ws.onmessage = (event: MessageEvent) => {
        void this.handleMessage(event.data as Uint8Array);
      };

      ws.onerror = (error) => {
        console.log("Error encountered", error);
        finish(() => reject(new Error("WebSocket connection failed")));
      };

      ws.onclose = (event) => {
        this.setStatus(ConnectionStatus.closed);
        this.rejectAllPending(
          new Error(
            `Connection closed with code ${event.code}${event.reason ? `: ${event.reason}` : ""}`,
          ),
        );
        if (!this.closedByUser) {
          this.scheduleReconnect();
        }
        finish(() =>
          reject(new Error(`Connection closed with code ${event.code}`)),
        );
      };
    });
  }

  private async handleMessage(data: Uint8Array): Promise<void> {
    let message: TwoPartyEcdsaMessage;
    message = JSON.parse(
      new TextDecoder().decode(data),
    ) as TwoPartyEcdsaMessage;

    const pending = this.pendingRequests.get(message.sessionId);
    if (!pending) {
      this.onUnsolicitedMessage?.(message);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(message.sessionId);
    pending.resolve(message);
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.setStatus(ConnectionStatus.failed);
      return;
    }

    this.reconnectAttempts += 1;
    setTimeout(() => this.open(), this.reconnectDelayMs);
  }

  private rejectAllPending(err: Error): void {
    this.pendingRequests.forEach((pending, seq) => {
      clearTimeout(pending.timeout);
      pending.reject(err);
      this.pendingRequests.delete(seq);
    });
  }

  async connect(): Promise<void> {
    this.closedByUser = false;
    await this.open();
  }

  close(): void {
    this.closedByUser = true;
    this.ws?.close();
    this.rejectAllPending(new Error("Connection closed by user"));
  }

  async sendMessage(
    message: TwoPartyEcdsaMessage,
  ): Promise<TwoPartyEcdsaResponse> {
    if (!this.ws) {
      throw new Error("WebSocket error");
    }
    if (this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("WebSocket is not connected " + this.ws.readyState);
    }

    const responsePromise = new Promise<TwoPartyEcdsaResponse>(
      (resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(message.sessionId);
          reject(
            new Error(
              `Round ${message.round} of session ${message.sessionId} timed out after ${this.requestTimeoutMs}ms`,
            ),
          );
        }, this.requestTimeoutMs);

        this.pendingRequests.set(message.sessionId, {
          resolve,
          reject,
          timeout,
        });
      },
    );

    const frame = new Uint8Array(
      new Uint8Array(new TextEncoder().encode(JSON.stringify(message))),
    );
    this.ws.send(frame);
    return responsePromise;
  }
}
