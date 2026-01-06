/**
 * ApplyChangePlanService.ts
 *
 * ChangePlan を実コードへ反映する唯一のサービス。
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 *
 * ファイルI/Oは VSCode Extension Host 側のみで行います。
 */

import type { ChangePlan } from '../changePlan/ChangePlan';

/**
 * Apply結果
 */
export interface ApplyResult {
  /**
   * 成功したかどうか
   */
  success: boolean;

  /**
   * 適用されたファイルパス
   */
  filePath: string;

  /**
   * 適用前の内容（Undo用）
   */
  beforeContent: string;

  /**
   * 適用後の内容
   */
  afterContent: string;

  /**
   * エラーメッセージ（失敗時）
   */
  error?: string;

  /**
   * 履歴エントリID（Undo用）
   */
  historyEntryId?: string;
}

/**
 * DryRun結果（適用前の確認用）
 */
export interface DryRunResult {
  /**
   * 適用可能かどうか
   */
  canApply: boolean;

  /**
   * 差分（unified diff形式）
   */
  diff: string;

  /**
   * 警告メッセージ（任意）
   */
  warnings?: string[];

  /**
   * エラーメッセージ（適用不可の場合）
   */
  error?: string;
}

/**
 * ApplyChangePlanService
 *
 * ChangePlan を実コードへ反映する唯一のサービス。
 */
export class ApplyChangePlanService {
  /**
   * ChangePlan を適用する
   *
   * @param planId ChangePlanのID
   * @returns Apply結果
   */
  async apply(planId: string): Promise<ApplyResult> {
    // この実装は使用されません（設計ドキュメントのみ）
    // 実際の実装は previewService.ts 内でJavaScript文字列として生成されます
    throw new Error('This function is a design document only. Actual implementation is in previewService.ts');
  }

  /**
   * DryRun（適用前の確認）
   *
   * @param planId ChangePlanのID
   * @returns DryRun結果
   */
  async dryRun(planId: string): Promise<DryRunResult> {
    // この実装は使用されません（設計ドキュメントのみ）
    // 実際の実装は previewService.ts 内でJavaScript文字列として生成されます
    throw new Error('This function is a design document only. Actual implementation is in previewService.ts');
  }

  /**
   * 安全装置チェック
   *
   * @param plan ChangePlan
   * @returns 適用可能かどうかと警告メッセージ
   */
  validatePlan(plan: ChangePlan): { canApply: boolean; warnings: string[] } {
    const warnings: string[] = [];

    // filePath === 'unknown' の plan は Apply 不可
    if (plan.filePath === 'unknown') {
      return {
        canApply: false,
        warnings: ['File path is unknown. Cannot apply this change plan.'],
      };
    }

    // riskLevel === 'high' は警告
    if (plan.riskLevel === 'high') {
      warnings.push('This change has high risk. Please review carefully before applying.');
    }

    // error がある場合は適用不可
    if (plan.error) {
      return {
        canApply: false,
        warnings: [`Change plan has error: ${plan.error}`],
      };
    }

    return {
      canApply: true,
      warnings,
    };
  }
}

