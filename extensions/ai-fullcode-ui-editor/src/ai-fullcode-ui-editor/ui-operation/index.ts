/**
 * UI Operation Layer
 * 
 * Phase 3: UI操作連携
 * UI操作 → TSX生成 → TextModel更新
 * 
 * Phase 5: 非エンジニアUX
 * 提案システム、AI補完、エラー防止
 */

import { registerUIOperationCommands } from './commands';

/**
 * UI Operation統合を初期化
 * 
 * UI操作ハンドラーとコマンドを登録します。
 * 
 * @param context VSCode拡張機能コンテキスト
 */
export function initUIOperation(context: any): void {
  console.log('[UI Operation] 初期化開始...');
  
  // UI操作コマンドを登録
  registerUIOperationCommands(context);
  
  console.log('[UI Operation] 初期化完了');
}

// Phase 3: UI操作連携
export { handleUIOperation } from './operationHandler';
export { executeUIOperation } from './uiStructureBridge';
export { registerUIOperationCommands, getRegisteredCommands } from './commands';

// Phase 5: 非エンジニアUX
export { suggestForComplexSyntax, getSuggestionForNode } from './suggestionSystem';
export { generateAIPromptForComplexSyntax, generateAIPromptForNode } from './aiPromptGenerator';
export { validateUIOperation, validateBeforeOperation } from './errorPrevention';

