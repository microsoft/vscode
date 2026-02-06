# STEP 6 完了: PreviewApplyLayer

## 実装ファイル

### ✅ `apply/PreviewApplyLayer.ts` (約219行)
- `getInstance(): PreviewApplyLayer`: シングルトンインスタンスを取得
- `init(): void`: 初期化
- `assertElementExists(elementId: string): HTMLElement`: 要素の存在をアサート
- `applyMove(action: MoveElementAction): void`: 要素移動を適用
- `applyRemove(elementId: string): void`: 要素を削除
- `applyAdd(elementId, targetContainerId, targetIndex): void`: 要素を追加

**原則:**
- registry → DOM fallback の二段構え
- 見つからなければ即例外
- apply 時に DOM が必ず更新される

**型定義:**
- `MoveElementAction`: 要素移動アクション
  - `elementId`: 移動する要素ID
  - `targetContainerId`: 移動先コンテナID
  - `targetIndex`: 移動先インデックス
  - `targetRowIndex?`: Grid用: 行インデックス
  - `targetColumnIndex?`: Grid用: 列インデックス

## 実装詳細

1. assertElementExists:
   - ElementRegistry から取得（優先）
   - DOM fallback: `document.querySelector('[data-element-id="..."]')`
   - 見つからなければ即例外

2. applyMove:
   - 要素の存在をアサート
   - 要素が既に親要素を持っている場合は削除
   - Grid の場合は `grid-row-start` / `grid-column-start` を設定
   - 移動先コンテナに挿入

3. DragController との統合:
   - `endDrag()` で `PreviewApplyLayer.applyMove()` を呼び出し
   - スロットが存在する場合のみ適用

## グローバル公開

- `window.PreviewApplyLayer`: PreviewApplyLayer クラス
- `window.getPreviewApplyLayer()`: PreviewApplyLayer インスタンスを取得

## 検証

- ファイルサイズ: 219行（制限内）
- Lintエラー: なし
- TypeScriptコンパイル: エラーなし
- DragController との統合: 完了

## 次のステップ

**STEP 7**: `bootstrap/initPreviewRuntime.ts` を作成
- 起動順序を100%固定
- すべてのサービスを初期化
- 依存関係を解決
