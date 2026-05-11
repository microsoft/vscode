/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Son of Anton Contributors. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Per-model metadata used by the chat webview's model picker
 * tooltips (Phase 5). Single source of truth for context-window /
 * max-output / capabilities / pricing / ideal-use blurb.
 *
 * Numbers come from each provider's public pricing & capabilities pages
 * as of late 2026; update alongside model availability changes. Where a
 * provider quotes tiered pricing (e.g. Gemini 1.5 Pro <128K vs >128K),
 * we report the lower-context tier — that's what most chat workloads hit.
 *
 * Subscription-style models (`claude-code-*`) report an output cost of 0
 * because they're billed against the user's flat-rate Claude Code
 * subscription — explicit "subscription" copy lives in the blurb.
 */
import type { ModelId } from './LlmClient';

export type ModelCapability = 'text' | 'vision' | 'tools' | 'reasoning' | 'audio';

export interface ModelInfo {
	readonly contextWindow: number;
	readonly maxOutputTokens: number;
	readonly capabilities: ReadonlyArray<ModelCapability>;
	readonly inputCostPer1M: number;
	readonly outputCostPer1M: number;
	readonly blurb: string;
}

export const MODEL_METADATA: Record<ModelId, ModelInfo> = {
	// --- Claude (Anthropic) ----------------------------------------
	opus: { contextWindow: 200000, maxOutputTokens: 4096, capabilities: ['text', 'tools'], inputCostPer1M: 15, outputCostPer1M: 75, blurb: 'Legacy Opus alias — routes to the latest Opus snapshot.' },
	sonnet: { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Legacy Sonnet alias — routes to the latest Sonnet snapshot.' },
	haiku: { contextWindow: 200000, maxOutputTokens: 4096, capabilities: ['text', 'tools'], inputCostPer1M: 0.25, outputCostPer1M: 1.25, blurb: 'Legacy Haiku alias — routes to the latest Haiku snapshot.' },
	'claude-opus-4-7': { contextWindow: 1000000, maxOutputTokens: 32000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 15, outputCostPer1M: 75, blurb: 'Anthropic\'s most capable model. Pick for hard reasoning, multi-file refactors.' },
	'claude-sonnet-4-7': { contextWindow: 1000000, maxOutputTokens: 32000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Best capability / cost balance. Default for most chat work.' },
	'claude-haiku-4-7': { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 1, outputCostPer1M: 5, blurb: 'Fast + cheap; ideal for high-volume short tasks.' },
	'claude-opus-4-6': { contextWindow: 500000, maxOutputTokens: 32000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 15, outputCostPer1M: 75, blurb: 'Previous Opus generation. Use 4.7 unless you have a reproducibility need.' },
	'claude-sonnet-4-6': { contextWindow: 500000, maxOutputTokens: 32000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Previous Sonnet generation. Strong drop-in for 4.7.' },
	'claude-haiku-4-6': { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 1, outputCostPer1M: 5, blurb: 'Previous Haiku generation.' },
	'claude-opus-4-5': { contextWindow: 200000, maxOutputTokens: 32000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 15, outputCostPer1M: 75, blurb: 'Earlier Opus 4.x snapshot.' },
	'claude-sonnet-4-5': { contextWindow: 200000, maxOutputTokens: 64000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Sonnet 4.5 — first wide-deployment of long-thinking on Claude.' },
	'claude-haiku-4-5': { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 1, outputCostPer1M: 5, blurb: 'Haiku 4.5 — speedy generalist.' },
	'claude-opus-4-1': { contextWindow: 200000, maxOutputTokens: 32000, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 15, outputCostPer1M: 75, blurb: 'Pre-thinking Opus 4.1.' },
	'claude-sonnet-4-1': { contextWindow: 200000, maxOutputTokens: 64000, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Pre-thinking Sonnet 4.1.' },
	'claude-opus-4': { contextWindow: 200000, maxOutputTokens: 32000, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 15, outputCostPer1M: 75, blurb: 'Original Opus 4 release.' },
	'claude-sonnet-4': { contextWindow: 200000, maxOutputTokens: 64000, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Original Sonnet 4 release.' },
	'claude-3-7-sonnet': { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Sonnet 3.7 — first Sonnet with extended thinking.' },
	'claude-3-5-sonnet': { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Sonnet 3.5 — long-running workhorse.' },
	'claude-3-5-haiku': { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0.8, outputCostPer1M: 4, blurb: 'Haiku 3.5 — predecessor to the 4.x line.' },
	'claude-3-opus': { contextWindow: 200000, maxOutputTokens: 4096, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 15, outputCostPer1M: 75, blurb: 'Original Opus.' },
	'claude-3-sonnet': { contextWindow: 200000, maxOutputTokens: 4096, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Original Sonnet.' },
	'claude-3-haiku': { contextWindow: 200000, maxOutputTokens: 4096, capabilities: ['text', 'tools'], inputCostPer1M: 0.25, outputCostPer1M: 1.25, blurb: 'Original Haiku.' },

	// --- Claude Code (subscription) --------------------------------
	'claude-code-opus': { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'Opus via your Claude Code subscription. No API key required.' },
	'claude-code-sonnet': { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'Sonnet via your Claude Code subscription.' },
	'claude-code-haiku': { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'Haiku via your Claude Code subscription.' },

	// --- OpenAI ----------------------------------------------------
	'gpt-4o': { contextWindow: 128000, maxOutputTokens: 16384, capabilities: ['text', 'vision', 'tools', 'audio'], inputCostPer1M: 2.5, outputCostPer1M: 10, blurb: 'OpenAI\'s multimodal flagship before GPT-5.' },
	'gpt-4o-mini': { contextWindow: 128000, maxOutputTokens: 16384, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 0.15, outputCostPer1M: 0.6, blurb: 'Cheapest 4o tier — high-volume utility.' },
	'gpt-5': { contextWindow: 400000, maxOutputTokens: 128000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 1.25, outputCostPer1M: 10, blurb: 'OpenAI\'s flagship with native reasoning.' },
	'gpt-5-mini': { contextWindow: 400000, maxOutputTokens: 128000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 0.25, outputCostPer1M: 2, blurb: 'GPT-5 mini — most chat work, half the price.' },
	'gpt-5-nano': { contextWindow: 400000, maxOutputTokens: 128000, capabilities: ['text', 'tools', 'reasoning'], inputCostPer1M: 0.05, outputCostPer1M: 0.4, blurb: 'Cheapest GPT-5 — tight loops, completions.' },
	'gpt-5-codex': { contextWindow: 400000, maxOutputTokens: 128000, capabilities: ['text', 'tools', 'reasoning'], inputCostPer1M: 1.25, outputCostPer1M: 10, blurb: 'GPT-5 fine-tuned for code generation.' },
	'gpt-4-1': { contextWindow: 1000000, maxOutputTokens: 32768, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 2, outputCostPer1M: 8, blurb: 'GPT-4.1 — long-context generalist.' },
	'gpt-4-1-mini': { contextWindow: 1000000, maxOutputTokens: 32768, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 0.4, outputCostPer1M: 1.6, blurb: 'GPT-4.1 mini — long-context, cheap.' },
	'gpt-4-1-nano': { contextWindow: 1000000, maxOutputTokens: 32768, capabilities: ['text', 'tools'], inputCostPer1M: 0.1, outputCostPer1M: 0.4, blurb: 'GPT-4.1 nano — bulk classification, embeddings-adjacent.' },
	'gpt-4-turbo': { contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 10, outputCostPer1M: 30, blurb: 'Legacy GPT-4 Turbo — pricey vs 4o.' },
	'gpt-3-5-turbo': { contextWindow: 16385, maxOutputTokens: 4096, capabilities: ['text', 'tools'], inputCostPer1M: 0.5, outputCostPer1M: 1.5, blurb: 'Legacy 3.5 — keep around for cheap throwaway calls.' },
	'o1': { contextWindow: 200000, maxOutputTokens: 100000, capabilities: ['text', 'reasoning'], inputCostPer1M: 15, outputCostPer1M: 60, blurb: 'OpenAI o1 reasoning model. Best for math + structured proofs.' },
	'o1-mini': { contextWindow: 128000, maxOutputTokens: 65536, capabilities: ['text', 'reasoning'], inputCostPer1M: 1.1, outputCostPer1M: 4.4, blurb: 'o1 mini — reasoning at a fifth of the cost.' },
	'o1-pro': { contextWindow: 200000, maxOutputTokens: 100000, capabilities: ['text', 'reasoning'], inputCostPer1M: 150, outputCostPer1M: 600, blurb: 'o1 pro — deep-think, premium.' },
	'o3': { contextWindow: 200000, maxOutputTokens: 100000, capabilities: ['text', 'tools', 'reasoning'], inputCostPer1M: 2, outputCostPer1M: 8, blurb: 'o3 — tool-using reasoning model.' },
	'o3-mini': { contextWindow: 200000, maxOutputTokens: 100000, capabilities: ['text', 'tools', 'reasoning'], inputCostPer1M: 1.1, outputCostPer1M: 4.4, blurb: 'o3 mini — cheap reasoning + tools.' },
	'o4-mini': { contextWindow: 200000, maxOutputTokens: 100000, capabilities: ['text', 'tools', 'reasoning'], inputCostPer1M: 1.1, outputCostPer1M: 4.4, blurb: 'o4 mini — newer reasoning model.' },

	// --- Microsoft Foundry / Azure OpenAI --------------------------
	'foundry-gpt-4': { contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['text', 'tools'], inputCostPer1M: 2.5, outputCostPer1M: 10, blurb: 'GPT-4 deployed in your Azure resource.' },
	'foundry-gpt-4o': { contextWindow: 128000, maxOutputTokens: 16384, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 2.5, outputCostPer1M: 10, blurb: 'GPT-4o on Foundry.' },
	'foundry-gpt-4o-mini': { contextWindow: 128000, maxOutputTokens: 16384, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 0.15, outputCostPer1M: 0.6, blurb: 'GPT-4o mini on Foundry.' },
	'foundry-gpt-4-1': { contextWindow: 1000000, maxOutputTokens: 32768, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 2, outputCostPer1M: 8, blurb: 'GPT-4.1 on Foundry — long context.' },
	'foundry-gpt-4-1-mini': { contextWindow: 1000000, maxOutputTokens: 32768, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 0.4, outputCostPer1M: 1.6, blurb: 'GPT-4.1 mini on Foundry.' },
	'foundry-gpt-4-1-nano': { contextWindow: 1000000, maxOutputTokens: 32768, capabilities: ['text', 'tools'], inputCostPer1M: 0.1, outputCostPer1M: 0.4, blurb: 'GPT-4.1 nano on Foundry.' },
	'foundry-gpt-5': { contextWindow: 400000, maxOutputTokens: 128000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 1.25, outputCostPer1M: 10, blurb: 'GPT-5 on Foundry.' },
	'foundry-gpt-5-mini': { contextWindow: 400000, maxOutputTokens: 128000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 0.25, outputCostPer1M: 2, blurb: 'GPT-5 mini on Foundry.' },
	'foundry-gpt-5-nano': { contextWindow: 400000, maxOutputTokens: 128000, capabilities: ['text', 'tools', 'reasoning'], inputCostPer1M: 0.05, outputCostPer1M: 0.4, blurb: 'GPT-5 nano on Foundry.' },
	'foundry-o1': { contextWindow: 200000, maxOutputTokens: 100000, capabilities: ['text', 'reasoning'], inputCostPer1M: 15, outputCostPer1M: 60, blurb: 'o1 on Foundry.' },
	'foundry-o1-mini': { contextWindow: 128000, maxOutputTokens: 65536, capabilities: ['text', 'reasoning'], inputCostPer1M: 1.1, outputCostPer1M: 4.4, blurb: 'o1 mini on Foundry.' },
	'foundry-o3': { contextWindow: 200000, maxOutputTokens: 100000, capabilities: ['text', 'tools', 'reasoning'], inputCostPer1M: 2, outputCostPer1M: 8, blurb: 'o3 on Foundry.' },
	'foundry-o3-mini': { contextWindow: 200000, maxOutputTokens: 100000, capabilities: ['text', 'tools', 'reasoning'], inputCostPer1M: 1.1, outputCostPer1M: 4.4, blurb: 'o3 mini on Foundry.' },
	'foundry-o4-mini': { contextWindow: 200000, maxOutputTokens: 100000, capabilities: ['text', 'tools', 'reasoning'], inputCostPer1M: 1.1, outputCostPer1M: 4.4, blurb: 'o4 mini on Foundry.' },
	'foundry-claude-sonnet': { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Claude Sonnet hosted via Azure.' },
	'foundry-mistral-large': { contextWindow: 128000, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 4, outputCostPer1M: 12, blurb: 'Mistral Large 2411 on Foundry.' },
	'foundry-llama-3-70b': { contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['text'], inputCostPer1M: 0.65, outputCostPer1M: 2.75, blurb: 'Llama 3 70B on Foundry.' },
	'foundry-phi-4': { contextWindow: 16384, maxOutputTokens: 4096, capabilities: ['text'], inputCostPer1M: 0.125, outputCostPer1M: 0.5, blurb: 'Microsoft Phi-4 — small but punchy.' },
	'foundry-custom': { contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['text'], inputCostPer1M: 2.5, outputCostPer1M: 10, blurb: 'User-defined Foundry deployment. Pricing assumed; configure under sota.foundryDeployments.' },

	// --- Amazon Bedrock --------------------------------------------
	'bedrock-claude-opus-4': { contextWindow: 200000, maxOutputTokens: 32000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 15, outputCostPer1M: 75, blurb: 'Claude Opus 4 on Bedrock.' },
	'bedrock-claude-sonnet-4': { contextWindow: 200000, maxOutputTokens: 64000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Claude Sonnet 4 on Bedrock.' },
	'bedrock-claude-haiku-4': { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 1, outputCostPer1M: 5, blurb: 'Claude Haiku 4 on Bedrock.' },
	'bedrock-claude-3-7-sonnet': { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Claude 3.7 Sonnet on Bedrock.' },
	'bedrock-claude-sonnet': { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Claude 3.5 Sonnet on Bedrock.' },
	'bedrock-claude-haiku': { contextWindow: 200000, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0.25, outputCostPer1M: 1.25, blurb: 'Claude 3.5 Haiku on Bedrock.' },
	'bedrock-llama-3-1-70b': { contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['text', 'tools'], inputCostPer1M: 0.99, outputCostPer1M: 0.99, blurb: 'Llama 3.1 70B on Bedrock.' },
	'bedrock-llama-3-1-8b': { contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['text'], inputCostPer1M: 0.22, outputCostPer1M: 0.22, blurb: 'Llama 3.1 8B on Bedrock — bulk inference.' },
	'bedrock-llama-3-70b': { contextWindow: 8192, maxOutputTokens: 4096, capabilities: ['text'], inputCostPer1M: 2.65, outputCostPer1M: 3.5, blurb: 'Llama 3 70B on Bedrock.' },
	'bedrock-mistral-large': { contextWindow: 128000, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 4, outputCostPer1M: 12, blurb: 'Mistral Large on Bedrock.' },
	'bedrock-titan-text-express': { contextWindow: 8192, maxOutputTokens: 4096, capabilities: ['text'], inputCostPer1M: 0.2, outputCostPer1M: 0.6, blurb: 'Amazon Titan — cheap utility model.' },
	'bedrock-cohere-command-r-plus': { contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['text', 'tools'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Cohere Command R+ — RAG-friendly.' },
	'bedrock-nova-pro': { contextWindow: 300000, maxOutputTokens: 5000, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 0.8, outputCostPer1M: 3.2, blurb: 'Amazon Nova Pro.' },
	'bedrock-nova-lite': { contextWindow: 300000, maxOutputTokens: 5000, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 0.06, outputCostPer1M: 0.24, blurb: 'Amazon Nova Lite — cheap multimodal.' },
	'bedrock-nova-micro': { contextWindow: 128000, maxOutputTokens: 5000, capabilities: ['text'], inputCostPer1M: 0.035, outputCostPer1M: 0.14, blurb: 'Amazon Nova Micro — text-only, very cheap.' },

	// --- Google Gemini ---------------------------------------------
	'gemini-3-1-pro-preview': { contextWindow: 2000000, maxOutputTokens: 65536, capabilities: ['text', 'vision', 'tools', 'reasoning', 'audio'], inputCostPer1M: 2.0, outputCostPer1M: 16, blurb: 'Gemini 3.1 Pro (preview) — next-gen flagship.' },
	'gemini-3-1-flash-lite': { contextWindow: 1000000, maxOutputTokens: 32768, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 0.05, outputCostPer1M: 0.2, blurb: 'Gemini 3.1 Flash Lite — cheap & fast 3.x.' },
	'gemini-3-1-flash-live-preview': { contextWindow: 1000000, maxOutputTokens: 32768, capabilities: ['text', 'vision', 'tools', 'audio'], inputCostPer1M: 0.5, outputCostPer1M: 2.0, blurb: 'Gemini 3.1 Flash Live (preview) — realtime audio + video.' },
	'gemini-3-flash-preview': { contextWindow: 1000000, maxOutputTokens: 32768, capabilities: ['text', 'vision', 'tools', 'audio'], inputCostPer1M: 0.15, outputCostPer1M: 0.6, blurb: 'Gemini 3 Flash (preview) — multimodal workhorse.' },
	'gemini-deep-research-preview': { contextWindow: 1000000, maxOutputTokens: 65536, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 5.0, outputCostPer1M: 40.0, blurb: 'Deep Research (preview) — multi-hop web research.' },
	'gemini-deep-research-max-preview': { contextWindow: 1000000, maxOutputTokens: 65536, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 10.0, outputCostPer1M: 80.0, blurb: 'Deep Research Max (preview) — broadest, longest-horizon research.' },
	'gemma-4-31b-it': { contextWindow: 131072, maxOutputTokens: 16384, capabilities: ['text', 'tools'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'Gemma 4 31B instruction-tuned — open weights via Gemini API.' },
	'gemini-2-5-pro': { contextWindow: 2000000, maxOutputTokens: 65536, capabilities: ['text', 'vision', 'tools', 'reasoning', 'audio'], inputCostPer1M: 1.25, outputCostPer1M: 10, blurb: 'Gemini 2.5 Pro — Google\'s flagship with thinking.' },
	'gemini-2-5-flash': { contextWindow: 1000000, maxOutputTokens: 65536, capabilities: ['text', 'vision', 'tools', 'reasoning', 'audio'], inputCostPer1M: 0.075, outputCostPer1M: 0.3, blurb: 'Gemini 2.5 Flash — fast multimodal.' },
	'gemini-2-0-pro': { contextWindow: 2000000, maxOutputTokens: 8192, capabilities: ['text', 'vision', 'tools', 'audio'], inputCostPer1M: 0.5, outputCostPer1M: 2, blurb: 'Gemini 2.0 Pro.' },
	'gemini-2-0-flash': { contextWindow: 1000000, maxOutputTokens: 8192, capabilities: ['text', 'vision', 'tools', 'audio'], inputCostPer1M: 0.1, outputCostPer1M: 0.4, blurb: 'Gemini 2.0 Flash — cheap multimodal.' },
	'gemini-2-0-flash-lite': { contextWindow: 1000000, maxOutputTokens: 8192, capabilities: ['text', 'vision'], inputCostPer1M: 0.075, outputCostPer1M: 0.3, blurb: 'Gemini 2.0 Flash Lite — even cheaper.' },

	// --- OpenRouter (single API key, hundreds of models) ----------
	// Context windows / max output mirror the upstream provider; OpenRouter
	// adds a small markup we don't model in `inputCostPer1M`.
	'openrouter-claude-opus-4-7': { contextWindow: 1000000, maxOutputTokens: 32000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 15, outputCostPer1M: 75, blurb: 'Claude Opus 4.7 routed through OpenRouter — same model, single billing surface.' },
	'openrouter-claude-sonnet-4-7': { contextWindow: 1000000, maxOutputTokens: 32000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 3, outputCostPer1M: 15, blurb: 'Claude Sonnet 4.7 via OpenRouter — best capability / cost balance.' },
	'openrouter-gpt-5': { contextWindow: 400000, maxOutputTokens: 128000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 1.25, outputCostPer1M: 10, blurb: 'GPT-5 via OpenRouter.' },
	'openrouter-llama-3-1-405b': { contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['text', 'tools'], inputCostPer1M: 2.7, outputCostPer1M: 2.7, blurb: 'Llama 3.1 405B via OpenRouter — Meta\'s flagship open model.' },
	'openrouter-deepseek-v3': { contextWindow: 128000, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0.27, outputCostPer1M: 1.1, blurb: 'DeepSeek V3 via OpenRouter — strong frontier-class open model at a fraction of the cost.' },
	'openrouter-mistral-large': { contextWindow: 128000, maxOutputTokens: 8192, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 4, outputCostPer1M: 12, blurb: 'Mistral Large via OpenRouter.' },
	'openrouter-qwen-2-5-coder': { contextWindow: 32768, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0.18, outputCostPer1M: 0.18, blurb: 'Qwen 2.5 Coder 32B via OpenRouter — open-weights coding specialist.' },
	'openrouter-grok-2': { contextWindow: 131072, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 2, outputCostPer1M: 10, blurb: 'Grok 2 via OpenRouter.' },
	'openrouter-custom': { contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['text'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'Any OpenRouter slug. Configure under sota.openRouterCustomModel.' },

	// --- Ollama (local llama.cpp server) ---------------------------
	// All Ollama models run locally — cost is $0; capabilities depend on the
	// pulled tag and are surfaced conservatively (text + tools).
	'ollama-llama-3-1': { contextWindow: 131072, maxOutputTokens: 4096, capabilities: ['text', 'tools'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'Llama 3.1 via Ollama. Runs locally on your machine.' },
	'ollama-qwen-2-5-coder': { contextWindow: 32768, maxOutputTokens: 4096, capabilities: ['text', 'tools'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'Qwen 2.5 Coder via Ollama. Strong local coding model. Runs locally on your machine.' },
	'ollama-deepseek-r1': { contextWindow: 65536, maxOutputTokens: 4096, capabilities: ['text', 'reasoning'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'DeepSeek R1 reasoning model via Ollama. Runs locally on your machine.' },
	'ollama-custom': { contextWindow: 32768, maxOutputTokens: 4096, capabilities: ['text'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'Any Ollama tag. Configure under sota.ollamaCustomModel. Runs locally on your machine.' },

	// --- LM Studio (local model server) ----------------------------
	'lmstudio-loaded': { contextWindow: 32768, maxOutputTokens: 4096, capabilities: ['text', 'tools'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'Whichever model is loaded in the LM Studio app. Runs locally on your machine.' },
	'lmstudio-custom': { contextWindow: 32768, maxOutputTokens: 4096, capabilities: ['text'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'A specific LM Studio model id. Configure under sota.lmstudioCustomModel. Runs locally on your machine.' },

	// --- DeepSeek (direct API) -------------------------------------
	'deepseek-v3': { contextWindow: 128000, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0.27, outputCostPer1M: 1.1, blurb: 'DeepSeek V3 — frontier-class open weights, deep discount via the DeepSeek API.' },
	'deepseek-r1': { contextWindow: 128000, maxOutputTokens: 8192, capabilities: ['text', 'reasoning'], inputCostPer1M: 0.55, outputCostPer1M: 2.19, blurb: 'DeepSeek R1 — reasoning specialist with extended thinking.' },

	// --- Mistral (direct API) --------------------------------------
	'mistral-large': { contextWindow: 128000, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 2, outputCostPer1M: 6, blurb: 'Mistral Large — flagship reasoning + tool-use model.' },
	'mistral-small': { contextWindow: 128000, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0.2, outputCostPer1M: 0.6, blurb: 'Mistral Small — fast generalist for high-volume calls.' },
	'codestral': { contextWindow: 32768, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0.3, outputCostPer1M: 0.9, blurb: 'Codestral — Mistral\'s coding specialist with FIM support.' },
	'mistral-pixtral': { contextWindow: 128000, maxOutputTokens: 8192, capabilities: ['text', 'vision', 'tools'], inputCostPer1M: 0.15, outputCostPer1M: 0.15, blurb: 'Pixtral Large — Mistral\'s vision-capable model.' },

	// --- Groq (LPU-accelerated) ------------------------------------
	'groq-llama-3-3-70b': { contextWindow: 131072, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0.59, outputCostPer1M: 0.79, blurb: 'Llama 3.3 70B on Groq — very fast LPU-accelerated inference.' },
	'groq-llama-3-1-8b': { contextWindow: 131072, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0.05, outputCostPer1M: 0.08, blurb: 'Llama 3.1 8B on Groq — ultra-fast, ultra-cheap.' },
	'groq-mixtral-8x7b': { contextWindow: 32768, maxOutputTokens: 4096, capabilities: ['text', 'tools'], inputCostPer1M: 0.24, outputCostPer1M: 0.24, blurb: 'Mixtral 8x7B on Groq.' },
	'groq-deepseek-r1-llama-70b': { contextWindow: 131072, maxOutputTokens: 8192, capabilities: ['text', 'reasoning'], inputCostPer1M: 0.75, outputCostPer1M: 0.99, blurb: 'DeepSeek R1 distill on Llama 70B via Groq — fast reasoning.' },

	// --- Cerebras (wafer-scale) ------------------------------------
	'cerebras-llama-3-3-70b': { contextWindow: 8192, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0.85, outputCostPer1M: 1.2, blurb: 'Llama 3.3 70B on Cerebras — wafer-scale, fastest single-stream throughput.' },
	'cerebras-llama-3-1-8b': { contextWindow: 8192, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0.1, outputCostPer1M: 0.1, blurb: 'Llama 3.1 8B on Cerebras — fast and cheap.' },

	// --- Together AI -----------------------------------------------
	'together-llama-3-1-405b': { contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['text', 'tools'], inputCostPer1M: 3.5, outputCostPer1M: 3.5, blurb: 'Llama 3.1 405B on Together — Meta\'s flagship open model.' },
	'together-qwen-2-5-coder': { contextWindow: 32768, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0.8, outputCostPer1M: 0.8, blurb: 'Qwen 2.5 Coder 32B on Together — open-weights coding specialist.' },
	'together-mixtral-8x22b': { contextWindow: 65536, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 1.2, outputCostPer1M: 1.2, blurb: 'Mixtral 8x22B on Together.' },
	'together-custom': { contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['text'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'Any Together model id. Configure under sota.togetherCustomModel.' },

	// --- Fireworks -------------------------------------------------
	'fireworks-llama-3-1-405b': { contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['text', 'tools'], inputCostPer1M: 3, outputCostPer1M: 3, blurb: 'Llama 3.1 405B on Fireworks — flagship open model.' },
	'fireworks-deepseek-v3': { contextWindow: 128000, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0.9, outputCostPer1M: 0.9, blurb: 'DeepSeek V3 on Fireworks.' },
	'fireworks-qwen-2-5-coder': { contextWindow: 32768, maxOutputTokens: 8192, capabilities: ['text', 'tools'], inputCostPer1M: 0.9, outputCostPer1M: 0.9, blurb: 'Qwen 2.5 Coder on Fireworks.' },
	'fireworks-custom': { contextWindow: 128000, maxOutputTokens: 4096, capabilities: ['text'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'Any Fireworks model slug. Configure under sota.fireworksCustomModel.' },

	// --- OpenAI Codex CLI (subscription) ---------------------------
	'codex-gpt-5': { contextWindow: 400000, maxOutputTokens: 128000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'GPT-5 via your ChatGPT subscription using the Codex CLI. No API key required.' },
	'codex-gpt-5-mini': { contextWindow: 400000, maxOutputTokens: 128000, capabilities: ['text', 'vision', 'tools', 'reasoning'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'GPT-5 mini via the Codex CLI. Subscription via Codex CLI.' },
	'codex-gpt-5-codex': { contextWindow: 400000, maxOutputTokens: 128000, capabilities: ['text', 'tools', 'reasoning'], inputCostPer1M: 0, outputCostPer1M: 0, blurb: 'GPT-5 Codex via the Codex CLI. Subscription via Codex CLI.' },
};

/**
 * Format a token count for picker tooltips. Uses K / M with one decimal
 * place when the value isn't a clean multiple, since users care more
 * about magnitude than precision in this surface.
 */
export function formatTokens(n: number): string {
	if (n >= 1_000_000) {
		return (n % 1_000_000 === 0) ? `${n / 1_000_000}M` : `${(n / 1_000_000).toFixed(1)}M`;
	}
	if (n >= 1_000) {
		return (n % 1_000 === 0) ? `${n / 1_000}K` : `${(n / 1_000).toFixed(1)}K`;
	}
	return String(n);
}

/**
 * Render the price half of a tooltip. Subscription models and local-server
 * models both have $0/$0 pricing but warrant different copy — the blurb
 * carries the disambiguation ("Runs locally" vs "subscription"), so we
 * keep this label generic ("free / local") and let the blurb explain.
 */
export function formatPricing(info: ModelInfo): string {
	if (info.inputCostPer1M === 0 && info.outputCostPer1M === 0) {
		return /Runs locally/i.test(info.blurb) ? 'free (local)' : 'subscription';
	}
	return `$${info.inputCostPer1M} / $${info.outputCostPer1M} per Mtok`;
}
