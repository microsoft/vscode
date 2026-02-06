/// <reference lib="dom" />

/**
 * Drag & Drop の型定義（Slot駆動設計）
 *
 * 重要原則:
 * - undefined を一切許可しない（strict前提）
 * - slot は必須（MOVE_ELEMENT action に含める）
 * - grid/flex/abs の分岐は slot.kind で行う
 */

/**
 * Rect（座標系）
 */
export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

/**
 * Slot の種類
 */
export type SlotKind = 'grid' | 'flex' | 'abs';

/**
 * Slot（統一的な drop 位置表現）
 *
 * Grid/Flex/Absolute を統一的に扱うための First-Class オブジェクト
 */
export interface Slot {
  /** Slot の種類（grid/flex/abs） */
  kind: SlotKind;

  /** コンテナの elementId */
  containerId: string;

  /** ガイド描画用の Rect（必須、fallback 禁止） */
  renderGuideRect: Rect;

  /** Grid の場合: ターゲット行インデックス（1-based） */
  targetRow?: number;

  /** Grid の場合: ターゲット列インデックス（1-based） */
  targetCol?: number;

  /** Flex の場合: 挿入インデックス（0-based） */
  insertIndex?: number;

  /** Absolute の場合: X座標 */
  x?: number;

  /** Absolute の場合: Y座標 */
  y?: number;
}

/**
 * MOVE_ELEMENT UIActionAST（Slot駆動版）
 */
export interface MoveElementAction {
  operationId: string;
  elementId: string;
  type: 'MOVE_ELEMENT';
  timestamp: number;

  /** 移動元情報 */
  fromParentId: string;
  fromIndex: number;

  /** 移動先情報 */
  toParentId: string;

  /** Flex のみで使用（Grid は禁止） */
  toIndex?: number;

  /** Slot（必須） */
  slot: Slot;

  /** 後方互換性のため保持（非推奨、slot を使用すること） */
  targetRowIndex?: number | null;
  targetColumnIndex?: number | null;
}

/**
 * デバッグログスイッチ
 */
export const DEBUG_DND = (() => {
  try {
    const win = (globalThis as any).window;
    return win && (win.DEBUG_DND === 'true' || win.DEBUG_DND === true);
  } catch {
    return false;
  }
})();

/**
 * デバッグログ出力
 */
export function debugLog(tag: string, ...args: any[]): void {
  if (DEBUG_DND) {
    console.log(`[DND:${tag}]`, ...args);
  }
}

