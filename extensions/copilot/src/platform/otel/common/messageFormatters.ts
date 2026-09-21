/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Converts internal message types to OTel GenAI JSON schema format.
 * @see https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-input-messages.json
 * @see https://github.com/open-telemetry/semantic-conventions/blob/main/docs/gen-ai/gen-ai-output-messages.json
 */

import { getImageDimensions } from '../../../util/common/imageUtils';
import { calculateImageTokenCostForDimensions, estimateDocumentTokenCost, ImageDetail } from '../../tokenizer/common/attachmentTokenCost';

/**
 * Truncate a string to fit within OTel attribute size limits.
 * Returns the original string if within bounds, otherwise truncates with a suffix.
 *
 * @param value The string to truncate.
 * @param maxLength The maximum length in characters. A value of `0` (the
 * default) or any non-positive number disables truncation entirely, matching
 * the OTel spec's `AttributeValueLengthLimit` default of `Infinity` for string
 * attributes (see https://opentelemetry.io/docs/specs/otel/common/#attribute-limits).
 * Production call sites should pass `OTelConfig.maxAttributeSizeChars` so
 * users can configure truncation to match their backend's per-attribute limit.
 */
export function truncateForOTel(value: string, maxLength: number = 0): string {
	if (maxLength <= 0 || value.length <= maxLength) {
		return value;
	}
	const suffix = `...[truncated, original ${value.length} chars]`;
	// If maxLength is too small to fit the suffix, fall back to a hard cut so
	// the result is always <= maxLength.
	if (maxLength <= suffix.length) {
		return value.substring(0, maxLength);
	}
	return value.substring(0, maxLength - suffix.length) + suffix;
}

export interface OTelChatMessage {
	role: string | undefined;
	parts: OTelMessagePart[];
}

export interface OTelOutputMessage extends OTelChatMessage {
	finish_reason?: string;
}

/** Modality of a binary attachment part, per the OTel GenAI message schema. */
export type OTelAttachmentModality = 'image' | 'document';

/**
 * What is known about an attachment beyond what the request body carries.
 * Sizes are in bytes and pixels; `estimatedTokens` is the client-side prompt
 * budget estimate, not a billed figure.
 */
export interface OTelAttachmentMetadata {
	mimeType?: string;
	sizeBytes?: number;
	width?: number;
	height?: number;
	estimatedTokens?: number;
}

interface OTelAttachmentPartFields {
	modality: OTelAttachmentModality;
	mime_type: string | null;
	size_bytes?: number;
	width?: number;
	height?: number;
	/** Client-side estimate of the prompt tokens this part costs (see {@link OTelAttachmentMetadata.estimatedTokens}). */
	estimated_tokens?: number;
}

export type OTelMessagePart =
	| { type: 'text'; content: string }
	| { type: 'tool_call'; id: string; name: string; arguments: unknown }
	| { type: 'tool_call_response'; id: string; response: unknown }
	| { type: 'tool_search_output'; id: string; tools?: unknown; status?: string }
	| { type: 'reasoning'; content: string }
	/** An attachment the model fetches by URI (e.g. an uploaded chat image). */
	| ({ type: 'uri'; uri: string } & OTelAttachmentPartFields)
	/** An attachment sent inline as base64. */
	| ({ type: 'blob'; content: string } & OTelAttachmentPartFields)
	/** An attachment referenced by a provider-side file id. */
	| ({ type: 'file'; file_id: string } & OTelAttachmentPartFields);

export interface NormalizeProviderMessagesOptions {
	/**
	 * Looks up what is known about an attachment that is referenced by URI
	 * rather than sent inline, so the emitted part can still carry its mime
	 * type, size and token estimate.
	 */
	resolveAttachment?(uri: string): OTelAttachmentMetadata | undefined;
}

export type OTelSystemInstruction = Array<{ type: 'text'; content: string }>;

export interface OTelToolDefinition {
	type: 'function';
	name: string;
	description?: string;
	parameters?: unknown;
}

/**
 * Convert an array of internal messages to OTel input message format.
 * Handles OpenAI format (tool_calls, tool_call_id) natively.
 */
