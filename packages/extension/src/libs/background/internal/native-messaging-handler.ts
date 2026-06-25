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
        // Handle the request and ensure we respond
        this.handleNativeMessagingRequest(message, sender)
          .then(() => {
            sendResponse({ received: true });
          })
          .catch(error => {
            console.error('Native messaging error:', error);
            sendResponse({ error: error.message });
          });
      }
      return true; // Keep the channel open for our async response
    });
  }

  private async handleNativeMessagingRequest(
    message: any,
    sender: chrome.runtime.MessageSender,
    sendResponse: (response?: any) => void
  ) {
    try {
      console.log('Background: Handling native messaging request:', message);
      
      // Ensure params are passed through
      const response = await this.nativeMessaging.sendMessage(
        message.method,
        message.params || {}
      );
      
      console.log('Background: Native messaging response:', response);
      
      // Send response back to the UI
      chrome.runtime.sendMessage({
        type: 'nativeMessaging_response',
        success: true,
        data: response
      }).catch(err => {
        console.error('Failed to send response to UI:', err);
      });
    } catch (error) {
      console.error('Native messaging request failed:', error);
      chrome.runtime.sendMessage({
        type: 'nativeMessaging_response',
        success: false,
        error: error.message || 'Native messaging request failed'
      }).catch(err => {
        console.error('Failed to send error to UI:', err);
      });
    }
  }
}
