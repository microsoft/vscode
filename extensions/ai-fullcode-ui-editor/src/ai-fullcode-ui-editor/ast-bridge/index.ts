/**
 * AST Manager Bridge
 * 
 * Phase 2: エディタ統合
 * TextModel ↔ astManager 双方向同期
 */

import { initTextModelToAstBridge } from './textModelToAst';
import { syncManager } from './syncManager';

/**
 * AST Bridge初期化
 * 
 * TextModel ↔ astManager 双方向同期を設定します。
 */
export function initASTBridge(): void {
  // eslint-disable-next-line no-console
  console.log('[AST Bridge] 初期化開始...');
  
  // TextModel → astManager ブリッジを初期化
  initTextModelToAstBridge();
  
  // eslint-disable-next-line no-console
  console.log('[AST Bridge] 初期化完了');
}

// syncManagerをエクスポート（他のモジュールから使用可能にする）
export { syncManager } from './syncManager';
export { updateTextModelFromAST } from './astToTextModel';
export { updateAstFromTextModel } from './textModelToAst';

