# Drag & Drop リファクタリング状況

## ✅ 完了した作業

### 1. 新実装ファイルの作成

#### 型定義
- ✅ `dnd/types.ts` - Slot, MoveElementAction, Rect などの型定義

#### Layout Introspection
- ✅ `layout/layoutIntrospection.ts` - レイアウトタイプ判定の一元化

#### Grid 関連
- ✅ `grid/gridMetrics.ts` - Grid track/boundary 算出
- ✅ `grid/gridHitTest.ts` - mouse -> row/col 判定

#### Slot Resolver
- ✅ `dnd/slotResolver.ts` - 統一的な slot 解決（Grid/Flex/Absolute）

#### Guide Renderer
- ✅ `dnd/guideRenderer.ts` - slot -> guide DOM 描画

#### Apply
- ✅ `dnd/apply/applyMove.ts` - slot.kind 別の apply 分岐
- ✅ `dnd/apply/applyGrid.ts` - gridRowStart/gridColumnStart 更新のみ
- ✅ `dnd/apply/applyFlex.ts` - insertIndex で DOM 並び替え
- ✅ `dnd/apply/applyAbsolute.ts` - transform/left/top 更新

#### テスト
- ✅ `dnd/test/testPage.html` - 動作確認用のテスト画面

## 🔄 次のステップ

### 2. previewService.ts との統合

現在、`previewService.ts` は巨大な JavaScript 文字列リテラルとして Webview に注入されています。

統合方法：
1. 新実装の TypeScript ファイルを JavaScript にコンパイル
2. コンパイルされた JavaScript を文字列として読み込み
3. `getDesignSurfaceHtml()` で注入

または、より良い方法：
1. 新実装を ES Modules として実装
2. Webview で直接 import できるようにする（Vite 等を使用）

### 3. 旧実装の削除/隔離

以下のクラス/関数を `legacy/` に移行：
- `SlotResolver` (旧実装)
- `GridBoundary` (旧実装)
- `LayoutInteractionController` (旧実装の一部)
- `PreviewApplyLayer` (旧実装)

### 4. import 参照の切り替え

`previewService.ts` 内の旧実装への参照を新実装に置き換え：
- `new SlotResolver()` → 新実装の `SlotResolver`
- `PreviewApplyLayer.apply()` → 新実装の `applyMove()`

## 📋 実装の詳細

### Slot 駆動設計

```typescript
interface Slot {
  kind: 'grid' | 'flex' | 'abs';
  containerId: string;
  renderGuideRect: Rect; // 必須、fallback 禁止
  // Grid の場合
  targetRow?: number;
  targetCol?: number;
  // Flex の場合
  insertIndex?: number;
  // Absolute の場合
  x?: number;
  y?: number;
}
```

### MOVE_ELEMENT Action

```typescript
interface MoveElementAction {
  // ... 既存フィールド
  slot: Slot; // 必須
  // targetRowIndex/targetColumnIndex は非推奨（slot を使用）
}
```

### Apply の分岐

```typescript
switch (action.slot.kind) {
  case 'grid':
    return applyGrid(action, layoutTreeService);
  case 'flex':
    return applyFlex(action, layoutTreeService);
  case 'abs':
    return applyAbsolute(action, layoutTreeService);
}
```

## 🐛 修正されたバグ

1. ✅ `undefined.toString()` エラーの根絶（型安全性）
2. ✅ Grid 全体を貫通するガイドの根絶（renderGuideRect のみ使用）
3. ✅ `Unexpected token '.'` エラーの根絶（ES5 互換性）

## 🎯 成功基準

- [x] Grid/Flex/Absolute を統一的に扱う
- [x] slot 駆動設計
- [x] 1ファイル500行前後
- [x] 型安全性（undefined 排除）
- [ ] 旧実装の削除/隔離
- [ ] previewService.ts との統合
- [ ] 動作確認

## 📝 注意事項

- 新実装は TypeScript ファイルとして実装されているため、Webview に注入する前に JavaScript にコンパイルする必要があります
- 旧実装は `previewService.ts` の巨大な文字列リテラル内にあるため、段階的に置き換える必要があります
- `LayoutTreeService` などの既存サービスとの統合が必要です

