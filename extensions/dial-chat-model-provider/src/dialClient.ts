/**
 * DIAL API Client
 * Handles communication with DIAL API compatible with Azure OpenAI endpoints
 */

import axios, {
	type AxiosInstance,
	type AxiosResponseHeaders,
	type InternalAxiosRequestConfig,
	type RawAxiosResponseHeaders,
} from 'axios';
import { Readable } from 'stream';
import { StringDecoder } from 'string_decoder';
import {
	applyDeploymentConstraints,
	clampOutputTokenLimit,
	computeClampedOutputTokens,
	dropOutputTokenLimit,
	dropTemperature,
	forceMaxCompletionTokens,
	forceMaxTokens,
	isContextLengthExceededError,
	isUnsupportedMaxCompletionTokensError,
	isUnsupportedMaxTokensError,
	isUnsupportedTemperatureError,
	parseContextLengthError,
	sanitizeApiBodyForLog,
	summarizeChatRequest,
	summarizeChatRequestRetry,
	toApiRequestBody,
} from './chatRequestBuilder';
import { dialLog } from './logger';
import { summarizeAccessToken, summarizeAccessTokenClaims } from './jwtUtils';
import { formatHttpError, formatErrorBody, isEmptyResponseBodyError, isTransientHttpError, readHttpResponseBody } from './httpError';
import { parseEmbeddingsResponse } from './embeddingsResponse';
import { normalizeDeployment } from './deploymentMetadata';
import { buildTokenizeBody, parseTokenizeResponses, type TokenizeResult } from './tokenization';
import { abortError, destroyStream, isAbortError, throwIfAborted } from './cancel';
import { computeChatTransientRetryDelayMs, retryWithBackoff, sleepMs } from './retry';
import { isRecord, readString, type JsonObject, type JsonValue } from './runtimeGuards';
import { isEmptyModelStream, parseOpenAIStreamUsage } from './usageReporting';
import { type DialChatRequest, type DialConfig, type DialDeployment, type DialDeploymentKind, type DialEmbeddingResult, type Nullable, type OpenAIStreamUsage } from './types';

/** Header name used by DIAL Core (`Proxy.HEADER_API_KEY`). */
const DIAL_API_KEY_HEADER = 'API-KEY';
const DIAL_API_VERSION = '2025-04-01-preview';
/** Max strings per embeddings request (matches VS Code ExtensionContributedEmbeddingEndpoint default). */
const EMBEDDINGS_MAX_BATCH_SIZE = 100;

export interface StreamHandlers {
	readonly onText: (chunk: string) => void;
	readonly onToolCall: (callId: string, name: string, input: object) => void;
	readonly onUsage?: (usage: OpenAIStreamUsage) => void;
}

export interface ChatStreamOptions {
	/** Cancels the in-flight POST and tears down the SSE stream when aborted. */
	readonly signal?: AbortSignal;
}

interface ToolCallAccumulator {
	id?: string;
	name?: string;
	arguments: string;
}

interface SseDelta {
	readonly content?: string;
	readonly tool_calls?: readonly SseDeltaToolCall[];
}

interface SseDeltaToolCall {
	readonly index?: number;
	readonly id?: string;
	readonly function?: { readonly name?: string; readonly arguments?: string };
}

interface SseChoice {
	readonly delta?: SseDelta;
	readonly finish_reason?: string;
}

function parseSseChoices(json: JsonObject): readonly SseChoice[] {
	const choices = json.choices;
	if (!Array.isArray(choices)) {
		return [];
	}
	const out: SseChoice[] = [];
	for (const item of choices) {
		if (!isRecord(item)) {
			continue;
		}
		const delta = parseSseDelta(item.delta);
		const finishReason =
			typeof item.finish_reason === 'string' ? item.finish_reason : undefined;
		out.push({
			...(delta !== undefined ? { delta } : {}),
			...(finishReason !== undefined ? { finish_reason: finishReason } : {}),
		});
	}
	return out;
}

