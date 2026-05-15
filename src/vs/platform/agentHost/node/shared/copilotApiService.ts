/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import { CAPIClient, RequestType, type CCAModel, type IExtensionInformation } from '@vscode/copilot-api';
import { generateUuid } from '../../../../base/common/uuid.js';
import { getDevDeviceId, getMachineId } from '../../../../base/node/id.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';

// #region Types

/**
 * Per-call transport options for all {@link ICopilotApiService} methods.
 *
 * `headers` are merged into the outgoing CAPI request before security-
 * sensitive headers (`Authorization`, `Content-Type`, `X-Request-Id`,
 * `OpenAI-Intent`), so callers cannot override those.
 *
 * `signal` propagates to the outgoing API request but **not** to the
 * shared token mint. The mint is deduped across concurrent callers, so
 * a single caller's abort must not cancel it for everyone.
 */
export interface ICopilotApiServiceRequestOptions {
	readonly headers?: Readonly<Record<string, string>>;
	readonly signal?: AbortSignal;
}

/**
 * Subset of the GitHub `copilot_internal/user` response we care about.
 * The full payload carries entitlement info; we only need `endpoints` (for
 * routing CAPI requests) and `access_type_sku` (which `CAPIClient.updateDomains`
 * stamps onto requests).
 */
interface ICopilotUserResponse {
	readonly endpoints?: {
		readonly api?: string;
		readonly telemetry?: string;
		readonly proxy?: string;
		readonly 'origin-tracker'?: string;
	};
	readonly access_type_sku?: string;
}

interface ICachedClient {
	readonly capiClient: CAPIClient;
	readonly expiresAt: number;
}

/**
 * Memoized parts of `CAPIClient` construction that don't depend on the user
 * token. Built once and reused by every per-token client.
 */
interface ICapiBase {
	readonly extensionInfo: IExtensionInformation;
	readonly userUrl: string;
}

// #endregion

// #region Constants

/**
 * Sentinel {@link CopilotApiError.status} used when the error came from a
 * mid-stream SSE `event: error` frame rather than an HTTP non-2xx response.
 * The upstream HTTP status was 200 (the stream had already started); the
 * real HTTP status is no longer meaningful, so consumers that need an HTTP
 * status code (e.g. when re-emitting before headers are sent) should not
 * trust this value. Use `envelope.error.type` instead.
 */
export const COPILOT_API_ERROR_STATUS_STREAMING = 520;

/**
 * Re-resolve the CAPI endpoint discovery this many seconds before the cache
 * entry's notional expiry. The `/copilot_internal/user` response itself
 * carries no expiry, so we apply a fixed TTL and refresh ahead of it.
 */
const CAPI_CONTEXT_REFRESH_BUFFER_SECONDS = 5 * 60;

/** Conservative TTL for the `/copilot_internal/user` discovery result. */
const CAPI_CONTEXT_TTL_SECONDS = 30 * 60;

const USER_API_VERSION = '2025-04-01';

// #endregion

// #region Errors

/**
 * Thrown by {@link ICopilotApiService} when CAPI returns an Anthropic-format
 * API error — either as a non-2xx HTTP response or as a mid-stream
 * `event: error` SSE frame. Carries enough information for the Phase 2
 * Claude proxy to re-emit the error passthrough without re-mapping.
 *
 * Network/transport failures (connection reset, DNS failure, etc.) are
 * **not** wrapped as `CopilotApiError` — they propagate as raw `fetch`
 * rejections so consumers can distinguish API errors from transport errors.
 */
export class CopilotApiError extends Error {

	/**
	 * @param status HTTP status from the originating CAPI response, or
	 *   {@link COPILOT_API_ERROR_STATUS_STREAMING} for mid-stream SSE errors.
	 * @param envelope Anthropic-format error envelope. For HTTP errors with a
	 *   non-conforming body (plain text, malformed JSON, missing fields) this
	 *   is synthesized; for conforming bodies and SSE frames it is the
	 *   server's envelope verbatim.
	 * @param message Optional override for `Error.message`. Defaults to
	 *   `envelope.error.message`. **Never includes auth tokens.**
	 */
	constructor(
		readonly status: number,
		readonly envelope: Anthropic.ErrorResponse,
		message?: string,
	) {
		super(message ?? envelope.error.message);
		this.name = 'CopilotApiError';
	}
}

