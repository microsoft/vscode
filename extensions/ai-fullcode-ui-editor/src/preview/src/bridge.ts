/**
 * IDE Bridge
 * 
 * VSCode Extension と Preview 間の通信を管理
 * Phase 4: SELECT_UI メッセージを処理
 */

interface IDEBridge {
  send: (message: { type: string; [key: string]: unknown }) => void;
  on: (type: string, handler: (message: unknown) => void) => void;
  off: (type: string) => void;
}

/**
 * IDE Bridge を初期化
 */
export function initIDEBridge(): IDEBridge {
  const messageHandlers = new Map<string, (message: unknown) => void>();

  // VSCode Webview API が利用可能な場合
  const vscode = (window as unknown as { __VSCODE__?: { postMessage: (message: unknown) => void } }).__VSCODE__;

  // Extension Hostからのメッセージを受信
  window.addEventListener('message', (event) => {
    const message = event.data;
    if (message && message.type) {
      const handler = messageHandlers.get(message.type);
      if (handler) {
        handler(message);
      }
    }
  });

  return {
    send: (message) => {
      if (vscode) {
        vscode.postMessage(message);
      } else {
        console.warn('[IDE Bridge] VSCode API not available, message not sent:', message);
      }
    },
    on: (type, handler) => {
      messageHandlers.set(type, handler);
      console.log(`[IDE Bridge] Registered handler for: ${type}`);
    },
    off: (type) => {
      messageHandlers.delete(type);
    },
  };
}

