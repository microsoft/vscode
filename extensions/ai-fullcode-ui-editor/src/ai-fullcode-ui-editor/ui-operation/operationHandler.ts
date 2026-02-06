/**
 * UI操作ハンドラー
 * 
 * Phase 3: UI操作連携
 * UI操作 → TSX生成 → TextModel更新
 * 
 * 注意: 既存のapps/web/lib/ui-structure/apply.tsを使用するため、
 * 実行時に動的インポートを使用します。
 */

import { astManager } from '../ast-bridge/astManager';
import { updateTextModelFromASTAndSave } from '../ast-bridge/astToTextModel';
import { saveFile } from '../storage/projectStorageAdapter';
import * as path from 'path';
import * as fs from 'fs';

// UI構造操作モジュール（動的インポート）
let uiStructureModule: any = null;

/**
 * UI構造操作モジュールを取得（遅延読み込み）
 * 
 * 注意: ワークスペースルート基準でパス解決（__dirname基準は禁止）
 */
async function getUiStructureModule(): Promise<any> {
  if (!uiStructureModule) {
    try {
      // ✅ ワークスペースルート基準でパス解決
      const vscode = await import('vscode');
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      if (!workspaceFolder) {
        throw new Error('ワークスペースが開かれていません');
      }

      // ワークスペースルートから apps/web/lib/ui-structure/apply を解決
      const modulePath = path.join(workspaceFolder.uri.fsPath, 'apps/web/lib/ui-structure/apply');
      
      // ファイルが存在するか確認
      if (!fs.existsSync(modulePath + '.ts') && !fs.existsSync(modulePath + '.js')) {
        throw new Error(`UI structure module not found at: ${modulePath}`);
      }
      
      // 動的インポート（実行時）
      uiStructureModule = await import(modulePath);
    } catch (error) {
      // Silent error handling
    }
  }
  return uiStructureModule;
}

export type HandleUIOperationOptions = {
  /** true のとき保存せずメモリのみ更新（プレビュー用） */
  dryRun?: boolean;
};

/**
 * UI操作を処理
 *
 * @param filePath ファイルパス
 * @param operation UI操作
 * @param projectId プロジェクトID（永続ストレージ保存用）
 * @param options dryRun: true なら updateTextModelFromASTAndSave / saveFile を呼ばず、astManager のみ更新
 */
export async function handleUIOperation(
  filePath: string,
  operation: unknown,
  projectId?: string,
  options?: HandleUIOperationOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    // 1. astManagerからファイルを取得
    const file = astManager.getFile(filePath);
    if (!file) {
      // ファイルが読み込まれていない場合は、現在のTextModelから読み込む
      const code = await getCurrentFileContent(filePath);
      if (!code) {
        throw new Error(`File not found: ${filePath}`);
      }
      astManager.loadFile(filePath, code);
      const loadedFile = astManager.getFile(filePath);
      if (!loadedFile) {
        throw new Error(`Failed to load file: ${filePath}`);
      }
      return handleUIOperation(filePath, operation, projectId, options);
    }

    // 2. UI構造操作モジュールを取得
    const module = await getUiStructureModule();
    if (!module) {
      // モジュールが利用できない場合は、エラーを返す
      throw new Error('UI structure operation module not available. Please ensure apps/web/lib/ui-structure/ is accessible.');
    }

    const op = operation as any;

    // 3. AI操作の場合は特別な処理
    if (op.type === 'ai-operation') {
      const originalCode = file.getFullText();
      const result = await module.applyUiStructureOperationWithAI(file, op);
      if (!result.success) {
        throw new Error(result.error || 'AI operation failed');
      }
      const newTsx = result.updatedCode || file.getFullText();
      if (options?.dryRun) {
        astManager.loadFile(filePath, newTsx);
        return { success: true };
      }
      // 4. 最小 diff で適用（変更範囲だけ TextEdit）→ 永続保存
      await updateTextModelFromASTAndSave(filePath, newTsx, {
        minimalDiff: true,
        originalCode,
      });
      // 5. 永続ストレージ保存（拡張内プロジェクト用）
      if (projectId) {
        try {
          await saveFile(projectId, filePath, newTsx);
        } catch (error) {
          // エラーが発生しても処理は続行（メモリ内の状態は正しい）
        }
      }
      return { success: true };
    }

    // 4. 通常のUI操作
    const originalCode = file.getFullText();
    const result = module.applyUiStructureOperation(file, op);
    if (!result.success) {
      throw new Error(result.error || 'UI structure operation failed');
    }

    // 5. UI構造AST → TSX（既にapplyUiStructureOperation内で処理済み）
    const newTsx = result.updatedCode || file.getFullText();
    if (options?.dryRun) {
      astManager.loadFile(filePath, newTsx);
      return { success: true };
    }
    // 6. 最小 diff で適用（変更範囲だけ TextEdit）→ 永続保存
    await updateTextModelFromASTAndSave(filePath, newTsx, {
      minimalDiff: true,
      originalCode,
    });
    // 7. 永続ストレージ保存（拡張内プロジェクト用）
    if (projectId) {
      try {
        await saveFile(projectId, filePath, newTsx);
      } catch (error) {
        // エラーが発生しても処理は続行（メモリ内の状態は正しい）
      }
    }
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      success: false,
      error: errorMessage,
    };
  }
}

/**
 * 現在のファイル内容を取得（VSCode TextModelから）
 */
async function getCurrentFileContent(filePath: string): Promise<string | null> {
  try {
    const vscode = await import('vscode');
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    return document.getText();
  } catch (error) {
    return null;
  }
}

