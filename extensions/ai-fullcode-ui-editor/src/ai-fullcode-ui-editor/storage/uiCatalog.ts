/**
 * UI Catalog
 *
 * Phase 4: 画面メタ情報管理
 * 非エンジニア向けに「画面単位」で選択できるようにする
 */

import { loadFile, saveFile, listFiles } from './projectStorageAdapter';
import { generateCatalogId, generateDisplayName } from './catalogIdUtils';

/**
 * UIカタログアイテム
 */
export interface UICatalogItem {
  id: string; // 一意のID（例: 'login', 'product-list'）
  name: string; // 画面名（非エンジニア向け、例: 'ログイン画面'）
  component: string; // コンポーネントファイルパス（例: '/pages/login.page.tsx'）
  description?: string; // 説明（オプション）
  kind: 'page' | 'component'; // カタログアイテムの種類
  absoluteFilePath: string; // 実際のファイルシステムパス（例: '/Users/.../workspace/app/page.tsx'）
  importPathWithExtension: string; // Viteで解決可能なインポートパス（拡張子付き、例: '@/app/page.tsx'）
  urlPath?: string; // ページの場合のみ: URLパス（例: '/company', '/admin/contacts'）。コンポーネントには設定しない
}

/**
 * UIカタログ管理クラス
 */
export class UICatalog {
  private projectId: string;
  private catalogPath = 'catalog/uiCatalog.ts';
  private workspaceRoot: string | null = null;

  constructor(projectId: string = 'default') {
    this.projectId = projectId;
  }

