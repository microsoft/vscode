# 根本原因分析と正しい設計

## 🔍 根本原因

### 1. **二重実装の問題**

- **新実装の TypeScript ファイル** (`slotResolver.ts`, `guideRenderer.ts`, `applyMove.ts` など) が存在
- **`dndRuntime.ts` が新実装を独自に JavaScript 文字列として再実装**（1103行）
- **同じロジックが2箇所に存在し、同期が取れていない**

### 2. **統合不足**

- **`previewService.ts` は既に新実装を使用しようとしている**（5743行目でコメントアウト、6005行目で `window.resolveSlot` を使用）
- **しかし、`dndRuntime.ts` の実装が TypeScript ファイルと完全に一致していない可能性**
- **旧実装の `SlotResolver` クラス（3510行目）がまだ存在し、混乱の原因**

### 3. **ビルドプロセスの欠如**

- **TypeScript ファイルを JavaScript 文字列リテラルに変換するプロセスがない**
- **手動で JavaScript 文字列を書いているため、型安全性が失われている**

## ✅ 正しい設計

### アプローチ1: TypeScript ファイルを直接使用（推奨）

1. **`dndRuntime.ts` を TypeScript ファイルとして書き直す**
   - 新実装の TypeScript ファイルを直接インポート
   - ビルド時に JavaScript 文字列リテラルに変換するスクリプトを作成

2. **ビルドスクリプトの作成**
   - TypeScript ファイルをコンパイル
   - コンパイル済み JavaScript を文字列リテラルとして出力

3. **旧実装の削除**
   - `previewService.ts` 内の旧実装（3510行目の `SlotResolver` クラス）を削除
   - 旧実装への参照をすべて新実装に置き換え

### アプローチ2: コンパイル済み JavaScript を読み込む（代替案）

1. **TypeScript ファイルを JavaScript にコンパイル**
2. **コンパイル済み JavaScript を文字列として読み込む**
3. **`dndRuntime.ts` で文字列として結合**

## 🎯 実装方針

### フェーズ1: ビルドプロセスの確立

1. **`dndRuntime.ts` を TypeScript ファイルとして書き直す**
   ```typescript
   import { SlotResolver } from './slotResolver';
   import { GuideRenderer } from './guideRenderer';
   import { applyMove } from './apply/applyMove';
   
   // JavaScript 文字列リテラルに変換する関数
   export function generateDndRuntimeJs(): string {
     // 新実装を JavaScript 文字列として出力
   }
   ```

2. **ビルドスクリプトの作成**
   - `scripts/build-dnd-runtime.ts` を作成
   - TypeScript ファイルをコンパイルして JavaScript 文字列を生成

### フェーズ2: 旧実装の削除

1. **`previewService.ts` 内の旧実装を削除**
   - `SlotResolver` クラス（3510行目）を削除
   - 旧実装への参照をすべて新実装に置き換え

2. **`dndRuntime.ts` の重複実装を削除**
   - 新実装の TypeScript ファイルを使用するように変更

### フェーズ3: 動作確認

1. **テスト画面での動作確認**
2. **Grid/Flex/Absolute の各レイアウトタイプでの動作確認**

## 📋 現在の状態

### ✅ 完了していること

- 新実装の TypeScript ファイルが存在
- `previewService.ts` が新実装を使用しようとしている
- `dndRuntime.ts` が新実装を JavaScript 文字列として実装

### ❌ 問題点

- TypeScript ファイルと JavaScript 文字列の二重実装
- 旧実装がまだ存在している
- ビルドプロセスがない

## 🔧 次のステップ

1. **`dndRuntime.ts` を TypeScript ファイルとして書き直す**
2. **ビルドスクリプトを作成**
3. **旧実装を削除**
4. **動作確認**