function parseSseDelta(value: Nullable<JsonValue>): Nullable<SseDelta> {
	if (!isRecord(value)) {
		return undefined;
	}
	const content = typeof value.content === 'string' ? value.content : undefined;
	const toolCalls = parseSseToolCalls(value.tool_calls);
	if (content === undefined && toolCalls === undefined) {
		return undefined;
	}
	return {
		...(content !== undefined && { content }),
		...(toolCalls !== undefined && { tool_calls: toolCalls }),
	};
}

function parseSseToolCallFunction(value: JsonValue): SseDeltaToolCall['function'] {
	if (!isRecord(value)) {
		return undefined;
	}
	const name = typeof value.name === 'string' ? value.name : undefined;
	const args = typeof value.arguments === 'string' ? value.arguments : undefined;
	if (name === undefined && args === undefined) {
		return undefined;
	}
	return {
		...(name !== undefined && { name }),
		...(args !== undefined && { arguments: args }),
	};
}

function parseSseToolCalls(value: Nullable<JsonValue>): Nullable<readonly SseDeltaToolCall[]> {
	if (!Array.isArray(value)) {
		return undefined;
	}
	const out: SseDeltaToolCall[] = [];
	for (const item of value) {
		if (!isRecord(item)) {
			continue;
		}
		const index = typeof item.index === 'number' ? item.index : undefined;
		const id = typeof item.id === 'string' ? item.id : undefined;
		const fn = parseSseToolCallFunction(item.function ?? null);
		out.push({
			...(index !== undefined && { index }),
			...(id !== undefined && { id }),
			...(fn !== undefined && { function: fn }),
		});
	}
	return out;
}

function readContentType(headers: AxiosResponseHeaders | RawAxiosResponseHeaders): string {
	const value = headers['content-type'];
	return typeof value === 'string' ? value : '(unknown)';
}

export class DialClient {
	private readonly client: AxiosInstance;
	private readonly config: DialConfig;
	private authToken: string;

	constructor(config: DialConfig, authToken: string) {
		this.config = config;
		this.authToken = authToken;

		this.client = axios.create({
			baseURL: this.config.serverUrl,
			timeout: 30_000,
		});

		this.client.interceptors.request.use((cfg) => this.applyAuthHeaders(cfg));
	}

	/**
	 * DIAL Core auth rules (see Proxy.authorizeRequest):
	 * - JWT-only: Authorization Bearer
	 * - When both API-KEY and Authorization are present with the same token, JWT claims (sub) are extracted
	 * - When they differ, JWT is skipped → user.id stays null → chat rate limiter fails
	 */
	private applyAuthHeaders(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
		const headers = axios.AxiosHeaders.from(config.headers ?? {});

		for (const name of ['Api-Key', 'api-key', DIAL_API_KEY_HEADER, 'Authorization']) {
			headers.delete(name);
		}

		if (this.config.authMethod === 'openid') {
			headers.set('Authorization', `Bearer ${this.authToken}`);
			headers.set(DIAL_API_KEY_HEADER, this.authToken);
		} else {
			headers.set(DIAL_API_KEY_HEADER, this.authToken);
		}

		config.headers = headers;
		const method = (config.method ?? 'get').toUpperCase();
		// Tokenize is high-frequency (called by the IDE while composing prompts);
		// skip the per-request auth log to avoid flooding the DIAL output channel.
		const isTokenize = (config.url ?? '').includes('/tokenize');
		if (method === 'POST' && !isTokenize) {
			dialLog.info(
				'HTTP POST auth headers',
				config.url ?? '',
				this.config.authMethod === 'openid' ? 'Authorization+API-KEY(JWT)' : 'API-KEY',
				this.summarizeAuthToken(),
			);
		}
		return config;
	}

	private summarizeAuthToken(): string {
		if (this.config.authMethod === 'apikey') {
			return `Api-Key len=${this.authToken.length}`;
		}
		return summarizeAccessToken(this.authToken);
	}

