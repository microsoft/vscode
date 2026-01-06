/**
 * DOMObserverBridge.ts
 *
 * Phase 3 に向け、DOM情報を安全に取得できるようにする。
 *
 * 制約:
 * - DOMを変更しない
 * - data-属性を付与しない
 * - ノード参照は WeakMap で保持
 * - UI操作ASTとはまだ接続しない
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 */

/**
 * 設計ドキュメント: DOMObserverBridge の実装
 *
 * 実際の実装は previewService.ts の getDesignSurfaceHtml() 内にあります。
 *
 * 設計思想:
 * - DOMを変更しない（読み取り専用）
 * - data-属性を付与しない
 * - ノード参照は WeakMap で保持
 * - UI操作ASTとはまだ接続しない
 *
 * 実装例（JavaScript文字列として生成される）:
 * ```javascript
 * class DOMObserverBridge {
 *   constructor() {
 *     this.nodeMap = new WeakMap(); // ノード参照を保持
 *     this.observer = null;
 *   }
 *
 *   startObserving(container) {
 *     // MutationObserver で DOM 変更を監視（読み取り専用）
 *     this.observer = new MutationObserver((mutations) => {
 *       // DOM変更を記録（書き換えはしない）
 *       mutations.forEach((mutation) => {
 *         // 読み取り専用で処理
 *       });
 *     });
 *
 *     this.observer.observe(container, {
 *       childList: true,
 *       subtree: true,
 *       attributes: true,
 *       attributeOldValue: true,
 *     });
 *   }
 *
 *   stopObserving() {
 *     if (this.observer) {
 *       this.observer.disconnect();
 *       this.observer = null;
 *     }
 *   }
 *
 *   getNodeInfo(element) {
 *     // DOM情報を取得（変更はしない）
 *     return {
 *       tagName: element.tagName,
 *       className: element.className,
 *       id: element.id,
 *       rect: element.getBoundingClientRect(),
 *     };
 *   }
 * }
 * ```
 */

