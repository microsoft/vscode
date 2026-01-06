/**
 * ElementIdRegistry.ts
 *
 * WeakMapによる要素↔ID対応
 * DOMを書き換えずに ID を保持
 * セッション内での安定性保証
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 */

import type { StableElementId } from './StableElementIdService';

/**
 * ElementIdRegistry
 *
 * WeakMapによる要素↔ID対応
 */
export class ElementIdRegistry {
  private elementIdMap: WeakMap<Element, StableElementId> = new WeakMap();

  /**
   * 要素にIDを登録
   */
  set(element: Element, id: StableElementId): void {
    this.elementIdMap.set(element, id);
  }

  /**
   * 要素のIDを取得
   */
  get(element: Element): StableElementId | undefined {
    return this.elementIdMap.get(element);
  }

  /**
   * 要素にIDが登録されているか確認
   */
  has(element: Element): boolean {
    return this.elementIdMap.has(element);
  }
}

