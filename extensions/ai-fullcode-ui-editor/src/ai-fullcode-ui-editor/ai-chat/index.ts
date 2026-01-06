/**
 * AI Chat統合
 * 
 * Phase 6: AIチャット統合
 * VSCode Chat View（UIのみ）を使用、中身は既存MCPに流す
 * 
 * 重要: VSCode OSSの内蔵AI（Copilot API）には依存しない。
 * UIだけ使い、中身は既存のMCP（/api/mcp）に流す。
 */

import { initChatViewComponent } from './chatView';

/**
 * AI Chat統合を初期化
 * 
 * VSCode Chat View（UIのみ）を初期化し、既存のMCPに接続します。
 */
export function initChatView(): void {
  // eslint-disable-next-line no-console
  console.log('[AI Chat] 初期化開始...');
  
  // Chat Viewを初期化
  initChatViewComponent();
  
  // eslint-disable-next-line no-console
  console.log('[AI Chat] 初期化完了');
}

// 各モジュールをエクスポート
export { initChatViewComponent } from './chatView';
export { handleChatMessage, callMCPAPI } from './mcpBridge';
export { applyAIGeneratedOperations, applyAIOperationPlan } from './codeApplier';

