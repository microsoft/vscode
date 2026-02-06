# STEP 0: 完全削除完了

## 削除されたファイル

### DnD関連
- ✅ `dnd/resolveSlot.ts` - 削除済み
- ✅ `dnd/GuideRenderer.ts` - 削除済み

### Selection関連
- ✅ `selection/SelectionController.ts` - 削除済み

### Layout関連
- ✅ `layout/LayoutTreeService.ts` - 削除済み
- ⚠️ `layout/ViewportTransformService.ts` - 保持（新実装で必要になる可能性）

### Registry関連
- ✅ `registry/ElementRegistry.ts` - 削除済み
- ✅ `registry/SlotRegistry.ts` - 削除済み

### Apply関連
- ✅ `apply/PreviewApplyLayer.ts` - 削除済み

### Interaction関連
- ✅ `interaction/LayoutInteractionController.ts` - 削除済み

### その他
- ✅ `DOMObserverBridge.ts` - 削除済み
- ✅ `overlay/SelectionOverlay.ts` - 削除済み

## 新ディレクトリ構成

```
preview/runtime/
├── core/              # ✅ 作成済み
│   ├── PreviewRoot.ts
│   ├── ElementId.ts
│   └── ElementRegistry.ts
│
├── tree/              # ✅ 作成済み
│   ├── LayoutNode.ts
│   └── LayoutTree.ts
│
├── selection/          # ✅ 作成済み（空）
│   ├── SelectionState.ts
│   └── SelectionController.ts
│
├── dnd/               # ✅ 作成済み（空）
│   ├── DragSession.ts
│   ├── DragController.ts
│   └── DropResolver.ts
│
├── apply/             # ✅ 作成済み（空）
│   └── PreviewApplyLayer.ts
│
├── bootstrap/         # ✅ 作成済み（空）
│   └── initPreviewRuntime.ts
│
└── index.ts           # ✅ クリーンアップ済み
```

## 次のステップ

**STEP 1**: `core/PreviewRoot.ts` と `core/ElementId.ts` を作成
- PreviewRoot: previewRoot要素の確定責務
- ElementId: ID生成・検証ロジック
