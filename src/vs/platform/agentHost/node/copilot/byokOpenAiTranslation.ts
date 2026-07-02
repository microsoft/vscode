/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import {
	IByokLmChatMessage,
	IByokLmChatRequest,
	IByokLmChatResult,
	IByokLmTool,
	IByokLmToolCall,
} from '../../common/agentHostByokLm.js';

/**
 * Minimal subset of the OpenAI Chat Completions wire format the Copilot SDK
 * runtime emits for a `type: 'openai'`, `wireApi: 'completions'` provider
 * (verified against the runtime's `chat_completion_transport.rs`, which POSTs
 * to `{baseUrl}/chat/completions`). Only the fields this proxy understands are
 * modeled; unknown fields are ignored.
 */

interface IOpenAiTextContentPart {
	readonly type: 'text';
	readonly text: string;
}

type IOpenAiContentPart = IOpenAiTextContentPart | { readonly type: string;[k: string]: unknown };

interface IOpenAiToolCall {
	readonly id?: string;
	readonly type?: string;
	readonly function?: {
		readonly name?: string;
		readonly arguments?: string;
	};
}

interface IOpenAiRequestMessage {
	readonly role?: string;
	readonly content?: string | IOpenAiContentPart[] | null;
	readonly tool_calls?: IOpenAiToolCall[];
	readonly tool_call_id?: string;
}

interface IOpenAiToolDefinition {
	readonly type?: string;
	readonly function?: {
		readonly name?: string;
		readonly description?: string;
		readonly parameters?: object;
	};
}

export interface IOpenAiChatRequest {
	readonly model?: string;
	readonly messages?: IOpenAiRequestMessage[];
	readonly tools?: IOpenAiToolDefinition[];
	readonly stream?: boolean;
	readonly temperature?: number;
	readonly top_p?: number;
	readonly max_tokens?: number;
	readonly [k: string]: unknown;
}

/** Thrown when the inbound body cannot be mapped to a bridge request. */
export class OpenAiTranslationError extends Error { }

function flattenContent(content: string | IOpenAiContentPart[] | null | undefined): string {
	if (typeof content === 'string') {
		return content;
	}
	if (Array.isArray(content)) {
		let out = '';
		for (const part of content) {
			if (part && part.type === 'text' && typeof (part as IOpenAiTextContentPart).text === 'string') {
				out += (part as IOpenAiTextContentPart).text;
			}
		}
		return out;
	}
	return '';
}

function toBridgeRole(role: string | undefined): IByokLmChatMessage['role'] {
	switch (role) {
		case 'system':
		case 'developer':
			return 'system';
		case 'assistant':
			return 'assistant';
		case 'tool':
		case 'function':
			return 'tool';
		case 'user':
		default:
			return 'user';
	}
}

function toBridgeToolCalls(toolCalls: IOpenAiToolCall[] | undefined): IByokLmToolCall[] | undefined {
	if (!toolCalls || toolCalls.length === 0) {
		return undefined;
	}
	const mapped: IByokLmToolCall[] = [];
	for (let i = 0; i < toolCalls.length; i++) {
		const call = toolCalls[i];
		const name = call.function?.name;
		if (!name) {
			// A tool call without a function name is malformed: reject at the
			// boundary (→ 400) rather than forwarding an invalid `tool_use` part
			// that would fail later, deeper in the renderer.
			throw new OpenAiTranslationError(`tool_calls[${i}].function.name is required`);
		}
		mapped.push({
			id: call.id ?? `call_${i}`,
			name,
			argumentsJson: call.function?.arguments ?? '{}',
		});
	}
	return mapped;
}

function toBridgeTools(tools: IOpenAiToolDefinition[] | undefined): IByokLmTool[] | undefined {
	if (!tools || tools.length === 0) {
		return undefined;
	}
	const mapped: IByokLmTool[] = [];
	for (const tool of tools) {
		const fn = tool.function;
		if (!fn?.name) {
			continue;
		}
		mapped.push({
			name: fn.name,
			description: fn.description,
			parametersSchema: fn.parameters,
		});
	}
	return mapped.length ? mapped : undefined;
}

