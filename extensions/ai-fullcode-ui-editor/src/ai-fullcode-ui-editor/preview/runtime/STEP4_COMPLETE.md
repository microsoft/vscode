# STEP 4 完了: SelectionController

## 実装ファイル

### ✅ `selection/SelectionState.ts` (約50行)
- `SelectionState` インターフェース: 選択状態の型定義
- `createEmptySelectionState()`: 空の選択状態を作成
- `createSelectionState()`: 選択状態を作成

**原則:**
- 不変オブジェクト
- selectedElementId は null を許容しない（選択されていない場合は空文字列）

### ✅ `selection/SelectionController.ts` (約200行)
- `getInstance(): SelectionController`: シングルトンインスタンスを取得
- `init(onSelectionChange?): void`: 初期化
- `onClick(event: PointerEvent): void`: クリックイベントを処理
- `setSelected(elementId: string): void`: 選択を設定
- `getSelected(): string`: 選択されたIDを取得
- `getState(): SelectionState`: 選択状態を取得
- `hasSelection(): boolean`: 選択が有効か確認

**原則:**
- hitTest は registry → DOM fallback
- null selection を許容しない（空文字列を使用）
- DOM操作を一切行わない

**検証:**
- click → elementId が必ず出ること

## 実装詳細

1. hitTest:
   - ElementRegistry から取得（優先）
   - DOM fallback: data-element-id を直接読む
   - 親方向に探索

2. 選択管理:
   - selectedElementId は null を許容しない（空文字列を使用）
   - 選択状態変更時にコールバックを呼び出し

## グローバル公開

- `window.SelectionController`: SelectionController クラス
- `window.getSelectionController()`: SelectionController インスタンスを取得

## 次のステップ

**STEP 5**: `dnd/DragSession.ts`, `dnd/DragController.ts`, `dnd/DropResolver.ts` を作成
- DragSession: ドラッグセッションの型定義
- DragController: ドラッグ制御
- DropResolver: ドロップ位置の解決
