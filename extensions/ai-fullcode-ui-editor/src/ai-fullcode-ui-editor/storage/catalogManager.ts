/**
 * Catalog Manager
 *
 * Phase 4: 最小構成のカタログ実装
 * - ファイルシステムスキャンのみ
 * - runtime registry / design-entry への依存なし
 * - workspace変更時にキャッシュを完全破棄
 */

import * as vscode from 'vscode';
import { UICatalog, UICatalogItem } from './uiCatalog';
import { StaticPageScanner } from './staticPageScanner';

/**
 * カタログセクションヘッダー（Pages/Components）
 */
class CatalogSectionHeader extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly kind: 'page' | 'component'
  ) {
    super(label, vscode.TreeItemCollapsibleState.Expanded);
    this.contextValue = `catalog-section-${kind}`;
    this.iconPath = new vscode.ThemeIcon(kind === 'page' ? 'file-code' : 'symbol-component');
  }
}

/**
 * カタログツリーノード（Page/Component）
 */
class CatalogItem extends vscode.TreeItem {
  constructor(
    public readonly catalogItem: UICatalogItem,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState
  ) {
    super(catalogItem.name, collapsibleState);

    this.label = catalogItem.name;
    this.tooltip = `${catalogItem.name} (${catalogItem.urlPath || catalogItem.component})`;
    this.description = catalogItem.urlPath || catalogItem.description || catalogItem.id;

    this.iconPath = new vscode.ThemeIcon(
      catalogItem.kind === 'page' ? 'file-code' : 'symbol-component'
    );

    this.command = {
      command: catalogItem.kind === 'page'
        ? 'ai-fullcode-ui-editor.catalog.selectPage'
        : 'ai-fullcode-ui-editor.catalog.selectComponent',
      title: `Select ${catalogItem.kind === 'page' ? 'Page' : 'Component'}`,
      arguments: [catalogItem],
    };
  }
}

/**
 * カタログツリーノード型
 */
type CatalogTreeNode = CatalogSectionHeader | CatalogItem | vscode.TreeItem;

/**
 * カタログツリーデータプロバイダー
 *
 * 責務:
 * - 静的スキャンのみでページを検出
 * - runtime registryへの依存なし
 */
