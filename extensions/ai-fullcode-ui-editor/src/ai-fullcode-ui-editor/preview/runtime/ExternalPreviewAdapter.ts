/**
 * ExternalPreviewAdapter.ts
 *
 * 外部で実行されているアプリケーションを PreviewSource として扱う。
 *
 * 実行は Webview の外（localhost, browser, dev server 等）。
 * DesignSurfaceは Previewの投影面に過ぎない。
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 * （VSCode Webview内でTypeScriptファイルを直接実行することはできないため）
 *
 * TypeScriptコンパイルエラーは無視して構いません。
 */

/**
 * 設計ドキュメント: ExternalPreviewAdapter の実装
 *
 * 実際の実装は previewService.ts の getDesignSurfaceHtml() 内にあります。
 *
 * 設計思想:
 * - 外部で実行されているアプリケーションをPreviewSourceとして扱う
 * - 外部Previewのライフサイクル管理
 * - DOM構造の取得（読み取り専用）
 * - UI操作レイヤーへのDOM参照提供
 *
 * 制約:
 * - 直接操作は禁止
 * - MutationObserverは読み取り専用
 * - 書き換えは禁止
 * - iframe / proxy / postMessageは使用しない
 *
 * 接続方法（将来実装）:
 * - Chrome DevTools Protocol
 * - DOM Snapshot API
 * - 外部サーバーからのHTML取得
 * - WebSocket経由のDOM更新通知
 *
 * 実装例（JavaScript文字列として生成される）:
 * ```javascript
 * class ExternalPreviewAdapter extends PreviewSource {
 *   constructor(externalUrl) {
 *     super();
 *     this.externalUrl = externalUrl;
 *   }
 *
 *   mount(container) {
 *     // TODO: 外部Previewの接続
 *     // - Chrome DevTools Protocol
 *     // - DOM Snapshot API
 *     // - 外部サーバーからのHTML取得
 *   }
 * }
 * ```
 */