	private modelsListingUrl(path: string): string {
		return `${this.config.serverUrl.replace(/\/$/, '')}${path}`;
	}

	async getModels(): Promise<DialDeployment[]> {
		try {
			return await this.fetchModelsListing('/openai/models');
		} catch (error: unknown) {
			if (isLegacyListingFallbackError(error)) {
				dialLog.warn(
					'/openai/models listing unavailable — falling back to legacy /openai/deployments',
				);
				return this.fetchModelsListing('/openai/deployments');
			}
			throw error instanceof Error ? error : new Error(String(error));
		}
	}

	private async fetchModelsListing(path: string): Promise<DialDeployment[]> {
		dialLog.info(
			'GET models',
			this.modelsListingUrl(path),
			this.summarizeAuthToken(),
			`authMethod=${this.config.authMethod}`,
		);

		const response = await this.client.get<JsonValue>(path, {
			validateStatus: (status) => status < 500,
		});

		if (response.status === 404 || response.status === 501) {
			throw new LegacyListingError(`HTTP ${response.status}`);
		}
		if (response.status >= 400) {
			const detail = await formatHttpErrorFromResponse(response.status, response.data);
			throw new Error(detail);
		}

		const body: JsonValue = response.data;
		dialLog.info(
			'Models HTTP response',
			`status=${response.status}`,
			`contentType=${readContentType(response.headers)}`,
		);

		return this.parseModelList(body);
	}

	private parseModelList(body: JsonValue): DialDeployment[] {
		const rawList = extractDeploymentArray(body);
		if (!rawList) {
			return [];
		}
		if (rawList.length === 0) {
			dialLog.warn(
				'Models list is empty (HTTP 200)',
				summarizeAccessToken(this.authToken),
				summarizeAccessTokenClaims(this.authToken),
				`body=${safeJsonPreview(body)}`,
			);
		}

		const deployments = rawList.map((entry) => normalizeDeployment(entry));
		dialLog.info(
			`Loaded ${deployments.length} model(s)`,
			JSON.stringify(
				deployments.map((d) => ({
					id: d.id,
					kind: d.kind,
					name: d.name,
					model: d.model,
					topics: d.topics,
					tools: d.features?.tools_supported,
					maxIn: d.maxInputTokens,
					maxOut: d.maxOutputTokens,
					reasoningEfforts: d.features?.reasoning_efforts,
				})),
			),
		);
		return deployments;
	}

	async createEmbeddings(
		deploymentId: string,
		input: readonly string[],
		options: { readonly signal?: AbortSignal } = {},
	): Promise<readonly DialEmbeddingResult[]> {
		if (input.length === 0) {
			return [];
		}
		if (input.length > EMBEDDINGS_MAX_BATCH_SIZE) {
			const chunks: DialEmbeddingResult[] = [];
			for (let i = 0; i < input.length; i += EMBEDDINGS_MAX_BATCH_SIZE) {
				const slice = input.slice(i, i + EMBEDDINGS_MAX_BATCH_SIZE);
				const part = await this.createEmbeddings(deploymentId, slice, options);
				chunks.push(...part);
			}
			return chunks;
		}

		const path = `/openai/deployments/${encodeURIComponent(deploymentId)}/embeddings`;
		dialLog.info(`POST embeddings id=${deploymentId} count=${input.length}`);

		const results = await retryWithBackoff(
			async () => {
				throwIfAborted(options.signal);
				try {
					const response = await this.client.post<JsonValue>(
						path,
						{ input: [...input] },
						{
							headers: { 'Content-Type': 'application/json' },
							params: { 'api-version': DIAL_API_VERSION },
							timeout: this.config.embeddingsTimeoutMs,
							validateStatus: (status) => status < 500,
							...(options.signal !== undefined && { signal: options.signal }),
						},
					);

					if (response.status >= 400) {
						throw new Error(
							`POST ${path} failed (HTTP ${response.status}): ${safeJsonPreview(response.data)}`,
						);
					}

					return parseEmbeddingsResponse(response.data, input.length);
				} catch (error: unknown) {
					if (isAbortError(error)) {
						throw error;
					}
					throw new Error(await formatHttpError(error));
				}
			},
			{
				...this.config.httpRetry,
				...(options.signal !== undefined && { signal: options.signal }),
				isRetryable: isTransientHttpError,
				onRetry: (attempt, delayMs, detail) => {
					dialLog.warn(
						`Embeddings retry id=${deploymentId} count=${input.length} attempt=${attempt}/${this.config.httpRetry.maxAttempts} delayMs=${delayMs}`,
						detail,
					);
				},
			},
		);

		dialLog.info(`POST embeddings id=${deploymentId} succeeded count=${results.length}`);
		return results;
	}