export function toInputMessages(messages: ReadonlyArray<{ role?: string; content?: string; tool_calls?: ReadonlyArray<{ id: string; function: { name: string; arguments: string } }>; tool_call_id?: string }>): OTelChatMessage[] {
	return messages.map(msg => {
		const parts: OTelMessagePart[] = [];

		// OpenAI tool-result message (role=tool): map to tool_call_response
		if (msg.role === 'tool' && msg.tool_call_id) {
			parts.push({ type: 'tool_call_response', id: msg.tool_call_id, response: msg.content ?? '' });
			return { role: msg.role, parts };
		}

		if (msg.content) {
			parts.push({ type: 'text', content: msg.content });
		}

		if (msg.tool_calls) {
			for (const tc of msg.tool_calls) {
				let args: unknown;
				try { args = JSON.parse(tc.function.arguments); } catch { args = tc.function.arguments; }
				parts.push({
					type: 'tool_call',
					id: tc.id,
					name: tc.function.name,
					arguments: args,
				});
			}
		}

		return { role: msg.role, parts };
	});
}

/**
 * Convert model response choices to OTel output message format.
 */
export function toOutputMessages(choices: ReadonlyArray<{
	message?: { role?: string; content?: string; tool_calls?: ReadonlyArray<{ id: string; function: { name: string; arguments: string } }> };
	finish_reason?: string;
}>): OTelOutputMessage[] {
	return choices.map(choice => {
		const parts: OTelMessagePart[] = [];
		const msg = choice.message;

		if (msg?.content) {
			parts.push({ type: 'text', content: msg.content });
		}

		if (msg?.tool_calls) {
			for (const tc of msg.tool_calls) {
				let args: unknown;
				try { args = JSON.parse(tc.function.arguments); } catch { args = tc.function.arguments; }
				parts.push({
					type: 'tool_call',
					id: tc.id,
					name: tc.function.name,
					arguments: args,
				});
			}
		}

		return {
			role: msg?.role ?? 'assistant',
			parts,
			finish_reason: choice.finish_reason,
		};
	});
}

/**
 * Convert system message text to OTel system instruction format.
 * Accepts a single string or an array (one block per entry). Returns
 * `undefined` when no non-empty text is available.
 */
export function toSystemInstructions(systemMessage: string | ReadonlyArray<string> | undefined): OTelSystemInstruction | undefined {
	if (systemMessage === undefined) {
		return undefined;
	}
	const inputs = Array.isArray(systemMessage) ? systemMessage : [systemMessage as string];
	const blocks = inputs
		.filter(s => typeof s === 'string' && s.length > 0)
		.map(content => ({ type: 'text' as const, content }));
	return blocks.length > 0 ? blocks : undefined;
}

/**
 * Extract plain text from a message-content value (string or array of
 * content blocks). Returns an empty string when no text can be extracted.
 */
export function extractTextFromContent(content: unknown): string {
	if (typeof content === 'string') {
		return content;
	}
	if (Array.isArray(content)) {
		return content
			.map(block => {
				if (typeof block === 'string') { return block; }
				if (block && typeof block === 'object') {
					const b = block as { text?: unknown; content?: unknown };
					if (typeof b.text === 'string') { return b.text; }
					if (typeof b.content === 'string') { return b.content; }
				}
				return '';
			})
			.filter(s => s.length > 0)
			.join('\n');
	}
	return '';
}

/**
 * Collect system-instruction text from a provider request body. Uses
 * messages-level `system` entries when present, otherwise falls back to
 * top-level `system` or `instructions`.
 */
export function collectSystemTextsFromRequestBody(requestBody: {
	readonly messages?: ReadonlyArray<{ role?: unknown; content?: unknown }>;
	readonly input?: ReadonlyArray<{ role?: unknown; content?: unknown }>;
	readonly system?: unknown;
	readonly instructions?: unknown;
}): string[] {
	const systemTexts: string[] = [];
	const capiMessages = requestBody.messages ?? requestBody.input;
	if (capiMessages) {
		for (const m of capiMessages) {
			if (m.role === 'system') {
				const t = extractTextFromContent(m.content);
				if (t) { systemTexts.push(t); }
			}
		}
	}
	if (systemTexts.length === 0) {
		const topLevelSystem = extractTextFromContent(requestBody.system ?? requestBody.instructions);
		if (topLevelSystem) { systemTexts.push(topLevelSystem); }
	}
	return systemTexts;
}

