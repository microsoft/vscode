/**
 * Undo Stack（STEP3: 非エンジニア向け「元に戻す」）
 *
 * Undo = rollback を保存しておく。Git 不要。1 手前から開始。
 */

import * as vscode from 'vscode';
import type { FileSnapshot } from './transactionContext';

export type UndoSnapshot = {
  id: string;
  snapshots: FileSnapshot[];
  createdAt: number;
};

const undoStack: UndoSnapshot[] = [];

export function pushUndoSnapshot(snapshots: FileSnapshot[]): void {
  if (snapshots.length === 0) return;
  undoStack.push({
    id: `undo-${Date.now()}`,
    snapshots: [...snapshots],
    createdAt: Date.now(),
  });
}

export async function undoLastChange(): Promise<boolean> {
  const snapshot = undoStack.pop();
  if (!snapshot) return false;

  for (const s of snapshot.snapshots) {
    const uri = vscode.Uri.file(s.filePath);
    let doc: vscode.TextDocument;
    try {
      doc = await vscode.workspace.openTextDocument(uri);
    } catch {
      continue;
    }
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(0, 0, doc.lineCount, 0);
    edit.replace(uri, fullRange, s.originalText);
    await vscode.workspace.applyEdit(edit);
    await doc.save();
  }
  return true;
}

export function hasUndo(): boolean {
  return undoStack.length > 0;
}