/**
 * Build a {@link CopilotApiError} from a CAPI HTTP response body. If the
 * body parses as a conforming Anthropic envelope, it is used verbatim;
 * otherwise a synthetic envelope is constructed with `error.type:
 * 'api_error'` and the response body as `error.message` (or status text
 * when the body is empty). The returned error's `message` deliberately
 * mirrors the original `"<prefix>: <status> <statusText>"` format so
 * existing log-line consumers continue to read identifiably. `prefix`
 * defaults to `"CAPI request failed"` (the historical wording for
 * `messages`); pass `"CAPI models request failed"` for the `models()` path.
 */
function buildCopilotApiHttpError(status: number, statusText: string, bodyText: string, prefix = 'CAPI request failed'): CopilotApiError {
	let envelope: Anthropic.ErrorResponse | undefined;
	if (bodyText) {
		try {
			const parsed = JSON.parse(bodyText) as unknown;
			if (
				parsed && typeof parsed === 'object'
				&& (parsed as { type?: unknown }).type === 'error'
			) {
				const err = (parsed as { error?: unknown }).error;
				if (
					err && typeof err === 'object'
					&& typeof (err as { type?: unknown }).type === 'string'
					&& typeof (err as { message?: unknown }).message === 'string'
				) {
					envelope = parsed as Anthropic.ErrorResponse;
				}
			}
		} catch {
			// non-JSON body — fall through to synthesis
		}
	}
	if (!envelope) {
		envelope = {
			type: 'error',
			error: {
				type: 'api_error',
				message: bodyText || `${status} ${statusText}`,
			},
			request_id: null,
		};
	}
	return new CopilotApiError(
		status,
		envelope,
		`${prefix}: ${status} ${statusText} \u2014 ${envelope.error.message}`,
	);
}

// #endregion

export type FetchFunction = typeof globalThis.fetch;

export const ICopilotApiService = createDecorator<ICopilotApiService>('copilotApiService');

