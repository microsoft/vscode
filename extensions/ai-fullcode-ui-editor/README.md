# AI Fullcode UI Editor - VSCode OSS Extension

VSCode OSS に統合された AI Fullcode UI Editor 拡張機能です。

## ファイル構成

- `package.json` - Extension の package.json（VSCode OSS 用）
- `tsconfig.json` - TypeScript 設定（VSCode OSS 用）
- `src/extension.ts` - Extension エントリーポイント
- `src/ai-fullcode-ui-editor/` - 統合レイヤー（core/ から参照）

## ビルド

```bash
cd extensions/ai-fullcode-ui-editor
npm install
npm run compile
```

ビルド成果物は `out/extension.js` に生成されます。

## 動作確認

Electron Dev Mode で VSCode OSS を起動すると、自動的に読み込まれます。

```bash
# ルートディレクトリから
export VSCODE_DEV=1
./scripts/code.sh
```

Developer Tools の Console に以下が表示されれば成功です：
- `[AI Fullcode UI Editor] Extension activated`
- `[AI Fullcode UI Editor] 初期化開始...`

