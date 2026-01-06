# Drag & Drop 仕様書（Cursor 2.2 準拠）

## 📋 概要

このドキュメントは、Phase 7（Drag & Drop）の実装仕様を説明します。
Cursor 2.2 Visual Editor 準拠の設計で、DOM を一切変更せず、UI操作AST（MOVE_ELEMENT）のみを生成します。

---

## 🎯 設計原則（絶対に守ること）

1. **DOM は一切直接変更しない**
   - drag 中・drop 後も DOM は変化しない
   - 真実は UI操作AST（MOVE_ELEMENT）のみ

2. **Ghost / Slot Preview / Selection の完全分離**
   - 各レイヤーは独立して動作
   - 互いに影響を与えない

3. **Cursor 2.2 方式の厳守**
   - Ghost は「ドラッグ開始時のスナップショット」+ 差分移動
   - Slot Preview は LayoutTree の cached rect を使用
   - live DOM を毎フレーム再取得しない

---

## 🏗 アーキテクチャ

### 1. SelectionController（要素選択）

**責務:**
- 要素選択のみ
- `data-selected="true"` の付与
- `SELECT_ELEMENT` UIActionAST の生成

**禁止事項:**
- drag / resize に関与しない

**実装箇所:**
```typescript
class SelectionController {
  selectElement(element: HTMLElement): void
  getSelectedElement(): HTMLElement | null
  clearSelection(): void
}
```

---

### 2. LayoutInteractionController（ドラッグ操作）

**責務:**
- ドラッグ開始・更新・終了を担当
- Ghost / Slot Preview の管理
- `MOVE_ELEMENT` UIActionAST の生成

**状態管理:**
```typescript
class DragSession {
  draggedElementId: StableElementId
  draggedDomElement: HTMLElement
  startRect: DOMRect  // ✅ 固定スナップショット（一度だけ取得）
  currentGhostRect: DOMRect | null
  sourceParentId: StableElementId
  sourceIndex: number
  currentTargetParentId: StableElementId | null
  currentTargetIndex: number | null
  position: 'before' | 'after' | 'inside' | null
}
```

**フロー:**

#### startDrag()
1. `data-selected="true"` の要素のみ許可
2. `StableElementId` を取得
3. `LayoutTree` を更新（最新の DOM 状態を反映）
4. `sourceParentId` / `sourceIndex` を確定
5. **`startRect` を一度だけ取得（固定スナップショット）**
6. `DragSession` を生成
7. `Ghost` を生成（`startRect` を使用）

#### updateDrag()
1. **Ghost を `startRect + mouseDelta` で計算（live DOM を再取得しない）**
2. `LayoutTree` を更新（構造判定用）
3. `SlotResolver` で drop 可能位置を計算
4. **Slot Preview を描画（LayoutTree の cached rect を使用）**

#### endDrag()
1. Ghost / Slot Preview を破棄
2. **DOM は一切変更しない**
3. `MOVE_ELEMENT` UIActionAST を生成

---

### 3. GhostRenderer（Drag Ghost）

**目的:**
- ユーザーに「要素が動いている」感覚を与える
- DOM を動かさず UX を成立させる

**仕様:**
- `position: fixed`
- `pointer-events: none`
- `opacity: 0.6`
- `z-index: 10001`
- **`startRect` は固定（毎回再取得しない）**
- `transform: translate(deltaX, deltaY)` で移動

**実装:**
```typescript
class GhostRenderer {
  update(startRect: DOMRect, deltaX: number, deltaY: number): void
  clear(): void
}
```

**重要:**
- `startRect` は `startDrag()` 時に一度だけ取得
- `mousemove` では `startRect + mouseDelta` で計算
- live DOM を再取得しない（レイアウト変化に影響されない）

---

### 4. SlotPreviewRenderer（Slot Preview）

**目的:**
- drop 可能位置を視覚的に表示
- Figma ライクな細い青線のみ

**仕様:**
- `position: fixed`
- `pointer-events: none`
- `z-index: 10000`
- **LayoutTree の cached rect を使用（live DOM を再取得しない）**
- `before` / `after` / `inside` を明確に分離

**実装:**
```typescript
class SlotPreviewRenderer {
  render(slot: Slot, targetNode: LayoutNode): void
  clear(): void
}
```