/**
 * Foundational gateway between the agent host and GitHub Copilot's CAPI proxy
 * for Anthropic-style chat completions and model discovery.
 *
 * ## Goals
 *
 * 1. **Single source of truth for CAPI auth.** Callers pass a raw GitHub token
 *    and never deal with endpoint discovery or routing themselves.
 * 2. **Stable surface for chat agents.** A small, typed API that abstracts the
 *    underlying `CAPIClient`, SSE framing, and Anthropic event taxonomy so
 *    feature code can focus on prompting.
 * 3. **Resource-safe streaming.** Async-generator output that fully releases
 *    the underlying HTTP connection regardless of how the consumer terminates
 *    iteration (early `break`, thrown error, abort, or natural end-of-stream).
 * 4. **Skew- and revocation-tolerant context cache.** Endpoint/sku discovery
 *    stays cached as long as it's usable and is invalidated immediately on
 *    `401`/`403` so callers self-heal without restarting the host.
 *
 * ## Auth strategy
 *
 * The GitHub user token IS the credential. There is no Copilot session-token
 * mint; we send `Authorization: Bearer <github-token>` directly to CAPI's
 * `/v1/messages` and `/models` endpoints. This mirrors what the
 * `@github/copilot` CLI does (see `fetchCopilotUser` and
 * `CopilotAnthropicClient.createWithOAuthToken` in `github/copilot-agent-runtime`).
 *
 * The `endpoints.api` URL CAPI requests are routed to is discovered per-token
 * by calling `GET /copilot_internal/user` once and caching the result. This
 * works for both consumer (`api.githubcopilot.com`) and Enterprise
 * (`api.enterprise.githubcopilot.com`) accounts without configuration.
 *
 * ## Non-goals
 *
 * - Per-conversation history, retry/backoff, or rate-limit handling. Callers
 *   own request orchestration.
 *
 * ## Concurrency model
 *
 * - Each cached entry is a **distinct {@link CAPIClient} instance** with its
 *   own discovered domain state. Concurrent in-flight requests for two
 *   different GitHub tokens cannot trample each other's `endpoints.api` —
 *   token A's request will always route through the client built for A.
 * - Multiple in-flight requests for the **same** GitHub token share a single
 *   endpoint-discovery call via the per-token cache map (no thundering herd
 *   on cold start).
 * - `AbortSignal` is forwarded to the outgoing API request (messages, models)
 *   but **not** to the shared discovery call, so cancellation propagates to
 *   the caller's own request without affecting concurrent callers sharing the
 *   discovery.
 *
 * ## Error semantics
 *
 * - Network/transport errors propagate as raw `fetch` rejections (e.g.
 *   connection reset, DNS failure). Consumers can distinguish them from
 *   API errors by `instanceof CopilotApiError`.
 * - Non-2xx responses from CAPI's `messages` and `models` endpoints throw
 *   {@link CopilotApiError} carrying the HTTP `status` and the parsed
 *   Anthropic error `envelope` (synthesized if the response body isn't a
 *   conforming envelope). **Tokens are never embedded in error messages.**
 * - Streaming `event: error` SSE frames throw {@link CopilotApiError} with
 *   `status` set to {@link COPILOT_API_ERROR_STATUS_STREAMING} (the upstream
 *   HTTP status was 200 and is no longer meaningful) and the server-supplied
 *   error envelope preserved verbatim.
 * - Failures of the `/copilot_internal/user` discovery call throw plain
 *   `Error` (not `CopilotApiError`) with a `"Copilot endpoint discovery
 *   failed: ..."` prefix — it is an implementation detail of this service
 *   and is not part of the Anthropic-shaped CAPI surface.
 * - Malformed JSON in an SSE `data:` line is logged and skipped, not thrown.
 */
export interface ICopilotApiService {

	readonly _serviceBrand: undefined;

	/**
	 * Stream a chat completion as raw Anthropic stream events.
	 *
	 * Yields every `Anthropic.MessageStreamEvent` in the order the server
	 * emits them, **including `message_stop` as the last event** before the
	 * generator returns. Phase 2 proxy relies on receiving a complete,
	 * replayable event stream.
	 *
	 * @throws on non-2xx status or SSE `error` event.
	 */
	messages(
		githubToken: string,
		request: Anthropic.MessageCreateParamsStreaming,
		options?: ICopilotApiServiceRequestOptions,
	): AsyncGenerator<Anthropic.MessageStreamEvent>;

	/**
	 * Send a chat completion and return the full aggregated response.
	 * @throws on non-2xx status.
	 */
	messages(
		githubToken: string,
		request: Anthropic.MessageCreateParamsNonStreaming,
		options?: ICopilotApiServiceRequestOptions,
	): Promise<Anthropic.Message>;

	/**
	 * Count tokens for a hypothetical request.
	 *
	 * @throws always — `countTokens` is not supported by CAPI in Phase 1.5.
	 * Phase 2 proxy maps this to HTTP 501.
	 */
	countTokens(
		githubToken: string,
		req: Anthropic.MessageCountTokensParams,
		options?: ICopilotApiServiceRequestOptions,
	): Promise<Anthropic.MessageTokensCount>;

	/**
	 * List models available to the GitHub user.
	 *
	 * Each {@link CCAModel} carries a `vendor` (e.g. `'Anthropic'`) and
	 * `supported_endpoints` (e.g. `['/v1/messages']`). Callers filtering for
	 * Anthropic-format models should match on both fields.
	 *
	 * Known CAPI values as of 2026-04-30:
	 * - `vendor`: `'Anthropic'` (capitalized)
	 * - `supported_endpoints`: `'/v1/messages'` for Anthropic chat models
	 */
	models(githubToken: string, options?: ICopilotApiServiceRequestOptions): Promise<CCAModel[]>;
}

export class CopilotApiService implements ICopilotApiService {

