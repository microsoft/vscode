/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { fromIni, fromNodeProviderChain } from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentity, AwsCredentialIdentityProvider } from '@smithy/types';
import type { ConfigStore, SecretStore } from '../host';

/**
 * Minimal sink for per-request cost telemetry. The extension implements this
 * via its `CostReporter` (which fans out to the chat header meter); a CLI
 * implementation can persist directly to `~/.son-of-anton/data/costs.json`.
 */
export interface CostSink {
	recordCost(
		model: ModelId,
		agentHandle: string,
		inputTokens: number,
		outputTokens: number,
		cachedInputTokens: number,
	): void;
}

// Model id naming scheme:
//   - Bare names (e.g. 'opus', 'gpt-4o') are routed to their native provider
//     (Anthropic, OpenAI).
//   - The 'foundry-' prefix routes a model id to Microsoft Foundry / Azure
//     OpenAI. The suffix is purely a human-readable hint about the underlying
//     model family — actual deployment names are configured separately via
//     `sota.foundryDeployments` because Foundry decouples deployment names
//     from model identifiers.
//   - The 'bedrock-' prefix routes a model id to Amazon Bedrock. Like Foundry,
//     the suffix is a human-readable hint; the actual Bedrock invocation id
//     (e.g. `anthropic.claude-3-5-sonnet-20241022-v2:0`) is resolved at
//     request time via `sota.bedrockModelMap` with sensible defaults.
export type ModelId =
	// Anthropic — short aliases (legacy; map to the latest Claude tier).
	| 'opus'
	| 'sonnet'
	| 'haiku'
	// Anthropic — Claude 4.x family (Phase D).
	| 'claude-opus-4-7'
	| 'claude-sonnet-4-7'
	| 'claude-haiku-4-7'
	| 'claude-opus-4-6'
	| 'claude-sonnet-4-6'
	| 'claude-haiku-4-6'
	| 'claude-opus-4-5'
	| 'claude-sonnet-4-5'
	| 'claude-haiku-4-5'
	| 'claude-opus-4-1'
	| 'claude-sonnet-4-1'
	| 'claude-opus-4'
	| 'claude-sonnet-4'
	// Anthropic — Claude 3.7 / 3.5 / 3.
	| 'claude-3-7-sonnet'
	| 'claude-3-5-sonnet'
	| 'claude-3-5-haiku'
	| 'claude-3-opus'
	| 'claude-3-sonnet'
	| 'claude-3-haiku'
	// OpenAI — GPT-5 / 4.1 / 4o / reasoning families (Phase D).
	| 'gpt-5'
	| 'gpt-5-mini'
	| 'gpt-5-nano'
	| 'gpt-5-codex'
	| 'gpt-4-1'
	| 'gpt-4-1-mini'
	| 'gpt-4-1-nano'
	| 'gpt-4o'
	| 'gpt-4o-mini'
	| 'gpt-4-turbo'
	| 'gpt-3-5-turbo'
	| 'o1'
	| 'o1-mini'
	| 'o1-pro'
	| 'o3'
	| 'o3-mini'
	| 'o4-mini'
	// Microsoft Foundry / Azure OpenAI — mirrors OpenAI list + Azure-exclusives.
	| 'foundry-gpt-4'
	| 'foundry-gpt-4o'
	| 'foundry-gpt-4o-mini'
	| 'foundry-gpt-4-1'
	| 'foundry-gpt-4-1-mini'
	| 'foundry-gpt-4-1-nano'
	| 'foundry-gpt-5'
	| 'foundry-gpt-5-mini'
	| 'foundry-gpt-5-nano'
	| 'foundry-o1'
	| 'foundry-o1-mini'
	| 'foundry-o3'
	| 'foundry-o3-mini'
	| 'foundry-o4-mini'
	| 'foundry-claude-sonnet'
	| 'foundry-mistral-large'
	| 'foundry-llama-3-70b'
	| 'foundry-phi-4'
	| 'foundry-custom'
	// Amazon Bedrock — Claude + Llama + Mistral + Titan + Cohere + Nova.
	| 'bedrock-claude-opus-4'
	| 'bedrock-claude-sonnet-4'
	| 'bedrock-claude-haiku-4'
	| 'bedrock-claude-3-7-sonnet'
	| 'bedrock-claude-sonnet'
	| 'bedrock-claude-haiku'
	| 'bedrock-llama-3-1-70b'
	| 'bedrock-llama-3-1-8b'
	| 'bedrock-llama-3-70b'
	| 'bedrock-mistral-large'
	| 'bedrock-titan-text-express'
	| 'bedrock-cohere-command-r-plus'
	| 'bedrock-nova-pro'
	| 'bedrock-nova-lite'
	| 'bedrock-nova-micro'
	// Google Gemini.
	| 'gemini-2-5-pro'
	| 'gemini-2-5-flash'
	| 'gemini-2-0-pro'
	| 'gemini-2-0-flash'
	| 'gemini-2-0-flash-lite'
	| 'gemini-1-5-pro'
	| 'gemini-1-5-flash'
	// Claude Code (subscription).
	| 'claude-code-opus'
	| 'claude-code-sonnet'
	| 'claude-code-haiku'
	// OpenRouter — single API key fronting hundreds of models. The suffix is a
	// human-readable hint about the underlying upstream model; the actual
	// OpenRouter slug (e.g. `anthropic/claude-opus-4-7`) is resolved at request
	// time via getModelId() with sensible defaults plus an `openrouter-custom`
	// catch-all whose slug lives in `sota.openRouterCustomModel`.
	| 'openrouter-claude-opus-4-7'
	| 'openrouter-claude-sonnet-4-7'
	| 'openrouter-gpt-5'
	| 'openrouter-llama-3-1-405b'
	| 'openrouter-deepseek-v3'
	| 'openrouter-mistral-large'
	| 'openrouter-qwen-2-5-coder'
	| 'openrouter-grok-2'
	| 'openrouter-custom'
	// Ollama — local llama.cpp server (default http://localhost:11434).
	// Pre-configured ids map to common models the user has likely pulled; the
	// `ollama-custom` catch-all routes to the tag in `sota.ollamaCustomModel`.
	| 'ollama-llama-3-1'
	| 'ollama-qwen-2-5-coder'
	| 'ollama-deepseek-r1'
	| 'ollama-custom'
	// LM Studio — local model server (default http://localhost:1234), also
	// OpenAI-compatible. The default `lmstudio-loaded` resolves to LM Studio's
	// special `loaded-model` alias; `lmstudio-custom` routes via
	// `sota.lmstudioCustomModel`.
	| 'lmstudio-loaded'
	| 'lmstudio-custom'
	// DeepSeek — direct API. V3 is the chat/coding flagship; R1 the reasoning
	// model. Both are OpenAI-compatible at /v1/chat/completions.
	| 'deepseek-v3'
	| 'deepseek-r1'
	// Mistral — direct API. Pricing varies wildly by tier; pixtral is the
	// vision-capable model.
	| 'mistral-large'
	| 'mistral-small'
	| 'codestral'
	| 'mistral-pixtral'
	// Groq — LPU-accelerated; latency is the differentiator.
	| 'groq-llama-3-3-70b'
	| 'groq-llama-3-1-8b'
	| 'groq-mixtral-8x7b'
	| 'groq-deepseek-r1-llama-70b'
	// Cerebras — wafer-scale, fastest single-stream throughput.
	| 'cerebras-llama-3-3-70b'
	| 'cerebras-llama-3-1-8b'
	// Together AI — broad open-model catalogue. `together-custom` resolves at
	// request time via `sota.togetherCustomModel`.
	| 'together-llama-3-1-405b'
	| 'together-qwen-2-5-coder'
	| 'together-mixtral-8x22b'
	| 'together-custom'
	// Fireworks — broad open-model catalogue. `fireworks-custom` resolves via
	// `sota.fireworksCustomModel`.
	| 'fireworks-llama-3-1-405b'
	| 'fireworks-deepseek-v3'
	| 'fireworks-qwen-2-5-coder'
	| 'fireworks-custom'
	// Codex CLI (OpenAI subscription via `codex` binary). Auth handled by the
	// CLI itself — no API key required in settings.
	| 'codex-gpt-5'
	| 'codex-gpt-5-mini'
	| 'codex-gpt-5-codex';

/** Provider that backs a given model id. */
type Provider =
	| 'anthropic'
	| 'openai'
	| 'foundry'
	| 'bedrock'
	| 'google'
	| 'claude-code'
	| 'openrouter'
	| 'ollama'
	| 'lmstudio'
	| 'deepseek'
	| 'mistral'
	| 'groq'
	| 'cerebras'
	| 'together'
	| 'fireworks'
	| 'codex';

/**
 * A single piece of message content. Text parts carry plain UTF-8 strings.
 * Image parts carry a base64-encoded payload and the MIME type so each
 * provider can serialise it into its own wire shape (data URL for OpenAI,
 * `source.data` for Anthropic, `inline_data` for Gemini).
 */
