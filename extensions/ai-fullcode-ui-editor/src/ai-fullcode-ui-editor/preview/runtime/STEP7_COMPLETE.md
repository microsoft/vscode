# STEP 7 完了: Bootstrap（起動順を固定）

## 実装ファイル

### ✅ `bootstrap/initPreviewRuntime.ts` (約199行)
- `initPreviewRuntime(rootElement?): void`: PreviewRuntime を初期化
- `PreviewRuntimeInitError`: 初期化エラー用のカスタムエラー

**原則:**
- 初期化順を絶対固定
- 順序違反は即クラッシュ

**初期化順序:**
1. PreviewRoot.get()
2. ElementRegistry.scan()
3. LayoutTree.rebuild()
4. SelectionController.init()
5. DropResolver.init()
6. PreviewApplyLayer.init()
7. DragController.init()

**最終チェック:**
- treeSize > 0
- registry.size > 0

## 実装詳細

1. 初期化順序の固定:
   - 各ステップでエラーチェック
   - 順序違反は即クラッシュ（PreviewRuntimeInitError）
   - 各ステップ完了時にログ出力

2. エラーハンドリング:
   - PreviewRuntimeInitError でカスタムエラー
   - ステップ情報を含むエラーメッセージ
   - 予期しないエラーもキャッチしてラップ

3. 最終チェック:
   - treeSize > 0 を確認
   - registry.size > 0 を確認
   - 失敗時は即クラッシュ

## グローバル公開

- `window.initPreviewRuntime(rootElement?)`: PreviewRuntime を初期化
- `window.PreviewRuntimeInitError`: 初期化エラー用のカスタムエラー

## 検証

- ファイルサイズ: 199行（制限内）
- Lintエラー: なし
- TypeScriptコンパイル: エラーなし
- 初期化順序: 固定

## 使用方法

```typescript
// 自動検出
initPreviewRuntime();

// または、ルート要素を明示的に指定
const rootElement = document.getElementById('design-surface-container');
initPreviewRuntime(rootElement);
```

## 完了

すべてのSTEPが完了しました。Cursor 2.x準拠のDnDシステムが完成しました。