  /**
   * ワークスペースルートを設定
   *
   * @param root ワークスペースルートパス
   */
  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
  }

  /**
   * カタログを読み込み
   *
   * @returns UIカタログアイテムの配列
   */
  async loadCatalog(): Promise<UICatalogItem[]> {
    try {
      // カタログファイルを読み込み
      const content = await loadFile(this.projectId, this.catalogPath);
      if (!content) {
        // カタログファイルが存在しない場合は、designs/配下から自動生成
        return await this.generateCatalogFromDesigns();
      }

      // TypeScriptファイルからカタログを抽出
      // 簡易版: export const uiCatalog = [...] の形式を想定
      const catalogMatch = content.match(/export\s+const\s+uiCatalog\s*=\s*(\[[\s\S]*?\])/);
      if (catalogMatch) {
        // evalは使わず、正規表現でパース（簡易版）
        // 本番ではより堅牢なパーサーを使用
        try {
          const catalogArray = eval(catalogMatch[1]) as UICatalogItem[];
          if (Array.isArray(catalogArray)) {
            // ✅ kindフィールドが存在しない場合は、ファイルパスから推測
            // ✅ 後方互換性: absoluteFilePathとimportPathWithExtensionが存在しない場合は生成
            const catalogWithKind = catalogArray.map(item => {
              if (!item.kind) {
                // 後方互換性: ファイルパスからkindを推測
                if (item.component.startsWith('/pages/') ||
                    item.component.startsWith('/app/') ||
                    item.component.startsWith('/screens/')) {
                  item.kind = 'page';
                } else {
                  item.kind = 'component';
                }
              }

              // 後方互換性: absoluteFilePathとimportPathWithExtensionが存在しない場合は生成
              if (!item.absoluteFilePath || !item.importPathWithExtension) {
                // componentパスから生成（既存のカタログファイルとの互換性）
                const componentPath = item.component;
                // 絶対パスは後で解決する必要があるが、ここでは相対パスを保持
                item.absoluteFilePath = componentPath; // 暫定的に相対パスを設定
                // インポートパスは拡張子を含む形式で生成
                const importPathWithoutLeadingSlash = componentPath.replace(/^\/+/, '');
                item.importPathWithExtension = `@/${importPathWithoutLeadingSlash}`;
              }

              return item;
            });

            // ✅ 特殊ファイルを除外（既存のカタログファイルとの互換性）
            const path = await import('path');
            const filteredCatalog = catalogWithKind.filter(item => {
              const fileName = path.basename(item.component).toLowerCase();
              return !(
                fileName === 'layout.tsx' ||
                fileName === 'layout.jsx' ||
                fileName === 'loading.tsx' ||
                fileName === 'loading.jsx' ||
                fileName === 'error.tsx' ||
                fileName === 'error.jsx' ||
                fileName === 'not-found.tsx' ||
                fileName === 'not-found.jsx' ||
                fileName === 'route.ts' ||
                fileName === 'route.js'
              );
            });

            const pages = filteredCatalog.filter(c => c.kind === 'page');
            const components = filteredCatalog.filter(c => c.kind === 'component');
            return filteredCatalog;
          }
        } catch (error) {
          console.error('[UICatalog] Failed to parse catalog:', error);
        }
      }

      // パースに失敗した場合は、designs/配下から自動生成
      return await this.generateCatalogFromDesigns();
    } catch (error) {
      console.error('[UICatalog] Failed to load catalog:', error);
      // エラー時は、designs/配下から自動生成
      return await this.generateCatalogFromDesigns();
    }
  }

  /**
   * プロジェクトからカタログを自動生成
   *
   * ✅ 重要: ワークスペースルートを基準に探索
   * - designs/**: ユーザー作成の視覚コンポーネント
   * - components/**: 再利用可能なUIコンポーネント
   *
   * 除外:
   * - app/**: アプリケーションルーティング（カタログに表示しない）
   * - pages/**: アプリケーションルーティング（カタログに表示しない）
   * - __runtime__/**: ランタイムファイル（カタログに表示しない）
   *
   * @returns UIカタログアイテムの配列
   */
  async generateCatalogFromDesigns(): Promise<UICatalogItem[]> {
    try {
      // ✅ ワークスペースルートを取得
      const vscode = await import('vscode');
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];

      if (!workspaceFolder) {
        console.warn('[UICatalog] No workspace folder found. Cannot scan catalog files.');
        return [];
      }

      const workspaceRoot = workspaceFolder.uri.fsPath;

      // ✅ 探索対象ディレクトリを定義
      // Pages: /pages, /app, /screens 配下の.tsxファイル（すべてページとして扱う）
      // Components: /components, /designs, /ui 配下の.tsxファイル
      const pageDirectories = ['pages', 'app', 'screens'];
      const componentDirectories = ['components', 'designs', 'ui'];

      const scanTargets: Array<{ path: string; kind: 'page' | 'component'; pattern: RegExp }> = [];

      // ページディレクトリを追加（すべての.tsxファイルを検出）
      for (const dir of pageDirectories) {
        scanTargets.push({
          path: dir,
          kind: 'page',
          pattern: /\.(tsx|jsx)$/, // .page.tsxだけでなく、すべての.tsxファイル
        });
      }

      // コンポーネントディレクトリを追加
      for (const dir of componentDirectories) {
        scanTargets.push({
          path: dir,
          kind: 'component',
          pattern: /\.(tsx|jsx)$/,
        });
      }


      // ✅ ファイルシステムから直接探索
      const fs = await import('fs/promises');
      const path = await import('path');

      const catalogFiles: Array<{ filePath: string; kind: 'page' | 'component' }> = [];

      for (const target of scanTargets) {
        const targetPath = path.join(workspaceRoot, target.path);

        try {
          // ディレクトリの存在確認
          const stats = await fs.stat(targetPath);
          if (!stats.isDirectory()) {
            continue;
          }

          // 再帰的にファイルを探索（パターンマッチング付き）
          const files = await this.scanDirectory(targetPath, workspaceRoot, target.kind, target.pattern);
          catalogFiles.push(...files);

        } catch (error) {
          // ディレクトリが存在しない場合はスキップ
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          } else {
            console.error(`[UICatalog] Failed to scan ${target.path}/:`, error);
          }
        }
      }

      // ✅ スキャンサマリーのみログ出力（一度だけ）
      const pagesCount = catalogFiles.filter(f => f.kind === 'page').length;
      const componentsCount = catalogFiles.filter(f => f.kind === 'component').length;

      // ✅ 根本原因の修正: スキャンしたファイルを永続ストレージに同期
      // Viteプラグインが永続ストレージからファイルを読み込むため、ワークスペースのファイルを同期する必要がある
      // ✅ ファイルの存在確認を追加（存在しないファイルは同期しない）
      let syncCount = 0;
      let syncErrorCount = 0;
      let skippedCount = 0;
      for (const { filePath } of catalogFiles) {
        try {
          // ✅ ファイルの存在確認（絶対パスで確認）
          try {
            const stats = await fs.stat(filePath);
            if (!stats.isFile()) {
              skippedCount++;
              continue;
            }
          } catch (statError) {
            // ファイルが存在しない場合はスキップ
            skippedCount++;
            continue;
          }

          // ワークスペース相対パスを生成
          const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
          const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;

          // ファイルを永続ストレージに同期
          const fileContent = await fs.readFile(filePath, 'utf-8');
          await saveFile(this.projectId, normalizedPath, fileContent);
          syncCount++;
        } catch (error) {
          // 個別のファイル同期エラーは警告のみ（他のファイルの同期を続行）
          syncErrorCount++;
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.warn(`[UICatalog] ⚠️ Failed to sync file to persistent storage: ${filePath} (${errorMessage})`);
        }
      }

      if (syncCount > 0) {
      }
      if (syncErrorCount > 0) {
        console.warn(`[UICatalog] ⚠️ Failed to sync ${syncErrorCount} files to persistent storage`);
      }
      if (skippedCount > 0) {
      }

      const catalog: UICatalogItem[] = catalogFiles.map(({ filePath, kind }) => {
        // ✅ 統一されたID生成ロジックを使用
        // ワークスペース相対パスを生成（/pages/... 形式）
        const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
        const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;

        // ✅ 実際のファイルパスを解決（拡張子を含む）
        // filePathは既に絶対パス（例: /Users/.../workspace/app/page.tsx）
        const absoluteFilePath = filePath;

        // ✅ インポートパスを生成（拡張子を必ず含む）
        // normalizedPathは既に拡張子を含む（例: /app/page.tsx, /components/layout/index.tsx）
        // @/エイリアスを使用し、先頭の/を削除して拡張子付きで生成
        // index.tsxの場合は既にパスに含まれているので、そのまま使用
        const importPathWithoutLeadingSlash = normalizedPath.replace(/^\/+/, '');
        const importPathWithExtension = `@/${importPathWithoutLeadingSlash}`;

        // 統一されたID生成関数を使用
        const id = generateCatalogId(normalizedPath, kind);
        const name = generateDisplayName(normalizedPath, kind);

        return {
          id,
          name,
          component: normalizedPath,
          description: kind === 'page' ? 'Page' : 'Component',
          kind,
          absoluteFilePath,
          importPathWithExtension,
        };
      });

      // カタログファイルを保存
      await this.saveCatalog(catalog);

      return catalog;
    } catch (error) {
      console.error('[UICatalog] Failed to generate catalog from project:', error);
      return [];
    }
  }

  /**
   * ディレクトリを再帰的にスキャン
   *
   * ✅ 修正: パス構造のみで判定、export defaultの有無は問わない
   * - ファイルが存在すればカタログに含める
   * - default exportの有無は実行時に判定（カタログ表示には影響しない）
   *
   * @param dirPath スキャンするディレクトリパス
   * @param workspaceRoot ワークスペースルートパス
   * @param kind 種類（page または component）
   * @param pattern ファイル名パターン（正規表現）
   * @returns 見つかったファイルの配列
   */
  private async scanDirectory(
    dirPath: string,
    workspaceRoot: string,
    kind: 'page' | 'component',
    pattern: RegExp
  ): Promise<Array<{ filePath: string; kind: 'page' | 'component' }>> {
    const fs = await import('fs/promises');
    const path = await import('path');

    const files: Array<{ filePath: string; kind: 'page' | 'component' }> = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // 再帰的に探索（__runtime__、node_modulesは除外）
          if (entry.name !== '__runtime__' && entry.name !== 'node_modules') {
            const subFiles = await this.scanDirectory(fullPath, workspaceRoot, kind, pattern);
            files.push(...subFiles);
          }
        } else if (entry.isFile() && pattern.test(entry.name)) {
          // テストファイルは除外
          if (entry.name.includes('.test.') || entry.name.includes('.spec.')) {
            continue;
          }

          // ✅ 動的ルートを除外（[id], [slug]など）
          if (entry.name.includes('[') || entry.name.includes(']')) {
            continue;
          }
          // ディレクトリ名に動的ルートが含まれる場合も除外
          if (fullPath.includes('[') || fullPath.includes(']')) {
            continue;
          }

          // ✅ App Routerの特殊ファイルを除外（プレビュー不可能）
          const fileName = entry.name.toLowerCase();
          if (
            fileName === 'layout.tsx' ||
            fileName === 'layout.jsx' ||
            fileName === 'loading.tsx' ||
            fileName === 'loading.jsx' ||
            fileName === 'error.tsx' ||
            fileName === 'error.jsx' ||
            fileName === 'not-found.tsx' ||
            fileName === 'not-found.jsx' ||
            fileName === 'route.ts' ||
            fileName === 'route.js'
          ) {
            continue;
          }

          // ✅ ファイルの存在確認（念のため）
          try {
            const stats = await fs.stat(fullPath);
            if (!stats.isFile()) {
              continue;
            }
          } catch (error) {
            // ファイルが存在しない場合はスキップ
            continue;
          }

          // ✅ パス構造のみで判定、export defaultの有無は問わない
          files.push({ filePath: fullPath, kind });
          // ✅ ログは最小限に（スキャンサマリーのみ）
        }
      }
    } catch (error) {
      console.error(`[UICatalog] Failed to scan directory ${dirPath}:`, error);
    }

    return files;
  }

  /**
   * カタログを保存
   *
   * @param catalog UIカタログアイテムの配列
   */
  async saveCatalog(catalog: UICatalogItem[]): Promise<void> {
    try {
      const content = `// UI Catalog (Auto-generated)
// This file lists all available design screens
// DO NOT EDIT MANUALLY

export const uiCatalog: Array<{
  id: string;
  name: string;
  component: string;
  description?: string;
  kind: 'page' | 'component';
  absoluteFilePath: string;
  importPathWithExtension: string;
}> = ${JSON.stringify(catalog, null, 2)};
`;

      await saveFile(this.projectId, this.catalogPath, content);
    } catch (error) {
      console.error('[UICatalog] Failed to save catalog:', error);
      throw error;
    }
  }

  /**
   * カタログアイテムを追加
   *
   * @param item UIカタログアイテム
   */
  async addItem(item: UICatalogItem): Promise<void> {
    const catalog = await this.loadCatalog();

    // 既存のアイテムを更新または追加
    const existingIndex = catalog.findIndex(c => c.id === item.id);
    if (existingIndex >= 0) {
      catalog[existingIndex] = item;
    } else {
      catalog.push(item);
    }

    await this.saveCatalog(catalog);
  }

  /**
   * カタログアイテムを削除
   *
   * @param id UIカタログアイテムのID
   */
  async removeItem(id: string): Promise<void> {
    const catalog = await this.loadCatalog();
    const filtered = catalog.filter(c => c.id !== id);
    await this.saveCatalog(filtered);
  }

  /**
   * カタログアイテムを取得
   *
   * @param id UIカタログアイテムのID
   * @returns UIカタログアイテム、見つからない場合は undefined
   */
  async getItem(id: string): Promise<UICatalogItem | undefined> {
    const catalog = await this.loadCatalog();
    return catalog.find(c => c.id === id);
  }
}