/**
 * Normalize provider-specific messages (Anthropic content blocks, OpenAI
 * Chat Completions, OpenAI Responses API) to OTel GenAI semantic
 * convention format.
 *
 * Handles:
 * - Anthropic content block arrays: tool_use → tool_call, tool_result → tool_call_response, thinking → reasoning
 * - OpenAI Chat Completions: tool_calls, role=tool with tool_call_id
 * - OpenAI Responses API items: `type: 'message'` with `input_text` /
 *   `output_text` content blocks; `type: 'function_call'` →
 *   role=assistant + tool_call; `type: 'function_call_output'` →
 *   role=tool + tool_call_response; `type: 'tool_search_output'` →
 *   role=tool_search + tool_search_output; `type: 'reasoning'` →
 *   role=assistant + reasoning part
 * - Plain string content
 */
export function normalizeProviderMessages(messages: ReadonlyArray<Record<string, unknown>>, options?: NormalizeProviderMessagesOptions): OTelChatMessage[] {
	return messages.map(msg => {
		// OpenAI Responses API items use `type` rather than (or in addition
		// to) `role` to distinguish item kinds. Handle them up front so we
		// always emit a populated `role` and `parts` array — otherwise the
		// downstream cache-explorer diff sees `{role: undefined, parts: []}`
		// for every item and reports the prompt as empty/unknown.
		const itemType = msg.type as string | undefined;
		switch (itemType) {
			case 'function_call':
				return normalizeResponsesFunctionCall(msg);
			case 'function_call_output':
				return normalizeResponsesFunctionCallOutput(msg, options?.resolveAttachment);
			case 'tool_search_output':
				return normalizeResponsesToolSearchOutput(msg);
			case 'reasoning':
				return normalizeResponsesReasoning(msg);
			// `type: 'message'` falls through — its `role` and `content` are
			// handled by the regular branch below, with the addition that
			// content blocks may be `input_text` / `output_text`.
		}

		const role = msg.role as string | undefined;
		const parts: OTelMessagePart[] = [];
		const content = msg.content;

		// OpenAI tool-result message
		if (role === 'tool' && typeof msg.tool_call_id === 'string') {
			parts.push({ type: 'tool_call_response', id: msg.tool_call_id, response: normalizeToolResultContent(content ?? '', options?.resolveAttachment) });
			return { role, parts };
		}

		if (typeof content === 'string' && content.length > 0) {
			parts.push({ type: 'text', content });
		} else if (Array.isArray(content)) {
			// Anthropic content block array — and also OpenAI Responses API
			// `message` content arrays, which use `input_text` / `output_text`
			// instead of `text` for the block type.
			for (const block of content) {
				if (!block || typeof block !== 'object') { continue; }
				const b = block as Record<string, unknown>;
				switch (b.type) {
					case 'text':
					case 'input_text':
					case 'output_text':
						if (typeof b.text === 'string') {
							parts.push({ type: 'text', content: b.text });
						}
						break;
					case 'tool_use':
						parts.push({
							type: 'tool_call',
							id: String(b.id ?? ''),
							name: String(b.name ?? ''),
							arguments: b.input,
						});
						break;
					case 'tool_result':
						parts.push({
							type: 'tool_call_response',
							id: String(b.tool_use_id ?? ''),
							response: normalizeToolResultContent(b.content ?? '', options?.resolveAttachment),
						});
						break;
					case 'thinking':
						if (typeof b.thinking === 'string') {
							parts.push({ type: 'reasoning', content: b.thinking });
						}
						break;
					case 'image':
					case 'document':
					case 'image_url':
					case 'input_image':
					case 'input_file': {
						const part = normalizeAttachmentBlock(b, options?.resolveAttachment);
						if (part) {
							parts.push(part);
							break;
						}
						// Unrecognised shape — fall through to the text fallback.
						parts.push({ type: 'text', content: JSON.stringify(b) });
						break;
					}
					default:
						// Unknown block type — include as text fallback
						parts.push({ type: 'text', content: JSON.stringify(b) });
						break;
				}
			}
		}

		// OpenAI tool_calls
		const toolCalls = msg.tool_calls;
		if (Array.isArray(toolCalls)) {
			for (const tc of toolCalls) {
				if (!tc || typeof tc !== 'object') { continue; }
				const call = tc as Record<string, unknown>;
				const fn = call.function as Record<string, unknown> | undefined;
				if (fn) {
					let args: unknown;
					try { args = typeof fn.arguments === 'string' ? JSON.parse(fn.arguments) : fn.arguments; } catch { args = fn.arguments; }
					parts.push({
						type: 'tool_call',
						id: String(call.id ?? ''),
						name: String(fn.name ?? ''),
						arguments: args,
					});
				}
			}
		}

		return { role, parts };
	});
}

