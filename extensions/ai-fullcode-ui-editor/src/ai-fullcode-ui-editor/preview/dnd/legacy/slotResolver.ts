/// <reference lib="dom" />

/**
 * Slot Resolver（統一的な slot 解決）
 *
 * resolveSlot() の統一入口
 * Grid/Flex/Absolute を統一的に扱う
 */

import { Slot } from './types';
import { debugLog } from './types';
import { detectLayoutType, LayoutType } from '../layout/layoutIntrospection';
import { computeGridMetrics, GridMetrics } from '../grid/gridMetrics';
import { hitTestGrid, GridHitTestResult } from '../grid/gridHitTest';

/**
 * LayoutTreeService のインターフェース（簡易版）
 */
export interface LayoutTreeService {
  getNode(elementId: string): any | null;
  getDomElement(elementId: string): HTMLElement | null;
  updateTree(): void;
}

/**
 * SlotResolver
 */
export class SlotResolver {
  constructor(private layoutTreeService: LayoutTreeService) {}

  /**
   * Slot を解決（統一入口）
   *
   * @param mouseX マウス X 座標（viewport 基準）
   * @param mouseY マウス Y 座標（viewport 基準）
   * @param draggedElementId ドラッグ中の要素 ID
   * @returns Slot または null
   */
  resolveSlot(
    mouseX: number,
    mouseY: number,
    draggedElementId: string
  ): Slot | null {
    debugLog('RESOLVE_SLOT', 'input', { mouseX, mouseY, draggedElementId });

    // Layout Tree を更新
    this.layoutTreeService.updateTree();

    // マウス位置から最適なコンテナを探す
    const container = this.findContainer(mouseX, mouseY, draggedElementId);
    if (!container) {
      debugLog('RESOLVE_SLOT', 'no container found');
      return null;
    }

    const layoutType = detectLayoutType(container);
    debugLog('RESOLVE_SLOT', 'container found', {
      containerId: (container as any).id || 'unknown',
      layoutType,
    });

    // Layout タイプ別に slot を解決
    switch (layoutType) {
      case 'grid':
        return this.resolveGridSlot(mouseX, mouseY, container, draggedElementId);
      case 'flex-row':
      case 'flex-column':
        return this.resolveFlexSlot(mouseX, mouseY, container, layoutType, draggedElementId);
      case 'absolute':
        return this.resolveAbsoluteSlot(mouseX, mouseY, container);
      default:
        return null;
    }
  }

  /**
   * コンテナを探す
   */
  private findContainer(
    mouseX: number,
    mouseY: number,
    draggedElementId: string
  ): HTMLElement | null {
    // マウス位置の要素を取得
    const doc = (globalThis as any).document;
    if (!doc) {
      return null;
    }
    const elementAtPoint = doc.elementFromPoint(mouseX, mouseY);
    if (!elementAtPoint) {
      return null;
    }

    // 親要素を辿ってコンテナを探す
    let current: HTMLElement | null = elementAtPoint instanceof (globalThis as any).HTMLElement
      ? elementAtPoint
      : (elementAtPoint as any).parentElement;

    const body = doc?.body;
    while (current && current !== body) {
      const layoutType = detectLayoutType(current);
      if (layoutType === 'grid' || layoutType === 'flex-row' || layoutType === 'flex-column') {
        // ドラッグ中の要素自身は除外
        const elementId = this.getElementId(current);
        if (elementId !== draggedElementId) {
          return current;
        }
      }
      current = (current as any).parentElement;
    }

    return null;
  }

  /**
   * 要素 ID を取得
   */
  private getElementId(element: HTMLElement): string {
    // data-ai-node-id または id を取得
    return (element as any).getAttribute?.('data-ai-node-id') ||
           (element as any).getAttribute?.('data-node-id') ||
           (element as any).id ||
           '';
  }

  /**
   * Grid Slot を解決
   */
  private resolveGridSlot(
    mouseX: number,
    mouseY: number,
    container: HTMLElement,
    draggedElementId: string
  ): Slot | null {
    const metrics = computeGridMetrics(container);
    const hitTestResult = hitTestGrid(mouseX, mouseY, metrics);

    if (!hitTestResult) {
      debugLog('RESOLVE_SLOT', 'grid hit-test failed');
      return null;
    }

    const containerId = this.getElementId(container);
    if (!containerId) {
      debugLog('RESOLVE_SLOT', 'grid container has no ID');
      return null;
    }

    const slot: Slot = {
      kind: 'grid',
      containerId,
      renderGuideRect: hitTestResult.renderGuideRect,
      targetRow: hitTestResult.targetRow,
      targetCol: hitTestResult.targetCol,
    };

    debugLog('RESOLVE_SLOT', 'grid slot decided', {
      containerId,
      targetRow: slot.targetRow,
      targetCol: slot.targetCol,
      renderGuideRect: slot.renderGuideRect,
    });

    return slot;
  }