	async getDeployment(deploymentName: string, kind: DialDeploymentKind = 'chat'): Promise<DialDeployment> {
		const response = await this.client.get<JsonValue>(
			`/openai/deployments/${encodeURIComponent(deploymentName)}`,
		);
		return normalizeDeployment(response.data, kind);
	}

	/**
	 * Count tokens for a batch of plain strings via the DIAL tokenize endpoint.
	 * Note the path is `/v1/deployments/...` (not the `/openai/...` chat route).
	 * Batching keeps the IDE's per-message token counting under the upstream
	 * rate limiter. Throws on transport/HTTP error; per-input failures are
	 * returned as empty {@link TokenizeResult} entries (positionally aligned).
	 */
	async tokenize(
		deploymentName: string,
		texts: readonly string[],
		options: { readonly signal?: AbortSignal } = {},
	): Promise<TokenizeResult[]> {
		const url = `/v1/deployments/${encodeURIComponent(deploymentName)}/tokenize`;
		const response = await this.client.post<JsonValue>(url, buildTokenizeBody(texts), {
			headers: { 'Content-Type': 'application/json' },
			timeout: 15_000,
			validateStatus: (status) => status < 500,
			...(options.signal !== undefined && { signal: options.signal }),
		});

		if (response.status >= 400) {
			throw new Error(
				`POST ${url} failed (HTTP ${response.status}): ${safeJsonPreview(response.data)}`,
			);
		}

		return parseTokenizeResponses(response.data, texts.length);
	}

