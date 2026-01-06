/**
 * Design Entry Builder (VSCode Extension版)
 *
 * Phase 4: 複数ファイル集約機能
 * プロジェクト全体から1つのデザインエントリーポイントを生成
 * - すべての編集可能なコンポーネントを集約
 * - プレビューは常にこのエントリーポイントをレンダリング
 *
 * ✅ 重要: ワークスペースルートから直接ファイルシステムをスキャン
 * - 永続ストレージではなく、実際のワークスペースファイルを参照
 * - export defaultの有無を確認して分類
 */

import { Project, SourceFile } from 'ts-morph';
import { loadFile, listFiles, saveFile } from './projectStorageAdapter';
import * as vscode from 'vscode';
import * as fs from 'fs/promises';
import * as path from 'path';
import { generateCatalogId } from './catalogIdUtils';
import { UICatalog, UICatalogItem } from './uiCatalog';

export interface DesignEntryConfig {
  projectId: string;
  entryFile?: string; // オプション: 明示的なエントリーファイル（例: /app/page.tsx）
  includeComponents?: string[]; // オプション: 含めるコンポーネントのパス
}

export interface ComponentInfo {
  filePath: string;
  exportName: string;
  isDefault: boolean;
  componentType: 'page' | 'layout' | 'component' | 'section';
}

/**
 * デザインエントリーポイントを生成
 *
 * 生成されるファイル構造:
 * ```tsx
 * // design-entry.tsx (仮想ファイル)
 * // @ts-expect-error - 永続ストレージから動的に読み込まれる（Vite プラグインが解決）
 * import HomePage from '@/app/page';
 * // @ts-expect-error - 永続ストレージから動的に読み込まれる（Vite プラグインが解決）
 * import Header from '@/components/layout/Header';
 *
 * export default function DesignEntry() {
 *   return (
 *     <div data-design-only="true" data-design-boundary="true" data-design-boundary-root="true" style={{ minHeight: '100vh' }}>
 *       <Header />
 *       <HomePage />
 *     </div>
 *   );
 * }
 * ```
 */
export class DesignEntryBuilder {
  private project: Project;
  private projectId: string;
  private componentIndex: Map<string, ComponentInfo> = new Map();
  private catalog: UICatalog | null = null;

  constructor(project: Project, projectId: string) {
    this.project = project;
    this.projectId = projectId;
    this.catalog = new UICatalog(projectId);
  }

  /**
   * プロジェクト内のすべてのTSXファイルをスキャンしてコンポーネント情報を収集
   *
   * ✅ 修正: ワークスペースルートから直接ファイルシステムをスキャン
   */
  async scanProject(): Promise<ComponentInfo[]> {
    const components: ComponentInfo[] = [];

    try {
      // ✅ ワークスペースルートを取得
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        console.warn('[DesignEntryBuilder] No workspace folder found. Cannot scan project files.');
        return [];
      }

      const workspaceRoot = workspaceFolder.uri.fsPath;

      // ✅ 探索対象ディレクトリを定義
      const pageDirectories = ['pages', 'app', 'screens'];
      const componentDirectories = ['components', 'designs', 'ui'];
      const allDirectories = [...pageDirectories, ...componentDirectories];

      // ✅ ファイルシステムから直接探索
      const tsxFiles: Array<{ filePath: string; absolutePath: string; kind: 'page' | 'component' }> = [];

      for (const dir of allDirectories) {
        const dirPath = path.join(workspaceRoot, dir);
        const kind = pageDirectories.includes(dir) ? 'page' : 'component';

        try {
          const stats = await fs.stat(dirPath);
          if (!stats.isDirectory()) {
            continue;
          }

          const files = await this.scanDirectoryForTsx(dirPath, workspaceRoot, kind);
          tsxFiles.push(...files);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          } else {
            console.error(`[DesignEntryBuilder] Failed to scan ${dir}/:`, error);
          }
        }
      }


