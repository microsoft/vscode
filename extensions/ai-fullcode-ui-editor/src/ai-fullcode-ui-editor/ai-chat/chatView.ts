/**
 * VSCode Chat UI統合（見た目だけ）
 * 
 * Phase 6: AIチャット統合
 * VSCode Chat View（UIコンポーネント）を表示
 * 
 * 重要: VSCode OSSの内蔵AI（Copilot API）には依存しない。
 * UIだけ使い、中身は既存のMCP（/api/mcp）に流す。
 */

// TODO: 実際のVSCode OSS統合時に、以下のようにインポートします:
// import { window } from 'vscode';
import { handleChatMessage } from './mcpBridge';

/**
 * Chat Viewを初期化
 * 
 * VSCode Chat View（UIのみ）を使用します。
 * 見た目だけ借りる、中身は既存のMCPに流します。
 */
export function initChatViewComponent(): void {
  // TODO: 実際のVSCode OSS統合時に実装
  // const chatView = window.createWebviewPanel(
  //   'ai-fullcode-ui-editor-chat',
  //   'AI Chat',
  //   { viewColumn: 2, preserveFocus: true }
  // );
  // 
  // // 既存のVSCodeChatコンポーネントをWebviewに表示
  // chatView.webview.html = getChatViewHtml();
  // 
  // // メッセージハンドラー（既存のMCPに流す）
  // chatView.webview.onDidReceiveMessage(async (message) => {
  //   if (message.type === 'ai-chat-send') {
  //     const result = await handleChatMessage(message.content);
  //     // 結果をWebviewに送信
  //     chatView.webview.postMessage({
  //       type: 'ai-chat-response',
  //       result
  //     });
  //   }
  // });
}

/**
 * Chat View HTMLを生成
 * 
 * 既存のVSCodeChatコンポーネントをWebviewに表示するためのHTMLを生成します。
 */
function getChatViewHtml(): string {
  // TODO: 実際のVSCode OSS統合時に実装
  // 既存のapps/web/app/editor/components/VSCodeChat.tsxをWebviewに表示
  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>
          body {
            margin: 0;
            padding: 0;
            font-family: var(--vscode-font-family);
          }
        </style>
      </head>
      <body>
        <div id="chat-container"></div>
        <script>
          // VSCode Webview API
          const vscode = acquireVsCodeApi();
          
          // メッセージ送信
          function sendMessage(content) {
            vscode.postMessage({
              type: 'ai-chat-send',
              content
            });
          }
          
          // メッセージ受信
          window.addEventListener('message', (event) => {
            const message = event.data;
            if (message.type === 'ai-chat-response') {
              // チャットUIに結果を表示
              displayResponse(message.result);
            }
          });
        </script>
      </body>
    </html>
  `;
}

