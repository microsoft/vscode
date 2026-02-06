# 旧実装の隔離状況

## 📋 旧実装の位置

`previewService.ts` 内の文字列リテラル内に以下の旧実装が存在：

1. **`GridBoundary`** (3357行目〜)
   - 旧実装の Grid boundary クラス
   - 新実装: `grid/gridMetrics.ts` の `GridBoundary` インターフェース

2. **`SlotResolver`** (3487行目〜)
   - 旧実装の Slot resolver クラス
   - 新実装: `dnd/slotResolver.ts` の `SlotResolver` クラス

3. **`PreviewApplyLayer`** (2833行目〜)
   - 旧実装の Apply layer クラス
   - 新実装: `dnd/apply/applyMove.ts` の `applyMove()` 関数

4. **`LayoutInteractionController`** (5710行目〜)
   - 旧実装の Layout interaction controller クラス
   - 新実装: 統合が必要（`dnd/slotResolver.ts` と `dnd/guideRenderer.ts` を使用）

## 🔄 参照箇所

### SlotResolver の使用
- `LayoutInteractionController` コンストラクタ (5719行目): `this.slotResolver = new SlotResolver(this.layoutTreeService);`
- `updateDrag()` メソッド (5978行目): `this.slotResolver.resolveSlot(...)`

### PreviewApplyLayer の使用
- `apply()` メソッド (2840行目): `PreviewApplyLayer.apply(action)`

## ⚠️ 注意事項

`previewService.ts` は巨大な文字列リテラル（約7452行）なので、直接編集は困難です。

統合方法：
1. 新実装を ES Modules 形式の文字列リテラルとして作成
2. `previewService.ts` でそれを読み込む
3. 旧実装をコメントアウトまたは削除
4. 参照を新実装に切り替え

## 📝 次のステップ

1. 新実装を文字列リテラルとして統合
2. 旧実装をコメントアウト
3. 参照を新実装に切り替え
4. 動作確認

