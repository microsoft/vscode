/**
 * 提案システム
 * 
 * Phase 5: 非エンジニアUX
 * UI操作でできない構文の提案
 * 
 * 注意: 実際のVSCode OSS統合時には、既存のapps/web/lib/ui-structure/をインポートします。
 */

// TODO: 実際のVSCode OSS統合時に、以下のようにインポートします:
// import { UINode } from '../../../../apps/web/lib/ui-structure/types';
// import { isEditable } from '../../../../apps/web/lib/ui-structure/types';

/**
 * 提案タイプ
 */
export interface Suggestion {
  type: 'suggestion' | 'warning' | 'error';
  message: string;
  actions?: SuggestionAction[];
}

/**
 * 提案アクション
 */
export interface SuggestionAction {
  label: string;
  command: string;
  args?: unknown[];
}

/**
 * 複雑な構文に対する提案を生成
 * 
 * UI操作でできない構文（nodeIdがないノード、複雑な構文など）に対して、
 * 適切な提案を返します。
 * 
 * @param node UIノード
 * @returns 提案（存在しない場合はnull）
 */
export function suggestForComplexSyntax(node: unknown): Suggestion | null {
  // TODO: 実際のVSCode OSS統合時に実装
  // const uiNode = node as UINode;
  // 
  // // RepeatノードでnodeIdがない場合
  // if (uiNode.type === 'Repeat' && !uiNode.nodeId) {
  //   return {
  //     type: 'suggestion',
  //     message: 'この繰り返し構文はUI操作では編集できません。コードエディタで直接編集するか、AI補完を使用してください。',
  //     actions: [
  //       { label: 'コードエディタで開く', command: 'editor.action.openEditor' },
  //       { label: 'AI補完を提案', command: 'ai-fullcode-ui-editor.suggestAI' }
  //     ]
  //   };
  // }
  // 
  // // ConditionノードでnodeIdがない場合
  // if (uiNode.type === 'Condition' && !uiNode.nodeId) {
  //   return {
  //     type: 'suggestion',
  //     message: 'この条件分岐構文はUI操作では編集できません。コードエディタで直接編集するか、AI補完を使用してください。',
  //     actions: [
  //       { label: 'コードエディタで開く', command: 'editor.action.openEditor' },
  //       { label: 'AI補完を提案', command: 'ai-fullcode-ui-editor.suggestAI' }
  //     ]
  //   };
  // }
  // 
  // // 編集不可能なノード（nodeIdがない）
  // if (!isEditable(uiNode)) {
  //   return {
  //     type: 'warning',
  //     message: 'この要素はUI操作では編集できません。コードエディタで直接編集するか、AI補完を使用してください。',
  //     actions: [
  //       { label: 'コードエディタで開く', command: 'editor.action.openEditor' },
  //       { label: 'AI補完を提案', command: 'ai-fullcode-ui-editor.suggestAI' }
  //     ]
  //   };
  // }
  
  return null;
}

/**
 * ノードに対する提案を取得
 * 
 * @param nodeId ノードID
 * @param filePath ファイルパス
 * @returns 提案（存在しない場合はnull）
 */
export async function getSuggestionForNode(
  nodeId: string,
  filePath: string
): Promise<Suggestion | null> {
  // TODO: 実際のVSCode OSS統合時に実装
  // const file = astManager.getFile(filePath);
  // if (!file) {
  //   return null;
  // }
  // 
  // const uiStructure = parseTsxToUiStructure(file);
  // if (!uiStructure) {
  //   return null;
  // }
  // 
  // const node = findNodeById(uiStructure, nodeId);
  // if (!node) {
  //   return null;
  // }
  // 
  // return suggestForComplexSyntax(node);
  
  return null;
}

