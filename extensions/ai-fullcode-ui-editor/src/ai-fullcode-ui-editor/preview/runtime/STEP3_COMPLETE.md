# STEP 3 完了: LayoutTree

## 実装ファイル

### ✅ `tree/LayoutNode.ts` (約90行)
- `LayoutNode` インターフェース: ツリーの最小単位
- `createLayoutNode()`: LayoutNodeを作成
- `detectLayoutType()`: レイアウトタイプを判定

**原則:**
- 不変オブジェクト
- 親子関係を保持
- レイアウトタイプを保持

### ✅ `tree/LayoutTree.ts` (約280行)
- `getInstance(): LayoutTree`: シングルトンインスタンスを取得
- `rebuild(root, registry): void`: ツリーを再構築
- `findById(id): LayoutNode | null`: IDでノードを検索
- `requireById(id): LayoutNode`: IDでノードを検索（必須版、見つからない場合は例外）
- `size(): number`: ツリーサイズを返す
- `getRoot(): LayoutNode | null`: ルートノードを取得
- `getAllNodes(): Map<string, LayoutNode>`: すべてのノードを取得
- `getParent(elementId): LayoutNode | null`: 親ノードを取得
- `getChildren(elementId): LayoutNode[]`: 子ノードを取得
- `clear(): void`: ツリーをクリア

**原則:**
- tree は drag 開始前に必ず rebuild
- 空ツリーは例外
- ElementRegistry を唯一の真実とする

**ハード制約:**
- `rebuild()` 後 `size() === 0` の場合は例外をthrow
- `requireById()` でノードが見つからない場合は例外をthrow

**ログ:**
- treeSize
- root children count
- ノードが見つからない場合の警告

## グローバル公開

- `window.LayoutTree`: LayoutTree クラス
- `window.getLayoutTree()`: LayoutTree インスタンスを取得

## 次のステップ

**STEP 4**: `selection/SelectionState.ts` と `selection/SelectionController.ts` を作成
- SelectionState: 選択状態の型定義
- SelectionController: 選択制御
