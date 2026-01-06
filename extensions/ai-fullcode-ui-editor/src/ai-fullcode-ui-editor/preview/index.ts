/**
 * Preview統合
 *
 * Phase 4.5: workspace と dev server を 1:1 で厳密に紐付ける
 * - workspace切替時に前のworkspaceのserverを停止
 * - Previewパネル閉鎖時にserverを停止
 */

import * as vscode from 'vscode';
import { PreviewPanel } from './previewPanel';
import { previewService } from './previewService';
import { previewBridge } from './bridge';

let previewPanel: PreviewPanel | null = null;
let currentWorkspaceRoot: string | null = null;

/**
 * Preview統合を初期化
 */
export function initPreview(context: vscode.ExtensionContext): void {
  // Preview Panelを表示するコマンドを登録
  registerPreviewCommands(context);

  // workspace切替イベントを購読
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
      // Previewパネルを閉じる
      if (previewPanel) {
        previewPanel.dispose();
        previewPanel = null;
      }
      currentWorkspaceRoot = null;
    })
  );
}

/**
 * Preview Panelを表示するコマンドを登録
 */
function registerPreviewCommands(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.preview.show', async () => {
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showWarningMessage('ワークスペースが開かれていません。');
          return;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;

        // ✅ 重要: workspaceが切り替わった場合はPreviewパネルを再作成
        if (currentWorkspaceRoot && currentWorkspaceRoot !== workspaceRoot) {
          console.log(`[Preview] workspace changed: ${currentWorkspaceRoot} -> ${workspaceRoot}`);

          // Previewパネルを閉じる
          if (previewPanel) {
            previewPanel.dispose();
            previewPanel = null;
          }
        }

        currentWorkspaceRoot = workspaceRoot;

        // Preview Panelが存在しない場合は作成
        if (!previewPanel) {
          previewPanel = new PreviewPanel(context, previewService);
        }

        // Preview Panelを表示
        await previewPanel.show(context);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`Preview起動エラー: ${errorMessage}`);
        console.error('[Preview] Preview起動エラー:', error);
      }
    })
  );
}

/**
 * Preview Panelを取得
 */
export function getPreviewPanel(): PreviewPanel | null {
  return previewPanel;
}

// 各モジュールをエクスポート
export { PreviewPanel } from './previewPanel';
export { PreviewService, previewService } from './previewService';
export { PreviewBridge, previewBridge } from './bridge';