class CatalogTreeDataProvider implements vscode.TreeDataProvider<CatalogTreeNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<CatalogTreeNode | undefined | null | void> = new vscode.EventEmitter<CatalogTreeNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<CatalogTreeNode | undefined | null | void> = this._onDidChangeTreeData.event;

  private catalog: UICatalog;
  private staticPageScanner: StaticPageScanner;
  private pages: UICatalogItem[] = [];
  private components: UICatalogItem[] = [];
  private state: 'IDLE' | 'SCANNING' | 'READY' | 'FAILED' = 'IDLE';

  constructor(projectId: string) {
    this.catalog = new UICatalog(projectId);
    this.staticPageScanner = new StaticPageScanner();

    // ワークスペースルートを設定
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const workspaceRoot = workspaceFolder.uri.fsPath;
      this.catalog.setWorkspaceRoot(workspaceRoot);
      this.staticPageScanner.setWorkspaceRoot(workspaceRoot);
    }

    // 初期状態でUIを表示（空の状態でもready状態）
    this.pages = [];
    this.components = [];
    this.state = 'IDLE';
    this._onDidChangeTreeData.fire();

    // 静的スキャンを開始（非ブロッキング）
    this.loadCatalogStatic();
  }

  /**
   * ワークスペースルートを設定（workspace切替時に呼ばれる）
   */
  setWorkspaceRoot(root: string): void {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (workspaceFolder) {
      const workspaceRoot = workspaceFolder.uri.fsPath;
      this.catalog.setWorkspaceRoot(workspaceRoot);
      this.staticPageScanner.setWorkspaceRoot(workspaceRoot); // 内部でclearCache()が実行される
    }
  }

  /**
   * 静的カタログを再読み込み（workspace切替時に呼ばれる）
   */
  async reloadCatalogStatic(): Promise<void> {
    await this.loadCatalogStatic();
    this._onDidChangeTreeData.fire();
  }

  /**
   * 静的ページスキャンを実行
   */
  private async loadCatalogStatic(): Promise<void> {
    this.state = 'SCANNING';

    try {
      const scanResult = await this.staticPageScanner.scanPages(5000);

      if (scanResult.pages.length > 0) {
        this.state = 'READY';
        this.pages = scanResult.pages;
        this._onDidChangeTreeData.fire();
      } else {
        this.state = 'READY';
        this.pages = [];
        this._onDidChangeTreeData.fire();
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.state = 'FAILED';
      this.pages = [];
      console.error('[CatalogTreeDataProvider] state=FAILED scan_error reason=', errorMessage);
      this._onDidChangeTreeData.fire();
    }
  }

  /**
   * ツリービューの子ノードを取得
   */
  getChildren(element?: CatalogTreeNode): CatalogTreeNode[] {
    if (!element) {
      // ルート: Pages と Components のセクションヘッダー
      return [
        new CatalogSectionHeader('Pages', 'page'),
        new CatalogSectionHeader('Components', 'component'),
      ];
    }

    if (element instanceof CatalogSectionHeader) {
      // セクションの子ノード
      if (element.kind === 'page') {
        if (this.pages.length === 0) {
          const emptyItem = new vscode.TreeItem('No pages detected in this project');
          emptyItem.description = 'Create pages in app/, pages/, or src/pages/';
          return [emptyItem];
        }
        return this.pages.map(page => new CatalogItem(page, vscode.TreeItemCollapsibleState.None));
      } else if (element.kind === 'component') {
        if (this.components.length === 0) {
          const emptyItem = new vscode.TreeItem('No components detected');
          return [emptyItem];
        }
        return this.components.map(component => new CatalogItem(component, vscode.TreeItemCollapsibleState.None));
      }
    }

    return [];
  }

  /**
   * ツリービューの親ノードを取得
   */
  getParent(element: CatalogTreeNode): vscode.ProviderResult<CatalogTreeNode> {
    if (element instanceof CatalogItem) {
      return new CatalogSectionHeader(
        element.catalogItem.kind === 'page' ? 'Pages' : 'Components',
        element.catalogItem.kind
      );
    }
    return null;
  }

  /**
   * ツリービューのツールチップを取得
   */
  getTreeItem(element: CatalogTreeNode): vscode.TreeItem {
    return element;
  }
}

/**
 * カタログマネージャー
 */
export class CatalogManager {
  private treeView: vscode.TreeView<CatalogTreeNode> | null = null;
  private dataProvider: CatalogTreeDataProvider | null = null;
  private projectId: string;
  private workspaceRoot: string | null = null;

  constructor(projectId: string = 'default') {
    this.projectId = projectId;
  }

  /**
   * 現在のワークスペースルートを取得
   */
  getWorkspaceRoot(): string | null {
    return this.workspaceRoot;
  }

  /**
   * ワークスペースルートを設定（workspace切替時に呼ばれる）
   */
  setWorkspaceRoot(root: string): void {
    this.workspaceRoot = root;
    if (this.dataProvider) {
      this.dataProvider.setWorkspaceRoot(root);
    }
  }

  /**
   * 静的カタログを再読み込み（workspace切替時に呼ばれる）
   */
  async reloadCatalogStatic(): Promise<void> {
    if (this.dataProvider) {
      await this.dataProvider.reloadCatalogStatic();
    }
  }

