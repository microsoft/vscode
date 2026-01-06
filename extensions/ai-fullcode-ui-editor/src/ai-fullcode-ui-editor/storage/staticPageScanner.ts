/**
 * Static Page Scanner
 *
 * Phase 4: 最小構成のページ検出
 * - ファイルシステムスキャンのみ
 * - workspace変更時にキャッシュを完全破棄
 * - ファイルパスをURLとして使わない
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { UICatalogItem } from './uiCatalog';

export interface StaticPageScanResult {
  pages: UICatalogItem[];
  scanDuration: number;
  framework: string | null;
  reason: string;
}

/**
 * Static Page Scanner
 *
 * 責務:
 * - ファイルシステムからページを検出
 * - workspace変更時にキャッシュを完全破棄
 */
export class StaticPageScanner {
  private workspaceRoot: string | null = null;
  private scanCache: StaticPageScanResult | null = null;
  private lastWorkspaceRoot: string | null = null;

  /**
   * ワークスペースルートを取得
   */
  getWorkspaceRoot(): string | null {
    return this.workspaceRoot;
  }

  /**
   * ワークスペースルートを設定
   * root変更時に自動的にキャッシュをクリア
   */
  setWorkspaceRoot(root: string): void {
    const oldRoot = this.workspaceRoot;
    if (oldRoot !== root) {
      this.clearCache();
      this.lastWorkspaceRoot = root;
    }
    this.workspaceRoot = root;
  }

  /**
   * キャッシュをクリア
   */
  clearCache(): void {
    this.scanCache = null;
    this.lastWorkspaceRoot = null;
  }

  /**
   * ページを静的スキャン（タイムアウト付き）
   *
   * @param timeoutMs タイムアウト（ミリ秒、デフォルト5000ms）
   * @returns スキャン結果
   */
  async scanPages(timeoutMs: number = 5000): Promise<StaticPageScanResult> {
    const startTime = Date.now();

    // キャッシュチェック（workspaceRootが同じ場合のみ）
    if (this.scanCache && this.workspaceRoot === this.lastWorkspaceRoot) {
      return this.scanCache;
    }

    if (!this.workspaceRoot) {
      const result: StaticPageScanResult = {
        pages: [],
        scanDuration: Date.now() - startTime,
        framework: null,
        reason: 'workspaceRoot not set',
      };
      return result;
    }

    try {
      // タイムアウト付きでスキャン実行
      const scanPromise = this.performScan();
      const timeoutPromise = new Promise<StaticPageScanResult>((_, reject) => {
        setTimeout(() => reject(new Error(`Static page scan timeout (${timeoutMs}ms)`)), timeoutMs);
      });

      const result = await Promise.race([scanPromise, timeoutPromise]);
      result.scanDuration = Date.now() - startTime;

      // キャッシュに保存
      this.scanCache = result;
      this.lastWorkspaceRoot = this.workspaceRoot;

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const result: StaticPageScanResult = {
        pages: [],
        scanDuration: Date.now() - startTime,
        framework: null,
        reason: `scan_error: ${errorMessage}`,
      };
      return result;
    }
  }

  /**
   * 実際のスキャンを実行
   */
  private async performScan(): Promise<StaticPageScanResult> {
    if (!this.workspaceRoot) {
      return {
        pages: [],
        scanDuration: 0,
        framework: null,
        reason: 'workspaceRoot not set',
      };
    }

    const pages: UICatalogItem[] = [];
    let framework: string | null = null;
    let reason = '';

    // Next.js App Router をチェック
    const appDir = path.join(this.workspaceRoot, 'app');
    if (fs.existsSync(appDir)) {
      framework = 'nextjs-app-router';
      const appRouterPages = this.scanNextAppRouter(appDir);
      pages.push(...appRouterPages);
      reason = `Next.js App Router: found ${appRouterPages.length} pages`;
    }

    // Next.js Pages Router をチェック
    const pagesDir = path.join(this.workspaceRoot, 'pages');
    if (fs.existsSync(pagesDir) && pages.length === 0) {
      framework = 'nextjs-pages-router';
      const pagesRouterPages = this.scanNextPagesRouter(pagesDir);
      pages.push(...pagesRouterPages);
      reason = `Next.js Pages Router: found ${pagesRouterPages.length} pages`;
    }

    // React/Vite: src/pages をチェック
    const srcPagesDir = path.join(this.workspaceRoot, 'src', 'pages');
    if (fs.existsSync(srcPagesDir) && pages.length === 0) {
      framework = 'react-vite';
      const reactPages = this.scanReactPages(srcPagesDir);
      pages.push(...reactPages);
      reason = `React/Vite: found ${reactPages.length} pages`;
    }

    // React/Vite: pages をチェック
    const rootPagesDir = path.join(this.workspaceRoot, 'pages');
    if (fs.existsSync(rootPagesDir) && pages.length === 0 && framework !== 'nextjs-pages-router') {
      framework = 'react-vite';
      const reactPages = this.scanReactPages(rootPagesDir);
      pages.push(...reactPages);
      reason = `React/Vite: found ${reactPages.length} pages`;
    }

    if (pages.length === 0) {
      reason = 'no_routes_matched: no app/, pages/, or src/pages/ found';
    }

    return {
      pages,
      scanDuration: 0, // performScan内では計測しない（scanPages内で計測）
      framework,
      reason,
    };
  }

