# 新しいアーキテクチャ設計（Cursor方式）

## 基本方針

- ✅ iframeを完全に廃止
- ✅ 同一プロセス・同一DOM・同一JSランタイム
- ✅ コードが唯一のSource of Truth
- ✅ UI操作 = AST操作（直接コード編集）

## ディレクトリ構造

```
preview/
├── designView/
│   ├── DesignSurface.tsx        # 実DOM描画
│   ├── ElementOverlay.tsx       # 選択枠・ガイド
│   └── interaction/
│       ├── select.ts              # 要素選択
│       ├── drag.ts               # ドラッグ操作
│       └── resize.ts             # リサイズ操作
│
├── ast/
│   ├── parse.ts                 # AST解析
│   ├── locateNode.ts            # DOM→ASTマッピング
│   ├── applyPatch.ts            # AST変更適用
│   └── serialize.ts             # AST→コード変換
│
├── uiOperation/
│   ├── propertyEditor.ts        # プロパティ編集
│   ├── layoutEditor.ts          # レイアウト編集
│   └── history.ts               # Undo/Redo
│
└── runtime/
    └── mountApp.ts              # Vite/Nextを直接マウント
```

## データフロー

```
ユーザー操作（クリック/ドラッグ/リサイズ）
  ↓
DOM要素の特定（data-source-loc属性）
  ↓
AST Nodeの特定（locateNode）
  ↓
AST変更（applyPatch）
  ↓
コード書き換え（serialize）
  ↓
ファイル保存
  ↓
HMRで即反映
```

## 重要なポイント

1. **PreviewとUI操作は分離されているが、世界は同じ**
   - Previewは壊れない
   - UI操作が死んでもPreviewは表示される

2. **data-source-loc属性**
   - DOM要素とAST Nodeを対応付ける
   - 形式: `file:path:line:column`

3. **AST操作は既存のast-bridgeを活用**
   - astManager.ts
   - domToAst.ts

