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
  private isBackgroundScript: boolean;

  private constructor() {
    // Check if we're in the background script context
    this.isBackgroundScript = this.checkIfBackgroundScript();
    if (this.isBackgroundScript) {
      this.setupConnection();
    } else {
      this.setupMessageProxy();
    }
  }

  private checkIfBackgroundScript(): boolean {
    try {
      // Background scripts have access to chrome.runtime.connectNative
      return typeof chrome !== 'undefined' && 
             typeof chrome.runtime !== 'undefined' && 
             typeof chrome.runtime.connectNative === 'function';
    } catch {
      return false;
    }
  }

  public static getInstance(): NativeMessaging {
    if (!NativeMessaging.instance) {
      NativeMessaging.instance = new NativeMessaging();
    }
    return NativeMessaging.instance;
  }

  private setupMessageProxy() {
    // Setup message handling for non-background contexts
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'nativeMessaging_response') {
        const pendingMessage = this.messageQueue.shift();
        if (pendingMessage) {
          if (message.success) {
            pendingMessage.resolve(message.data);
          } else {
            pendingMessage.reject(new Error(message.error || 'Native messaging failed'));
          }
        }
      }
      return true; // Keep the message channel open for async response
    });
  }

  private setupConnection() {
    if (!this.isBackgroundScript || this.isConnecting) return;
    this.isConnecting = true;

    try {
      this.port = chrome.runtime.connectNative(this.hostName);
      
      this.port.onMessage.addListener((response: NativeMessageResponse) => {
        // Forward response to UI if needed
        chrome.runtime.sendMessage({
          type: 'nativeMessaging_response',
          ...response
        });

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
    const message = { method, params };

    return new Promise((resolve, reject) => {
      if (this.isBackgroundScript) {
        try {
          if (!this.port) {
            this.setupConnection();
          }
          if (!this.port) {
            throw new Error('Native messaging not connected');
          }

          this.messageQueue.push({ message, resolve, reject });
          this.port.postMessage(message);
        } catch (error) {
          this.messageQueue.pop(); // Remove from queue if sending failed
          reject(error);
        }
      } else {
        // Send message through runtime messaging
        this.messageQueue.push({ message, resolve, reject });
        chrome.runtime.sendMessage({
          type: 'nativeMessaging_request',
          method,
          params
        });
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