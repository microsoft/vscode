/**
 * DiffPreviewEngine.ts
 *
 * ChangePlan を差分として可視化する。
 *
 * 要件:
 * - unified diff 形式 or before/after 並列表示
 * - ファイル名・行番号を必ず表示
 * - Preview DOM を一切変更しない
 * - 差分は UI操作と完全に分離されたレイヤーで表示
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 */

import type { ChangePlan } from './ChangePlan';

/**
 * ChangePlan を unified diff 形式の文字列に変換する
 *
 * 実装例（JavaScript文字列として生成される）:
 * ```javascript
 * function formatChangePlanAsDiff(changePlan) {
 *   if (changePlan.error) {
 *     return 'Error: ' + changePlan.error;
 *   }
 *
 *   const lines = [];
 *   lines.push('--- ' + changePlan.filePath + ' (before)');
 *   lines.push('+++ ' + changePlan.filePath + ' (after)');
 *   lines.push('@@ -' + changePlan.range.start + ' +' + changePlan.range.end + ' @@');
 *   lines.push('- ' + changePlan.patch.before);
 *   lines.push('+ ' + changePlan.patch.after);
 *
 *   return lines.join('\\n');
 * }
 * ```
 */
export function formatChangePlanAsDiff(changePlan: ChangePlan): string {
  // この実装は使用されません（設計ドキュメントのみ）
  // 実際の実装は previewService.ts 内でJavaScript文字列として生成されます
  throw new Error('This function is a design document only. Actual implementation is in previewService.ts');
}

/**
 * ChangePlan を before/after 並列表示形式に変換する
 */
export function formatChangePlanAsSideBySide(changePlan: ChangePlan): {
  before: string;
  after: string;
  filePath: string;
  riskLevel: string;
} {
  // この実装は使用されません（設計ドキュメントのみ）
  // 実際の実装は previewService.ts 内でJavaScript文字列として生成されます
  throw new Error('This function is a design document only. Actual implementation is in previewService.ts');
}

