# STEP 1 完了: Core (PreviewRoot & ElementId)

## 実装ファイル

### ✅ `core/ElementId.ts` (約80行)
- `assertValid(id: string)`: IDが有効か検証（無効な場合は即エラー）
- `fromElement(el: HTMLElement): string | null`: 要素からIDを取得（data-element-idのみ）
- `hasValidId(element: HTMLElement | null): boolean`: 要素が有効なIDを持っているか確認

**原則:**
- data-element-id のみを使用
- 推測・フォールバック禁止
- 無効なIDは即エラー

### ✅ `core/PreviewRoot.ts` (約160行)
- `getInstance(): PreviewRoot`: シングルトンインスタンスを取得
- `setRoot(rootElement: HTMLElement): void`: previewRoot要素を設定
- `get(): HTMLElement`: previewRoot要素を取得（存在しなければ即throw）
- `validate(): void`: 存在・一意性を検証

**原則:**
- previewRoot は必ず1つ
- 取得できなければ即 throw
- 一意性を保証

**検証ログ:**
- `previewRoot.querySelectorAll('[data-element-id]').length` をログ出力
- data-element-id が無い要素の警告

## グローバル公開

- `window.ElementId`: ElementId クラス
- `window.PreviewRoot`: PreviewRoot クラス
- `window.getPreviewRoot()`: PreviewRoot インスタンスを取得

## 次のステップ

**STEP 2**: `core/ElementRegistry.ts` を作成
- DOM ↔ elementId の唯一の真実
- 要素の登録・取得・検索
