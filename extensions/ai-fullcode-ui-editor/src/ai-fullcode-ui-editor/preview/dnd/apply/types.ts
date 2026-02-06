/**
 * Apply 共通型定義
 */

/// <reference lib="dom" />

/**
 * LayoutTreeService のインターフェース（統一版）
 */
export interface LayoutTreeService {
  getDomElement(elementId: string): HTMLElement | null;
  getNode(elementId: string): any | null;
  updateTree(): void;
}

