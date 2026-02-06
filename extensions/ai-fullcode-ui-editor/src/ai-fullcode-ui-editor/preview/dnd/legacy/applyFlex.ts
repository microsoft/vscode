/// <reference lib="dom" />

/**
 * Apply Flex（insertIndex で DOM 並び替え）
 *
 * Flex の Apply は DOM reorder（insertBefore / appendChild）
 */

import { MoveElementAction } from '../types';
import { debugLog } from '../types';
import { LayoutTreeService } from './types';

/**
 * Flex の MOVE_ELEMENT を適用
 *
 * @param action MoveElementAction
 * @param layoutTreeService LayoutTreeService
 * @returns 成功したかどうか
 */
export function applyFlex(
  action: MoveElementAction,
  layoutTreeService: LayoutTreeService
): boolean {
  const { elementId, slot, toParentId } = action;

  if (slot.kind !== 'flex') {
    console.error('[ApplyFlex] ❌ slot.kind must be "flex"');
    return false;
  }

  // ✅ Phase 4: 厳格な型判定（undefined根絶）
  if (typeof slot.insertIndex !== 'number') {
    console.error('[ApplyFlex] ❌ slot.insertIndex must be a number', {
      insertIndex: slot.insertIndex,
      insertIndexType: typeof slot.insertIndex,
    });
    return false;
  }

  const draggedElement = layoutTreeService.getDomElement(elementId);
  if (!draggedElement) {
    console.error('[ApplyFlex] ❌ dragged element not found:', elementId);
    return false;
  }

  const toParent = layoutTreeService.getDomElement(toParentId);
  if (!toParent) {
    console.error('[ApplyFlex] ❌ to parent not found:', toParentId);
    return false;
  }

  // ドラッグ中の要素を一旦削除
  const parentNode = (draggedElement as any).parentNode;
  if (parentNode) {
    parentNode.removeChild(draggedElement);
  }

  // 挿入位置を決定
  const toParentNode = layoutTreeService.getNode(toParentId);
  if (!toParentNode) {
    console.error('[ApplyFlex] ❌ to parent node not found:', toParentId);
    return false;
  }

  const children = toParentNode.children || [];
  const filteredChildren = children.filter((childId: string) => childId !== elementId);

  if (slot.insertIndex >= filteredChildren.length) {
    // 最後に追加
    (toParent as any).appendChild(draggedElement);
  } else {
    // insertIndex の位置に挿入
    const referenceElementId = filteredChildren[slot.insertIndex];
    const referenceElement = layoutTreeService.getDomElement(referenceElementId);
    if (referenceElement) {
      (toParent as any).insertBefore(draggedElement, referenceElement);
    } else {
      (toParent as any).appendChild(draggedElement);
    }
  }

  // Layout Tree を更新
  layoutTreeService.updateTree();

  debugLog('APPLY', 'flex applied', {
    elementId,
    toParentId,
    insertIndex: slot.insertIndex,
  });

  return true;
}