	async streamChatCompletion(
		deploymentName: string,
		request: DialChatRequest,
		handlers: StreamHandlers,
		deployment?: DialDeployment,
		options: ChatStreamOptions = {},
	): Promise<void> {
		const resolvedDeployment: DialDeployment = deployment ?? {
			id: deploymentName,
			model: deploymentName,
		};
		let body: DialChatRequest = applyDeploymentConstraints(
			{ ...request, stream: true },
			resolvedDeployment,
		);

		dialLog.info(
			`Chat request deployment=${deploymentName}`,
			summarizeChatRequest(body, resolvedDeployment),
		);

		const semanticMaxAttempts = 4;
		const retryState: RetryAdjustmentState = {
			triedMaxTokens: body.max_tokens !== undefined,
			triedMaxCompletionTokens: body.max_completion_tokens !== undefined,
			droppedTemperature: false,
			contextClampCount: 0,
		};

		let lastDetail = '';
		const { maxAttempts: transientMax } = this.config.httpRetry;

		for (let transientAttempt = 1; transientAttempt <= transientMax; transientAttempt++) {
			throwIfAborted(options.signal);
			let lastAttemptElapsedMs = 0;

			for (let semanticAttempt = 1; semanticAttempt <= semanticMaxAttempts; semanticAttempt++) {
				const attemptStartedAt = Date.now();
				try {
					await this.postStream(deploymentName, body, handlers, options.signal);
					return;
				} catch (error: unknown) {
					lastAttemptElapsedMs = Date.now() - attemptStartedAt;
					if (isAbortError(error)) {
						dialLog.info(
							`Chat cancelled deployment=${deploymentName} elapsedMs=${lastAttemptElapsedMs}`,
						);
						throw error;
					}
					lastDetail = await formatHttpError(error);
					const next = adjustRequestForUpstreamError(
						body,
						lastDetail,
						semanticAttempt,
						retryState,
					);
					if (next) {
						body = next;
						dialLog.info(
							`Retrying chat deployment=${deploymentName} semantic=${semanticAttempt + 1} elapsedMs=${lastAttemptElapsedMs}`,
							summarizeChatRequestRetry(body),
						);
						continue;
					}
					break;
				}
			}

			if (options.signal?.aborted) {
				throw abortError();
			}

			if (!isTransientHttpError(lastDetail)) {
				dialLog.error(
					`Stream chat failed deployment=${deploymentName} transient=${transientAttempt}/${transientMax} elapsedMs=${lastAttemptElapsedMs}`,
					lastDetail,
					summarizeChatRequestRetry(body),
				);
				throw new Error(lastDetail);
			}

			if (transientAttempt >= transientMax) {
				dialLog.error(
					`Stream chat failed deployment=${deploymentName} after ${transientMax} transient retries elapsedMs=${lastAttemptElapsedMs}`,
					lastDetail,
					summarizeChatRequestRetry(body),
				);
				throw new Error(formatChatFailureMessage(lastDetail));
			}

			const delayMs = computeChatTransientRetryDelayMs(
				transientAttempt,
				this.config.httpRetry,
				lastDetail,
				lastAttemptElapsedMs,
			);
			dialLog.warn(
				`Transient chat error deployment=${deploymentName} attempt=${transientAttempt}/${transientMax} ` +
					`elapsedMs=${lastAttemptElapsedMs} nextDelayMs=${delayMs}`,
				lastDetail,
			);
			await sleepMs(delayMs, options.signal);
		}

		throw new Error(`DIAL: chat failed for ${deploymentName}: ${lastDetail}`);
	}

	private async postStream(
		deploymentName: string,
		body: DialChatRequest,
		handlers: StreamHandlers,
		signal: Nullable<AbortSignal>,
	): Promise<void> {
		throwIfAborted(signal);
		const apiBody = toApiRequestBody(body);
		const url = `/openai/deployments/${encodeURIComponent(deploymentName)}/chat/completions`;
		let stream: Nullable<Readable>;

		try {
			const response = await this.client.post<JsonValue>(url, apiBody, {
				headers: { 'Content-Type': 'application/json' },
				params: { 'api-version': DIAL_API_VERSION },
				responseType: 'stream',
				timeout: this.config.chatStreamTimeoutMs,
				validateStatus: (status) => status < 500,
				...(signal !== undefined && { signal }),
			});

			if (signal?.aborted) {
				destroyStream(asReadableStream(response.data));
				throw abortError();
			}

			const status = response.status;
			if (status >= 400) {
				const errBody = await readHttpResponseBody(response.data);
				const detail = formatErrorBody(errBody);
				dialLog.error(
					`HTTP ${status} on stream POST`,
					url,
					detail,
					sanitizeApiBodyForLog(apiBody),
				);
				throw new Error(`POST ${url} failed (HTTP ${status}): ${detail}`);
			}

			stream = asReadableStream(response.data);
			await this.consumeSseStream(stream, deploymentName, apiBody, handlers, signal);
		} catch (error: unknown) {
			if (stream !== undefined) {
				destroyStream(stream);
			}
			if (isAbortError(error) || signal?.aborted) {
				throw abortError();
			}
			throw error;
		}
	}

