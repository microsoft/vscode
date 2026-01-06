/**
 * Extension エントリーポイント
 *
 * VSCode OSS Web版起動時に呼び出される
 *
 * 注意: このファイルは VSCode OSS の extensions/ai-fullcode-ui-editor/src/extension.ts に配置します
 */

import * as vscode from 'vscode';
import { initAIFullcodeUIEditor } from './ai-fullcode-ui-editor/main';

/**
 * Extension アクティベート
 *
 * VSCode OSS Web版起動時に呼び出される
 */
export function activate(context: vscode.ExtensionContext): void {
  try {
    // 統合レイヤーを初期化（contextを渡す）
    initAIFullcodeUIEditor(context);
  } catch (error) {
    console.error('[Extension] ❌ Initialization error:', error);
  }
}

/**
 * Extension デアクティベート
 */
export async function deactivate(): Promise<void> {
  // クリーンアップ処理（必要に応じて実装）
  console.log('[Extension] Deactivated');
}

