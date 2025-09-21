import {
  backgroundOnMessageFromWindow,
  backgroundOnMessageFromNewWindow,
  backgroundOnMessageFromAction,
  backgroundOnMessageFromBackground,
  backgroundOnMessageFromCS,
} from '@/libs/messenger/extension';
import { InternalOnMessageResponse } from '@/types/messenger';
import { OnMessageResponse } from '@enkryptcom/types';
import BackgroundHandler from '@/libs/background';
import Browser from 'webextension-polyfill';
import openOnboard from '@/libs/utils/open-onboard';

// Initialize background handler
const backgroundHandler = new BackgroundHandler();
backgroundHandler.init();

// Add explicit native messaging listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);
  
  if (message.type === 'nativeMessaging_request') {
    console.log('Background script received native messaging request:', message);
    
    try {
      // Check if native messaging is available
      if (typeof chrome.runtime.connectNative !== 'function') {
        console.error('Native messaging is not available in this context');
        chrome.runtime.sendMessage({
          type: 'nativeMessaging_response',
          success: false,
          error: 'Native messaging is not available'
        }).catch(err => console.error('Failed to send error:', err));
        return;
      }

      // Create native messaging port
      const port = chrome.runtime.connectNative(message.hostName);
      
      port.onMessage.addListener((response) => {
        console.log('Native host response:', response);
        chrome.runtime.sendMessage({
          type: 'nativeMessaging_response',
          ...response
        }).catch(err => console.error('Failed to forward response:', err));
      });
      
      port.onDisconnect.addListener(() => {
        const error = chrome.runtime.lastError;
        console.error('Native port disconnected:', error?.message);
        if (error) {
          chrome.runtime.sendMessage({
            type: 'nativeMessaging_response',
            success: false,
            error: error.message
          }).catch(err => console.error('Failed to send error:', err));
        }
      });
      
      // Send message to native host
      port.postMessage({
        method: message.method,
        params: message.params
      });
    } catch (error) {
      console.error('Error setting up native messaging:', error);
      chrome.runtime.sendMessage({
        type: 'nativeMessaging_response',
        success: false,
        error: error.message || 'Failed to setup native messaging'
      }).catch(err => console.error('Failed to send error:', err));
    }
    
    // Handle the request through background handler as well
    backgroundHandler.internalHandler({
      provider: 'enkrypt',
      message: JSON.stringify({
        method: message.method,
        params: message.params
      }),
      sender: {
        tab: sender.tab,
        frameId: sender.frameId || 0,
        tabId: sender.tab?.id || -1,
        url: sender.url || ''
      }
    }).then(response => {
      console.log('Native messaging response:', response);
      chrome.runtime.sendMessage({
        type: 'nativeMessaging_response',
        ...response
      }).catch(err => console.error('Failed to send response:', err));
    }).catch(error => {
      console.error('Native messaging error:', error);
      chrome.runtime.sendMessage({
        type: 'nativeMessaging_response',
        success: false,
        error: error.message
      }).catch(err => console.error('Failed to send error:', err));
    });
    
    return true; // Will respond asynchronously
  }
});
backgroundOnMessageFromNewWindow((msg): Promise<InternalOnMessageResponse> => {
  return backgroundHandler.internalHandler(msg);
});
backgroundOnMessageFromWindow((msg): Promise<OnMessageResponse> => {
  return backgroundHandler.externalHandler(msg);
});
backgroundOnMessageFromAction((msg): Promise<InternalOnMessageResponse> => {
  return backgroundHandler.internalHandler(msg);
});
backgroundOnMessageFromBackground((msg): Promise<InternalOnMessageResponse> => {
  return backgroundHandler.internalHandler(msg);
});
backgroundOnMessageFromCS((msg): Promise<OnMessageResponse> => {
  return backgroundHandler.externalHandler(msg);
});

Browser.runtime.onInstalled.addListener(object => {
  if (object.reason === 'install') {
    openOnboard();
  }
});

if (__IS_OPERA__) {
  Browser.scripting.registerContentScripts([
    {
      id: 'inject-script',
      js: ['scripts/inject.js'],
      persistAcrossSessions: false,
      matches: ['http://*/*', 'https://*/*'],
      runAt: 'document_start',
      world: 'MAIN',
    } as any,
  ]);
}
