/**
 * ElementId
 * ✅ Cursor 2.x準拠: ID生成・検証ロジック
 *
 * 原則:
 * - data-element-id のみを使用
 * - 推測・フォールバック禁止
 * - 無効なIDは即エラー
 */

/**
 * ElementId: ID検証・取得ユーティリティ
 */
export class ElementId {
  /**
   * IDが有効か検証
   * ✅ 無効な場合は即エラー
   */
  static assertValid(id: string): void {
    if (!id || typeof id !== 'string' || id.trim() === '') {
      throw new Error('[ElementId] ❌ Invalid elementId: empty or non-string');
    }

    // ✅ data-element-id の形式チェック（dom:xxx 形式を推奨）
    if (!id.match(/^[a-zA-Z0-9:_-]+$/)) {
      throw new Error(`[ElementId] ❌ Invalid elementId format: ${id}`);
    }
  }

  /**
   * 要素からIDを取得
   * ✅ data-element-id のみを読む（推測・フォールバック禁止）
   *
   * @param element HTMLElement
   * @returns elementId または null（IDが無い場合）
   */
  static fromElement(element: HTMLElement | null): string | null {
    if (!element || element.nodeType !== 1) {
      return null;
    }

    const elementId = element.getAttribute('data-element-id');
    if (!elementId || elementId.trim() === '') {
      return null;
    }

    return elementId;
  }

  /**
   * 要素が有効なIDを持っているか確認
   */
  static hasValidId(element: HTMLElement | null): boolean {
    const id = this.fromElement(element);
    if (!id) {
      return false;
    }

    try {
      this.assertValid(id);
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * グローバルスコープへの公開
 * ✅ Cursor 2.x準拠: windowオブジェクトに公開
 */
if (typeof window !== 'undefined') {
  (window as any).ElementId = ElementId;
}
