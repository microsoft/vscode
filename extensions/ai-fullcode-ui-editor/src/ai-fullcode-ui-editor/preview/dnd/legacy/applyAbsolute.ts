/// <reference lib="dom" />

/**
 * Apply Absolute（transform/left/top 等）
 *
 * Absolute の Apply は transform または left/top を更新
 */

import { MoveElementAction } from '../types';
import { debugLog } from '../types';
import { LayoutTreeService } from './types';

/**
 * Absolute の MOVE_ELEMENT を適用
 *
 * @param action MoveElementAction
 * @param layoutTreeService LayoutTreeService
 * @returns 成功したかどうか
 */
export function applyAbsolute(
  action: MoveElementAction,
  layoutTreeService: LayoutTreeService
): boolean {
  const { elementId, slot } = action;

  if (slot.kind !== 'abs') {
    console.error('[ApplyAbsolute] ❌ slot.kind must be "abs"');
    return false;
  }

  // ✅ Phase 4: 厳格な型判定（undefined根絶）
  if (typeof slot.x !== 'number' || typeof slot.y !== 'number') {
    console.error('[ApplyAbsolute] ❌ slot.x and slot.y must be numbers', {
      x: slot.x,
      y: slot.y,
      xType: typeof slot.x,
      yType: typeof slot.y,
    });
    return false;
  }

  const draggedElement = layoutTreeService.getDomElement(elementId);
  if (!draggedElement) {
    console.error('[ApplyAbsolute] ❌ dragged element not found:', elementId);
    return false;
  }

  // transform を使用（推奨）
  const win = (globalThis as any).window;
  const style = win?.getComputedStyle?.(draggedElement) || (draggedElement as any).ownerDocument?.defaultView?.getComputedStyle?.(draggedElement);
  const position = style?.position || 'static';

  const elementStyle = (draggedElement as any).style;
  if (!elementStyle) {
    console.error('[ApplyAbsolute] ❌ element.style not available');
    return false;
  }

  if (position === 'absolute' || position === 'fixed' || position === 'relative') {
    // left/top を更新
    elementStyle.left = `${slot.x}px`;
    elementStyle.top = `${slot.y}px`;
  } else {
    // transform を使用
    elementStyle.transform = `translate(${slot.x}px, ${slot.y}px)`;
  }

  // Layout Tree を更新
  layoutTreeService.updateTree();

  debugLog('APPLY', 'absolute applied', {
    elementId,
    x: slot.x,
    y: slot.y,
  });

  return true;
}

