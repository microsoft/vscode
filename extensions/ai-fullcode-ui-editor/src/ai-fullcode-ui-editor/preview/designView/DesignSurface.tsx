/**
 * DesignSurface.tsx
 *
 * Preview表示専用のReactコンポーネント。
 *
 * このコンポーネントは「表示レイヤー」に徹する。
 * UI操作・UI操作AST・イベントフック等は一切入れない。
 *
 * 将来この上に ElementOverlay や UI操作レイヤーが
 * "安全に重ねられる" ことだけを意識する。
 *
 * 注意: このファイルは設計ドキュメントとして残します。
 * 実際の実装は previewService.ts 内でJavaScript文字列として生成されます。
 * （VSCode Webview内でTypeScript/JSXファイルを直接実行することはできないため）
 */

/**
 * 設計ドキュメント: DesignSurface の実装
 *
 * 実際の実装は previewService.ts の getDesignSurfaceHtml() 内にあります。
 *
 * 設計思想:
 * - Preview表示専用のReactコンポーネント
 * - 表示レイヤーに徹する（UI操作・UI操作AST・イベントフック等は一切入れない）
 * - useEffectでmountAppを呼ぶ
 * - unmount処理を必ず実装
 * - stateを極力持たない（表示責務のみ）
 * - 将来この上にElementOverlayやUI操作レイヤーが安全に重ねられる構造
 *
 * 実装例（JavaScript文字列として生成される）:
 * ```javascript
 * function PlaceholderApp() {
 *   return React.createElement('div', { style: {...} }, ...);
 * }
 *
 * function DesignSurface() {
 *   const containerRef = useRef(null);
 *   useEffect(() => {
 *     mountApp(containerRef.current, PlaceholderApp);
 *     return () => unmount();
 *   }, []);
 *   return React.createElement('div', { ref: containerRef, ... });
 * }
 * ```
 */
