/**
 * Apply Move（slot.kind 別の apply）
 *
 * action.slot.kind で apply を分岐
 */

/// <reference lib="dom" />

import { MoveElementAction } from '../types';
import { debugLog } from '../types';
import { applyGrid } from './applyGrid';
import { applyFlex } from './applyFlex';
import { applyAbsolute } from './applyAbsolute';
import { LayoutTreeService } from './types';

/**
 * MOVE_ELEMENT を適用
 *
 * @param action MoveElementAction
 * @param layoutTreeService LayoutTreeService
 * @returns 成功したかどうか
 */
export function applyMove(
  action: MoveElementAction,
  layoutTreeService: LayoutTreeService
): boolean {
  debugLog('APPLY', 'start', {
    elementId: action.elementId,
    kind: action.slot.kind,
    containerId: action.slot.containerId,
  });

  if (!action.slot) {
    console.error('[ApplyMove] ❌ slot is required');
    return false;
  }

  // slot.kind で分岐
  switch (action.slot.kind) {
    case 'grid':
      return applyGrid(action, layoutTreeService);
    case 'flex':
      return applyFlex(action, layoutTreeService);
    case 'abs':
      return applyAbsolute(action, layoutTreeService);
    default:
      console.error('[ApplyMove] ❌ unknown slot kind:', action.slot.kind);
      return false;
  }
}