	private async consumeSseStream(
		stream: Readable,
		deploymentName: string,
		apiBody: JsonObject,
		handlers: StreamHandlers,
		signal: Nullable<AbortSignal>,
	): Promise<void> {
		const toolCalls = new Map<number, ToolCallAccumulator>();
		const counters = { text: 0, tools: 0 };
		let sawUsage = false;
		let streamError: Nullable<Error>;

		const flushToolCalls = (): void => {
			for (const acc of toolCalls.values()) {
				if (!acc.id || !acc.name) {
					continue;
				}
				counters.tools += 1;
				handlers.onToolCall(acc.id, acc.name, parseToolCallArguments(acc.arguments));
			}
			toolCalls.clear();
		};

		const processChoice = (choice: SseChoice): void => {
			const delta = choice.delta;
			if (!delta) {
				if (choice.finish_reason === 'tool_calls') {
					flushToolCalls();
				}
				return;
			}

			if (delta.content && delta.content.length > 0) {
				counters.text += 1;
				handlers.onText(delta.content);
			}

			if (delta.tool_calls) {
				for (const tc of delta.tool_calls) {
					const idx = tc.index ?? 0;
					const acc = toolCalls.get(idx) ?? { arguments: '' };
					if (tc.id) {
						acc.id = tc.id;
					}
					if (tc.function?.name) {
						acc.name = tc.function.name;
					}
					if (tc.function?.arguments) {
						acc.arguments += tc.function.arguments;
					}
					toolCalls.set(idx, acc);
				}
			}

			if (choice.finish_reason === 'tool_calls') {
				flushToolCalls();
			}
		};

		const handleSsePayload = (data: string): void => {
			if (!data) {
				return;
			}
			if (data === '[DONE]') {
				flushToolCalls();
				return;
			}
			let json: JsonValue;
			try {
				json = JSON.parse(data) as JsonValue;
			} catch (parseError: unknown) {
				const parseMessage =
					parseError instanceof Error ? parseError.message : String(parseError);
				dialLog.warn('Skipping non-JSON SSE chunk', data.slice(0, 200), parseMessage);
				return;
			}
			if (!isRecord(json)) {
				return;
			}

			const usage = parseOpenAIStreamUsage(json);
			if (usage) {
				sawUsage = true;
				dialLog.info('SSE usage chunk', {
					prompt_tokens: usage.prompt_tokens,
					completion_tokens: usage.completion_tokens,
					total_tokens: usage.total_tokens,
					cached_tokens: usage.prompt_tokens_details?.cached_tokens,
				});
				handlers.onUsage?.(usage);
			}

			const err = isRecord(json.error) ? json.error : undefined;
			const errorMessage = err ? readString(err, 'message') : undefined;
			if (errorMessage) {
				streamError = new Error(`DIAL upstream SSE error: ${errorMessage}`);
				const code = err ? readString(err, 'code') : undefined;
				const type = err ? readString(err, 'type') : undefined;
				dialLog.error(
					'SSE error event',
					errorMessage,
					code ? `code=${code}` : '',
					type ? `type=${type}` : '',
				);
				return;
			}

			for (const choice of parseSseChoices(json)) {
				processChoice(choice);
			}
		};

		// `StringDecoder` preserves multi-byte UTF-8 sequences split across chunks
		// (raw `Buffer.toString('utf8')` would emit U+FFFD at the boundary).
		const decoder = new StringDecoder('utf8');
		let buffer = '';
		const onData = (chunk: Buffer | string): void => {
			buffer += typeof chunk === 'string' ? chunk : decoder.write(chunk);
			let newlineIdx = buffer.indexOf('\n');
			while (newlineIdx !== -1) {
				const line = buffer.slice(0, newlineIdx);
				buffer = buffer.slice(newlineIdx + 1);
				if (line.startsWith('data: ')) {
					handleSsePayload(line.slice(6).trim());
				}
				newlineIdx = buffer.indexOf('\n');
			}
		};

		// Listeners stay attached for the lifetime of the stream; `settled` guards against
		// double-resolution if `error` fires after a successful `end` (or vice versa).
		await new Promise<void>((resolve, reject) => {
			let settled = false;
			const finish = (err: Nullable<Error>): void => {
				if (settled) {
					return;
				}
				settled = true;
				signal?.removeEventListener('abort', onAbort);
				if (err) {
					reject(err);
				} else {
					resolve();
				}
			};

			const onAbort = (): void => {
				destroyStream(stream);
				finish(abortError());
			};

			stream.on('data', onData);
			stream.on('end', () => {
				buffer += decoder.end();
				if (buffer.startsWith('data: ')) {
					handleSsePayload(buffer.slice(6).trim());
					buffer = '';
				}
				flushToolCalls();
				if (streamError) {
					finish(streamError);
					return;
				}
				if (isEmptyModelStream(counters, sawUsage)) {
					const msg = `DIAL: empty stream from ${deploymentName} (no text or tool_calls)`;
					dialLog.error(msg, sanitizeApiBodyForLog(apiBody));
					finish(new Error(msg));
					return;
				}
				if (counters.text === 0 && counters.tools === 0 && sawUsage) {
					dialLog.warn(
						`Stream usage-only deployment=${deploymentName} — upstream sent usage but no text or tool_calls`,
						sanitizeApiBodyForLog(apiBody),
					);
				}
				dialLog.info(`Stream complete deployment=${deploymentName}`, {
					textChunks: counters.text,
					toolCalls: counters.tools,
					hadUsage: sawUsage,
				});
				finish(undefined);
			});
			stream.on('error', (err: unknown) => {
				if (settled) {
					return;
				}
				dialLog.error(
					`Stream transport error deployment=${deploymentName}`,
					err instanceof Error ? err.message : String(err),
				);
				finish(err instanceof Error ? err : new Error(String(err)));
			});

			if (signal?.aborted) {
				onAbort();
				return;
			}
			signal?.addEventListener('abort', onAbort, { once: true });
		});
	}

