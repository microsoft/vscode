/**
 * 既存MCP統合（中身は現状維持）
 * 
 * Phase 6: AIチャット統合
 * 既存の/api/mcpをそのまま呼び出す
 * 
 * 重要: 既存のMCP（/api/mcp）をそのまま使用します。
 * VSCode OSSの内蔵AI（Copilot API）には依存しません。
 */

// TODO: 実際のVSCode OSS統合時に、以下のようにインポートします:
// import { planOperations, AIOperationPlan } from '../../../../apps/web/lib/ai/planOperations';
// import { astManager } from '../../../../apps/web/lib/ast/astManager';
// import { parseTsxToUiStructure } from '../../../../apps/web/lib/ui-structure/tsxToUiStructure';
// import { window } from 'vscode';

/**
 * チャットメッセージを処理
 * 
 * 既存のplanOperationsをそのまま使用して、AI操作計画を生成します。
 * 
 * @param userInstruction ユーザーの指示
 * @returns AI操作計画
 */
export async function handleChatMessage(
  userInstruction: string
): Promise<unknown> { // TODO: AIOperationPlan型
  try {
    // eslint-disable-next-line no-console
    console.log('[MCP Bridge] チャットメッセージ処理開始:', userInstruction);
    
    // TODO: 実際のVSCode OSS統合時に実装
    // const activeEditor = window.activeTextEditor;
    // if (!activeEditor) {
    //   throw new Error('No active editor');
    // }
    // 
    // const filePath = activeEditor.document.uri.fsPath;
    // const code = activeEditor.document.getText();
    // 
    // // ASTからUI構造ASTを取得（既存ロジック）
    // const file = astManager.getFile(filePath);
    // if (!file) {
    //   // ファイルが存在しない場合、読み込む
    //   astManager.loadFile(filePath, code);
    //   const loadedFile = astManager.getFile(filePath);
    //   if (!loadedFile) {
    //     throw new Error(`Failed to load file: ${filePath}`);
    //   }
    // }
    // 
    // const uiStructure = parseTsxToUiStructure(file);
    // if (!uiStructure) {
    //   throw new Error("Failed to parse TSX to UI structure");
    // }
    // 
    // // 既存のplanOperationsを呼び出す
    // const plan = await planOperations(
    //   userInstruction,
    //   uiStructure,
    //   filePath
    // );
    // 
    // return plan;
    
    return {
      userInstruction,
      operations: [],
      reasoning: '実装予定',
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error('[MCP Bridge] エラー:', errorMessage);
    throw error;
  }
}

/**
 * MCP APIを直接呼び出す（既存の/api/mcpを使用）
 * 
 * @param request MCPリクエスト
 * @returns MCPレスポンス
 */
export async function callMCPAPI(request: unknown): Promise<unknown> {
  // TODO: 実際のVSCode OSS統合時に実装
  // 既存の/api/mcpエンドポイントを呼び出す
  // const response = await fetch('/api/mcp', {
  //   method: 'POST',
  //   headers: {
  //     'Content-Type': 'application/json',
  //   },
  //   body: JSON.stringify(request),
  // });
  // 
  // if (!response.ok) {
  //   throw new Error(`MCP API error: ${response.statusText}`);
  // }
  // 
  // return response.json();
  
  return { success: false, error: 'Not implemented' };
}

