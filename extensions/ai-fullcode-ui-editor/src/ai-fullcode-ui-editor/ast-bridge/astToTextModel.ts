/**
 * astManager → TextModel ブリッジ
 * 
 * Phase 2: エディタ統合
 * astManagerの変更を検知して、VSCode TextModelを更新します。
 */

import * as vscode from 'vscode';
import { astManager } from './astManager';

/**
 * astManagerからコードを取得してTextModelを更新
 *
 * 全文置換（差分ではなく全文を真実として扱う）
 * VSCode Undo Stackに統合されるため、Undo可能です。
 *
 * @param filePath ファイルパス
 * @param code コード内容
 */
export async function updateTextModelFromAST(filePath: string, code: string): Promise<void> {
  try {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document, { preserveFocus: true });
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    await editor.edit((editBuilder) => {
      editBuilder.replace(fullRange, code);
    });
  } catch (error) {
    throw error;
  }
}

/**
 * 行単位で変更範囲だけを検出し、最小の TextEdit を 1 つ返す。
 * 変更がなければ空配列。変更が全体のときは 1 つの replace（全文置換と等価）。
 */
export function computeMinimalTextEdits(
  originalText: string,
  newText: string
): vscode.TextEdit[] {
  if (originalText === newText) return [];
  const oldLines = originalText.split(/\r?\n/);
  const newLines = newText.split(/\r?\n/);
  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix++;
  }
  let suffix = 0;
  while (
    prefix + suffix < oldLines.length &&
    prefix + suffix < newLines.length &&
    oldLines[oldLines.length - 1 - suffix] === newLines[newLines.length - 1 - suffix]
  ) {
    suffix++;
  }
  const oldStartLine = prefix;
  const oldEndLine = Math.max(prefix, oldLines.length - suffix - 1);
  const startPos = new vscode.Position(oldStartLine, 0);
  const endPos =
    oldEndLine < oldLines.length
      ? new vscode.Position(oldEndLine, oldLines[oldEndLine].length)
      : new vscode.Position(oldStartLine, 0);
  const range = new vscode.Range(startPos, endPos);
  const replacement = newLines.slice(prefix, newLines.length - suffix).join('\n');
  return [vscode.TextEdit.replace(range, replacement)];
}

/**
 * 内部で open & apply & save（Cursor 同一: UI で開かなくてよい）
 * 既存: 全文置換。minimalDiff: true のときは変更範囲だけ TextEdit で適用する。
 */
export async function updateTextModelFromASTAndSave(
  filePath: string,
  code: string,
  options?: { minimalDiff?: boolean; originalCode?: string }
): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  const document = await vscode.workspace.openTextDocument(uri);
  const currentText = document.getText();
  const originalCode = options?.originalCode ?? currentText;
  const useMinimal = options?.minimalDiff === true && originalCode !== code;

  if (useMinimal) {
    const edits = computeMinimalTextEdits(originalCode, code);
    if (edits.length > 0) {
      const edit = new vscode.WorkspaceEdit();
      edit.set(uri, edits);
      const applied = await vscode.workspace.applyEdit(edit);
      if (!applied) {
        throw new Error(`Failed to apply minimal edit: ${filePath}`);
      }
    }
  } else {
    const fullRange = new vscode.Range(0, 0, Math.max(1, document.lineCount), 0);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(uri, fullRange, code);
    const applied = await vscode.workspace.applyEdit(edit);
    if (!applied) {
      throw new Error(`Failed to apply edit: ${filePath}`);
    }
  }
  await vscode.workspace.fs.writeFile(uri, Buffer.from(code, 'utf8'));
}

/**
 * astManagerからコードを取得
 * 
 * @param filePath ファイルパス
 * @returns コード内容
 */
export async function getCodeFromAST(filePath: string): Promise<string | null> {
  const file = astManager.getFile(filePath);
  if (!file) {
    return null;
  }
  
  return file.getFullText();
}