	declare readonly _serviceBrand: undefined;

	private _capiBasePromise: Promise<ICapiBase> | null = null;
	private readonly _clientsByToken = new Map<string, Promise<ICachedClient>>();
	private readonly _fetch: FetchFunction;

	constructor(
		fetchFn: FetchFunction | undefined,
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
	) {
		this._fetch = fetchFn ?? globalThis.fetch;
	}

	// #region Public API

	messages(
		githubToken: string,
		request: Anthropic.MessageCreateParamsStreaming,
		options?: ICopilotApiServiceRequestOptions,
	): AsyncGenerator<Anthropic.MessageStreamEvent>;
	messages(
		githubToken: string,
		request: Anthropic.MessageCreateParamsNonStreaming,
		options?: ICopilotApiServiceRequestOptions,
	): Promise<Anthropic.Message>;
	messages(
		githubToken: string,
		request: Anthropic.MessageCreateParams,
		options?: ICopilotApiServiceRequestOptions,
	): AsyncGenerator<Anthropic.MessageStreamEvent> | Promise<Anthropic.Message> {
		if (request.stream) {
			return this._messagesStreaming(githubToken, request, options);
		}
		return this._messagesNonStreaming(githubToken, request, options);
	}

	async countTokens(
		_githubToken: string,
		_req: Anthropic.MessageCountTokensParams,
		_options?: ICopilotApiServiceRequestOptions,
	): Promise<Anthropic.MessageTokensCount> {
		throw new Error('countTokens not supported by CAPI');
	}

