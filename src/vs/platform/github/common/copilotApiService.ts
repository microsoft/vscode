/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import type { CAPIClient, CCAModel, IExtensionInformation } from '@vscode/copilot-api';
import { generateUuid } from '../../../base/common/uuid.js';
import { Disposable, DisposableMap, IReference, MutableDisposable, toDisposable } from '../../../base/common/lifecycle.js';
import { Event } from '../../../base/common/event.js';
import { getInternalOrg, isInternalAccount } from '../../assignment/common/assignment.js';
import { COPILOT_LICENSE_AGREEMENT } from '../../endpoint/common/licenseAgreement.js';
import { IGitHubBootstrapClient, IGitHubService } from './githubService.js';
import { systemRequestScheduler } from './scheduler.js';
import { GitHubRequestRateLimitError } from './githubTypes.js';
import { RequestError, RequestRateLimitError, RequestTimeoutError } from './types.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { ILogService } from '../../log/common/log.js';
import { IInFlightOperation, OperationWaiters } from './operationWaiters.js';
import { ControlTransport } from './controlTransport.js';
import { parseRetryAfter } from './httpHeaders.js';
import { getResponseError, parseResponseJson } from './responseReader.js';

// #region Types

/**
 * Per-call transport options for all {@link ICopilotApiService} methods.
 *
 * `headers` are merged into the outgoing CAPI request before security-
 * sensitive headers (`Authorization`, `Content-Type`, `X-Request-Id`,
 * `OpenAI-Intent`), so callers cannot override those.
 *
 * `signal` cancels the caller's discovery waiter without cancelling peers.
 */
export interface ICopilotApiServiceRequestOptions {
	readonly headers?: Readonly<Record<string, string>>;
	readonly signal?: AbortSignal;
	/** Absolute deadline for discovery/catalog reads; does not impose a streaming lifetime. */
	readonly deadline?: number;

	/**
	 * Suppress the `Copilot-Integration-Id` header on this request.
	 *
	 * When unset, `@vscode/copilot-api` derives the integration id from the
	 * discovered Copilot SKU: a `no_auth_limited_copilot` SKU maps to
	 * `vscode-nl`, which the CAPI backend treats as the limited/no-auth
	 * integration and refuses premium models such as `claude-opus-4.7`.
	 * Setting this to `true` omits the header so CAPI authorizes against the
	 * token's real entitlement. Mirrors the Copilot Chat extension's
	 * `ClaudeStreamingPassThroughEndpoint.getEndpointFetchOptions()`.
	 */
	readonly suppressIntegrationId?: boolean;
}

/**
 * One chat message in a {@link ICopilotUtilityChatCompletionRequest}.
 * Mirrors the OpenAI Chat Completions message shape CAPI accepts.
 */
export interface ICopilotUtilityChatMessage {
	readonly role: 'system' | 'user' | 'assistant';
	readonly content: string;
}

/**
 * Inputs for {@link ICopilotApiService.utilityChatCompletion}.
 *
 * Callers own prompt construction — typically a `'system'` rules message
 * followed by one or more `'user'` messages, matching the Copilot Chat
 * extension's `copilot-utility-small` prompts (see
 * `GitCommitMessagePrompt`'s `SystemMessage` + `UserMessage` pair). This
 * service forwards the messages and returns the assistant text.
 *
 * `temperature` defaults to `0.1` (matching the Copilot Chat extension's
 * default `IConversationOptions.temperature`). `top_p` and the model family
 * are fixed defaults inside the service. Callers may set `maxTokens` when
 * their utility flow has a naturally bounded output.
 */
export interface ICopilotUtilityChatCompletionRequest {
	readonly messages: readonly ICopilotUtilityChatMessage[];
	readonly temperature?: number;
	readonly maxTokens?: number;
}

/**
 * Subset of the GitHub `copilot_internal/user` response we care about.
 * Provides CAPI routing and SKU data together with the account metadata used
 * for restricted and internal telemetry.
 */
interface ICopilotUserResponse {
	readonly login?: string;
	readonly copilotignore_enabled?: boolean;
	readonly restricted_telemetry?: boolean;
	readonly analytics_tracking_id?: string;
	readonly is_staff?: boolean;
	readonly organization_login_list?: readonly string[];
	readonly endpoints?: {
		readonly api?: string;
		readonly telemetry?: string;
		readonly proxy?: string;
		readonly 'origin-tracker'?: string;
	};
	readonly access_type_sku?: string;
}

