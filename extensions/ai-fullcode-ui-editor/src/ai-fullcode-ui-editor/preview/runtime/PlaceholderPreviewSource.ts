/**
 * PlaceholderPreviewSource.ts
 *
 * PlaceholderApp を PreviewSource として実装。
 *
 * 既存の PlaceholderApp の挙動を一切変えず、
 * PreviewSource インターフェースに適合させる。
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 * （VSCode Webview内でTypeScriptファイルを直接実行することはできないため）
 *
 * TypeScriptコンパイルエラーは無視して構いません。
 */

/**
 * 設計ドキュメント: PlaceholderPreviewSource の実装
 *
 * 実際の実装は previewService.ts の getDesignSurfaceHtml() 内にあります。
 *
 * 設計思想:
 * - 既存のPlaceholderAppの挙動を一切変えない
 * - Phase 2の安定性を壊さない
 * - DesignSurfaceから差し替え可能にする
 *
 * 実装例（JavaScript文字列として生成される）:
 * ```javascript
 * class PlaceholderPreviewSource extends PreviewSource {
 *   mount(container) {
 *     const root = ReactDOM.createRoot(container);
 *     root.render(React.createElement(React.StrictMode, null,
 *       React.createElement(PlaceholderApp)
 *     ));
 *     this.root = root;
 *     this.isMountedFlag = true;
 *   }
 *
 *   unmount() {
 *     if (this.root) {
 *       this.root.unmount();
 *       this.root = null;
 *     }
 *     this.isMountedFlag = false;
 *   }
 * }
 * ```
 */