  /**
   * Flex Slot を解決
   */
  private resolveFlexSlot(
    mouseX: number,
    mouseY: number,
    container: HTMLElement,
    layoutType: 'flex-row' | 'flex-column',
    draggedElementId: string
  ): Slot | null {
    const containerRect = (container as any).getBoundingClientRect();
    const children = Array.from((container as any).children || []) as HTMLElement[];

    // ドラッグ中の要素を除外
    const filteredChildren = children.filter(child => {
      const childId = this.getElementId(child);
      return childId !== draggedElementId;
    });

    if (filteredChildren.length === 0) {
      // 子要素がない場合は最後に挿入
      const containerId = this.getElementId(container);
      if (!containerId) {
        return null;
      }

      const slot: Slot = {
        kind: 'flex',
        containerId,
        renderGuideRect: {
          left: containerRect.left,
          top: containerRect.top,
          width: layoutType === 'flex-row' ? 2 : containerRect.width,
          height: layoutType === 'flex-column' ? 2 : containerRect.height,
          right: containerRect.right,
          bottom: containerRect.bottom,
        },
        insertIndex: 0,
      };

      debugLog('RESOLVE_SLOT', 'flex slot decided (empty)', {
        containerId,
        insertIndex: slot.insertIndex,
      });

      return slot;
    }

    // 子要素間の gap を検出
    for (let i = 0; i < filteredChildren.length - 1; i++) {
      const child1 = filteredChildren[i];
      const child2 = filteredChildren[i + 1];
      const rect1 = child1.getBoundingClientRect();
      const rect2 = child2.getBoundingClientRect();

      let gapRect: { left: number; top: number; width: number; height: number; right: number; bottom: number } | null = null;
      if (layoutType === 'flex-row') {
        // 横方向の gap
        if (rect1.right < rect2.left) {
          const left = rect1.right;
          const top = Math.min(rect1.top, rect2.top);
          const width = rect2.left - rect1.right;
          const height = Math.max(rect1.bottom, rect2.bottom) - Math.min(rect1.top, rect2.top);
          gapRect = {
            left,
            top,
            width,
            height,
            right: left + width,
            bottom: top + height,
          };
        }
      } else {
        // 縦方向の gap
        if (rect1.bottom < rect2.top) {
          const left = Math.min(rect1.left, rect2.left);
          const top = rect1.bottom;
          const width = Math.max(rect1.right, rect2.right) - Math.min(rect1.left, rect2.left);
          const height = rect2.top - rect1.bottom;
          gapRect = {
            left,
            top,
            width,
            height,
            right: left + width,
            bottom: top + height,
          };
        }
      }

      if (gapRect && this.isPointInRect(mouseX, mouseY, gapRect)) {
        const containerId = this.getElementId(container);
        if (!containerId) {
          return null;
        }

        const slot: Slot = {
          kind: 'flex',
          containerId,
          renderGuideRect: {
            left: layoutType === 'flex-row' ? gapRect.left : gapRect.left,
            top: layoutType === 'flex-column' ? gapRect.top : gapRect.top,
            width: layoutType === 'flex-row' ? 2 : gapRect.width,
            height: layoutType === 'flex-column' ? 2 : gapRect.height,
            right: layoutType === 'flex-row' ? gapRect.left + 2 : gapRect.right,
            bottom: layoutType === 'flex-column' ? gapRect.top + 2 : gapRect.bottom,
          },
          insertIndex: i + 1,
        };

        debugLog('RESOLVE_SLOT', 'flex slot decided (gap)', {
          containerId,
          insertIndex: slot.insertIndex,
        });

        return slot;
      }
    }

    // gap にヒットしない場合は最後に挿入
    const containerId = this.getElementId(container);
    if (!containerId) {
      return null;
    }

    const lastChild = filteredChildren[filteredChildren.length - 1];
    const lastRect = lastChild.getBoundingClientRect();

    const slot: Slot = {
      kind: 'flex',
      containerId,
      renderGuideRect: {
        left: layoutType === 'flex-row' ? lastRect.right : containerRect.left,
        top: layoutType === 'flex-column' ? lastRect.bottom : containerRect.top,
        width: layoutType === 'flex-row' ? 2 : containerRect.width,
        height: layoutType === 'flex-column' ? 2 : containerRect.height,
        right: layoutType === 'flex-row' ? lastRect.right + 2 : containerRect.right,
        bottom: layoutType === 'flex-column' ? lastRect.bottom + 2 : containerRect.bottom,
      },
      insertIndex: filteredChildren.length,
    };

    debugLog('RESOLVE_SLOT', 'flex slot decided (end)', {
      containerId,
      insertIndex: slot.insertIndex,
    });

    return slot;
  }

  /**
   * Absolute Slot を解決
   */
  private resolveAbsoluteSlot(
    mouseX: number,
    mouseY: number,
    container: HTMLElement
  ): Slot | null {
    const containerId = this.getElementId(container);
    if (!containerId) {
      return null;
    }

    const containerRect = (container as any).getBoundingClientRect();

    const slot: Slot = {
      kind: 'abs',
      containerId,
      renderGuideRect: {
        left: mouseX - 1,
        top: mouseY - 1,
        width: 2,
        height: 2,
        right: mouseX + 1,
        bottom: mouseY + 1,
      },
      x: mouseX - containerRect.left,
      y: mouseY - containerRect.top,
    };

    debugLog('RESOLVE_SLOT', 'absolute slot decided', {
      containerId,
      x: slot.x,
      y: slot.y,
    });

    return slot;
  }

  /**
   * 点が矩形内にあるか判定
   */
  private isPointInRect(x: number, y: number, rect: { left: number; top: number; right: number; bottom: number }): boolean {
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }
}