/**
 * Convert a parsed OpenAI Chat Completions request into the serializable
 * bridge request. `vendor` is the synthesized provider name the runtime used
 * (it is not present in the OpenAI body); `model` becomes the provider-local
 * wire model id resolved on the renderer.
 */
export function openAiRequestToBridge(vendor: string, body: IOpenAiChatRequest): IByokLmChatRequest {
	const model = typeof body.model === 'string' ? body.model : '';
	if (!model) {
		throw new OpenAiTranslationError('Request is missing the "model" field');
	}
	const sourceMessages = Array.isArray(body.messages) ? body.messages : [];
	const messages: IByokLmChatMessage[] = sourceMessages.map(message => ({
		role: toBridgeRole(message.role),
		content: flattenContent(message.content),
		toolCalls: toBridgeToolCalls(message.tool_calls),
		toolCallId: message.tool_call_id,
	}));

	const modelOptions: Record<string, unknown> = {};
	if (typeof body.temperature === 'number') {
		modelOptions.temperature = body.temperature;
	}
	if (typeof body.top_p === 'number') {
		modelOptions.top_p = body.top_p;
	}
	if (typeof body.max_tokens === 'number') {
		modelOptions.max_tokens = body.max_tokens;
	}

	return {
		vendor,
		modelId: model,
		messages,
		tools: toBridgeTools(body.tools),
		modelOptions: Object.keys(modelOptions).length ? modelOptions : undefined,
	};
}

let chunkCounter = 0;

function nextCompletionId(): string {
	chunkCounter = (chunkCounter + 1) % Number.MAX_SAFE_INTEGER;
	return `chatcmpl-byok-${Date.now().toString(36)}-${chunkCounter.toString(36)}`;
}

/** Serialize a single SSE `data:` frame. */
function sseFrame(payload: unknown): string {
	return `data: ${JSON.stringify(payload)}\n\n`;
}

/**
 * Encode a buffered {@link IByokLmChatResult} as a sequence of OpenAI
 * `chat.completion.chunk` SSE frames terminated by `data: [DONE]`.
 *
 * The whole completion is emitted in one content delta (Stage 1 is
 * non-streaming end-to-end); the runtime's SSE parser accepts this shape.
 */
export function bridgeResultToSseFrames(result: IByokLmChatResult, model: string): string[] {
	const id = nextCompletionId();
	const created = Math.floor(Date.now() / 1000);
	const base = { id, object: 'chat.completion.chunk', created, model };
	const frames: string[] = [];

	// Role delta first, matching the OpenAI streaming contract.
	frames.push(sseFrame({ ...base, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] }));

	if (result.content) {
		frames.push(sseFrame({ ...base, choices: [{ index: 0, delta: { content: result.content }, finish_reason: null }] }));
	}

	let finishReason: 'stop' | 'tool_calls' = 'stop';
	if (result.toolCalls && result.toolCalls.length > 0) {
		finishReason = 'tool_calls';
		const toolCallsDelta = result.toolCalls.map((call, index) => ({
			index,
			id: call.id,
			type: 'function',
			function: { name: call.name, arguments: call.argumentsJson },
		}));
		frames.push(sseFrame({ ...base, choices: [{ index: 0, delta: { tool_calls: toolCallsDelta }, finish_reason: null }] }));
	}

	const finalChunk: Record<string, unknown> = { ...base, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] };
	if (result.usage) {
		finalChunk.usage = {
			prompt_tokens: result.usage.promptTokens ?? 0,
			completion_tokens: result.usage.completionTokens ?? 0,
			total_tokens: (result.usage.promptTokens ?? 0) + (result.usage.completionTokens ?? 0),
		};
	}
	frames.push(sseFrame(finalChunk));
	frames.push('data: [DONE]\n\n');
	return frames;
}

/** Build an OpenAI-style error envelope body. */
export function openAiErrorBody(message: string, type = 'api_error'): string {
	return JSON.stringify({ error: { message, type } });
}
