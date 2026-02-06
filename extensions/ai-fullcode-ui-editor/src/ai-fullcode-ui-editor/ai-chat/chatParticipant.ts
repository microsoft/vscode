/**
 * Chat Participant（デフォルトエージェント）登録
 *
 * - ask: 通常チャット（テキスト応答のみ）
 * - agent: 計画取得 → Preview 表示 → 「適用する」/「やめる」followup（STEP3）
 * - /apply スラッシュコマンド: 従来どおり適用フロー（互換のため残す）
 */

import * as vscode from 'vscode';
import { runApplyPlan } from './applyPlanCommand';
import {
  runAgentInstruction,
  applyCurrentPlan,
  PROMPT_APPLY,
  PROMPT_CANCEL,
  METADATA_NEEDS_CONFIRM,
} from './agentController';
import { getCurrentPlan } from './planStore';
import { buildPlanPreview } from './codeApplier';
import { renderPreviewToMarkdown } from './planPreview';

/** package.json の chatParticipants[].id と一致させる */
export const CHAT_PARTICIPANT_ID = 'ai-fullcode.default';

/** /apply スラッシュコマンド名（package.json の commands[].name と一致） */
const SLASH_COMMAND_APPLY = 'apply';

/** agent モード名（本体は 'Agent'、package は "agent"。大文字小文字両方受け付ける） */
const MODE_AGENT_LOWER = 'agent';

/** request が agent モードか（適用フローを実行するか）。Agent 選択時は /apply 不要で自動で計画→適用する */
function isAgentMode(request: { command?: string; modeInstructions2?: { name?: string } }): boolean {
  if (request.command === SLASH_COMMAND_APPLY) return true;
  const name = request.modeInstructions2?.name;
  return typeof name === 'string' && name.toLowerCase() === MODE_AGENT_LOWER;
}

/** /apply 成功時の ChatResult.metadata に付与するキー（followupProvider で利用） */
export const METADATA_APPLY_COMMAND = 'aiFullcodeApplyCommand';
export const METADATA_APPLY_OP_COUNT = 'aiFullcodeApplyOpCount';

function historyToMessages(
  history: ReadonlyArray<vscode.ChatRequestTurn | vscode.ChatResponseTurn>
): vscode.LanguageModelChatMessage[] {
  const messages: vscode.LanguageModelChatMessage[] = [];
  for (const turn of history) {
    if (turn instanceof vscode.ChatRequestTurn) {
      messages.push(vscode.LanguageModelChatMessage.User(turn.prompt));
    } else if (turn instanceof vscode.ChatResponseTurn) {
      const parts: string[] = [];
      for (const part of turn.response) {
        if (part instanceof vscode.ChatResponseMarkdownPart) {
          const v = (part as { value?: string | { value?: string } }).value;
          parts.push(typeof v === 'string' ? v : (v?.value ?? '') || '');
        }
      }
      if (parts.length > 0) {
        messages.push(vscode.LanguageModelChatMessage.Assistant(parts.join('\n\n')));
      }
    }
  }
  return messages;
}

/** /apply の結果を「計画取得→確認→適用」のマルチステップ形式で Markdown に整形する */
function formatApplyResultAsSteps(result: Awaited<ReturnType<typeof runApplyPlan>>): string {
  if (!result.success && result.cancelled) {
    return '1. 計画を取得しました\n2. **適用をキャンセルしました**';
  }
  if (result.success) {
    const steps = [
      `1. 計画を取得しました（${result.opCount} 件の操作）`,
      '2. **適用しました**',
    ];
    const body = steps.join('\n\n') + (result.reasoning ? `\n\n**理由**: ${result.reasoning}` : '');
    return body;
  }
  if (result.opCount === 0) {
    return `1. 計画を取得しました（0 件）\n\n${result.error ?? ''}`;
  }
  return `1. 計画を取得しました（${result.opCount} 件）\n2. **適用に失敗しました**: ${result.error ?? '不明なエラー'}`;
}

/**
 * Chat Participant を生成し、ハンドラーと followupProvider を設定する。
 */