      // ✅ 各ファイルを解析してコンポーネント情報を収集
      // パス構造のみで判定、export defaultの有無は問わない
      for (const { filePath, absolutePath, kind } of tsxFiles) {
        try {
          // ファイル内容を読み込み（ワークスペースから直接）
          const content = await fs.readFile(absolutePath, 'utf-8');
          if (!content) {
            console.log(`[DesignEntryBuilder] Failed to read file: ${absolutePath}`);
            continue;
          }

          // ts-morphでファイルを解析
          const sourceFile = this.project.createSourceFile(filePath, content, { overwrite: true });
          if (!sourceFile) {
            continue;
          }

          // ✅ export defaultの有無を確認（警告はスキャンサマリーで一度だけ）
          const hasDefaultExport = sourceFile.getDefaultExportSymbol() !== undefined;

          // コンポーネントタイプを判定（パス構造から）
          const componentType = this.detectComponentType(filePath);

          // ✅ パス構造に基づいてカタログに含める（export defaultの有無は問わない）
          const componentInfo: ComponentInfo = {
            filePath,
            exportName: 'default', // 常にdefault exportとして扱う
            isDefault: true,
            componentType,
          };

          components.push(componentInfo);
          this.componentIndex.set(`${filePath}:default`, componentInfo);

          // ✅ 個別ファイルログは削除（選択時の繰り返しログを防ぐ）
        } catch (error) {
          console.error(`[DesignEntryBuilder] Failed to scan file ${filePath}:`, error);
        }
      }

