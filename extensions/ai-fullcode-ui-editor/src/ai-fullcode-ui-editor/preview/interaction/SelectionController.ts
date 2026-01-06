/**
 * SelectionController.ts
 *
 * DOM観測・選択専用のコントローラ。
 *
 * この段階では：
 *   - DOM を読むだけ
 *   - 選択情報を保持するだけ
 *   - 書き換えは絶対にしない
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 */

/**
 * 設計ドキュメント: SelectionController の実装
 *
 * 実際の実装は previewService.ts の getDesignSurfaceHtml() 内にあります。
 *
 * 設計思想:
 * - document.addEventListener を使用
 * - click / mousemove を監視
 * - 選択された HTMLElement を state として保持
 * - getBoundingClientRect で rect 情報を取得
 * - data-* 属性は付与しない（Preview DOMを書き換えない）
 *
 * 実装例（JavaScript文字列として生成される）:
 * ```javascript
 * class SelectionController {
 *   constructor(onSelectionChange) {
 *     this.selectedElement = null;
 *     this.onSelectionChange = onSelectionChange;
 *     this.setupListeners();
 *   }
 *
 *   setupListeners() {
 *     document.addEventListener('click', (e) => {
 *       const element = this.findSelectableElement(e.target);
 *       if (element) {
 *         this.selectElement(element);
 *       }
 *     }, true);
 *   }
 *
 *   findSelectableElement(target) {
 *     // BODY, HTML, SCRIPT, STYLE などをスキップ
 *     const skipTags = ['BODY', 'HTML', 'SCRIPT', 'STYLE', 'META', 'LINK', 'TITLE', 'HEAD'];
 *     let element = target;
 *     while (element && element !== document.body) {
 *       if (skipTags.includes(element.tagName)) {
 *         element = element.parentElement;
 *         continue;
 *       }
 *       return element;
 *     }
 *     return null;
 *   }
 *
 *   selectElement(element) {
 *     this.selectedElement = element;
 *     this.onSelectionChange(element);
 *   }
 * }
 * ```
 */

