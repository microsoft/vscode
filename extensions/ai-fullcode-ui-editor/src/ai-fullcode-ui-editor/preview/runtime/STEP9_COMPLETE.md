# STEP 9 完了: PreviewApplyLayer（DOMを動かす）

## 実装ファイル

### ✅ `apply/PreviewApplyLayer.ts` (約280行)
- `getInstance(): PreviewApplyLayer`: シングルトンインスタンスを取得
- `init(): void`: 初期化
- `apply(action: UIAction): void`: 統一 apply メソッド
- `applyMove(action: MoveElementAction): void`: 要素移動を適用
- `applyInsert(action: InsertElementAction): void`: 要素挿入を適用
- `applyRemove(elementId: string): void`: 要素削除を適用
- `assertElementExists(elementId: string): HTMLElement`: 要素の存在をアサート

**原則:**
- registry → DOM fallback の二段構え
- 見つからなければ即例外
- apply 時に DOM が必ず更新される
- DOM ノードを再作成しない（既存ノードを移動）
- Registry の整合性を保つ

**実装詳細:**
- MOVE_ELEMENT: ElementRegistry から要素を取得 → 親から削除 → 新しい親に挿入
- 同じ親内での移動を最適化
- Grid の場合は `grid-row-start` / `grid-column-start` を設定
- ElementRegistry は WeakMap を使用しているため、DOM 移動後も自動的に追従

**型定義:**
- `MoveElementAction`: 要素移動アクション
- `InsertElementAction`: 要素挿入アクション（スタブ）
- `RemoveElementAction`: 要素削除アクション（スタブ）
- `UIAction`: 統一インターフェース

## 統合

### `DragController.endDrag()`
- `PreviewApplyLayer.applyMove()` を呼び出し
- スロットが存在する場合のみ適用

## グローバル公開

- `window.PreviewApplyLayer`: PreviewApplyLayer クラス
- `window.getPreviewApplyLayer()`: PreviewApplyLayer インスタンスを取得

## 検証

- ファイルサイズ: 約280行（制限内）
- Lintエラー: なし
- TypeScriptコンパイル: エラーなし
- 統合: 完了

## 動作確認

- ドラッグ&ドロップで実際の DOM ノードが移動する
- リレンダリングなし
- 重複ノードなし
- Registry の整合性が保たれる

## 次のステップ

**STEP 10**: `DropGuideOverlay` の実装（ガイドライン表示）