/**
 * Normalize an OpenAI Responses API `function_call` item into a synthetic
 * assistant message carrying a single `tool_call` part. The Responses API
 * separates these from the conversation message stream; we re-attach them
 * to a synthetic role so downstream consumers (cache explorer, telemetry
 * viewers) can treat them uniformly with Chat Completions tool calls.
 */
const DATA_URL_RE = /^data:([^;,]+)?(?:;[^,]*)?;base64,(.*)$/s;

type AttachmentResolver = (uri: string) => OTelAttachmentMetadata | undefined;

const ATTACHMENT_BLOCK_TYPES: ReadonlySet<unknown> = new Set(['image', 'document', 'image_url', 'input_image', 'input_file']);

function isAttachmentBlock(block: unknown): block is Record<string, unknown> {
	return !!block && typeof block === 'object' && ATTACHMENT_BLOCK_TYPES.has((block as Record<string, unknown>).type);
}

/**
 * Tool results carry attachments too: Anthropic `tool_result.content` and
 * Responses `function_call_output.output` are block arrays that may hold an
 * image the tool produced. Each attachment block becomes the same typed part
 * a top-level block would; every other block passes through unchanged so the
 * `tool_call_response` keeps its shape for consumers that already parse it.
 */
function normalizeToolResultContent(content: unknown, resolveAttachment?: AttachmentResolver): unknown {
	return Array.isArray(content) ? normalizeToolResultBlocks(content, resolveAttachment).blocks : content;
}

/** The array form of {@link normalizeToolResultContent}, also reporting how many blocks became typed parts. */
function normalizeToolResultBlocks(content: readonly unknown[], resolveAttachment?: AttachmentResolver): { blocks: unknown[]; typed: number } {
	let typed = 0;
	const blocks = content.map(block => {
		const part = isAttachmentBlock(block) ? normalizeAttachmentBlock(block, resolveAttachment) : undefined;
		if (part) {
			typed++;
			return part;
		}
		return block;
	});
	return { blocks, typed };
}

/**
 * Converts a provider-specific binary attachment block into a typed OTel part.
 *
 * Handled shapes:
 * - Anthropic `image` / `document` with `source: { type: 'base64' | 'url', ... }`
 * - Chat Completions `image_url` (`image_url` is a string or `{ url, detail, media_type }`)
 * - Responses API `input_image` (`image_url` string, `detail`, `file_id`) and
 *   `input_file` (`file_data` data URL, `file_id`, `filename`)
 *
 * Inline data yields a `blob` part with the size, dimensions (images) and a
 * token estimate derived from the bytes. A URI reference yields a `uri` part;
 * the bytes never cross this boundary, so the same fields come from
 * `resolveAttachment` when the caller knows them (e.g. from the upload).
 * Returns `undefined` when the block does not have a usable source.
 */
