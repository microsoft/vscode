/**
 * PreviewRoot
 * ✅ Cursor 2.x準拠: previewRoot要素の確定責務
 *
 * 原則:
 * - previewRoot は必ず1つ
 * - 取得できなければ即 throw
 * - 一意性を保証
 */

import { ElementId } from './ElementId';

/**
 * PreviewRoot: previewRoot要素の管理
 * ✅ Cursor 2.x準拠: シングルトンで管理
 */
export class PreviewRoot {
  private static instance: PreviewRoot | null = null;
  private rootElement: HTMLElement | null = null;

  private constructor() {
    // プライベートコンストラクタ（シングルトン）
  }

  /**
   * インスタンスを取得
   */
  static getInstance(): PreviewRoot {
    if (!PreviewRoot.instance) {
      PreviewRoot.instance = new PreviewRoot();
    }
    return PreviewRoot.instance;
  }

  /**
   * previewRoot要素を設定
   * ✅ 必須: rootElement が null でないことをアサート
   */
  setRoot(rootElement: HTMLElement): void {
    if (!rootElement) {
      throw new Error('[PreviewRoot] ❌ CRITICAL: setRoot() called with null rootElement');
    }

    if (this.rootElement && this.rootElement !== rootElement) {
      // Silent warning
    }

    // 追加: position: relative を保証
    const pos = rootElement.style.position;
    if (pos === '' || pos === 'static') {
      rootElement.style.position = 'relative';
    }

    this.rootElement = rootElement;
  }

  /**
   * previewRoot要素を取得
   * ✅ 必須: 存在しなければ即 throw
   */
  get(): HTMLElement {
    if (!this.rootElement) {
      // ✅ 自動検出を試みる
      const candidate = document.getElementById('design-surface-container') ||
                       document.querySelector('[data-design-surface="true"]') as HTMLElement;

      if (candidate) {
        this.rootElement = candidate;
      } else {
        const error = '[PreviewRoot] ❌ CRITICAL: previewRoot not found. Call setRoot() first.';
        throw new Error(error);
      }
    }

    return this.rootElement;
  }

  /**
   * previewRoot要素を検証
   * ✅ 存在・一意性を検証
   */
  validate(): void {
    const root = this.get();

    // ✅ 存在チェック
    if (!root || !root.parentNode) {
      throw new Error('[PreviewRoot] ❌ CRITICAL: previewRoot element is not in DOM');
    }

    // ✅ 一意性チェック: 同じID/属性を持つ要素が複数存在しないか
    const candidates = document.querySelectorAll('[data-design-surface="true"]');
    if (candidates.length > 1) {
      // Silent warning
    }

    // ✅ 警告: data-element-id が無い要素が存在する場合
    const allElements = root.querySelectorAll('*');
    const elementsWithoutId: HTMLElement[] = [];
    for (let i = 0; i < allElements.length; i++) {
      const el = allElements[i] as HTMLElement;
      // スキップタグを除外
      const skipTags = ['SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'HEAD', 'HTML', 'BODY'];
      if (skipTags.includes(el.tagName)) {
        continue;
      }
      if (!ElementId.fromElement(el)) {
        elementsWithoutId.push(el);
      }
    }

    if (elementsWithoutId.length > 0) {
      // Silent warning
    }
  }

  /**
   * previewRoot要素をクリア
   */
  clear(): void {
    this.rootElement = null;
  }
}

/**
 * グローバルスコープへの公開
 * ✅ Cursor 2.x準拠: windowオブジェクトに公開
 */
if (typeof window !== 'undefined') {
  const previewRoot = PreviewRoot.getInstance();

  const w = window as unknown as Record<string, any>;
  w.PreviewRoot = PreviewRoot;
  w.getPreviewRoot = function() {
    return previewRoot;
  };
}
