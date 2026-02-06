# STEP 8 完了: SelectionOverlay

## 実装ファイル

### ✅ `overlays/SelectionOverlay.ts` (約200行)
- `getInstance(): SelectionOverlay`: シングルトンインスタンスを取得
- `init(container: HTMLElement): void`: 初期化
- `update(state: SelectionState | null): void`: 選択状態を更新
- `clear(): void`: オーバーレイをクリア
- `dispose(): void`: 破棄

**原則:**
- SelectionController は描画しない
- Overlay が selectionState を可視化する
- ビジネスロジックなし
- DOM クエリはレンダリングのみ

**実装詳細:**
- オーバーレイ要素: `div` with `data-ui-editor-overlay="selection"`
- スタイル: `position: absolute`, `pointer-events: none`, `border: 2px solid #4DA3FF`
- SelectionController の状態変更を購読
- bounds がない場合は非表示

## 統合

### `runtime/index.ts`
- `overlays/SelectionOverlay` をインポート

### `buildPreviewHtml.ts`
- `initPreviewRuntime()` 後に `SelectionOverlay.init()` を呼び出し
- `SelectionController` のコールバックで `SelectionOverlay.update()` を呼び出し

## グローバル公開

- `window.SelectionOverlay`: SelectionOverlay クラス
- `window.getSelectionOverlay()`: SelectionOverlay インスタンスを取得

## 検証

- ファイルサイズ: 約200行（制限内）
- Lintエラー: なし
- TypeScriptコンパイル: エラーなし
- 統合: 完了

## 動作確認

- 要素をクリックすると青い矩形が表示される
- コンソールエラーなし
- 選択を解除するとオーバーレイが非表示になる

## 次のステップ

**STEP 9**: `PreviewApplyLayer` の DOM反映を確認（既に実装済み）
**STEP 10**: `DropGuideOverlay` の実装（ガイドライン表示）
