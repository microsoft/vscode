# 実装フロー: Phase 3以降

## 📊 現在の実装状況

### ✅ 完了済み
- **Phase 1**: VSCode Extension統合基盤
  - Extension entry point (`extension.ts`)
  - モジュール初期化 (`main.ts`)
  - コマンド登録基盤

- **Phase 2**: AST Bridge + Vite Preview基盤
  - TextModel ↔ AST 双方向同期 (`ast-bridge/`)
  - Vite Dev Server統合 (`preview/viteServer.ts`)
  - Preview Panel表示 (`preview/previewPanel.ts`)
  - JSXパースエラー解消（`esbuild.transform`統合）

### ⚠️ 部分的実装
- **Phase 3**: UI操作連携
  - ✅ UI操作ハンドラー (`ui-operation/operationHandler.ts`)
  - ✅ AST操作 → TextModel更新
  - ❌ **永続ストレージ保存（TODOコメント）**
  - ❌ **design-entry.tsx生成・更新機能**

### ❌ 未実装
- **Phase 4**: デザインエントリー管理
- **Phase 5**: 非エンジニアUX
- **Phase 6**: AIチャット統合

---

## 🎯 Phase 3: 永続ストレージ保存 + design-entry.tsx生成

### 3.1 UI操作後の永続ストレージ保存

**ファイル**: `src/ai-fullcode-ui-editor/ui-operation/operationHandler.ts`

**実装内容**:
```typescript
// 既存のTODOコメントを実装
import { saveFile } from '../storage/projectStorageAdapter';

// handleUIOperation内のTODOを実装
if (projectId) {
  await saveFile(projectId, filePath, newTsx);
}
```

**完了条件**:
- [ ] UI操作 → TSX更新 → 永続ストレージ保存が動作
- [ ] 再起動後も状態が維持される

---

### 3.2 design-entry.tsx生成機能

**ファイル**: `src/ai-fullcode-ui-editor/storage/designEntryManager.ts` (新規作成)

**実装内容**:
```typescript
import { loadFile, saveFile } from './projectStorageAdapter';
import { astManager } from '../ast-bridge/astManager';

/**
 * design-entry.tsxを生成・更新
 *
 * 既存のapps/web/lib/design-aggregation/DesignEntryBuilder.tsを参考に実装
 * ただし、VSCode Extension環境に適応させる
 */
export class DesignEntryManager {
  /**
   * プロジェクト内のTSXファイルからdesign-entry.tsxを生成
   */
  async generateDesignEntry(projectId: string, entryFile?: string): Promise<string> {
    // 1. プロジェクト内のTSXファイルを列挙
    const files = await listFiles(projectId);
    const tsxFiles = files.filter(f => f.endsWith('.tsx') || f.endsWith('.jsx'));

    // 2. 指定されたentryFileまたはデフォルトファイルを選択
    const targetFile = entryFile || tsxFiles[0] || '/test.tsx';

    // 3. ファイルを読み込み
    const content = await loadFile(projectId, targetFile);
    if (!content) {
      throw new Error(`File not found: ${targetFile}`);
    }

    // 4. design-entry.tsxを生成（簡易版）
    // 将来的にはDesignEntryBuilderを移植
    const designEntryCode = this.buildDesignEntryCode(content, targetFile);

    // 5. 永続ストレージに保存
    await saveFile(projectId, '__runtime__/design-entry.tsx', designEntryCode);

    return designEntryCode;
  }

  /**
   * 簡易版design-entry生成（Phase 3では単一ファイルをそのまま使用）
   */
  private buildDesignEntryCode(sourceCode: string, sourcePath: string): string {
    return `// Design Entry Point (Auto-generated)
// Source: ${sourcePath}
// DO NOT EDIT MANUALLY

${sourceCode}
`;
  }
}
```

**完了条件**:
- [ ] design-entry.tsxが永続ストレージに生成される
- [ ] Preview Runtimeが生成されたdesign-entry.tsxを表示する

---

### 3.3 エディタ変更 → design-entry.tsx更新

**ファイル**: `src/ai-fullcode-ui-editor/storage/designEntrySync.ts` (新規作成)

**実装内容**:
```typescript
import * as vscode from 'vscode';
import { DesignEntryManager } from './designEntryManager';

/**
 * エディタ変更を監視してdesign-entry.tsxを更新
 */
export function initDesignEntrySync(context: vscode.ExtensionContext): void {
  const manager = new DesignEntryManager();
  const projectId = 'default'; // TODO: 動的に取得

  // TextModel変更を監視
  vscode.workspace.onDidChangeTextDocument(async (event) => {
    const { document } = event;

    // TSXファイルの変更のみ処理
    if (document.languageId !== 'typescriptreact') {
      return;
    }

    // 現在開いているファイルがdesign-entry.tsxのソースファイルかどうかを判定
    // 簡易版: すべてのTSXファイル変更時にdesign-entry.tsxを更新
    try {
      const filePath = document.uri.fsPath;
      const relativePath = getRelativePath(filePath); // プロジェクト相対パスに変換

      // design-entry.tsxを更新
      await manager.generateDesignEntry(projectId, relativePath);

      console.log('[DesignEntrySync] design-entry.tsx updated:', relativePath);
    } catch (error) {
      console.error('[DesignEntrySync] Failed to update design-entry.tsx:', error);
    }
  });
}
```

