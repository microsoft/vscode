/**
 * 同期マネージャー
 *
 * Phase 2: エディタ統合
 * TextModel ↔ astManager 双方向同期の制御（無限ループ防止）
 *
 * 重要: 差分ではなく「全文」を真実として扱うため、
 * 無限ループを防ぐフラグ制御が必要です。
 */

import { updateAstFromTextModel } from './textModelToAst';
import { updateTextModelFromAST } from './astToTextModel';

/**
 * 同期マネージャークラス
 *
 * 双方向同期の無限ループを防ぐためのフラグ制御を行います。
 */
export class SyncManager {
  private isUpdatingFromTextModel = false;
  private isUpdatingFromAST = false;

  /**
   * TextModel変更 → astManager更新
   *
   * @param filePath ファイルパス
   * @param code コード内容
   */
  async syncFromTextModel(filePath: string, code: string): Promise<void> {
    // 既にASTから更新中の場合はスキップ（無限ループ防止）
    if (this.isUpdatingFromAST) {
      return;
    }

    this.isUpdatingFromTextModel = true;
    try {
      await updateAstFromTextModel(filePath, code);
    } finally {
      this.isUpdatingFromTextModel = false;
    }
  }

  /**
   * astManager更新 → TextModel更新
   *
   * @param filePath ファイルパス
   * @param code コード内容
   */
  async syncFromAST(filePath: string, code: string): Promise<void> {
    // 既にTextModelから更新中の場合はスキップ（無限ループ防止）
    if (this.isUpdatingFromTextModel) {
      // eslint-disable-next-line no-console
      console.log('[SyncManager] TextModel更新中のため、AST更新をスキップ');
      return;
    }

    this.isUpdatingFromAST = true;
    try {
      await updateTextModelFromAST(filePath, code);
    } finally {
      this.isUpdatingFromAST = false;
    }
  }

  /**
   * 現在の同期状態を取得
   */
  getSyncState(): {
    isUpdatingFromTextModel: boolean;
    isUpdatingFromAST: boolean;
  } {
    return {
      isUpdatingFromTextModel: this.isUpdatingFromTextModel,
      isUpdatingFromAST: this.isUpdatingFromAST,
    };
  }
}

// シングルトンインスタンスをエクスポート
export const syncManager = new SyncManager();

