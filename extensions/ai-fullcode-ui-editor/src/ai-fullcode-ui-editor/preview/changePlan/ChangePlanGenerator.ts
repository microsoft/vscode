/**
 * ChangePlanGenerator.ts
 *
 * UI操作ASTを解析し、ChangePlanを生成する。
 *
 * ルール:
 * - literal 由来 → riskLevel: low
 * - className 追記 → low〜medium
 * - style object → medium
 * - props / state / derived → high + requiresUserDecision=true
 * - locator が low confidence → changePlan生成はするが riskLevel=high
 *
 * 要件:
 * - 失敗しても例外を投げない
 * - 生成できない場合は理由付きで null を返す
 * - ASTは読むだけ（書き換え禁止）
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 */

import type { ChangePlan } from './ChangePlan';
import { ChangeType, RiskLevel } from './ChangePlan';
import type { UIActionAST } from '../uiAction/UIActionAST';

/**
 * UI操作ASTからChangePlanを生成する
 *
 * 実装例（JavaScript文字列として生成される）:
 * ```javascript
 * function generateChangePlan(uiActionAST) {
 *   try {
 *     // locator がない場合は生成できない
 *     if (!uiActionAST.locator) {
 *       return {
 *         id: 'change-plan-' + Date.now(),
 *         sourceOpId: uiActionAST.operationId,
 *         error: 'No locator found',
 *       };
 *     }
 *
 *     // Phase 5: 簡易版実装
 *     // - ファイル読み取り（VSCode API）
 *     // - AST解析（簡易版）
 *     // - ChangePlan生成
 *
 *     // TODO: Phase 5 で実装
 *     // - ファイル内容の取得
 *     // - AST解析
 *     // - 変更箇所の特定
 *     // - patch生成
 *
 *     return null; // Phase 5: プレースホルダー
 *   } catch (error) {
 *     // 例外を投げない
 *     return {
 *       id: 'change-plan-' + Date.now(),
 *       sourceOpId: uiActionAST.operationId,
 *       error: error.message,
 *     };
 *   }
 * }
 * ```
 */
export function generateChangePlan(uiActionAST: UIActionAST): ChangePlan | null {
  // この実装は使用されません（設計ドキュメントのみ）
  // 実際の実装は previewService.ts 内でJavaScript文字列として生成されます
  throw new Error('This function is a design document only. Actual implementation is in previewService.ts');
}

/**
 * リスクレベルを判定する
 */
export function determineRiskLevel(
  changeType: ChangeType,
  confidence: number
): RiskLevel {
  // literal 由来 → riskLevel: low
  if (changeType === ChangeType.LITERAL_CHANGE) {
    return RiskLevel.LOW;
  }

  // className 追記 → low〜medium
  if (changeType === ChangeType.CLASS_ADD || changeType === ChangeType.CLASS_REMOVE) {
    return confidence > 0.7 ? RiskLevel.LOW : RiskLevel.MEDIUM;
  }

  // style object → medium
  if (changeType === ChangeType.STYLE_CHANGE) {
    return RiskLevel.MEDIUM;
  }

  // props / state / derived → high
  if (
    changeType === ChangeType.ATTRIBUTE_ADD ||
    changeType === ChangeType.ATTRIBUTE_REMOVE ||
    changeType === ChangeType.ELEMENT_ADD ||
    changeType === ChangeType.ELEMENT_REMOVE
  ) {
    return RiskLevel.HIGH;
  }

  // locator が low confidence → high
  if (confidence < 0.5) {
    return RiskLevel.HIGH;
  }

  return RiskLevel.MEDIUM;
}

