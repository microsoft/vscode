# AI Fullcode UI Editor - VSCode OSS Extension

VSCode OSS に統合された **AI Fullcode UI Editor** 拡張機能です。

**コアコンセプト**: Canvasではなく、本物のブラウザ実DOMを使うUI Builder。実際のブラウザDOMを直接編集し、コードとUIを100%一致させる。

**仕様**: 本拡張は **Web サーバーを使用せず、アプリ（VSCode 拡張）のみ**で動作します。チャットは他 LM または OpenAI 直接、計画取得は**拡張内 `out/plan/runPlan.js`** のみ（Cursor 同一: ユーザー workspace にスクリプトを要求しない）。実施内容の詳細は [docs/APP_ONLY_IMPLEMENTATION_SUMMARY.md](docs/APP_ONLY_IMPLEMENTATION_SUMMARY.md) を参照。

---

## 📋 目次

- [アーキテクチャ概要](#アーキテクチャ概要)
- [実装フェーズ](#実装フェーズ)
- [主要コンポーネント](#主要コンポーネント)
- [データフロー](#データフロー)
- [ファイル構成](#ファイル構成)
- [ビルドと起動](#ビルドと起動)
- [チャット / LM と API キー](#チャット--lm-と-api-キー)
- [設定の詳細と「指示→エディタ変更」フロー](docs/SETTINGS_AND_FLOW.md)（設定方法・コード特定の仕組みを詳解）
- [アプリのみ仕様の実施内容まとめ](docs/APP_ONLY_IMPLEMENTATION_SUMMARY.md)
- [開発ワークフロー](#開発ワークフロー)

---

## 🏗 アーキテクチャ概要

### 基本方針（Cursor 2.2 準拠）

- ✅ **iframeを完全に廃止**: 同一プロセス・同一DOM・同一JSランタイム
- ✅ **コードが唯一のSource of Truth**: DOMはコードの可視化（shadow）
- ✅ **UI操作 = AST操作**: 直接コード編集、DOMは自動更新
- ✅ **非破壊的Apply**: 差分プレビュー → ユーザー確認 → 適用
- ✅ **動的UI対応**: map/conditional/grid/flex でも破綻しない

### 3つのレイヤー構造

```
┌─────────────────────────────────────────┐
│  UI Layer (React Components)           │
│  - DesignSurface                       │
│  - ElementOverlay (選択枠)             │
│  - DragOverlayRenderer (Ghost/Guide)   │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Interaction Layer (State Management)   │
│  - LayoutInteractionController          │
│  - SelectionController                  │
│  - DragStateStore                       │
│  - UIActionStore                        │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│  Code Layer (AST Operations)            │
│  - ChangePlanGenerator                  │
│  - ApplyEngine (AST変換)                │
│  - VerifyHarness                        │
└─────────────────────────────────────────┘
```

---

## 📊 実装フェーズ

### ✅ Phase 1-2: 基盤構築（完了）

- **VSCode Extension統合**: Extension entry point, コマンド登録
- **Preview基盤**: DesignSurface, React統合, iframe廃止
- **PlaceholderApp**: デモレイアウト（column/row/grid/flex）

### ✅ Phase 3: UI操作AST記録（完了）

- **UIActionAST**: UI操作を構造化データとして記録
- **UIActionStore**: 操作履歴の蓄積・取得
- **SourceLocator**: DOMとコードを結びつける位置情報

### ✅ Phase 4: Code Locator（完了）

- **CodeLocator**: DOM要素からコード上の位置を特定
- **SourceLocator**: ファイルパス + 行/列 + ノード種類
- **StableElementId**: セッション内で安定した要素ID

### ✅ Phase 5: ChangePlan生成（完了）

- **ChangePlanGenerator**: UI操作AST → コード変更提案
- **DiffPreviewEngine**: 差分を可視化（unified diff形式）
- **ChangePlanStore**: 変更提案の蓄積・管理

### ✅ Phase 6: Apply機能（完了）

- **ApplyChangePlanService**: ChangePlanを実コードへ反映
- **HistoryStore**: 変更履歴管理（Undo/Redo対応）
- **DryRun**: 適用前の確認（diff生成）
- **安全装置**: filePath検証、riskLevel判定

### ✅ Phase 7: Drag & Drop + Layout対応（完了）

- **LayoutInteractionController**: ドラッグ操作の制御
- **LayoutTreeService**: DOM構造の仮想表現
- **SlotResolver**: ドロップ位置の解決（before/after/inside）
- **DragStateStore**: ドラッグ状態管理（Ghost/Slot Preview/Guide）
- **DragOverlayRenderer**: 視覚的オーバーレイ（Ghost/Guide描画）
- **PreviewApplyLayer**: 即時DOM反映（UX向上）
- **Layout対応**: column/row/grid/flex の完全対応
- **Grid対応**: セル単位のドロップ、grid-template解析
- **Flex対応**: wrap/reverse/align-items/justify-content対応

### 🚧 Phase 8: Intent拡張 + AST Apply（進行中）

- **MOVE_ELEMENT Intent拡張**: source/target/anchor情報追加
- **Dynamic Context分類**: static/map/conditional判定
- **ChangePlan候補生成**: planCandidates配列（複数案）
- **ASTベースApplyEngine**: ts-morph使用（実装中）
- **Verify-after-apply**: 再解析・再描画・再選択チェック（実装中）
- **E2Eデモプレビュー**: grid/flex/conditional/map検証（実装中）

---

## 🧩 主要コンポーネント

### 1. PreviewService

**責務**: Preview HTML生成、全コンポーネントの統合

**主要機能**:
- DesignSurface HTML生成
- React/CDN統合
- 全JavaScriptコードの文字列生成（Webview環境対応）

**ファイル**: `src/ai-fullcode-ui-editor/preview/previewService.ts`

### 2. LayoutInteractionController

**責務**: ドラッグ操作の制御、UIActionAST生成

**主要機能**:
- `startDrag()`: ドラッグ開始、DragSession作成
- `updateDrag()`: ドラッグ中更新、Slot解決、Guide生成
- `endDrag()`: ドロップ完了、MOVE_ELEMENT UIActionAST生成
- `recalculateDragState()`: レスポンシブ対応（resize/scroll）

**特徴**:
- DOM操作は一切行わない（Cursor 2.2準拠）
- DragStateStoreに状態を更新
- LayoutTreeServiceで構造判定

### 3. LayoutTreeService

**責務**: DOM構造の仮想表現、レイアウト情報管理

**主要機能**:
- `buildFromDOM()`: DOMからLayoutTree構築
- `updateTree()`: Tree更新（全体再構築）
- `getLayoutNode()`: elementIdからLayoutNode取得
- `getDomElement()`: elementIdからDOM要素取得（逆引き）

**LayoutNode拡張**:
- `isContainer`: コンテナかどうか
- `layoutType`: 'column' | 'row' | 'grid' | 'absolute'
- `grid`: Grid情報（columns, rows, cellRects）

### 4. SlotResolver

**責務**: マウス位置からドロップ位置を解決

**主要機能**:
- `resolveSlot()`: ドロップ位置解決（before/after/inside）
- `resolveGridSlot()`: Grid専用解決（セル単位）
- `createGuideDescriptor()`: Guide情報生成

**対応レイアウト**:
- **column**: 横線（上下）ガイド
- **row**: 縦線（左右）ガイド
- **grid**: セルboxガイド
- **flex**: primaryAxis/crossAxis対応、wrap対応

### 5. DragStateStore

**責務**: ドラッグ状態の一元管理

**状態**:
- `isDragging`: ドラッグ中かどうか
- `draggedElementId`: ドラッグ中の要素ID
- `ghostRect`: Ghostの位置・サイズ
- `slotPreviewRect`: Slot Previewの位置・サイズ
- `guide`: GuideDescriptor（線/box、方向、位置）

**特徴**:
- React非依存（純JavaScript）
- Observableパターン（subscribe/unsubscribe）

### 6. DragOverlayRenderer

**責務**: 視覚的オーバーレイの描画

**描画内容**:
- **Ghost**: 半透明の青い枠（ドラッグ中の要素）
- **Guide**: 青い線/box（ドロップ位置のガイド）

**特徴**:
- `position: fixed` + `transform: translate()`
- `pointer-events: none`（クリック判定に参加しない）
- Z-index: Guide (10000), Ghost (10001), Selection (10002)

### 7. UIActionStore

**責務**: UI操作ASTの蓄積・取得

**対応操作タイプ**:
- `SELECT_ELEMENT`: 要素選択
- `HOVER_ELEMENT`: ホバー
- `MOVE_ELEMENT`: 要素移動（Phase 7）
- `MOVE`: レイアウト移動（deltaX/deltaY）
- `RESIZE`: リサイズ
- `SET_PROPERTY`: プロパティ変更
- `SET_LAYOUT`: レイアウト操作

### 8. ChangePlanGenerator

**責務**: UI操作AST → ChangePlan変換

**主要機能**:
- `generateChangePlan()`: ChangePlan生成（非同期）
- `classifyDynamicContext()`: Dynamic Context分類（static/map/conditional）
- `planCandidates`: 複数案生成（PlanA/PlanB/PlanC）

**ChangePlan構造**:
- `id`: 一意ID
- `sourceOpId`: 元のUIActionASTのoperationId
- `elementId`: 対象要素ID
- `filePath`: 変更対象ファイル
- `changeType`: 変更タイプ
- `patch`: before/after
- `riskLevel`: low/medium/high
- `requiresUserDecision`: ユーザー確認が必要か
- `planCandidates`: 候補配列（Phase 8）

### 9. ApplyChangePlanService

**責務**: ChangePlanを実コードへ反映

**主要機能**:
- `validatePlan()`: 安全装置チェック
- `dryRun()`: 適用前確認（diff生成）
- `apply()`: 実コード反映（VSCode API経由）

**安全装置**:
- filePath === 'unknown' は適用不可
- riskLevel === 'high' は警告
- error がある場合は適用不可

### 10. HistoryStore

**責務**: 変更履歴管理

**主要機能**:
- `push()`: 履歴追加
- `undo()`: 元に戻す
- `revert()`: 特定履歴を元に戻す

---

## 🔄 データフロー

### Drag & Drop操作のフロー

```
1. ユーザーが要素をドラッグ開始
   ↓
2. LayoutInteractionController.startDrag()
   - DragSession作成
   - startRect取得（ViewportTransformService使用）
   ↓
3. マウス移動（mousemove）
   ↓
4. LayoutInteractionController.updateDrag()
   - LayoutTreeService.updateTree()（構造判定）
   - SlotResolver.resolveSlot()（ドロップ位置解決）
   - GuideRectProjector.project()（Guide位置計算）
   - DragStateStore.set()（状態更新）
   ↓
5. DragOverlayRenderer（React）
   - DragStateStoreを購読
   - Ghost/Guideを描画（position: fixed）
   ↓
6. ユーザーがドロップ（mouseup）
   ↓
7. LayoutInteractionController.endDrag()
   - MOVE_ELEMENT UIActionAST生成（Intent拡張版）
   - UIActionStore.add()（記録）
   - PreviewApplyLayer.apply()（即時DOM反映）
   ↓
8. ChangePlanGenerator.generateChangePlan()
   - Dynamic Context分類
   - planCandidates生成（PlanA/PlanB/PlanC）
   - ChangePlanStore.add()（提案追加）
   ↓
9. ユーザーがApplyボタンをクリック
   ↓
10. ApplyChangePlanService.apply()
    - dryRun()（確認）
    - VSCode API経由でファイル書き換え
    - HistoryStore.push()（履歴追加）
```

### Apply操作のフロー

```
1. ChangePlan選択
   ↓
2. ApplyChangePlanService.dryRun()
   - validatePlan()（安全装置チェック）
   - formatChangePlanAsDiff()（diff生成）
   ↓
3. ユーザー確認（差分プレビュー）
   ↓
4. ApplyChangePlanService.apply()
   - VSCode API経由でファイル読み取り
   - AST変換（ts-morph使用、実装中）
   - ファイル書き換え
   - HistoryStore.push()（履歴追加）
   ↓
5. Verify-after-apply（実装中）
   - パースエラーチェック
   - 再描画確認
   - 再選択確認
```

---

## 📁 ファイル構成

```
extensions/ai-fullcode-ui-editor/
├── package.json                    # Extension設定
├── tsconfig.json                   # TypeScript設定
├── README.md                       # このファイル
│
├── src/
│   ├── extension.ts                # Extensionエントリーポイント
│   │
│   └── ai-fullcode-ui-editor/
│       ├── main.ts                  # メイン初期化
│       │
│       ├── preview/
│       │   ├── previewService.ts    # Preview HTML生成（全実装）
│       │   ├── ARCHITECTURE.md      # アーキテクチャ設計
│       │   ├── DRAG_DROP_SPEC.md    # Drag & Drop仕様
│       │   │
│       │   ├── designView/
│       │   │   ├── designSurfaceRuntime.ts  # DesignSurface実装
│       │   │   └── interaction/
│       │   │       ├── DragStateStore.ts    # ドラッグ状態管理
│       │   │       └── DragOverlayRenderer.tsx  # オーバーレイ描画
│       │   │
│       │   ├── interaction/
│       │   │   └── SelectionController.ts   # 要素選択
│       │   │
│       │   ├── uiAction/
│       │   │   └── UIActionAST.ts            # UI操作AST型定義
│       │   │
│       │   └── runtime/
│       │       ├── previewSourceRuntime.ts    # Preview Source
│       │       ├── domObserverBridgeRuntime.ts  # DOM Observer
│       │       └── designSurfaceRuntime.ts   # Design Surface
│       │
│       ├── ast-bridge/              # AST操作（既存）
│       ├── ui-operation/            # UI操作ハンドラー（既存）
│       ├── storage/                 # ストレージ（既存）
│       └── ai-chat/                 # AIチャット（既存）
│
└── out/
    └── extension.js                 # コンパイル成果物
```

---

## 🔧 ビルドと起動

### 初回セットアップ

```bash
# 1. 依存関係のインストール
cd extensions/ai-fullcode-ui-editor
npm install

# 2. TypeScriptコンパイル + 計画スクリプトのバンドル
npm run compile
npm run build:plan   # 拡張内 out/plan/runPlan.js を生成（モノレポ内で実行時のみ。通常は npm run build に含まれる）

# 3. VSCode OSSのビルド（ルートディレクトリから）
cd ../../..
source ~/.nvm/nvm.sh
nvm use 22.21.1
npm run gulp compile
npm run gulp bundle-vscode
cp out-vscode/vs/workbench/workbench.desktop.main.css out/vs/workbench/workbench.desktop.main.css
```

### 日常的な開発

**推奨: ランチスクリプト（拡張が確実に読み込まれる）**

```bash
# vscode-oss-fork-source のルートから（どこからでも可）
./launch-ai-fullcode.sh
```

拡張パスを絶対パスで渡すため、どのディレクトリから実行しても拡張が正しく読み込まれます。

**従来どおり scripts/code.sh を使う場合**

```bash
# 必ず vscode-oss-fork-source に cd してから実行
cd /path/to/vscode-oss-fork-source
export VSCODE_DEV=1
./scripts/code.sh --extensionDevelopmentPath=./extensions/ai-fullcode-ui-editor
```

Watchモードで開発する場合:

```bash
# Watchモードを使用（自動再コンパイル）
npm run watch &

# 上記のいずれかで VSCode OSS を起動
./launch-ai-fullcode.sh
```

### ⚠️ プレビュー（DnD等）のランタイムを変更した場合

**プレビュー iframe は `out/ai-fullcode-ui-editor/preview/runtime/runtime.js` を読み込みます。**  
このファイルは **`npm run watch` では更新されません**（watch は拡張の tsc のみ。runtime は esbuild で別バンドル）。

**DropResolver や DragController など `preview/runtime/` 以下を編集したら、必ず以下を実行してください。**

```bash
cd extensions/ai-fullcode-ui-editor
npm run build:runtime
# または
npm run build
```

実行後、**プレビューを一度閉じて開き直す**か、**ウィンドウのリロード**をしてください。

### 計画取得（runPlan.js）について

**計画は拡張内 `out/plan/runPlan.js` のみで実行します**（Cursor 同一仕様）。ユーザーのワークスペースにスクリプトや monorepo を要求しません。`npm run build` で `build:plan` が実行され、`apps/web/scripts/runPlanForExtension.ts` が 1 ファイルにバンドルされます。モノレポ外で拡張だけをビルドする場合は、事前に `npm run build:plan` をモノレポ内で一度実行し、生成された `out/plan/runPlan.js` をコミットしておく運用も可能です。

### 動作確認

1. VSCode OSSが起動したら、**Help > Toggle Developer Tools** を開く
2. Consoleに以下が表示されれば成功:
   - `[AI Fullcode UI Editor] Extension activated`
   - `[DesignSurface] ✅ DesignSurface initialized`
   - `[UIActionStore] ✅ Created global store`

---

## チャット / LM と API キー

### アプリのみでチャットを動かす（推奨）

Web サーバーは不要です。チャットは拡張内で完結します。

- **推奨**: 設定 **`aiFullcodeUiEditor.openaiApiKey`** に OpenAI API キーを指定する。
- **（今回の実装では）** 設定が空のとき、ワークスペースの **`.env.local`** / **`.env`** に `OPENAI_API_KEY` を書いておけば、拡張がそれを参照し、直接 OpenAI API を呼んでチャットが応答します。
- **計画取得（/apply や aiFullcodeGetUiPlan）** でも同じキーを使用する。拡張は拡張内 `runPlan.js` を起動する際に、設定 or .env で取得した `OPENAI_API_KEY` を子プロセスに渡すため、計画生成・Embedding がそのキーで動作する。

**※** `.env.local` / `.env` を読む挙動は **VS Code 拡張の標準仕様ではなく、本拡張で独自に実装したものです。** 公式な推奨はあくまで「設定で `openaiApiKey` を指定する」です。`.env` は開発者向けフォールバックとして利用できます。

マルチルート・Remote/SSH では「どのワークスペースの .env を読むか」に注意（本拡張は `workspaceFolders[0]` のみ参照）。

**より詳しく**: 設定の開き方・各項目の意味・「指示を入れてからエディタが変わるまで」の流れ（どのコードが対象になるか・nodeId の役割など）は **[docs/SETTINGS_AND_FLOW.md](docs/SETTINGS_AND_FLOW.md)** にまとめています。

---

## 🚀 開発ワークフロー

### ブランチ切り替え時

**通常は再ビルド不要**（`out/`ディレクトリが存在すれば）

**再ビルドが必要な場合**:
- 新しいマシンでクローンした場合
- `out/`ディレクトリを削除した場合
- VSCode OSS本体のコードを変更した場合
- CSSファイル（`workbench.desktop.main.css`）が存在しない場合

### Watchモード（推奨）

```bash
# Watchモードを起動（バックグラウンド推奨）
npm run watch &

# VSCode OSSを起動
export VSCODE_DEV=1
./scripts/code.sh --extensionDevelopmentPath=./extensions/ai-fullcode-ui-editor
```

**注意**: Watchモードは`bundle-vscode`（CSS生成）を自動実行しません。CSSエラーが出た場合は手動で実行してください。

### トラブルシューティング

#### CSSファイルが見つからないエラー

```bash
# CSSバンドルを再生成
npm run gulp bundle-vscode
cp out-vscode/vs/workbench/workbench.desktop.main.css out/vs/workbench/workbench.desktop.main.css
```

#### ビルドエラー

```bash
# Node.jsバージョンを確認
node --version  # 22.21.1であることを確認

# バージョンが違う場合
source ~/.nvm/nvm.sh
nvm use 22.21.1

# クリーンビルド
rm -rf out out-vscode
npm run gulp compile
npm run gulp bundle-vscode
cp out-vscode/vs/workbench/workbench.desktop.main.css out/vs/workbench/workbench.desktop.main.css
```

---

## 📝 技術スタック

- **フロントエンド**: React 19, TypeScript, Tailwind CSS v4
- **エディタ**: Monaco Editor
- **AST操作**: ts-morph（構造API、diff方式）
- **通信**: postMessage（VSCode Webview API）
- **バックエンド**: Firebase (Auth, Firestore, Storage, Functions)
- **AI**: MCP Server, OpenAI, Anthropic
- **デスクトップ**: Tauri（将来対応）

---

## 🎯 設計原則

### 1. コードが唯一のSource of Truth

- DOMはコードの可視化（shadow）
- UI操作はコード変更の提案（Intent）
- Applyは常に差分として行う

### 2. 非破壊的Apply

- 反映前に必ずdryRun（diff生成）
- 反映後に必ずverify（再解析・再描画・再選択チェック）
- 失敗時はrollback（Undo）できる

### 3. 動的UI対応

- map/conditional/grid/flexでも破綻しない
- DOM順を信頼しない（必ずアンカー（key/locator）を使う）
- 曖昧なケースはユーザー確認にフォールバック

### 4. Cursor 2.2準拠

- Preview DOMは一切変更しない（drag中）
- Ghost/GuideはOverlayレイヤーのみ
- Slot判定は構造層、Guide描画は投影層に完全分離

---

## 📚 関連ドキュメント

- **アーキテクチャ設計**: `src/ai-fullcode-ui-editor/preview/ARCHITECTURE.md`
- **Drag & Drop仕様**: `src/ai-fullcode-ui-editor/preview/DRAG_DROP_SPEC.md`
- **開発ワークフロー**: `../../DEVELOPMENT_WORKFLOW.md`（ルートディレクトリ）

---

## ✅ 実装状況サマリー

| フェーズ | 状態 | 説明 |
|---------|------|------|
| Phase 1-2 | ✅ 完了 | 基盤構築、Preview統合 |
| Phase 3 | ✅ 完了 | UI操作AST記録 |
| Phase 4 | ✅ 完了 | Code Locator、SourceLocator |
| Phase 5 | ✅ 完了 | ChangePlan生成、差分プレビュー |
| Phase 6 | ✅ 完了 | Apply機能、Undo/Redo |
| Phase 7 | ✅ 完了 | Drag & Drop、Layout対応（column/row/grid/flex） |
| Phase 8 | 🚧 進行中 | Intent拡張、AST Apply、Verify、E2Eデモ |

---

## 🎉 次のステップ

1. **Dynamic Context分類の実装**: VSCode API経由でファイル読み取り + AST解析
2. **ASTベースApplyEngine実装**: ts-morph使用、JSX構造のreorder/wrap/unwrap
3. **Verify-after-apply実装**: 再解析・再描画・再選択チェック
4. **E2Eデモプレビュー追加**: grid/flex/conditional/map検証用UI

---

## 📄 ライセンス

MIT License

---

**最終更新**: 2025年1月6日
**バージョン**: Phase 8（Intent拡張実装中）