  /**
   * Next.js App Router をスキャン
   */
  private scanNextAppRouter(appDir: string): UICatalogItem[] {
    const pages: UICatalogItem[] = [];
    const extensions = ['.tsx', '.ts', '.jsx', '.js'];

    const scanDir = (dir: string, basePath: string = ''): void => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.join(basePath, entry.name);

          if (entry.isDirectory()) {
            scanDir(fullPath, relativePath);
          } else if (entry.isFile() && (entry.name === 'page.tsx' || entry.name === 'page.ts' || entry.name === 'page.jsx' || entry.name === 'page.js')) {
            const urlPath = this.appRouterPathToUrl(relativePath);
            const label = this.generateLabel(urlPath);
            const id = this.generatePageId(urlPath);

            pages.push({
              id,
              name: label,
              component: relativePath, // 相対パス（絶対パスやURLは禁止）
              description: label,
              kind: 'page',
              absoluteFilePath: fullPath,
              importPathWithExtension: fullPath,
              urlPath: urlPath, // ✅ URLパスを明示的に設定
            });
          }
        }
      } catch (error) {
        // エラーは無視（権限エラーなど）
      }
    };

    scanDir(appDir);
    return pages;
  }

  /**
   * Next.js Pages Router をスキャン
   */
  private scanNextPagesRouter(pagesDir: string): UICatalogItem[] {
    const pages: UICatalogItem[] = [];
    const extensions = ['.tsx', '.ts', '.jsx', '.js'];

    const scanDir = (dir: string, basePath: string = ''): void => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.join(basePath, entry.name);

          // api/ ディレクトリは除外
          if (entry.isDirectory() && entry.name === 'api') {
            continue;
          }

          if (entry.isDirectory()) {
            scanDir(fullPath, relativePath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext)) {
              const urlPath = this.pagesRouterPathToUrl(relativePath);
              const label = this.generateLabel(urlPath);
              const id = this.generatePageId(urlPath);

              pages.push({
                id,
                name: label,
                component: relativePath, // 相対パス（絶対パスやURLは禁止）
                description: label,
                kind: 'page',
                absoluteFilePath: fullPath,
                importPathWithExtension: fullPath,
                urlPath: urlPath, // ✅ URLパスを明示的に設定
              });
            }
          }
        }
      } catch (error) {
        // エラーは無視（権限エラーなど）
      }
    };

    scanDir(pagesDir);
    return pages;
  }

  /**
   * React/Vite pages をスキャン
   */
  private scanReactPages(pagesDir: string): UICatalogItem[] {
    const pages: UICatalogItem[] = [];
    const extensions = ['.tsx', '.ts', '.jsx', '.js'];

    const scanDir = (dir: string, basePath: string = ''): void => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          const relativePath = path.join(basePath, entry.name);

          if (entry.isDirectory()) {
            scanDir(fullPath, relativePath);
          } else if (entry.isFile()) {
            const ext = path.extname(entry.name);
            if (extensions.includes(ext)) {
              // index.tsx は / になる
              // about.tsx は /about になる
              const urlPath = this.reactPagesPathToUrl(relativePath);
              const label = this.generateLabel(urlPath);
              const id = this.generatePageId(urlPath);

              pages.push({
                id,
                name: label,
                component: relativePath, // 相対パス（絶対パスやURLは禁止）
                description: label,
                kind: 'page',
                absoluteFilePath: fullPath,
                importPathWithExtension: fullPath,
                urlPath: urlPath, // ✅ URLパスを明示的に設定
              });
            }
          }
        }
      } catch (error) {
        // エラーは無視（権限エラーなど）
      }
    };

    scanDir(pagesDir);
    return pages;
  }

  /**
   * Next.js App Router パスをURLに変換
   */
  private appRouterPathToUrl(relativePath: string): string {
    // app/admin/contacts/page.tsx -> /admin/contacts
    // app/page.tsx -> /
    const parts = relativePath.split(path.sep);
    const pageIndex = parts.findIndex(p => p.startsWith('page.'));
    if (pageIndex === -1) return '/';

    const urlParts = parts.slice(0, pageIndex);
    if (urlParts.length === 0) return '/';

    return '/' + urlParts.join('/');
  }

  /**
   * Next.js Pages Router パスをURLに変換
   */
  private pagesRouterPathToUrl(relativePath: string): string {
    // pages/admin/contacts.tsx -> /admin/contacts
    // pages/index.tsx -> /
    const ext = path.extname(relativePath);
    const withoutExt = relativePath.slice(0, -ext.length);
    const parts = withoutExt.split(path.sep);

    if (parts[parts.length - 1] === 'index') {
      parts.pop();
    }

    if (parts.length === 0) return '/';
    return '/' + parts.join('/');
  }

  /**
   * React/Vite pages パスをURLに変換
   */
  private reactPagesPathToUrl(relativePath: string): string {
    // pages/admin/contacts.tsx -> /admin/contacts
    // pages/index.tsx -> /
    const ext = path.extname(relativePath);
    const withoutExt = relativePath.slice(0, -ext.length);
    const parts = withoutExt.split(path.sep);

    if (parts[parts.length - 1] === 'index') {
      parts.pop();
    }

    if (parts.length === 0) return '/';
    return '/' + parts.join('/');
  }

  /**
   * URLパスからラベルを生成
   */
  private generateLabel(urlPath: string): string {
    if (urlPath === '/') {
      return 'Home';
    }
    const parts = urlPath
      .split('/')
      .filter(part => part.length > 0)
      .map(part => {
        return part
          .split(/[-_]/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      });
    return parts.join(' ') || urlPath;
  }

  /**
   * URLパスからページIDを生成
   */
  private generatePageId(urlPath: string): string {
    if (urlPath === '/') {
      return 'home';
    }
    return urlPath
      .split('/')
      .filter(part => part.length > 0)
      .join('-');
  }
}