**完了条件**:
- [ ] エディタでTSXファイルを編集 → design-entry.tsxが自動更新
- [ ] Preview Runtimeが更新されたdesign-entry.tsxを表示

---

## 🎯 Phase 4: デザインエントリー管理（高度版）

### 4.1 DesignEntryBuilder移植

**ファイル**: `src/ai-fullcode-ui-editor/storage/DesignEntryBuilder.ts` (新規作成)

**実装内容**:
- 既存の`apps/web/lib/design-aggregation/DesignEntryBuilder.ts`をVSCode Extension環境に移植
- プロジェクト内の複数TSXファイルを集約してdesign-entry.tsxを生成
- コンポーネントの依存関係を解決

**完了条件**:
- [ ] 複数TSXファイルからdesign-entry.tsxを生成
- [ ] コンポーネントの依存関係が正しく解決される

---

### 4.2 カタログ選択機能

**ファイル**: `src/ai-fullcode-ui-editor/storage/catalogManager.ts` (新規作成)

**実装内容**:
- プロジェクト内のTSXファイルをカタログとして表示
- ユーザーが選択したファイルをdesign-entry.tsxのソースとして使用
- VSCode TreeView APIを使用してUIを提供

**完了条件**:
- [ ] カタログUIが表示される
- [ ] ファイル選択 → design-entry.tsx更新が動作

---

## 🎯 Phase 5: 非エンジニアUX

### 5.1 提案システム

**ファイル**: `src/ai-fullcode-ui-editor/ui-operation/suggestionSystem.ts` (既存ファイルを実装)

**実装内容**:
- UI操作でできない構文を検出
- ユーザーに提案を表示（VSCode Notification API）

**完了条件**:
- [ ] 複雑な構文を検出
- [ ] 適切な提案を表示

---

### 5.2 AI補完プロンプト生成

**ファイル**: `src/ai-fullcode-ui-editor/ui-operation/aiPromptGenerator.ts` (既存ファイルを実装)

**実装内容**:
- UI操作でできない構文のAI補完用プロンプト生成
- MCP Bridgeと連携

**完了条件**:
- [ ] AI補完プロンプトが生成される
- [ ] MCP Bridgeと連携

---

### 5.3 エラー防止

**ファイル**: `src/ai-fullcode-ui-editor/ui-operation/errorPrevention.ts` (既存ファイルを実装)

**実装内容**:
- UI操作のバリデーション
- コード破壊を防ぐ保護機能

**完了条件**:
- [ ] UI操作のバリデーションが動作
- [ ] コード破壊を防ぐ保護が機能

---

## 🎯 Phase 6: AIチャット統合

### 6.1 VSCode Chat UI統合

**ファイル**: `src/ai-fullcode-ui-editor/ai-chat/chatView.ts` (既存ファイルを実装)

**実装内容**:
- VSCode Chat View（UIのみ）を使用
- 既存のMCP Bridgeと連携

**完了条件**:
- [ ] Chat UIが表示される
- [ ] MCP Bridgeと連携

---

## 📝 実装優先順位

### 最優先（Phase 3）
1. **UI操作後の永続ストレージ保存** (`operationHandler.ts`のTODO実装)
2. **design-entry.tsx生成機能** (`designEntryManager.ts`作成)
3. **エディタ変更 → design-entry.tsx更新** (`designEntrySync.ts`作成)

### 次優先（Phase 4）
4. **DesignEntryBuilder移植** (複数ファイル集約)
5. **カタログ選択機能** (TreeView API)

### 後回し（Phase 5-6）
6. **非エンジニアUX** (提案システム、AI補完、エラー防止)
7. **AIチャット統合** (Chat UI)

---

## 🔄 実装フロー図

```
Phase 3.1: 永続ストレージ保存
  ↓
Phase 3.2: design-entry.tsx生成
  ↓
Phase 3.3: エディタ変更 → design-entry.tsx更新
  ↓
Phase 4.1: DesignEntryBuilder移植
  ↓
Phase 4.2: カタログ選択機能
  ↓
Phase 5: 非エンジニアUX
  ↓
Phase 6: AIチャット統合
```

---

## ✅ 各フェーズの完了確認方法

### Phase 3完了確認
1. VSCode OSS (Electron) を起動
2. TSXファイルを編集
3. Preview Runtimeを開く
4. **確認**: 編集したTSXコードがPreviewに表示される
5. VSCode OSSを再起動
6. **確認**: 再起動後も同じ状態が維持される

### Phase 4完了確認
1. 複数のTSXファイルを作成
2. カタログからファイルを選択
3. **確認**: 選択したファイルがdesign-entry.tsxとして使用される

### Phase 5完了確認
1. 複雑な構文を含むTSXファイルを編集
2. **確認**: 適切な提案が表示される

### Phase 6完了確認
1. Chat UIを開く
2. メッセージを送信
3. **確認**: MCP Bridge経由でAI応答が返る

