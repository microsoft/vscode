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
    
    // 全文置換（差分ではなく全文を真実として扱う）
    const fullRange = new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length)
    );
    
    const success = await editor.edit((editBuilder) => {
      editBuilder.replace(fullRange, code);
    });
    
    if (!success) {
      console.error('[AstToTextModel] TextModel更新に失敗:', filePath);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AstToTextModel] TextModel更新エラー:', errorMessage);
    throw error;
  }
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

