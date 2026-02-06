/**
 * Preview Service（Cursor方式）
 *
 * iframeを完全に廃止し、同一プロセス内でアプリを直接マウント
 * - コードが唯一のSource of Truth
 * - UI操作 = AST操作（直接コード編集）
 */

import * as vscode from 'vscode';
import { buildPreviewHtml } from './html/buildPreviewHtml';
import { escapeScriptCloseTag } from './html/escape';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

/**
 * Preview Serviceクラス
 */
export class PreviewService {
  /**
   * Preview HTMLを生成（Cursor方式）
   *
   * DesignSurfaceを直接描画する。
   * iframe関連コードは完全に存在しない。
   *
   * ✅ Cursor 2.2準拠: Runtimeバンドルを確実に準備してからPreviewを生成
   */
  async getPreviewHtml(context?: vscode.ExtensionContext, webview?: vscode.Webview): Promise<string> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return this.getErrorHtml('ワークスペースが開かれていません。');
    }

    if (!context || !webview) {
      return this.getErrorHtml('Preview context or webview is missing.');
    }

    const workspaceRoot = workspaceFolder.uri.fsPath;

    // ✅ Cursor 2.2準拠: Runtimeバンドルを確実に準備
    try {
      this.ensureRuntimeBundle(context);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return this.getErrorHtml(
        `Runtime bundle preparation failed:\n\n${errorMessage}\n\n` +
        `Please run 'npm run build:runtime' and try again.`
      );
    }

    // ✅ Phase 1-2: PlaceholderAppでOK
    // 実プロジェクトの接続は別フェーズ（Phase 2.5）で行う
    return this.getDesignSurfaceHtml(webview, context);
  }

  /**
   * Runtimeバンドルを確実に準備
   * ✅ Cursor 2.2準拠: ビルド時に生成されることを前提とするが、存在しない場合はビルドを実行
   */
  private ensureRuntimeBundle(context: vscode.ExtensionContext): void {
    const extensionPath = context.extensionPath;
    const runtimePath = path.join(extensionPath, 'out', 'ai-fullcode-ui-editor', 'preview', 'runtime', 'runtime.js');

    // ✅ Runtimeバンドルが存在するか確認
    if (!fs.existsSync(runtimePath)) {
      try {
        // ✅ ビルドスクリプトを実行
        const buildScriptPath = path.join(extensionPath, 'scripts', 'build-runtime.js');
        execSync(`node "${buildScriptPath}"`, {
          cwd: extensionPath,
          stdio: 'inherit',
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to build runtime bundle:\n${errorMessage}\n\n` +
          `Please run 'npm run build:runtime' manually.`
        );
      }
    }

    // ✅ ビルド後も存在しない場合はエラー
    if (!fs.existsSync(runtimePath)) {
      throw new Error(
        `Runtime bundle not found after build: ${runtimePath}\n\n` +
        `Please check the build output and try again.`
      );
    }
  }

  /**
   * エラーHTMLを生成
   * ✅ Cursor 2.2準拠: エラーメッセージを明確に表示
   */
  getErrorHtml(message: string): string {
    return `
      <!DOCTYPE html>
      <html lang="ja">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>プレビュー</title>
          <style>
            body {
              margin: 0;
              padding: 40px;
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              background: #1e1e1e;
              color: #cccccc;
              display: flex;
              align-items: center;
              justify-content: center;
              height: 100vh;
            }
            .error {
              text-align: center;
            }
            .error h2 {
              color: #f48771;
              margin-bottom: 10px;
            }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>Preview Error</h2>
            <p>${message}</p>
          </div>
        </body>
      </html>
    `;
  }

  /**
   * DesignSurface HTMLを生成
   *
   * React（CDN）を読み込み、DesignSurfaceコンポーネントを直接描画する。
   * iframeは一切使用しない。
   *
   * ✅ Phase 1-2: PlaceholderAppでOK
   * 実プロジェクトの接続は別フェーズ（Phase 2.5）で行う
   * ✅ Cursor 2.2準拠: webview.asWebviewUri で Runtime を読み込む
   */
  private getDesignSurfaceHtml(webview: vscode.Webview, context: vscode.ExtensionContext): string {
    // ✅ 新しい構造: buildPreviewHtml を使用（Cursor 2.2準拠: webview.asWebviewUri）
    return buildPreviewHtml(webview, context);
  }
}

/**
 * Preview Serviceインスタンス
 */
export const previewService = new PreviewService();


