/**
 * CodeLocator.ts
 *
 * プロジェクトのソースコードをAST解析し、
 * DOMLocator情報と一致する候補ノードを探索する。
 *
 * 要件:
 * - Babel / SWC / TypeScript AST を使用
 * - JSXElement / HTML Template を対象
 * - 複数候補がある場合は配列で返す
 * - まだ1つに確定しなくてよい
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 *
 * Phase 4 では簡易版を実装し、Phase 5 以降で精度を向上させる。
 */

import type { DOMLocator, CodeLocator, SourceLocator } from './SourceLocator';

/**
 * DOMLocator情報からコード上の位置を特定する
 *
 * 実装方針:
 * 1. プロジェクトのソースファイルを探索
 * 2. 各ファイルをAST解析
 * 3. DOMLocator情報と一致するノードを探索
 * 4. 複数候補がある場合は配列で返す
 *
 * Phase 4 では簡易版:
 * - ファイル名とタグ名でマッチング
 * - 完全一致は求めない
 * - 候補を返すだけ
 *
 * 実装例（JavaScript文字列として生成される）:
 * ```javascript
 * async function locateCodeFromDOM(domLocator) {
 *   // Phase 4: 簡易版実装
 *   // - ファイル探索（app/page.tsx, src/App.tsx など）
 *   // - 簡易的な文字列マッチング
 *   // - 候補を返す
 *
 *   const candidates = [];
 *
 *   // TODO: VSCode APIを使ってファイルを読み取り
 *   // TODO: AST解析（簡易版）
 *   // TODO: DOMLocator情報と一致するノードを探索
 *
 *   return candidates;
 * }
 * ```
 */
export async function locateCodeFromDOM(domLocator: DOMLocator): Promise<CodeLocator[]> {
  // この実装は使用されません（設計ドキュメントのみ）
  // 実際の実装は previewService.ts 内でJavaScript文字列として生成されます
  throw new Error('This function is a design document only. Actual implementation is in previewService.ts');
}

/**
 * CodeLocatorをSourceLocatorに変換する
 */
export function codeLocatorToSourceLocator(
  codeLocator: CodeLocator,
  confidence: number = 0.5
): SourceLocator {
  return {
    filePath: codeLocator.filePath,
    startLine: codeLocator.start.line,
    startColumn: codeLocator.start.column,
    endLine: codeLocator.end?.line,
    endColumn: codeLocator.end?.column,
    nodeKind: codeLocator.nodeType,
    confidence: confidence,
  };
}

