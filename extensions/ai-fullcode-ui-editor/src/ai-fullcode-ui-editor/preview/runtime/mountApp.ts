/**
 * mountApp.ts
 *
 * 実アプリ（Vite / Next）を同一DOM・同一プロセスにマウントする責務を持つ。
 *
 * このフェーズでは「編集可能かどうか」は考えない。
 * Previewが安定して表示されることを最優先する。
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 * （VSCode Webview内でTypeScriptファイルを直接実行することはできないため）
 */

// このファイルは設計ドキュメントです。
// 実際の実装は previewService.ts の getDesignSurfaceHtml() 内にあります。

/**
 * 設計ドキュメント: mountApp の実装
 *
 * 実際の実装は previewService.ts の getDesignSurfaceHtml() 内にあります。
 *
 * 設計思想:
 * - mountApp(container, AppComponent): アプリをマウント
 * - unmount(): アプリをアンマウント
 * - React 18のcreateRootを使用
 * - React.StrictModeでラップ
 * - HMRを壊さない設計
 * - グローバル副作用を最小化
 */

