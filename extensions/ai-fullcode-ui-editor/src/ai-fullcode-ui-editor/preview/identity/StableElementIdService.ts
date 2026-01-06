/**
 * StableElementIdService.ts
 *
 * 唯一の正式ID発行所
 * DOM要素 → StableElementId を返す
 * 毎回同じ要素なら必ず同じIDを返す
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 */

/**
 * StableElementId: 永続・再現可能な要素ID
 */
export type StableElementId = string;

/**
 * OperationId: 一時・操作単位のID
 */
export type OperationId = string;

/**
 * StableElementIdService
 *
 * 唯一の正式ID発行所
 */
export class StableElementIdService {
  /**
   * DOM要素から StableElementId を取得
   *
   * 優先順位:
   * 1. AST Node ID（最優先・コード由来）
   * 2. SourceLocator ID（filePath + range + kind）
   * 3. domPath → hash（DOM構造が同じなら同一）
   * 4. WeakMap キャッシュ（セッション内安定）
   *
   * @param element DOM要素
   * @returns StableElementId
   */
  getStableElementId(element: Element): StableElementId {
    // この実装は使用されません（設計ドキュメントのみ）
    // 実際の実装は previewService.ts 内でJavaScript文字列として生成されます
    throw new Error('This function is a design document only. Actual implementation is in previewService.ts');
  }
}

