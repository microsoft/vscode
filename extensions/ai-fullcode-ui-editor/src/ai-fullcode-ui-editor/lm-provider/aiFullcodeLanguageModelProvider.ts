/**
 * AI Fullcode 用 LanguageModelChatProvider（アプリのみ仕様・Web 不使用）
 *
 * 1) 他 LM（Copilot 等）があればそれを使用、2) なければ openaiApiKey（設定 or .env）で OpenAI 直接呼び出し。
 */

import * as vscode from 'vscode';
import { toApiMessages } from './chatBackend';
import { streamChatFromOpenAI } from './openaiBackend';
import { LM_MODELS, LM_VENDOR, toLanguageModelChatInformation } from './lmProvider.types';
import { logLm } from './lmLogger';
import { getOpenAiKeyFromWorkspaceEnv } from './envLoader';

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

function requestMessagesToChatMessages(
  messages: readonly vscode.LanguageModelChatRequestMessage[]
): vscode.LanguageModelChatMessage[] {
  const result: vscode.LanguageModelChatMessage[] = [];
  for (const m of messages) {
    const role = m.role as number;
    const text = getTextFromContent(m.content as ReadonlyArray<unknown>);
    if (role === 2) {
      result.push(vscode.LanguageModelChatMessage.Assistant(text));
    } else {
      result.push(vscode.LanguageModelChatMessage.User(text));
    }
  }
  return result;
}

/**
 * OSS のみ: 他ベンダーの LM を 1 つ選び、その sendRequest でストリームする。
 * 他モデルが 0 の場合は false を返し、呼び出し元で OpenAI フォールバックを行う。
 */
async function streamViaVscodeLm(
  messages: readonly vscode.LanguageModelChatRequestMessage[],
  progress: vscode.Progress<vscode.LanguageModelResponsePart>,
  token: vscode.CancellationToken
): Promise<boolean> {
  const models = await vscode.lm.selectChatModels({});
  const other = models.filter((m) => m.vendor !== LM_VENDOR);
  logLm('selectChatModels', { total: models.length, otherVendors: other.length, vendors: other.map((m) => ({ vendor: m.vendor, id: m.id })) });
  const model = other[0];
  if (!model) {
    return false;
  }
  const chatMessages = requestMessagesToChatMessages(messages);
  const response = await model.sendRequest(chatMessages, {}, token);
  let reported = false;
  for await (const part of response.stream) {
    if (token.isCancellationRequested) break;
    if (part instanceof vscode.LanguageModelTextPart) {
      progress.report(part);
      reported = true;
    }
  }
  return reported;
}

/**
 * AI Fullcode 用 LanguageModelChatProvider を生成
 */
export function createAiFullcodeLanguageModelProvider(): vscode.LanguageModelChatProvider {
  return {
    async provideLanguageModelChatInformation(_options, _token) {
      return LM_MODELS.map(toLanguageModelChatInformation);
    },
    async provideLanguageModelChatResponse(_model, _messages, _options, progress, token) {
      try {
        const config = vscode.workspace.getConfiguration('aiFullcodeUiEditor');
        const openaiApiKeyFromSetting = config.get<string>('openaiApiKey');
        const openaiApiKey =
          openaiApiKeyFromSetting && openaiApiKeyFromSetting.trim() !== ''
            ? openaiApiKeyFromSetting.trim()
            : await getOpenAiKeyFromWorkspaceEnv();
        const hasOpenAiKey = Boolean(openaiApiKey && openaiApiKey.trim() !== '');
        const modelId = typeof _model === 'object' && _model !== null && 'id' in _model ? (_model as { id: string }).id : undefined;
        const apiModelId = modelId ? LM_MODELS.find((m) => m.id === modelId)?.apiModelId : undefined;

        logLm('provideResponse', {
          hasOpenAiKey,
          openaiKeySource: openaiApiKeyFromSetting?.trim() ? 'settings' : openaiApiKey ? '.env.local/.env' : 'none',
          modelId: modelId ?? 'undefined',
        });

        let reported = await streamViaVscodeLm(_messages, progress, token);
        if (reported) {
          return;
        }

        if (hasOpenAiKey) {
          logLm('他 LM なし → OpenAI API でストリーム');
          const messages = toApiMessages(_messages);
          for await (const chunk of streamChatFromOpenAI(openaiApiKey!.trim(), messages, apiModelId, token)) {
            if (chunk.length > 0) {
              progress.report(new vscode.LanguageModelTextPart(chunk));
              reported = true;
            }
          }
          if (reported) {
            return;
          }
        }

        progress.report(
          new vscode.LanguageModelTextPart(
            '\n\n[AI Fullcode] チャット応答に使える LM がありません。\n\n' +
              '**対処法:**\n' +
              '1. **設定で OpenAI API キーを指定** … 設定 `aiFullcodeUiEditor.openaiApiKey` に OpenAI API キーを入力する。\n' +
              '2. **ワークスペースの .env.local** … プロジェクトルートの `.env.local` に `OPENAI_API_KEY=sk-...` を書く（本拡張の独自実装で参照）。\n' +
              '3. **/apply** … チャットで `/apply 〇〇して` と入力すると、計画取得・適用はワークスペースのスクリプトで動作（OPENAI_API_KEY が環境にあれば計画生成も可能）。\n\n' +
              '**Output パネル**で「AI Fullcode」を選ぶとログ（[AI Fullcode LM]）が確認できます。'
          )
        );
      } catch (e) {
        logLm('provideResponse error', e);
        progress.report(
          new vscode.LanguageModelTextPart(`[AI Fullcode] ${e instanceof Error ? e.message : String(e)}`)
        );
      }
    },
    async provideTokenCount(_model, text, _token) {
      const str = typeof text === 'string' ? text : JSON.stringify(text);
      return Math.ceil(str.length / 4);
    },
  };
}
