/**
 * ElementOverlay.tsx
 *
 * Previewの上に重ねるUI操作専用レイヤー。
 *
 * PreviewのDOMには一切触れない。
 * Overlayは常に pointer-events: none を基本とする。
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 */

/**
 * 設計ドキュメント: ElementOverlay の実装
 *
 * 実際の実装は previewService.ts の getDesignSurfaceHtml() 内にあります。
 *
 * 設計思想:
 * - position: absolute / fixed で Preview の上に配置
 * - pointer-events: none（基本）
 * - 選択枠（outline / rect）を描画
 * - Preview DOM を直接操作しない
 * - z-index は Preview より上
 *
 * 実装例（JavaScript文字列として生成される）:
 * ```javascript
 * function ElementOverlay({ selectedElement }) {
 *   if (!selectedElement) return null;
 *
 *   const rect = selectedElement.getBoundingClientRect();
 *   const containerRect = container.getBoundingClientRect();
 *
 *   return React.createElement('div', {
 *     style: {
 *       position: 'absolute',
 *       left: rect.left - containerRect.left + 'px',
 *       top: rect.top - containerRect.top + 'px',
 *       width: rect.width + 'px',
 *       height: rect.height + 'px',
 *       border: '2px solid #3b82f6',
 *       pointerEvents: 'none',
 *       zIndex: 1000,
 *     }
 *   });
 * }
 * ```
 */

