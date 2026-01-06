/**
 * UIActionAST.ts
 *
 * UI操作を表現するAST構造を定義する。
 *
 * UI操作AST:
 * - UI上で起きた操作を表現する構造化データ
 * - DOMではない
 * - コードASTでもない
 * - UI操作の履歴言語
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 * （VSCode Webview内でTypeScriptファイルを直接実行することはできないため）
 *
 * TypeScriptコンパイルエラーは無視して構いません。
 */

/**
 * UI操作タイプ
 */
export enum UIActionType {
  SELECT_ELEMENT = 'SELECT_ELEMENT',
  HOVER_ELEMENT = 'HOVER_ELEMENT',
  // Phase 3 では最低限 SELECT_ELEMENT と HOVER_ELEMENT を実装
  // Phase 4 以降で追加予定:
  // - DRAG_ELEMENT
  // - RESIZE_ELEMENT
  // - CHANGE_PROPERTY
  // - ADD_ELEMENT
  // - REMOVE_ELEMENT
}

/**
 * UI操作ASTの基本構造
 *
 * 重要: target は HTMLElement 参照を持たない
 * - DOM参照を避ける（メモリリーク防止）
 * - シリアライズ可能にする
 * - 将来のコード書き換えのための事実ログ
 */
export interface UIActionAST {
  /**
   * 一意な操作ID
   */
  operationId: string;

  /**
   * 操作タイプ
   */
  type: UIActionType;

  /**
   * タイムスタンプ（必須）
   */
  timestamp: number;

  /**
   * 対象要素の情報（HTMLElement参照は持たない）
   */
  target: {
    /**
     * タグ名
     */
    tagName: string;

    /**
     * クラス名（スペース区切り）
     */
    className?: string;

    /**
     * ID
     */
    id?: string;

    /**
     * 位置情報（getBoundingClientRectの結果）
     */
    rect?: {
      left: number;
      top: number;
      width: number;
      height: number;
    };

    /**
     * テキスト内容（最初の100文字まで）
     */
    textContent?: string;
  };

  /**
   * 追加のメタデータ（オプション）
   */
  metadata?: Record<string, unknown>;

  /**
   * Source Locator（Phase 4で追加）
   *
   * DOMとコードを結びつけるための位置情報。
   * optional であり、マッピング不能でも問題ない。
   */
  locator?: {
    /**
     * ファイルパス
     */
    filePath: string;
    /**
     * 開始行（1ベース）
     */
    startLine: number;
    /**
     * 開始列（1ベース）
     */
    startColumn: number;
    /**
     * 終了行（1ベース、任意）
     */
    endLine?: number;
    /**
     * 終了列（1ベース、任意）
     */
    endColumn?: number;
    /**
     * ノードの種類
     */
    nodeKind: string;
    /**
     * 信頼度（0.0 - 1.0）
     */
    confidence?: number;
    /**
     * 候補が複数ある場合
     */
    candidates?: Array<{
      filePath: string;
      startLine: number;
      startColumn: number;
      nodeKind: string;
      confidence?: number;
    }>;
  };
}

/**
 * UI操作ASTを作成するヘルパー関数
 *
 * 注意: この関数は設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 *
 * 実装例（JavaScript文字列として生成される）:
 * ```javascript
 * function createUIActionAST(type, element) {
 *   if (!element || !(element instanceof HTMLElement)) {
 *     return null;
 *   }
 *
 *   const rect = element.getBoundingClientRect();
 *
 *   return {
 *     operationId: 'ui-action-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
 *     type: type,
 *     timestamp: Date.now(),
 *     target: {
 *       tagName: element.tagName,
 *       className: element.className || undefined,
 *       id: element.id || undefined,
 *       rect: {
 *         left: rect.left,
 *         top: rect.top,
 *         width: rect.width,
 *         height: rect.height,
 *       },
 *       textContent: element.textContent ? element.textContent.substring(0, 100) : undefined,
 *     },
 *   };
 * }
 * ```
 */
// 実装は previewService.ts 内でJavaScript文字列として生成されるため、ここでは型定義のみ
export function createUIActionAST(
  type: UIActionType,
  element: any, // HTMLElement の代わりに any を使用（設計ドキュメントのため）
  metadata?: Record<string, unknown>
): UIActionAST {
  // この実装は使用されません（設計ドキュメントのみ）
  // 実際の実装は previewService.ts 内でJavaScript文字列として生成されます
  throw new Error('This function is a design document only. Actual implementation is in previewService.ts');
}