function normalizeAttachmentBlock(b: Record<string, unknown>, resolveAttachment?: AttachmentResolver): OTelMessagePart | undefined {
	switch (b.type) {
		case 'image':
		case 'document': {
			const modality: OTelAttachmentModality = b.type;
			const source = asRecord(b.source);
			const mimeType = nonEmptyString(source?.media_type);
			const data = nonEmptyString(source?.data);
			if (source?.type === 'base64' && data !== undefined) {
				return blobPart(modality, data, mimeType, undefined);
			}
			const url = nonEmptyString(source?.url);
			if (url !== undefined) {
				return referencedPart(modality, url, mimeType, undefined, resolveAttachment);
			}
			const fileId = nonEmptyString(source?.file_id);
			if (fileId !== undefined) {
				return filePart(modality, fileId, mimeType);
			}
			return undefined;
		}
		case 'image_url': {
			const imageUrl = typeof b.image_url === 'string' ? { url: b.image_url } : asRecord(b.image_url);
			const url = nonEmptyString(imageUrl?.url);
			if (url === undefined) {
				return undefined;
			}
			// CAPI extension: `media_type` rides on `image_url` for uploaded attachments.
			return referencedPart('image', url, nonEmptyString(imageUrl?.media_type), asDetail(imageUrl?.detail), resolveAttachment);
		}
		case 'input_image': {
			const url = nonEmptyString(b.image_url);
			if (url !== undefined) {
				return referencedPart('image', url, undefined, asDetail(b.detail), resolveAttachment);
			}
			const fileId = nonEmptyString(b.file_id);
			if (fileId !== undefined) {
				return filePart('image', fileId, undefined);
			}
			return undefined;
		}
		case 'input_file': {
			const fileData = nonEmptyString(b.file_data);
			if (fileData !== undefined) {
				return referencedPart('document', fileData, undefined, undefined, resolveAttachment);
			}
			const fileId = nonEmptyString(b.file_id);
			if (fileId !== undefined) {
				return filePart('document', fileId, undefined);
			}
			return undefined;
		}
		default:
			return undefined;
	}
}

/**
 * Routes a URL to a `blob` part when it is a data URL, else to a `uri` part.
 * A data URL with no payload is not a usable source and yields `undefined`.
 */
function referencedPart(modality: OTelAttachmentModality, url: string, mimeType: string | undefined, detail: ImageDetail, resolveAttachment?: AttachmentResolver): OTelMessagePart | undefined {
	const dataUrl = DATA_URL_RE.exec(url);
	if (dataUrl) {
		const payload = nonEmptyString(dataUrl[2]);
		return payload === undefined ? undefined : blobPart(modality, payload, mimeType ?? nonEmptyString(dataUrl[1]), detail);
	}
	const known = resolveAttachment?.(url);
	// The resolver's estimate was made without knowing how this request asks for
	// the image; when it has the dimensions, price them at this block's detail.
	const estimatedTokens = modality === 'image' && known?.width !== undefined && known?.height !== undefined
		? calculateImageTokenCostForDimensions(known.width, known.height, detail)
		: known?.estimatedTokens;
	return {
		type: 'uri',
		modality,
		mime_type: mimeType ?? known?.mimeType ?? null,
		uri: url,
		...definedFields({
			size_bytes: known?.sizeBytes,
			width: known?.width,
			height: known?.height,
			estimated_tokens: estimatedTokens,
		}),
	};
}

function blobPart(modality: OTelAttachmentModality, base64Data: string, mimeType: string | undefined, detail: ImageDetail): OTelMessagePart {
	let width: number | undefined;
	let height: number | undefined;
	let estimatedTokens: number | undefined;
	if (modality === 'image') {
		try {
			({ width, height } = getImageDimensions(`data:${mimeType ?? 'image/png'};base64,${base64Data}`));
			estimatedTokens = calculateImageTokenCostForDimensions(width, height, detail);
		} catch {
			// Unreadable header: report the bytes only.
		}
	} else {
		estimatedTokens = estimateDocumentTokenCost(base64Data);
	}
	return {
		type: 'blob',
		modality,
		mime_type: mimeType ?? null,
		content: base64Data,
		size_bytes: base64ByteLength(base64Data),
		...definedFields({ width, height, estimated_tokens: estimatedTokens }),
	};
}

function filePart(modality: OTelAttachmentModality, fileId: string, mimeType: string | undefined): OTelMessagePart {
	return { type: 'file', modality, mime_type: mimeType ?? null, file_id: fileId };
}

function base64ByteLength(base64Data: string): number {
	const trimmed = base64Data.replace(/\s+/g, '');
	const padding = trimmed.endsWith('==') ? 2 : trimmed.endsWith('=') ? 1 : 0;
	return Math.max(0, Math.floor((trimmed.length * 3) / 4) - padding);
}

