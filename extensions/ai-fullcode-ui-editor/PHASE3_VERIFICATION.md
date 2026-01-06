# Phase 3 動作確認手順

## ✅ 実装完了内容

1. **UI操作後の永続ストレージ保存** - `operationHandler.ts`
2. **design-entry.tsx生成機能** - `designEntryManager.ts`
3. **エディタ変更 → design-entry.tsx更新** - `designEntrySync.ts`

## 🔍 動作確認手順

### 1. VSCode OSS (Electron) を起動

```bash
cd /Users/masato0420/AI_Fullcode_UI_Editor/vscode-oss-fork-source
export VSCODE_DEV=1
./scripts/code.sh
```

### 2. Developer Toolsを開く

- `Help > Toggle Developer Tools` または `Cmd+Option+I` (macOS)
- **Consoleタブ**を開く
- 以下のログが表示されることを確認:
  - `[AI Fullcode UI Editor] Extension activated`
  - `[Storage] 初期化完了`
  - `[DesignEntrySync] 初期化完了`

### 3. テストファイルを作成

1. **コマンドパレット**を開く: `Cmd+Shift+P` (macOS)
2. `AI Fullcode UI Editor: テストファイルを作成` を実行
3. 成功メッセージが表示されることを確認

### 4. 永続ストレージの確認

**Developer Tools Console**で以下のログを確認:
```
[Storage Command] テストファイルを作成しました: /test-storage.tsx
```

**ファイルが保存されているか確認:**
```bash
# 永続ストレージのパスを確認
ls -la /Users/masato0420/AI_Fullcode_UI_Editor/vscode-oss-fork-source/data/projects/default/files/
```

### 5. TSXファイルを編集してdesign-entry.tsx自動更新を確認

1. **ワークスペース**でTSXファイルを開く（例: `test.tsx`）
2. **ファイルを編集**（例: `<div>Hello</div>` → `<div>Hello World</div>`）
3. **Developer Tools Console**で以下のログを確認:
   ```
   [DesignEntrySync] ✅ design-entry.tsx更新完了: /test.tsx
   [DesignEntryManager] ✅ design-entry.tsx生成完了: __runtime__/design-entry.tsx (source: /test.tsx)
   ```

### 6. design-entry.tsxの内容を確認

**永続ストレージに保存されたdesign-entry.tsxを確認:**
```bash
cat /Users/masato0420/AI_Fullcode_UI_Editor/vscode-oss-fork-source/data/projects/default/files/__runtime__/design-entry.tsx
```

**確認ポイント:**
- 編集したTSXコードが含まれている
- コメントに「Auto-generated」と表示されている
- ソースファイルパスが記載されている

### 7. Preview Runtimeを表示

1. **コマンドパレット**を開く: `Cmd+Shift+P`
2. `AI Fullcode UI Editor: Previewを表示` を実行
3. **Preview Panel**が表示されることを確認

### 8. Preview RuntimeでTSXコードが表示されることを確認

**確認ポイント:**
- Preview Runtimeに「No design entry found」ではなく、編集したTSXコードが表示される
- エラーが表示されない
- **Developer Tools Console**で以下のログを確認:
  ```
  [Vite Plugin] ✅ Loaded virtual:design-entry from persistent storage (project: default, path: ...)
  ```

### 9. ファイル変更のリアルタイム反映を確認

1. **エディタ**でTSXファイルを再度編集
2. **Preview Runtime**が自動更新されることを確認（数秒以内）
3. **Developer Tools Console**で以下のログを確認:
   ```
   [DesignEntrySync] ✅ design-entry.tsx更新完了: /test.tsx
   [PreviewService] ファイル変更通知: ...
   ```

## ❌ トラブルシューティング

### 問題1: design-entry.tsxが更新されない

**確認事項:**
- Developer Tools Consoleでエラーログを確認
- ワークスペースが正しく開かれているか確認
- ファイルパスが正しいか確認（プロジェクト相対パス）

**対処法:**
```bash
# 永続ストレージのディレクトリを確認
ls -la /Users/masato0420/AI_Fullcode_UI_Editor/vscode-oss-fork-source/data/projects/default/files/
```

### 問題2: Preview Runtimeに「No design entry found」が表示される

**確認事項:**
- design-entry.tsxが永続ストレージに保存されているか確認
- Vite Pluginが正しく動作しているか確認（Developer Tools Console）

**対処法:**
```bash
# design-entry.tsxの存在を確認
ls -la /Users/masato0420/AI_Fullcode_UI_Editor/vscode-oss-fork-source/data/projects/default/files/__runtime__/design-entry.tsx
```

### 問題3: エラーが発生する

**確認事項:**
- Developer Tools Consoleでエラーログを確認
- 拡張機能が正しくコンパイルされているか確認

**対処法:**
```bash
# 拡張機能を再コンパイル
cd /Users/masato0420/AI_Fullcode_UI_Editor/vscode-oss-fork-source/extensions/ai-fullcode-ui-editor
npm run compile
```

## ✅ 確認チェックリスト

- [ ] VSCode OSS (Electron) が起動する
- [ ] 拡張機能が有効化される（ログ確認）
- [ ] テストファイルが作成される
- [ ] 永続ストレージにファイルが保存される
- [ ] TSXファイル編集時にdesign-entry.tsxが自動更新される
- [ ] Preview Runtimeが表示される
- [ ] Preview Runtimeに編集したTSXコードが表示される
- [ ] ファイル変更がリアルタイムで反映される

## 📝 期待される動作

1. **TSXファイルを編集** → `design-entry.tsx`が自動更新
2. **design-entry.tsx更新** → Preview Runtimeが自動反映
3. **永続ストレージ保存** → 再起動後も状態が維持される

これらが全て動作すれば、Phase 3は完了です！

