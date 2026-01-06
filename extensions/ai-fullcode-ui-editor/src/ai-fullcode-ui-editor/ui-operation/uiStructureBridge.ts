/**
 * UI構造ASTブリッジ
 * 
 * Phase 3: UI操作連携
 * UI構造AST操作のVSCode統合
 * 
 * 注意: operationHandler.tsをラップして、VSCode統合を提供します。
 */

import { handleUIOperation } from './operationHandler';

/**
 * UI構造AST操作をVSCode統合として実行
 * 
 * @param filePath ファイルパス
 * @param operation UI操作
 * @param projectId プロジェクトID（永続ストレージ保存用）
 */
export async function executeUIOperation(
  filePath: string,
  operation: unknown, // TODO: UIOperation型
  projectId?: string
): Promise<{ success: boolean; error?: string }> {
  // eslint-disable-next-line no-console
  console.log('[UI Structure Bridge] UI操作実行:', { filePath, operation });
  
  // operationHandlerを呼び出し
  const result = await handleUIOperation(filePath, operation, projectId);
  
  if (!result.success) {
    // eslint-disable-next-line no-console
    console.error('[UI Structure Bridge] UI操作失敗:', result.error);
  }
  
  return result;
}

