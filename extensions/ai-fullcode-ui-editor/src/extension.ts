/**
 * Extension エントリーポイント
 *
 * 絶対条件（getDefaultAgent() が undefined にならないために必須）:
 * - Chat Participant の **impl** を activate の先頭で同期的に登録する。
 * - 「データはあるが impl が登録されていない」状態だと getDefaultAgent() は undefined のまま。
 * - 重い初期化は次の tick に回し、impl 登録が main thread に届いてから実行する。
 */

import * as vscode from 'vscode';
import { registerAiFullcodeAuthProvider } from './ai-fullcode-ui-editor/auth-provider';
import { createAiFullcodeChatParticipant } from './ai-fullcode-ui-editor/ai-chat/chatParticipant';
import { initAIFullcodeUIEditor, registerLmAndTools } from './ai-fullcode-ui-editor/main';
import { setLmOutputChannel } from './ai-fullcode-ui-editor/lm-provider/lmLogger';

/**
 * Extension アクティベート
 *
 * 唯一の絶対条件: Chat Agent の impl を「今この瞬間」使える状態にする。
 * ① activate の先頭で createChatParticipant + push だけ同期的に実行（try/catch で包まない）
 * ② それ以外（認証・AST/UI/Preview/LM/ツール）はすべて次の tick に回す
 */
export function activate(context: vscode.ExtensionContext): void {
  console.log('[AI-FULLCODE] activate start');

  const lmChannel = vscode.window.createOutputChannel('AI Fullcode');
  context.subscriptions.push(lmChannel);
  setLmOutputChannel(lmChannel);

  // 🔴 最優先・絶対。失敗したら拡張ごと throw。try/catch は診断用（原因をログに残す）。
  let participant: vscode.ChatParticipant;
  try {
    participant = createAiFullcodeChatParticipant();
  } catch (err) {
    console.error('[AI-FULLCODE] createAiFullcodeChatParticipant FAILED', err);
    throw err;
  }
  context.subscriptions.push(participant);
  console.log('[AI-FULLCODE] chat participant registered', (participant as { id?: string }).id ?? 'unknown');

  // LM プロバイダーを「今すぐ」登録（setImmediate より前）。Chat がモデルを解決できるようにする。
  try {
    registerLmAndTools(context);
  } catch (err) {
    console.error('[AI-FULLCODE] registerLmAndTools FAILED', err);
    throw err;
  }

  // 診断: 次の tick で拡張 API から見える状態を確認（本体側は getActivatedAgents で確認）
  setTimeout(() => {
    const api = (vscode as unknown as { chat?: { getAgents?: () => unknown } }).chat;
    if (api?.getAgents) {
      console.log('[AI-FULLCODE] (diagnostic) chat.getAgents()', api.getAgents());
    }
  }, 0);

  // 🟡 ここから下は「後回し」。impl 登録が main thread に届いてから実行する。
  const runAfterRegistration = (): void => {
    registerAiFullcodeAuthProvider(context);
    initAIFullcodeUIEditor(context).catch((err: unknown) =>
      console.error('[Extension] init error:', err)
    );
  };
  if (typeof setImmediate === 'function') {
    setImmediate(runAfterRegistration);
  } else {
    setTimeout(runAfterRegistration, 0);
  }
}

/**
 * Extension デアクティベート
 */
export async function deactivate(): Promise<void> {
  // クリーンアップ処理（必要に応じて実装）
  console.log('[Extension] Deactivated');
}

