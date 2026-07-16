/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import { CAPIClient, RequestType, type CCAModel, type IExtensionInformation } from '@vscode/copilot-api';
import { generateUuid } from '../../../../base/common/uuid.js';
import { getDevDeviceId, getMachineId } from '../../../../base/node/id.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { IAgentHostGitHubEndpointService } from '../agentHostGitHubEndpointService.js';
import { ILogService } from '../../../log/common/log.js';
import { IProductService } from '../../../product/common/productService.js';
import { COPILOT_LICENSE_AGREEMENT } from '../../../endpoint/common/licenseAgreement.js';
import { parseCopilotTokenFields } from '../copilot/copilotTokenFields.js';

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
 * default `IConversationOptions.temperature`). All other parameters
 * (`top_p`, model family) are fixed defaults inside the service — callers
 * should not need to tune them for utility flows. `max_tokens` is left
 * unset so CAPI applies its per-model default, matching what the
 * extension's `copilot-utility-small` endpoint sends today.
 */
export interface ICopilotUtilityChatCompletionRequest {
	readonly messages: readonly ICopilotUtilityChatMessage[];
	readonly temperature?: number;
}

/**
 * Subset of the GitHub `copilot_internal/user` response we care about.
 * The full payload carries entitlement info; we only need `endpoints` (for
 * routing CAPI requests) and `access_type_sku` (which `CAPIClient.updateDomains`
 * stamps onto requests).
 */
interface ICopilotUserResponse {
	readonly login?: string;
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
	/** GitHub login returned by `/copilot_internal/user`, when present. */
	readonly login?: string;
	/** The CAPI `endpoints.telemetry` base URL discovered for this token, if any. */
	readonly telemetryEndpoint?: string;
	/** The CAPI `endpoints.api` base URL discovered (or overridden) for this token, if any. */
	readonly apiEndpoint?: string;
}

/**
 * Subset of the `RequestType.CopilotToken` mint response we care about.
 */
interface ICopilotTokenEnvelope {
	readonly token?: unknown;
	readonly expires_at?: unknown;
	readonly refresh_in?: unknown;
	readonly organization_list?: unknown;
}

/**
 * Per-GitHub-token Copilot session token cache entry, plus a per-family
 * resolved utility model id. The model id is bound to the same lifetime as
 * the Copilot token so the entry can be evicted atomically on 401/403.
 */
