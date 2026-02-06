/**
 * Phase D: 計画取得→適用を一括実行するコマンド（Cursor 同一）
 *
 * Plan Store + Agent Controller 経由。Chat は表示だけ。apply は state 駆動。
 */

import * as vscode from 'vscode';
import { runAgentInstruction, applyCurrentPlan } from './agentController';
import { clearCurrentPlan } from './planStore';
import { undoLastChange, hasUndo } from './undoStack';

const COMMAND_ID = 'ai-fullcode-ui-editor.applyAiPlan';
const COMMAND_APPLY_PLAN = 'ai-fullcode-ui-editor.applyPlan';
const COMMAND_CANCEL_PLAN = 'ai-fullcode-ui-editor.cancelPlan';
const COMMAND_UNDO_LAST = 'ai-fullcode-ui-editor.undoLastChange';

export type RunApplyPlanResult =
  | { success: true; opCount: number; reasoning?: string }
  | { success: false; opCount: number; error?: string; cancelled?: boolean };

/**
 * 指示から編集対象を確定し、計画を取得して適用する。コマンド・チャット両方から利用。
 * 内部は runAgentInstruction（state 保存）→ applyCurrentPlan（確認 UI → 適用 → clear）。
 */
export async function runApplyPlan(instruction: string): Promise<RunApplyPlanResult> {
  const step1 = await runAgentInstruction(instruction);
  if (!step1.ok) {
    return { success: false, opCount: 0, error: step1.error };
  }
  return applyCurrentPlan();
}

/**
 * コマンド「AI Fullcode: 指示から計画を取得して適用」を登録する
 */
export function registerApplyPlanCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_ID, async () => {
      const instruction = await vscode.window.showInputBox({
        title: 'AI Fullcode: 指示を入力',
        prompt: '例: ボタンを追加して / ヘッダーのタイトルを変更して（対象ファイルは自動で特定します）',
        placeHolder: 'UI 操作の指示を入力',
      });
      if (instruction === undefined || instruction.trim() === '') {
        return;
      }
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: 'AI Fullcode: 対象を特定・計画取得・適用中…',
          },
          async () => {
            const result = await runApplyPlan(instruction.trim());
            if (!result.success && result.cancelled) return;
            if (result.success) {
              void vscode.window.showInformationMessage(
                `AI Fullcode: ${result.opCount} 件の操作を適用しました。`
              );
            } else if (result.opCount === 0) {
              void vscode.window.showInformationMessage(
                `計画を取得しましたが、操作は 0 件です。${result.error ?? ''}`
              );
            } else {
              void vscode.window.showErrorMessage(`[AI Fullcode] 適用に失敗しました: ${result.error ?? '不明なエラー'}`);
            }
          }
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        void vscode.window.showErrorMessage(`[AI Fullcode] ${msg}`);
      }
    })
  );
}

/**
 * STEP3: 確認あり apply / やめる / 元に戻す コマンドを登録
 */
export function registerPlanConfirmCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(COMMAND_APPLY_PLAN, async () => {
      const result = await applyCurrentPlan(true);
      if (result.success) {
        void vscode.window.showInformationMessage(`AI Fullcode: ${result.opCount} 件の操作を適用しました。`);
      } else {
        void vscode.window.showErrorMessage(`[AI Fullcode] ${result.error ?? '適用に失敗しました'}`);
      }
    }),
    vscode.commands.registerCommand(COMMAND_CANCEL_PLAN, () => {
      clearCurrentPlan();
      void vscode.window.showInformationMessage('AI Fullcode: 計画をやめました。');
    }),
    vscode.commands.registerCommand(COMMAND_UNDO_LAST, async () => {
      const done = await undoLastChange();
      if (done) {
        void vscode.window.showInformationMessage('AI Fullcode: 直前の変更を元に戻しました。');
      } else {
        void vscode.window.showInformationMessage('AI Fullcode: 元に戻す変更がありません。');
      }
    })
  );
}

export { hasUndo };
