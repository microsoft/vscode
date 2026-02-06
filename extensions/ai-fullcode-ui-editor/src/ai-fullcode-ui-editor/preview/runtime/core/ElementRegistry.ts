/**
 * ElementRegistry
 * ✅ Cursor 2.x準拠: DOM ↔ elementId の唯一の真実
 *
 * 原則:
 * - DOM が存在すれば必ず registry に載る
 * - registry が空なら drag 不可
 * - DOM 参照を絶対に保持（WeakMap 使用）
 * - scan後 size() === 0 は例外
 */

import { ElementId } from './ElementId';

/**
 * ElementRegistry: DOM要素とelementIdのマッピング
 * ✅ Cursor 2.x準拠: シングルトンで管理
 */
export class ElementRegistry {
  private static instance: ElementRegistry | null = null;
  private idToElement: Map<string, HTMLElement>; // elementId -> HTMLElement
  private elementToId: WeakMap<HTMLElement, string>; // HTMLElement -> elementId

  private constructor() {
    this.idToElement = new Map();
    this.elementToId = new WeakMap();
  }

  /**
   * インスタンスを取得
   */
  static getInstance(): ElementRegistry {
    if (!ElementRegistry.instance) {
      ElementRegistry.instance = new ElementRegistry();
    }
    return ElementRegistry.instance;
  }

  /**
   * DOMを走査して要素を登録
   * ✅ 必須: scan後 size() === 0 は例外
   *
   * @param root ルート要素
   */
  scan(root: HTMLElement): void {
    if (!root) {
      throw new Error('[ElementRegistry] ❌ CRITICAL: scan() called with null root');
    }

    // ✅ 既存の登録をクリア
    this.idToElement.clear();

    // ✅ DOMを走査して data-element-id を持つ要素を登録
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode: (node: Node) => {
          const element = node as HTMLElement;
          // ✅ スキップタグを除外
          const skipTags = ['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'HEAD', 'HTML', 'BODY'];
          if (skipTags.includes(element.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }
          // ✅ オーバーレイ要素を除外
          if (element.hasAttribute('data-ui-editor-overlay')) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node: Node | null;
    let registeredCount = 0;
    while ((node = walker.nextNode())) {
      const element = node as HTMLElement;
      const elementId = ElementId.fromElement(element);

      if (elementId) {
        // ✅ IDが有効か検証
        try {
          ElementId.assertValid(elementId);
        } catch (error) {
          continue;
        }

        // ✅ 重複チェック
        if (this.idToElement.has(elementId)) {
          // ✅ 既存の登録を上書き（最新のDOM要素を優先）
        }

        // ✅ 登録
        this.idToElement.set(elementId, element);
        this.elementToId.set(element, elementId);
        registeredCount++;
      }
    }

    const finalSize = this.size();

    // ✅ ハード制約: scan後 size() === 0 は例外
    if (finalSize === 0) {
      // ✅ DOM要素の存在を確認
      const allElementsWithId = root.querySelectorAll('[data-element-id]');
      if (allElementsWithId.length > 0) {
        const error = `[ElementRegistry] ❌ CRITICAL: scan() completed but size() is 0, while DOM has ${allElementsWithId.length} elements with data-element-id`;
        throw new Error(error);
      }
    }
  }

  /**
   * IDからDOM要素を取得
   *
   * @param id elementId
   * @returns HTMLElement または null
   */
  get(id: string): HTMLElement | null {
    if (!id || typeof id !== 'string') {
      return null;
    }

    const element = this.idToElement.get(id);

    // ✅ DOM要素がまだ存在するか確認
    if (element && element.parentNode) {
      return element;
    }

    // ✅ DOM要素が削除された場合は登録から削除
    if (element) {
      this.idToElement.delete(id);
      this.elementToId.delete(element);
    }

    return null;
  }

  /**
   * IDが登録されているか確認
   *
   * @param id elementId
   * @returns boolean
   */
  has(id: string): boolean {
    if (!id || typeof id !== 'string') {
      return false;
    }

    const element = this.idToElement.get(id);
    if (!element) {
      return false;
    }

    // ✅ DOM要素がまだ存在するか確認
    if (element.parentNode) {
      return true;
    }

    // ✅ DOM要素が削除された場合は登録から削除
    this.idToElement.delete(id);
    this.elementToId.delete(element);
    return false;
  }

  /**
   * 登録されている要素数を返す
   *
   * @returns number
   */
  size(): number {
    // ✅ 削除されたDOM要素をクリーンアップ
    const validIds: string[] = [];
    for (const [id, element] of this.idToElement.entries()) {
      if (element.parentNode) {
        validIds.push(id);
      } else {
        // ✅ 削除された要素を登録から削除
        this.idToElement.delete(id);
        this.elementToId.delete(element);
      }
    }

    return validIds.length;
  }

  /**
   * すべての登録IDを取得
   *
   * @returns string[]
   */
  getAllIds(): string[] {
    return Array.from(this.idToElement.keys()).filter(id => this.has(id));
  }

  /**
   * 要素からIDを取得（逆引き）
   *
   * @param element HTMLElement
   * @returns elementId または null
   */
  getIdFromElement(element: HTMLElement | null): string | null {
    if (!element) {
      return null;
    }

    return this.elementToId.get(element) || null;
  }

  /**
   * すべての登録をクリア
   */
  clear(): void {
    this.idToElement.clear();
    // ✅ WeakMap は自動的にクリーンアップされる
  }
}

/**
 * グローバルスコープへの公開
 * ✅ Cursor 2.x準拠: windowオブジェクトに公開
 */
if (typeof window !== 'undefined') {
  const elementRegistry = ElementRegistry.getInstance();

  (window as any).ElementRegistry = ElementRegistry;
  (window as any).getElementRegistry = function() {
    return elementRegistry;
  };
}
