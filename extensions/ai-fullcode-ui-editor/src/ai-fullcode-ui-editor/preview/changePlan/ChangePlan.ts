/**
 * ChangePlan.ts
 *
 * UI操作ASTから生成される「変更案」。
 * 実ファイルはまだ変更しない。
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 */

/**
 * 変更タイプ
 */
export enum ChangeType {
  /**
   * リテラル値の変更（例: テキスト、数値）
   */
  LITERAL_CHANGE = 'LITERAL_CHANGE',

  /**
   * クラス名の追加
   */
  CLASS_ADD = 'CLASS_ADD',

  /**
   * クラス名の削除
   */
  CLASS_REMOVE = 'CLASS_REMOVE',

  /**
   * スタイルオブジェクトの変更
   */
  STYLE_CHANGE = 'STYLE_CHANGE',

  /**
   * 属性の追加
   */
  ATTRIBUTE_ADD = 'ATTRIBUTE_ADD',

  /**
   * 属性の削除
   */
  ATTRIBUTE_REMOVE = 'ATTRIBUTE_REMOVE',

  /**
   * 要素の追加
   */
  ELEMENT_ADD = 'ELEMENT_ADD',

  /**
   * 要素の削除
   */
  ELEMENT_REMOVE = 'ELEMENT_REMOVE',
}

/**
 * リスクレベル
 */
export enum RiskLevel {
  /**
   * 低リスク（リテラル値の変更など）
   */
  LOW = 'low',

  /**
   * 中リスク（クラス名の追加、スタイル変更など）
   */
  MEDIUM = 'medium',

  /**
   * 高リスク（props/state/derived の変更など）
   */
  HIGH = 'high',
}

/**
 * ChangePlan: コード変更の提案
 *
 * UI操作ASTから生成される「変更案」。
 * 実ファイルはまだ変更しない。
 */
export interface ChangePlan {
  /**
   * 一意なID
   */
  id: string;

  /**
   * 元のUI操作ASTのID
   */
  sourceOpId: string;

  /**
   * 変更対象のファイルパス
   */
  filePath: string;

  /**
   * 変更タイプ
   */
  changeType: ChangeType;

  /**
   * パッチ（変更前と変更後）
   */
  patch: {
    /**
     * 変更前のコード
     */
    before: string;

    /**
     * 変更後のコード
     */
    after: string;
  };

  /**
   * 変更範囲
   */
  range: {
    /**
     * 開始位置（文字列インデックス）
     */
    start: number;

    /**
     * 終了位置（文字列インデックス）
     */
    end: number;
  };

  /**
   * リスクレベル
   */
  riskLevel: RiskLevel;

  /**
   * ユーザーの決定が必要かどうか
   */
  requiresUserDecision: boolean;

  /**
   * 信頼度（0.0 - 1.0、Phase 4 の locatorConfidence を引き継ぐ）
   */
  confidence: number;

  /**
   * 変更理由（デバッグ用）
   */
  reason?: string;

  /**
   * エラーメッセージ（生成失敗時）
   */
  error?: string;
}