	async models(githubToken: string, options?: ICopilotApiServiceRequestOptions): Promise<CCAModel[]> {
		const capiClient = await this._getClientForToken(githubToken);

		this._logService.debug('[CopilotApiService] GET models');

		const response = await capiClient.makeRequest<Response>(
			{
				method: 'GET',
				headers: {
					...options?.headers,
					'Authorization': `Bearer ${githubToken}`,
				},
				signal: options?.signal,
			},
			{ type: RequestType.Models },
		);

		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				this._invalidateClientForToken(githubToken);
			}
			const text = await response.text().catch(() => '');
			throw buildCopilotApiHttpError(response.status, response.statusText, text, 'CAPI models request failed');
		}

		const json = await response.json();
		return json.data ?? [];
	}

	// #endregion

	// #region Lazy Init

	private _getCapiBase(): Promise<ICapiBase> {
		if (!this._capiBasePromise) {
			this._capiBasePromise = this._buildCapiBase().catch(err => {
				this._capiBasePromise = null;
				throw err;
			});
		}
		return this._capiBasePromise;
	}

	private async _buildCapiBase(): Promise<ICapiBase> {
		const [machineId, deviceId] = await Promise.all([
			getMachineId(err => this._logService.warn('[CopilotApiService] getMachineId failed', err)),
			getDevDeviceId(err => this._logService.warn('[CopilotApiService] getDevDeviceId failed', err)),
		]);

		const extensionInfo: IExtensionInformation = {
			name: 'agent-host',
			sessionId: generateUuid(),
			machineId,
			deviceId,
			vscodeVersion: this._productService.version,
			version: this._productService.version,
			buildType: this._productService.quality === 'stable' ? 'prod' : 'dev',
		};

		// The user-info endpoint is hosted on api.github.com for consumer accounts.
		// For GitHub Enterprise the host changes, but we don't currently support
		// GHE in the agent host — see CopilotAgent for the same assumption.
		const userUrl = 'https://api.github.com/copilot_internal/user';

		return { extensionInfo, userUrl };
	}

	// #endregion

	// #region Streaming

	private async *_messagesStreaming(
		githubToken: string,
		request: Anthropic.MessageCreateParams,
		options?: ICopilotApiServiceRequestOptions,
	): AsyncGenerator<Anthropic.MessageStreamEvent> {
		const response = await this._sendRequest(githubToken, request, true, options);

		if (!response.body) {
			throw new Error('CAPI response has no body');
		}

		yield* this._readSSE(response.body);
	}

	// #endregion

	// #region Non-Streaming

	private async _messagesNonStreaming(
		githubToken: string,
		request: Anthropic.MessageCreateParams,
		options?: ICopilotApiServiceRequestOptions,
	): Promise<Anthropic.Message> {
		const response = await this._sendRequest(githubToken, request, false, options);
		return response.json() as Promise<Anthropic.Message>;
	}

	// #endregion

	// #region Shared Request

	private async _sendRequest(
		githubToken: string,
		request: Anthropic.MessageCreateParams,
		stream: boolean,
		options?: ICopilotApiServiceRequestOptions,
	): Promise<Response> {
		const capiClient = await this._getClientForToken(githubToken);
		const requestId = generateUuid();

		this._logService.debug('[CopilotApiService] POST messages', `model=${request.model} stream=${stream} requestId=${requestId}`);

		const { system, ...rest } = request;
		const body = JSON.stringify({
			...rest,
			stream,
			// CAPI requires system as a text-block array, not a raw string
			...(system !== undefined
				? { system: typeof system === 'string' ? [{ type: 'text', text: system }] : system }
				: {}),
		});

		const response = await capiClient.makeRequest<Response>(
			{
				method: 'POST',
				headers: {
					...options?.headers,
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${githubToken}`,
					'X-Request-Id': requestId,
					'OpenAI-Intent': 'conversation',
				},
				body,
				signal: options?.signal,
			},
			{ type: RequestType.ChatMessages },
		);
		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				this._invalidateClientForToken(githubToken);
			}
			const text = await response.text().catch(() => '');
			throw buildCopilotApiHttpError(response.status, response.statusText, text);
		}

		return response;
	}

	// #endregion

	// #region Per-Token Client

	/**
	 * Resolve a {@link CAPIClient} that has had its domains updated for the
	 * supplied user. Concurrent callers for the same token share one
	 * `/copilot_internal/user` discovery via the cache map; callers with
	 * different tokens get their **own** `CAPIClient` instance, so the
	 * `updateDomains` mutation for token A can never affect a request being
	 * dispatched for token B.
	 */
	private _getClientForToken(githubToken: string): Promise<CAPIClient> {
		const nowSeconds = Date.now() / 1000;
		const existing = this._clientsByToken.get(githubToken);
		if (existing) {
			return existing.then(entry => {
				if (entry.expiresAt - nowSeconds > CAPI_CONTEXT_REFRESH_BUFFER_SECONDS) {
					return entry.capiClient;
				}
				// Stale — evict and recurse to build a fresh entry.
				this._clientsByToken.delete(githubToken);
				return this._getClientForToken(githubToken);
			}).catch(err => {
				// A previous failed build leaked into the cache; evict and rebuild.
				this._clientsByToken.delete(githubToken);
				throw err;
			});
		}

		// Omit the caller's signal here: a deduped build is shared across
		// concurrent callers, so aborting one must not cancel it for the
		// others. Each caller still forwards its signal to the API call.
		const pending = this._buildClientForToken(githubToken).catch(err => {
			this._clientsByToken.delete(githubToken);
			throw err;
		});
		this._clientsByToken.set(githubToken, pending);
		return pending.then(entry => entry.capiClient);
	}

	private _invalidateClientForToken(githubToken: string): void {
		this._clientsByToken.delete(githubToken);
	}

	private async _buildClientForToken(githubToken: string): Promise<ICachedClient> {
		const { extensionInfo, userUrl } = await this._getCapiBase();
		const fetch = this._fetch;
		const capiClient = new CAPIClient(extensionInfo, undefined, {
			fetch: (url, options) => fetch(url, {
				method: options.method ?? 'GET',
				headers: options.headers,
				body: options.body,
				signal: options.signal as AbortSignal | undefined,
			}),
		});

		this._logService.debug('[CopilotApiService] Discovering CAPI endpoints via /copilot_internal/user');

		const response = await this._fetch(userUrl, {
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${githubToken}`,
				'Accept': 'application/json',
				'X-GitHub-Api-Version': USER_API_VERSION,
			},
		});

		if (!response.ok) {
			const text = await response.text().catch(() => '');
			throw new Error(`Copilot endpoint discovery failed: ${response.status} ${response.statusText} — ${text}`);
		}

		const envelope: ICopilotUserResponse = await response.json();

		capiClient.updateDomains(
			{ endpoints: envelope.endpoints ?? {}, sku: envelope.access_type_sku ?? '' },
			undefined,
		);

		this._logService.debug('[CopilotApiService] CAPI endpoint discovered, api=', envelope.endpoints?.api);

		return {
			capiClient,
			expiresAt: Date.now() / 1000 + CAPI_CONTEXT_TTL_SECONDS,
		};
	}

	// #endregion

	// #region SSE Parsing

	private async *_readSSE(body: ReadableStream<Uint8Array>): AsyncGenerator<Anthropic.MessageStreamEvent> {
		const reader = body.getReader();
		const decoder = new TextDecoder();
		let buffer = '';

		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) {
					break;
				}

				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					const event = this._parseDataLine(line);
					if (event !== undefined) {
						yield event;
						if (event.type === 'message_stop') {
							return;
						}
					}
				}
			}

			if (buffer.trim()) {
				const event = this._parseDataLine(buffer);
				if (event !== undefined) {
					yield event;
					if (event.type === 'message_stop') {
						return;
					}
				}
			}
		} finally {
			// Cancel the underlying stream so the HTTP connection is released
			// even when the consumer abandons the generator early (break, throw,
			// abort) or the stream ended on `message_stop` with bytes still in
			// flight. `releaseLock` alone leaves the body half-read.
			try {
				await reader.cancel();
			} catch {
				// ignore — cancellation is best-effort cleanup
			}
			reader.releaseLock();
		}
	}

	/**
	 * @returns the parsed stream event, or `undefined` to skip the line.
	 * @throws on `error` events from the server.
	 */
	private _parseDataLine(line: string): Anthropic.MessageStreamEvent | undefined {
		if (!line.startsWith('data: ')) {
			return undefined;
		}

		const data = line.slice('data: '.length).trim();

		let parsed: unknown;
		try {
			parsed = JSON.parse(data);
		} catch {
			this._logService.warn('[CopilotApiService] Failed to parse SSE data:', data);
			return undefined;
		}

		if (typeof parsed !== 'object' || parsed === null) {
			return undefined;
		}

		const record = parsed as Record<string, unknown>;
		const type = record.type;
		if (typeof type !== 'string') {
			return undefined;
		}

		if (type === 'error') {
			// Preserve the upstream envelope verbatim when it conforms to the
			// Anthropic shape (so any extra fields propagate to Phase 2's
			// passthrough proxy). Fall back to a clean api_error synthesis
			// when fields are missing or `error` is unstructured.
			const rawError = (parsed as { error?: unknown }).error;
			let envelope: Anthropic.ErrorResponse;
			if (
				rawError && typeof rawError === 'object'
				&& typeof (rawError as { type?: unknown }).type === 'string'
				&& typeof (rawError as { message?: unknown }).message === 'string'
			) {
				envelope = parsed as Anthropic.ErrorResponse;
			} else {
				let errorMessage: string;
				if (typeof rawError === 'string') {
					errorMessage = rawError;
				} else if (typeof (rawError as { message?: unknown } | undefined)?.message === 'string') {
					errorMessage = (rawError as { message: string }).message;
				} else {
					errorMessage = 'Unknown streaming error';
				}
				envelope = {
					type: 'error',
					error: { type: 'api_error', message: errorMessage },
					request_id: null,
				};
			}
			throw new CopilotApiError(COPILOT_API_ERROR_STATUS_STREAMING, envelope);
		}

		if (!KNOWN_SSE_EVENT_TYPES.has(type)) {
			return undefined;
		}

		return parsed as Anthropic.MessageStreamEvent;
	}

	// #endregion
}

const KNOWN_SSE_EVENT_TYPES = new Set([
	'message_start', 'message_delta', 'message_stop',
	'content_block_start', 'content_block_delta', 'content_block_stop',
]);
