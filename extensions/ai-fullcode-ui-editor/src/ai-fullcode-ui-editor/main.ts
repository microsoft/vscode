/**
 * AI Fullcode UI Editor - メインエントリーポイント
 *
 * VSCode OSS統合版の初期化処理
 * Phase 1: VSCode OSS起動
 *
 * 注意: 実際のVSCode OSS統合時には、以下のパッケージを使用します:
 * - VSCode OSSの実際のforkリポジトリ
 * - または、VSCode OSSのWeb版実装
 */

// TODO: VSCode Web版のインポート（実際のVSCode OSS統合時に実装）
// 実際のVSCode OSSでは、以下のような形でインポートします:
// import { main } from 'vscode-web';
// または、VSCode OSSの実際のエントリーポイントからインポート

// 統合レイヤーのインポート
import { initASTBridge } from './ast-bridge';
import { initUIOperation } from './ui-operation';
import { initPreview } from './preview';
import { initChatView } from './ai-chat';
import { initStorage } from './storage';

/**
 * VSCode OSS起動と統合レイヤー初期化
 *
 * Phase 1: VSCode OSS起動
 * - VSCode Web版を起動
 * - 統合レイヤーを初期化（Phase 2以降で実装される機能はプレースホルダー）
 *
 * @param context VSCode拡張機能コンテキスト
 */
export async function initAIFullcodeUIEditor(context: any): Promise<void> {
  try {
    // Phase 2: AST Bridge初期化
    initASTBridge();

    // Phase 3: UI Operation初期化（contextを渡す）
    initUIOperation(context);

    // Phase 4: Preview初期化（contextを渡す）
    initPreview(context);

    // Phase 6: AI Chat初期化
    initChatView();

    // Phase 2: Storage初期化（contextを渡す）
    initStorage(context, 'default'); // TODO: プロジェクトIDを動的に取得
  } catch (error) {
    console.error('[Main] ❌ Initialization error:', error);
    throw error;
  }
}

