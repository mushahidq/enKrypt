import { Runtime } from 'webextension-polyfill';

export interface NativeMessageResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

export class NativeMessaging {
  private static instance: NativeMessaging;
  private hostName = 'com.enkrypt.totp';
  private port: Runtime.Port | null = null;
  private messageQueue: Array<{
    message: any;
    resolve: (value: any) => void;
    reject: (reason: any) => void;
  }> = [];
  private isConnecting = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 1000; // 1 second

  private constructor() {
    this.setupConnection();
  }

  public static getInstance(): NativeMessaging {
    if (!NativeMessaging.instance) {
      NativeMessaging.instance = new NativeMessaging();
    }
    return NativeMessaging.instance;
  }

  private setupConnection() {
    if (this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.port = chrome.runtime.connectNative(this.hostName);
      
      this.port.onMessage.addListener((response: NativeMessageResponse) => {
        const pendingMessage = this.messageQueue.shift();
        if (pendingMessage) {
          if (response.success) {
            pendingMessage.resolve(response);
          } else {
            pendingMessage.reject(new Error(response.error || 'Native messaging failed'));
          }
        }
      });

      this.port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        console.error('Native messaging disconnected:', error?.message);
        this.port = null;
        this.isConnecting = false;

        // Handle pending messages
        while (this.messageQueue.length > 0) {
          const pendingMessage = this.messageQueue.shift();
          if (pendingMessage) {
            pendingMessage.reject(new Error('Native messaging connection lost'));
          }
        }

        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          this.reconnectAttempts++;
          setTimeout(() => this.setupConnection(), this.reconnectDelay);
        }
      });

      this.isConnecting = false;
      this.reconnectAttempts = 0;
    } catch (error) {
      console.error('Failed to setup native messaging:', error);
      this.isConnecting = false;
      throw error;
    }
  }

  public async sendMessage<T = any>(
    method: string,
    params: Record<string, any> = {}
  ): Promise<NativeMessageResponse<T>> {
    if (!this.port) {
      this.setupConnection();
    }

    return new Promise((resolve, reject) => {
      const message = { method, params };

      try {
        if (!this.port) {
          throw new Error('Native messaging not connected');
        }

        this.messageQueue.push({ message, resolve, reject });
        this.port.postMessage(message);
      } catch (error) {
        this.messageQueue.pop(); // Remove from queue if sending failed
        reject(error);
      }
    });
  }

  public disconnect() {
    if (this.port) {
      this.port.disconnect();
      this.port = null;
    }
  }
}