interface ICachedCopilotToken {
	readonly token: string;
	readonly expiresAt: number;
	readonly modelIdsByFamily: Map<string, string>;
	readonly isInternal: boolean;
	readonly isVscodeTeamMember: boolean;
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

/**
 * Test/debug override for the CAPI base URL. When set to a **loopback** URL,
 * {@link CopilotApiService} skips the `api.github.com/copilot_internal/user`
 * endpoint-discovery round-trip (which requires a real GitHub token) and routes
 * every CAPI request — `models`, `responses`, `messages` — straight at this URL
 * instead. Only ever set by the smoke-test harness (see `setupAgentHostSuite`)
 * so the agent host's shared CAPI client can talk to the mock LLM server; never
 * set in production, so normal per-token discovery is unchanged.
 *
 * The override is restricted to loopback hosts, plus the reserved
 * `vscode-smoke.test` host when the smoke proxy marker is present. Subsequent
 * CAPI calls carry the user's GitHub bearer token, so every other non-loopback
 * or unparseable value is ignored to prevent token exfiltration.
 */
const CAPI_URL_OVERRIDE_ENV = 'VSCODE_AGENT_HOST_CAPI_URL_OVERRIDE';
const CAPI_URL_OVERRIDE_SMOKE_TEST_HOST = 'vscode-smoke.test';
const CAPI_URL_OVERRIDE_SMOKE_TEST_ENV = 'VSCODE_SMOKE_TEST_PROXY_HEADER';

/** True iff `url` parses and its host is a loopback address (localhost / 127.0.0.0/8 / ::1). */
function isLoopbackUrl(url: string): boolean {
	let hostname: string;
	try {
		hostname = new URL(url).hostname;
	} catch {
		return false;
	}
	// Strip IPv6 brackets if present (e.g. `[::1]`).
	const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
	return host === 'localhost' || host === '::1' || /^127(?:\.\d{1,3}){3}$/.test(host);
}

function isAllowedCapiUrlOverride(url: string): boolean {
	if (isLoopbackUrl(url)) {
		return true;
	}
	if (!process.env[CAPI_URL_OVERRIDE_SMOKE_TEST_ENV]) {
		return false;
	}
	try {
		return new URL(url).hostname.toLowerCase() === CAPI_URL_OVERRIDE_SMOKE_TEST_HOST;
	} catch {
		return false;
	}
}

/**
 * Re-mint the Copilot session token this many seconds before its
 * server-reported `expires_at`, mirroring the Copilot Chat extension's
 * `RefreshableCopilotTokenManager` 5-minute refresh buffer.
 */
const COPILOT_TOKEN_REFRESH_BUFFER_SECONDS = 5 * 60;

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

const INTERNAL_COPILOT_ORGANIZATIONS = new Set([
	'4535c7beffc844b46bb1ed4aa04d759a',
	'a5db0bcaae94032fe715fb34a5e4bce2',
	'7184f66dfcee98cb5f08a1cb936d5225',
	'1cb18ac6eedd49b43d74a1c5beb0b955',
	'ea9395b9a9248c05ee6847cbd24355ed',
]);
const VSCODE_COPILOT_ORGANIZATIONS = new Set(['551cca60ce19654d894e786220822482']);

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
 * {@link utilityChatCompletion} is the one exception to the
 * GitHub-token-IS-the-credential rule: CAPI's `/chat/completions` endpoint
 * expects a Copilot session token (the same one the Copilot Chat extension
 * mints via `RequestType.CopilotToken`). The service mints it internally
 * from the supplied GitHub token, caches it per-token alongside the
 * resolved utility model id, and refreshes ahead of expiry.
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
/**
 * Restricted/enhanced telemetry context derived from a user's minted CAPI Copilot session token,
 * mirroring what the Copilot extension reads off its `CopilotToken` (`rt` opt-in, `tid` tracking id)
 * plus the CAPI `endpoints.telemetry` host.
 */
export interface IRestrictedTelemetryContext {
	/** Whether the token opts into enhanced/restricted telemetry (the `rt=1` claim). */
	readonly restrictedTelemetryEnabled: boolean;
	/** The Copilot user tracking id (`tid` claim), or `undefined` when absent. */
	readonly trackingId: string | undefined;
	/** The CAPI `endpoints.telemetry` base URL, resolved only when enabled; `undefined` otherwise. */
	readonly telemetryEndpoint: string | undefined;
	/** Whether the token belongs to a GitHub or Microsoft internal organization. */
	readonly isInternal?: boolean;
	/** GitHub login returned by `/copilot_internal/user`. */
	readonly userName?: string;
	/** Whether the token identifies a VS Code team member. */
	readonly isVscodeTeamMember?: boolean;
}

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
	 * Internally mints (and caches) a Copilot session token from the
	 * supplied GitHub token — the same flow the Copilot Chat extension
	 * uses for its `copilot-utility-small` endpoint (PR title/description,
	 * commit messages, branch names, chat titles, etc.). Uses the
	 * `gpt-4o-mini` model family with `top_p = 1` and `temperature = 0.1`
	 * by default (override via `request.temperature`).
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
	 * Resolve this user's restricted-telemetry context from the minted CAPI Copilot session token —
	 * the `rt` opt-in and `tid` tracking id — plus the CAPI `endpoints.telemetry` host. The GitHub
	 * token itself carries none of these claims; they live in the Copilot session token (minted via
	 * `RequestType.CopilotToken`), exactly as the Copilot extension reads them off its `CopilotToken`.
	 * The telemetry endpoint is resolved only when enabled, so public users incur no extra discovery.
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
}

export class CopilotApiService implements ICopilotApiService {

	declare readonly _serviceBrand: undefined;

	private _capiBasePromise: Promise<ICapiBase> | null = null;
	private readonly _clientsByToken = new Map<string, Promise<ICachedClient>>();
	private readonly _copilotTokensByGithub = new Map<string, Promise<ICachedCopilotToken>>();
	private readonly _fetch: FetchFunction;

