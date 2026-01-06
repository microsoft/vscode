/**
 * Design Entry Sync
 *
 * Phase 4: エディタ変更 → 永続ストレージ保存のみ
 * design-entry.tsxはregistry方式で固定されているため、自動更新は行わない
 * カタログ選択時のみPreview Runtimeに通知
 */

import * as vscode from 'vscode';
import { saveFile } from './projectStorageAdapter';
import * as path from 'path';

/**
 * Design Entry Syncを初期化
 *
 * TextModel変更を監視して永続ストレージに保存します。
 * design-entry.tsxはregistry方式で固定されているため、自動更新は行いません。
 *
 * @param context VSCode拡張機能コンテキスト
 * @param projectId プロジェクトID（デフォルト: 'default'）
 */
export function initDesignEntrySync(
  context: vscode.ExtensionContext,
  projectId: string = 'default'
): void {

  // ワークスペースルートを取得（プロジェクト相対パスに変換するため）
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const workspaceRoot = workspaceFolders && workspaceFolders.length > 0
    ? workspaceFolders[0].uri.fsPath
    : undefined;

  // TextModel変更を監視（永続ストレージ保存のみ）
  const disposable = vscode.workspace.onDidChangeTextDocument(async (event) => {
    const { document } = event;

    // TSXファイルの変更のみ処理
    if (document.languageId !== 'typescriptreact' && document.languageId !== 'typescript') {
      return;
    }

    // ファイルパスを取得
    const filePath = document.uri.fsPath;

    // ワークスペース外のファイルは無視
    if (workspaceRoot && !filePath.startsWith(workspaceRoot)) {
      return;
    }

    // プロジェクト相対パスに変換
    // 例: /Users/.../workspace/app/page.tsx → /app/page.tsx
    const relativePath = workspaceRoot
      ? '/' + path.relative(workspaceRoot, filePath).replace(/\\/g, '/')
      : filePath;

    // design-entry.tsx自体の変更は無視（無限ループ防止）
    if (relativePath.includes('__runtime__/design-entry.tsx') ||
        relativePath.includes('design-entry.tsx') ||
        relativePath.includes('catalog/uiCatalog.ts')) {
      return;
    }

    try {
      // Phase 4: 永続ストレージに保存するだけ（design-entry.tsxは更新しない）
      const fileContent = document.getText();
      await saveFile(projectId, relativePath, fileContent);

      // design-entry.tsxはregistry方式で固定されているため、更新は不要
      // カタログ選択時のみPreview Runtimeに通知される
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[DesignEntrySync] ❌ 永続ストレージ保存エラー: ${errorMessage}`);
      // エラーが発生しても処理は続行（ユーザー体験を損なわない）
    }
  });

  // コンテキストに登録（拡張機能の無効化時に自動的に破棄される）
  context.subscriptions.push(disposable);

}

/**
 * Design Entry Managerを取得（外部から使用する場合）
 *
 * @param projectId プロジェクトID
 * @returns DesignEntryManagerインスタンス
 */
export async function getDesignEntryManager(projectId: string = 'default'): Promise<any> {
  const { DesignEntryManager } = await import('./designEntryManager');
  return new DesignEntryManager(projectId);
}