function definedFields<T extends Record<string, number | undefined>>(fields: T): Partial<T> {
	const out: Partial<T> = {};
	for (const key of Object.keys(fields) as Array<keyof T>) {
		if (fields[key] !== undefined) {
			out[key] = fields[key];
		}
	}
	return out;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
	return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function asDetail(value: unknown): ImageDetail {
	return value === 'low' || value === 'high' || value === 'auto' ? value : undefined;
}

function normalizeResponsesFunctionCall(msg: Record<string, unknown>): OTelChatMessage {
	let args: unknown = msg.arguments;
	if (typeof args === 'string') {
		try { args = JSON.parse(args); } catch { /* keep raw string */ }
	}
	return {
		role: 'assistant',
		parts: [{
			type: 'tool_call',
			id: String(msg.call_id ?? msg.id ?? ''),
			name: String(msg.name ?? ''),
			arguments: args,
		}],
	};
}

/**
 * Normalize an OpenAI Responses API `function_call_output` item into a
 * synthetic tool message carrying a `tool_call_response` part. Mirrors how
 * Chat Completions surfaces tool results via `role: 'tool'` messages.
 */
function normalizeResponsesFunctionCallOutput(msg: Record<string, unknown>, resolveAttachment?: AttachmentResolver): OTelChatMessage {
	const output = msg.output;
	let response: unknown;
	if (typeof output === 'string') {
		response = output;
	} else if (Array.isArray(output)) {
		// Output may be an array of `{ type: 'output_text', text }` blocks. When a
		// tool returned an attachment (`input_image`, `input_file`) the blocks are
		// kept apart so the attachment gets its typed part; otherwise the output
		// stays one string as before.
		const { blocks, typed } = normalizeToolResultBlocks(output, resolveAttachment);
		response = typed > 0
			? blocks
			: output
				.map(b => (b && typeof b === 'object' && typeof (b as Record<string, unknown>).text === 'string') ? (b as Record<string, unknown>).text as string : JSON.stringify(b))
				.join('');
	} else {
		response = output ?? '';
	}
	return {
		role: 'tool',
		parts: [{
			type: 'tool_call_response',
			id: String(msg.call_id ?? msg.id ?? ''),
			response,
		}],
	};
}

/**
 * Normalize an OpenAI Responses API `tool_search_output` item. This is a
 * client-executed deferred-tool continuation: the request body only carries
 * the newly resolved tool definitions, while the provider reconstructs the
 * prior conversation from `previous_response_id`. Keep it distinct from a
 * normal tool result so the Cache Explorer can label this request shape.
 */
function normalizeResponsesToolSearchOutput(msg: Record<string, unknown>): OTelChatMessage {
	// Preserve the absent-vs-empty distinction: a request that omits `tools`
	// is byte-different from one that sends `tools: []`, and that distinction
	// can affect cache-key matching downstream. Build the part conditionally
	// so the `tools` key is fully absent when the source request omits it.
	const hasTools = Object.prototype.hasOwnProperty.call(msg, 'tools') && msg.tools !== undefined;
	const part: { type: 'tool_search_output'; id: string; tools?: unknown; status?: string } = {
		type: 'tool_search_output',
		id: String(msg.call_id ?? msg.id ?? ''),
		status: typeof msg.status === 'string' ? msg.status : undefined,
	};
	if (hasTools) {
		part.tools = msg.tools;
	}
	return { role: 'tool_search', parts: [part] };
}

/**
 * Normalize an OpenAI Responses API `reasoning` item. The Responses API
 * doesn't expose plaintext reasoning unless `reasoning.summary` is enabled;
 * when only `encrypted_content` is present, we still emit a non-empty part
 * carrying the encrypted blob so the cache-explorer prefix diff includes
 * its byte length (which IS part of the cache key).
 */
function normalizeResponsesReasoning(msg: Record<string, unknown>): OTelChatMessage {
	const parts: OTelMessagePart[] = [];
	const summary = msg.summary;
	if (Array.isArray(summary)) {
		for (const s of summary) {
			if (s && typeof s === 'object' && typeof (s as Record<string, unknown>).text === 'string') {
				parts.push({ type: 'reasoning', content: (s as Record<string, unknown>).text as string });
			}
		}
	} else if (typeof summary === 'string') {
		parts.push({ type: 'reasoning', content: summary });
	}
	if (typeof msg.encrypted_content === 'string') {
		parts.push({ type: 'reasoning', content: msg.encrypted_content });
	}
	return { role: 'assistant', parts };
}

/**
 * Convert tool definitions to OTel `gen_ai.tool.definitions` format.
 *
 * Accepts the variants emitted by the different request bodies/providers:
 * - OpenAI Chat Completions: `{ type: 'function', function: { name, description, parameters } }`
 * - OpenAI Responses API:    `{ type: 'function', name, description, parameters }`
 * - Anthropic Messages API:  `{ name, description, input_schema }`
 * - VS Code tool info:       `{ name, description, inputSchema }`
 *
 * Tools without a name (e.g. OpenAI client-side `tool_search`) are skipped
 * because OTel `gen_ai.tool.definitions` requires a name per entry.
 *
 * @see https://opentelemetry.io/docs/specs/semconv/registry/attributes/gen-ai/#gen-ai-tool-definitions
 */
export function toToolDefinitions(tools: ReadonlyArray<{
	type?: string;
	name?: string;
	description?: string;
	parameters?: unknown;
	input_schema?: unknown;
	inputSchema?: unknown;
	function?: { name?: string; description?: string; parameters?: unknown };
}> | undefined): OTelToolDefinition[] | undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}
	const out: OTelToolDefinition[] = [];
	for (const t of tools) {
		const name = t.function?.name ?? t.name;
		if (!name) {
			continue;
		}
		const description = t.function?.description ?? t.description;
		const parameters = t.function?.parameters ?? t.parameters ?? t.input_schema ?? t.inputSchema;
		out.push({
			type: 'function',
			name,
			description,
			parameters,
		});
	}
	return out.length > 0 ? out : undefined;
}

