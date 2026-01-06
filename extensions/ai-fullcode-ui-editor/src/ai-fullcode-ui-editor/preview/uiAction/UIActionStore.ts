/**
 * UIActionStore.ts
 *
 * UI操作ASTを蓄積・取得するストアを実装する。
 *
 * 要件:
 * - add(action)
 * - getAll()
 * - clear()
 * - React非依存（純TS）
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 * （VSCode Webview内でTypeScriptファイルを直接実行することはできないため）
 *
 * TypeScriptコンパイルエラーは無視して構いません。
 */

import type { UIActionAST } from './UIActionAST';

/**
 * UI操作ASTストア
 *
 * UI操作の履歴を順序付きで蓄積する。
 */
export class UIActionStore {
  private actions: UIActionAST[] = [];
  private maxSize: number = 1000; // 最大保持数（メモリ保護）

  /**
   * UI操作ASTを追加する
   */
  add(action: UIActionAST): void {
    this.actions.push(action);

    // 最大保持数を超えた場合は古いものを削除
    if (this.actions.length > this.maxSize) {
      this.actions.shift();
    }
  }

  /**
   * すべてのUI操作ASTを取得する
   */
  getAll(): UIActionAST[] {
    return [...this.actions]; // コピーを返す
  }

  /**
   * ストアをクリアする
   */
  clear(): void {
    this.actions = [];
  }

  /**
   * ストアのサイズを取得する
   */
  size(): number {
    return this.actions.length;
  }

  /**
   * 最新のN件を取得する
   */
  getRecent(count: number): UIActionAST[] {
    return this.actions.slice(-count);
  }

  /**
   * 最大保持数を設定する
   */
  setMaxSize(size: number): void {
    this.maxSize = size;
    // 現在のサイズが最大値を超えている場合は削除
    if (this.actions.length > this.maxSize) {
      this.actions = this.actions.slice(-this.maxSize);
    }
  }
}

/**
 * グローバルストアインスタンス（シングルトン）
 */
let globalStore: UIActionStore | null = null;

/**
 * グローバルストアを取得する
 */
export function getUIActionStore(): UIActionStore {
  if (!globalStore) {
    globalStore = new UIActionStore();
  }
  return globalStore;
}

/**
 * グローバルストアをリセットする（テスト用）
 */
export function resetUIActionStore(): void {
  globalStore = null;
}

