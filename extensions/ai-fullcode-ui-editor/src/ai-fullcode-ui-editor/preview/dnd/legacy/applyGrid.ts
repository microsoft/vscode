/// <reference lib="dom" />

/**
 * Apply Grid（gridRowStart/gridColumnStart 更新のみ）
 *
 * Grid の Apply は DOM reorder 禁止
 * gridRowStart / gridColumnStart のみを更新
 */

import { MoveElementAction } from '../types';
import { debugLog } from '../types';
import { LayoutTreeService } from './types';

/**
 * Grid の MOVE_ELEMENT を適用
 *
 * @param action MoveElementAction
 * @param layoutTreeService LayoutTreeService
 * @returns 成功したかどうか
 */
export function applyGrid(
  action: MoveElementAction,
  layoutTreeService: LayoutTreeService
): boolean {
  const { elementId, slot } = action;

  if (slot.kind !== 'grid') {
    console.error('[ApplyGrid] ❌ slot.kind must be "grid"');
    return false;
  }

  // ✅ Phase 4: 厳格な型判定（undefined根絶）
  if (typeof slot.targetRow !== 'number' || typeof slot.targetCol !== 'number') {
    console.error('[ApplyGrid] ❌ slot.targetRow and slot.targetCol must be numbers', {
      targetRow: slot.targetRow,
      targetCol: slot.targetCol,
      targetRowType: typeof slot.targetRow,
      targetColType: typeof slot.targetCol,
    });
    return false;
  }

  const draggedElement = layoutTreeService.getDomElement(elementId);
  if (!draggedElement) {
    console.error('[ApplyGrid] ❌ dragged element not found:', elementId);
    return false;
  }

  // 既存の span を維持
  const elementStyle = (draggedElement as any).style;
  if (!elementStyle) {
    console.error('[ApplyGrid] ❌ element.style not available');
    return false;
  }

  const currentGridRowStart = elementStyle.gridRowStart || '';
  const currentGridColumnStart = elementStyle.gridColumnStart || '';
  const currentGridRowEnd = elementStyle.gridRowEnd || '';
  const currentGridColumnEnd = elementStyle.gridColumnEnd || '';

  // gridRowStart / gridColumnStart のみを更新
  const rowStr = String(slot.targetRow);
  const colStr = String(slot.targetCol);

  elementStyle.gridRowStart = rowStr;
  elementStyle.gridColumnStart = colStr;

  // span を維持（gridRowEnd / gridColumnEnd が設定されている場合）
  if (currentGridRowEnd && currentGridRowEnd !== '') {
    const currentRowStart = parseInt(currentGridRowStart) || slot.targetRow;
    const currentRowSpan = parseInt(currentGridRowEnd) - currentRowStart;
    if (currentRowSpan > 1) {
      elementStyle.gridRowEnd = String(slot.targetRow + currentRowSpan);
    }
  }

  if (currentGridColumnEnd && currentGridColumnEnd !== '') {
    const currentColumnStart = parseInt(currentGridColumnStart) || slot.targetCol;
    const currentColumnSpan = parseInt(currentGridColumnEnd) - currentColumnStart;
    if (currentColumnSpan > 1) {
      elementStyle.gridColumnEnd = String(slot.targetCol + currentColumnSpan);
    }
  }

  // Layout Tree を更新
  layoutTreeService.updateTree();

  debugLog('APPLY', 'grid applied', {
    elementId,
    targetRow: slot.targetRow,
    targetCol: slot.targetCol,
    preservedRowSpan: currentGridRowEnd ? (parseInt(currentGridRowEnd) - (parseInt(currentGridRowStart) || slot.targetRow)) : null,
    preservedColumnSpan: currentGridColumnEnd ? (parseInt(currentGridColumnEnd) - (parseInt(currentGridColumnStart) || slot.targetCol)) : null,
  });

  return true;
}

