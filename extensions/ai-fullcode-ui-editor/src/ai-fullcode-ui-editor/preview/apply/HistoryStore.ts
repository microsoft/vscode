/**
 * HistoryStore.ts
 *
 * 変更履歴を管理するストア。
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 */

import type { ApplyResult } from './ApplyChangePlanService';

/**
 * 履歴エントリ
 */
export interface HistoryEntry {
  /**
   * 一意なID
   */
  id: string;

  /**
   * 適用されたChangePlanのID
   */
  planId: string;

  /**
   * ファイルパス
   */
  filePath: string;

  /**
   * 適用前の内容
   */
  beforeContent: string;

  /**
   * 適用後の内容
   */
  afterContent: string;

  /**
   * 適用日時
   */
  timestamp: number;

  /**
   * 元に戻されたかどうか
   */
  reverted: boolean;
}

/**
 * HistoryStore
 *
 * 変更履歴を管理するストア。
 */
export class HistoryStore {
  private entries: HistoryEntry[] = [];
  private maxSize: number = 100; // 最大保持数

  /**
   * 履歴エントリを追加
   */
  push(entry: HistoryEntry): void {
    this.entries.push(entry);

    // 最大保持数を超えた場合は古いものを削除
    if (this.entries.length > this.maxSize) {
      this.entries.shift();
    }
  }

  /**
   * 最新の履歴エントリを取得
   */
  getLatest(): HistoryEntry | null {
    return this.entries.length > 0 ? this.entries[this.entries.length - 1] : null;
  }

  /**
   * すべての履歴エントリを取得
   */
  getAll(): HistoryEntry[] {
    return [...this.entries]; // コピーを返す
  }

  /**
   * IDで履歴エントリを取得
   */
  getById(id: string): HistoryEntry | null {
    return this.entries.find(e => e.id === id) || null;
  }

  /**
   * ファイルパスで履歴エントリを取得
   */
  getByFilePath(filePath: string): HistoryEntry[] {
    return this.entries.filter(e => e.filePath === filePath && !e.reverted);
  }

  /**
   * Undo（最新の履歴を元に戻す）
   */
  undo(): HistoryEntry | null {
    // 元に戻されていない最新の履歴を探す
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (!this.entries[i].reverted) {
        this.entries[i].reverted = true;
        return this.entries[i];
      }
    }
    return null;
  }

  /**
   * 特定の履歴エントリを元に戻す
   */
  revert(entryId: string): HistoryEntry | null {
    const entry = this.getById(entryId);
    if (entry && !entry.reverted) {
      entry.reverted = true;
      return entry;
    }
    return null;
  }

  /**
   * 履歴をクリア
   */
  clear(): void {
    this.entries = [];
  }

  /**
   * 履歴のサイズ
   */
  size(): number {
    return this.entries.length;
  }
}

