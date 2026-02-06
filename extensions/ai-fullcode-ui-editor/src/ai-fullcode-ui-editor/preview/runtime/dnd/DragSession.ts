/**
 * DragSession
 * ✅ Cursor 2.x準拠: ドラッグセッションの型定義
 *
 * 原則:
 * - 不変オブジェクト
 * - ドラッグ中の状態を保持
 */

import { LayoutNode } from '../tree/LayoutNode';

/**
 * Slot: ドロップ位置
 * ✅ Cursor 2.x準拠: 挿入中心の表現
 * ✅ STEP 4: レイアウト非依存ロジックに昇格
 */
export interface Slot {
  /** スロットの種類 */
  kind: 'before' | 'after' | 'inside' | 'empty' | 'between' | 'outside' | 'flex-row' | 'flex-column' | 'grid' | 'absolute' | 'map'; // ✅ STEP 3: before/after/emptyを追加、後方互換性のため既存のkindも保持
  /** 軸方向（row/column/grid） */
  axis?: 'row' | 'column' | 'grid';
  /** コンテナの要素ID */
  containerId: string;
  /** 実際に挿入するDOM親の要素ID - ✅ ROW_LAYOUT_FIX: 解析に使うコンテナと実際に挿入するDOM親を分離 */
  insertionParentId?: string;
  /** 挿入位置（インデックス） - ✅ CRITICAL FIX: absolute/map レイアウトでは undefined を許可 */
  insertion?: number;
  /** 挿入位置（インデックス） - 新しい名前（insertionと併用） - ✅ CRITICAL FIX: absolute/map レイアウトでは undefined を許可 */
  insertionIndex?: number;
  /** ガイド表示用の矩形（viewport座標） */
  renderGuideRect: DOMRect | null;
  /** ガイドスタイル（line/outline/dashed） */
  guideStyle?: 'line' | 'outline' | 'dashed'; // ✅ STEP 3: dashedを追加（empty用）
  /** 信頼度（0-1） - ✅ FIX 1: 必須化（confidence + priority で最終選択） */
  confidence: number;
  /** ✅ フェーズ6: fallback slotかどうか（nearest gap fallbackなど、質の違うslotを区別） */
  isFallback?: boolean;
  /** 近傍要素ID（before/after/between時） */
  targetElementId?: string;
  /** Grid用: 行インデックス */
  targetRowIndex?: number;
  /** Grid用: 列インデックス */
  targetColumnIndex?: number;
  /** デバッグ情報 */
  debug?: Record<string, any>;
}

/**
 * DragSession: ドラッグセッション
 */
export interface DragSession {
  /** ドラッグ中の要素ID */
  draggedElementId: string;
  /** ドラッグ中の要素のノード */
  draggedNode: LayoutNode;
  /** 開始位置（X座標） */
  startX: number;
  /** 開始位置（Y座標） */
  startY: number;
  /** 現在位置（X座標） */
  currentX: number;
  /** 現在位置（Y座標） */
  currentY: number;
  /** 現在のスロット（null を許容しない） */
  slot: Slot | null;
  /** タイムスタンプ */
  timestamp: number;
}

/**
 * ドラッグセッションを作成
 */
export function createDragSession(
  draggedElementId: string,
  draggedNode: LayoutNode,
  startX: number,
  startY: number
): DragSession {
  return {
    draggedElementId,
    draggedNode,
    startX,
    startY,
    currentX: startX,
    currentY: startY,
    slot: null,
    timestamp: Date.now(),
  };
}
