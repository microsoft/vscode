/**
 * LM プロバイダー用型定義
 *
 * Manage Models に表示するモデル情報の ID / family / 名前を一元管理する。
 */

import type * as vscode from 'vscode';

/** プロバイダー vendor 名（package.json の languageModelChatProviders.vendor と一致させる） */
export const LM_VENDOR = 'ai-fullcode';

/** デフォルトモデル ID（Auto で使う想定） */
export const DEFAULT_MODEL_ID = 'ai-fullcode-default';

/** モデル情報の定義（provideLanguageModelChatInformation で返す一覧） */
export interface LmModelDefinition {
  id: string;
  name: string;
  family: string;
  version: string;
  maxInputTokens: number;
  maxOutputTokens: number;
  /** API に渡す modelId（OpenAI 等の modelId、未指定ならデフォルト） */
  apiModelId?: string;
  /** Auto で使うデフォルトモデルにする */
  isDefault?: boolean;
}

/** 公開するモデル一覧（将来 OpenAI / Claude / Gemini / MCP を追加可能） */
export const LM_MODELS: LmModelDefinition[] = [
  {
    id: DEFAULT_MODEL_ID,
    name: 'AI Fullcode (Default)',
    family: 'ai-fullcode',
    version: '1.0',
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    apiModelId: undefined, // サーバー側 OPENAI_MODEL を使用
    isDefault: true,
  },
  {
    id: 'ai-fullcode-gpt-4o-mini',
    name: 'AI Fullcode (GPT-4o mini)',
    family: 'ai-fullcode',
    version: '1.0',
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    apiModelId: 'gpt-4o-mini',
  },
  {
    id: 'ai-fullcode-gpt-4o',
    name: 'AI Fullcode (GPT-4o)',
    family: 'ai-fullcode',
    version: '1.0',
    maxInputTokens: 128000,
    maxOutputTokens: 4096,
    apiModelId: 'gpt-4o',
  },
];

/**
 * LmModelDefinition を LanguageModelChatInformation に変換
 */
export function toLanguageModelChatInformation(
  def: LmModelDefinition
): vscode.LanguageModelChatInformation {
  const info: vscode.LanguageModelChatInformation & { isDefault?: boolean; isUserSelectable?: boolean } = {
    id: def.id,
    name: def.name,
    family: def.family,
    version: def.version,
    maxInputTokens: def.maxInputTokens,
    maxOutputTokens: def.maxOutputTokens,
    capabilities: {
      toolCalling: true,
    },
    isUserSelectable: true,
  };
  if (def.isDefault) {
    info.isDefault = true;
  }
  return info as vscode.LanguageModelChatInformation;
}
