/**
 * Page Index Scanner
 *
 * プロジェクトを一度スキャンしてページを検出
 * ファイルパスをURLパスに変換
 */

import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface PageInfo {
  id: string;
  label: string;
  urlPath: string; // 実際のdev serverでのURLパス（例: '/', '/admin/contacts', '/news'）
  filePath: string; // ワークスペース相対パス（例: '/app/page.tsx', '/app/admin/contacts/page.tsx'）
  kind: 'page' | 'component';
}

/**
 * Page Index Scanner
 *
 * 責任:
 * - プロジェクトを一度スキャン（起動時のみ）
 * - ページを検出（Next.js App Router, Pages Router, Vite SPA）
 * - ファイルパスをURLパスに変換
 */
export class PageIndexScanner {
  private pageIndex: PageInfo[] = [];
  private isScanned = false;

  /**
   * プロジェクトをスキャンしてページインデックスを生成
   *
   * @returns ページ情報の配列
   */
  async scanProject(): Promise<PageInfo[]> {
    if (this.isScanned && this.pageIndex.length > 0) {
      return this.pageIndex;
    }

    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        console.warn('[PageIndexScanner] ワークスペースが見つかりません');
        return [];
      }

      const workspaceRoot = workspaceFolder.uri.fsPath;

      const pages: PageInfo[] = [];

      // Next.js App Router: /app/**/page.tsx
      const appPages = await this.scanAppRouterPages(workspaceRoot);
      pages.push(...appPages);

      // Next.js Pages Router: /pages/**
      const pagesRouterPages = await this.scanPagesRouterPages(workspaceRoot);
      pages.push(...pagesRouterPages);

      // Vite SPA: index.html または router config
      const vitePages = await this.scanVitePages(workspaceRoot);
      pages.push(...vitePages);

      this.pageIndex = pages;
      this.isScanned = true;

      return pages;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[PageIndexScanner] ❌ スキャンエラー:', errorMessage);
      return [];
    }
  }

  /**
   * Next.js App Routerのページをスキャン
   * /app/配下のpage.tsx → URLパスに変換
   */
  private async scanAppRouterPages(workspaceRoot: string): Promise<PageInfo[]> {
    const pages: PageInfo[] = [];
    const appDir = path.join(workspaceRoot, 'app');

    try {
      await fs.stat(appDir);
    } catch {
      return pages; // appディレクトリが存在しない
    }

    const pageFiles = await this.findPageFiles(appDir, workspaceRoot, 'app');

    for (const filePath of pageFiles) {
      const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
      const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;

      // /app/page.tsx → /
      // /app/admin/contacts/page.tsx → /admin/contacts
      let urlPath = normalizedPath
        .replace(/^\/app\//, '/')
        .replace(/\/page\.(tsx|jsx)$/, '');

      if (urlPath === '') {
        urlPath = '/';
      }

      const id = this.generatePageId(normalizedPath);
      const label = this.generatePageLabel(normalizedPath);

      pages.push({
        id,
        label,
        urlPath,
        filePath: normalizedPath,
        kind: 'page',
      });
    }

    return pages;
  }

  /**
   * Next.js Pages Routerのページをスキャン
   * /pages/** → URLパスに変換
   */
  private async scanPagesRouterPages(workspaceRoot: string): Promise<PageInfo[]> {
    const pages: PageInfo[] = [];
    const pagesDir = path.join(workspaceRoot, 'pages');

    try {
      await fs.stat(pagesDir);
    } catch {
      return pages; // pagesディレクトリが存在しない
    }

    const pageFiles = await this.findPageFiles(pagesDir, workspaceRoot, 'pages');

    for (const filePath of pageFiles) {
      const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
      const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;

      // /pages/index.tsx → /
      // /pages/about.tsx → /about
      // /pages/admin/contacts.tsx → /admin/contacts
      let urlPath = normalizedPath
        .replace(/^\/pages\//, '/')
        .replace(/\.(tsx|jsx)$/, '')
        .replace(/\/index$/, '');

      if (urlPath === '') {
        urlPath = '/';
      }

      const id = this.generatePageId(normalizedPath);
      const label = this.generatePageLabel(normalizedPath);

      pages.push({
        id,
        label,
        urlPath,
        filePath: normalizedPath,
        kind: 'page',
      });
    }

    return pages;
  }

  /**
   * Vite SPAのページをスキャン
   * index.html または router config を検出
   */
  private async scanVitePages(workspaceRoot: string): Promise<PageInfo[]> {
    const pages: PageInfo[] = [];

    // index.htmlが存在する場合、ルートページとして追加
    const indexHtml = path.join(workspaceRoot, 'index.html');
    try {
      await fs.stat(indexHtml);
      pages.push({
        id: 'index',
        label: 'Home',
        urlPath: '/',
        filePath: '/index.html',
        kind: 'page',
      });
    } catch {
      // index.htmlが存在しない場合はスキップ
    }

    return pages;
  }

  /**
   * ページファイルを再帰的に検索
   */
  private async findPageFiles(dirPath: string, workspaceRoot: string, baseDir: 'app' | 'pages'): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // 動的ルートを除外
          if (entry.name.includes('[') || entry.name.includes(']')) {
            continue;
          }
          const subFiles = await this.findPageFiles(fullPath, workspaceRoot, baseDir);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // 特殊ファイルを除外
          const fileName = entry.name.toLowerCase();
          if (
            fileName === 'layout.tsx' || fileName === 'layout.jsx' ||
            fileName === 'loading.tsx' || fileName === 'loading.jsx' ||
            fileName === 'error.tsx' || fileName === 'error.jsx' ||
            fileName === 'not-found.tsx' || fileName === 'not-found.jsx' ||
            fileName === 'route.ts' || fileName === 'route.js'
          ) {
            continue;
          }

          // App Router: page.tsx のみ
          if (baseDir === 'app' && (entry.name === 'page.tsx' || entry.name === 'page.jsx')) {
            files.push(fullPath);
          }
          // Pages Router: すべての.tsx/.jsx（index.tsxは特別扱い）
          else if (baseDir === 'pages' && (entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx'))) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      // エラーは無視
    }

    return files;
  }

  /**
   * ページIDを生成
   */
  private generatePageId(filePath: string): string {
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1].replace(/\.(tsx|jsx)$/, '');

    if (fileName === 'page') {
      const dirName = parts[parts.length - 2];
      return dirName || 'index';
    }

    return fileName === 'index' ? 'index' : fileName;
  }

  /**
   * ページラベルを生成
   */
  private generatePageLabel(filePath: string): string {
    const parts = filePath.split('/');
    const fileName = parts[parts.length - 1].replace(/\.(tsx|jsx)$/, '');

    if (fileName === 'page') {
      const dirName = parts[parts.length - 2];
      return dirName ? dirName.charAt(0).toUpperCase() + dirName.slice(1) : 'Home';
    }

    if (fileName === 'index') {
      return 'Home';
    }

    return fileName.charAt(0).toUpperCase() + fileName.slice(1);
  }

  /**
   * ページインデックスを取得（スキャン済みの場合）
   */
  getPageIndex(): PageInfo[] {
    return this.pageIndex;
  }

  /**
   * ページをIDで検索
   */
  findPageById(id: string): PageInfo | undefined {
    return this.pageIndex.find(page => page.id === id);
  }

  /**
   * ページをURLパスで検索
   */
  findPageByUrlPath(urlPath: string): PageInfo | undefined {
    return this.pageIndex.find(page => page.urlPath === urlPath);
  }
}

// シングルトンインスタンス
export const pageIndexScanner = new PageIndexScanner();

