/**
 * AI Fullcode UI Editor - Electron版エントリーポイント
 *
 * Phase 1: VSCode OSS起動（Electron版）
 *
 * 注意: これはオプション実装です。
 * 主にWeb版を使用し、Electron版が必要な場合のみ実装します。
 */

import { initAIFullcodeUIEditor } from './main';

/**
 * Electron起動時の統合レイヤー初期化
 *
 * Web版と同じ初期化ロジックを使用します。
 */
export async function initElectron(context?: any): Promise<void> {
  console.log('[AI Fullcode UI Editor] Electron版初期化開始...');

  try {
    // Web版と同じ初期化処理を使用（contextが提供されない場合はnullを渡す）
    await initAIFullcodeUIEditor(context || null);

    console.log('[AI Fullcode UI Editor] Electron版初期化完了');
  } catch (error) {
    console.error('[AI Fullcode UI Editor] Electron版初期化エラー:', error);
    throw error;
  }
}

// Electron版エントリーポイント
if (require.main === module) {
  initElectron().catch((error) => {
    console.error('[AI Fullcode UI Editor] Electron版起動エラー:', error);
    process.exit(1);
  });
}