/** Discovered Copilot routing, entitlement metadata and per-credential model selections. */
interface ICachedClient {
	readonly context: CopilotClientContext;
	readonly capiClient: CAPIClient;
	readonly expiresAt: number;
	readonly utilityModelIdsByFamily: Map<string, string>;
	/** The raw Copilot entitlement SKU returned by `/copilot_internal/user`, when present. */
	readonly copilotSku?: string;
	/** GitHub login returned by `/copilot_internal/user`, when present. */
	readonly login?: string;
	/** The CAPI `endpoints.telemetry` base URL discovered for this token, if any. */
	readonly telemetryEndpoint?: string;
	/** The CAPI `endpoints.api` base URL discovered (or overridden) for this token, if any. */
	readonly apiEndpoint?: string;
	readonly copilotIgnoreEnabled?: boolean;
	readonly restrictedTelemetryEnabled: boolean;
	readonly trackingId?: string;
	readonly isInternal: boolean;
	readonly isVscodeTeamMember: boolean;
}

/** Stable reader cell that follows same-credential refresh until permanently invalidated. */
interface ICopilotSkuCacheCell {
	valid: boolean;
	value?: ICachedClient;
}

/** Token-specific discovery state and captured metadata, owned by the Copilot service. */
class CopilotClientContext extends Disposable {
	readonly id = generateUuid();
	readonly controller = new AbortController();
	readonly bootstrapClient = this._register(new MutableDisposable<IReference<IGitHubBootstrapClient>>());
	readonly skuCell: ICopilotSkuCacheCell = { valid: true };
	discovery: IInFlightOperation<ICachedClient> | undefined;
	telemetryCaptured = false;
	expiresAt = Date.now() + CAPI_CONTEXT_TTL_SECONDS * 1000;

	constructor(readonly accountId: string | undefined) {
		super();
	}

	expire(): void {
		this.skuCell.value = undefined;
		this.bootstrapClient.clear();
		this.expiresAt = Number.POSITIVE_INFINITY;
	}

	override dispose(): void {
		this.skuCell.valid = false;
		this.skuCell.value = undefined;
		this.controller.abort(new Error('Copilot credential context was invalidated'));
		this.discovery?.controller.abort(this.controller.signal.reason);
		super.dispose();
	}
}

/**
 * Memoized parts of `CAPIClient` construction that don't depend on the user
 * token. Built once and reused by every per-token client.
 */
interface ICapiBase {
	readonly extensionInfo: IExtensionInformation;
}

/** Hosting-owned GitHub discovery and enterprise routing endpoints for Copilot. */
export interface ICopilotApiEndpointProvider {
	readonly onDidChange: Event<void>;
	getApiBaseUri(): string;
	getEnterpriseUri(): string | undefined;
}

/** Protocol implementation and host integration required by the portable Copilot API service. */
export interface ICopilotApiServiceOptions {
	readonly api: typeof import('@vscode/copilot-api');
	readonly fetch?: FetchFunction;
	readonly endpoints: ICopilotApiEndpointProvider;
	getExtensionInformation(): Promise<IExtensionInformation>;
	/** Host-supplied quota provenance, never used to authorize or share private responses. */
	getAccountId?(githubToken: string): string | undefined;
	/** Hosting-owned, validated endpoint override for local test execution. */
	getApiUrlOverride?(): string | undefined;
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
const copilotControlTimeout = 30_000;
/** Conservative wait for CAPI 429/529 responses without a usable Retry-After hint. */
const copilotUnhintedRateLimitCooldown = 60_000;

function controlDeadline(value?: number): number {
	if (value !== undefined && !Number.isFinite(value)) {
		throw new RequestError('Invalid Copilot control deadline', 'validation');
	}
	const now = Date.now();
	const deadline = Math.min(value ?? Infinity, now + copilotControlTimeout);
	if (deadline <= now) {
		throw new RequestTimeoutError();
	}
	return deadline;
}

/**
 * Default CAPI model family for {@link ICopilotApiService.utilityChatCompletion}.
 * Matches the Copilot Chat extension's `copilot-utility-small` resolver
 * (`CopilotUtilitySmallChatEndpoint.capiFamily === CHAT_MODEL.GPT4OMINI`).
 */
const UTILITY_DEFAULT_MODEL_FAMILY = 'gpt-4o-mini';

/**
 * Default `temperature` for utility chat completions. Matches the Copilot
 * Chat extension's default `IConversationOptions.temperature`.
 */
const UTILITY_DEFAULT_TEMPERATURE = 0.1;

/**
 * Default `top_p` for utility chat completions. Matches the Copilot Chat
 * extension's default `IConversationOptions.topP`.
 */
const UTILITY_DEFAULT_TOP_P = 1;

/**
 * `OpenAI-Intent` value for utility chat completions. Matches the extension
 * vocabulary `'conversation-background'` for non-user-initiated utility
 * calls (chat title generation, commit messages, branch names, etc.).
 */
const UTILITY_INTENT = 'conversation-background';

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
		readonly code?: string,
		readonly retryAfterMs?: number,
	) {
		super(message ?? envelope.error.message);
		this.name = 'CopilotApiError';
	}
}

