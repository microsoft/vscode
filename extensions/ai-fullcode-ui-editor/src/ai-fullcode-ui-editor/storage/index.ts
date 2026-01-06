/**
 * Storage統合
 *
 * Phase 2: ストレージ層
 * VSCode FS API ↔ projectStorage.ts ブリッジ
 */

import * as vscode from 'vscode';
import { ProjectFileSystemProvider } from './fileSystemBridge';
import { initDesignEntrySync } from './designEntrySync';
import { CatalogManager } from './catalogManager';

/**
 * Storage統合を初期化
 *
 * VSCode FS APIとprojectStorage.tsをブリッジします。
 *
 * @param context VSCode拡張機能コンテキスト
 * @param projectId プロジェクトID（デフォルト: 'default'）
 */
/**
 * design-entry.tsxを初期生成（registry方式）
 *
 * ⚠️ 新しいアーキテクチャ: design-entry.tsxは不要
 * 実際のdev serverを直接表示するため、この関数は無効化
 *
 * @param projectId プロジェクトID
 */
async function initializeDesignEntry(projectId: string): Promise<void> {
  // ✅ 新しいアーキテクチャ: design-entry.tsxは不要
  // 実際のdev serverを直接表示するため、この処理はスキップ
  return;
}

// ✅ CatalogManagerをグローバルに保持（workspace切替時にアクセス可能にする）
let globalCatalogManager: CatalogManager | null = null;

export function initStorage(context: vscode.ExtensionContext, projectId: string = 'default'): void {
  try {
    const fileSystemProvider = new ProjectFileSystemProvider(projectId);

    // VSCode FS APIに登録
    const disposable = vscode.workspace.registerFileSystemProvider('project', fileSystemProvider, {
      isCaseSensitive: true,
    });

    // コンテキストに登録（拡張機能の無効化時に自動的に破棄される）
    context.subscriptions.push(disposable);


    // 動作確認用コマンドを登録
    registerStorageCommands(context);

    // Phase 3: Design Entry Syncを初期化
    initDesignEntrySync(context, projectId);

    // Phase 4: Catalog Managerを初期化
    globalCatalogManager = new CatalogManager(projectId);
    globalCatalogManager.init(context);
    // ✅ workspace切替イベントはCatalogManager.init()内で購読される

    // Phase 4: design-entry.tsxを初期生成（registry方式）
    initializeDesignEntry(projectId).catch(error => {
      console.error('[Storage] Failed to initialize design-entry.tsx:', error);
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[Storage] 初期化エラー:', errorMessage);
    throw error;
  }
}

// 各モジュールをエクスポート
export { loadFile, saveFile, checkFileExists, listFiles } from './projectStorageAdapter';
export { ProjectFileSystemProvider } from './fileSystemBridge';
export { DesignEntryManager } from './designEntryManager';
export { initDesignEntrySync, getDesignEntryManager } from './designEntrySync';
export { CatalogManager } from './catalogManager';
export { DesignEntryBuilder, DesignEntryConfig, ComponentInfo } from './DesignEntryBuilder';

/**
 * Storage動作確認用コマンドを登録
 *
 * @param context VSCode拡張機能コンテキスト
 */
export function registerStorageCommands(context: vscode.ExtensionContext): void {
  // プロジェクトファイル一覧を表示するコマンド
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.storage.listFiles', async () => {
      const projectId = 'default'; // TODO: 動的に取得
      const { listFiles } = await import('./projectStorageAdapter');

      try {
        const files = await listFiles(projectId);
        const message = `プロジェクトファイル一覧 (${files.length}件):\n${files.slice(0, 20).join('\n')}${files.length > 20 ? '\n...' : ''}`;
        vscode.window.showInformationMessage(message);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`ファイル一覧取得エラー: ${errorMessage}`);
        console.error('[Storage Command] ファイル一覧取得エラー:', errorMessage);
      }
    })
  );

  // テストファイルを作成するコマンド
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.storage.createTestFile', async () => {
      const projectId = 'default'; // TODO: 動的に取得
      const { saveFile } = await import('./projectStorageAdapter');

      try {
        const testFilePath = '/test-storage.tsx';
        const testContent = `// Storage動作確認用テストファイル
export default function TestStorage() {
  return <div>Storage Test</div>;
}
`;

        await saveFile(projectId, testFilePath, testContent);
        vscode.window.showInformationMessage(`テストファイルを作成しました: ${testFilePath}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`テストファイル作成エラー: ${errorMessage}`);
        console.error('[Storage Command] テストファイル作成エラー:', errorMessage);
      }
    })
  );

  // テストファイルを読み込むコマンド
  context.subscriptions.push(
    vscode.commands.registerCommand('ai-fullcode-ui-editor.storage.loadTestFile', async () => {
      const projectId = 'default'; // TODO: 動的に取得
      const { loadFile } = await import('./projectStorageAdapter');

      try {
        const testFilePath = '/test-storage.tsx';
        const content = await loadFile(projectId, testFilePath);

        if (content === null) {
          vscode.window.showWarningMessage(`ファイルが見つかりません: ${testFilePath}`);
        } else {
          vscode.window.showInformationMessage(`ファイルを読み込みました: ${testFilePath} (${content.length}文字)`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        vscode.window.showErrorMessage(`ファイル読み込みエラー: ${errorMessage}`);
        console.error('[Storage Command] ファイル読み込みエラー:', errorMessage);
      }
    })
  );

}

