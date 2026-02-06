/**
 * SelectionState
 * ✅ Cursor 2.x準拠: 選択状態の型定義
 *
 * 原則:
 * - 不変オブジェクト
 * - selectedElementId は null を許容しない（選択されていない場合は空文字列）
 */

/**
 * SelectionState: 選択状態
 */
export interface SelectionState {
  /** 選択された要素ID（選択されていない場合は空文字列） */
  selectedElementId: string;
  /** 選択された要素の境界情報 */
  bounds: DOMRect | null;
  /** タイムスタンプ */
  timestamp: number;
}

/**
 * 空の選択状態を作成
 */
export function createEmptySelectionState(): SelectionState {
  return {
    selectedElementId: '',
    bounds: null,
    timestamp: Date.now(),
  };
}

/**
 * 選択状態を作成
 */
export function createSelectionState(
  elementId: string,
  bounds: DOMRect | null
): SelectionState {
  return {
    selectedElementId: elementId || '',
    bounds: bounds,
    timestamp: Date.now(),
  };
}