function copilotCooldownError(retryAfterMs: number): CopilotApiError {
	return new CopilotApiError(429, {
		type: 'error',
		error: { type: 'rate_limit_error', message: 'The Copilot server cooldown exceeds the remaining request budget' },
		request_id: null,
	}, undefined, 'rate_limited', retryAfterMs);
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
	let code: string | undefined;
	if (bodyText) {
		try {
			const parsed = JSON.parse(bodyText) as unknown;
			const detail = getResponseError(parsed);
			code = detail?.code;
			if (
				parsed && typeof parsed === 'object'
				&& Reflect.get(parsed, 'type') === 'error'
				&& typeof detail?.type === 'string'
				&& typeof detail.message === 'string'
			) {
				envelope = parsed as Anthropic.ErrorResponse;
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
		code,
	);
}

// #endregion

export type FetchFunction = typeof globalThis.fetch;

export const ICopilotApiService = createDecorator<ICopilotApiService>('copilotApiService');

/**
 * Portable gateway to GitHub Copilot's CAPI proxy
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
 * - Per-conversation history and inference retry/streaming governance.
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
 * - Discovery and model reads share bounded work with independent caller
 *   cancellation; their last waiter cancels the underlying request.
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
/**
 * Restricted/enhanced telemetry context derived from the GitHub `/copilot_internal/user` response.
 */
export interface IRestrictedTelemetryContext {
	/** Whether `/copilot_internal/user` enables enhanced/restricted telemetry. */
	readonly restrictedTelemetryEnabled: boolean;
	/** The Copilot analytics tracking ID, or `undefined` when absent. */
	readonly trackingId: string | undefined;
	/** The CAPI `endpoints.telemetry` base URL, resolved only when enabled; `undefined` otherwise. */
	readonly telemetryEndpoint: string | undefined;
	/** Whether the account is staff or belongs to an internal organization. */
	readonly isInternal?: boolean;
	/** GitHub login returned by `/copilot_internal/user`. */
	readonly userName?: string;
	/** Whether the token identifies a VS Code team member. */
	readonly isVscodeTeamMember?: boolean;
	/** Whether content exclusion is enabled; undefined when discovery could not determine it. */
	readonly copilotIgnoreEnabled?: boolean;
}

/** Typed Copilot discovery, model catalog and inference operations with explicit credentials. */
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

	/**
	 * Pass-through to CAPI's OpenAI-shaped Responses endpoint
	 * (`{capiBaseUrl}/responses`). Used by `CodexProxyService` to forward
	 * `/v1/responses` requests from the Codex CLI without deserializing
	 * the body. The caller owns the returned `Response` (its body and any
	 * streaming) and is responsible for consuming or aborting it.
	 *
	 * @throws on non-2xx upstream response.
	 */
	responses(
		githubToken: string,
		body: string,
		options?: ICopilotApiServiceRequestOptions,
	): Promise<Response>;

	/**
	 * Send arbitrary user chat messages through CAPI's `/chat/completions`
	 * endpoint and return the assistant text.
	 *
	 * Uses the supplied GitHub OAuth token directly. This is the same
	 * credential flow as the other CAPI model endpoints. Uses the `gpt-4o-mini`
	 * model family with `top_p = 1` and `temperature = 0.1` by default
	 * (override via `request.temperature`).
	 *
	 * Non-streaming. Callers own prompt construction and any
	 * domain-specific parsing of the returned text.
	 *
	 * @throws {@link CopilotApiError} on non-2xx CAPI response.
	 * @throws plain `Error` when no model in the requested family is
	 * available or when the response contains no text content.
	 */
	utilityChatCompletion(
		githubToken: string,
		request: ICopilotUtilityChatCompletionRequest,
		options?: ICopilotApiServiceRequestOptions,
	): Promise<string>;

	/**
	 * Resolve this user's restricted-telemetry context from `/copilot_internal/user`.
	 * The telemetry endpoint is returned only when restricted telemetry is enabled.
	 */
	resolveRestrictedTelemetryContext(githubToken: string): Promise<IRestrictedTelemetryContext>;

	/**
	 * Resolve the CAPI `endpoints.api` base URL discovered for this GitHub token
	 * (or the loopback test override), or `undefined` when discovery hasn't run
	 * or failed. The effective CAPI host varies by account (consumer
	 * `api.githubcopilot.com` vs. Enterprise / proxy), so callers that need the
	 * real host — e.g. to resolve the correct proxy — should prefer this over the
	 * hardcoded default.
	 */
	resolveApiEndpoint(githubToken: string): Promise<string | undefined>;

	/** Resolve the GitHub login cached from `/copilot_internal/user`. */
	resolveUserLogin?(githubToken: string): Promise<string | undefined>;

	/** Resolve the raw Copilot entitlement SKU cached from `/copilot_internal/user`. */
	resolveCopilotSku?(githubToken: string): Promise<string | undefined>;

	/** Read the SKU only while its account discovery cache entry remains usable. */
	getCachedCopilotSku?(githubToken: string): string | undefined;

	/** Capture a SKU reader that is permanently invalidated when this credential's cache is rejected. */
	captureCopilotSku?(githubToken: string): () => string | undefined;
}

/** Owns Copilot protocol semantics while reusing common bounded request mechanisms. */
export class CopilotApiService extends Disposable implements ICopilotApiService {

	declare readonly _serviceBrand: undefined;

	private _capiBase: ICapiBase | undefined;
	private _capiBaseRequest: IInFlightOperation<ICapiBase> | undefined;
	private readonly _clientsByToken = this._register(new DisposableMap<string, CopilotClientContext>());
	private readonly _cacheExpiry = this._register(new MutableDisposable());
	private readonly _lifetime = new AbortController();
	private readonly _controlTransport: ControlTransport;
	private readonly _fetch: FetchFunction;

	constructor(
		private readonly _options: ICopilotApiServiceOptions,
		@ILogService private readonly _logService: ILogService,
		@IGitHubService private readonly _gitHubService: IGitHubService,
	) {
		super();
		this._fetch = _options.fetch ?? globalThis.fetch;
		this._controlTransport = this._register(new ControlTransport({
			caller: 'copilot.models',
			resource: 'copilot.models',
			requestTimeout: copilotControlTimeout,
			maximumResponseBytes: 16 * 1024 * 1024,
			maximumSharedWaiters: 64,
			getResponseCooldown: (response, now) => {
				const seconds = parseRetryAfter(response.headers.get('retry-after'), now);
				return seconds !== undefined && seconds > 0 ? seconds * 1000
					: response.status === 429 || response.status === 529 ? copilotUnhintedRateLimitCooldown : 0;
			},
		}, _logService));
		this._register(_options.endpoints.onDidChange(() => this._clearClients()));
		this._register(toDisposable(() => {
			this._lifetime.abort(new Error('Copilot API service was disposed'));
			this._clearClients();
		}));
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
		const deadline = controlDeadline(options?.deadline);
		const entry = await this._getEntryForToken(githubToken, options?.signal, deadline);
		const { capiClient, context } = entry;
		const endpoint = new URL(capiClient.capiPingURL);
		const signal = AbortSignal.any([options?.signal ?? this._lifetime.signal, context.controller.signal]);
		const key = JSON.stringify([context.id, [...new Headers(options?.headers)].sort(([a], [b]) => a.localeCompare(b)), options?.suppressIntegrationId === true]);

		this._logService.debug('[CopilotApiService] GET models');

		const response = await this._controlTransport.get(key, {
			kind: 'bootstrap', host: endpoint.host, origin: endpoint.origin, accountId: context.accountId,
		}, signal, deadline, signal => capiClient.makeRequest<Response>(
			{
				method: 'GET',
				callSite: 'copilot.models',
				headers: {
					...options?.headers,
					'Authorization': `Bearer ${githubToken}`,
				},
				// Opt-in per request — see
				// `ICopilotApiServiceRequestOptions.suppressIntegrationId`.
				suppressIntegrationId: options?.suppressIntegrationId,
				signal,
			},
			{ type: this._options.api.RequestType.Models },
		)).catch(error => {
			if (error instanceof RequestRateLimitError) {
				throw copilotCooldownError(error.retryAfterMs);
			}
			throw error;
		});

		if (response.status < 200 || response.status >= 300) {
			if (response.status === 401 || response.status === 403) {
				this._invalidateClientForToken(githubToken, capiClient);
			}
			throw buildCopilotApiHttpError(response.status, response.statusText, response.body, 'CAPI models request failed');
		}

		const json = parseResponseJson<{ data?: CCAModel[] } | null>(response.body,
			() => new RequestError('CAPI model discovery returned invalid JSON', 'malformedResponse'));
		if (!json || !Array.isArray(json.data)) {
			throw new RequestError('CAPI model discovery returned an invalid model list', 'malformedResponse');
		}
		return json.data;
	}

	async responses(
		githubToken: string,
		body: string,
		options?: ICopilotApiServiceRequestOptions,
	): Promise<Response> {
		const capiClient = await this._getClientForToken(githubToken, options?.signal);
		const requestId = generateUuid();

		// Parse the request body to log the model being sent (debug aid; failures
		// are non-fatal — the body is forwarded byte-for-byte regardless).
		let requestModel = '<unknown>';
		try {
			const parsed = JSON.parse(body);
			requestModel = parsed.model ?? '<none>';
		} catch { /* ignore parse errors */ }
		this._logService.info(`[CopilotApiService] POST responses: requestId=${requestId}, model=${requestModel}`);

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
				// Opt-in per request — see
				// `ICopilotApiServiceRequestOptions.suppressIntegrationId`.
				suppressIntegrationId: options?.suppressIntegrationId,
				body,
				signal: options?.signal,
			},
			{ type: this._options.api.RequestType.ChatResponses },
		);

		this._logService.info(`[CopilotApiService] responses status=${response.status}, requestId=${requestId}`);

		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				this._invalidateClientForToken(githubToken, capiClient);
			}
			const text = await response.text().catch(() => '');
			throw buildCopilotApiHttpError(response.status, response.statusText, text, 'CAPI responses request failed');
		}
		return response;
	}

	async utilityChatCompletion(
		githubToken: string,
		request: ICopilotUtilityChatCompletionRequest,
		options?: ICopilotApiServiceRequestOptions,
	): Promise<string> {
		const capiClient = await this._getClientForToken(githubToken, options?.signal);
		const modelId = await this._resolveUtilityModelId(githubToken, UTILITY_DEFAULT_MODEL_FAMILY, options?.signal);
		const requestId = generateUuid();

		this._logService.debug('[CopilotApiService] POST chat completions', `model=${modelId} requestId=${requestId}`);

		const body = JSON.stringify({
			model: modelId,
			messages: request.messages.map(m => ({ role: m.role, content: m.content })),
			stream: false,
			temperature: request.temperature ?? UTILITY_DEFAULT_TEMPERATURE,
			top_p: UTILITY_DEFAULT_TOP_P,
			max_tokens: request.maxTokens,
		});

		const response = await capiClient.makeRequest<Response>(
			{
				method: 'POST',
				headers: {
					...options?.headers,
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${githubToken}`,
					'X-Request-Id': requestId,
					'OpenAI-Intent': UTILITY_INTENT,
				},
				body,
				signal: options?.signal,
			},
			{ type: this._options.api.RequestType.ChatCompletions },
		);

		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				this._invalidateClientForToken(githubToken, capiClient);
			}
			const text = await response.text().catch(() => '');
			throw buildCopilotApiHttpError(response.status, response.statusText, text, 'CAPI chat completion request failed');
		}

		const json = await response.json() as { choices?: ReadonlyArray<{ message?: { content?: unknown } }> };
		const content = json?.choices?.[0]?.message?.content;
		if (typeof content !== 'string') {
			throw new Error('CAPI chat completion returned no text content');
		}
		return content;
	}

	// #endregion

	// #region Lazy Init

	private _getCapiBase(signal: AbortSignal, deadline: number): Promise<ICapiBase> {
		if (this._capiBase) {
			return Promise.resolve(this._capiBase);
		}
		if (!this._capiBaseRequest) {
			const shared: IInFlightOperation<ICapiBase> = { controller: this._lifetime, deadline, waiters: new OperationWaiters() };
			this._capiBaseRequest = shared;
			void this._buildCapiBase().then(value => {
				this._capiBaseRequest = undefined;
				if (!this._store.isDisposed) {
					this._capiBase = value;
				}
				shared.waiters.resolve(value);
			}, error => {
				this._capiBaseRequest = undefined;
				shared.waiters.reject(error);
			});
		}
		return this._capiBaseRequest.waiters.wait(signal, deadline, systemRequestScheduler, () => new RequestTimeoutError());
	}

	private async _buildCapiBase(): Promise<ICapiBase> {
		return { extensionInfo: await this._options.getExtensionInformation() };
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
		const capiClient = await this._getClientForToken(githubToken, options?.signal);
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
					'X-GitHub-Api-Version': '2026-01-09',
					// Should these be parameterized?
					'OpenAI-Intent': 'messages-proxy',
					'X-Interaction-Type': 'messages-proxy',
					// `X-Initiator` (user|agent) is intentionally omitted: the
					// user-vs-agent turn origin known to `ClaudeAgentSession` is not
					// plumbed across the SDK subprocess to this proxy, so a hardcoded
					// value would mislabel most agent-loop traffic. CAPI accepts the
					// request without it (the `responses()` and `utilityChatCompletion()`
					// paths already omit it). Thread a real per-turn initiator here if
					// that signal ever becomes available at the proxy boundary.
				},
				suppressIntegrationId: options?.suppressIntegrationId,
				body,
				signal: options?.signal,
			},
			{ type: this._options.api.RequestType.ChatMessages },
		);
		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				this._invalidateClientForToken(githubToken, capiClient);
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
	private _getClientForToken(githubToken: string, signal?: AbortSignal): Promise<CAPIClient> {
		return this._getEntryForToken(githubToken, signal).then(entry => entry.capiClient);
	}

	async resolveRestrictedTelemetryContext(githubToken: string): Promise<IRestrictedTelemetryContext> {
		const client = await this._getEntryForToken(githubToken);
		const telemetryEndpoint = client.restrictedTelemetryEnabled
			? client.telemetryEndpoint
			: undefined;
		return {
			restrictedTelemetryEnabled: client.restrictedTelemetryEnabled,
			trackingId: client.trackingId,
			telemetryEndpoint,
			isInternal: client.isInternal,
			userName: client.login,
			isVscodeTeamMember: client.isVscodeTeamMember,
			copilotIgnoreEnabled: client.copilotIgnoreEnabled,
		};
	}

	async resolveApiEndpoint(githubToken: string): Promise<string | undefined> {
		return (await this._getEntryForToken(githubToken)).apiEndpoint;
	}

	async resolveUserLogin(githubToken: string): Promise<string | undefined> {
		return (await this._getEntryForToken(githubToken)).login;
	}

	async resolveCopilotSku(githubToken: string): Promise<string | undefined> {
		return (await this._getEntryForToken(githubToken)).copilotSku;
	}

	getCachedCopilotSku(githubToken: string): string | undefined {
		return this._readCopilotSku(this._clientsByToken.get(githubToken)?.skuCell);
	}

	captureCopilotSku(githubToken: string): () => string | undefined {
		if (this._store.isDisposed) {
			return () => undefined;
		}
		const request = this._getOrCreateClientRequest(githubToken);
		request.telemetryCaptured = true;
		const cell = request.skuCell;
		return () => this._readCopilotSku(cell);
	}

	protected invalidateCredential(githubToken: string): void {
		const context = this._clientsByToken.get(githubToken);
		if (context) {
			this._invalidateClientRequest(githubToken, context);
		}
	}

	private async _getEntryForToken(githubToken: string, signal: AbortSignal = this._lifetime.signal, deadline = controlDeadline()): Promise<ICachedClient> {
		signal.throwIfAborted();
		this._lifetime.signal.throwIfAborted();
		const nowSeconds = Date.now() / 1000;
		const request = this._getOrCreateClientRequest(githubToken);
		signal = AbortSignal.any([signal, request.controller.signal]);
		const existing = request.skuCell.value;
		if (existing && !request.discovery && existing.expiresAt - nowSeconds > CAPI_CONTEXT_REFRESH_BUFFER_SECONDS) {
			return existing;
		}

		if (!request.discovery) {
			const shared: IInFlightOperation<ICachedClient> = {
				controller: new AbortController(), deadline: controlDeadline(), waiters: new OperationWaiters(),
			};
			request.discovery = shared;
			void this._buildClientForToken(githubToken, request, shared.controller.signal, shared.deadline, time => shared.waiters.setBlockedUntil(time)).then(entry => {
				const current = request.discovery === shared;
				const error = shared.controller.signal.aborted ? shared.controller.signal.reason
					: shared.deadline <= Date.now() ? new RequestTimeoutError() : undefined;
				if (current) {
					request.discovery = undefined;
				}
				if (!error && current && this._clientsByToken.get(githubToken) === request && request.skuCell.valid) {
					request.skuCell.value = entry;
					request.expiresAt = entry.expiresAt * 1000;
					this._scheduleCacheExpiry();
				}
				if (error) {
					shared.waiters.reject(error);
				} else {
					shared.waiters.resolve(entry);
				}
			}, error => {
				const current = request.discovery === shared;
				if (current) {
					request.discovery = undefined;
				}
				shared.waiters.reject(error);
				if (current && this._clientsByToken.get(githubToken) === request && request.skuCell.valid) {
					if (error instanceof CopilotApiError && (error.status === 401 || error.status === 403)) {
						this._invalidateClientRequest(githubToken, request);
					} else if (existing && existing.expiresAt > Date.now() / 1000) {
						request.skuCell.value = existing;
					} else if (request.telemetryCaptured) {
						request.skuCell.value = undefined;
					} else {
						this._invalidateClientRequest(githubToken, request);
					}
				}
			});
		}
		const shared = request.discovery;
		if (shared.waiters.size >= 64) {
			throw new RequestError('Copilot discovery waiter capacity exceeded', 'overloaded');
		}
		try {
			return await shared.waiters.wait(signal, deadline, systemRequestScheduler, () => new RequestTimeoutError(), {
				error: copilotCooldownError,
			});
		} finally {
			if (shared.waiters.size === 0 && request.discovery === shared) {
				request.discovery = undefined;
				shared.controller.abort(new Error('All Copilot discovery waiters cancelled'));
				if (!request.skuCell.value && !request.telemetryCaptured) {
					this._invalidateClientRequest(githubToken, request);
				}
			}
		}
	}

	private _getOrCreateClientRequest(githubToken: string): CopilotClientContext {
		if (!githubToken || this._store.isDisposed) {
			throw new RequestError('A live Copilot credential context is required', 'authentication');
		}
		const accountId = this._options.getAccountId?.(githubToken);
		let request = this._clientsByToken.get(githubToken);
		if (request && (request.accountId !== accountId || !request.discovery && !request.telemetryCaptured && request.expiresAt <= Date.now())) {
			this._invalidateClientRequest(githubToken, request);
			request = undefined;
		}
		if (request && !request.discovery && request.expiresAt <= Date.now()) {
			request.expire();
		}
		if (!request) {
			if (this._clientsByToken.size >= 64) {
				throw new RequestError('Copilot credential context capacity exceeded', 'overloaded');
			}
			request = new CopilotClientContext(accountId);
			this._clientsByToken.set(githubToken, request);
			this._scheduleCacheExpiry();
		}
		return request;
	}

	private _readCopilotSku(cell: ICopilotSkuCacheCell | undefined): string | undefined {
		const entry = cell?.valid ? cell.value : undefined;
		return entry && entry.expiresAt > Date.now() / 1000 ? entry.copilotSku : undefined;
	}

	private _invalidateClientForToken(githubToken: string, capiClient: CAPIClient): void {
		const request = this._clientsByToken.get(githubToken);
		if (request?.skuCell.value?.capiClient === capiClient) {
			this._invalidateClientRequest(githubToken, request);
		}
	}

	private _invalidateClientRequest(githubToken: string, request: CopilotClientContext): void {
		if (this._clientsByToken.get(githubToken) !== request) {
			return;
		}
		this._clientsByToken.deleteAndDispose(githubToken);
		this._scheduleCacheExpiry();
	}

	private _clearClients(): void {
		this._cacheExpiry.clear();
		this._clientsByToken.clearAndDisposeAll();
	}

	private _scheduleCacheExpiry(): void {
		this._cacheExpiry.clear();
		if (!this._clientsByToken.size) {
			return;
		}
		const nextExpiry = Math.min(...Array.from(this._clientsByToken.values(), request => request.expiresAt));
		if (!Number.isFinite(nextExpiry)) {
			return;
		}
		this._cacheExpiry.value = systemRequestScheduler.schedule(() => {
			for (const [token, request] of this._clientsByToken) {
				if (request.expiresAt <= Date.now()) {
					if (request.discovery) {
						request.expiresAt = Date.now() + copilotControlTimeout;
					} else if (!request.telemetryCaptured) {
						this._clientsByToken.deleteAndDispose(token);
					} else {
						request.expire();
					}
				}
			}
			this._scheduleCacheExpiry();
		}, Math.max(0, nextExpiry - Date.now()));
	}

	private async _buildClientForToken(githubToken: string, context: CopilotClientContext, signal: AbortSignal, deadline: number, onBlockedUntil: (time: number) => void): Promise<ICachedClient> {
		const apiBaseUri = this._options.endpoints.getApiBaseUri();
		const enterpriseUri = this._options.endpoints.getEnterpriseUri();
		const { extensionInfo } = await this._getCapiBase(signal, deadline);
		signal.throwIfAborted();
		if (deadline <= Date.now()) {
			throw new RequestTimeoutError();
		}
		const fetch = this._fetch;
		const capiClient = new this._options.api.CAPIClient(extensionInfo, COPILOT_LICENSE_AGREEMENT, {
			fetch: (url, options) => fetch(url, {
				method: options.method ?? 'GET',
				headers: options.headers,
				body: options.body,
				signal: options.signal as AbortSignal | undefined,
				...(options.callSite === 'copilot.models' ? { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error' } as const : {}),
			}),
		});

		this._logService.debug('[CopilotApiService] Discovering CAPI endpoints via /copilot_internal/user');

		const overrideApi = this._options.getApiUrlOverride?.();
		if (overrideApi) {
			this._logService.info(`[CopilotApiService] Using CAPI URL override ${overrideApi}; skipping endpoint discovery`);
			capiClient.updateDomains({ endpoints: { api: overrideApi, proxy: overrideApi }, sku: '' }, undefined);
			return {
				context,
				capiClient,
				expiresAt: Date.now() / 1000 + CAPI_CONTEXT_TTL_SECONDS,
				utilityModelIdsByFamily: new Map(),
				apiEndpoint: overrideApi,
				restrictedTelemetryEnabled: false,
				isInternal: false,
				isVscodeTeamMember: false,
			};
		}

		context.bootstrapClient.value ??= this._gitHubService.acquireBootstrapClient({ apiBaseUri, token: githubToken, accountId: context.accountId });
		let envelope: ICopilotUserResponse | undefined;
		try {
			const response = await context.bootstrapClient.value.object.get<ICopilotUserResponse>('/copilot_internal/user', signal, {
				caller: 'copilot.discovery', apiVersion: USER_API_VERSION, accept: 'application/json',
				etag: false, deadline, onBlockedUntil,
			});
			envelope = response.data;
		} catch (error) {
			if (error instanceof GitHubRequestRateLimitError) {
				throw copilotCooldownError(error.retryAfterMs);
			}
			if (error instanceof RequestError && error.statusCode !== undefined) {
				throw buildCopilotApiHttpError(error.statusCode, error.statusText ?? '', error.responseBody ?? '', 'Copilot endpoint discovery failed');
			}
			throw error;
		}
		signal.throwIfAborted();
		if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) {
			throw new RequestError('Copilot endpoint discovery returned an invalid response', 'malformedResponse');
		}
		if (envelope.endpoints?.api !== undefined) {
			const api = new URL(envelope.endpoints.api);
			if (api.protocol !== 'https:' || api.username || api.password || api.search || api.hash) {
				throw new RequestError('Copilot endpoint discovery returned an unsafe API endpoint', 'validation');
			}
		}
		const internalOrganization = getInternalOrg(envelope.organization_login_list);
		const copilotSku = typeof envelope.access_type_sku === 'string' && envelope.access_type_sku.length > 0 ? envelope.access_type_sku : undefined;

		capiClient.updateDomains(
			{ endpoints: envelope.endpoints ?? {}, sku: copilotSku ?? '' },
			// Enterprise base URI (e.g. `https://acme.ghe.com`), or `undefined` for
			// github.com. The package uses this when routing enterprise CAPI requests.
			enterpriseUri,
		);

		this._logService.debug('[CopilotApiService] CAPI endpoint discovered, api=', envelope.endpoints?.api);

		return {
			context,
			capiClient,
			expiresAt: Date.now() / 1000 + CAPI_CONTEXT_TTL_SECONDS,
			utilityModelIdsByFamily: new Map(),
			copilotSku,
			login: envelope.login,
			telemetryEndpoint: envelope.endpoints?.telemetry,
			apiEndpoint: envelope.endpoints?.api,
			copilotIgnoreEnabled: envelope.copilotignore_enabled,
			restrictedTelemetryEnabled: envelope.restricted_telemetry === true,
			trackingId: envelope.analytics_tracking_id,
			isInternal: isInternalAccount(envelope.is_staff, envelope.organization_login_list),
			isVscodeTeamMember: internalOrganization === 'vscode',
		};
	}

	/**
	 * Resolve the concrete CAPI model id for the supplied family (e.g.
	 * `gpt-4o-mini`). Cached with the per-GitHub-token CAPI client so
	 * endpoint or authentication invalidation also clears the model id.
	 */
	private async _resolveUtilityModelId(githubToken: string, modelFamily: string, signal?: AbortSignal): Promise<string> {
		const entry = await this._getEntryForToken(githubToken, signal);
		const cached = entry.utilityModelIdsByFamily.get(modelFamily);
		if (cached) {
			return cached;
		}

		const models = await this.models(githubToken, { signal });
		const match = models.find(m => m.capabilities?.family === modelFamily);
		if (!match) {
			throw new Error(`No CAPI model available for family '${modelFamily}'`);
		}

		entry.utilityModelIdsByFamily.set(modelFamily, match.id);
		return match.id;
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
			const detail = getResponseError(parsed);
			let envelope: Anthropic.ErrorResponse;
			if (
				typeof detail?.type === 'string'
				&& typeof detail.message === 'string'
			) {
				envelope = parsed as Anthropic.ErrorResponse;
			} else {
				let errorMessage: string;
				if (typeof rawError === 'string') {
					errorMessage = rawError;
				} else if (typeof detail?.message === 'string') {
					errorMessage = detail.message;
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