**重要:**
- `slot.targetNode.rect` は drag 開始時に snapshot した値
- live DOM を触らない（Ghost と Slot Preview のズレを防ぐ）

---

### 5. LayoutTreeService（Layout Tree）

**目的:**
- DOM 構造の仮想表現
- 構造判定用（rect は snapshot）

**仕様:**
- `elementId → LayoutNode` の Map
- `elementId → DOM要素` の Map（逆引き用）
- `buildFromDOM()`: DOM から Tree を構築
- `updateTree()`: Tree を更新（全体再構築）

**LayoutNode:**
```typescript
interface LayoutNode {
  elementId: StableElementId
  parentId: StableElementId | null
  children: StableElementId[]
  tagName: string
  rect: DOMRect  // ✅ snapshot（drag 開始時に固定）
}
```

**重要:**
- `rect` は `getBoundingClientRect()` の snapshot
- 構造判定用のみ（描画位置は cached rect を使用）

---

### 6. SlotResolver（スロット解決）

**目的:**
- マウス位置から drop 可能位置を計算
- `before` / `after` / `inside` を判定

**実装:**
```typescript
class SlotResolver {
  resolveSlot(mouseX: number, mouseY: number, draggedElementId: StableElementId): Slot | null
}
```

**Slot:**
```typescript
interface Slot {
  targetParentId: StableElementId | null
  index: number
  position: 'before' | 'after' | 'inside'
  targetNode: LayoutNode  // ✅ cached rect を含む
}
```

---

### 7. MOVE_ELEMENT UIActionAST

**構造:**
```typescript
interface MOVE_ELEMENT_UIActionAST {
  operationId: string
  type: 'MOVE_ELEMENT'
  elementId: StableElementId
  fromParentId: StableElementId
  fromIndex: number
  toParentId: StableElementId
  toIndex: number
  timestamp: number
  // ✅ 重要: target は含めない
}
```

**生成タイミング:**
- `endDrag()` 時に `dragSession.hasValidTarget()` が `true` の場合のみ

---

### 8. UIActionStore（UI操作AST ストア）

**責務:**
- UI操作AST を蓄積・取得
- `type` ごとに分岐処理

**実装:**
```typescript
class UIActionStore {
  add(action: UIActionAST): void {
    switch(action.type) {
      case SELECT_ELEMENT:
      case HOVER_ELEMENT:
        // target 必須
        break;
      case MOVE_ELEMENT:
        // ✅ target 参照禁止
        break;
    }
  }
}
```

---

## 🎨 Z-index レイヤー（明確化）

```
z-index: 10000  →  Slot Preview（最下層）
z-index: 10001  →  Drag Ghost（中間層）
z-index: 10002  →  Selection Outline（最上層）
```

**重要:**
- レイヤー順序を固定することでバグが激減
- 各レイヤーは独立して動作

---

## ⚠️ 重要な注意点

### 注意1: Ghost の rect を「live DOM から毎回再取得」しない

**❌ 間違った実装:**
```typescript
updateDrag(currentX, currentY) {
  const currentRect = this.dragElement.getBoundingClientRect(); // ❌ 毎回再取得
  this.ghostRenderer.update(currentRect, deltaX, deltaY);
}
```

**✅ 正しい実装:**
```typescript
startDrag(element, startX, startY) {
  const startRect = element.getBoundingClientRect(); // ✅ 一度だけ取得
  this.dragSession.startRect = startRect;
}

updateDrag(currentX, currentY) {
  const deltaX = currentX - this.dragStartX;
  const deltaY = currentY - this.dragStartY;
  const startRect = this.dragSession.startRect; // ✅ 固定スナップショット
  this.ghostRenderer.update(startRect, deltaX, deltaY); // ✅ 差分移動のみ
}
```

**理由:**
- Ghost は「ドラッグ開始時のスナップショット」であるべき
- live DOM を再取得するとレイアウト変化に影響される
- スクロール / Resize / CSS 変更に影響
- Slot Preview とズレる可能性

---

### 注意2: Slot Preview が live DOM rect 依存にならない

**❌ 間違った実装:**
```typescript
render(slot, targetDomElement) {
  const rect = targetDomElement.getBoundingClientRect(); // ❌ live DOM から取得
  // ...
}
```