export function createAiFullcodeChatParticipant(): vscode.ChatParticipant {
  const participant = vscode.chat.createChatParticipant(
    CHAT_PARTICIPANT_ID,
    async (request, context, response, token): Promise<vscode.ChatResult | void> => {
      if (!request.model) {
        response.markdown('[AI Fullcode] 言語モデルが選択されていません。モデルピッカーで「AI Fullcode」を選んでください。');
        return;
      }

      // /apply スラッシュコマンド: 従来どおり runApplyPlan（diff + QuickPick → 適用）
      if (request.command === SLASH_COMMAND_APPLY) {
        const instruction = request.prompt?.trim() || '';
        if (!instruction) {
          response.markdown('[AI Fullcode] 例: /apply ボタンを追加して');
          return;
        }
        try {
          const result = await runApplyPlan(instruction);
          const stepsText = formatApplyResultAsSteps(result);
          response.markdown(stepsText);
          if (result.success) {
            return { metadata: { [METADATA_APPLY_COMMAND]: SLASH_COMMAND_APPLY, [METADATA_APPLY_OP_COUNT]: result.opCount } };
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          response.markdown(`[AI Fullcode] ${msg}`);
        }
        return;
      }

      // agent モード（/apply 以外）: STEP3 Preview → followup「適用する」/「やめる」
      if (isAgentMode(request)) {
        const promptTrim = request.prompt?.trim() ?? '';
        if (promptTrim === PROMPT_APPLY) {
          try {
            const result = await applyCurrentPlan(true);
            const text = result.success
              ? `✅ **適用しました**（${result.opCount} 件の操作）。元に戻す場合は「AI Fullcode: 直前の変更を元に戻す」を実行してください。`
              : `[AI Fullcode] ${result.error ?? '適用に失敗しました'}`;
            response.markdown(text);
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            response.markdown(`[AI Fullcode] ${msg}`);
          }
          return;
        }
        if (promptTrim === PROMPT_CANCEL) {
          const { clearCurrentPlan } = await import('./planStore');
          clearCurrentPlan();
          response.markdown('計画をやめました。');
          return;
        }
        if (!promptTrim) {
          response.markdown('[AI Fullcode] 指示を入力してください。例: ヘッダーの「お問い合わせ」を「テスト」に変更して');
          return;
        }
        try {
          const step1 = await runAgentInstruction(promptTrim);
          if (!step1.ok) {
            response.markdown(`[AI Fullcode] ${step1.error}`);
            return;
          }
          const current = getCurrentPlan();
          if (!current) {
            response.markdown('[AI Fullcode] 計画の取得に失敗しました。');
            return;
          }
          const preview = await buildPlanPreview(current);
          response.markdown(renderPreviewToMarkdown(preview));
          return { metadata: { [METADATA_NEEDS_CONFIRM]: true } };
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          response.markdown(`[AI Fullcode] ${msg}`);
          return;
        }
      }

      // ask モード: 通常チャット（テキスト応答のみ）
      const messages = historyToMessages(context.history);
      messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

      try {
        const res = await request.model.sendRequest(messages, {}, token);
        const parts: string[] = [];
        for await (const part of res.stream) {
          if (token.isCancellationRequested) break;
          if (part instanceof vscode.LanguageModelTextPart) {
            parts.push(part.value);
          }
        }
        const fullText = parts.join('');
        if (fullText.length > 0) {
          response.markdown(fullText);
        } else {
          response.markdown('[AI Fullcode] 応答がありませんでした。モデルを「AI Fullcode」に変更して再送信してください。');
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        response.markdown(`\n\n[AI Fullcode] ${msg}`);
      }
    }
  );

  participant.followupProvider = {
    provideFollowups(result, _context, _token) {
      if (result.metadata?.[METADATA_NEEDS_CONFIRM]) {
        return [
          { prompt: PROMPT_APPLY, label: '適用する' },
          { prompt: PROMPT_CANCEL, label: 'やめる' },
        ];
      }
      if (result.metadata?.[METADATA_APPLY_COMMAND] === SLASH_COMMAND_APPLY) {
        return [{ prompt: '', label: '別の指示を適用' }];
      }
      return [];
    },
  };

  return participant;
}
