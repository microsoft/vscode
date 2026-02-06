/**
 * LM チャットバックエンド（アプリのみ仕様・Web 不使用）
 *
 * VS Code の LM リクエストメッセージを API 用の { role, content } に変換するのみ。
 * 実際のストリーム応答は aiFullcodeLanguageModelProvider が他 LM または OpenAI 直接で行う。
 */

import type * as vscode from 'vscode';

export type SimpleChatMessage = { role: 'system' | 'user' | 'assistant'; content: string };

/**
 * LanguageModelChatRequestMessage の content からテキストのみを連結して取得
 */
function getTextFromContent(content: ReadonlyArray<unknown>): string {
  if (!content || !Array.isArray(content)) return '';
  let out = '';
  for (const part of content) {
    if (part && typeof part === 'object' && 'value' in part && typeof (part as { value: string }).value === 'string') {
      out += (part as { value: string }).value;
    }
  }
  return out;
}

/**
 * VS Code の LM リクエストメッセージを API 用の { role, content } に変換
 */
export function toApiMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[]
): SimpleChatMessage[] {
  const result: SimpleChatMessage[] = [];
  for (const m of messages) {
    const role = m.role as number;
    // LanguageModelChatMessageRole: System=0, User=1, Assistant=2
    let roleStr: 'system' | 'user' | 'assistant' = 'user';
    if (role === 0) roleStr = 'system';
    else if (role === 1) roleStr = 'user';
    else if (role === 2) roleStr = 'assistant';
    const content = getTextFromContent(m.content as ReadonlyArray<unknown>);
    result.push({ role: roleStr, content });
  }
  return result;
}
