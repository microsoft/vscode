/**
 * Runtime Page Registry
 *
 * Phase 4: 実行時に実際に表示できたURLを唯一の真実とする
 * - 初回Preview表示URLを必ずpages[0]として登録
 * - iframe.srcが変更されたURLは全てページ候補として記録
 * - HTTP 200を返したURLのみ確定ページとする（可能な限り）
 * - 静的スキャンは補助情報。失敗しても機能停止しない
 */

import * as vscode from 'vscode';

export interface RuntimePageInfo {
  urlPath: string; // 実際のdev serverでのURLパス（例: '/', '/admin/contacts'）
  label: string; // 表示名（例: 'Home', 'Admin Contacts'）
  confirmed: boolean; // HTTP 200で確認済みか（iframe内なので完全確認は難しいが、loadイベントで推測）
  firstSeenAt: number; // 初回検出時刻（タイムスタンプ）
}

/**
 * ページ登録イベント
 */
export interface PageRegisteredEvent {
  urlPath: string;
  label: string;
  confirmed: boolean;
}

/**
 * Runtime Page Registry
 *
 * 責任:
 * - 実行時に実際に表示できたURLを記録
 * - 初回Preview表示URLを必ずpages[0]として登録
 * - iframe.src変更を監視してページ候補として記録
 * - ページ登録時にイベントを発火（CatalogManagerが購読）
 */
export class RuntimePageRegistry {
  private pages: Map<string, RuntimePageInfo> = new Map();
  private initialUrl: string | null = null; // 初回Preview表示URL
  private eventEmitter = new vscode.EventEmitter<PageRegisteredEvent>();

  /**
   * ページ登録イベント（CatalogManagerが購読）
   */
  readonly onPageRegistered: vscode.Event<PageRegisteredEvent> = this.eventEmitter.event;

  /**
   * 初回Preview表示URLを設定（必ずpages[0]として登録）
   *
   * @param urlPath 初回Preview表示URL（例: '/'）
   */
  setInitialUrl(urlPath: string): void {
    console.log('[RuntimePageRegistry] ✅ setInitialUrl() called, urlPath:', urlPath, 'current initialUrl:', this.initialUrl);
    if (this.initialUrl === null) {
      console.log('[RuntimePageRegistry] ✅ Setting initialUrl to:', urlPath);
      this.initialUrl = urlPath;
      // registerPage()内で既にイベントが発火されるため、ここでの重複発火は不要
      console.log('[RuntimePageRegistry] ✅ Calling registerPage()');
      this.registerPage(urlPath, true); // 初回URLは確認済みとして登録（イベント発火済み）
      console.log('[RuntimePageRegistry] ✅ setInitialUrl() completed, pages count:', this.pages.size);
    } else {
      console.log('[RuntimePageRegistry] ⚠️ initialUrl already set, skipping');
    }
  }

  /**
   * ページを登録（iframe.src変更時に呼び出される）
   *
   * @param urlPath URLパス
   * @param confirmed HTTP 200で確認済みか（loadイベントで推測）
   */
  registerPage(urlPath: string, confirmed: boolean = false): void {
    // 既に登録されている場合は更新のみ
    const existing = this.pages.get(urlPath);
    if (existing) {
      // confirmedがtrueの場合は更新
      if (confirmed && !existing.confirmed) {
        existing.confirmed = confirmed;
        // 確認済みになった場合はイベントを発火
        console.log('[RuntimePageRegistry] ✅ Page confirmed, firing event:', existing.urlPath);
        this.eventEmitter.fire({
          urlPath: existing.urlPath,
          label: existing.label,
          confirmed: existing.confirmed,
        });
      }
      return;
    }

    // 新規登録
    const label = this.generateLabel(urlPath);
    const pageInfo: RuntimePageInfo = {
      urlPath,
      label,
      confirmed,
      firstSeenAt: Date.now(),
    };
    this.pages.set(urlPath, pageInfo);

    // イベントを発火（CatalogManagerが購読）
    console.log('[RuntimePageRegistry] ✅✅✅ Firing PAGE_REGISTERED event:', urlPath, label, 'confirmed:', confirmed);
    const eventData = {
      urlPath: pageInfo.urlPath,
      label: pageInfo.label,
      confirmed: pageInfo.confirmed,
    };
    console.log('[RuntimePageRegistry] ✅ Event data:', JSON.stringify(eventData));
    this.eventEmitter.fire(eventData);
    console.log('[RuntimePageRegistry] ✅ Event fired successfully');
  }

  /**
   * ページを確認済みとしてマーク（loadイベント発火時）
   *
   * @param urlPath URLパス
   */
  confirmPage(urlPath: string): void {
    const page = this.pages.get(urlPath);
    if (page) {
      if (!page.confirmed) {
        page.confirmed = true;
        // 確認済みになった場合はイベントを発火
        this.eventEmitter.fire({
          urlPath: page.urlPath,
          label: page.label,
          confirmed: page.confirmed,
        });
      }
    } else {
      // 未登録の場合は新規登録（イベントはregisterPage内で発火される）
      this.registerPage(urlPath, true);
    }
  }

  /**
   * 登録されているページ一覧を取得（確定ページ優先）
   *
   * @returns ページ情報の配列（確定ページを先頭に、初回URLを最優先）
   */
  getPages(): RuntimePageInfo[] {
    const pages = Array.from(this.pages.values());

    // ソート: 1. 初回URLを最優先、2. 確定ページを優先、3. 初回検出時刻順
    return pages.sort((a, b) => {
      // 初回URLを最優先
      if (a.urlPath === this.initialUrl) return -1;
      if (b.urlPath === this.initialUrl) return 1;

      // 確定ページを優先
      if (a.confirmed && !b.confirmed) return -1;
      if (!a.confirmed && b.confirmed) return 1;

      // 初回検出時刻順
      return a.firstSeenAt - b.firstSeenAt;
    });
  }

  /**
   * ページが存在するか確認
   *
   * @param urlPath URLパス
   * @returns 存在する場合true
   */
  hasPage(urlPath: string): boolean {
    return this.pages.has(urlPath);
  }

  /**
   * ページ数を取得
   *
   * @returns 登録されているページ数
   */
  getPageCount(): number {
    return this.pages.size;
  }

  /**
   * URLパスから表示名を生成
   *
   * @param urlPath URLパス
   * @returns 表示名
   */
  private generateLabel(urlPath: string): string {
    if (urlPath === '/') {
      return 'Home';
    }

    // /admin/contacts → Admin Contacts
    const parts = urlPath
      .split('/')
      .filter(part => part.length > 0)
      .map(part => {
        // kebab-case, snake_case, camelCase を Title Case に変換
        return part
          .split(/[-_]/)
          .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
          .join(' ');
      });

    return parts.join(' ') || urlPath;
  }

  /**
   * レジストリをクリア（プロジェクト切り替え時など）
   */
  clear(): void {
    this.pages.clear();
    this.initialUrl = null;
  }
}

// シングルトンインスタンス
export const runtimePageRegistry = new RuntimePageRegistry();

