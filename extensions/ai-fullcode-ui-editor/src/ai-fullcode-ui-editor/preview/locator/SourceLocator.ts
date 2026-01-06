/**
 * SourceLocator.ts
 *
 * DOMとコードを結びつけるための共通ロケータ型を定義する。
 *
 * Source Locator:
 * - DOM要素とコードASTを結びつけるための位置情報
 * - filePath / line / column / nodeType などで構成
 * - DOM自体には書き込まない
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 */

/**
 * SourceLocator: DOMとコードを結びつけるための位置情報
 */
export interface SourceLocator {
  /**
   * ファイルパス（相対パスまたは絶対パス）
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
   * ノードの種類（JSXElement / HTMLTag / Component など）
   */
  nodeKind: string;

  /**
   * 安定ID（将来用、一意な識別子）
   */
  stableId?: string;

  /**
   * 信頼度（0.0 - 1.0、マッピングの確実性）
   */
  confidence?: number;

  /**
   * 候補が複数ある場合の情報
   */
  candidates?: SourceLocator[];
}

/**
 * DOMLocator: DOM要素から抽出した情報
 *
 * コード特定に使えるヒント情報を抽出する。
 * DOMは一切変更しない。
 */
export interface DOMLocator {
  /**
   * タグ名
   */
  tagName: string;

  /**
   * クラスリスト（配列）
   */
  classList: string[];

  /**
   * ID
   */
  id?: string;

  /**
   * DOM階層パス（indexベース）
   * 例: [0, 1, 2] = body > div[0] > div[1] > span[2]
   */
  domPath: number[];

  /**
   * テキスト内容（短縮・正規化）
   */
  textContent?: string;

  /**
   * 親要素のタグ名
   */
  parentTagName?: string;

  /**
   * 属性情報（key-value）
   */
  attributes?: Record<string, string>;
}

/**
 * CodeLocator: コード上の位置情報
 *
 * AST解析により特定されたコード位置。
 */
export interface CodeLocator {
  /**
   * ファイルパス
   */
  filePath: string;

  /**
   * ASTノードの種類
   */
  nodeType: string;

  /**
   * 開始位置
   */
  start: {
    line: number;
    column: number;
  };

  /**
   * 終了位置（任意）
   */
  end?: {
    line: number;
    column: number;
  };

  /**
   * ノードの内容（デバッグ用）
   */
  nodeContent?: string;
}

