/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// Anthropic Messages API, native format.

import { ModelRouterError, providerMessage, type ModelErrorKind } from '../errors.ts';
import { basePath, getJson, joinPath, jsonPost, parseBaseUrl, sendStreaming } from '../http.ts';
import { parseJson, parseToolArguments, readSse } from '../sse.ts';
import { partsOf, type Adapter, type ChatRequest, type FetchLike, type ModelConfig, type ModelInfo, type StopReason, type StreamEvent } from '../types.ts';

export const ANTHROPIC_VERSION = '2023-06-01';
/** The Messages API requires max_tokens; used when neither the request nor the model sets one. */
export const DEFAULT_MAX_TOKENS = 4096;

function apiUrl(base: URL, resource: 'messages' | 'models'): URL {
	const path = basePath(base);
	if (path.endsWith('/messages')) {
		if (resource === 'messages') {
			return base;
		}
		const url = new URL(base.toString());
		url.pathname = path.slice(0, -'/messages'.length) + '/models';
		return url;
	}
	return joinPath(base, path.endsWith('/v1') ? `/${resource}` : `/v1/${resource}`);
}

export const messagesUrl = (base: URL) => apiUrl(base, 'messages');
export const modelsUrl = (base: URL) => apiUrl(base, 'models');

function headersFor(config: ModelConfig): Record<string, string> {
	return {
		...(config.apiKey ? { 'x-api-key': config.apiKey } : {}),
		'anthropic-version': ANTHROPIC_VERSION,
		...config.headers,
	};
}

export function buildRequestBody(config: ModelConfig, request: ChatRequest): Record<string, unknown> {
	const messages = request.messages.map(message => {
		const parts = partsOf(message);
		const blocks: Record<string, unknown>[] = [];
		// Tool results must come first in the user turn that answers a tool call.
		for (const part of parts) {
			if (part.type === 'tool_result') {
				blocks.push({ type: 'tool_result', tool_use_id: part.toolCallId, content: part.content, ...(part.isError ? { is_error: true } : {}) });
			}
		}
		for (const part of parts) {
			if (part.type === 'text' && part.text) {
				blocks.push({ type: 'text', text: part.text });
			} else if (part.type === 'tool_call') {
				blocks.push({ type: 'tool_use', id: part.id, name: part.name, input: part.arguments });
			}
		}
		return { role: message.role, content: blocks };
	});

	const body: Record<string, unknown> = {
		model: config.model,
		max_tokens: request.maxTokens ?? config.maxOutputTokens ?? DEFAULT_MAX_TOKENS,
		messages,
		stream: true,
	};
	if (request.system) {
		body.system = request.system;
	}
	if (request.temperature !== undefined) {
		body.temperature = request.temperature;
	}
	if (request.tools?.length) {
		body.tools = request.tools.map(tool => ({ name: tool.name, description: tool.description, input_schema: tool.inputSchema }));
	}
	return body;
}

function mapStopReason(reason: string): StopReason {
	switch (reason) {
		case 'end_turn':
		case 'stop_sequence': return 'end';
		case 'tool_use': return 'tool_use';
		case 'max_tokens': return 'max_tokens';
		default: return 'other';
	}
}

function kindForErrorType(type: unknown): ModelErrorKind {
	switch (type) {
		case 'authentication_error':
		case 'permission_error': return 'auth';
		case 'not_found_error': return 'not_found';
		case 'rate_limit_error': return 'rate_limit';
		case 'invalid_request_error': return 'bad_request';
		default: return 'server';
	}
}

interface PendingToolUse {
	id: string;
	name: string;
	json: string;
}

async function* stream(config: ModelConfig, request: ChatRequest, fetchFn: FetchLike): AsyncGenerator<StreamEvent> {
	const base = parseBaseUrl(config.baseUrl);
	const body = await sendStreaming(fetchFn, messagesUrl(base), jsonPost(headersFor(config), buildRequestBody(config, request), request.signal));

	const toolUses = new Map<number, PendingToolUse>();
	let stopReason: StopReason = 'end';
	let inputTokens: number | undefined;
	let outputTokens: number | undefined;

	for await (const event of readSse(body)) {
		const data = parseJson(event.data, 'event');
		const type = (data.type as string | undefined) ?? event.event;
		const index = typeof data.index === 'number' ? data.index : 0;

		switch (type) {
			case 'message_start': {
				const usage = (data.message as Record<string, unknown> | undefined)?.usage as Record<string, number> | undefined;
				inputTokens = usage?.input_tokens;
				outputTokens = usage?.output_tokens;
				break;
			}
			case 'content_block_start': {
				const block = (data.content_block ?? {}) as Record<string, unknown>;
				if (block.type === 'tool_use') {
					toolUses.set(index, { id: String(block.id), name: String(block.name), json: '' });
				} else if (block.type === 'text' && typeof block.text === 'string' && block.text) {
					yield { type: 'text', text: block.text };
				}
				break;
			}
			case 'content_block_delta': {
				const delta = (data.delta ?? {}) as Record<string, unknown>;
				if (delta.type === 'text_delta' && typeof delta.text === 'string') {
					yield { type: 'text', text: delta.text };
				} else if (delta.type === 'input_json_delta' && typeof delta.partial_json === 'string') {
					const toolUse = toolUses.get(index);
					if (toolUse) {
						toolUse.json += delta.partial_json;
					}
				}
				// thinking_delta and signature_delta are not surfaced yet.
				break;
			}
			case 'content_block_stop': {
				const toolUse = toolUses.get(index);
				if (toolUse) {
					toolUses.delete(index);
					yield { type: 'tool_call', id: toolUse.id, name: toolUse.name, ...parseToolArguments(toolUse.json, toolUse.name) };
				}
				break;
			}
			case 'message_delta': {
				const delta = (data.delta ?? {}) as Record<string, unknown>;
				if (typeof delta.stop_reason === 'string') {
					stopReason = mapStopReason(delta.stop_reason);
				}
				const usage = data.usage as Record<string, number> | undefined;
				if (usage?.output_tokens !== undefined) {
					outputTokens = usage.output_tokens;
				}
				break;
			}
			case 'error': {
				const error = (data.error ?? {}) as Record<string, unknown>;
				throw new ModelRouterError(kindForErrorType(error.type), providerMessage(data) ?? 'The provider reported an error mid-stream.');
			}
			// message_stop and ping need no handling.
		}
	}

	yield { type: 'done', stopReason, usage: { inputTokens, outputTokens } };
}

async function listModels(config: ModelConfig, fetchFn: FetchLike): Promise<ModelInfo[]> {
	const base = parseBaseUrl(config.baseUrl);
	const url = modelsUrl(base);
	url.searchParams.set('limit', '1000');
	const json = await getJson(fetchFn, url, headersFor(config));
	const data = (json.data as Record<string, unknown>[] | undefined) ?? [];
	return data
		.filter(entry => typeof entry.id === 'string')
		.map(entry => ({ id: entry.id as string, displayName: typeof entry.display_name === 'string' ? entry.display_name : undefined }));
}

export const anthropicAdapter: Adapter = { stream, listModels };
