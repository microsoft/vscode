/**
 * AI補完プロンプト生成
 * 
 * Phase 5: 非エンジニアUX
 * UI操作でできない構文のAI補完用プロンプト生成
 * 
 * 注意: 実際のVSCode OSS統合時には、既存のapps/web/lib/ui-structure/をインポートします。
 */

// TODO: 実際のVSCode OSS統合時に、以下のようにインポートします:
// import { UINode } from '../../../../apps/web/lib/ui-structure/types';
// import { generateTsxFromUiStructure } from '../../../../apps/web/lib/ui-structure/uiStructureToTsx';

/**
 * AIプロンプト
 */
export interface AIPrompt {
  system: string;
  user: string;
}

/**
 * 複雑な構文に対するAI補完用プロンプトを生成
 * 
 * UI操作でできない構文に対して、AI補完用のプロンプトを生成します。
 * 
 * @param node UIノード
 * @param intent ユーザーの意図
 * @returns AIプロンプト
 */
export function generateAIPromptForComplexSyntax(
  node: unknown, // TODO: UINode型
  intent: string
): AIPrompt {
  // TODO: 実際のVSCode OSS統合時に実装
  // const uiNode = node as UINode;
  // 
  // // UI構造ASTからTSXコードを生成
  // const code = generateTsxFromUiStructure(uiNode);
  // 
  // return {
  //   system: 'You are a React/TypeScript code assistant.',
  //   user: `The following code contains a complex syntax that cannot be edited via UI operations. Please help modify it according to the user's intent: "${intent}"\n\nCode:\n\`\`\`tsx\n${code}\n\`\`\``
  // };
  
  return {
    system: 'You are a React/TypeScript code assistant.',
    user: `Please help modify the code according to the user's intent: "${intent}"`
  };
}

/**
 * ノードに対するAI補完用プロンプトを生成
 * 
 * @param nodeId ノードID
 * @param filePath ファイルパス
 * @param intent ユーザーの意図
 * @returns AIプロンプト
 */
export async function generateAIPromptForNode(
  nodeId: string,
  filePath: string,
  intent: string
): Promise<AIPrompt> {
  // TODO: 実際のVSCode OSS統合時に実装
  // const file = astManager.getFile(filePath);
  // if (!file) {
  //   throw new Error(`File not found: ${filePath}`);
  // }
  // 
  // const uiStructure = parseTsxToUiStructure(file);
  // if (!uiStructure) {
  //   throw new Error("Failed to parse TSX to UI structure");
  // }
  // 
  // const node = findNodeById(uiStructure, nodeId);
  // if (!node) {
  //   throw new Error(`Node not found: ${nodeId}`);
  // }
  // 
  // return generateAIPromptForComplexSyntax(node, intent);
  
  return generateAIPromptForComplexSyntax(null, intent);
}

