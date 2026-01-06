/**
 * Vite Dev Server統合（Vite Node API使用）
 *
 * Phase 2: TSXコードの動的読み込み
 * Vite Node API（createServer）を使用してVite Dev Serverを起動
 * 仮想モジュール（virtual:design-entry）を提供
 *
 * 設計方針:
 * - child_process.spawn を使用しない（VSCode Extension Host環境で動作しない）
 * - Vite Node API（createServer）を使用してプロセス内で起動
 * - @vitejs/plugin-react は使用しない（AI Preview Runtimeには不適切）
 * - Viteの組み込みJSX変換（esbuild）を使用
 * - HMR/Fast Refreshは不要（AI差分反映前提）
 */

import { createServer, InlineConfig, ViteDevServer, loadConfigFromFile } from 'vite';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';

/**
 * Vite Dev Server管理クラス
 *
 * Vite Node APIを使用してVite Dev Serverを起動・管理
 * 拡張機能内に完全に自己完結したPreview実装
 */
export class ViteServer {
  private server: ViteDevServer | null = null;
  private port = 5173;
  private isRunning = false;
  private extensionPath: string | null = null;

  /**
   * 拡張機能のパスを設定
   *
   * @param extensionPath VSCode拡張機能のパス（context.extensionPath）
   */
  setExtensionPath(extensionPath: string): void {
    this.extensionPath = extensionPath;
  }