	constructor(
		fetchFn: FetchFunction | undefined,
		@ILogService private readonly _logService: ILogService,
		@IProductService private readonly _productService: IProductService,
		@IAgentHostGitHubEndpointService private readonly _gitHubEndpointService: IAgentHostGitHubEndpointService,
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
				// Opt-in per request — see
				// `ICopilotApiServiceRequestOptions.suppressIntegrationId`.
				suppressIntegrationId: options?.suppressIntegrationId,
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

	async responses(
		githubToken: string,
		body: string,
		options?: ICopilotApiServiceRequestOptions,
	): Promise<Response> {
		const capiClient = await this._getClientForToken(githubToken);
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
			{ type: RequestType.ChatResponses },
		);

		this._logService.info(`[CopilotApiService] responses status=${response.status}, requestId=${requestId}`);

		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				this._invalidateClientForToken(githubToken);
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
		const capiClient = await this._getClientForToken(githubToken);
		const copilotToken = await this._getCopilotToken(githubToken);
		const modelId = await this._resolveUtilityModelId(githubToken, UTILITY_DEFAULT_MODEL_FAMILY);
		const requestId = generateUuid();

		this._logService.debug('[CopilotApiService] POST chat completions', `model=${modelId} requestId=${requestId}`);

		const body = JSON.stringify({
			model: modelId,
			messages: request.messages.map(m => ({ role: m.role, content: m.content })),
			stream: false,
			temperature: request.temperature ?? UTILITY_DEFAULT_TEMPERATURE,
			top_p: UTILITY_DEFAULT_TOP_P,
		});

		const response = await capiClient.makeRequest<Response>(
			{
				method: 'POST',
				headers: {
					...options?.headers,
					'Content-Type': 'application/json',
					'Authorization': `Bearer ${copilotToken}`,
					'X-Request-Id': requestId,
					'OpenAI-Intent': UTILITY_INTENT,
				},
				body,
				signal: options?.signal,
			},
			{ type: RequestType.ChatCompletions },
		);

		if (!response.ok) {
			if (response.status === 401 || response.status === 403) {
				this._invalidateCopilotTokenForGithub(githubToken);
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

		// Copilot endpoint discovery: GET `/copilot_internal/user` on the GitHub API
		// host. For GitHub Enterprise the host is derived from `githubEnterpriseUri`
		// (via the endpoint service); the response's `endpoints.api` then carries the
		// enterprise CAPI base that CAPIClient routes through. Defaults to
		// api.github.com when no enterprise URI is set. (GHE Cloud `*.ghe.com` is
		// handled; GHE Server on-prem `/copilot_internal` routing is unverified.)
		const userUrl = `${this._gitHubEndpointService.getApiBaseUri()}/copilot_internal/user`;

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
		return this._getEntryForToken(githubToken).then(entry => entry.capiClient);
	}

	/**
	 * Resolve this user's restricted-telemetry context. Reads the `rt`/`tid` claims from the minted
	 * CAPI Copilot session token (the GitHub token has neither), and resolves the CAPI
	 * `endpoints.telemetry` host from the cached `/copilot_internal/user` discovery only when the
	 * user is opted in, so public users pay no extra discovery call.
	 */
	async resolveRestrictedTelemetryContext(githubToken: string): Promise<IRestrictedTelemetryContext> {
		const token = await this._getCopilotTokenEntry(githubToken);
		const client = await this._getEntryForToken(githubToken);
		const fields = parseCopilotTokenFields(token.token);
		const restrictedTelemetryEnabled = fields.get('rt') === '1';
		const trackingId = fields.get('tid');
		const telemetryEndpoint = restrictedTelemetryEnabled
			? client.telemetryEndpoint
			: undefined;
		return {
			restrictedTelemetryEnabled,
			trackingId,
			telemetryEndpoint,
			isInternal: token.isInternal,
			userName: client.login,
			isVscodeTeamMember: token.isVscodeTeamMember,
		};
	}

	async resolveApiEndpoint(githubToken: string): Promise<string | undefined> {
		return (await this._getEntryForToken(githubToken)).apiEndpoint;
	}

	async resolveUserLogin(githubToken: string): Promise<string | undefined> {
		return (await this._getEntryForToken(githubToken)).login;
	}

	private _getEntryForToken(githubToken: string): Promise<ICachedClient> {
		const nowSeconds = Date.now() / 1000;
		const existing = this._clientsByToken.get(githubToken);
		if (existing) {
			return existing.then(entry => {
				if (entry.expiresAt - nowSeconds > CAPI_CONTEXT_REFRESH_BUFFER_SECONDS) {
					return entry;
				}
				// Stale — evict and recurse to build a fresh entry.
				this._clientsByToken.delete(githubToken);
				return this._getEntryForToken(githubToken);
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
		return pending;
	}

	private _invalidateClientForToken(githubToken: string): void {
		this._clientsByToken.delete(githubToken);
	}

	private async _buildClientForToken(githubToken: string): Promise<ICachedClient> {
		const { extensionInfo, userUrl } = await this._getCapiBase();
		const fetch = this._fetch;
		const capiClient = new CAPIClient(extensionInfo, COPILOT_LICENSE_AGREEMENT, {
			fetch: (url, options) => fetch(url, {
				method: options.method ?? 'GET',
				headers: options.headers,
				body: options.body,
				signal: options.signal as AbortSignal | undefined,
			}),
		});

		this._logService.debug('[CopilotApiService] Discovering CAPI endpoints via /copilot_internal/user');

		// Test/debug override: skip api.github.com discovery for an allowed local
		// or smoke-proxy URL. Every other non-loopback value is ignored because
		// subsequent CAPI calls carry the GitHub bearer token.
		const overrideApi = process.env[CAPI_URL_OVERRIDE_ENV];
		if (overrideApi) {
			if (isAllowedCapiUrlOverride(overrideApi)) {
				this._logService.info(`[CopilotApiService] Using CAPI URL override ${overrideApi}; skipping endpoint discovery`);
				capiClient.updateDomains({ endpoints: { api: overrideApi, proxy: overrideApi }, sku: '' }, undefined);
				return {
					capiClient,
					expiresAt: Date.now() / 1000 + CAPI_CONTEXT_TTL_SECONDS,
					apiEndpoint: overrideApi,
				};
			}
			this._logService.warn(`[CopilotApiService] Ignoring non-loopback CAPI URL override ${overrideApi}; falling back to normal endpoint discovery`);
		}

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
			// Enterprise base URI (e.g. `https://acme.ghe.com`), or `undefined` for
			// github.com. The package derives the GitHub API host (`api.<host>`) from
			// this for `copilot_internal` endpoints - notably the Copilot session
			// token mint (`/copilot_internal/v2/token`). Omitting it strands the mint
			// on `api.github.com`, which 401s an enterprise token ("Bad credentials").
			this._gitHubEndpointService.getEnterpriseUri(),
		);

		this._logService.debug('[CopilotApiService] CAPI endpoint discovered, api=', envelope.endpoints?.api);

		return {
			capiClient,
			expiresAt: Date.now() / 1000 + CAPI_CONTEXT_TTL_SECONDS,
			login: envelope.login,
			telemetryEndpoint: envelope.endpoints?.telemetry,
			apiEndpoint: envelope.endpoints?.api,
		};
	}

	// #endregion

	// #region Per-Token Copilot Session Token

	/**
	 * Resolve the Copilot session token for a GitHub token, minting and
	 * caching one if needed. Concurrent callers for the same GitHub token
	 * share a single in-flight mint; the caller's `AbortSignal` is
	 * deliberately NOT forwarded so cancelling one caller does not poison
	 * the shared mint for the others.
	 */
	private _getCopilotToken(githubToken: string): Promise<string> {
		return this._getCopilotTokenEntry(githubToken).then(entry => entry.token);
	}

	private _getCopilotTokenEntry(githubToken: string): Promise<ICachedCopilotToken> {
		const nowSeconds = Date.now() / 1000;
		const existing = this._copilotTokensByGithub.get(githubToken);
		if (existing) {
			return existing.then(entry => {
				if (entry.expiresAt - nowSeconds > COPILOT_TOKEN_REFRESH_BUFFER_SECONDS) {
					return entry;
				}
				// Stale — evict only if the map still points at this
				// promise. A concurrent caller may already have raced ahead
				// and minted a fresh token; deleting unconditionally would
				// evict that newer entry and cause a redundant re-mint.
				if (this._copilotTokensByGithub.get(githubToken) === existing) {
					this._copilotTokensByGithub.delete(githubToken);
				}
				return this._getCopilotTokenEntry(githubToken);
			}).catch(err => {
				if (this._copilotTokensByGithub.get(githubToken) === existing) {
					this._copilotTokensByGithub.delete(githubToken);
				}
				throw err;
			});
		}

		const pending: Promise<ICachedCopilotToken> = this._buildCopilotToken(githubToken).catch(err => {
			if (this._copilotTokensByGithub.get(githubToken) === pending) {
				this._copilotTokensByGithub.delete(githubToken);
			}
			throw err;
		});
		this._copilotTokensByGithub.set(githubToken, pending);
		return pending;
	}

	private _invalidateCopilotTokenForGithub(githubToken: string): void {
		this._copilotTokensByGithub.delete(githubToken);
	}

	private async _buildCopilotToken(githubToken: string): Promise<ICachedCopilotToken> {
		const capiClient = await this._getClientForToken(githubToken);

		this._logService.debug('[CopilotApiService] Minting Copilot session token');

		const response = await capiClient.makeRequest<Response>(
			{
				method: 'GET',
				headers: {
					'Authorization': `token ${githubToken}`,
					'X-GitHub-Api-Version': USER_API_VERSION,
				},
			},
			{ type: RequestType.CopilotToken },
		);

		if (!response.ok) {
			const text = await response.text().catch(() => '');
			throw new Error(`Copilot session token mint failed: ${response.status} ${response.statusText} \u2014 ${text}`);
		}

		const envelope = await response.json() as ICopilotTokenEnvelope;
		if (typeof envelope.token !== 'string' || typeof envelope.expires_at !== 'number') {
			throw new Error('Copilot session token mint returned malformed envelope');
		}

		// Prefer `now + refresh_in` over the server-reported `expires_at`:
		// users with a fast local clock can see `expires_at` already in the
		// past, which would cause us to re-mint on every call. Mirror what
		// the Copilot Chat extension's `RefreshableCopilotTokenManager`
		// does. Floor at `now + 60s` so a malformed/short `refresh_in`
		// can't trigger a tight re-mint loop.
		const nowSeconds = Date.now() / 1000;
		const refreshIn = typeof envelope.refresh_in === 'number' ? envelope.refresh_in : undefined;
		const organizationList = Array.isArray(envelope.organization_list)
			? envelope.organization_list.filter((organization): organization is string => typeof organization === 'string')
			: [];
		const expiresAt = Math.max(
			refreshIn !== undefined ? nowSeconds + refreshIn : envelope.expires_at,
			nowSeconds + 60,
		);

		return {
			token: envelope.token,
			expiresAt,
			modelIdsByFamily: new Map(),
			isInternal: organizationList.some(organization => INTERNAL_COPILOT_ORGANIZATIONS.has(organization)),
			isVscodeTeamMember: organizationList.some(organization => VSCODE_COPILOT_ORGANIZATIONS.has(organization)),
		};
	}

	/**
	 * Resolve the concrete CAPI model id for the supplied family (e.g.
	 * `gpt-4o-mini`). Cached per GitHub token + family alongside the
	 * Copilot session token so eviction on 401/403 also clears the cached
	 * model id.
	 */
	private async _resolveUtilityModelId(githubToken: string, modelFamily: string): Promise<string> {
		const pendingEntry = this._copilotTokensByGithub.get(githubToken);
		const entry = pendingEntry ? await pendingEntry : undefined;
		const cached = entry?.modelIdsByFamily.get(modelFamily);
		if (cached) {
			return cached;
		}

		const models = await this.models(githubToken);
		const match = models.find(m => m.capabilities?.family === modelFamily);
		if (!match) {
			throw new Error(`No CAPI model available for family '${modelFamily}'`);
		}

		entry?.modelIdsByFamily.set(modelFamily, match.id);
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
