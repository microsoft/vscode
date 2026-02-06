/**
 * Preview CSS（文字列）
 *
 * DesignSurface のスタイル定義
 */

export const previewCss = `
  * {
    margin: 0;
    padding: 0;
    box-sizing: border-box;
  }
  html {
    height: 100%;
    margin: 0;
    overflow: hidden; /* ← html はスクロールしない */
  }
  body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden; /* ← body はスクロールしない */
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    cursor: default;
    background-color: #ffffff;
  }
  #root {
    width: 100%;
    height: 100%; /* ✅ WebView全体を固定し、スクロール責任を下位に委譲 */
    overflow: hidden; /* ✅ WebView自体はスクロールさせず、責任を子に委譲 */
  }
  /* ✅ スクロール責任者: [data-scroll-container="true"] が唯一のスクロール責任者 */
  [data-scroll-container="true"] {
    width: 100%;
    height: 100%; /* ✅ CSSのみ（インラインスタイル禁止） */
    overflow: auto; /* ✅ 唯一のスクロール責任者として機能 */
    position: relative;
  }
  #design-surface-container {
    width: 100%;
    height: auto; /* ✅ 絶対に 100% にしない */
    min-height: 100vh; /* コンテンツが短い場合でも最低限の高さを確保 */
    position: relative;
    overflow: visible; /* ✅ スクロールは親が担当 */
    cursor: default;
  }
  #element-overlay {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1000;
  }
  .selection-outline {
    position: fixed;
    border: 2px solid #3b82f6;
    pointer-events: none;
    box-sizing: border-box;
    z-index: 10002;
  }
  .resize-handle {
    position: absolute;
    width: 8px;
    height: 8px;
    background: #3b82f6;
    border: 1px solid #fff;
    border-radius: 2px;
    pointer-events: auto;
    z-index: 1001;
  }
  .resize-handle:hover {
    background: #2563eb;
  }
  .slot-preview {
    position: fixed;
    pointer-events: none;
    z-index: 10000;
    background-color: rgba(59, 130, 246, 0.8);
    box-sizing: border-box;
  }
  .drag-ghost {
    position: fixed;
    pointer-events: none;
    z-index: 10001;
    opacity: 0.6;
    background: rgba(59, 130, 246, 0.2);
    border: 2px dashed rgba(59, 130, 246, 0.8);
    box-sizing: border-box;
    transition: none;
  }
  .drop-guide-line {
    position: fixed;
    pointer-events: none;
    z-index: 10000;
    background-color: rgba(59, 130, 246, 0.9);
    box-sizing: border-box;
  }
  .drop-guide-box {
    position: fixed;
    pointer-events: none;
    z-index: 10000;
    border: 2px solid rgba(59, 130, 246, 0.9);
    background-color: rgba(59, 130, 246, 0.1);
    box-sizing: border-box;
  }
  #design-surface-container * {
    cursor: default;
  }
  #design-surface-container [data-selected="true"] {
    cursor: move !important;
  }
  #design-surface-container.dragging {
    cursor: grabbing !important;
  }
  #design-surface-container.dragging * {
    cursor: grabbing !important;
  }
`;