  /**
   * Vite Dev Serverを起動
   *
   * Vite Node API（createServer）を使用してプロセス内で起動
   * @vitejs/plugin-reactは使用せず、Viteの組み込みJSX変換（esbuild）を使用
   * AI Preview Runtime向けの設計（HMR/Fast Refresh不要）
   *
   * @throws {Error} サーバーの起動に失敗した場合
   */
  async start(): Promise<number> {
    if (this.isRunning && this.server) {
      return this.port;
    }

    if (!this.extensionPath) {
      throw new Error('Extension path not set. Call setExtensionPath() first.');
    }

    try {
      // ✅ 新しいアーキテクチャ: 実際のプロジェクトのdev serverを起動
      // ワークスペースルートを取得
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('ワークスペースが開かれていません。プロジェクトを開いてからPreviewを起動してください。');
      }

      const workspaceRoot = workspaceFolder.uri.fsPath;

      // ✅ 新しいアーキテクチャ: 実際のプロジェクトのdev serverを起動
      // プロジェクトのvite.config.tsまたはnext.config.jsを読み込む
      // まず、プロジェクトの設定ファイルを確認
      const viteConfigPath = path.join(workspaceRoot, 'vite.config.ts');
      const viteConfigJsPath = path.join(workspaceRoot, 'vite.config.js');
      const nextConfigPath = path.join(workspaceRoot, 'next.config.js');
      const nextConfigTsPath = path.join(workspaceRoot, 'next.config.ts');

      let projectConfig: InlineConfig | null = null;

      // Viteプロジェクトの場合
      try {
        await fs.stat(viteConfigPath);
        // Vite設定ファイルを動的に読み込む
        const configModule = await import(viteConfigPath);
        projectConfig = typeof configModule.default === 'function'
          ? await configModule.default({ command: 'serve', mode: 'development' })
          : configModule.default;
      } catch {
        try {
          await fs.stat(viteConfigJsPath);
          const configModule = await import(viteConfigJsPath);
          projectConfig = typeof configModule.default === 'function'
            ? await configModule.default({ command: 'serve', mode: 'development' })
            : configModule.default;
        } catch {
        }
      }

      // ✅ InlineConfigを構築（プロジェクトの設定を優先）
      const inlineConfig: InlineConfig = {
        root: workspaceRoot, // ✅ ワークスペースルートをrootとして設定
        ...(projectConfig || {}), // プロジェクトの設定をマージ
        plugins: [
          // ✅ プロジェクトのプラグインを使用（存在する場合）
          ...(projectConfig?.plugins || []),
        ],
        esbuild: {
          jsx: 'automatic', // ✅ Viteの組み込みJSX変換（Fast Refreshなし）
          jsxImportSource: 'react',
        },
        server: {
          port: 0, // 自動割当
          strictPort: false,
          host: true,
          cors: true,
          hmr: false, // ✅ HMRを無効化（AI Preview Runtimeには不要）
        },
        optimizeDeps: {
          force: true, // ✅ 依存関係の最適化を強制（キャッシュを無効化）
          esbuildOptions: {
            jsx: 'automatic',
            jsxImportSource: 'react',
          },
        },
        resolve: {
          alias: {
            // ✅ プロジェクトのalias設定を優先（存在する場合）
            ...(projectConfig?.resolve?.alias as Record<string, string> || {}),
            // Next.jsスタブは拡張機能内から提供（プロジェクトにない場合のみ）
            ...(this.extensionPath ? {
              'next/link': (projectConfig?.resolve?.alias as Record<string, string>)?.['next/link'] || path.join(this.extensionPath, 'src', 'preview', 'stubs', 'next-link.tsx'),
              'next/image': (projectConfig?.resolve?.alias as Record<string, string>)?.['next/image'] || path.join(this.extensionPath, 'src', 'preview', 'stubs', 'next-image.tsx'),
            } : {}),
          },
        },
        build: {
          // ✅ プロジェクトのbuild設定を優先
          ...(projectConfig?.build || {}),
          sourcemap: true,
        },
      };

      // Vite Dev Serverを作成
      this.server = await createServer(inlineConfig);

      // サーバーを起動
      await this.server.listen();

      // 実際のポート番号を取得
      // server.listen()の戻り値から取得、またはconfigから取得
      const serverAddress = this.server.httpServer?.address();
      if (serverAddress && typeof serverAddress === 'object' && 'port' in serverAddress) {
        const actualPort = serverAddress.port;
        if (typeof actualPort === 'number') {
          this.port = actualPort;
        }
      } else {
        // フォールバック: configから取得
        const serverConfig = this.server.config.server;
        if (serverConfig && typeof serverConfig === 'object' && 'port' in serverConfig) {
          const configPort = serverConfig.port;
          if (typeof configPort === 'number') {
            this.port = configPort;
          }
        }
      }

      this.isRunning = true;

      return this.port;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;
      console.error('[ViteServer] ❌ 起動エラー:', errorMessage);
      if (errorStack) {
        console.error('[ViteServer] エラースタック:', errorStack);
      }
      this.isRunning = false;
      this.server = null;
      throw new Error(`Vite Dev Serverの起動に失敗しました: ${errorMessage}`);
    }
  }

  /**
   * Vite Dev Serverを停止
   *
   * @throws {Error} サーバーの停止に失敗した場合
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    try {
      await this.server.close();
      this.server = null;
      this.isRunning = false;
      this.port = 5173; // デフォルトポートにリセット
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[ViteServer] ❌ 停止エラー:', errorMessage);
      this.server = null;
      this.isRunning = false;
      throw new Error(`Vite Dev Serverの停止に失敗しました: ${errorMessage}`);
    }
  }

  /**
   * Vite Dev ServerのURLを取得
   *
   * @returns Vite Dev ServerのURL
   * @throws {Error} サーバーが起動していない場合
   */
  getUrl(): string {
    if (!this.isRunning || !this.server) {
      throw new Error('Vite Dev Serverが起動していません。start()を呼び出してからgetUrl()を呼び出してください。');
    }
    return `http://localhost:${this.port}`;
  }

  /**
   * Vite Dev Serverが起動中かどうか
   *
   * @returns 起動中の場合true
   */
  isServerRunning(): boolean {
    return this.isRunning && this.server !== null;
  }

  /**
   * Vite Dev Serverインスタンスを取得（内部使用）
   *
   * @returns ViteDevServerインスタンス
   */
  getServer(): ViteDevServer | null {
    return this.server;
  }
}

// シングルトンインスタンスをエクスポート
export const viteServer = new ViteServer();
