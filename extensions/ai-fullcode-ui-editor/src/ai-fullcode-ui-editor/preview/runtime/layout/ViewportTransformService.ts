/**
 * ViewportTransformService
 * ✅ Cursor 2.2準拠: 論理座標 ↔ レンダリング座標変換
 */

export interface ViewportTransform {
  setContainer(container: HTMLElement): void;
  update(): void;
  logicalToRender(logicalRect: DOMRect | { left: number; top: number; width: number; height: number; right: number; bottom: number }): DOMRect;
  renderToLogical(renderRect: DOMRect | { left: number; top: number; width: number; height: number; right: number; bottom: number }): DOMRect;
}

/**
 * ViewportTransformService: 論理座標 ↔ レンダリング座標
 */
export function getViewportTransformService(): ViewportTransform {
  let container: HTMLElement | null = null;
  let scrollX = 0;
  let scrollY = 0;
  let scaleX = 1;
  let scaleY = 1;

  return {
    setContainer(c: HTMLElement) {
      container = c;
      this.update();
    },

    update() {
      if (!container) {
        return;
      }

      // スクロール位置を取得
      scrollX = container.scrollLeft || 0;
      scrollY = container.scrollTop || 0;

      // スケールを取得（将来の拡張用）
      scaleX = 1;
      scaleY = 1;
    },

    logicalToRender(logicalRect: DOMRect | { left: number; top: number; width: number; height: number; right: number; bottom: number }): DOMRect {
      const rect = {
        left: logicalRect.left + scrollX,
        top: logicalRect.top + scrollY,
        width: logicalRect.width,
        height: logicalRect.height,
        right: logicalRect.right + scrollX,
        bottom: logicalRect.bottom + scrollY,
      };
      return rect as DOMRect;
    },

    renderToLogical(renderRect: DOMRect | { left: number; top: number; width: number; height: number; right: number; bottom: number }): DOMRect {
      const rect = {
        left: renderRect.left - scrollX,
        top: renderRect.top - scrollY,
        width: renderRect.width,
        height: renderRect.height,
        right: renderRect.right - scrollX,
        bottom: renderRect.bottom - scrollY,
      };
      return rect as DOMRect;
    },
  };
}

/**
 * グローバルスコープへの公開
 * ✅ Cursor 2.2準拠: windowオブジェクトに公開
 */
if (typeof window !== 'undefined') {
  (window as any).getViewportTransformService = getViewportTransformService;
}
