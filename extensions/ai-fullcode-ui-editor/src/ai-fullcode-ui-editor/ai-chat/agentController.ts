/**
 * Agent Controller（Cursor 同一の責務分割）
 *
 * - runAgentInstruction: 特定 → 計画生成 → state に保存 → 要約だけ返す
 * - applyCurrentPlan: state から取得 → 確認 UI → 適用 → clear
 * Chat は表示だけ。Plan/Apply はここと planStore で完結。
 */

import * as vscode from 'vscode';
import { resolveTargetAndGetPlan } from './mcpBridge';
import { applyAIOperationPlan, getPlanPreview } from './codeApplier';
import { pushUndoSnapshot } from './undoStack';
import { emitUxEvent } from './uxEvents';
import { explainPlanAsText } from './explainPlan';
import { generateUnifiedDiff } from './diffPreview';
import { getCurrentPlan, setCurrentPlan, clearCurrentPlan } from './planStore';

/** STEP3: Chat followup「適用する」で渡す prompt */
export const PROMPT_APPLY = '__apply__';
/** STEP3: Chat followup「やめる」で渡す prompt */
export const PROMPT_CANCEL = '__cancel__';
/** STEP3: Preview 表示後の followup を出すための metadata キー */
export const METADATA_NEEDS_CONFIRM = 'aiFullcodeNeedsConfirm';

export type RunAgentInstructionResult =
  | { ok: true; summary: string }
  | { ok: false; error: string };

export type ApplyCurrentPlanResult =
  | { success: true; opCount: number; reasoning?: string }
  | { success: false; opCount: number; error?: string; cancelled?: boolean };

/**
 * ① 特定（embedding + repoMap）→ ② 計画生成（LLM）→ ③ state に保存 → ④ 人間向け要約だけ返す
 */
export async function runAgentInstruction(instruction: string): Promise<RunAgentInstructionResult> {
  const { plan, targetFilePath, secondaryFiles } = await resolveTargetAndGetPlan(instruction);
  const opCount = plan.operations?.length ?? 0;

  emitUxEvent({ type: 'plan', detail: explainPlanAsText(plan), done: true });
  if (plan.reasoning?.trim()) {
    emitUxEvent({ type: 'reason', detail: plan.reasoning.trim().slice(0, 200), done: true });
  }

  if (opCount === 0) {
    emitUxEvent({ type: 'cancelled', detail: '操作が 0 件のためスキップしました', done: true });
    return { ok: false, error: plan.reasoning ?? '操作が 0 件です。' };
  }

  const summary = explainPlanAsText(plan);
  setCurrentPlan({
    id: `plan-${Date.now()}`,
    targetFilePath,
    secondaryFiles: secondaryFiles ?? [],
    plan,
    summary,
    createdAt: Date.now(),
  });
  return { ok: true, summary };
}

/**
 * state から計画を取得し、確認 UI（省略可）→ 適用 → clear。apply は Chat を経由しない。
 * @param skipConfirmUi true のとき diff/QuickPick を出さずにそのまま適用（Chat で Preview 表示済みのとき）
 */
export async function applyCurrentPlan(skipConfirmUi = false): Promise<ApplyCurrentPlanResult> {
  const current = getCurrentPlan();
  if (!current) {
    return { success: false, opCount: 0, error: '適用する計画がありません。' };
  }

  const { plan, targetFilePath } = current;
  const opCount = plan.operations?.length ?? 0;

  if (plan.requiresConfirmation) {
    const choice = await vscode.window.showWarningMessage(
      `この計画は ${opCount} 件の操作を含みます。実行しますか？`,
      { modal: true },
      '実行',
      'キャンセル'
    );
    if (choice !== '実行') {
      emitUxEvent({ type: 'cancelled', detail: 'ユーザーがキャンセルしました', done: true });
      return { success: false, opCount, cancelled: true };
    }
  }

  if (!skipConfirmUi) {
    const preview = await getPlanPreview(targetFilePath, plan);
    if (!preview.success) {
      emitUxEvent({ type: 'error', detail: preview.error ?? 'プレビューに失敗しました', done: true });
      return { success: false, opCount, error: preview.error };
    }
    generateUnifiedDiff(preview.originalCode, preview.updatedCode, targetFilePath);
    emitUxEvent({ type: 'preview', detail: `差分プレビュー: ${targetFilePath}`, done: true });
    const leftDoc = await vscode.workspace.openTextDocument({
      content: preview.originalCode,
      language: 'typescriptreact',
    });
    const rightDoc = await vscode.workspace.openTextDocument({
      content: preview.updatedCode,
      language: 'typescriptreact',
    });
    const title = `Preview: ${targetFilePath.replace(/^.*\//, '')}`;
    await vscode.commands.executeCommand('vscode.diff', leftDoc.uri, rightDoc.uri, title);
    const action = await vscode.window.showQuickPick(
      [
        { label: '適用', description: '変更をファイルに反映する' },
        { label: 'キャンセル', description: '変更を破棄する' },
      ],
      { title: 'AI Fullcode: この変更を適用しますか？', placeHolder: '適用 / キャンセル' }
    );
    if (action?.label !== '適用') {
      emitUxEvent({ type: 'cancelled', detail: 'ユーザーがキャンセルしました', done: true });
      return { success: false, opCount, cancelled: true };
    }
  }

  const result = await applyAIOperationPlan(
    targetFilePath,
    current.secondaryFiles ?? [],
    plan
  );
  if (result.success) {
    pushUndoSnapshot(result.snapshotsForUndo);
    emitUxEvent({ type: 'applied', detail: `${opCount} 件の操作を適用しました`, done: true });
    clearCurrentPlan();
    return { success: true, opCount, reasoning: plan.reasoning };
  }
  emitUxEvent({ type: 'error', detail: result.error ?? '適用に失敗しました', done: true });
  return { success: false, opCount, error: result.error };
}