export type LlmContentPart =
	| { type: 'text'; text: string }
	| { type: 'image'; mimeType: string; base64Data: string }
	| { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
	| { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

/**
 * Either a plain string (treated as a single text part) or a structured
 * array of parts. The string form is preserved so existing callers — agents,
 * tests, slash commands — keep working without modification.
 */
export type LlmMessageContent = string | ReadonlyArray<LlmContentPart>;

export interface LlmMessage {
	role: 'user' | 'assistant';
	content: LlmMessageContent;
}

/**
 * Models that accept image inputs. When a request carries image parts and
 * the target model is NOT in this set, the image parts are stripped and a
 * single text note is appended so the model still receives the user's typed
 * text plus an explanation. Hardcoded rather than discovered to keep the
 * decision deterministic at request time.
 */
const MULTIMODAL_MODELS: ReadonlySet<ModelId> = new Set<ModelId>([
	// Anthropic — Opus and Sonnet support images on the Messages API.
	// Haiku 3 supports images, but we conservatively gate it OFF here because
	// the local 'haiku' alias points at an older snapshot whose multimodal
	// support is uneven. Users who want vision on Haiku can switch to Sonnet.
	'opus',
	'sonnet',
	// Anthropic — full Claude 4.x family supports vision.
	'claude-opus-4-7', 'claude-sonnet-4-7', 'claude-haiku-4-7',
	'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-6',
	'claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5',
	'claude-opus-4-1', 'claude-sonnet-4-1', 'claude-opus-4', 'claude-sonnet-4',
	// Claude 3.7 / 3.5 — opus/sonnet/haiku all support images.
	'claude-3-7-sonnet', 'claude-3-5-sonnet', 'claude-3-5-haiku',
	'claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku',
	// OpenAI vision-capable.
	'gpt-4o',
	'gpt-4o-mini',
	'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
	'gpt-4-1', 'gpt-4-1-mini', 'gpt-4-1-nano',
	'gpt-4-turbo',
	'o1', 'o1-pro', 'o3', 'o4-mini',
	// Foundry / Azure OpenAI — the underlying model families that support images.
	// gpt-4 / gpt-5 / gpt-5-mini support images on the OpenAI side; the Foundry
	// deployments mirror their OpenAI counterparts. The `foundry-custom` catch-
	// all defaults to multimodal so a user-deployed vision-capable model isn't
	// incorrectly text-only at the boundary.
	'foundry-gpt-4',
	'foundry-gpt-4o',
	'foundry-gpt-4o-mini',
	'foundry-gpt-4-1', 'foundry-gpt-4-1-mini', 'foundry-gpt-4-1-nano',
	'foundry-gpt-5',
	'foundry-gpt-5-mini',
	'foundry-gpt-5-nano',
	'foundry-o1', 'foundry-o3', 'foundry-o4-mini',
	'foundry-claude-sonnet',
	'foundry-llama-3-70b',
	'foundry-custom',
	// Bedrock Claude family + Nova support images.
	'bedrock-claude-opus-4', 'bedrock-claude-sonnet-4', 'bedrock-claude-haiku-4',
	'bedrock-claude-3-7-sonnet',
	'bedrock-claude-sonnet',
	'bedrock-nova-pro', 'bedrock-nova-lite',
	// Google Gemini — every shipping Gemini model accepts inline images.
	'gemini-2-5-pro', 'gemini-2-5-flash',
	'gemini-2-0-pro', 'gemini-2-0-flash', 'gemini-2-0-flash-lite',
	'gemini-1-5-pro',
	'gemini-1-5-flash',
	// OpenRouter — pre-configured ids that point at upstream vision-capable
	// models. The `openrouter-custom` catch-all is conservatively text-only;
	// users routing a vision model through it can still receive text
	// completions, just without inline image support.
	'openrouter-claude-opus-4-7', 'openrouter-claude-sonnet-4-7',
	'openrouter-gpt-5', 'openrouter-llama-3-1-405b',
	'openrouter-mistral-large',
	// Ollama / LM Studio — most locally-pulled models are text-only. Vision
	// models do exist (LLaVA, etc.) but are rare enough that we leave the
	// default OFF and let users with vision-capable local builds re-enable
	// image input via a future capability override.
	// Mistral pixtral — the only vision-capable Mistral hosted model.
	'mistral-pixtral',
	// Codex CLI inherits GPT-5's vision capabilities.
	'codex-gpt-5', 'codex-gpt-5-mini', 'codex-gpt-5-codex',
]);

/**
 * Stripped-image marker appended to a message that carried image parts the
 * target model can't accept. Surfaced at the END of the text so the user's
 * own prose stays at the top of the prompt.
 */
const IMAGE_STRIPPED_NOTE = '[image attachment was not sent: model does not support multimodal input]';

/**
 * True when the model accepts image content parts. Centralised so each
 * `streamXxx` method has a single, identical question to ask.
 */
function modelSupportsImages(model: ModelId): boolean {
	return MULTIMODAL_MODELS.has(model);
}

/**
 * Normalise an `LlmMessageContent` into a structured part array. Strings are
 * promoted to a single text part. Empty strings still produce a part so
 * downstream serialisers don't have to special-case the role.
 */
function normaliseContent(content: LlmMessageContent): ReadonlyArray<LlmContentPart> {
	if (typeof content === 'string') {
		return [{ type: 'text', text: content }];
	}
	return content;
}

/**
 * Strip image parts when the target model is text-only, replacing them with
 * a trailing text note so the user knows what happened. When there is no
 * image content, the input is returned untouched (cheap fast path).
 */
function applyImageCapability(content: LlmMessageContent, supportsImages: boolean): ReadonlyArray<LlmContentPart> {
	const parts = normaliseContent(content);
	if (supportsImages) {
		return parts;
	}
	const hasImage = parts.some(p => p.type === 'image');
	if (!hasImage) {
		return parts;
	}
	const textOnly: LlmContentPart[] = parts.filter(p => p.type === 'text');
	textOnly.push({ type: 'text', text: IMAGE_STRIPPED_NOTE });
	return textOnly;
}

/**
 * Anthropic content-block shape. Discriminated by `type`. Image blocks carry
 * a `source.type: 'base64'` envelope around the actual MIME + bytes.
 */
type AnthropicContentBlock =
	| { type: 'text'; text: string }
	| { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
	| { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
	| { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

/**
 * Serialise an `LlmMessageContent` into Anthropic's content-block array.
 * When the value is a plain string AND there are no images to honour, we
 * pass it through as a string so the wire format matches the historical
 * single-text-message shape exactly. Anything multimodal is upgraded to a
 * blocks array.
 */
/**
 * Anthropic's per-block cache marker. The API enforces a maximum of 4
 * cache breakpoints per request; we silently drop trailing markers past
 * that ceiling so a careless caller never gets a 400 (the model still
 * sees all the text — just with fewer cache prefixes).
 */
const ANTHROPIC_MAX_CACHE_BREAKPOINTS = 4;

interface AnthropicSystemBlock {
	type: 'text';
	text: string;
	cache_control?: { type: 'ephemeral' };
}

/**
 * Translate `LlmRequestOptions.systemPromptParts` (or the legacy single
 * `systemPrompt` string) into Anthropic's `system` field. Honours
 * `enableCaching` for the legacy single-string path; honours per-part
 * `cache: 'ephemeral'` markers for the parts path.
 */
function buildAnthropicSystemContent(options: LlmRequestOptions): string | ReadonlyArray<AnthropicSystemBlock> {
	if (options.systemPromptParts && options.systemPromptParts.length > 0) {
		const blocks: AnthropicSystemBlock[] = [];
		let breakpoints = 0;
		for (const part of options.systemPromptParts) {
			if (!part.text) {
				continue;
			}
			const block: AnthropicSystemBlock = { type: 'text', text: part.text };
			if (part.cache === 'ephemeral' && breakpoints < ANTHROPIC_MAX_CACHE_BREAKPOINTS) {
				block.cache_control = { type: 'ephemeral' };
				breakpoints++;
			}
			blocks.push(block);
		}
		if (blocks.length > 0) {
			return blocks;
		}
	}
	const text = options.systemPrompt ?? 'You are a helpful coding assistant.';
	if (options.enableCaching) {
		return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
	}
	return text;
}

function serialiseAnthropicContent(
	content: LlmMessageContent,
	supportsImages: boolean,
): string | ReadonlyArray<AnthropicContentBlock> {
	if (typeof content === 'string') {
		return content;
	}
	// Image parts are stripped for non-vision models the same way the existing
	// path always has; tool round-trip parts are forwarded verbatim regardless
	// of model capability since they don't depend on multimodal support.
	const visualKept = applyImageCapability(content, supportsImages);
	const blocks: AnthropicContentBlock[] = [];
	for (const part of visualKept) {
		if (part.type === 'text') {
			blocks.push({ type: 'text', text: part.text });
		} else if (part.type === 'image') {
			blocks.push({
				type: 'image',
				source: { type: 'base64', media_type: part.mimeType, data: part.base64Data },
			});
		} else if (part.type === 'tool_use') {
			blocks.push({ type: 'tool_use', id: part.id, name: part.name, input: part.input });
		} else if (part.type === 'tool_result') {
			blocks.push({
				type: 'tool_result',
				tool_use_id: part.tool_use_id,
				content: part.content,
				...(part.is_error ? { is_error: true } : {}),
			});
		}
	}
	return blocks;
}

/**
 * OpenAI content-part shape. Discriminated by `type`. Image parts wrap the
 * payload in an `image_url` object whose `url` is a data URL — the API
 * accepts public URLs OR `data:` URLs interchangeably.
 */
type OpenAIContentPart =
	| { type: 'text'; text: string }
	| { type: 'image_url'; image_url: { url: string } };

/**
 * Serialise an `LlmMessageContent` into OpenAI's content-part array. Same
 * string passthrough behaviour as Anthropic so historical single-text
 * messages stay byte-identical on the wire.
 */
function serialiseOpenAIContent(
	content: LlmMessageContent,
	supportsImages: boolean,
): string | ReadonlyArray<OpenAIContentPart> {
	if (typeof content === 'string') {
		return content;
	}
	const parts = applyImageCapability(content, supportsImages);
	const out: OpenAIContentPart[] = [];
	for (const part of parts) {
		if (part.type === 'text') {
			out.push({ type: 'text', text: part.text });
		} else if (part.type === 'image') {
			out.push({
				type: 'image_url',
				image_url: { url: `data:${part.mimeType};base64,${part.base64Data}` },
			});
		} else {
			// tool_use / tool_result blocks aren't representable in OpenAI's
			// chat-completion content-part schema. The agent harness's tool
			// loop is currently Anthropic-only — if a tool round-trip message
			// arrives here, the caller has misrouted it.
			throw new Error(`OpenAI provider does not yet support content part of type "${(part as { type: string }).type}". Route tool-loop messages through an Anthropic-compatible model.`);
		}
	}
	return out;
}

/**
 * Google Gemini content-part shape. Each part is either text or an
 * `inline_data` envelope carrying a base64 payload and its MIME type.
 */
type GoogleContentPart =
	| { text: string }
	| { inline_data: { mime_type: string; data: string } };

/**
 * Serialise an `LlmMessageContent` into Gemini's `parts` array. Gemini has
 * no string-shorthand on the wire — it always wants an array — so we always
 * return an array regardless of whether the input was a plain string.
 */
function serialiseGoogleParts(
	content: LlmMessageContent,
	supportsImages: boolean,
): ReadonlyArray<GoogleContentPart> {
	const parts = applyImageCapability(content, supportsImages);
	const out: GoogleContentPart[] = [];
	for (const part of parts) {
		if (part.type === 'text') {
			out.push({ text: part.text });
		} else if (part.type === 'image') {
			out.push({ inline_data: { mime_type: part.mimeType, data: part.base64Data } });
		} else {
			// Same constraint as OpenAI — Gemini's tool-call shape isn't wired
			// in our serialiser yet; tool-loop messages must route through an
			// Anthropic-compatible model.
			throw new Error(`Gemini provider does not yet support content part of type "${(part as { type: string }).type}". Route tool-loop messages through an Anthropic-compatible model.`);
		}
	}
	return out;
}

/**
 * Local declaration of a tool definition consumed by Anthropic-compatible
 * providers. A parallel module under `../tools/types.ts` is being introduced
 * by another work stream; this inline copy keeps LlmClient unblocked and
 * avoids a cross-module import while the canonical location stabilises.
 */
export interface ToolDefinition {
	readonly name: string;
	readonly description: string;
	readonly inputSchema: {
		readonly type: 'object';
		readonly properties: Record<string, unknown>;
		readonly required?: ReadonlyArray<string>;
	};
}

/**
 * H5 — single system-prompt segment, optionally tagged with a cache
 * breakpoint. Anthropic-compatible providers honour `cache: 'ephemeral'`
 * by emitting a `cache_control: { type: 'ephemeral' }` marker on the
 * corresponding text block, which lets the cache prefix stop just before
 * a dynamic suffix instead of invalidating the whole system prompt every
 * turn. Non-Anthropic providers concatenate the parts back into a single
 * string and ignore the cache markers.
 */
export interface SystemPromptPart {
	readonly text: string;
	readonly cache?: 'ephemeral';
}

export interface LlmRequestOptions {
	model: ModelId;
	messages: LlmMessage[];
	maxTokens?: number;
	systemPrompt?: string;
	/**
	 * H5. When set, takes precedence over `systemPrompt`. Each part may
	 * carry a `cache: 'ephemeral'` marker that Anthropic-compatible
	 * providers translate into a per-block `cache_control`. Up to 4
	 * breakpoints per Anthropic's prompt-cache contract — exceeding that
	 * silently drops the trailing markers (the model still sees all the
	 * text, just with fewer cache prefixes).
	 */
	systemPromptParts?: ReadonlyArray<SystemPromptPart>;
	signal?: AbortSignal;
	/** Enable prompt caching for the system prompt. */
	enableCaching?: boolean;
	/** Agent handle for cache metrics tracking. */
	agentHandle?: string;
	/**
	 * Tool definitions to expose to the model. Currently honoured by the
	 * Anthropic-compatible providers (`streamAnthropic`, `streamBedrock`).
	 * Other providers silently ignore this field until their respective
	 * function-calling integrations land.
	 */
	tools?: ReadonlyArray<ToolDefinition>;
}

export interface LlmStreamToken {
	type: 'token';
	token: string;
}

/**
 * Tool-call event emitted when a model requests invocation of a tool. The
 * `id` matches the Anthropic `tool_use_id` and must be echoed back on the
 * subsequent tool-result message so the model can correlate replies with
 * outstanding requests.
 */
export interface LlmStreamToolCall {
	type: 'tool-call';
	id: string;
	name: string;
	input: Record<string, unknown>;
}

export interface LlmStreamComplete {
	type: 'complete';
	fullText: string;
	inputTokens: number;
	outputTokens: number;
	cachedTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	/**
	 * Reason the model stopped generating. Only populated for providers that
	 * surface it (currently Anthropic and Bedrock); undefined elsewhere.
	 */
	stopReason?: 'end_turn' | 'tool_use' | 'max_tokens' | string;
}

export interface LlmStreamError {
	type: 'error';
	error: string;
}

export type LlmStreamEvent = LlmStreamToken | LlmStreamToolCall | LlmStreamComplete | LlmStreamError;

/**
 * Minimal contract used by LlmClient to obtain an OAuth bearer token for a
 * provider. Modeled after CredentialBroker.getToken but kept narrow so tests
 * and alternative implementations can satisfy it without bringing in the full
 * broker surface.
 */
export interface ICredentialResolver {
	getToken(providerId: string): Promise<{ token: string } | undefined>;
}

/** Provider ID used for Claude OAuth credentials. */
const ANTHROPIC_OAUTH_PROVIDER_ID = 'anthropic-oauth';
/** Provider ID used for ChatGPT/OpenAI OAuth credentials. */
const OPENAI_OAUTH_PROVIDER_ID = 'chatgpt-oauth';
/**
 * Provider ID reserved for Microsoft Foundry / Azure OpenAI Entra OAuth
 * credentials. Declared here for symmetry with the other provider ids;
 * Entra OAuth wiring is intentionally deferred to a later phase, so this
 * constant is currently unused at runtime. Exported so the credential
 * broker layer can reference it once Entra integration lands without
 * touching the constant's declaration site.
 */
export const FOUNDRY_OAUTH_PROVIDER_ID = 'foundry-oauth';
/**
 * Provider ID reserved for Amazon Bedrock OAuth-style credentials (e.g.
 * IAM Identity Center / SSO bearer tokens). Declared here for symmetry with
 * the other provider ids; AWS sign-in wiring is intentionally deferred to a
 * later phase, so this constant is currently unused at runtime. Exported so
 * the credential broker layer can reference it once AWS sign-in integration
 * lands without touching the constant's declaration site.
 */
export const BEDROCK_OAUTH_PROVIDER_ID = 'bedrock-oauth';
/**
 * Provider ID reserved for Google Cloud ADC / Vertex AI OAuth credentials.
 * Declared here for symmetry with the other provider ids; full Vertex AI
 * (`aiplatform.googleapis.com`) with ADC OAuth is a deferred follow-up. The
 * current Google integration uses the consumer Gemini API endpoint
 * (`generativelanguage.googleapis.com`) with API-key auth, so this constant
 * is currently unused at runtime. Exported so the credential broker layer
 * can reference it once Vertex AI / ADC integration lands without touching
 * the constant's declaration site.
 */
export const GOOGLE_OAUTH_PROVIDER_ID = 'google-oauth';

/**
 * Classify a model id as belonging to either the Anthropic or OpenAI provider.
 * Adding a third provider in future is a matter of adding another branch here
 * plus a corresponding stream method below.
 */
function providerForModel(model: ModelId): Provider {
	switch (model) {
		case 'opus':
		case 'sonnet':
		case 'haiku':
		case 'claude-opus-4-7':
		case 'claude-sonnet-4-7':
		case 'claude-haiku-4-7':
		case 'claude-opus-4-6':
		case 'claude-sonnet-4-6':
		case 'claude-haiku-4-6':
		case 'claude-opus-4-5':
		case 'claude-sonnet-4-5':
		case 'claude-haiku-4-5':
		case 'claude-opus-4-1':
		case 'claude-sonnet-4-1':
		case 'claude-opus-4':
		case 'claude-sonnet-4':
		case 'claude-3-7-sonnet':
		case 'claude-3-5-sonnet':
		case 'claude-3-5-haiku':
		case 'claude-3-opus':
		case 'claude-3-sonnet':
		case 'claude-3-haiku':
			return 'anthropic';
		case 'gpt-4o':
		case 'gpt-4o-mini':
		case 'gpt-5':
		case 'gpt-5-mini':
		case 'gpt-5-nano':
		case 'gpt-5-codex':
		case 'gpt-4-1':
		case 'gpt-4-1-mini':
		case 'gpt-4-1-nano':
		case 'gpt-4-turbo':
		case 'gpt-3-5-turbo':
		case 'o1':
		case 'o1-mini':
		case 'o1-pro':
		case 'o3':
		case 'o3-mini':
		case 'o4-mini':
			return 'openai';
		case 'foundry-gpt-4':
		case 'foundry-gpt-4o':
		case 'foundry-gpt-4o-mini':
		case 'foundry-gpt-4-1':
		case 'foundry-gpt-4-1-mini':
		case 'foundry-gpt-4-1-nano':
		case 'foundry-gpt-5':
		case 'foundry-gpt-5-mini':
		case 'foundry-gpt-5-nano':
		case 'foundry-o1':
		case 'foundry-o1-mini':
		case 'foundry-o3':
		case 'foundry-o3-mini':
		case 'foundry-o4-mini':
		case 'foundry-claude-sonnet':
		case 'foundry-mistral-large':
		case 'foundry-llama-3-70b':
		case 'foundry-phi-4':
		case 'foundry-custom':
			return 'foundry';
		case 'bedrock-claude-opus-4':
		case 'bedrock-claude-sonnet-4':
		case 'bedrock-claude-haiku-4':
		case 'bedrock-claude-3-7-sonnet':
		case 'bedrock-claude-sonnet':
		case 'bedrock-claude-haiku':
		case 'bedrock-llama-3-1-70b':
		case 'bedrock-llama-3-1-8b':
		case 'bedrock-llama-3-70b':
		case 'bedrock-mistral-large':
		case 'bedrock-titan-text-express':
		case 'bedrock-cohere-command-r-plus':
		case 'bedrock-nova-pro':
		case 'bedrock-nova-lite':
		case 'bedrock-nova-micro':
			return 'bedrock';
		case 'gemini-2-5-pro':
		case 'gemini-2-5-flash':
		case 'gemini-2-0-pro':
		case 'gemini-2-0-flash':
		case 'gemini-2-0-flash-lite':
		case 'gemini-1-5-pro':
		case 'gemini-1-5-flash':
			return 'google';
		case 'claude-code-opus':
		case 'claude-code-sonnet':
		case 'claude-code-haiku':
			return 'claude-code';
		case 'openrouter-claude-opus-4-7':
		case 'openrouter-claude-sonnet-4-7':
		case 'openrouter-gpt-5':
		case 'openrouter-llama-3-1-405b':
		case 'openrouter-deepseek-v3':
		case 'openrouter-mistral-large':
		case 'openrouter-qwen-2-5-coder':
		case 'openrouter-grok-2':
		case 'openrouter-custom':
			return 'openrouter';
		case 'ollama-llama-3-1':
		case 'ollama-qwen-2-5-coder':
		case 'ollama-deepseek-r1':
		case 'ollama-custom':
			return 'ollama';
		case 'lmstudio-loaded':
		case 'lmstudio-custom':
			return 'lmstudio';
		case 'deepseek-v3':
		case 'deepseek-r1':
			return 'deepseek';
		case 'mistral-large':
		case 'mistral-small':
		case 'codestral':
		case 'mistral-pixtral':
			return 'mistral';
		case 'groq-llama-3-3-70b':
		case 'groq-llama-3-1-8b':
		case 'groq-mixtral-8x7b':
		case 'groq-deepseek-r1-llama-70b':
			return 'groq';
		case 'cerebras-llama-3-3-70b':
		case 'cerebras-llama-3-1-8b':
			return 'cerebras';
		case 'together-llama-3-1-405b':
		case 'together-qwen-2-5-coder':
		case 'together-mixtral-8x22b':
		case 'together-custom':
			return 'together';
		case 'fireworks-llama-3-1-405b':
		case 'fireworks-deepseek-v3':
		case 'fireworks-qwen-2-5-coder':
		case 'fireworks-custom':
			return 'fireworks';
		case 'codex-gpt-5':
		case 'codex-gpt-5-mini':
		case 'codex-gpt-5-codex':
			return 'codex';
	}
}

/**
 * Routes requests to Claude or OpenAI models based on task complexity.
 * Provider selection is driven entirely by the model id; per-provider
 * specifics (endpoint, headers, body shape, streaming protocol) are isolated
 * in `streamAnthropic` and `streamOpenAI` to keep the dispatcher narrow.
 */
export class LlmClient {
	private totalInputTokens = 0;
	private totalOutputTokens = 0;
	private totalCachedTokens = 0;
	private readonly credentialResolver?: ICredentialResolver;
	private readonly secrets: SecretStore;
	private readonly config: ConfigStore;
	private readonly costReporter?: CostSink;

	constructor(secrets: SecretStore, config: ConfigStore, credentialResolver?: ICredentialResolver, costReporter?: CostSink) {
		this.secrets = secrets;
		this.config = config;
		this.credentialResolver = credentialResolver;
		this.costReporter = costReporter;
	}

	/**
	 * Forward a successful stream completion to the optional CostReporter.
	 * Only fires when an `agentHandle` was provided on the request — agent
	 * stack work that records via `MetricsTracker` deliberately omits the
	 * handle so we don't double-count it on the chat surface meter.
	 *
	 * Defensive: any failure inside the reporter is swallowed so a metrics
	 * bug never breaks an in-flight chat response.
	 */
	private reportCost(
		model: ModelId,
		agentHandle: string | undefined,
		inputTokens: number,
		outputTokens: number,
		cachedInputTokens: number,
	): void {
		if (!this.costReporter || !agentHandle) {
			return;
		}
		try {
			this.costReporter.recordCost(model, agentHandle, inputTokens, outputTokens, cachedInputTokens);
		} catch (err) {
			console.warn('LlmClient: cost reporter failed; ignoring.', err);
		}
	}

	/**
	 * Resolve a credential by checking SecretStorage first, then a settings
	 * fallback (for users with keys still in settings.json), then environment
	 * variables. SecretStorage is the canonical store written by the setup
	 * wizard; the settings tier exists purely for backwards compatibility with
	 * pre-wizard installs.
	 */
	private async resolveCredential(secretKey: string, settingKey: string, envKeys: ReadonlyArray<string>): Promise<string | undefined> {
		const secretValue = await this.secrets.get(secretKey);
		if (secretValue && secretValue.trim()) {
			return secretValue.trim();
		}
		const settingValue = this.config.get<string>(settingKey);
		if (settingValue && settingValue.trim()) {
			return settingValue.trim();
		}
		for (const envKey of envKeys) {
			const envValue = process.env[envKey];
			if (envValue && envValue.trim()) {
				return envValue.trim();
			}
		}
		return undefined;
	}

	/**
	 * Get the Anthropic API key from SecretStorage, configuration, or environment.
	 */
	private async getAnthropicApiKey(): Promise<string | undefined> {
		return this.resolveCredential('sota.secrets.anthropicApiKey', 'apiKey', ['ANTHROPIC_API_KEY']);
	}

	/**
	 * Get the OpenAI API key from SecretStorage, configuration, or environment.
	 */
	private async getOpenAIApiKey(): Promise<string | undefined> {
		return this.resolveCredential('sota.secrets.openaiApiKey', 'openaiApiKey', ['OPENAI_API_KEY']);
	}

	/**
	 * Get the Microsoft Foundry / Azure OpenAI API key from SecretStorage,
	 * configuration, or environment. Falls back to AZURE_OPENAI_API_KEY (the
	 * Azure-canonical env var) and then FOUNDRY_API_KEY for users who prefer
	 * the Foundry branding.
	 */
	private async getFoundryApiKey(): Promise<string | undefined> {
		return this.resolveCredential('sota.secrets.foundryApiKey', 'foundryApiKey', ['AZURE_OPENAI_API_KEY', 'FOUNDRY_API_KEY']);
	}

	/**
	 * Resolve the Microsoft Foundry / Azure OpenAI endpoint configuration.
	 * Returns undefined when the endpoint is not configured — callers should
	 * treat that as "Foundry is not set up" and surface an actionable error.
	 *
	 * The deployments map is stored as a JSON string (rather than a typed
	 * object) so it can live in `sota.foundryDeployments` without inventing a
	 * separate settings shape per model id.
	 */
	private getFoundryConfig(): { endpoint: string; apiVersion: string; deploymentForModel: (model: ModelId) => string | undefined } | undefined {
		const config = this.config;
		const rawEndpoint = (config.get<string>('foundryEndpoint') ?? '').trim();
		if (!rawEndpoint) {
			return undefined;
		}
		const endpoint = rawEndpoint.replace(/\/+$/, '');

		const apiVersion = (config.get<string>('foundryApiVersion') ?? '').trim() || '2024-10-01-preview';

		const rawDeployments = (config.get<string>('foundryDeployments') ?? '').trim();
		let deploymentMap: Record<string, string> = {};
		if (rawDeployments.length > 0) {
			try {
				const parsed = JSON.parse(rawDeployments);
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
					for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
						if (typeof value === 'string' && value.length > 0) {
							deploymentMap[key] = value;
						}
					}
				}
			} catch (err) {
				console.warn('LlmClient: Failed to parse sota.foundryDeployments as JSON; treating as empty.', err);
				deploymentMap = {};
			}
		}

		return {
			endpoint,
			apiVersion,
			deploymentForModel: (model: ModelId): string | undefined => {
				const value = deploymentMap[model];
				return value && value.length > 0 ? value : undefined;
			},
		};
	}

	/**
	 * Resolve Amazon Bedrock configuration: target region, credential provider,
	 * and a function that resolves a Son of Anton model id to the Bedrock
	 * invocation id sent on the wire (e.g. `anthropic.claude-3-5-sonnet-20241022-v2:0`).
	 *
	 * Credential resolution order — first non-empty wins:
	 *   1. `sota.bedrockProfile` (named profile in `~/.aws/credentials`).
	 *   2. `sota.bedrockAccessKeyId` / `sota.bedrockSecretAccessKey` (and
	 *      optional `sota.bedrockSessionToken` for STS temporary credentials).
	 *   3. The standard AWS Node provider chain (env vars, shared credentials,
	 *      IMDS, ECS task role, IAM role, etc.) via `fromNodeProviderChain()`.
	 *
	 * The model map merges built-in defaults (Claude 3.5 Sonnet/Haiku) with the
	 * user's `sota.bedrockModelMap` JSON. User-supplied entries override
	 * defaults so the user can pin region-specific or cross-region inference
	 * profile ARNs without losing the fallback for the unmapped model.
	 */
	private async getBedrockConfig(): Promise<{ region: string; modelInvocationId: (model: ModelId) => string | undefined; credentialProvider: AwsCredentialIdentityProvider }> {
		const config = this.config;
		const rawRegion = (config.get<string>('bedrockRegion') ?? '').trim();
		const region = rawRegion.length > 0 ? rawRegion : 'us-east-1';

		const profile = (config.get<string>('bedrockProfile') ?? '').trim();
		// SecretStorage takes priority over settings for the three credential
		// fields; bedrockProfile remains a settings-only knob since profile names
		// are not secret.
		const accessKeyId = (await this.resolveCredential('sota.secrets.bedrockAccessKeyId', 'bedrockAccessKeyId', [])) ?? '';
		const secretAccessKey = (await this.resolveCredential('sota.secrets.bedrockSecretAccessKey', 'bedrockSecretAccessKey', [])) ?? '';
		const sessionToken = (await this.resolveCredential('sota.secrets.bedrockSessionToken', 'bedrockSessionToken', [])) ?? '';

		let credentialProvider: AwsCredentialIdentityProvider;
		if (profile.length > 0) {
			credentialProvider = fromIni({ profile });
		} else if (accessKeyId.length > 0 || secretAccessKey.length > 0) {
			// Static credentials from settings. The SDK accepts a function that
			// returns AwsCredentialIdentity; we wrap so a missing pair surfaces
			// at request time as a credential error rather than at config read.
			const staticCreds: AwsCredentialIdentity = {
				accessKeyId,
				secretAccessKey,
				...(sessionToken.length > 0 ? { sessionToken } : {}),
			};
			credentialProvider = async () => staticCreds;
		} else {
			credentialProvider = fromNodeProviderChain();
		}

		const defaultMap: Partial<Record<ModelId, string>> = {
			'bedrock-claude-opus-4': 'anthropic.claude-opus-4-v1:0',
			'bedrock-claude-sonnet-4': 'anthropic.claude-sonnet-4-v1:0',
			'bedrock-claude-haiku-4': 'anthropic.claude-haiku-4-v1:0',
			'bedrock-claude-3-7-sonnet': 'anthropic.claude-3-7-sonnet-20250219-v1:0',
			'bedrock-claude-sonnet': 'anthropic.claude-3-5-sonnet-20241022-v2:0',
			'bedrock-claude-haiku': 'anthropic.claude-3-5-haiku-20241022-v1:0',
			'bedrock-llama-3-1-70b': 'meta.llama3-1-70b-instruct-v1:0',
			'bedrock-llama-3-1-8b': 'meta.llama3-1-8b-instruct-v1:0',
			'bedrock-llama-3-70b': 'meta.llama3-70b-instruct-v1:0',
			'bedrock-mistral-large': 'mistral.mistral-large-2407-v1:0',
			'bedrock-titan-text-express': 'amazon.titan-text-express-v1',
			'bedrock-cohere-command-r-plus': 'cohere.command-r-plus-v1:0',
			'bedrock-nova-pro': 'amazon.nova-pro-v1:0',
			'bedrock-nova-lite': 'amazon.nova-lite-v1:0',
			'bedrock-nova-micro': 'amazon.nova-micro-v1:0',
		};

		const rawMap = (config.get<string>('bedrockModelMap') ?? '').trim();
		const userMap: Record<string, string> = {};
		if (rawMap.length > 0) {
			try {
				const parsed = JSON.parse(rawMap);
				if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
					for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
						if (typeof value === 'string' && value.length > 0) {
							userMap[key] = value;
						}
					}
				}
			} catch (err) {
				console.warn('LlmClient: Failed to parse sota.bedrockModelMap as JSON; treating as empty.', err);
			}
		}

		return {
			region,
			credentialProvider,
			modelInvocationId: (model: ModelId): string | undefined => {
				const userValue = userMap[model];
				if (userValue && userValue.length > 0) {
					return userValue;
				}
				return defaultMap[model];
			},
		};
	}

	/**
	 * Get the Google Gemini API key from SecretStorage, configuration, or
	 * environment. Falls back to GOOGLE_API_KEY (Google's canonical env var)
	 * and then GEMINI_API_KEY for users who follow the Gemini-branded
	 * convention.
	 */
	private async getGoogleApiKey(): Promise<string | undefined> {
		return this.resolveCredential('sota.secrets.googleApiKey', 'googleApiKey', ['GOOGLE_API_KEY', 'GEMINI_API_KEY']);
	}

	/**
	 * Resolve the Google Gemini API model name for a given Son of Anton model
	 * id. User-supplied entries in `sota.googleModelMap` override the built-in
	 * defaults so the user can pin specific versions or experimental endpoints
	 * without losing the fallback for unmapped models.
	 */
	private getGoogleModelInvocationId(model: ModelId): string | undefined {
		const defaults: Partial<Record<ModelId, string>> = {
			'gemini-2-5-pro': 'gemini-2.5-pro',
			'gemini-2-5-flash': 'gemini-2.5-flash',
			'gemini-2-0-pro': 'gemini-2.0-pro',
			'gemini-2-0-flash': 'gemini-2.0-flash',
			'gemini-2-0-flash-lite': 'gemini-2.0-flash-lite',
			'gemini-1-5-pro': 'gemini-1.5-pro',
			'gemini-1-5-flash': 'gemini-1.5-flash',
		};
		const raw = this.config.get<string>('googleModelMap', '{}');
		let userMap: Record<string, string> = {};
		try {
			const parsed = JSON.parse(raw);
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
					if (typeof value === 'string' && value.length > 0) {
						userMap[key] = value;
					}
				}
			}
		} catch (err) {
			console.warn('LlmClient: Failed to parse sota.googleModelMap as JSON; treating as empty.', err);
			userMap = {};
		}
		return userMap[model] ?? defaults[model];
	}

	/**
	 * Extract a human-readable error message from a parsed provider response
	 * body. Both Anthropic and OpenAI nest their message at `body.error.message`,
	 * but we accept a top-level `message` and bare strings to stay defensive
	 * against future shape drift or HTML/text error pages.
	 */
	private extractBodyMessage(body: unknown): string | undefined {
		if (!body) {
			return undefined;
		}
		if (typeof body === 'string') {
			const trimmed = body.trim();
			return trimmed.length > 0 ? trimmed : undefined;
		}
		if (typeof body === 'object') {
			const obj = body as Record<string, unknown>;
			const err = obj['error'];
			if (err && typeof err === 'object') {
				const errObj = err as Record<string, unknown>;
				const msg = errObj['message'];
				if (typeof msg === 'string' && msg.length > 0) {
					return msg;
				}
			}
			const topMsg = obj['message'];
			if (typeof topMsg === 'string' && topMsg.length > 0) {
				return topMsg;
			}
		}
		return undefined;
	}

	/**
	 * Extract a provider-specific error type/code (e.g. 'authentication_error',
	 * 'rate_limit_error', 'model_not_found'). Returns undefined if unavailable.
	 */
	private extractBodyErrorType(body: unknown): string | undefined {
		if (!body || typeof body !== 'object') {
			return undefined;
		}
		const err = (body as Record<string, unknown>)['error'];
		if (!err || typeof err !== 'object') {
			return undefined;
		}
		const errObj = err as Record<string, unknown>;
		const type = errObj['type'];
		if (typeof type === 'string' && type.length > 0) {
			return type;
		}
		const code = errObj['code'];
		if (typeof code === 'string' && code.length > 0) {
			return code;
		}
		return undefined;
	}

	/**
	 * Translate an HTTP-level provider error into an actionable, single-paragraph
	 * message. The text is what the chat UI will surface, so it must guide the
	 * user toward a concrete fix rather than echoing raw provider output.
	 */
	private mapProviderError(provider: Provider, status: number, body: unknown): string {
		const providerLabel = providerDisplayName(provider);
		const bodyMessage = this.extractBodyMessage(body);
		const errorType = this.extractBodyErrorType(body);
		const lowerMessage = (bodyMessage ?? '').toLowerCase();
		const lowerType = (errorType ?? '').toLowerCase();

		// Auth: 401/403, or any status accompanied by an authentication_error type.
		if (status === 401 || status === 403 || lowerType === 'authentication_error' || lowerType === 'permission_error') {
			if (provider === 'bedrock') {
				return `Authentication failed for ${providerLabel}. Check your AWS credentials (settings -> sota.bedrockAccessKeyId / sota.bedrockProfile, or the standard AWS credential chain), and confirm your IAM principal has the bedrock:InvokeModelWithResponseStream permission.`;
			}
			const settingKey = provider === 'anthropic'
				? 'sota.apiKey'
				: provider === 'openai'
					? 'sota.openaiApiKey'
					: provider === 'foundry'
						? 'sota.foundryApiKey'
						: provider === 'openrouter'
							? 'sota.openRouterApiKey'
							: provider === 'lmstudio'
								? 'sota.lmstudioApiKey'
								: provider === 'deepseek'
									? 'sota.deepSeekApiKey'
									: provider === 'mistral'
										? 'sota.mistralApiKey'
										: provider === 'groq'
											? 'sota.groqApiKey'
											: provider === 'cerebras'
												? 'sota.cerebrasApiKey'
												: provider === 'together'
													? 'sota.togetherApiKey'
													: provider === 'fireworks'
														? 'sota.fireworksApiKey'
														: 'sota.googleApiKey';
			return `Authentication failed for ${providerLabel}. Check that your API key is correct (settings -> ${settingKey}), or re-sign in via 'Anton: Sign In to Claude' / 'Anton: Sign In to ChatGPT / Codex'.`;
		}

		// Rate limit: 429, or any rate_limit_error / overloaded_error type.
		if (status === 429 || lowerType === 'rate_limit_error' || lowerType === 'overloaded_error') {
			return `${providerLabel} rate limit hit. Wait a moment and retry, or check your plan limits.`;
		}

		// Model not found: 404, OpenAI 'model_not_found' code, or Anthropic
		// invalid_request_error mentioning the model in its message.
		const isAnthropicModelMissing = provider === 'anthropic'
			&& lowerType === 'invalid_request_error'
			&& lowerMessage.includes('model')
			&& (lowerMessage.includes('not found') || lowerMessage.includes('does not exist'));
		const isOpenAIModelMissing = provider === 'openai' && lowerType === 'model_not_found';
		if (status === 404 || isAnthropicModelMissing || isOpenAIModelMissing) {
			return 'Model is not available on your account. Pick a different model from the chat picker.';
		}

		// Server-side errors: keep this branch broad so transient blips read as retryable.
		if (status >= 500 && status < 600) {
			return `${providerLabel} returned an internal error (HTTP ${status}). Try again shortly.`;
		}

		return `${providerLabel} request failed (HTTP ${status}): ${bodyMessage ?? 'no detail'}`;
	}

	/**
	 * Translate a thrown fetch/network error into an actionable message. The
	 * cancel branch deliberately omits the provider label since the user
	 * triggered the cancellation themselves.
	 */
	private mapNetworkError(provider: Provider, err: unknown): string {
		const providerLabel = providerDisplayName(provider);
		const errorObj = (err && typeof err === 'object') ? err as { name?: unknown; message?: unknown; $metadata?: unknown } : undefined;
		const name = typeof errorObj?.name === 'string' ? errorObj.name : '';
		const message = typeof errorObj?.message === 'string' ? errorObj.message : '';

		if (name === 'AbortError') {
			return 'Request cancelled.';
		}

		// AWS SDK errors carry $metadata.httpStatusCode for HTTP-level failures.
		// Reuse mapProviderError so 401/403/429/404/5xx map to the same actionable
		// strings as native fetch-based providers.
		if (provider === 'bedrock' && errorObj?.$metadata && typeof errorObj.$metadata === 'object') {
			const metaObj = errorObj.$metadata as { httpStatusCode?: unknown };
			const httpStatus = typeof metaObj.httpStatusCode === 'number' ? metaObj.httpStatusCode : undefined;
			if (typeof httpStatus === 'number' && httpStatus > 0) {
				return this.mapProviderError('bedrock', httpStatus, { error: { message, type: name } });
			}
		}

		if (message.includes('fetch failed')
			|| message.includes('ENOTFOUND')
			|| message.includes('ECONNREFUSED')
			|| message.includes('getaddrinfo')) {
			// Local-server providers warrant a different fix path: instead of
			// "check your internet" we tell the user to start the daemon.
			if (provider === 'ollama') {
				return `Cannot reach the Ollama server. Start it with 'ollama serve' (or check sota.ollamaBaseUrl).`;
			}
			if (provider === 'lmstudio') {
				return `Cannot reach the LM Studio server. Start it from the LM Studio app's "Local Server" tab (or check sota.lmstudioBaseUrl).`;
			}
			return `Cannot reach ${providerLabel}'s API. Check your internet connection or proxy settings.`;
		}

		// AWS SDK surfaces credential-resolution failures with these names rather
		// than HTTP status codes. Translate to an actionable auth error so the
		// user knows to update sota.bedrockAccessKeyId / sota.bedrockProfile.
		if (provider === 'bedrock' && (
			name === 'CredentialsProviderError'
			|| name === 'CredentialsError'
			|| message.includes('Could not load credentials')
			|| message.includes('credentials were unavailable')
		)) {
			return `No AWS credentials available for ${providerLabel}. Set sota.bedrockAccessKeyId / sota.bedrockSecretAccessKey, sota.bedrockProfile, or configure the standard AWS credential chain (env vars, ~/.aws/credentials, IAM role).`;
		}

		const detail = message.length > 0 ? message : String(err);
		return `Network error while calling ${providerLabel}: ${detail}`;
	}

	/**
	 * Best-effort body parse: read the body as text, then attempt JSON parse.
	 * Falls back to the raw text, finally undefined. Never throws — error
	 * mapping must succeed even if the provider returns malformed bytes.
	 */
	private async readErrorBody(response: Response): Promise<unknown> {
		let raw: string | undefined;
		try {
			raw = await response.text();
		} catch {
			return undefined;
		}
		if (raw === undefined || raw.length === 0) {
			return undefined;
		}
		try {
			return JSON.parse(raw);
		} catch {
			return raw;
		}
	}

	/**
	 * Map our model shorthand to the full Anthropic model ID.
	 */
	getModelId(model: ModelId): string {
		switch (model) {
			// Anthropic short aliases — kept pointing at the originally-shipped
			// Claude 3 snapshots so existing CLI sessions and saved
			// conversations behave identically. Users who want the latest
			// generation should pick a `claude-*-4-7` id from the picker.
			case 'opus': return 'claude-3-opus-20240229';
			case 'sonnet': return 'claude-3-sonnet-20240229';
			case 'haiku': return 'claude-3-haiku-20240307';
			// Claude 4.x — wire ids match the public Anthropic API as of
			// Jan 2026. The unsuffixed `claude-<tier>-<gen>-<rev>` form is
			// the canonical id; per-snapshot dated ids are accepted by the
			// API but we surface the canonical form so log lines are stable
			// across snapshot rotations.
			case 'claude-opus-4-7': return 'claude-opus-4-7';
			case 'claude-sonnet-4-7': return 'claude-sonnet-4-7';
			case 'claude-haiku-4-7': return 'claude-haiku-4-7';
			case 'claude-opus-4-6': return 'claude-opus-4-6';
			case 'claude-sonnet-4-6': return 'claude-sonnet-4-6';
			case 'claude-haiku-4-6': return 'claude-haiku-4-6';
			case 'claude-opus-4-5': return 'claude-opus-4-5';
			case 'claude-sonnet-4-5': return 'claude-sonnet-4-5';
			case 'claude-haiku-4-5': return 'claude-haiku-4-5';
			case 'claude-opus-4-1': return 'claude-opus-4-1';
			case 'claude-sonnet-4-1': return 'claude-sonnet-4-1';
			case 'claude-opus-4': return 'claude-opus-4';
			case 'claude-sonnet-4': return 'claude-sonnet-4';
			case 'claude-3-7-sonnet': return 'claude-3-7-sonnet-20250219';
			case 'claude-3-5-sonnet': return 'claude-3-5-sonnet-20241022';
			case 'claude-3-5-haiku': return 'claude-3-5-haiku-20241022';
			case 'claude-3-opus': return 'claude-3-opus-20240229';
			case 'claude-3-sonnet': return 'claude-3-sonnet-20240229';
			case 'claude-3-haiku': return 'claude-3-haiku-20240307';
			// OpenAI ids are direct OpenAI model identifiers; surface them as-is
			// so callers that want a wire-level id (e.g. logs) get a useful value.
			case 'gpt-4o': return 'gpt-4o';
			case 'gpt-4o-mini': return 'gpt-4o-mini';
			case 'gpt-5': return 'gpt-5';
			case 'gpt-5-mini': return 'gpt-5-mini';
			case 'gpt-5-nano': return 'gpt-5-nano';
			case 'gpt-5-codex': return 'gpt-5-codex';
			case 'gpt-4-1': return 'gpt-4.1';
			case 'gpt-4-1-mini': return 'gpt-4.1-mini';
			case 'gpt-4-1-nano': return 'gpt-4.1-nano';
			case 'gpt-4-turbo': return 'gpt-4-turbo';
			case 'gpt-3-5-turbo': return 'gpt-3.5-turbo';
			case 'o1': return 'o1';
			case 'o1-mini': return 'o1-mini';
			case 'o1-pro': return 'o1-pro';
			case 'o3': return 'o3';
			case 'o3-mini': return 'o3-mini';
			case 'o4-mini': return 'o4-mini';
			// Foundry ids: report the underlying model family. The actual
			// deployment name lives in `sota.foundryDeployments` and is
			// resolved at request time inside streamFoundry.
			case 'foundry-gpt-4': return 'gpt-4';
			case 'foundry-gpt-4o': return 'gpt-4o';
			case 'foundry-gpt-4o-mini': return 'gpt-4o-mini';
			case 'foundry-gpt-4-1': return 'gpt-4.1';
			case 'foundry-gpt-4-1-mini': return 'gpt-4.1-mini';
			case 'foundry-gpt-4-1-nano': return 'gpt-4.1-nano';
			case 'foundry-gpt-5': return 'gpt-5';
			case 'foundry-gpt-5-mini': return 'gpt-5-mini';
			case 'foundry-gpt-5-nano': return 'gpt-5-nano';
			case 'foundry-o1': return 'o1';
			case 'foundry-o1-mini': return 'o1-mini';
			case 'foundry-o3': return 'o3';
			case 'foundry-o3-mini': return 'o3-mini';
			case 'foundry-o4-mini': return 'o4-mini';
			case 'foundry-claude-sonnet': return 'claude-sonnet-4-5';
			case 'foundry-mistral-large': return 'mistral-large-2411';
			case 'foundry-llama-3-70b': return 'llama-3-70b-instruct';
			case 'foundry-phi-4': return 'phi-4';
			// `foundry-custom` is the catch-all for arbitrary user deployments
			// (e.g. a fine-tuned model). The actual deployment name is resolved
			// at request time via sota.foundryDeployments.
			case 'foundry-custom': return 'foundry-custom';
			// Bedrock ids: report the human-readable id unchanged. The actual
			// invocation id (e.g. anthropic.claude-3-5-sonnet-20241022-v2:0)
			// is resolved at request time via getBedrockConfig().modelInvocationId.
			case 'bedrock-claude-opus-4': return 'bedrock-claude-opus-4';
			case 'bedrock-claude-sonnet-4': return 'bedrock-claude-sonnet-4';
			case 'bedrock-claude-haiku-4': return 'bedrock-claude-haiku-4';
			case 'bedrock-claude-3-7-sonnet': return 'bedrock-claude-3-7-sonnet';
			case 'bedrock-claude-sonnet': return 'bedrock-claude-sonnet';
			case 'bedrock-claude-haiku': return 'bedrock-claude-haiku';
			case 'bedrock-llama-3-1-70b': return 'bedrock-llama-3-1-70b';
			case 'bedrock-llama-3-1-8b': return 'bedrock-llama-3-1-8b';
			case 'bedrock-llama-3-70b': return 'bedrock-llama-3-70b';
			case 'bedrock-mistral-large': return 'bedrock-mistral-large';
			case 'bedrock-titan-text-express': return 'bedrock-titan-text-express';
			case 'bedrock-cohere-command-r-plus': return 'bedrock-cohere-command-r-plus';
			case 'bedrock-nova-pro': return 'bedrock-nova-pro';
			case 'bedrock-nova-lite': return 'bedrock-nova-lite';
			case 'bedrock-nova-micro': return 'bedrock-nova-micro';
			// Google Gemini ids: report the human-readable id unchanged. The
			// actual API model name (e.g. gemini-1.5-pro) is resolved at request
			// time via getGoogleModelInvocationId() with sensible defaults.
			case 'gemini-2-5-pro': return 'gemini-2-5-pro';
			case 'gemini-2-5-flash': return 'gemini-2-5-flash';
			case 'gemini-2-0-pro': return 'gemini-2-0-pro';
			case 'gemini-2-0-flash': return 'gemini-2-0-flash';
			case 'gemini-2-0-flash-lite': return 'gemini-2-0-flash-lite';
			case 'gemini-1-5-pro': return 'gemini-1-5-pro';
			case 'gemini-1-5-flash': return 'gemini-1-5-flash';
			// Claude Code variants — the CLI accepts plain `opus` / `sonnet` /
			// `haiku` and resolves to the latest. We report the same string so
			// trace logs are readable.
			case 'claude-code-opus': return 'opus';
			case 'claude-code-sonnet': return 'sonnet';
			case 'claude-code-haiku': return 'haiku';
			// OpenRouter — pre-configured ids resolve to canonical OpenRouter
			// slugs (`<vendor>/<model>` form). The `openrouter-custom` id
			// resolves at request time via `sota.openRouterCustomModel`; we
			// return the placeholder here so log lines stay stable for users
			// who haven't filled it in yet.
			case 'openrouter-claude-opus-4-7': return 'anthropic/claude-opus-4-7';
			case 'openrouter-claude-sonnet-4-7': return 'anthropic/claude-sonnet-4-7';
			case 'openrouter-gpt-5': return 'openai/gpt-5';
			case 'openrouter-llama-3-1-405b': return 'meta-llama/llama-3.1-405b-instruct';
			case 'openrouter-deepseek-v3': return 'deepseek/deepseek-v3';
			case 'openrouter-mistral-large': return 'mistralai/mistral-large';
			case 'openrouter-qwen-2-5-coder': return 'qwen/qwen-2.5-coder-32b-instruct';
			case 'openrouter-grok-2': return 'x-ai/grok-2';
			case 'openrouter-custom': return 'openrouter-custom';
			// Ollama — pre-configured ids resolve to common pulled tags. The
			// `ollama-custom` id resolves at request time via
			// `sota.ollamaCustomModel`.
			case 'ollama-llama-3-1': return 'llama3.1';
			case 'ollama-qwen-2-5-coder': return 'qwen2.5-coder';
			case 'ollama-deepseek-r1': return 'deepseek-r1';
			case 'ollama-custom': return 'ollama-custom';
			// LM Studio — `lmstudio-loaded` uses LM Studio's special alias for
			// whichever model is currently loaded; `lmstudio-custom` resolves
			// via `sota.lmstudioCustomModel`.
			case 'lmstudio-loaded': return 'loaded-model';
			case 'lmstudio-custom': return 'lmstudio-custom';
			// DeepSeek — wire ids on the DeepSeek API.
			case 'deepseek-v3': return 'deepseek-chat';
			case 'deepseek-r1': return 'deepseek-reasoner';
			// Mistral — wire ids on the Mistral API. `mistral-pixtral` resolves
			// to the latest Pixtral snapshot id.
			case 'mistral-large': return 'mistral-large-latest';
			case 'mistral-small': return 'mistral-small-latest';
			case 'codestral': return 'codestral-latest';
			case 'mistral-pixtral': return 'pixtral-large-latest';
			// Groq — wire ids match the public Groq catalogue.
			case 'groq-llama-3-3-70b': return 'llama-3.3-70b-versatile';
			case 'groq-llama-3-1-8b': return 'llama-3.1-8b-instant';
			case 'groq-mixtral-8x7b': return 'mixtral-8x7b-32768';
			case 'groq-deepseek-r1-llama-70b': return 'deepseek-r1-distill-llama-70b';
			// Cerebras — wire ids match the public Cerebras catalogue.
			case 'cerebras-llama-3-3-70b': return 'llama-3.3-70b';
			case 'cerebras-llama-3-1-8b': return 'llama3.1-8b';
			// Together AI — wire ids match the public Together catalogue.
			// `together-custom` is replaced at request time with the value of
			// `sota.togetherCustomModel`.
			case 'together-llama-3-1-405b': return 'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo';
			case 'together-qwen-2-5-coder': return 'Qwen/Qwen2.5-Coder-32B-Instruct';
			case 'together-mixtral-8x22b': return 'mistralai/Mixtral-8x22B-Instruct-v0.1';
			case 'together-custom': return 'together-custom';
			// Fireworks — wire ids use the `accounts/fireworks/models/<slug>` form.
			case 'fireworks-llama-3-1-405b': return 'accounts/fireworks/models/llama-v3p1-405b-instruct';
			case 'fireworks-deepseek-v3': return 'accounts/fireworks/models/deepseek-v3';
			case 'fireworks-qwen-2-5-coder': return 'accounts/fireworks/models/qwen2p5-coder-32b-instruct';
			case 'fireworks-custom': return 'fireworks-custom';
			// Codex CLI — surface the underlying OpenAI model id; the CLI maps
			// these to its own internal routing.
			case 'codex-gpt-5': return 'gpt-5';
			case 'codex-gpt-5-mini': return 'gpt-5-mini';
			case 'codex-gpt-5-codex': return 'gpt-5-codex';
		}
	}

	/**
	 * Stream a request to the appropriate provider based on the model id.
	 * Returns an async iterable of normalized stream events.
	 */
	async *streamRequest(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const provider = providerForModel(options.model);
		switch (provider) {
			case 'anthropic':
				yield* this.streamAnthropic(options);
				return;
			case 'openai':
				yield* this.streamOpenAI(options);
				return;
			case 'foundry':
				yield* this.streamFoundry(options);
				return;
			case 'bedrock':
				yield* this.streamBedrock(options);
				return;
			case 'google':
				yield* this.streamGoogle(options);
				return;
			case 'claude-code':
				yield* this.streamClaudeCode(options);
				return;
			case 'openrouter':
				yield* this.streamOpenRouter(options);
				return;
			case 'ollama':
				yield* this.streamOllama(options);
				return;
			case 'lmstudio':
				yield* this.streamLmStudio(options);
				return;
			case 'deepseek':
				yield* this.streamDeepSeek(options);
				return;
			case 'mistral':
				yield* this.streamMistral(options);
				return;
			case 'groq':
				yield* this.streamGroq(options);
				return;
			case 'cerebras':
				yield* this.streamCerebras(options);
				return;
			case 'together':
				yield* this.streamTogether(options);
				return;
			case 'fireworks':
				yield* this.streamFireworks(options);
				return;
			case 'codex':
				yield* this.streamCodex(options);
				return;
		}
	}

	/**
	 * Route through the locally-installed Claude Code CLI. The CLI handles
	 * auth itself (subscription / OAuth tokens stored by the Claude Code
	 * installer), so the user doesn't need an `ANTHROPIC_API_KEY` configured
	 * in Son of Anton settings.
	 */
	private async *streamClaudeCode(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const { runClaudeCode, isClaudeCodeAvailable } = await import('./claudeCodeRunner.js');
		if (!isClaudeCodeAvailable()) {
			yield {
				type: 'error',
				error: 'Claude Code CLI is not installed or not on PATH. Install it from https://docs.anthropic.com/en/docs/claude-code, or pick a different model.',
			};
			return;
		}
		const cliModel =
			options.model === 'claude-code-opus' ? 'opus'
			: options.model === 'claude-code-haiku' ? 'haiku'
			: 'sonnet';
		const messages = options.messages.map(m => {
			const text = typeof m.content === 'string'
				? m.content
				: m.content.map(part => part.type === 'text' ? part.text : '').join('');
			return { role: m.role as 'user' | 'assistant', content: text };
		});
		let fullText = '';
		let inputTokens = 0;
		let outputTokens = 0;
		let cachedTokens = 0;
		let cacheCreationTokens = 0;
		try {
			for await (const chunk of runClaudeCode({
				systemPrompt: options.systemPrompt ?? 'You are a helpful coding assistant.',
				messages,
				modelId: cliModel,
			})) {
				if (chunk.type === 'text') {
					fullText += chunk.text;
					yield { type: 'token', token: chunk.text };
				} else if (chunk.type === 'usage') {
					inputTokens += chunk.inputTokens;
					outputTokens += chunk.outputTokens;
					cachedTokens += chunk.cacheReadTokens ?? 0;
					cacheCreationTokens += chunk.cacheCreationTokens ?? 0;
				} else if (chunk.type === 'error') {
					yield { type: 'error', error: chunk.message };
					return;
				}
				// system / rate_limit_event / done are informational; ignore.
			}
			this.totalInputTokens += inputTokens;
			this.totalOutputTokens += outputTokens;
			yield {
				type: 'complete',
				fullText,
				inputTokens,
				outputTokens,
				cachedTokens,
				cacheCreationTokens,
				cacheReadTokens: cachedTokens,
				stopReason: 'end_turn',
			};
		} catch (err) {
			yield { type: 'error', error: err instanceof Error ? err.message : String(err) };
		}
	}

	/**
	 * Anthropic-specific streaming implementation. Behavior is intentionally
	 * unchanged from the pre-OpenAI version of this client.
	 */
	private async *streamAnthropic(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		// Prefer OAuth bearer token from the credential broker when available.
		// Any failure is treated as "no token" so the API key path remains usable.
		let oauthToken: string | undefined;
		try {
			const record = await this.credentialResolver?.getToken(ANTHROPIC_OAUTH_PROVIDER_ID);
			if (record && typeof record.token === 'string' && record.token) {
				oauthToken = record.token;
			}
		} catch (err) {
			console.warn('LlmClient: OAuth token lookup failed, falling back to API key.', err);
		}

		const apiKey = oauthToken ? undefined : await this.getAnthropicApiKey();

		if (!oauthToken && !apiKey) {
			yield {
				type: 'error',
				error: 'No Claude credentials configured. Sign in to Claude from the welcome screen, or set sota.apiKey in settings or ANTHROPIC_API_KEY environment variable.'
			};
			return;
		}

		const modelId = this.getModelId(options.model);

		// Build system prompt with optional per-part cache breakpoints (H5).
		// When `systemPromptParts` is supplied, each part becomes its own
		// Anthropic text block with optional `cache_control: ephemeral`. This
		// lets the static prefix (voice + role + project context) cache
		// independently of the dynamic suffix (specialist memory) so the
		// prefix stays cached across turns even when memory updates.
		// When only the legacy `systemPrompt` string is supplied, behaviour
		// is unchanged from pre-H5: a single block with optional caching.
		const systemContent = buildAnthropicSystemContent(options);

		const supportsImages = modelSupportsImages(options.model);
		const body: Record<string, unknown> = {
			model: modelId,
			max_tokens: options.maxTokens ?? 4096,
			system: systemContent,
			messages: options.messages.map(m => ({
				role: m.role,
				content: serialiseAnthropicContent(m.content, supportsImages),
			})),
			stream: true,
		};

		if (options.tools && options.tools.length > 0) {
			body['tools'] = options.tools.map(t => ({
				name: t.name,
				description: t.description,
				input_schema: t.inputSchema,
			}));
		}

		const headers: Record<string, string> = oauthToken
			? {
				'content-type': 'application/json',
				'Authorization': `Bearer ${oauthToken}`,
				'anthropic-version': '2023-06-01',
				'anthropic-beta': 'oauth-2025-04-20',
			}
			: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey!,
				'anthropic-version': '2023-06-01',
			};

		// Enable prompt caching beta header (API-key path only; OAuth path
		// already sets anthropic-beta to oauth-2025-04-20).
		if (options.enableCaching && !oauthToken) {
			headers['anthropic-beta'] = 'prompt-caching-2024-07-31';
		}

		// Phase 3 — apply optional advanced overrides. Custom headers (JSON
		// object stringified into config) merge over the auth/version headers
		// above so a user can never accidentally clobber `x-api-key` etc.
		applyAdvancedHeaders(headers, this.config.get<string>('anthropicCustomHeaders'));
		const anthropicBaseUrl = (this.config.get<string>('anthropicBaseUrl') ?? '').trim().replace(/\/+$/, '') || 'https://api.anthropic.com';

		// Phase 4 — extended thinking budget for Claude 4.x.
		if (/^claude-(opus|sonnet|haiku)-4/.test(options.model)) {
			const budget = Math.max(0, Math.min(24000, this.config.get<number>('thinkingBudgetTokens') ?? 0));
			if (budget > 0) {
				body['thinking'] = { type: 'enabled', budget_tokens: budget };
			}
		}

		try {
			const response = await retryableFetch(`${anthropicBaseUrl}/v1/messages`, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: options.signal,
			}, { signal: options.signal });

			if (!response.ok) {
				const body = await this.readErrorBody(response);
				yield { type: 'error', error: this.mapProviderError('anthropic', response.status, body) };
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				yield { type: 'error', error: 'Anthropic returned an empty response body. Try again shortly.' };
				return;
			}

			const decoder = new TextDecoder();
			let fullText = '';
			let inputTokens = 0;
			let outputTokens = 0;
			let cacheCreationTokens = 0;
			let cacheReadTokens = 0;
			let stopReason: string | undefined;
			let buffer = '';

			// Tool-use accumulator keyed by content block index. Tool input JSON
			// streams as `input_json_delta` chunks that must be concatenated and
			// parsed once the block closes.
			const toolUseByIndex = new Map<number, { id: string; name: string; jsonChunks: string[] }>();

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) {
						continue;
					}
					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						continue;
					}

					try {
						const event = JSON.parse(data);

						if (event.type === 'content_block_start'
							&& event.content_block?.type === 'tool_use'
							&& typeof event.index === 'number'
							&& typeof event.content_block.id === 'string'
							&& typeof event.content_block.name === 'string'
						) {
							toolUseByIndex.set(event.index, {
								id: event.content_block.id,
								name: event.content_block.name,
								jsonChunks: [],
							});
						} else if (event.type === 'content_block_delta'
							&& event.delta?.type === 'input_json_delta'
							&& typeof event.index === 'number'
							&& typeof event.delta.partial_json === 'string'
						) {
							const entry = toolUseByIndex.get(event.index);
							if (entry) {
								entry.jsonChunks.push(event.delta.partial_json);
							}
						} else if (event.type === 'content_block_stop' && typeof event.index === 'number') {
							const entry = toolUseByIndex.get(event.index);
							if (entry) {
								toolUseByIndex.delete(event.index);
								const joined = entry.jsonChunks.join('');
								let parsedInput: Record<string, unknown> = {};
								if (joined.length > 0) {
									try {
										const parsed = JSON.parse(joined);
										if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
											parsedInput = parsed as Record<string, unknown>;
										} else {
											console.warn(`LlmClient: tool_use input JSON for tool '${entry.name}' did not parse to an object; defaulting to {}.`);
										}
									} catch (parseErr) {
										console.warn(`LlmClient: failed to parse tool_use input JSON for tool '${entry.name}'; defaulting to {}.`, parseErr);
									}
								}
								yield { type: 'tool-call', id: entry.id, name: entry.name, input: parsedInput };
							}
						} else if (event.type === 'content_block_delta' && event.delta?.text) {
							const token = event.delta.text;
							fullText += token;
							yield { type: 'token', token };
						} else if (event.type === 'message_start' && event.message?.usage) {
							inputTokens = event.message.usage.input_tokens ?? 0;
							cacheCreationTokens = event.message.usage.cache_creation_input_tokens ?? 0;
							cacheReadTokens = event.message.usage.cache_read_input_tokens ?? 0;
						} else if (event.type === 'message_delta') {
							if (event.usage) {
								outputTokens = event.usage.output_tokens ?? 0;
							}
							if (event.delta && typeof event.delta.stop_reason === 'string') {
								stopReason = event.delta.stop_reason;
							}
						}
					} catch {
						// Skip malformed JSON lines in the stream
					}
				}
			}

			this.totalInputTokens += inputTokens;
			this.totalOutputTokens += outputTokens;
			this.totalCachedTokens += cacheReadTokens;
			this.reportCost(options.model, options.agentHandle, inputTokens, outputTokens, cacheReadTokens);

			yield {
				type: 'complete',
				fullText,
				inputTokens,
				outputTokens,
				cachedTokens: cacheReadTokens,
				cacheCreationTokens,
				cacheReadTokens,
				stopReason,
			};
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled.' };
			} else {
				yield { type: 'error', error: this.mapNetworkError('anthropic', err) };
			}
		}
	}

	/**
	 * OpenAI-specific streaming implementation. Targets the chat completions
	 * endpoint; SSE chunks have a different shape from Anthropic's, so token
	 * extraction and usage accounting are handled inline here.
	 */
	private async *streamOpenAI(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		// Prefer OAuth bearer token from the credential broker when available.
		// Mirror the silent-fallback semantics of the Anthropic path.
		let oauthToken: string | undefined;
		try {
			const record = await this.credentialResolver?.getToken(OPENAI_OAUTH_PROVIDER_ID);
			if (record && typeof record.token === 'string' && record.token) {
				oauthToken = record.token;
			}
		} catch (err) {
			console.warn('LlmClient: OpenAI OAuth token lookup failed, falling back to API key.', err);
		}

		const apiKey = oauthToken ? undefined : await this.getOpenAIApiKey();

		if (!oauthToken && !apiKey) {
			yield {
				type: 'error',
				error: 'No OpenAI credentials configured. Sign in to ChatGPT from the welcome screen, or set the OPENAI_API_KEY environment variable.'
			};
			return;
		}

		const modelId = this.getModelId(options.model);

		// OpenAI takes the system prompt as a leading system message rather
		// than a top-level field. Build it once so we can prepend cleanly.
		const systemMessage = {
			role: 'system' as const,
			content: options.systemPrompt ?? 'You are a helpful coding assistant.',
		};

		const supportsImages = modelSupportsImages(options.model);
		const body: Record<string, unknown> = {
			model: modelId,
			max_tokens: options.maxTokens ?? 4096,
			messages: [
				systemMessage,
				...options.messages.map(m => ({ role: m.role, content: serialiseOpenAIContent(m.content, supportsImages) })),
			],
			stream: true,
			// Request a final usage chunk so we can populate token counts.
			stream_options: { include_usage: true },
		};

		if (options.tools && options.tools.length > 0) {
			body.tools = options.tools.map(t => ({
				type: 'function',
				function: { name: t.name, description: t.description, parameters: t.inputSchema },
			}));
		}

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${oauthToken ?? apiKey!}`,
		};

		// Phase 3 — optional org id + custom headers + base URL override.
		const openAIOrgId = (this.config.get<string>('openaiOrgId') ?? '').trim();
		if (openAIOrgId) {
			headers['OpenAI-Organization'] = openAIOrgId;
		}
		applyAdvancedHeaders(headers, this.config.get<string>('openaiCustomHeaders'));
		const openAIBaseUrl = (this.config.get<string>('openaiBaseUrl') ?? '').trim().replace(/\/+$/, '') || 'https://api.openai.com/v1';

		// Phase 4 — reasoning effort for gpt-5 / o-series. Auto means "let
		// the provider pick" — sent as the literal string the API accepts.
		if (/^(o[0-9]|gpt-5)/.test(options.model)) {
			const effort = (this.config.get<string>('reasoningEffort') ?? 'medium').trim();
			if (effort && ['low', 'medium', 'high', 'auto'].includes(effort)) {
				body['reasoning_effort'] = effort;
			}
		}

		try {
			const response = await retryableFetch(`${openAIBaseUrl}/chat/completions`, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: options.signal,
			}, { signal: options.signal });

			if (!response.ok) {
				const body = await this.readErrorBody(response);
				yield { type: 'error', error: this.mapProviderError('openai', response.status, body) };
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				yield { type: 'error', error: 'OpenAI returned an empty response body. Try again shortly.' };
				return;
			}

			const decoder = new TextDecoder();
			let fullText = '';
			let inputTokens = 0;
			let outputTokens = 0;
			let buffer = '';
			// Tool-call accumulator keyed by `tool_calls[i].index`. OpenAI streams
			// id/name/arguments piecewise across multiple deltas, so we buffer
			// fragments and assemble them once the stream finishes.
			const toolCallsByIndex = new Map<number, { id?: string; name?: string; argsBuffer: string }>();
			let stopReason: string | undefined;

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) {
						continue;
					}
					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						continue;
					}

					try {
						const event = JSON.parse(data);

						// Token deltas live on choices[0].delta.content. The
						// final usage-only chunk has an empty choices array.
						const choice = event.choices?.[0];
						const delta = choice?.delta;
						if (delta && typeof delta.content === 'string' && delta.content.length > 0) {
							const token = delta.content;
							fullText += token;
							yield { type: 'token', token };
						}

						if (delta && Array.isArray(delta.tool_calls)) {
							for (const tc of delta.tool_calls) {
								if (typeof tc?.index !== 'number') {
									continue;
								}
								let entry = toolCallsByIndex.get(tc.index);
								if (!entry) {
									entry = { id: undefined, name: undefined, argsBuffer: '' };
									toolCallsByIndex.set(tc.index, entry);
								}
								if (typeof tc.id === 'string' && tc.id.length > 0) {
									entry.id = tc.id;
								}
								if (typeof tc.function?.name === 'string' && tc.function.name.length > 0) {
									entry.name = tc.function.name;
								}
								if (typeof tc.function?.arguments === 'string') {
									entry.argsBuffer += tc.function.arguments;
								}
							}
						}

						if (typeof choice?.finish_reason === 'string' && choice.finish_reason === 'tool_calls') {
							stopReason = 'tool_use';
						}

						if (event.usage) {
							inputTokens = event.usage.prompt_tokens ?? 0;
							outputTokens = event.usage.completion_tokens ?? 0;
						}
					} catch {
						// Skip malformed JSON lines in the stream
					}
				}
			}

			// Emit accumulated tool calls in stable index order.
			const orderedIndexes = Array.from(toolCallsByIndex.keys()).sort((a, b) => a - b);
			for (let i = 0; i < orderedIndexes.length; i++) {
				const idx = orderedIndexes[i];
				const entry = toolCallsByIndex.get(idx)!;
				let parsedInput: Record<string, unknown> = {};
				if (entry.argsBuffer.length > 0) {
					try {
						const parsed = JSON.parse(entry.argsBuffer);
						if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
							parsedInput = parsed as Record<string, unknown>;
						} else {
							console.warn(`LlmClient: OpenAI tool_call arguments for '${entry.name}' did not parse to an object; defaulting to {}.`);
						}
					} catch (parseErr) {
						console.warn(`LlmClient: failed to parse OpenAI tool_call arguments for '${entry.name}'; defaulting to {}.`, parseErr);
					}
				}
				yield {
					type: 'tool-call',
					id: entry.id ?? `openai_call_${i}`,
					name: entry.name ?? '',
					input: parsedInput,
				};
			}

			// OpenAI has no cached-token concept exposed here; leave at 0.
			this.totalInputTokens += inputTokens;
			this.totalOutputTokens += outputTokens;
			this.reportCost(options.model, options.agentHandle, inputTokens, outputTokens, 0);

			yield {
				type: 'complete',
				fullText,
				inputTokens,
				outputTokens,
				cachedTokens: 0,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
				stopReason,
			};
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled.' };
			} else {
				yield { type: 'error', error: this.mapNetworkError('openai', err) };
			}
		}
	}

	/**
	 * Microsoft Foundry / Azure OpenAI streaming implementation. The wire
	 * protocol is OpenAI's chat completions API verbatim — same request body,
	 * same SSE chunk shape — but with two endpoint-shape changes:
	 *   - URL embeds the deployment name: `/openai/deployments/{deployment}/chat/completions?api-version={version}`
	 *   - Auth header is `api-key` rather than `Authorization: Bearer …`.
	 *
	 * Token parsing intentionally mirrors `streamOpenAI` line-for-line so the
	 * two paths drift together if the upstream chunk shape changes. Entra
	 * OAuth is deferred; this path is API-key only.
	 */
	private async *streamFoundry(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const apiKey = await this.getFoundryApiKey();
		if (!apiKey) {
			yield {
				type: 'error',
				error: 'Microsoft Foundry credentials not configured. Set sota.foundryApiKey in settings, or AZURE_OPENAI_API_KEY / FOUNDRY_API_KEY env var.'
			};
			return;
		}

		const config = this.getFoundryConfig();
		if (!config) {
			yield {
				type: 'error',
				error: 'Microsoft Foundry endpoint not configured. Set sota.foundryEndpoint to your resource URL (e.g. https://my-resource.openai.azure.com).'
			};
			return;
		}

		const deployment = config.deploymentForModel(options.model);
		if (!deployment) {
			yield {
				type: 'error',
				error: `Microsoft Foundry deployment not configured for model '${options.model}'. Add an entry to sota.foundryDeployments mapping '${options.model}' to a deployment name in your Foundry resource.`
			};
			return;
		}

		const modelId = this.getModelId(options.model);

		// Foundry takes the system prompt as a leading system message, mirroring
		// the OpenAI body shape. The 'model' field is ignored by Azure (the
		// deployment URL determines the model) but is sent for consistency.
		const systemMessage = {
			role: 'system' as const,
			content: options.systemPrompt ?? 'You are a helpful coding assistant.',
		};

		const supportsImages = modelSupportsImages(options.model);
		const tokenLimit = options.maxTokens ?? 4096;
		// Azure routes Foundry calls to the user's deployment, not the model id
		// shown in the picker. `max_tokens` works on all gpt-3/4/4o deployments
		// across all API versions; `max_completion_tokens` is required by the
		// gpt-5/o1/o3/o4 reasoning families. Sending both is safe — Azure
		// ignores the field that doesn't apply — and it's the only way to
		// support older API versions (`2024-02-01`, `2024-06-01`,
		// `2024-08-01-preview`) which reject `max_completion_tokens` outright.
		const isReasoningFamily = /foundry-(gpt-5|o1|o3|o4|custom)/i.test(options.model);
		const body: Record<string, unknown> = {
			model: modelId,
			max_tokens: tokenLimit,
			...(isReasoningFamily ? { max_completion_tokens: tokenLimit } : {}),
			messages: [
				systemMessage,
				...options.messages.map(m => ({ role: m.role, content: serialiseOpenAIContent(m.content, supportsImages) })),
			],
			stream: true,
			stream_options: { include_usage: true },
		};

		if (options.tools && options.tools.length > 0) {
			body.tools = options.tools.map(t => ({
				type: 'function',
				function: { name: t.name, description: t.description, parameters: t.inputSchema },
			}));
		}

		const url = `${config.endpoint}/openai/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${encodeURIComponent(config.apiVersion)}`;

		const headers: Record<string, string> = {
			'content-type': 'application/json',
			'api-key': apiKey,
		};
		applyAdvancedHeaders(headers, this.config.get<string>('foundryCustomHeaders'));

		// Phase 4 — reasoning effort for the Foundry-hosted reasoning families.
		if (/foundry-(o[0-9]|gpt-5)/.test(options.model)) {
			const effort = (this.config.get<string>('reasoningEffort') ?? 'medium').trim();
			if (effort && ['low', 'medium', 'high', 'auto'].includes(effort)) {
				body['reasoning_effort'] = effort;
			}
		}

		try {
			const response = await retryableFetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: options.signal,
			}, { signal: options.signal });

			if (!response.ok) {
				const body = await this.readErrorBody(response);
				yield { type: 'error', error: this.mapProviderError('foundry', response.status, body) };
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				yield { type: 'error', error: 'Microsoft Foundry returned an empty response body. Try again shortly.' };
				return;
			}

			const decoder = new TextDecoder();
			let fullText = '';
			let inputTokens = 0;
			let outputTokens = 0;
			let buffer = '';
			// Tool-call accumulator keyed by `tool_calls[i].index`. Mirrors the
			// streamOpenAI implementation since Foundry surfaces identical chunk
			// shapes for chat-completions deployments.
			const toolCallsByIndex = new Map<number, { id?: string; name?: string; argsBuffer: string }>();
			let stopReason: string | undefined;

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) {
						continue;
					}
					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						continue;
					}

					try {
						const event = JSON.parse(data);

						// Token deltas live on choices[0].delta.content. The
						// final usage-only chunk has an empty choices array.
						const choice = event.choices?.[0];
						const delta = choice?.delta;
						if (delta && typeof delta.content === 'string' && delta.content.length > 0) {
							const token = delta.content;
							fullText += token;
							yield { type: 'token', token };
						}

						if (delta && Array.isArray(delta.tool_calls)) {
							for (const tc of delta.tool_calls) {
								if (typeof tc?.index !== 'number') {
									continue;
								}
								let entry = toolCallsByIndex.get(tc.index);
								if (!entry) {
									entry = { id: undefined, name: undefined, argsBuffer: '' };
									toolCallsByIndex.set(tc.index, entry);
								}
								if (typeof tc.id === 'string' && tc.id.length > 0) {
									entry.id = tc.id;
								}
								if (typeof tc.function?.name === 'string' && tc.function.name.length > 0) {
									entry.name = tc.function.name;
								}
								if (typeof tc.function?.arguments === 'string') {
									entry.argsBuffer += tc.function.arguments;
								}
							}
						}

						if (typeof choice?.finish_reason === 'string' && choice.finish_reason === 'tool_calls') {
							stopReason = 'tool_use';
						}

						if (event.usage) {
							inputTokens = event.usage.prompt_tokens ?? 0;
							outputTokens = event.usage.completion_tokens ?? 0;
						}
					} catch {
						// Skip malformed JSON lines in the stream
					}
				}
			}

			// Emit accumulated tool calls in stable index order.
			const orderedIndexes = Array.from(toolCallsByIndex.keys()).sort((a, b) => a - b);
			for (let i = 0; i < orderedIndexes.length; i++) {
				const idx = orderedIndexes[i];
				const entry = toolCallsByIndex.get(idx)!;
				let parsedInput: Record<string, unknown> = {};
				if (entry.argsBuffer.length > 0) {
					try {
						const parsed = JSON.parse(entry.argsBuffer);
						if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
							parsedInput = parsed as Record<string, unknown>;
						} else {
							console.warn(`LlmClient: Foundry tool_call arguments for '${entry.name}' did not parse to an object; defaulting to {}.`);
						}
					} catch (parseErr) {
						console.warn(`LlmClient: failed to parse Foundry tool_call arguments for '${entry.name}'; defaulting to {}.`, parseErr);
					}
				}
				yield {
					type: 'tool-call',
					id: entry.id ?? `foundry_call_${i}`,
					name: entry.name ?? '',
					input: parsedInput,
				};
			}

			// Foundry surfaces no cached-token signal in the standard chat
			// completions stream; leave at 0 to match the OpenAI path.
			this.totalInputTokens += inputTokens;
			this.totalOutputTokens += outputTokens;
			this.reportCost(options.model, options.agentHandle, inputTokens, outputTokens, 0);

			yield {
				type: 'complete',
				fullText,
				inputTokens,
				outputTokens,
				cachedTokens: 0,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
				stopReason,
			};
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled.' };
			} else {
				yield { type: 'error', error: this.mapNetworkError('foundry', err) };
			}
		}
	}

	/**
	 * Amazon Bedrock streaming implementation, restricted to Anthropic Claude
	 * foundation models. Bedrock requires AWS SigV4 request signing and frames
	 * its streaming response in the proprietary AWS event-stream binary format
	 * — both notoriously easy to get wrong by hand — so we delegate to the
	 * official `@aws-sdk/client-bedrock-runtime` package which handles signing,
	 * frame parsing, retries, and credential resolution.
	 *
	 * The Bedrock body shape for Anthropic models is the Anthropic Messages API
	 * with one tweak: `anthropic_version` replaces the SaaS API's `model` field
	 * (the model is selected via the URL path's `modelId`). Streaming chunks
	 * arrive with the SAME event shape as the Anthropic SaaS streaming API
	 * (`message_start` / `content_block_delta` / `message_delta`), so the token
	 * extraction and usage accounting mirror `streamAnthropic` line-for-line.
	 */
	private async *streamBedrock(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const config = await this.getBedrockConfig();
		const modelId = config.modelInvocationId(options.model);
		if (!modelId) {
			yield {
				type: 'error',
				error: `Amazon Bedrock model id not configured for "${options.model}". Update sota.bedrockModelMap to map this id to a Bedrock invocation id (e.g. \`anthropic.claude-3-5-sonnet-20241022-v2:0\`).`
			};
			return;
		}

		const supportsImages = modelSupportsImages(options.model);
		const body: Record<string, unknown> = {
			anthropic_version: 'bedrock-2023-05-31',
			max_tokens: options.maxTokens ?? 4096,
			system: options.systemPrompt ?? 'You are a helpful coding assistant.',
			messages: options.messages.map(m => ({
				role: m.role,
				content: serialiseAnthropicContent(m.content, supportsImages),
			})),
		};

		if (options.tools && options.tools.length > 0) {
			body['tools'] = options.tools.map(t => ({
				name: t.name,
				description: t.description,
				input_schema: t.inputSchema,
			}));
		}

		// Phase 4 — extended thinking budget for Bedrock Claude 4.x ids.
		if (/^bedrock-claude-(opus|sonnet|haiku)-4/.test(options.model)) {
			const budget = Math.max(0, Math.min(24000, this.config.get<number>('thinkingBudgetTokens') ?? 0));
			if (budget > 0) {
				body['thinking'] = { type: 'enabled', budget_tokens: budget };
			}
		}

		// Construct the SDK client. The SDK does not throw synchronously for
		// missing credentials at construction time — credential resolution is
		// deferred to first request — so this should only fail for malformed
		// region strings or other config-parse errors. Wrap defensively anyway.
		let client: BedrockRuntimeClient;
		try {
			// Phase 3 — optional endpoint override for VPC interface endpoints
			// or commercial regions with a non-default URL. Empty string falls
			// back to the SDK's default region URL.
			const endpointUrl = (this.config.get<string>('bedrockEndpointUrl') ?? '').trim();
			client = new BedrockRuntimeClient({
				region: config.region,
				credentials: config.credentialProvider,
				...(endpointUrl ? { endpoint: endpointUrl } : {}),
			});
		} catch (err) {
			yield { type: 'error', error: this.mapNetworkError('bedrock', err) };
			return;
		}

		try {
			const command = new InvokeModelWithResponseStreamCommand({
				modelId,
				contentType: 'application/json',
				accept: 'application/json',
				body: new TextEncoder().encode(JSON.stringify(body)),
			});
			const response = await client.send(command, { abortSignal: options.signal });

			if (!response.body) {
				yield { type: 'error', error: 'Amazon Bedrock returned an empty response body. Try again shortly.' };
				return;
			}

			let fullText = '';
			let inputTokens = 0;
			let outputTokens = 0;
			let stopReason: string | undefined;

			// Tool-use accumulator keyed by content block index. Mirrors the
			// streamAnthropic implementation since Bedrock surfaces identical
			// event shapes for Anthropic-family models.
			const toolUseByIndex = new Map<number, { id: string; name: string; jsonChunks: string[] }>();

			for await (const item of response.body) {
				if (options.signal?.aborted) {
					yield { type: 'error', error: 'Request cancelled.' };
					return;
				}

				// Bedrock's ResponseStream union surfaces stream-level errors as
				// distinct keys on the item. Translate to a single error event so
				// callers see the same shape as a transport-level failure.
				if (item.modelStreamErrorException) {
					yield { type: 'error', error: `Amazon Bedrock stream error: ${item.modelStreamErrorException.message ?? 'unknown'}` };
					return;
				}
				if (item.internalServerException) {
					yield { type: 'error', error: `Amazon Bedrock internal server error: ${item.internalServerException.message ?? 'unknown'}. Try again shortly.` };
					return;
				}
				if (item.modelTimeoutException) {
					yield { type: 'error', error: `Amazon Bedrock model timeout: ${item.modelTimeoutException.message ?? 'unknown'}.` };
					return;
				}
				if (item.throttlingException) {
					yield { type: 'error', error: `Amazon Bedrock rate limit hit. Wait a moment and retry, or check your account quotas.` };
					return;
				}
				if (item.validationException) {
					yield { type: 'error', error: `Amazon Bedrock request validation failed: ${item.validationException.message ?? 'unknown'}.` };
					return;
				}
				if (item.serviceUnavailableException) {
					yield { type: 'error', error: `Amazon Bedrock returned an internal error. Try again shortly.` };
					return;
				}

				const bytes = item.chunk?.bytes;
				if (!bytes) {
					continue;
				}
				let event: {
					type?: unknown;
					index?: unknown;
					content_block?: { type?: unknown; id?: unknown; name?: unknown };
					delta?: { type?: unknown; text?: unknown; partial_json?: unknown; stop_reason?: unknown };
					message?: { usage?: { input_tokens?: unknown } };
					usage?: { output_tokens?: unknown };
				};
				try {
					event = JSON.parse(new TextDecoder().decode(bytes));
				} catch {
					// Skip malformed JSON frames in the stream.
					continue;
				}

				if (event.type === 'content_block_start'
					&& event.content_block
					&& event.content_block.type === 'tool_use'
					&& typeof event.index === 'number'
					&& typeof event.content_block.id === 'string'
					&& typeof event.content_block.name === 'string'
				) {
					toolUseByIndex.set(event.index, {
						id: event.content_block.id,
						name: event.content_block.name,
						jsonChunks: [],
					});
				} else if (event.type === 'content_block_delta'
					&& event.delta
					&& event.delta.type === 'input_json_delta'
					&& typeof event.index === 'number'
					&& typeof event.delta.partial_json === 'string'
				) {
					const entry = toolUseByIndex.get(event.index);
					if (entry) {
						entry.jsonChunks.push(event.delta.partial_json);
					}
				} else if (event.type === 'content_block_stop' && typeof event.index === 'number') {
					const entry = toolUseByIndex.get(event.index);
					if (entry) {
						toolUseByIndex.delete(event.index);
						const joined = entry.jsonChunks.join('');
						let parsedInput: Record<string, unknown> = {};
						if (joined.length > 0) {
							try {
								const parsed = JSON.parse(joined);
								if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
									parsedInput = parsed as Record<string, unknown>;
								} else {
									console.warn(`LlmClient: tool_use input JSON for tool '${entry.name}' did not parse to an object; defaulting to {}.`);
								}
							} catch (parseErr) {
								console.warn(`LlmClient: failed to parse tool_use input JSON for tool '${entry.name}'; defaulting to {}.`, parseErr);
							}
						}
						yield { type: 'tool-call', id: entry.id, name: entry.name, input: parsedInput };
					}
				} else if (event.type === 'content_block_delta' && event.delta && typeof event.delta.text === 'string' && event.delta.text.length > 0) {
					const token = event.delta.text;
					fullText += token;
					yield { type: 'token', token };
				} else if (event.type === 'message_start' && event.message?.usage && typeof event.message.usage.input_tokens === 'number') {
					inputTokens = event.message.usage.input_tokens;
				} else if (event.type === 'message_delta') {
					if (event.usage && typeof event.usage.output_tokens === 'number') {
						outputTokens = event.usage.output_tokens;
					}
					if (event.delta && typeof event.delta.stop_reason === 'string') {
						stopReason = event.delta.stop_reason;
					}
				}
			}

			// Bedrock's streaming response surfaces no cached-token signal as of
			// late-2024 — leave at 0 to match the OpenAI / Foundry paths.
			this.totalInputTokens += inputTokens;
			this.totalOutputTokens += outputTokens;
			this.reportCost(options.model, options.agentHandle, inputTokens, outputTokens, 0);

			yield {
				type: 'complete',
				fullText,
				inputTokens,
				outputTokens,
				cachedTokens: 0,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
				stopReason,
			};
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled.' };
			} else {
				yield { type: 'error', error: this.mapNetworkError('bedrock', err) };
			}
		}
	}

	/**
	 * Google Gemini streaming implementation, targeting the consumer Gemini
	 * API endpoint (`generativelanguage.googleapis.com`) with API-key auth.
	 * Full Vertex AI (`aiplatform.googleapis.com` with ADC OAuth) is a
	 * deferred follow-up and is intentionally not handled here.
	 *
	 * Wire shape highlights:
	 *   - URL: `/v1beta/models/{modelId}:streamGenerateContent?alt=sse`
	 *   - Auth: `x-goog-api-key` header (avoids leaking the key in URL logs).
	 *   - Body: `contents` (with `role: 'user' | 'model'`), `systemInstruction`
	 *     as a top-level field (NOT inside `contents`), and `generationConfig`.
	 *   - Streaming: SSE chunks; each `data:` payload is a JSON object with
	 *     `candidates[0].content.parts[0].text` for token deltas, and a final
	 *     chunk carries `usageMetadata` for token accounting.
	 *   - Safety blocks surface as `finishReason: 'SAFETY'` and are mapped to
	 *     a user-facing error.
	 */
	private async *streamGoogle(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const apiKey = await this.getGoogleApiKey();
		if (!apiKey) {
			yield {
				type: 'error',
				error: 'Google Gemini credentials not configured. Set sota.googleApiKey in settings, or GOOGLE_API_KEY / GEMINI_API_KEY env var.'
			};
			return;
		}

		const modelId = this.getGoogleModelInvocationId(options.model);
		if (!modelId) {
			yield {
				type: 'error',
				error: `Google Gemini model id not configured for '${options.model}'. Update sota.googleModelMap.`
			};
			return;
		}

		// Map our 'assistant' role to Gemini's 'model' role; everything else
		// stays 'user'. System prompt lives in a separate top-level field.
		const supportsImages = modelSupportsImages(options.model);
		const contents = options.messages.map(m => ({
			role: m.role === 'assistant' ? 'model' : 'user',
			parts: serialiseGoogleParts(m.content, supportsImages),
		}));
		const body: Record<string, unknown> = {
			contents,
			systemInstruction: options.systemPrompt
				? { parts: [{ text: options.systemPrompt }] }
				: undefined,
			generationConfig: {
				maxOutputTokens: options.maxTokens ?? 4096,
			},
		};

		if (options.tools && options.tools.length > 0) {
			body.tools = [{
				functionDeclarations: options.tools.map(t => ({
					name: t.name,
					description: t.description,
					parameters: t.inputSchema,
				})),
			}];
		}

		const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(modelId)}:streamGenerateContent?alt=sse`;

		const headers: Record<string, string> = {
			'content-type': 'application/json',
			'x-goog-api-key': apiKey,
		};

		try {
			const response = await retryableFetch(url, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: options.signal,
			}, { signal: options.signal });

			if (!response.ok) {
				const errBody = await this.readErrorBody(response);
				yield { type: 'error', error: this.mapProviderError('google', response.status, errBody) };
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				yield { type: 'error', error: 'Google Gemini returned an empty response body. Try again shortly.' };
				return;
			}

			const decoder = new TextDecoder();
			let fullText = '';
			let inputTokens = 0;
			let outputTokens = 0;
			// SSE events are separated by a blank line (\n\n). We accumulate raw
			// bytes into a buffer and slice off complete events as boundaries
			// appear; partial events stay in the buffer for the next read.
			let buffer = '';
			let toolCallIndex = 0;
			let sawFunctionCall = false;

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });

				let boundary = buffer.indexOf('\n\n');
				while (boundary !== -1) {
					const rawEvent = buffer.slice(0, boundary);
					buffer = buffer.slice(boundary + 2);
					boundary = buffer.indexOf('\n\n');

					// An SSE event may have multiple lines; we only care about
					// the `data:` line(s). Concatenate any data lines per event.
					let dataPayload = '';
					for (const line of rawEvent.split('\n')) {
						if (line.startsWith('data:')) {
							dataPayload += line.slice(5).trimStart();
						}
					}
					if (!dataPayload) {
						continue;
					}
					if (dataPayload === '[DONE]') {
						continue;
					}

					try {
						const event = JSON.parse(dataPayload);
						const candidate = event.candidates?.[0];
						const parts = candidate?.content?.parts;
						if (Array.isArray(parts)) {
							for (const part of parts) {
								if (part && typeof part.text === 'string' && part.text.length > 0) {
									const token = part.text;
									fullText += token;
									yield { type: 'token', token };
								}
								if (part && part.functionCall && typeof part.functionCall.name === 'string') {
									sawFunctionCall = true;
									const args = part.functionCall.args;
									const input: Record<string, unknown> = (args && typeof args === 'object' && !Array.isArray(args))
										? args as Record<string, unknown>
										: {};
									yield {
										type: 'tool-call',
										id: `gemini_call_${toolCallIndex++}`,
										name: part.functionCall.name,
										input,
									};
								}
							}
						}

						if (candidate?.finishReason === 'SAFETY') {
							yield { type: 'error', error: 'Google Gemini blocked the response for safety reasons.' };
							return;
						}

						if (event.usageMetadata) {
							const meta = event.usageMetadata;
							if (typeof meta.promptTokenCount === 'number') {
								inputTokens = meta.promptTokenCount;
							}
							if (typeof meta.candidatesTokenCount === 'number') {
								outputTokens = meta.candidatesTokenCount;
							}
						}
					} catch {
						// Skip malformed JSON payloads in the stream.
					}
				}
			}

			// Gemini exposes no cached-token signal on the consumer endpoint —
			// leave at 0 to match the OpenAI / Foundry / Bedrock paths.
			this.totalInputTokens += inputTokens;
			this.totalOutputTokens += outputTokens;
			this.reportCost(options.model, options.agentHandle, inputTokens, outputTokens, 0);

			yield {
				type: 'complete',
				fullText,
				inputTokens,
				outputTokens,
				cachedTokens: 0,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
				stopReason: sawFunctionCall ? 'tool_use' : undefined,
			};
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled.' };
			} else {
				yield { type: 'error', error: this.mapNetworkError('google', err) };
			}
		}
	}

	/**
	 * Shared streaming implementation for plain OpenAI-compatible chat
	 * completions endpoints (OpenAI itself, OpenRouter, Ollama, LM Studio).
	 *
	 * Foundry has Azure-specific URL shaping, deployment routing, and
	 * `max_completion_tokens` handling — those quirks live in `streamFoundry`
	 * and are intentionally NOT folded in here.
	 *
	 * The token / tool-call extraction mirrors `streamOpenAI` line-for-line so
	 * any future fix to one path can be backported to the others by reading
	 * just this method.
	 */
	private async *streamOpenAICompatible(
		options: LlmRequestOptions,
		config: {
			provider: Provider;
			endpoint: string; // full URL of /chat/completions endpoint
			apiKey?: string;
			modelId: string;
			extraHeaders?: Record<string, string>;
			customHeadersSetting?: string;
			emptyBodyMessage: string;
			supportsUsageStream?: boolean; // some local servers omit usage chunks
		},
	): AsyncGenerator<LlmStreamEvent> {
		const supportsImages = modelSupportsImages(options.model);

		// Mirror streamOpenAI's body shape verbatim so wire compatibility is
		// preserved across every OpenAI-compatible vendor.
		const systemMessage = {
			role: 'system' as const,
			content: options.systemPrompt ?? 'You are a helpful coding assistant.',
		};
		const body: Record<string, unknown> = {
			model: config.modelId,
			max_tokens: options.maxTokens ?? 4096,
			messages: [
				systemMessage,
				...options.messages.map(m => ({ role: m.role, content: serialiseOpenAIContent(m.content, supportsImages) })),
			],
			stream: true,
		};
		// Only request usage if the server is known to support it. Ollama emits
		// it; LM Studio sometimes does and sometimes doesn't depending on the
		// runtime. Including the field is harmless on servers that ignore it.
		if (config.supportsUsageStream !== false) {
			body['stream_options'] = { include_usage: true };
		}

		if (options.tools && options.tools.length > 0) {
			body.tools = options.tools.map(t => ({
				type: 'function',
				function: { name: t.name, description: t.description, parameters: t.inputSchema },
			}));
		}

		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			...(config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}),
			...(config.extraHeaders ?? {}),
		};
		applyAdvancedHeaders(headers, this.config.get<string>(config.customHeadersSetting ?? ''));

		try {
			const response = await fetch(config.endpoint, {
				method: 'POST',
				headers,
				body: JSON.stringify(body),
				signal: options.signal,
			});

			if (!response.ok) {
				const errBody = await this.readErrorBody(response);
				yield { type: 'error', error: this.mapProviderError(config.provider, response.status, errBody) };
				return;
			}

			const reader = response.body?.getReader();
			if (!reader) {
				yield { type: 'error', error: config.emptyBodyMessage };
				return;
			}

			const decoder = new TextDecoder();
			let fullText = '';
			let inputTokens = 0;
			let outputTokens = 0;
			let buffer = '';
			const toolCallsByIndex = new Map<number, { id?: string; name?: string; argsBuffer: string }>();
			let stopReason: string | undefined;

			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.startsWith('data: ')) {
						continue;
					}
					const data = line.slice(6).trim();
					if (data === '[DONE]') {
						continue;
					}
					try {
						const event = JSON.parse(data);
						const choice = event.choices?.[0];
						const delta = choice?.delta;
						if (delta && typeof delta.content === 'string' && delta.content.length > 0) {
							const token = delta.content;
							fullText += token;
							yield { type: 'token', token };
						}
						if (delta && Array.isArray(delta.tool_calls)) {
							for (const tc of delta.tool_calls) {
								if (typeof tc?.index !== 'number') {
									continue;
								}
								let entry = toolCallsByIndex.get(tc.index);
								if (!entry) {
									entry = { id: undefined, name: undefined, argsBuffer: '' };
									toolCallsByIndex.set(tc.index, entry);
								}
								if (typeof tc.id === 'string' && tc.id.length > 0) {
									entry.id = tc.id;
								}
								if (typeof tc.function?.name === 'string' && tc.function.name.length > 0) {
									entry.name = tc.function.name;
								}
								if (typeof tc.function?.arguments === 'string') {
									entry.argsBuffer += tc.function.arguments;
								}
							}
						}
						if (typeof choice?.finish_reason === 'string' && choice.finish_reason === 'tool_calls') {
							stopReason = 'tool_use';
						}
						if (event.usage) {
							inputTokens = event.usage.prompt_tokens ?? inputTokens;
							outputTokens = event.usage.completion_tokens ?? outputTokens;
						}
					} catch {
						// Skip malformed JSON lines.
					}
				}
			}

			const orderedIndexes = Array.from(toolCallsByIndex.keys()).sort((a, b) => a - b);
			for (let i = 0; i < orderedIndexes.length; i++) {
				const idx = orderedIndexes[i];
				const entry = toolCallsByIndex.get(idx)!;
				let parsedInput: Record<string, unknown> = {};
				if (entry.argsBuffer.length > 0) {
					try {
						const parsed = JSON.parse(entry.argsBuffer);
						if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
							parsedInput = parsed as Record<string, unknown>;
						}
					} catch {
						// Defaults to {}.
					}
				}
				yield {
					type: 'tool-call',
					id: entry.id ?? `${config.provider}_call_${i}`,
					name: entry.name ?? '',
					input: parsedInput,
				};
			}

			this.totalInputTokens += inputTokens;
			this.totalOutputTokens += outputTokens;
			this.reportCost(options.model, options.agentHandle, inputTokens, outputTokens, 0);

			yield {
				type: 'complete',
				fullText,
				inputTokens,
				outputTokens,
				cachedTokens: 0,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
				stopReason,
			};
		} catch (err) {
			if (options.signal?.aborted) {
				yield { type: 'error', error: 'Request cancelled.' };
			} else {
				yield { type: 'error', error: this.mapNetworkError(config.provider, err) };
			}
		}
	}

	/**
	 * OpenRouter — single API key fronts hundreds of upstream models. The
	 * endpoint is OpenAI-compatible; the only OpenRouter-specific quirk is
	 * the required `HTTP-Referer` header which OpenRouter uses for analytics
	 * + anti-abuse rate limiting.
	 *
	 * Custom model slugs live in `sota.openRouterCustomModel` so users can
	 * pick obscure models without provider-specific configuration. Empty
	 * means "use the default Claude Sonnet" — picking `openrouter-custom`
	 * with no slug configured surfaces an error rather than silently
	 * defaulting.
	 */
	private async *streamOpenRouter(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const apiKey = await this.resolveCredential('sota.secrets.openRouterApiKey', 'openRouterApiKey', ['OPENROUTER_API_KEY']);
		if (!apiKey) {
			yield {
				type: 'error',
				error: 'OpenRouter credentials not configured. Set sota.openRouterApiKey in settings, or OPENROUTER_API_KEY env var.',
			};
			return;
		}
		let modelSlug = this.getModelId(options.model);
		if (modelSlug === 'openrouter-custom') {
			modelSlug = (this.config.get<string>('openRouterCustomModel') ?? '').trim();
			if (!modelSlug) {
				yield {
					type: 'error',
					error: 'OpenRouter custom model not configured. Set sota.openRouterCustomModel to a slug (e.g. \'anthropic/claude-opus-4-7\').',
				};
				return;
			}
		}
		const baseUrl = (this.config.get<string>('openRouterBaseUrl') ?? '').trim().replace(/\/+$/, '') || 'https://openrouter.ai/api/v1';
		yield* this.streamOpenAICompatible(options, {
			provider: 'openrouter',
			endpoint: `${baseUrl}/chat/completions`,
			apiKey,
			modelId: modelSlug,
			extraHeaders: {
				// OpenRouter requires HTTP-Referer + X-Title for attribution
				// and per-app rate limiting. Hardcoded to identify Son of Anton
				// requests upstream.
				'HTTP-Referer': 'https://son-of-anton.dev',
				'X-Title': 'Son of Anton',
			},
			customHeadersSetting: 'openRouterCustomHeaders',
			emptyBodyMessage: 'OpenRouter returned an empty response body. Try again shortly.',
		});
	}

	/**
	 * Ollama — local llama.cpp server. No auth required by default; the
	 * server URL is overridable via `sota.ollamaBaseUrl` for users running
	 * Ollama on a remote machine or non-default port.
	 *
	 * Custom model tags live in `sota.ollamaCustomModel` so users can route
	 * to any pulled tag without enumerating them all in the picker.
	 */
	private async *streamOllama(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		let modelTag = this.getModelId(options.model);
		if (modelTag === 'ollama-custom') {
			modelTag = (this.config.get<string>('ollamaCustomModel') ?? '').trim();
			if (!modelTag) {
				yield {
					type: 'error',
					error: 'Ollama custom model not configured. Set sota.ollamaCustomModel to a pulled tag (e.g. \'llama3.1:70b\', \'qwen2.5-coder\').',
				};
				return;
			}
		}
		const baseUrl = (this.config.get<string>('ollamaBaseUrl') ?? '').trim().replace(/\/+$/, '') || 'http://localhost:11434';
		yield* this.streamOpenAICompatible(options, {
			provider: 'ollama',
			endpoint: `${baseUrl}/v1/chat/completions`,
			modelId: modelTag,
			customHeadersSetting: 'ollamaCustomHeaders',
			emptyBodyMessage: 'Ollama returned an empty response body. Is the model finished loading? (Try again in a few seconds.)',
		});
	}

	/**
	 * LM Studio — local model server with an OpenAI-compatible API. Supports
	 * an optional API key (LM Studio added it for shared-server scenarios)
	 * but most local installs don't require one. The currently-loaded model
	 * is reachable via the special alias `loaded-model`.
	 */
	private async *streamLmStudio(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		let modelId = this.getModelId(options.model);
		if (modelId === 'lmstudio-custom') {
			modelId = (this.config.get<string>('lmstudioCustomModel') ?? '').trim();
			if (!modelId) {
				yield {
					type: 'error',
					error: 'LM Studio custom model not configured. Set sota.lmstudioCustomModel to the model id shown in LM Studio (or use \'loaded-model\' for the active model).',
				};
				return;
			}
		}
		const apiKey = await this.resolveCredential('sota.secrets.lmstudioApiKey', 'lmstudioApiKey', ['LMSTUDIO_API_KEY']);
		const baseUrl = (this.config.get<string>('lmstudioBaseUrl') ?? '').trim().replace(/\/+$/, '') || 'http://localhost:1234';
		yield* this.streamOpenAICompatible(options, {
			provider: 'lmstudio',
			endpoint: `${baseUrl}/v1/chat/completions`,
			apiKey: apiKey || undefined,
			modelId,
			customHeadersSetting: 'lmstudioCustomHeaders',
			emptyBodyMessage: 'LM Studio returned an empty response body. Confirm a model is loaded in the LM Studio app.',
		});
	}

	/**
	 * DeepSeek — direct API. OpenAI-compatible at `/v1/chat/completions`.
	 */
	private async *streamDeepSeek(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const apiKey = await this.resolveCredential('sota.secrets.deepSeekApiKey', 'deepSeekApiKey', ['DEEPSEEK_API_KEY']);
		if (!apiKey) {
			yield { type: 'error', error: 'DeepSeek credentials not configured. Set sota.deepSeekApiKey in settings, or DEEPSEEK_API_KEY env var.' };
			return;
		}
		const modelId = this.getModelId(options.model);
		const baseUrl = (this.config.get<string>('deepSeekBaseUrl') ?? '').trim().replace(/\/+$/, '') || 'https://api.deepseek.com/v1';
		yield* this.streamOpenAICompatible(options, {
			provider: 'deepseek',
			endpoint: `${baseUrl}/chat/completions`,
			apiKey,
			modelId,
			customHeadersSetting: 'deepSeekCustomHeaders',
			emptyBodyMessage: 'DeepSeek returned an empty response body. Try again shortly.',
		});
	}

	/**
	 * Mistral — direct API. OpenAI-compatible.
	 */
	private async *streamMistral(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const apiKey = await this.resolveCredential('sota.secrets.mistralApiKey', 'mistralApiKey', ['MISTRAL_API_KEY']);
		if (!apiKey) {
			yield { type: 'error', error: 'Mistral credentials not configured. Set sota.mistralApiKey in settings, or MISTRAL_API_KEY env var.' };
			return;
		}
		const modelId = this.getModelId(options.model);
		const baseUrl = (this.config.get<string>('mistralBaseUrl') ?? '').trim().replace(/\/+$/, '') || 'https://api.mistral.ai/v1';
		yield* this.streamOpenAICompatible(options, {
			provider: 'mistral',
			endpoint: `${baseUrl}/chat/completions`,
			apiKey,
			modelId,
			customHeadersSetting: 'mistralCustomHeaders',
			emptyBodyMessage: 'Mistral returned an empty response body. Try again shortly.',
		});
	}

	/**
	 * Groq — LPU-accelerated inference. OpenAI-compatible.
	 */
	private async *streamGroq(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const apiKey = await this.resolveCredential('sota.secrets.groqApiKey', 'groqApiKey', ['GROQ_API_KEY']);
		if (!apiKey) {
			yield { type: 'error', error: 'Groq credentials not configured. Set sota.groqApiKey in settings, or GROQ_API_KEY env var.' };
			return;
		}
		const modelId = this.getModelId(options.model);
		const baseUrl = (this.config.get<string>('groqBaseUrl') ?? '').trim().replace(/\/+$/, '') || 'https://api.groq.com/openai/v1';
		yield* this.streamOpenAICompatible(options, {
			provider: 'groq',
			endpoint: `${baseUrl}/chat/completions`,
			apiKey,
			modelId,
			customHeadersSetting: 'groqCustomHeaders',
			emptyBodyMessage: 'Groq returned an empty response body. Try again shortly.',
		});
	}

	/**
	 * Cerebras — wafer-scale inference. OpenAI-compatible.
	 */
	private async *streamCerebras(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const apiKey = await this.resolveCredential('sota.secrets.cerebrasApiKey', 'cerebrasApiKey', ['CEREBRAS_API_KEY']);
		if (!apiKey) {
			yield { type: 'error', error: 'Cerebras credentials not configured. Set sota.cerebrasApiKey in settings, or CEREBRAS_API_KEY env var.' };
			return;
		}
		const modelId = this.getModelId(options.model);
		const baseUrl = (this.config.get<string>('cerebrasBaseUrl') ?? '').trim().replace(/\/+$/, '') || 'https://api.cerebras.ai/v1';
		yield* this.streamOpenAICompatible(options, {
			provider: 'cerebras',
			endpoint: `${baseUrl}/chat/completions`,
			apiKey,
			modelId,
			customHeadersSetting: 'cerebrasCustomHeaders',
			emptyBodyMessage: 'Cerebras returned an empty response body. Try again shortly.',
		});
	}

	/**
	 * Together AI — broad open-model catalogue. OpenAI-compatible. The
	 * `together-custom` id resolves at request time via
	 * `sota.togetherCustomModel`.
	 */
	private async *streamTogether(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const apiKey = await this.resolveCredential('sota.secrets.togetherApiKey', 'togetherApiKey', ['TOGETHER_API_KEY']);
		if (!apiKey) {
			yield { type: 'error', error: 'Together credentials not configured. Set sota.togetherApiKey in settings, or TOGETHER_API_KEY env var.' };
			return;
		}
		let modelId = this.getModelId(options.model);
		if (modelId === 'together-custom') {
			modelId = (this.config.get<string>('togetherCustomModel') ?? '').trim();
			if (!modelId) {
				yield {
					type: 'error',
					error: 'Together custom model not configured. Set sota.togetherCustomModel to a slug (e.g. \'meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo\').',
				};
				return;
			}
		}
		const baseUrl = (this.config.get<string>('togetherBaseUrl') ?? '').trim().replace(/\/+$/, '') || 'https://api.together.xyz/v1';
		yield* this.streamOpenAICompatible(options, {
			provider: 'together',
			endpoint: `${baseUrl}/chat/completions`,
			apiKey,
			modelId,
			customHeadersSetting: 'togetherCustomHeaders',
			emptyBodyMessage: 'Together returned an empty response body. Try again shortly.',
		});
	}

	/**
	 * Fireworks — broad open-model catalogue. OpenAI-compatible. The
	 * `fireworks-custom` id resolves at request time via
	 * `sota.fireworksCustomModel`.
	 */
	private async *streamFireworks(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const apiKey = await this.resolveCredential('sota.secrets.fireworksApiKey', 'fireworksApiKey', ['FIREWORKS_API_KEY']);
		if (!apiKey) {
			yield { type: 'error', error: 'Fireworks credentials not configured. Set sota.fireworksApiKey in settings, or FIREWORKS_API_KEY env var.' };
			return;
		}
		let modelId = this.getModelId(options.model);
		if (modelId === 'fireworks-custom') {
			modelId = (this.config.get<string>('fireworksCustomModel') ?? '').trim();
			if (!modelId) {
				yield {
					type: 'error',
					error: 'Fireworks custom model not configured. Set sota.fireworksCustomModel to a slug (e.g. \'accounts/fireworks/models/llama-v3p1-405b-instruct\').',
				};
				return;
			}
		}
		const baseUrl = (this.config.get<string>('fireworksBaseUrl') ?? '').trim().replace(/\/+$/, '') || 'https://api.fireworks.ai/inference/v1';
		yield* this.streamOpenAICompatible(options, {
			provider: 'fireworks',
			endpoint: `${baseUrl}/chat/completions`,
			apiKey,
			modelId,
			customHeadersSetting: 'fireworksCustomHeaders',
			emptyBodyMessage: 'Fireworks returned an empty response body. Try again shortly.',
		});
	}

	/**
	 * Route through the locally-installed OpenAI Codex CLI. The CLI handles
	 * auth itself (subscription / OAuth tokens stored by the Codex installer),
	 * so the user doesn't need an `OPENAI_API_KEY` configured in Son of Anton
	 * settings. Mirrors `streamClaudeCode`.
	 */
	private async *streamCodex(options: LlmRequestOptions): AsyncGenerator<LlmStreamEvent> {
		const { runCodex, isCodexAvailable } = await import('./codexRunner.js');
		if (!isCodexAvailable()) {
			yield {
				type: 'error',
				error: 'OpenAI Codex CLI is not installed or not on PATH. Install it from https://github.com/openai/codex, or pick a different model.',
			};
			return;
		}
		const cliModel = this.getModelId(options.model);
		const messages = options.messages.map(m => {
			const text = typeof m.content === 'string'
				? m.content
				: m.content.map(part => part.type === 'text' ? part.text : '').join('');
			return { role: m.role as 'user' | 'assistant', content: text };
		});
		let fullText = '';
		let inputTokens = 0;
		let outputTokens = 0;
		try {
			for await (const chunk of runCodex({
				systemPrompt: options.systemPrompt ?? 'You are a helpful coding assistant.',
				messages,
				modelId: cliModel,
			})) {
				if (chunk.type === 'text') {
					fullText += chunk.text;
					yield { type: 'token', token: chunk.text };
				} else if (chunk.type === 'usage') {
					inputTokens += chunk.inputTokens;
					outputTokens += chunk.outputTokens;
				} else if (chunk.type === 'error') {
					yield { type: 'error', error: chunk.message };
					return;
				}
				// system / done are informational; ignore.
			}
			this.totalInputTokens += inputTokens;
			this.totalOutputTokens += outputTokens;
			yield {
				type: 'complete',
				fullText,
				inputTokens,
				outputTokens,
				cachedTokens: 0,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
				stopReason: 'end_turn',
			};
		} catch (err) {
			yield { type: 'error', error: err instanceof Error ? err.message : String(err) };
		}
	}

	/**
	 * Non-streaming request. Collects all tokens and returns the full response.
	 */
	async request(options: LlmRequestOptions): Promise<string> {
		let result = '';
		for await (const event of this.streamRequest(options)) {
			if (event.type === 'token') {
				result += event.token;
			} else if (event.type === 'error') {
				throw new Error(event.error);
			}
		}
		return result;
	}

	/**
	 * Phase 3 — single-shot connectivity probe used by the inline provider
	 * forms' "Test connection" button. Reads whatever credentials are
	 * currently in `liveConfig` / SecretStorage; does NOT persist anything.
	 *
	 * Throws after a hard timeout so a misconfigured proxy can't hang the
	 * UI indefinitely. The thrown message is what the form's inline status
	 * pill renders, so it's worded as a self-explanatory user-facing error.
	 */
	async pingProvider(model: ModelId, timeoutMs: number = 10000): Promise<{ ok: boolean; message: string }> {
		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(), timeoutMs);
		try {
			const stream = this.streamRequest({
				model,
				messages: [{ role: 'user', content: 'Reply with: ok' }],
				maxTokens: 1,
				systemPrompt: 'You are a connectivity probe. Reply with the single word ok.',
				signal: controller.signal,
			});
			for await (const event of stream) {
				if (event.type === 'token' || event.type === 'complete') {
					return { ok: true, message: 'OK' };
				}
				if (event.type === 'error') {
					return { ok: false, message: event.error };
				}
			}
			return { ok: false, message: 'Probe returned no events.' };
		} catch (err) {
			if (controller.signal.aborted) {
				return { ok: false, message: `Timed out after ${Math.round(timeoutMs / 1000)}s.` };
			}
			return { ok: false, message: err instanceof Error ? err.message : String(err) };
		} finally {
			clearTimeout(timer);
		}
	}

	getTokenUsage(): { input: number; output: number; cached: number } {
		return {
			input: this.totalInputTokens,
			output: this.totalOutputTokens,
			cached: this.totalCachedTokens,
		};
	}

	/**
	 * Estimate cost based on token usage. Pricing is per-model since each
	 * model has its own rates (and providers price differently). When usage
	 * is mixed across models, this is necessarily approximate — callers that
	 * need precise per-call cost should derive it at request time from the
	 * stream-complete event.
	 *
	 * Rates (USD per 1M tokens):
	 *   Anthropic (blended):    input $3.00, output $15.00
	 *   gpt-4o:                 input $2.50, output $10.00
	 *   gpt-4o-mini:            input $0.15, output $0.60
	 *   gpt-5-codex:            placeholder, uses gpt-4o rates
	 *   foundry-gpt-4o:         mirrors gpt-4o (best-effort; Foundry pricing varies by region and commitment tier)
	 *   foundry-gpt-4o-mini:    mirrors gpt-4o-mini (best-effort)
	 *   foundry-claude-sonnet:  mirrors Anthropic Sonnet (~$3 / $15 per Mtok, best-effort)
	 *   bedrock-claude-sonnet:  Anthropic public Bedrock pricing — input $3.00, output $15.00 per Mtok
	 *   bedrock-claude-haiku:   Anthropic public Bedrock pricing — input $0.80, output $4.00 per Mtok
	 *   gemini-1-5-pro:         input $1.25, output $5.00 per Mtok (lower-context tier; >128K context tier is $2.50 / $10.00 but is not auto-detected here)
	 *   gemini-1-5-flash:       input $0.075, output $0.30 per Mtok (lower-context tier; >128K context tier is $0.15 / $0.60 but is not auto-detected here)
	 *   gemini-2-0-flash:       input $0.10, output $0.40 per Mtok
	 */
	estimateCost(model?: ModelId): number {
		// Default to Anthropic blended rates if no model is supplied so existing
		// callers see no behavioural change.
		const rates = model ? estimateRatesForModel(model) : { input: 3.0, output: 15.0 };
		return (this.totalInputTokens / 1_000_000) * rates.input +
			(this.totalOutputTokens / 1_000_000) * rates.output;
	}
}

/**
 * Phase 3 — merge a user-supplied JSON-encoded custom headers map into the
 * existing headers dict. Silently no-ops on malformed JSON or non-object
 * values so a typo can never break an in-flight request. We only allow
 * string-valued entries; unknown shapes drop through with a console.warn
 * once per request.
 */
/**
 * Map a Provider id to the human-readable label surfaced in error messages.
 * Centralised so adding a new provider only requires touching this function
 * (and the union type) — every error path picks up the new label for free.
 */
function providerDisplayName(provider: Provider): string {
	switch (provider) {
		case 'anthropic': return 'Anthropic';
		case 'openai': return 'OpenAI';
		case 'foundry': return 'Microsoft Foundry';
		case 'bedrock': return 'Amazon Bedrock';
		case 'google': return 'Google Gemini';
		case 'claude-code': return 'Claude Code';
		case 'openrouter': return 'OpenRouter';
		case 'ollama': return 'Ollama';
		case 'lmstudio': return 'LM Studio';
		case 'deepseek': return 'DeepSeek';
		case 'mistral': return 'Mistral';
		case 'groq': return 'Groq';
		case 'cerebras': return 'Cerebras';
		case 'together': return 'Together';
		case 'fireworks': return 'Fireworks';
		case 'codex': return 'OpenAI Codex CLI';
	}
}

function applyAdvancedHeaders(target: Record<string, string>, raw: string | undefined): void {
	const trimmed = (raw ?? '').trim();
	if (!trimmed) {
		return;
	}
	try {
		const parsed = JSON.parse(trimmed);
		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			return;
		}
		for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
			if (typeof v === 'string' && k.length > 0) {
				target[k] = v;
			}
		}
	} catch (err) {
		console.warn('LlmClient: failed to parse custom headers JSON; ignoring.', err);
	}
}

/**
 * HTTP status codes considered transient and therefore worth retrying with
 * exponential backoff. 429 is upstream rate-limiting; 500/502/503 are generic
 * server-side faults; 529 is Anthropic's 'overloaded' status.
 */
const RETRYABLE_HTTP_STATUSES: ReadonlySet<number> = new Set([429, 500, 502, 503, 529]);

/** Cap any honoured `Retry-After` header at 60s to avoid pathological waits. */
const MAX_RETRY_AFTER_MS = 60_000;

/**
 * Decide whether a thrown fetch error looks like a transient network blip
 * (DNS resolution failure, connection reset, socket hang up, generic
 * `fetch failed` from undici). Aborts are excluded — they propagate.
 */
function isRetryableNetworkError(err: unknown): boolean {
	if (!err || typeof err !== 'object') {
		return false;
	}
	const name = (err as { name?: unknown }).name;
	if (typeof name === 'string' && name === 'AbortError') {
		return false;
	}
	const message = (err as { message?: unknown }).message;
	const code = (err as { code?: unknown }).code;
	const cause = (err as { cause?: unknown }).cause;
	const haystack: string[] = [];
	if (typeof message === 'string') {
		haystack.push(message);
	}
	if (typeof code === 'string') {
		haystack.push(code);
	}
	if (cause && typeof cause === 'object') {
		const causeCode = (cause as { code?: unknown }).code;
		const causeMessage = (cause as { message?: unknown }).message;
		if (typeof causeCode === 'string') {
			haystack.push(causeCode);
		}
		if (typeof causeMessage === 'string') {
			haystack.push(causeMessage);
		}
	}
	const blob = haystack.join(' ');
	return /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|UND_ERR|fetch failed|network|socket hang up/i.test(blob);
}

/**
 * Parse a `Retry-After` HTTP header value. Supports both delta-seconds and
 * HTTP-date forms. Returns `undefined` if the header is missing or malformed.
 */
function parseRetryAfterMs(response: Response): number | undefined {
	const raw = response.headers.get('retry-after');
	if (!raw) {
		return undefined;
	}
	const trimmed = raw.trim();
	if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
		const seconds = Number(trimmed);
		if (Number.isFinite(seconds) && seconds >= 0) {
			return Math.min(seconds * 1000, MAX_RETRY_AFTER_MS);
		}
		return undefined;
	}
	const dateMs = Date.parse(trimmed);
	if (!Number.isFinite(dateMs)) {
		return undefined;
	}
	const deltaMs = dateMs - Date.now();
	if (deltaMs <= 0) {
		return 0;
	}
	return Math.min(deltaMs, MAX_RETRY_AFTER_MS);
}

/**
 * Sleep for `delayMs`, but reject with the abort reason as soon as `signal`
 * fires. Used between retry attempts so a cancelled stream doesn't have to
 * wait out the full backoff window.
 */
function sleepWithAbort(delayMs: number, signal?: AbortSignal): Promise<void> {
	if (delayMs <= 0) {
		if (signal?.aborted) {
			return Promise.reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
		}
		return Promise.resolve();
	}
	return new Promise<void>((resolve, reject) => {
		if (signal?.aborted) {
			reject(signal.reason ?? new DOMException('Aborted', 'AbortError'));
			return;
		}
		const timer = setTimeout(() => {
			signal?.removeEventListener('abort', onAbort);
			resolve();
		}, delayMs);
		const onAbort = () => {
			clearTimeout(timer);
			signal?.removeEventListener('abort', onAbort);
			reject(signal?.reason ?? new DOMException('Aborted', 'AbortError'));
		};
		signal?.addEventListener('abort', onAbort, { once: true });
	});
}

/**
 * Wrap a single `fetch` call with bounded exponential-backoff retry on
 * transient HTTP errors (429 / 500 / 502 / 503 / 529) and transient network
 * errors (ECONNRESET, 'fetch failed', and friends). Behaviour summary:
 *
 *   - First attempt fires immediately. Up to `maxRetries` further attempts
 *     follow, each spaced by `baseDelayMs * 2^attempt` (default 1s, 2s, 4s).
 *   - A `Retry-After` header on a 429 / 503 response wins over the backoff
 *     schedule, clamped to {@link MAX_RETRY_AFTER_MS}.
 *   - The signal is honoured both during fetch and during the inter-attempt
 *     sleep — aborts bubble through immediately.
 *   - 4xx responses other than 429, and non-network exceptions, are returned
 *     or thrown as-is without retry.
 *   - Only the *initial* response is retried; once a body has started
 *     streaming, mid-stream failures are the caller's problem (retrying
 *     would lose tokens).
 *
 * @param url Target URL — passed through to `fetch` verbatim.
 * @param init RequestInit — passed through to `fetch` verbatim. The signal
 *             should normally also be supplied via `options.signal` so that
 *             the inter-attempt sleep can observe cancellation.
 * @param options Retry tuning knobs and an abort signal.
 */
async function retryableFetch(
	url: string,
	init: RequestInit,
	options: { maxRetries?: number; baseDelayMs?: number; signal?: AbortSignal } = {},
): Promise<Response> {
	const maxRetries = options.maxRetries ?? 3;
	const baseDelayMs = options.baseDelayMs ?? 1000;
	const signal = options.signal;

	let lastError: unknown;
	for (let attempt = 0; attempt <= maxRetries; attempt++) {
		if (signal?.aborted) {
			throw signal.reason ?? new DOMException('Aborted', 'AbortError');
		}

		let response: Response | undefined;
		try {
			response = await fetch(url, init);
		} catch (err) {
			// Always let aborts propagate untouched.
			if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
				throw err;
			}
			if (attempt < maxRetries && isRetryableNetworkError(err)) {
				lastError = err;
				const delayMs = baseDelayMs * Math.pow(2, attempt);
				await sleepWithAbort(delayMs, signal);
				continue;
			}
			throw err;
		}

		if (!RETRYABLE_HTTP_STATUSES.has(response.status) || attempt >= maxRetries) {
			return response;
		}

		// Drain and discard the body of the doomed response so the underlying
		// connection can be reused, then sleep before the next attempt.
		try {
			await response.body?.cancel();
		} catch {
			// Best-effort; ignore.
		}

		const retryAfterMs = (response.status === 429 || response.status === 503)
			? parseRetryAfterMs(response)
			: undefined;
		const backoffMs = baseDelayMs * Math.pow(2, attempt);
		const delayMs = retryAfterMs !== undefined ? retryAfterMs : backoffMs;
		lastError = new Error(`HTTP ${response.status}`);
		await sleepWithAbort(delayMs, signal);
	}

	// Loop is guaranteed to either return a response or throw before falling
	// off the end. This is here purely to satisfy TypeScript's flow analysis.
	throw lastError ?? new Error('retryableFetch: exhausted retries with no recorded error');
}

/**
 * Per-model input/output rates (USD per 1M tokens) used by `estimateCost`.
 * Kept inline (rather than importing from `ModelRouter` / `CostReporter`) to
 * avoid the circular dep that those files have on `LlmClient.ModelId`. Update
 * alongside `MODEL_COSTS` in `son-of-anton-core/llm/ModelRouter.ts` whenever
 * a new model is added — TypeScript will flag any miss because the function
 * signature is `Record<ModelId, ...>`.
 */
function estimateRatesForModel(model: ModelId): { input: number; output: number } {
	const table: Record<ModelId, { input: number; output: number }> = {
		opus: { input: 15.0, output: 75.0 },
		sonnet: { input: 3.0, output: 15.0 },
		haiku: { input: 0.25, output: 1.25 },
		'claude-opus-4-7': { input: 15.0, output: 75.0 },
		'claude-sonnet-4-7': { input: 3.0, output: 15.0 },
		'claude-haiku-4-7': { input: 1.0, output: 5.0 },
		'claude-opus-4-6': { input: 15.0, output: 75.0 },
		'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
		'claude-haiku-4-6': { input: 1.0, output: 5.0 },
		'claude-opus-4-5': { input: 15.0, output: 75.0 },
		'claude-sonnet-4-5': { input: 3.0, output: 15.0 },
		'claude-haiku-4-5': { input: 1.0, output: 5.0 },
		'claude-opus-4-1': { input: 15.0, output: 75.0 },
		'claude-sonnet-4-1': { input: 3.0, output: 15.0 },
		'claude-opus-4': { input: 15.0, output: 75.0 },
		'claude-sonnet-4': { input: 3.0, output: 15.0 },
		'claude-3-7-sonnet': { input: 3.0, output: 15.0 },
		'claude-3-5-sonnet': { input: 3.0, output: 15.0 },
		'claude-3-5-haiku': { input: 0.8, output: 4.0 },
		'claude-3-opus': { input: 15.0, output: 75.0 },
		'claude-3-sonnet': { input: 3.0, output: 15.0 },
		'claude-3-haiku': { input: 0.25, output: 1.25 },
		'gpt-4o': { input: 2.5, output: 10.0 },
		'gpt-4o-mini': { input: 0.15, output: 0.6 },
		'gpt-5': { input: 1.25, output: 10.0 },
		'gpt-5-mini': { input: 0.25, output: 2.0 },
		'gpt-5-nano': { input: 0.05, output: 0.4 },
		'gpt-5-codex': { input: 1.25, output: 10.0 },
		'gpt-4-1': { input: 2.0, output: 8.0 },
		'gpt-4-1-mini': { input: 0.4, output: 1.6 },
		'gpt-4-1-nano': { input: 0.1, output: 0.4 },
		'gpt-4-turbo': { input: 10.0, output: 30.0 },
		'gpt-3-5-turbo': { input: 0.5, output: 1.5 },
		'o1': { input: 15.0, output: 60.0 },
		'o1-mini': { input: 1.1, output: 4.4 },
		'o1-pro': { input: 150.0, output: 600.0 },
		'o3': { input: 2.0, output: 8.0 },
		'o3-mini': { input: 1.1, output: 4.4 },
		'o4-mini': { input: 1.1, output: 4.4 },
		'foundry-gpt-4': { input: 2.5, output: 10.0 },
		'foundry-gpt-4o': { input: 2.5, output: 10.0 },
		'foundry-gpt-4o-mini': { input: 0.15, output: 0.6 },
		'foundry-gpt-4-1': { input: 2.0, output: 8.0 },
		'foundry-gpt-4-1-mini': { input: 0.4, output: 1.6 },
		'foundry-gpt-4-1-nano': { input: 0.1, output: 0.4 },
		'foundry-gpt-5': { input: 1.25, output: 10.0 },
		'foundry-gpt-5-mini': { input: 0.25, output: 2.0 },
		'foundry-gpt-5-nano': { input: 0.05, output: 0.4 },
		'foundry-o1': { input: 15.0, output: 60.0 },
		'foundry-o1-mini': { input: 1.1, output: 4.4 },
		'foundry-o3': { input: 2.0, output: 8.0 },
		'foundry-o3-mini': { input: 1.1, output: 4.4 },
		'foundry-o4-mini': { input: 1.1, output: 4.4 },
		'foundry-claude-sonnet': { input: 3.0, output: 15.0 },
		'foundry-mistral-large': { input: 4.0, output: 12.0 },
		'foundry-llama-3-70b': { input: 0.65, output: 2.75 },
		'foundry-phi-4': { input: 0.125, output: 0.5 },
		'foundry-custom': { input: 2.5, output: 10.0 },
		'bedrock-claude-opus-4': { input: 15.0, output: 75.0 },
		'bedrock-claude-sonnet-4': { input: 3.0, output: 15.0 },
		'bedrock-claude-haiku-4': { input: 1.0, output: 5.0 },
		'bedrock-claude-3-7-sonnet': { input: 3.0, output: 15.0 },
		'bedrock-claude-sonnet': { input: 3.0, output: 15.0 },
		'bedrock-claude-haiku': { input: 0.25, output: 1.25 },
		'bedrock-llama-3-1-70b': { input: 0.99, output: 0.99 },
		'bedrock-llama-3-1-8b': { input: 0.22, output: 0.22 },
		'bedrock-llama-3-70b': { input: 2.65, output: 3.5 },
		'bedrock-mistral-large': { input: 4.0, output: 12.0 },
		'bedrock-titan-text-express': { input: 0.2, output: 0.6 },
		'bedrock-cohere-command-r-plus': { input: 3.0, output: 15.0 },
		'bedrock-nova-pro': { input: 0.8, output: 3.2 },
		'bedrock-nova-lite': { input: 0.06, output: 0.24 },
		'bedrock-nova-micro': { input: 0.035, output: 0.14 },
		'gemini-2-5-pro': { input: 1.25, output: 10.0 },
		'gemini-2-5-flash': { input: 0.075, output: 0.3 },
		'gemini-2-0-pro': { input: 0.5, output: 2.0 },
		'gemini-2-0-flash': { input: 0.1, output: 0.4 },
		'gemini-2-0-flash-lite': { input: 0.075, output: 0.3 },
		'gemini-1-5-pro': { input: 1.25, output: 5.0 },
		'gemini-1-5-flash': { input: 0.075, output: 0.3 },
		'claude-code-opus': { input: 0, output: 0 },
		'claude-code-sonnet': { input: 0, output: 0 },
		'claude-code-haiku': { input: 0, output: 0 },
		// OpenRouter — pricing mirrors the upstream provider's published list
		// rates. OpenRouter adds a small markup that we don't try to model
		// here; the cost reporter is approximate by design.
		'openrouter-claude-opus-4-7': { input: 15.0, output: 75.0 },
		'openrouter-claude-sonnet-4-7': { input: 3.0, output: 15.0 },
		'openrouter-gpt-5': { input: 1.25, output: 10.0 },
		'openrouter-llama-3-1-405b': { input: 2.7, output: 2.7 },
		'openrouter-deepseek-v3': { input: 0.27, output: 1.1 },
		'openrouter-mistral-large': { input: 4.0, output: 12.0 },
		'openrouter-qwen-2-5-coder': { input: 0.18, output: 0.18 },
		'openrouter-grok-2': { input: 2.0, output: 10.0 },
		'openrouter-custom': { input: 0, output: 0 },
		// Ollama / LM Studio — local inference, zero marginal cost.
		'ollama-llama-3-1': { input: 0, output: 0 },
		'ollama-qwen-2-5-coder': { input: 0, output: 0 },
		'ollama-deepseek-r1': { input: 0, output: 0 },
		'ollama-custom': { input: 0, output: 0 },
		'lmstudio-loaded': { input: 0, output: 0 },
		'lmstudio-custom': { input: 0, output: 0 },
		// DeepSeek — direct API list pricing.
		'deepseek-v3': { input: 0.27, output: 1.1 },
		'deepseek-r1': { input: 0.55, output: 2.19 },
		// Mistral — direct API list pricing.
		'mistral-large': { input: 2.0, output: 6.0 },
		'mistral-small': { input: 0.2, output: 0.6 },
		'codestral': { input: 0.3, output: 0.9 },
		'mistral-pixtral': { input: 0.15, output: 0.15 },
		// Groq — LPU-accelerated; very low pricing.
		'groq-llama-3-3-70b': { input: 0.59, output: 0.79 },
		'groq-llama-3-1-8b': { input: 0.05, output: 0.08 },
		'groq-mixtral-8x7b': { input: 0.24, output: 0.24 },
		'groq-deepseek-r1-llama-70b': { input: 0.75, output: 0.99 },
		// Cerebras — wafer-scale; competitive list pricing.
		'cerebras-llama-3-3-70b': { input: 0.85, output: 1.2 },
		'cerebras-llama-3-1-8b': { input: 0.1, output: 0.1 },
		// Together — list pricing per model card.
		'together-llama-3-1-405b': { input: 3.5, output: 3.5 },
		'together-qwen-2-5-coder': { input: 0.8, output: 0.8 },
		'together-mixtral-8x22b': { input: 1.2, output: 1.2 },
		'together-custom': { input: 0, output: 0 },
		// Fireworks — list pricing per model card.
		'fireworks-llama-3-1-405b': { input: 3.0, output: 3.0 },
		'fireworks-deepseek-v3': { input: 0.9, output: 0.9 },
		'fireworks-qwen-2-5-coder': { input: 0.9, output: 0.9 },
		'fireworks-custom': { input: 0, output: 0 },
		// Codex CLI — subscription-based, zero marginal cost on the API side.
		'codex-gpt-5': { input: 0, output: 0 },
		'codex-gpt-5-mini': { input: 0, output: 0 },
		'codex-gpt-5-codex': { input: 0, output: 0 },
	};
	return table[model];
}
