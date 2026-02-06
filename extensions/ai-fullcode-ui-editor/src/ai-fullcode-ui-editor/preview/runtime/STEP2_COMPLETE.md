# STEP 2 完了: ElementRegistry

## 実装ファイル

### ✅ `core/ElementRegistry.ts` (約250行)
- `getInstance(): ElementRegistry`: シングルトンインスタンスを取得
- `scan(root: HTMLElement): void`: DOMを走査して要素を登録
- `get(id: string): HTMLElement | null`: IDからDOM要素を取得
- `has(id: string): boolean`: IDが登録されているか確認
- `size(): number`: 登録されている要素数を返す
- `getAllIds(): string[]`: すべての登録IDを取得
- `getIdFromElement(element: HTMLElement): string | null`: 要素からIDを取得（逆引き）
- `clear(): void`: すべての登録をクリア

**原則:**
- DOM が存在すれば必ず registry に載る
- registry が空なら drag 不可
- DOM 参照を絶対に保持（WeakMap 使用）
- scan後 size() === 0 は例外

**ハード制約:**
- `scan()` 後 `size() === 0` の場合は例外をthrow
- DOM要素が削除された場合は自動的に登録から削除

**ログ:**
- 登録 elementId を最初の10件出力
- 重複IDの警告
- 無効なIDの警告

## グローバル公開

- `window.ElementRegistry`: ElementRegistry クラス
- `window.getElementRegistry()`: ElementRegistry インスタンスを取得

## 次のステップ

**STEP 3**: `tree/LayoutNode.ts` と `tree/LayoutTree.ts` を作成
- LayoutNode: ツリーの最小単位
- LayoutTree: tree 構築・検索
