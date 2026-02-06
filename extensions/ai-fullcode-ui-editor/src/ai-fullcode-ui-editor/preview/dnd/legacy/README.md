# Legacy Implementation Files

このディレクトリには、旧実装のTypeScriptファイルが保存されています。

## ファイル一覧

### Slot Resolver
- `slotResolver.ts` (363行) - 旧実装の TypeScript 版 SlotResolver クラス
  - 現在は `dnd/slot/resolveSlot.ts` (JavaScript版) を使用

### Guide Renderer
- `guideRenderer.ts` (116行) - 旧実装の TypeScript 版 GuideRenderer クラス
  - 現在は `dnd/guide/guideRendererJs.ts` (JavaScript版) を使用

### Apply Functions
- `applyMove.ts` - 旧実装の TypeScript 版 applyMove 関数
- `applyGrid.ts` - 旧実装の TypeScript 版 applyGrid 関数
- `applyFlex.ts` - 旧実装の TypeScript 版 applyFlex 関数
- `applyAbsolute.ts` - 旧実装の TypeScript 版 applyAbsolute 関数
  - 現在は `dnd/apply/*Js.ts` (JavaScript版) を使用

## 注意事項

これらのファイルは**参照用**として保存されていますが、現在の実装では使用されていません。

現在の実装では、Webview に注入する JavaScript 文字列として `*Js.ts` ファイルを使用しています。

## 削除について

将来的に完全に不要と判断した場合は、このディレクトリごと削除できます。

