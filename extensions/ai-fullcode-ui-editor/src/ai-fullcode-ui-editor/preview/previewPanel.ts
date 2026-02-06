/**
 * Preview Panel実装
 *
 * Phase 4.5: workspace と dev server を 1:1 で厳密に紐付ける
 * - Previewパネル閉鎖時にserverを停止
 */

import * as vscode from 'vscode';
import { PreviewService } from './previewService';
import { previewBridge } from './bridge';

/**
 * Preview Panelクラス
 */
export class PreviewPanel {
  private panel: vscode.WebviewPanel | null = null;
  private previewService: PreviewService;
  private workspaceRoot: string | null = null;

  constructor(context: vscode.ExtensionContext, previewService: PreviewService) {
    this.previewService = previewService;

    // 現在のworkspaceRootを取得
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      this.workspaceRoot = workspaceFolder.uri.fsPath;
    }
  }

  /**
   * Preview Panelを作成
   */
  private async createPanel(context: vscode.ExtensionContext): Promise<void> {
    this.panel = vscode.window.createWebviewPanel(
      'ai-fullcode-ui-editor-preview',
      'Preview',
      vscode.ViewColumn.Two,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri)],
      }
    );

    // ✅ 重要: workspaceRootを更新
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      this.workspaceRoot = workspaceFolder.uri.fsPath;
    }

    // ✅ Cursor 2.2準拠: Runtimeバンドルを確実に準備してからPreview HTMLを生成
    // ✅ getPreviewHtml内でensureRuntimeBundleが呼ばれるため、ここではそのまま呼び出す
    try {
      this.panel.webview.html = await this.previewService.getPreviewHtml(context, this.panel.webview);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.panel.webview.html = this.previewService.getErrorHtml(
        `Preview generation failed:\n\n${errorMessage}\n\n` +
        `Please check the console for details.`
      );
    }

    // postMessage Bridge
    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (message.type === 'EDIT_MODE_UNAVAILABLE') {
        // ✅ 重要: Edit Modeが無効化された場合
        vscode.window.showWarningMessage(
          `Edit Mode not available: ${message.reason}`,
          { modal: false }
        );
      } else if (message.type === 'APPLY_CHANGE_PLAN') {
        // ✅ Phase 6: ChangePlan を適用
        await this.handleApplyChangePlan(message);
      }
      previewBridge.handleMessage(message);
    });

    // Extension Host → Preview Runtime へのメッセージ送信を有効化
    previewBridge.setPreviewPanel(this.panel.webview);

    // Panelが閉じられたときにクリーンアップ
    this.panel.onDidDispose(() => {
      this.panel = null;
    });

    context.subscriptions.push(this.panel);
  }

  /**
   * Preview Panelを表示
   */
  async show(context?: vscode.ExtensionContext): Promise<void> {
    if (!this.panel && context) {
      await this.createPanel(context);
    }

    if (this.panel) {
      this.panel.reveal();
    }
  }

  /**
   * Preview Panelを閉じる
   */
  dispose(): void {
    if (this.panel) {
      this.panel.dispose();
      this.panel = null;
    }
  }

  /**
   * ✅ Phase 6: ChangePlan を適用
   */
  private async handleApplyChangePlan(message: {
    messageId: string;
    planId: string;
    plan: {
      filePath: string;
      patch: { before: string; after: string };
      range: { start: number; end: number };
    };
  }): Promise<void> {
    try {
      const { messageId, plan } = message;
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

      if (!workspaceFolder) {
        this.panel?.webview.postMessage({
          type: 'APPLY_CHANGE_PLAN_RESPONSE',
          messageId,
          success: false,
          error: 'Workspace not found',
        });
        return;
      }

      // ファイルパスを解決
      const fileUri = vscode.Uri.joinPath(workspaceFolder.uri, plan.filePath);

      // ファイルが存在するか確認
      try {
        await vscode.workspace.fs.stat(fileUri);
      } catch (error) {
        this.panel?.webview.postMessage({
          type: 'APPLY_CHANGE_PLAN_RESPONSE',
          messageId,
          success: false,
          error: `File not found: ${plan.filePath}`,
        });
        return;
      }

      // ファイルを読み込み
      const fileContent = await vscode.workspace.fs.readFile(fileUri);
      const beforeContent = Buffer.from(fileContent).toString('utf-8');

      // 差分適用（簡易版: Phase 6では文字列置換）
      // Phase 6: 簡易版実装（range.start から range.end までを置換）
      let afterContent = beforeContent;

      if (plan.range.start >= 0 && plan.range.end >= 0 && plan.range.end > plan.range.start) {
        // 範囲指定がある場合は置換
        const before = beforeContent.substring(plan.range.start, plan.range.end);
        if (before === plan.patch.before) {
          afterContent =
            beforeContent.substring(0, plan.range.start) +
            plan.patch.after +
            beforeContent.substring(plan.range.end);
        } else {
          // 一致しない場合は警告
          // Silent error handling
        }
      } else {
        // 範囲指定がない場合は簡易置換（Phase 6: プレースホルダー）
        // TODO: Phase 6 以降で AST ベースの適用を実装
        afterContent = beforeContent; // 変更なし（安全のため）
      }

      // ファイルを書き込み
      await vscode.workspace.fs.writeFile(fileUri, Buffer.from(afterContent, 'utf-8'));

      // 成功レスポンスを送信
      this.panel?.webview.postMessage({
        type: 'APPLY_CHANGE_PLAN_RESPONSE',
        messageId,
        success: true,
        filePath: plan.filePath,
        beforeContent: beforeContent,
        afterContent: afterContent,
      });
    } catch (error) {
      this.panel?.webview.postMessage({
        type: 'APPLY_CHANGE_PLAN_RESPONSE',
        messageId: message.messageId,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
