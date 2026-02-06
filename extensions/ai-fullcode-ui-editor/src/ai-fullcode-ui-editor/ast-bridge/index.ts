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
  // TextModel → astManager ブリッジを初期化
  initTextModelToAstBridge();
}

// syncManagerをエクスポート（他のモジュールから使用可能にする）
export { syncManager } from './syncManager';
export { updateTextModelFromAST } from './astToTextModel';
export { updateAstFromTextModel } from './textModelToAst';

