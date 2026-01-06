/**
 * DOMLocator.ts
 *
 * 選択された HTMLElement から、
 * コード特定に使えるヒント情報を抽出する。
 *
 * 要件:
 * - tagName
 * - classList
 * - id
 * - DOM階層パス（indexベース）
 * - textContent（短縮・正規化）
 * - DOMは一切変更しない
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 */

import type { DOMLocator } from './SourceLocator';

/**
 * DOM要素からDOMLocator情報を抽出する
 *
 * 実装例（JavaScript文字列として生成される）:
 * ```javascript
 * function extractDOMLocator(element) {
 *   if (!element || !(element instanceof HTMLElement)) {
 *     return null;
 *   }
 *
 *   // DOM階層パスを構築
 *   const domPath = [];
 *   let current = element;
 *   while (current && current !== document.body) {
 *     const parent = current.parentElement;
 *     if (parent) {
 *       const index = Array.from(parent.children).indexOf(current);
 *       domPath.unshift(index);
 *     }
 *     current = parent;
 *   }
 *
 *   // クラスリストを取得
 *   const classList = element.classList ? Array.from(element.classList) : [];
 *
 *   // テキスト内容を正規化（空白を削除、100文字まで）
 *   const textContent = element.textContent
 *     ? element.textContent.trim().replace(/\\s+/g, ' ').substring(0, 100)
 *     : undefined;
 *
 *   // 属性情報を取得
 *   const attributes = {};
 *   if (element.attributes) {
 *     for (let i = 0; i < element.attributes.length; i++) {
 *       const attr = element.attributes[i];
 *       attributes[attr.name] = attr.value;
 *     }
 *   }
 *
 *   return {
 *     tagName: element.tagName,
 *     classList: classList,
 *     id: element.id || undefined,
 *     domPath: domPath,
 *     textContent: textContent,
 *     parentTagName: element.parentElement ? element.parentElement.tagName : undefined,
 *     attributes: attributes,
 *   };
 * }
 * ```
 */
export function extractDOMLocator(element: any): DOMLocator | null {
  // この実装は使用されません（設計ドキュメントのみ）
  // 実際の実装は previewService.ts 内でJavaScript文字列として生成されます
  throw new Error('This function is a design document only. Actual implementation is in previewService.ts');
}

