/**
 * 認証プロバイダー（no-op）
 *
 * product.json の defaultChatAgent.provider.default.id が "ai-fullcode" のため、
 * ChatEntitlementService が getSessions('ai-fullcode') を呼ぶ。
 * プロバイダーが未登録だと「Timed out waiting for authentication provider 'ai-fullcode' to register」になるため、
 * 空セッションを返すプロバイダーを登録する。
 */

import * as vscode from 'vscode';

const AUTH_PROVIDER_ID = 'ai-fullcode';
const AUTH_PROVIDER_LABEL = 'AI Fullcode';

function createNoOpAuthProvider(): vscode.AuthenticationProvider {
  const onDidChangeSessionsEmitter = new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
  return {
    get onDidChangeSessions() {
      return onDidChangeSessionsEmitter.event;
    },
    getSessions: async (_scopes?: readonly string[]): Promise<vscode.AuthenticationSession[]> => {
      return [];
    },
    createSession: async (_scopes: readonly string[]): Promise<vscode.AuthenticationSession> => {
      // OSS: サインイン不要のためダミーセッションを返す。throw すると setup が「サインイン失敗」と判断しエラーになる。
      return {
        id: 'ai-fullcode-oss',
        accessToken: 'oss-no-auth',
        account: { id: 'oss', label: 'AI Fullcode' },
        scopes: [],
      };
    },
    removeSession: async (_sessionId: string): Promise<void> => {
      // no-op
    },
  };
}

/**
 * ai-fullcode 用の no-op 認証プロバイダーを登録する。
 * main から activate の早い段階で呼ぶこと（Chat の entitlement 解決前に必要）。
 */
export function registerAiFullcodeAuthProvider(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.authentication.registerAuthenticationProvider(
      AUTH_PROVIDER_ID,
      AUTH_PROVIDER_LABEL,
      createNoOpAuthProvider()
    )
  );
}
