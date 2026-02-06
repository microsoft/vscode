/**
 * コード適用（Phase D: AI 計画の適用）
 *
 * STEP2: 全部成功したときだけ commit、1 つでも失敗したら完全 rollback。
 * AIが生成した操作を既存の UI 操作ロジック（handleUIOperation）で適用する。
 */

import * as vscode from 'vscode';
import { astManager } from '../ast-bridge/astManager';
import { handleUIOperation } from '../ui-operation/operationHandler';
import { beginTransaction, rollbackTransaction } from './transactionContext';
import type { FileSnapshot } from './transactionContext';
import type { AIOperationPlan } from './mcpBridge';
import type { CurrentPlan } from './planStore';

const USER_FACING_ROLLBACK_MESSAGE =
  '変更の途中で問題が発生したため、元の状態に戻しました。';

/** STEP3: 非エンジニア向け Preview 用。実ファイルは触らない */
export type PlanPreview = {
  summary: string;
  filePreviews: { filePath: string; before: string; after: string }[];
};

export type ApplyOptions = {
  /** 保存せずメモリのみ更新し、updatedCode を返す（プレビュー用） */
  dryRun?: boolean;
};

/**
 * AIが生成した操作を適用
 *
 * @param filePath ファイルパス
 * @param operations 操作列
 * @param projectId プロジェクトID（永続ストレージ保存用）
 * @param options dryRun: true なら保存せず updatedCode を返す
 */
export async function applyAIGeneratedOperations(
  filePath: string,
  operations: unknown[],
  projectId?: string,
  options?: ApplyOptions
): Promise<{ success: boolean; error?: string; updatedCode?: string }> {
  try {
    for (const operation of operations) {
      const op = operation as Record<string, unknown> & { filePath?: string };
      const targetPath = (op.filePath && String(op.filePath).trim() !== '') ? op.filePath : filePath;
      op.filePath = targetPath;
      const result = await handleUIOperation(targetPath, operation, projectId, {
        dryRun: options?.dryRun,
      });
      if (!result.success) {
        throw new Error(result.error ?? 'Operation failed');
      }
    }
    if (options?.dryRun) {
      const file = astManager.getFile(filePath);
      const updatedCode = file ? file.getFullText() : undefined;
      return { success: true, updatedCode };
    }
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * ファイルの現在内容をエディタから取得し astManager に読み込む
 * @param forceReload true のとき必ずディスクから再読込（Preview 後の Apply で使用）
 */
async function ensureFileLoadedInAst(filePath: string, forceReload = false): Promise<void> {
  if (!forceReload && astManager.getFile(filePath)) {
    return;
  }
  try {
    const uri = vscode.Uri.file(filePath);
    const doc = await vscode.workspace.openTextDocument(uri);
    astManager.loadFile(filePath, doc.getText());
  } catch {
    throw new Error(`Could not load file for AI apply: ${filePath}`);
  }
}

/**
 * transaction 対象ファイル一覧を収集（primary + secondary + operations で参照されたもの）
 */
function collectTransactionFiles(
  primaryFile: string,
  secondaryFiles: string[],
  plan: AIOperationPlan
): string[] {
  const fromOps = (plan.operations ?? []).map(
    (op) => (op.filePath && String(op.filePath).trim()) || primaryFile
  );
  return [...new Set([primaryFile, ...secondaryFiles, ...fromOps])].filter((p) => p.length > 0);
}

/**
 * AI操作計画を適用（STEP2: transaction / rollback）
 *
 * primary + secondary を snapshot → 全 op 適用（dryRun）→ 問題なければ commit（保存）。
 * 1 つでも失敗したら rollback し、ユーザー向けメッセージを throw。
 */
export type ApplyPlanResult =
  | { success: true; snapshotsForUndo: FileSnapshot[] }
  | { success: false; error: string };

export async function applyAIOperationPlan(
  primaryFile: string,
  secondaryFiles: string[],
  plan: AIOperationPlan,
  projectId?: string
): Promise<ApplyPlanResult> {
  const allFiles = collectTransactionFiles(primaryFile, secondaryFiles, plan);
  const tx = await beginTransaction(allFiles);

  try {
    for (const filePath of allFiles) {
      await ensureFileLoadedInAst(filePath, true);
    }
    const result = await applyAIGeneratedOperations(primaryFile, plan.operations, projectId, {
      dryRun: true,
    });
    if (!result.success) {
      throw new Error(result.error ?? 'Apply failed');
    }
    for (const filePath of allFiles) {
      const file = astManager.getFile(filePath);
      if (!file) continue;
      const text = file.getFullText();
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(uri, new vscode.Range(0, 0, doc.lineCount, 0), text);
      const ok = await vscode.workspace.applyEdit(edit);
      if (!ok) throw new Error(`Failed to write: ${filePath}`);
    }
    for (const filePath of allFiles) {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      await doc.save();
    }
    return { success: true, snapshotsForUndo: Array.from(tx.snapshots.values()) };
  } catch (err) {
    await rollbackTransaction(tx);
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`${USER_FACING_ROLLBACK_MESSAGE} ${msg}`);
  }
}

/**
 * STEP3: Preview 専用。実ファイルは触れず、dryRun で before/after を返す。
 * Preview と Apply が同じロジックになる。
 */
export async function buildPlanPreview(plan: CurrentPlan): Promise<PlanPreview> {
  const files = collectTransactionFiles(
    plan.targetFilePath,
    plan.secondaryFiles,
    plan.plan
  );
  for (const filePath of files) {
    await ensureFileLoadedInAst(filePath);
  }
  const beforeMap = new Map<string, string>();
  for (const filePath of files) {
    const file = astManager.getFile(filePath);
    beforeMap.set(filePath, file ? file.getFullText() : '');
  }
  const result = await applyAIGeneratedOperations(
    plan.targetFilePath,
    plan.plan.operations,
    undefined,
    { dryRun: true }
  );
  if (!result.success) {
    throw new Error(result.error ?? 'Preview の生成に失敗しました。');
  }
  const filePreviews = files.map((filePath) => ({
    filePath,
    before: beforeMap.get(filePath) ?? '',
    after: astManager.getFile(filePath)?.getFullText() ?? '',
  }));
  return { summary: plan.summary, filePreviews };
}

/**
 * 適用を実行せずに更新後のコードを取得（プレビュー・diff 用）
 */
export async function getPlanPreview(
  filePath: string,
  plan: AIOperationPlan,
  projectId?: string
): Promise<{ originalCode: string; updatedCode: string; success: boolean; error?: string }> {
  await ensureFileLoadedInAst(filePath);
  const file = astManager.getFile(filePath);
  const originalCode = file ? file.getFullText() : '';
  const result = await applyAIGeneratedOperations(filePath, plan.operations, projectId, {
    dryRun: true,
  });
  const updatedCode = result.updatedCode ?? originalCode;
  return {
    originalCode,
    updatedCode,
    success: result.success,
    error: result.error,
  };
}