  /**
   * カタログを初期化
   */
  init(context: vscode.ExtensionContext): void {
    console.log('[CatalogManager] init() called, projectId:', this.projectId);

    try {
      // ツリーデータプロバイダーを作成
      this.dataProvider = new CatalogTreeDataProvider(this.projectId);

      // ツリービューを作成
      this.treeView = vscode.window.createTreeView('ai-fullcode-ui-editor-catalog', {
        treeDataProvider: this.dataProvider,
        showCollapseAll: true,
      });

      context.subscriptions.push(this.treeView);

      // コマンドを登録
      this.registerCommands(context);

      // ✅ workspace変更イベントを購読
      context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(async (event) => {
          if (event.added.length > 0 || event.removed.length > 0) {
            const newWorkspaceFolder = vscode.workspace.workspaceFolders?.[0];
            if (newWorkspaceFolder) {
              const newRoot = newWorkspaceFolder.uri.fsPath;

              try {
                // タイムアウト付きで実行（5秒、UIブロック禁止）
                const timeoutPromise = new Promise<void>((_, reject) => {
                  setTimeout(() => reject(new Error('Workspace switch timeout (5s)')), 5000);
                });

                const switchPromise = (async () => {
                  // 1) catalogManager.setWorkspaceRoot(newRoot)
                  this.setWorkspaceRoot(newRoot);

                  // 2) staticPageScanner.setWorkspaceRoot(newRoot) (内部でclearCache)
                  // → setWorkspaceRoot内で実行される

                  // 3) catalogManager.reloadCatalogStatic()
                  await this.reloadCatalogStatic();
                })();

                await Promise.race([switchPromise, timeoutPromise]);
              } catch (error) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error('[CatalogManager] workspace_root_changed error:', errorMessage);
                // エラーはログのみ（UIブロックしない）
              }
            }
          }
        })
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[CatalogManager] init error:', errorMessage);
    }
  }

  /**
   * コマンドを登録
   */
  private registerCommands(context: vscode.ExtensionContext): void {
    // ページを選択
    context.subscriptions.push(
      vscode.commands.registerCommand('ai-fullcode-ui-editor.catalog.selectPage', async (catalogItem: UICatalogItem) => {
        try {
          // ✅ urlPathフィールドのみを使用（絶対パス検知付き）
          const urlPath = catalogItem.urlPath;

          if (!urlPath) {
            const errorMsg = `Page item missing urlPath field. id=${catalogItem.id}, component=${catalogItem.component}`;
            console.error('[CatalogManager] selectPage_invalid_urlPath reason=missing_urlPath item=', catalogItem);
            throw new Error(errorMsg);
          }

          // ✅ 絶対パス検知（/Users/, C:\, /home/ など）
          const isWindowsAbsolute = urlPath.match(/^[A-Za-z]:[\\/]/);
          const isUnixAbsolute = (urlPath.startsWith('/Users/') || urlPath.startsWith('/home/') || urlPath.startsWith('/var/') || urlPath.startsWith('/tmp/')) && urlPath.length > 1;
          const hasBackslash = urlPath.includes('\\');
          const isAbsolutePath = isWindowsAbsolute || isUnixAbsolute || hasBackslash;

          if (isAbsolutePath) {
            const errorMsg = `Invalid urlPath detected (absolute path): ${urlPath}. This should be a URL path like '/company', not a file path.`;
            console.error('[CatalogManager] selectPage_invalid_urlPath reason=absolute_path_detected urlPath=', urlPath, 'item=', catalogItem);
            throw new Error(errorMsg);
          }

          console.log('[CatalogManager] selectPage urlPath=', urlPath);

          // ✅ Phase 4: Preview連携は削除（ページ一覧機能は現状実装しない）
          // 将来的にPreview連携が必要な場合は、ここでpreviewBridge.send()を呼び出す
          vscode.window.showInformationMessage(`ページを選択しました: ${urlPath}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[CatalogManager] ❌ Failed to select page: ${errorMessage}`);
          vscode.window.showErrorMessage(
            `ページの選択に失敗しました: ${errorMessage}`
          );
        }
      })
    );

    // コンポーネントを選択（コンポーネントは通常ルートに表示されるため、URLパスは '/'）
    context.subscriptions.push(
      vscode.commands.registerCommand('ai-fullcode-ui-editor.catalog.selectComponent', async (catalogItem: UICatalogItem) => {
        try {
          console.log('[CatalogManager] ✅ Selecting component:', catalogItem.name);

          // ✅ Phase 4: Preview連携は削除（コンポーネント一覧機能は現状実装しない）
          // 将来的にPreview連携が必要な場合は、ここでpreviewBridge.send()を呼び出す
          vscode.window.showInformationMessage(`コンポーネントを選択しました: ${catalogItem.name}`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[CatalogManager] ❌ Failed to select component: ${errorMessage}`);
          vscode.window.showErrorMessage(
            `コンポーネントの選択に失敗しました: ${errorMessage}`
          );
        }
      })
    );
  }
}