	updateAuthToken(token: string): void {
		this.authToken = token;
	}
}

function extractDeploymentArray(body: JsonValue): Nullable<readonly JsonObject[]> {
	if (Array.isArray(body)) {
		dialLog.warn('Deployments response is a bare array — using it directly');
		return body.filter(isRecord);
	}
	if (!isRecord(body)) {
		dialLog.warn(
			'Deployments response is not a JSON object',
			typeof body,
			safeJsonPreview(body),
		);
		return undefined;
	}
	dialLog.info('Deployments response keys', Object.keys(body).join(', ') || '(empty object)');
	const data = body.data;
	if (Array.isArray(data)) {
		return data.filter(isRecord);
	}
	dialLog.warn('Deployments response missing data[] array', safeJsonPreview(body));
	return undefined;
}

function safeJsonPreview(value: JsonValue): string {
	try {
		return JSON.stringify(value).slice(0, 2000);
	} catch {
		return String(value).slice(0, 2000);
	}
}

function asReadableStream(data: unknown): Readable {
	if (data instanceof Readable) {
		return data;
	}
	throw new TypeError('Expected streaming response body');
}

function parseToolCallArguments(rawArgs: string): object {
	if (!rawArgs) {
		return {};
	}
	try {
		const parsed = JSON.parse(rawArgs) as JsonValue;
		if (isRecord(parsed) || Array.isArray(parsed)) {
			return parsed;
		}
		return {};
	} catch {
		return { _raw: rawArgs };
	}
}

interface RetryAdjustmentState {
	/** `max_tokens` has been sent at least once during this call. */
	triedMaxTokens: boolean;
	/** `max_completion_tokens` has been sent at least once during this call. */
	triedMaxCompletionTokens: boolean;
	/** `temperature` has been stripped from the request (do not put it back). */
	droppedTemperature: boolean;
	/** How many times the output limit has been shrunk for context-length recovery. */
	contextClampCount: number;
}

/** Max semantic retries that shrink output to fit the context window (prompt size can rise between attempts). */
const CONTEXT_CLAMP_MAX_ATTEMPTS = 4;

/**
 * Apply known upstream-error workarounds. Returns the adjusted request if a
 * retry should be attempted, or `undefined` when the error is unrecoverable.
 *
 * The {@link RetryAdjustmentState} is mutated to remember which directions of
 * the `max_tokens` ↔ `max_completion_tokens` swap have already been tried.
 * Once both directions have been used we **drop** the limit field entirely
 * instead of swapping again — otherwise a misconfigured DIAL feature flag plus
 * a noisy upstream error message could trap us in an oscillation between the
 * two field names. The same one-shot rule applies to `temperature`.
 */