// Tool-definition JSON is multi-MB and reused across many telemetry/OTel sites
// per LLM round, often byte-identical across consecutive agent-loop rounds.
// Intern by array reference (WeakMap) plus a single-slot last-string cache so
// content-equal serializations from distinct refs collapse to one instance.

const toolDefsJsonByRef = new WeakMap<object, string>();
const toolsRawJsonByRef = new WeakMap<object, string>();
let lastToolDefsJson: string | undefined;
let lastToolsRawJson: string | undefined;

function internToolDefsString(s: string): string {
	if (lastToolDefsJson !== undefined && lastToolDefsJson === s) {
		return lastToolDefsJson;
	}
	lastToolDefsJson = s;
	return s;
}

function internToolsRawString(s: string): string {
	if (lastToolsRawJson !== undefined && lastToolsRawJson === s) {
		return lastToolsRawJson;
	}
	lastToolsRawJson = s;
	return s;
}

/**
 * Return the OTel-normalized JSON string for a tools array, memoized so all
 * telemetry/span sites within (and across consecutive identical rounds of) an
 * LLM call share a single string instance. Returns `undefined` if no
 * normalized tools would be emitted.
 */
export function stringifyToolDefinitionsForOTel(tools: Parameters<typeof toToolDefinitions>[0]): string | undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}
	const cached = toolDefsJsonByRef.get(tools);
	if (cached !== undefined) {
		return cached;
	}
	const defs = toToolDefinitions(tools);
	if (!defs) {
		return undefined;
	}
	const s = internToolDefsString(JSON.stringify(defs));
	toolDefsJsonByRef.set(tools, s);
	return s;
}

/**
 * Return `JSON.stringify(tools)` memoized by array reference, with a
 * single-slot content intern so consecutive rounds producing identical content
 * share one string instance. Used for telemetry sinks that consume the raw
 * tools shape rather than the OTel-normalized one. Mirrors `JSON.stringify`
 * exactly: returns `'[]'` for an empty array and `undefined` only when
 * `tools` itself is `undefined`.
 */
export function stringifyToolsRawForTelemetry(tools: ReadonlyArray<unknown> | undefined): string | undefined {
	if (!tools) {
		return undefined;
	}
	const cached = toolsRawJsonByRef.get(tools);
	if (cached !== undefined) {
		return cached;
	}
	const s = internToolsRawString(JSON.stringify(tools));
	toolsRawJsonByRef.set(tools, s);
	return s;
}
