/**
 * AstNodeIdResolver.ts
 *
 * Phase4 の AST / SourceLocator と接続
 * ASTノードが特定できる場合は必ず AST由来IDを返す
 * element → AST → StableElementId のルートを確立
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 */

import type { StableElementId } from './StableElementIdService';
import type { SourceLocator } from '../locator/SourceLocator';

/**
 * AstNodeIdResolver
 *
 * AST/SourceLocatorからStableElementIdを解決
 */
export class AstNodeIdResolver {
  /**
   * SourceLocator から StableElementId を生成
   *
   * 形式: "ast:{filePath}:{startLine}:{startColumn}:{nodeKind}"
   * または: "ast:{hash}-{startLine}-{startColumn}-{nodeKind}"
   *
   * @param locator SourceLocator
   * @returns StableElementId
   */
  resolveFromSourceLocator(locator: SourceLocator): StableElementId {
    // この実装は使用されません（設計ドキュメントのみ）
    // 実際の実装は previewService.ts 内でJavaScript文字列として生成されます
    throw new Error('This function is a design document only. Actual implementation is in previewService.ts');
  }

  /**
   * AST Node ID を直接使用（将来実装）
   *
   * 形式: "ast-{hash}-{pos}-{kind}"
   *
   * @param astNodeId AST Node ID
   * @returns StableElementId
   */
  resolveFromAstNodeId(astNodeId: string): StableElementId {
    // この実装は使用されません（設計ドキュメントのみ）
    // 実際の実装は previewService.ts 内でJavaScript文字列として生成されます
    throw new Error('This function is a design document only. Actual implementation is in previewService.ts');
  }
}

