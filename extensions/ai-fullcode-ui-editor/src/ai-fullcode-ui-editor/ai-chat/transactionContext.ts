/**
 * Transaction / Rollback（STEP2: 全部成功 or 全部戻す）
 *
 * apply 前に全ファイルのスナップショットを取得し、
 * 1 つでも失敗したら完全復元。UI は開かない（internal open）。
 */

import * as vscode from 'vscode';

export type FileSnapshot = {
  filePath: string;
  originalText: string;
};

export type TransactionContext = {
  snapshots: Map<string, FileSnapshot>;
};

/**
 * apply 前に必ず全ファイルのスナップショットを取る。
 * UI は一切開かず、Cursor と同じ「internal open」のみ。
 */
export async function beginTransaction(filePaths: string[]): Promise<TransactionContext> {
  const snapshots = new Map<string, FileSnapshot>();
  const unique = [...new Set(filePaths)].filter((p) => p.length > 0);

  for (const filePath of unique) {
    try {
      const uri = vscode.Uri.file(filePath);
      const doc = await vscode.workspace.openTextDocument(uri);
      snapshots.set(filePath, {
        filePath,
        originalText: doc.getText(),
      });
    } catch (err) {
      throw new Error(`スナップショット取得に失敗しました: ${filePath}`);
    }
  }

  return { snapshots };
}

/**
 * 保存していない状態でも完全復元。1 つでも失敗したら呼ぶ。
 */
export async function rollbackTransaction(tx: TransactionContext): Promise<void> {
  for (const snapshot of tx.snapshots.values()) {
    const uri = vscode.Uri.file(snapshot.filePath);
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(uri);
    } catch {
      continue;
    }
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
    edit.replace(uri, fullRange, snapshot.originalText);
    await vscode.workspace.applyEdit(edit);
  }
}
