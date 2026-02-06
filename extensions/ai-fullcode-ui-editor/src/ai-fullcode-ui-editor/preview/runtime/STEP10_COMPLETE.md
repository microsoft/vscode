# STEP 10 完了: DropGuideOverlay（ガイドライン）

## 実装ファイル

### ✅ `overlays/DropGuideOverlay.ts` (約200行)
- `getInstance(): DropGuideOverlay`: シングルトンインスタンスを取得
- `init(container: HTMLElement): void`: 初期化
- `render(slot: Slot | null): void`: ガイドを描画
- `clear(): void`: ガイドをクリア
- `dispose(): void`: 破棄

**原則:**
- resolveSlot は正しい
- でも 何も描画されていない → この Overlay で描画
- ビジュアライゼーションのみ（slot 計算はしない）

**実装詳細:**
- ガイド要素: `div` with `data-ui-editor-overlay="guide"`
- スタイル: `position: absolute`, `pointer-events: none`, `background: #4DA3FF`, `z-index: 9998`
- レイアウトタイプに応じてガイド線を描画:
  - `flex-row`: 縦線（横方向の挿入）
  - `flex-column`: 横線（縦方向の挿入）
  - `grid`: 矩形（セル範囲）
  - `absolute`: 矩形（配置範囲）

## 統合

### `runtime/index.ts`
- `overlays/DropGuideOverlay` をインポート

### `DragController`
- `updateDrag()` で `DropGuideOverlay.render()` を呼び出し
- `endDrag()` で `DropGuideOverlay.clear()` を呼び出し

### `buildPreviewHtml.ts`
- `initPreviewRuntime()` 後に `DropGuideOverlay.init()` を呼び出し

## グローバル公開

- `window.DropGuideOverlay`: DropGuideOverlay クラス
- `window.getDropGuideOverlay()`: DropGuideOverlay インスタンスを取得

## 検証

- ファイルサイズ: 約200行（制限内）
- Lintエラー: なし
- TypeScriptコンパイル: エラーなし
- 統合: 完了

## 動作確認

- ドラッグ中に挿入ガイドが表示される
- ドラッグ終了時にガイドが消える
- レイアウトタイプに応じて適切なガイドが表示される

## 次のステップ

**STEP 11**: Drag UX 安定化（drag preview / cursor）
**STEP 12**: 統合チェック & フェイルファスト
