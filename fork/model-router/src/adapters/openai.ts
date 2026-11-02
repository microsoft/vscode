/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// OpenAI-compatible chat completions: OpenAI, OpenRouter, Groq, Together, DeepSeek, Mistral,
// Ollama, LM Studio, vLLM and most gateways speak this format.

import { ModelRouterError, providerMessage } from '../errors.ts';
import { basePath, getJson, joinPath, jsonPost, parseBaseUrl, sendStreaming } from '../http.ts';
import { parseJson, parseToolArguments, readSse } from '../sse.ts';
import { partsOf, textOf, type Adapter, type ChatRequest, type FetchLike, type ModelConfig, type ModelInfo, type StopReason, type StreamEvent, type Usage } from '../types.ts';

export function chatCompletionsUrl(base: URL): URL {
	return basePath(base).endsWith('/chat/completions') ? base : joinPath(base, '/chat/completions');
}

export function modelsUrl(base: URL): URL {
	const path = basePath(base);
	if (path.endsWith('/chat/completions')) {
		const url = new URL(base.toString());
		url.pathname = path.slice(0, -'/chat/completions'.length) + '/models';
		return url;
	}
	return joinPath(base, '/models');
}

function headersFor(config: ModelConfig): Record<string, string> {
	return {
		...(config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {}),
		...config.headers,
	};
}

/** OpenAI's own API wants max_completion_tokens for newer models; compatible servers expect max_tokens. */
function maxTokensField(base: URL): string {
	return base.hostname === 'api.openai.com' ? 'max_completion_tokens' : 'max_tokens';
}

export function buildRequestBody(config: ModelConfig, request: ChatRequest, base: URL): Record<string, unknown> {
	const messages: Record<string, unknown>[] = [];
	if (request.system) {
		messages.push({ role: 'system', content: request.system });
	}
	for (const message of request.messages) {
		const parts = partsOf(message);
		if (message.role === 'user') {
			for (const part of parts) {
				if (part.type === 'tool_result') {
					messages.push({ role: 'tool', tool_call_id: part.toolCallId, content: part.content });
				}
			}
			const text = textOf(parts);
			if (text) {
				messages.push({ role: 'user', content: text });
			}
		} else {
			const text = textOf(parts);
			const calls = parts.filter(part => part.type === 'tool_call');
			const assistant: Record<string, unknown> = { role: 'assistant', content: text || (calls.length ? null : '') };
			if (calls.length) {
				assistant.tool_calls = calls.map(call => ({
					id: call.id,
					type: 'function',
					function: { name: call.name, arguments: JSON.stringify(call.arguments) },
				}));
			}
			messages.push(assistant);
		}
	}

	const body: Record<string, unknown> = { model: config.model, messages, stream: true };
	const maxTokens = request.maxTokens ?? config.maxOutputTokens;
	if (maxTokens !== undefined) {
		body[maxTokensField(base)] = maxTokens;
	}
	if (request.temperature !== undefined) {
		body.temperature = request.temperature;
	}
	if (request.tools?.length) {
		body.tools = request.tools.map(tool => ({
			type: 'function',
			function: { name: tool.name, description: tool.description, parameters: tool.inputSchema },
		}));
	}
	return body;
}

function mapFinishReason(reason: string): StopReason {
	switch (reason) {
		case 'stop': return 'end';
		case 'tool_calls':
		case 'function_call': return 'tool_use';
		case 'length': return 'max_tokens';
		default: return 'other';
	}
}

interface PendingCall {
	id: string | undefined;
	name: string;
	args: string;
}

async function* stream(config: ModelConfig, request: ChatRequest, fetchFn: FetchLike): AsyncGenerator<StreamEvent> {
	const base = parseBaseUrl(config.baseUrl);
	const body = await sendStreaming(fetchFn, chatCompletionsUrl(base), jsonPost(headersFor(config), buildRequestBody(config, request, base), request.signal));

	const pending = new Map<number, PendingCall>();
	let stopReason: StopReason = 'end';
	let usage: Usage | undefined;

	for await (const event of readSse(body)) {
		if (event.data === '[DONE]') {
			break;
		}
		const chunk = parseJson(event.data, 'chunk');
		if (chunk.error) {
			throw new ModelRouterError('server', providerMessage(chunk) ?? 'The provider reported an error mid-stream.');
		}
		const chunkUsage = chunk.usage as Record<string, number> | undefined;
		if (chunkUsage) {
			usage = { inputTokens: chunkUsage.prompt_tokens, outputTokens: chunkUsage.completion_tokens };
		}
		const choice = (chunk.choices as Record<string, unknown>[] | undefined)?.[0];
		if (!choice) {
			continue;
		}
		const delta = (choice.delta ?? {}) as Record<string, unknown>;
		if (typeof delta.content === 'string' && delta.content) {
			yield { type: 'text', text: delta.content };
		}
		for (const fragment of (delta.tool_calls as Record<string, unknown>[] | undefined) ?? []) {
			const index = typeof fragment.index === 'number' ? fragment.index : 0;
			let call = pending.get(index);
			if (!call) {
				call = { id: undefined, name: '', args: '' };
				pending.set(index, call);
			}
			const fn = (fragment.function ?? {}) as Record<string, unknown>;
			if (typeof fragment.id === 'string' && fragment.id) {
				call.id = fragment.id;
			}
			if (typeof fn.name === 'string' && fn.name && !call.name) {
				call.name = fn.name;
			}
			if (typeof fn.arguments === 'string') {
				call.args += fn.arguments;
			}
		}
		if (typeof choice.finish_reason === 'string') {
			stopReason = mapFinishReason(choice.finish_reason);
		}
	}

	for (const [index, call] of [...pending.entries()].sort((a, b) => a[0] - b[0])) {
		const parsed = parseToolArguments(call.args, call.name);
		yield { type: 'tool_call', id: call.id ?? `call_${index}`, name: call.name, ...parsed };
	}
	// Some compatible servers report "stop" even when they called a tool.
	if (pending.size && stopReason === 'end') {
		stopReason = 'tool_use';
	}
	yield { type: 'done', stopReason, usage };
}

async function listModels(config: ModelConfig, fetchFn: FetchLike): Promise<ModelInfo[]> {
	const base = parseBaseUrl(config.baseUrl);
	const json = await getJson(fetchFn, modelsUrl(base), headersFor(config));
	const data = (json.data as Record<string, unknown>[] | undefined) ?? [];
	return data
		.filter(entry => typeof entry.id === 'string')
		.map(entry => ({ id: entry.id as string }));
}

export const openAiAdapter: Adapter = { stream, listModels };