function adjustRequestForUpstreamError(
	body: DialChatRequest,
	detail: string,
	attempt: number,
	state: RetryAdjustmentState,
): Nullable<DialChatRequest> {
	let next = body;
	let adjusted = false;

	if (next.max_tokens !== undefined && isUnsupportedMaxTokensError(detail)) {
		if (state.triedMaxCompletionTokens) {
			dialLog.warn(
				`Attempt ${attempt}: both max_tokens and max_completion_tokens rejected — dropping output limit`,
				detail,
			);
			next = dropOutputTokenLimit({ ...next, stream: true });
		} else {
			dialLog.warn(
				`Attempt ${attempt}: upstream rejected max_tokens — switching to max_completion_tokens`,
				detail,
			);
			next = forceMaxCompletionTokens({ ...next, stream: true });
			state.triedMaxCompletionTokens = true;
		}
		adjusted = true;
	} else if (
		next.max_completion_tokens !== undefined &&
		isUnsupportedMaxCompletionTokensError(detail)
	) {
		if (state.triedMaxTokens) {
			dialLog.warn(
				`Attempt ${attempt}: both max_completion_tokens and max_tokens rejected — dropping output limit`,
				detail,
			);
			next = dropOutputTokenLimit({ ...next, stream: true });
		} else {
			dialLog.warn(
				`Attempt ${attempt}: upstream rejected max_completion_tokens — switching to max_tokens`,
				detail,
			);
			next = forceMaxTokens({ ...next, stream: true });
			state.triedMaxTokens = true;
		}
		adjusted = true;
	} else if (
		isContextLengthExceededError(detail) &&
		state.contextClampCount < CONTEXT_CLAMP_MAX_ATTEMPTS
	) {
		const info = parseContextLengthError(detail);
		const current = next.max_completion_tokens ?? next.max_tokens;
		if (current !== undefined) {
			const clamped = computeClampedOutputTokens(info, current);
			if (clamped !== undefined && clamped < current) {
				dialLog.warn(
					`Attempt ${attempt}: prompt + output exceed context ` +
						`(max=${info.maxContext}, input=${info.inputTokens}); ` +
						`clamping output limit ${current}→${clamped}`,
					detail,
				);
				next = clampOutputTokenLimit({ ...next, stream: true }, clamped);
				state.contextClampCount += 1;
				adjusted = true;
			} else {
				dialLog.warn(
					`Attempt ${attempt}: prompt alone (${info.inputTokens ?? '?'}) leaves no room ` +
						`for output within context ${info.maxContext ?? '?'} — conversation must be compacted`,
					detail,
				);
			}
		}
	}

	if (
		next.temperature !== undefined &&
		!state.droppedTemperature &&
		isUnsupportedTemperatureError(detail)
	) {
		dialLog.warn(
			`Attempt ${attempt}: upstream rejected temperature — omitting parameter`,
			detail,
		);
		next = dropTemperature({ ...next, stream: true });
		state.droppedTemperature = true;
		adjusted = true;
	}

	return adjusted ? next : undefined;
}

function formatChatFailureMessage(detail: string): string {
	if (isEmptyResponseBodyError(detail)) {
		return (
			`${detail} — upstream closed the connection without a response (often vLLM queue ` +
			`overload or proxy timeout). Retry later or reduce concurrent agent load.`
		);
	}
	return detail;
}

class LegacyListingError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'LegacyListingError';
	}
}

function isLegacyListingFallbackError(error: unknown): boolean {
	if (error instanceof LegacyListingError) {
		return true;
	}
	const message = error instanceof Error ? error.message : String(error);
	return message.includes('HTTP 404') || message.includes('HTTP 501');
}

function formatHttpErrorFromResponse(status: number, data: JsonValue): string {
	return `HTTP ${status}: ${safeJsonPreview(data)}`;
}
