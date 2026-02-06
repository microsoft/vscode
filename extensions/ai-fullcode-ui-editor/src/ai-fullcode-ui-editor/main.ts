/**
 * AI Fullcode UI Editor - メインエントリーポイント
 *
 * VSCode OSS統合版の初期化処理
 * Phase 1: VSCode OSS起動
 *
 * 注意: 実際のVSCode OSS統合時には、以下のパッケージを使用します:
 * - VSCode OSSの実際のforkリポジトリ
 * - または、VSCode OSSのWeb版実装
 */

// TODO: VSCode Web版のインポート（実際のVSCode OSS統合時に実装）
// 実際のVSCode OSSでは、以下のような形でインポートします:
// import { main } from 'vscode-web';
// または、VSCode OSSの実際のエントリーポイントからインポート

// 統合レイヤーのインポート
import * as vscode from 'vscode';
import { initASTBridge } from './ast-bridge';
import { initUIOperation } from './ui-operation';
import { initPreview } from './preview';
import { initChatView } from './ai-chat';
import { registerApplyPlanCommand, registerPlanConfirmCommands } from './ai-chat/applyPlanCommand';
import { initStorage } from './storage';
import { handleChatMessage, applyOneOperation, verifyCodeViaWebApi, setExtensionPathForPlanScript } from './ai-chat/mcpBridge';
import { LM_VENDOR, createAiFullcodeLanguageModelProvider } from './lm-provider';

/**
 * LM プロバイダーとツールのみを登録する（activate 直後に同期的に呼ぶ用）。
 * Chat が「モデル未登録」で真っ黒にならないよう、Participant 登録の直後に必ず実行する。
 */
export function registerLmAndTools(context: vscode.ExtensionContext): void {
  try {
    context.subscriptions.push(
      vscode.lm.registerLanguageModelChatProvider(LM_VENDOR, createAiFullcodeLanguageModelProvider())
    );
    console.log('[AI-FULLCODE] LM provider registered', LM_VENDOR);
  } catch (error) {
    console.error('[AI-FULLCODE] Failed to register LM provider:', error);
    throw error;
  }
  try {
    context.subscriptions.push(
      vscode.lm.registerTool<{ instruction: string }>('aiFullcodeGetUiPlan', {
        invoke: async (options, _token) => {
          const plan = await handleChatMessage(options.input.instruction);
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(plan)),
          ]);
        },
      }),
      vscode.lm.registerTool<{ operation: Record<string, unknown>; filePath?: string }>('aiFullcodeApplyOperation', {
        invoke: async (options, _token) => {
          const result = await applyOneOperation(
            options.input.operation as Record<string, unknown> & { filePath?: string },
            options.input.filePath
          );
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(result)),
          ]);
        },
      }),
      vscode.lm.registerTool<{ code?: string; filePath?: string }>('aiFullcodeVerify', {
        invoke: async (options, _token) => {
          const result = await verifyCodeViaWebApi(options.input.code, options.input.filePath);
          return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(result)),
          ]);
        },
      })
    );
    console.log('[AI-FULLCODE] LM tools registered');
  } catch (error) {
    console.warn('[AI Fullcode UI Editor] Failed to register LM tools:', error);
  }
}

/**
 * VSCode OSS起動と統合レイヤー初期化（LM・ツールは extension.ts で先に登録済み）。
 *
 * @param context VSCode拡張機能コンテキスト
 */
export async function initAIFullcodeUIEditor(context: any): Promise<void> {
  try {
    if (context?.extensionUri?.fsPath) {
      setExtensionPathForPlanScript(context.extensionUri);
    }
  } catch {
    // フォールバックなしで続行
  }
  try {
    initASTBridge();
    initUIOperation(context);
    initPreview(context);
  } catch (error) {
    console.warn('[AI Fullcode UI Editor] Phase 2–4 init error (continuing):', error);
  }

  try {
    initChatView();
  } catch (error) {
    // ChatService が利用できない場合などは警告のみ
  }

  try {
    registerApplyPlanCommand(context);
    registerPlanConfirmCommands(context);
  } catch (error) {
    console.warn('[AI Fullcode UI Editor] registerApplyPlanCommand error:', error);
  }

  try {
    initStorage(context, 'default');
  } catch (error) {
    console.warn('[AI Fullcode UI Editor] Storage init error:', error);
  }
}

