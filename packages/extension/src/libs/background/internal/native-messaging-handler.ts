import { NativeMessaging } from '../../native-messaging';

export class NativeMessagingHandler {
  private nativeMessaging: NativeMessaging;

  constructor() {
    this.nativeMessaging = NativeMessaging.getInstance();
    this.setupMessageListener();
  }

  private setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'nativeMessaging_request') {
        this.handleNativeMessagingRequest(message, sender, sendResponse);
      }
      return true; // Keep the message channel open for async response
    });
  }

  private async handleNativeMessagingRequest(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) {
    try {
      const response = await this.nativeMessaging.sendMessage(
        message.method,
        message.params
      );
      
      // Send response back to the UI
      chrome.runtime.sendMessage({
        type: 'nativeMessaging_response',
        success: true,
        data: response
      });
    } catch (error) {
      console.error('Native messaging request failed:', error);
      chrome.runtime.sendMessage({
        type: 'nativeMessaging_response',
        success: false,
        error: error.message || 'Native messaging request failed'
      });
    }
  }
}
