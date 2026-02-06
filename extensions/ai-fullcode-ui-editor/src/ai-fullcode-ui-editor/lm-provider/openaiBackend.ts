/**
 * OSS のみ: OpenAI Chat Completions API を直接呼び出しストリーム返却。
 * 他 LM が利用できないとき、設定 aiFullcodeUiEditor.openaiApiKey で応答する。
 */

import type * as vscode from 'vscode';
import type { SimpleChatMessage } from './chatBackend';

const USER_ERROR_PREFIX = '[AI Fullcode]';
const OPENAI_TIMEOUT_MS = 60_000;
const DEFAULT_MODEL = 'gpt-4o-mini';

function toErrorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * OpenAI Chat Completions (stream) を呼び出し、テキストチャンクを yield する。
 * 例外時は throw せずエラーメッセージを yield する。
 */
export async function* streamChatFromOpenAI(
  apiKey: string,
  messages: SimpleChatMessage[],
  model: string | undefined,
  token: vscode.CancellationToken
): AsyncGenerator<string, void, undefined> {
  const key = apiKey.trim();
  if (!key) {
    yield `\n\n${USER_ERROR_PREFIX} 設定 \`aiFullcodeUiEditor.openaiApiKey\` が空です。`;
    return;
  }

  const body = {
    model: model || DEFAULT_MODEL,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
    stream: true,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const detail = text ? (text.length > 300 ? text.slice(0, 300) + '...' : text) : res.statusText;
      yield `\n\n${USER_ERROR_PREFIX} OpenAI API エラー: ${res.status} ${detail}`;
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      yield `\n\n${USER_ERROR_PREFIX} OpenAI: レスポンスボディがありません。`;
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (!token.isCancellationRequested) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed !== '' && trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> };
              const content = parsed.choices?.[0]?.delta?.content;
              if (typeof content === 'string' && content.length > 0) {
                yield content;
              }
            } catch {
              // 1 行パース失敗は無視
            }
          }
        }
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        // ignore
      }
    }
  } catch (err) {
    const msg = toErrorText(err);
    if (err instanceof Error && err.name === 'AbortError') {
      yield `\n\n${USER_ERROR_PREFIX} OpenAI 接続がタイムアウトしました（${OPENAI_TIMEOUT_MS / 1000}秒）。`;
      return;
    }
    yield `\n\n${USER_ERROR_PREFIX} OpenAI: ${msg}`;
  }
}
