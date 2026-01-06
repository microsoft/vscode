/**
 * エラー防止
 * 
 * Phase 5: 非エンジニアUX
 * 非エンジニアがコードを壊さないための保護
 * 
 * 注意: 実際のVSCode OSS統合時には、既存のapps/web/lib/ui-structure/をインポートします。
 */

// TODO: 実際のVSCode OSS統合時に、以下のようにインポートします:
// import { UIOperation } from '../../../../apps/web/lib/ui-structure/apply';
// import { parseTsxToUiStructure } from '../../../../apps/web/lib/ui-structure/tsxToUiStructure';
// import { isEditable } from '../../../../apps/web/lib/ui-structure/types';
// import { astManager } from '../../../../apps/web/lib/ast/astManager';

/**
 * 検証結果
 */
export interface ValidationResult {
  valid: boolean;
  message?: string;
  suggestion?: string;
  errorCode?: string;
}

/**
 * UI操作を検証
 * 
 * UI操作でできない構文を検出し、エラーを防止します。
 * 
 * @param operation UI操作
 * @param filePath ファイルパス
 * @returns 検証結果
 */
export function validateUIOperation(
  operation: unknown, // TODO: UIOperation型
  filePath: string
): ValidationResult {
  // TODO: 実際のVSCode OSS統合時に実装
  // const file = astManager.getFile(filePath);
  // if (!file) {
  //   return {
  //     valid: false,
  //     message: `File not found: ${filePath}`,
  //     errorCode: 'FILE_NOT_FOUND'
  //   };
  // }
  // 
  // // UI操作でできない構文を検出
  // const uiStructure = parseTsxToUiStructure(file);
  // if (!uiStructure) {
  //   return {
  //     valid: false,
  //     message: 'Failed to parse TSX to UI structure',
  //     errorCode: 'PARSE_ERROR'
  //   };
  // }
  // 
  // // 操作対象のノードを取得
  // const op = operation as UIOperation;
  // let targetNodeId: string | undefined;
  // 
  // if ('nodeId' in op) {
  //   targetNodeId = op.nodeId as string;
  // } else if ('sourceNodeId' in op) {
  //   targetNodeId = op.sourceNodeId as string;
  // } else if ('targetId' in op) {
  //   targetNodeId = op.targetId as string;
  // } else if ('repeatNodeId' in op) {
  //   targetNodeId = op.repeatNodeId as string;
  // } else if ('conditionNodeId' in op) {
  //   targetNodeId = op.conditionNodeId as string;
  // }
  // 
  // if (targetNodeId) {
  //   const node = findNodeById(uiStructure, targetNodeId);
  //   if (node && !isEditable(node)) {
  //     return {
  //       valid: false,
  //       message: 'この要素はUI操作では編集できません。',
  //       suggestion: 'コードエディタで直接編集するか、AI補完を使用してください。',
  //       errorCode: 'NOT_EDITABLE'
  //     };
  //   }
  // }
  
  return { valid: true };
}

/**
 * 操作前の事前検証
 * 
 * UI操作を実行する前に、事前に検証を行います。
 * 
 * @param operation UI操作
 * @param filePath ファイルパス
 * @returns 検証結果
 */
export async function validateBeforeOperation(
  operation: unknown, // TODO: UIOperation型
  filePath: string
): Promise<ValidationResult> {
  return validateUIOperation(operation, filePath);
}

