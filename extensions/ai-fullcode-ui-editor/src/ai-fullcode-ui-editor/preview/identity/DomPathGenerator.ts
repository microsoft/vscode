/**
 * DomPathGenerator.ts
 *
 * DOMフォールバック用
 * DOM構造から domPath を生成
 * sibling index + tagName を含む
 * ハッシュ化して StableElementId に変換
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 */

import type { StableElementId } from './StableElementIdService';

/**
 * DomPathGenerator
 *
 * DOM構造から domPath を生成
 */
export class DomPathGenerator {
  /**
   * DOM要素から domPath を生成
   *
   * 例: "root/0:DIV/2:SECTION/1:H2"
   *
   * @param element DOM要素
   * @param parentPath 親のパス（デフォルト: 'root'）
   * @returns domPath文字列
   */
  generateDomPath(element: Element, parentPath: string = 'root'): string {
    // この実装は使用されません（設計ドキュメントのみ）
    // 実際の実装は previewService.ts 内でJavaScript文字列として生成されます
    throw new Error('This function is a design document only. Actual implementation is in previewService.ts');
  }

  /**
   * domPath から StableElementId を生成（ハッシュ化）
   *
   * 例: "root/0:DIV/2:SECTION/1:H2" → "dom:ab39f2x"
   *
   * @param domPath domPath文字列
   * @returns StableElementId
   */
  generateStableIdFromDomPath(domPath: string): StableElementId {
    // この実装は使用されません（設計ドキュメントのみ）
    // 実際の実装は previewService.ts 内でJavaScript文字列として生成されます
    throw new Error('This function is a design document only. Actual implementation is in previewService.ts');
  }
}