**✅ 正しい実装:**
```typescript
render(slot) {
  const rect = slot.targetNode.rect; // ✅ LayoutTree の cached rect
  // ...
}
```

**理由:**
- Slot Preview は LayoutTree の cached rect を使用
- live DOM 依存にすると Ghost と Slot Preview のズレが発生
- レンダリング順の違いでチラつき

---

## 🔄 ドラッグフロー（完全版）

```
1. ユーザーが要素をクリック
   ↓
2. SelectionController.selectElement()
   - data-selected="true" を付与
   - SELECT_ELEMENT UIActionAST を生成
   ↓
3. ユーザーが要素をドラッグ開始（mousedown）
   ↓
4. LayoutInteractionController.startDrag()
   - data-selected="true" を確認
   - StableElementId を取得
   - LayoutTree を更新
   - sourceParentId / sourceIndex を確定
   - startRect を一度だけ取得（固定スナップショット）
   - DragSession を生成
   - Ghost を生成（startRect を使用）
   ↓
5. ユーザーがマウスを移動（mousemove）
   ↓
6. LayoutInteractionController.updateDrag()
   - Ghost を startRect + mouseDelta で計算（live DOM を再取得しない）
   - LayoutTree を更新（構造判定用）
   - SlotResolver で drop 可能位置を計算
   - Slot Preview を描画（LayoutTree の cached rect を使用）
   ↓
7. ユーザーがマウスを離す（mouseup）
   ↓
8. LayoutInteractionController.endDrag()
   - Ghost / Slot Preview を破棄
   - DOM は一切変更しない
   - MOVE_ELEMENT UIActionAST を生成（hasValidTarget() が true の場合のみ）
   - UIActionStore に追加
   ↓
9. ChangePlan を生成（Phase 5）
   ↓
10. ユーザーが Apply を実行（Phase 6）
    - 実際のコード変更が行われる
```

---

## 📊 状態遷移図

```
[要素選択]
  ↓
[data-selected="true"]
  ↓
[mousedown on selected element]
  ↓
[DragSession 生成]
  ↓
[Ghost 表示] ←→ [Slot Preview 表示]
  ↓
[mouseup]
  ↓
[MOVE_ELEMENT UIActionAST 生成]
  ↓
[ChangePlan 生成]
  ↓
[Apply（ユーザー確認後）]
  ↓
[コード変更]
```

---

## 🧪 テスト観点

### 正常系
- [ ] 要素を選択してドラッグ開始できる
- [ ] Ghost がマウスに追従する
- [ ] Slot Preview が正しい位置に表示される
- [ ] drop 時に MOVE_ELEMENT UIActionAST が生成される
- [ ] DOM は drag 中・drop 後も変化しない

### 異常系
- [ ] 選択されていない要素はドラッグできない
- [ ] リサイズハンドルをクリックしてもドラッグが開始されない
- [ ] ターゲットが見つからない場合は Slot Preview がクリアされる
- [ ] エラーが発生しても Preview は壊れない

### パフォーマンス
- [ ] Ghost の rect を毎回再取得していない
- [ ] Slot Preview が live DOM を触っていない
- [ ] LayoutTree の更新が適切なタイミングで行われている

---

## 🔮 将来の改善余地

### 改善①: Ghost は「コピー」ではなく「プロキシ」
- 現在: DOM clone（簡易版）
- 将来: Visual proxy（背景 / border / size だけ、子要素は描画しない）

### 改善②: DragSession に「mode」を追加
```typescript
mode: 'reorder' | 'move-into' | 'absolute'
```

### 改善③: LayoutTree の差分更新
- 現在: 全体再構築
- 将来: 差分更新（パフォーマンス改善）

---

## 📝 まとめ

### 設計の優位性
- **OSS移行前より「設計としては」良くなっている**
- OSS前: DOM を直接動かしていた可能性が高い（ブラウザ任せで「たまたま」ズレなかった）
- 現在: Cursor / Figma 型（AST / Apply / AI 前提）
- **長期的には今の方が100倍正しい**

### 核心原則
1. **DOM は一切直接変更しない**
2. **Ghost は startRect + mouseDelta（固定スナップショット）**
3. **Slot Preview は LayoutTree の cached rect（live DOM を触らない）**
4. **真実は UI操作AST（MOVE_ELEMENT）のみ**

---

**最終更新:** 2024年（Phase 7 完全再設計後）

