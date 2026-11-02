/*---------------------------------------------------------------------------------------------
 *  Fork model router. Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

// Google Gemini API (generativelanguage.googleapis.com), native format.

import { ModelRouterError, providerMessage } from '../errors.ts';
import { basePath, getJson, joinPath, jsonPost, parseBaseUrl, sendStreaming } from '../http.ts';
import { parseJson, readSse } from '../sse.ts';
import { partsOf, type Adapter, type ChatRequest, type FetchLike, type JsonSchema, type ModelConfig, type ModelInfo, type StopReason, type StreamEvent, type Usage } from '../types.ts';

/** The model list returns names like "models/gemini-2.5-pro"; requests want the bare id. */
export function bareModelName(model: string): string {
	return model.replace(/^models\//, '');
}

function versionedPath(base: URL, rest: string): URL {
	const path = basePath(base);
	return joinPath(base, /\/v1(beta|alpha)?$/.test(path) ? rest : `/v1beta${rest}`);
}

export function streamUrl(base: URL, model: string): URL {
	const url = basePath(base).includes(':streamGenerateContent')
		? new URL(base.toString())
		: versionedPath(base, `/models/${encodeURIComponent(bareModelName(model))}:streamGenerateContent`);
	url.searchParams.set('alt', 'sse');
	return url;
}

export function modelsUrl(base: URL): URL {
	const url = versionedPath(base, '/models');
	url.searchParams.set('pageSize', '1000');
	return url;
}

function headersFor(config: ModelConfig): Record<string, string> {
	return {
		...(config.apiKey ? { 'x-goog-api-key': config.apiKey } : {}),
		...config.headers,
	};
}

const UNSUPPORTED_SCHEMA_KEYS = new Set(['$schema', '$id', 'additionalProperties', 'examples']);

/** Gemini accepts an OpenAPI subset of JSON Schema; drop the keys it rejects. */
export function toGeminiSchema(schema: JsonSchema): JsonSchema {
	const visit = (value: unknown): unknown => {
		if (Array.isArray(value)) {
			return value.map(visit);
		}
		if (value && typeof value === 'object') {
			const out: Record<string, unknown> = {};
			for (const [key, child] of Object.entries(value)) {
				if (!UNSUPPORTED_SCHEMA_KEYS.has(key)) {
					out[key] = visit(child);
				}
			}
			return out;
		}
		return value;
	};
	return visit(schema) as JsonSchema;
}

export function buildRequestBody(config: ModelConfig, request: ChatRequest): Record<string, unknown> {
	const contents = request.messages.map(message => {
		const parts: Record<string, unknown>[] = [];
		for (const part of partsOf(message)) {
			if (part.type === 'text') {
				if (part.text) {
					parts.push({ text: part.text });
				}
			} else if (part.type === 'tool_call') {
				// Thought signatures must be echoed back with the call they came with.
				parts.push({ functionCall: { name: part.name, args: part.arguments }, ...part.providerData });
			} else {
				parts.push({ functionResponse: { name: part.toolName, response: part.isError ? { error: part.content } : { result: part.content } } });
			}
		}
		return { role: message.role === 'assistant' ? 'model' : 'user', parts };
	});

	const body: Record<string, unknown> = { contents };
	if (request.system) {
		body.systemInstruction = { parts: [{ text: request.system }] };
	}
	if (request.tools?.length) {
		body.tools = [{
			functionDeclarations: request.tools.map(tool => ({ name: tool.name, description: tool.description, parameters: toGeminiSchema(tool.inputSchema) })),
		}];
	}
	const generationConfig: Record<string, unknown> = {};
	const maxTokens = request.maxTokens ?? config.maxOutputTokens;
	if (maxTokens !== undefined) {
		generationConfig.maxOutputTokens = maxTokens;
	}
	if (request.temperature !== undefined) {
		generationConfig.temperature = request.temperature;
	}
	if (Object.keys(generationConfig).length) {
		body.generationConfig = generationConfig;
	}
	return body;
}

function mapFinishReason(reason: string): StopReason {
	switch (reason) {
		case 'STOP': return 'end';
		case 'MAX_TOKENS': return 'max_tokens';
		default: return 'other';
	}
}

async function* stream(config: ModelConfig, request: ChatRequest, fetchFn: FetchLike): AsyncGenerator<StreamEvent> {
	const base = parseBaseUrl(config.baseUrl);
	const body = await sendStreaming(fetchFn, streamUrl(base, config.model), jsonPost(headersFor(config), buildRequestBody(config, request), request.signal));

	let stopReason: StopReason = 'end';
	let usage: Usage | undefined;
	let callCount = 0;

	for await (const event of readSse(body)) {
		const chunk = parseJson(event.data, 'chunk');
		if (chunk.error) {
			throw new ModelRouterError('server', providerMessage(chunk) ?? 'The provider reported an error mid-stream.');
		}
		const blockReason = (chunk.promptFeedback as Record<string, unknown> | undefined)?.blockReason;
		if (typeof blockReason === 'string') {
			throw new ModelRouterError('bad_request', `Gemini blocked the prompt (${blockReason}).`);
		}
		const usageMetadata = chunk.usageMetadata as Record<string, number> | undefined;
		if (usageMetadata) {
			usage = { inputTokens: usageMetadata.promptTokenCount, outputTokens: usageMetadata.candidatesTokenCount };
		}
		const candidate = (chunk.candidates as Record<string, unknown>[] | undefined)?.[0];
		if (!candidate) {
			continue;
		}
		const parts = ((candidate.content as Record<string, unknown> | undefined)?.parts as Record<string, unknown>[] | undefined) ?? [];
		for (const part of parts) {
			if (part.thought === true) {
				continue;
			}
			if (typeof part.text === 'string' && part.text) {
				yield { type: 'text', text: part.text };
			}
			const call = part.functionCall as Record<string, unknown> | undefined;
			if (call) {
				callCount++;
				yield {
					type: 'tool_call',
					id: typeof call.id === 'string' ? call.id : `call_${callCount}`,
					name: String(call.name),
					arguments: (call.args as Record<string, unknown> | undefined) ?? {},
					...(typeof part.thoughtSignature === 'string' ? { providerData: { thoughtSignature: part.thoughtSignature } } : {}),
				};
			}
		}
		if (typeof candidate.finishReason === 'string') {
			stopReason = mapFinishReason(candidate.finishReason);
		}
	}

	if (callCount && stopReason === 'end') {
		stopReason = 'tool_use';
	}
	yield { type: 'done', stopReason, usage };
}

async function listModels(config: ModelConfig, fetchFn: FetchLike): Promise<ModelInfo[]> {
	const base = parseBaseUrl(config.baseUrl);
	const json = await getJson(fetchFn, modelsUrl(base), headersFor(config));
	const models = (json.models as Record<string, unknown>[] | undefined) ?? [];
	return models
		.filter(entry => typeof entry.name === 'string')
		.filter(entry => !Array.isArray(entry.supportedGenerationMethods) || entry.supportedGenerationMethods.includes('generateContent'))
		.map(entry => ({ id: bareModelName(entry.name as string), displayName: typeof entry.displayName === 'string' ? entry.displayName : undefined }));
}

export const geminiAdapter: Adapter = { stream, listModels };