      // ✅ スキャンサマリーのみログ出力（一度だけ）
      const pagesCount = components.filter(c =>
        c.componentType === 'page' ||
        c.filePath.startsWith('/pages/') ||
        (c.filePath.startsWith('/app/') && c.filePath.match(/\/page\.(tsx|jsx)$/)) ||
        c.filePath.startsWith('/screens/')
      ).length;
      const componentsCount = components.filter(c =>
        c.componentType === 'component' ||
        c.filePath.startsWith('/components/') ||
        c.filePath.startsWith('/designs/') ||
        c.filePath.startsWith('/ui/')
      ).length;

    } catch (error) {
      console.error('[DesignEntryBuilder] ❌ Failed to scan project:', error);
    }

    return components;
  }

  /**
   * ディレクトリを再帰的にスキャンしてTSX/JSXファイルを収集
   *
   * @param dirPath スキャンするディレクトリパス（絶対パス）
   * @param workspaceRoot ワークスペースルートパス
   * @param kind 種類（page または component）
   * @returns 見つかったファイルの配列
   */
  private async scanDirectoryForTsx(
    dirPath: string,
    workspaceRoot: string,
    kind: 'page' | 'component'
  ): Promise<Array<{ filePath: string; absolutePath: string; kind: 'page' | 'component' }>> {
    const files: Array<{ filePath: string; absolutePath: string; kind: 'page' | 'component' }> = [];

    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);

        if (entry.isDirectory()) {
          // 再帰的に探索（__runtime__は除外）
          if (entry.name !== '__runtime__' && entry.name !== 'node_modules') {
            const subFiles = await this.scanDirectoryForTsx(fullPath, workspaceRoot, kind);
            files.push(...subFiles);
          }
        } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx'))) {
          // テストファイルは除外
          if (entry.name.includes('.test.') || entry.name.includes('.spec.')) {
            continue;
          }

          // ワークスペース相対パスを生成
          const relativePath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');
          const normalizedPath = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;

          files.push({
            filePath: normalizedPath,
            absolutePath: fullPath,
            kind,
          });
        }
      }
    } catch (error) {
      console.error(`[DesignEntryBuilder] Failed to scan directory ${dirPath}:`, error);
    }

    return files;
  }

  /**
   * ファイルパスからコンポーネントタイプを検出
   *
   * ✅ 修正: パス構造のみで判定
   * - Next.js App Router: app配下のpage.tsx → page
   * - Next.js Pages Router: pages配下 → page
   * - その他: component
   */
  private detectComponentType(filePath: string): ComponentInfo['componentType'] {
    // Next.js App Router: app/**/page.tsx または app/page.tsx
    if (filePath.match(/^\/app\/.+\/page\.(tsx|jsx)$/) || filePath.match(/^\/app\/page\.(tsx|jsx)$/)) {
      return 'page';
    }

    // Next.js Pages Router: pages/**
    if (filePath.match(/^\/pages\/.+/)) {
      return 'page';
    }

    // screens/配下もpageとして扱う
    if (filePath.startsWith('/screens/')) {
      return 'page';
    }

    // ルートレイアウト（/app/layout.tsx）は除外（カタログに含めない）
    if (filePath === '/app/layout.tsx' || filePath === '/app/layout.jsx') {
      return 'layout'; // layoutとして扱い、カタログから除外
    }

    // その他のlayoutファイルも除外
    if (filePath.includes('/layout.') && filePath.match(/\/layout\.(tsx|jsx)$/)) {
      return 'layout';
    }

    // デフォルト: component
    return 'component';
  }

  /**
   * Layout ファイルかどうかを判定
   */
  private isLayoutFile(filePath: string): boolean {
    return (
      filePath === '/app/layout.tsx' ||
      filePath === '/app/layout.jsx' ||
      /^\/app\/.*\/layout\.(tsx|jsx)$/.test(filePath)
    );
  }

  /**
   * デザインエントリーポイントのコードを生成（registry方式）
   *
   * Phase 4: 安全なディレクトリ（designs/、components/）のみをimportして、registryで切り替え可能にする
   *
   * 設計方針:
   * - design-entry.tsxが唯一のプレビューエントリーポイント
   * - 他のファイルはモジュールとしてインポートされるだけ（直接実行されない）
   * - app/やpages/はアプリケーションルーティング用なのでカタログに含めない
   */
  async buildDesignEntry(config: DesignEntryConfig): Promise<string> {
    // ✅ 修正: カタログを単一の真実の源として使用
    // カタログから直接アイテムを取得（再スキャンしない）
    if (!this.catalog) {
      this.catalog = new UICatalog(this.projectId);
    }

    // カタログを読み込み（既に生成済みの場合はファイルから読み込む）
    let catalogItems: UICatalogItem[] = await this.catalog.loadCatalog();

    // カタログが空の場合は生成を試みる（一度だけ）
    if (catalogItems.length === 0) {
      catalogItems = await this.catalog.generateCatalogFromDesigns();
    }

    // ✅ スキャンサマリーのみログ出力（一度だけ、選択時は呼ばれない）
    const pages = catalogItems.filter(item => item.kind === 'page');
    const componentItems = catalogItems.filter(item => item.kind === 'component');

    if (catalogItems.length === 0) {
      console.warn('[DesignEntryBuilder] ⚠️ No catalog items found. Please create files in /pages/, /app/, /screens/, /components/, /designs/, or /ui/ directories');
      // フォールバック: 空のregistryを返す
      return await this.generateRegistryCodeFromCatalog([], undefined);
    }

    // ✅ カタログアイテムから直接registryを生成（ファイルシステムスキャンなし）
    const selectedId = config.entryFile
      ? generateCatalogId(config.entryFile, 'component') // 簡易判定
      : catalogItems[0]?.id;

    return await this.generateRegistryCodeFromCatalog(catalogItems, selectedId);
  }

  /**
   * registry方式のdesign-entry.tsxコードを生成（カタログベース）
   *
   * ✅ 修正: カタログアイテムから直接registryを生成
   * - カタログIDをそのまま使用（一貫性を保証）
   * - ファイルシステムスキャンなし
   *
   * @param catalogItems カタログアイテム（UICatalogItem）
   * @param selectedId 選択されたコンポーネントのID（オプション）
   */
  private async generateRegistryCodeFromCatalog(catalogItems: UICatalogItem[], selectedId?: string): Promise<string> {
    // PagesとComponentsを分離
    const pages = catalogItems.filter(item => item.kind === 'page');
    const componentItems = catalogItems.filter(item => item.kind === 'component');

    // インポート文とregistryエントリを生成
    const imports: string[] = [];
    const registryEntries: string[] = [];
    const pageIds: string[] = [];
    const componentIds: string[] = [];

    // ✅ 根本原因の修正: ファイルの存在確認と特殊ファイルの除外を追加
    // 存在しないファイルのインポートを生成しない
    const validatedItems: UICatalogItem[] = [];
    let skippedCount = 0;

    for (const item of catalogItems) {
      // ✅ App Routerの特殊ファイルを除外（プレビュー不可能）
      const fileName = path.basename(item.component).toLowerCase();
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
        skippedCount++;
        continue;
      }

      // ✅ ファイルの存在確認（絶対パスで確認）
      try {
        if (item.absoluteFilePath) {
          const stats = await fs.stat(item.absoluteFilePath);
          if (!stats.isFile()) {
            skippedCount++;
            continue;
          }
        } else {
          // absoluteFilePathが存在しない場合は、importPathWithExtensionから推測
          // ただし、これは推測なので警告を出す
          console.warn(`[DesignEntryBuilder] ⚠️ absoluteFilePath not found for ${item.component}, skipping`);
          skippedCount++;
          continue;
        }
      } catch (error) {
        // ファイルが存在しない場合はスキップ
        skippedCount++;
        console.warn(`[DesignEntryBuilder] ⚠️ File not found: ${item.absoluteFilePath} (skipping)`);
        continue;
      }

      validatedItems.push(item);
    }

    if (skippedCount > 0) {
      console.warn(`[DesignEntryBuilder] ⚠️ Skipped ${skippedCount} items (files not found)`);
    }

    // ✅ 検証済みアイテムのみを使用
    // ✅ 重複したコンポーネント参照名を防ぐためのマップ
    const usedRefNames = new Map<string, number>();

    for (const item of validatedItems) {
      // ✅ カタログIDをそのまま使用（一貫性を保証）
      const componentId = item.id;

      // コンポーネント参照名を生成（ファイルパスから）
      let componentRefName = this.getComponentRefNameFromPath(item.component, item.kind);

      // ✅ 根本原因2の修正: componentRefNameのバリデーション
      // 無効なJavaScript識別子を防止（空文字列、特殊文字、数字で始まるなど）
      if (!componentRefName || !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(componentRefName)) {
        console.warn(`[DesignEntryBuilder] ⚠️ Invalid component reference name: "${componentRefName}" for ${item.component}, using fallback`);
        // フォールバック: インデックスベースの安全な識別子
        const fallbackIndex = imports.length;
        componentRefName = `Component${fallbackIndex}`;
      }

      // ✅ 重複したコンポーネント参照名を防ぐ
      if (usedRefNames.has(componentRefName)) {
        const count = usedRefNames.get(componentRefName)! + 1;
        usedRefNames.set(componentRefName, count);
        componentRefName = `${componentRefName}${count}`;
      } else {
        usedRefNames.set(componentRefName, 0);
      }

      // ✅ 根本原因の修正: 実際のファイルパスを解決してからインポートを生成
      // item.importPathWithExtensionを使用（拡張子付き、Viteで解決可能）
      // 後方互換性: importPathWithExtensionが存在しない場合は生成
      let importPath: string;
      if (item.importPathWithExtension) {
        importPath = item.importPathWithExtension;
      } else {
        // 後方互換性: 既存のカタログファイルとの互換性
        // componentパスから拡張子付きインポートパスを生成
        const componentPath = item.component;
        const importPathWithoutLeadingSlash = componentPath.replace(/^\/+/, '');
        importPath = `@/${importPathWithoutLeadingSlash}`;
      }

      const importStmt = `import ${componentRefName} from '${importPath}';`;

      const importWithComment = importStmt.includes("from '@/")
        ? `// @ts-expect-error - 永続ストレージから動的に読み込まれる（Vite プラグインが解決）\n${importStmt}`
        : importStmt;

      imports.push(importWithComment);

      // ✅ 重複したregistryキーを防ぐ（同じIDが複数回出現する場合）
      if (!registryEntries.some(entry => entry.includes(`'${componentId}':`))) {
        registryEntries.push(`  '${componentId}': ${componentRefName},`);

        // IDリストに追加
        if (item.kind === 'page') {
          if (!pageIds.includes(componentId)) {
            pageIds.push(componentId);
          }
        } else {
          if (!componentIds.includes(componentId)) {
            componentIds.push(componentId);
          }
        }
      } else {
        console.warn(`[DesignEntryBuilder] ⚠️ Duplicate registry key detected: ${componentId}, skipping`);
      }
    }

    // デフォルト選択（最初のアイテムまたは指定されたID）
    const defaultSelected = selectedId || (validatedItems.length > 0 ? validatedItems[0].id : '');

    // ✅ 根本原因3の修正: defaultSelectedのエスケープ（シングルクォートを含む場合の処理）
    const escapedDefaultSelected = defaultSelected.replace(/'/g, "\\'");

    // ✅ 根本原因1の修正: allIdsを事前に計算してからJSON.stringify
    // テンプレートリテラル内でスプレッド構文を使わない
    // ✅ 検証済みアイテムのみを使用
    const allIdsArray = [...pageIds, ...componentIds];
    const allIdsJson = JSON.stringify(allIdsArray);
    const pageIdsJson = JSON.stringify(pageIds);
    const componentIdsJson = JSON.stringify(componentIds);

    // ✅ 検証済みアイテムが0件の場合は空のregistryを返す
    if (validatedItems.length === 0) {
      console.warn('[DesignEntryBuilder] ⚠️ No valid files found after validation. Returning empty registry.');
      return this.generateEmptyRegistry();
    }

    // ✅ 根本原因4の修正: Reactインポートを追加
    const code = `// Design Entry Point (Auto-generated)
// This file aggregates all design screens for visual editing
// DO NOT EDIT MANUALLY
//
// Phase 4: Registry方式
// - カタログから生成されたregistry
// - selected propで切り替え可能
// - 非エンジニアは「画面単位」で選択

import React from 'react';

${imports.join('\n')}

const registry = {
${registryEntries.join('\n')}
} as const;

// ✅ 利用可能なIDリストをエクスポート（デバッグ用）
export const pageIds: string[] = ${pageIdsJson};
export const componentIds: string[] = ${componentIdsJson};
export const allIds: string[] = ${allIdsJson};

// ✅ IDが存在するかチェックする関数
export function getComponentById(id: string): React.ComponentType | undefined {
  return registry[id as keyof typeof registry];
}

// ✅ 利用可能なIDを取得する関数
export function listAvailableIds(): string[] {
  return Object.keys(registry);
}

export interface DesignEntryProps {
  selected?: keyof typeof registry;
  previewType?: 'page' | 'component';
}

export default function DesignEntry({ selected, previewType }: DesignEntryProps = {}) {
  const selectedId = selected || '${escapedDefaultSelected}';
  const Component = registry[selectedId as keyof typeof registry];

  if (!Component) {
    // ✅ エラー表示: 利用可能なIDを表示
    const availableIds = Object.keys(registry);
    return (
      <div style={{ padding: '20px', background: '#1e1e1e', color: '#f48771' }}>
        <h2>Design not found</h2>
        <p>Selected ID: <code>{selectedId}</code></p>
        <p>Available IDs ({availableIds.length}):</p>
        <ul style={{ marginTop: '10px', paddingLeft: '20px' }}>
          {availableIds.map(id => (
            <li key={id}><code>{id}</code></li>
          ))}
        </ul>
      </div>
    );
  }

  // Pages: フルレイアウトで表示
  if (previewType === 'page') {
    return (
      <div
        data-design-only="true"
        data-design-boundary="true"
        data-design-boundary-root="true"
        style={{ minHeight: '100vh', width: '100%' }}
      >
        <Component />
      </div>
    );
  }

  // Components: 中央揃えでパディング付き表示
  if (previewType === 'component') {
    return (
      <div
        data-design-only="true"
        data-design-boundary="true"
        data-design-boundary-root="true"
        style={{
          minHeight: '100vh',
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px',
          background: '#1e1e1e'
        }}
      >
        <Component />
      </div>
    );
  }

  // デフォルト: フルレイアウト
  return (
    <div
      data-design-only="true"
      data-design-boundary="true"
      data-design-boundary-root="true"
      style={{ minHeight: '100vh' }}
    >
      <Component />
    </div>
  );
}
`;

    return code;
  }

  /**
   * 空のregistryを生成（フォールバック用）
   */
  private generateEmptyRegistry(): string {
    return `// Design Entry Point (Auto-generated)
// This file aggregates all design screens for visual editing
// DO NOT EDIT MANUALLY
//
// ⚠️ No valid files found. Please create files in /pages/, /app/, /screens/, /components/, /designs/, or /ui/ directories

import React from 'react';

const registry = {} as const;

export const pageIds: string[] = [];
export const componentIds: string[] = [];
export const allIds: string[] = [];

export function getComponentById(id: string): React.ComponentType | undefined {
  return registry[id as keyof typeof registry];
}

export function listAvailableIds(): string[] {
  return Object.keys(registry);
}

export interface DesignEntryProps {
  selected?: keyof typeof registry;
  previewType?: 'page' | 'component';
}

export default function DesignEntry({ selected, previewType }: DesignEntryProps = {}) {
  return (
    <div style={{ padding: '20px', background: '#1e1e1e', color: '#f48771' }}>
      <h2>No Design Files Found</h2>
      <p>Please create files in one of the following directories:</p>
      <ul style={{ marginTop: '10px', paddingLeft: '20px' }}>
        <li><code>/pages/</code> - Pages (Next.js Pages Router)</li>
        <li><code>/app/</code> - Pages (Next.js App Router)</li>
        <li><code>/screens/</code> - Pages (Custom)</li>
        <li><code>/components/</code> - Components</li>
        <li><code>/designs/</code> - Design Components</li>
        <li><code>/ui/</code> - UI Components</li>
      </ul>
    </div>
  );
}
`;
  }

  /**
   * ファイルパスからコンポーネント参照名を生成
   *
   * ✅ 修正: カタログベースの生成に変更
   *
   * @param filePath ワークスペース相対パス
   * @param kind 種類（page または component）
   * @returns コンポーネント参照名（例: "Admin", "ButtonCard"）
   */
  private getComponentRefNameFromPath(filePath: string, kind: 'page' | 'component'): string {
    // ファイル名を取得
    let fileName = filePath.split('/').pop()?.replace(/\.(tsx|jsx)$/, '') || 'Component';

    // .page.tsx の場合は .page を削除
    if (fileName.endsWith('.page')) {
      fileName = fileName.replace(/\.page$/, '');
    }

    // page.tsx の場合は親ディレクトリ名を使用（Next.js App Router形式）
    if (fileName === 'page' && kind === 'page') {
      const dirPath = filePath.split('/').slice(0, -1).join('/');
      const dirName = dirPath.split('/').pop();
      if (dirName && dirName !== 'pages' && dirName !== 'app' && dirName !== 'screens') {
        fileName = dirName;
      } else {
        // さらに親ディレクトリを確認
        const parentDir = dirPath.split('/').slice(0, -1).join('/');
        const parentDirName = parentDir.split('/').pop();
        if (parentDirName && parentDirName !== 'pages' && parentDirName !== 'app' && parentDirName !== 'screens') {
          fileName = parentDirName;
        }
      }
    }

    // ✅ 根本原因2の修正: 有効なJavaScript識別子に変換
    // 1. 先頭を大文字に
    let refName = fileName.charAt(0).toUpperCase() + fileName.slice(1);

    // 2. 無効な文字を削除（英数字、アンダースコア、ドル記号のみ許可）
    refName = refName.replace(/[^A-Za-z0-9_$]/g, '');

    // 3. 先頭が数字の場合はプレフィックスを追加
    if (/^[0-9]/.test(refName)) {
      refName = 'Component' + refName;
    }

    // 4. 空文字列の場合はフォールバック
    if (!refName || refName.length === 0) {
      refName = 'Component';
    }

    // 5. 最終バリデーション: 有効な識別子であることを確認
    if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(refName)) {
      // それでも無効な場合は強制的に安全な識別子に変換
      refName = 'Component';
    }

    return refName;
  }

  /**
   * ファイルパスからコンポーネントIDを生成（非推奨: カタログIDを使用）
   *
   * @deprecated カタログIDを使用してください（generateCatalogId）
   */
  private getComponentIdFromPath(filePath: string): string {
    // ✅ 統一されたID生成ロジックを使用
    // 簡易判定（kindは推測）
    const kind: 'page' | 'component' =
      filePath.startsWith('/pages/') ||
      filePath.startsWith('/app/') ||
      filePath.startsWith('/screens/')
        ? 'page'
        : 'component';

    return generateCatalogId(filePath, kind);
  }

  /**
   * インポート文を生成
   *
   * Vite preview アプリで解決できるように @/ エイリアスを使用
   */
  private generateImport(component: ComponentInfo): string {
    // ファイルパスから先頭の / を削除し、拡張子を削除
    const filePath = component.filePath.replace(/^\/+/, '').replace(/\.(tsx|jsx|ts|js)$/, '');
    // @/ エイリアスを使用（Vite の設定で永続ストレージにマッピングされている）
    const importPath = `@/${filePath}`;

    if (component.isDefault) {
      return `import ${this.getComponentRefName(component)} from '${importPath}';`;
    } else {
      return `import { ${component.exportName} as ${this.getComponentRefName(component)} } from '${importPath}';`;
    }
  }

  /**
   * コンポーネント参照名を取得（ComponentInfo用）
   *
   * @deprecated カタログベースの生成に移行中
   */
  private getComponentRefName(component: ComponentInfo): string {
    if (component.isDefault) {
      const kind: 'page' | 'component' =
        component.filePath.startsWith('/pages/') ||
        component.filePath.startsWith('/app/') ||
        component.filePath.startsWith('/screens/')
          ? 'page'
          : 'component';

      return this.getComponentRefNameFromPath(component.filePath, kind);
    }
    return component.exportName;
  }

  /**
   * コンポーネント情報を取得
   */
  getComponentInfo(filePath: string, exportName?: string): ComponentInfo | undefined {
    const key = exportName ? `${filePath}:${exportName}` :
                Array.from(this.componentIndex.keys()).find(k => k.startsWith(`${filePath}:`));
    return key ? this.componentIndex.get(key) : undefined;
  }
}

