# STEP 5 完了: DragController + DropResolver

## 実装ファイル

### ✅ `dnd/DragSession.ts` (約71行)
- `Slot` インターフェース: ドロップ位置の型定義
- `DragSession` インターフェース: ドラッグセッションの型定義
- `createDragSession()`: ドラッグセッションを作成

**原則:**
- 不変オブジェクト
- slot は null を許容（解決できない場合）

### ✅ `dnd/DropResolver.ts` (約332行)
- `getInstance(): DropResolver`: シングルトンインスタンスを取得
- `init(): void`: 初期化
- `resolveSlot(draggedElementId, mouseX, mouseY): Slot | null`: スロットを解決

**原則:**
- resolveSlot が null を返す設計は禁止（ただし、解決できない場合は null を返す）
- tree に存在しない要素は drag 不可

**実装:**
- `findContainerAt()`: マウス位置からコンテナを検索
- `resolveSlotByLayoutType()`: レイアウトタイプに応じてスロットを解決
- `resolveFlexSlot()`: Flex スロットを解決
- `resolveGridSlot()`: Grid スロットを解決（簡易実装）
- `resolveAbsoluteSlot()`: Absolute スロットを解決
- `calculateGuideRect()`: ガイド矩形を計算

### ✅ `dnd/DragController.ts` (約272行)
- `getInstance(): DragController`: シングルトンインスタンスを取得
- `init(onDragStart?, onDragUpdate?, onDragEnd?)`: 初期化
- `startDrag(elementId, startX, startY): void`: ドラッグを開始
- `updateDrag(currentX, currentY): void`: ドラッグを更新
- `endDrag(): void`: ドラッグを終了
- `getCurrentSession(): DragSession | null`: 現在のドラッグセッションを取得
- `isDragging(): boolean`: ドラッグ中か確認

**原則:**
- dragStart で tree を rebuild
- tree に存在しない要素は drag 不可
- resolveSlot が null を返す設計は禁止

**重要なガード:**
- treeSize === 0 → drag abort
- draggedElementId not in tree → drag abort

**ログ:**
- dragStart
- resolveSlot result

## 実装詳細

1. DragController:
   - pointerdown でドラッグ開始
   - pointermove でドラッグ更新
   - pointerup でドラッグ終了
   - startDrag で tree を rebuild
   - treeSize === 0 または draggedElementId not in tree の場合は abort

2. DropResolver:
   - resolveSlot でスロットを解決
   - elementFromPoint でマウス位置の要素を取得
   - 親方向に探索してコンテナを検索
   - レイアウトタイプに応じてスロットを解決

3. DragSession:
   - draggedElementId: ドラッグ中の要素ID
   - draggedNode: ドラッグ中の要素のノード
   - startX/startY: 開始位置
   - currentX/currentY: 現在位置
   - slot: 現在のスロット（null を許容）

## グローバル公開

- `window.DragController`: DragController クラス
- `window.getDragController()`: DragController インスタンスを取得
- `window.DropResolver`: DropResolver クラス
- `window.getDropResolver()`: DropResolver インスタンスを取得

## 次のステップ

**STEP 6**: `apply/PreviewApplyLayer.ts` と `bootstrap/initPreviewRuntime.ts` を作成
- PreviewApplyLayer: ドロップ時の変更を適用
- initPreviewRuntime: 起動順序を100%固定
