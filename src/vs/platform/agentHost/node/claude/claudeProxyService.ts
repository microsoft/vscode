/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import type { CCAModel } from '@vscode/copilot-api';
import type * as http from 'http';
import { once } from 'events';
import { Emitter, Event } from '../../../../base/common/event.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import {
	COPILOT_API_ERROR_STATUS_STREAMING,
	CopilotApiError,
	ICopilotApiService,
	type ICopilotApiServiceRequestOptions,
} from '../shared/copilotApiService.js';
import { buildForwardedChatError, encodeForwardedChatError } from '../shared/forwardedChatError.js';
import {
	IProxyInFlight,
	ILoopbackProxyHandle,
	ILoopbackProxyRuntime,
	LoopbackProxyServer,
	readProxyRequestBody,
} from '../shared/loopbackProxyServer.js';
import { filterSupportedBetas } from './anthropicBetas.js';
import {
	buildErrorEnvelope,
	formatSseErrorFrame,
	writeJsonError,
	writeUpstreamJsonError,
} from './anthropicErrors.js';
import { tryParseClaudeModelId } from './claudeModelId.js';
import { parseProxyBearer } from './claudeProxyAuth.js';

// #region Public types

/**
 * Handle returned by {@link IClaudeProxyService.start}. Refcounts the
 * underlying server: when every handle is disposed, the listener closes,
 * the token slot clears, and the nonce is destroyed. The next `start()`
 * call rebinds with a new port and a fresh nonce.
 *
 * **Subprocess ownership invariant.** Callers that hand `baseUrl` /
 * `nonce` to a Claude SDK subprocess MUST kill that subprocess before
 * calling `dispose()`. The subprocess cannot outlive the handle —
 * after `dispose()` the proxy may rebind on a different port and the
 * subprocess would silently lose its endpoint.
 */
export interface IClaudeProxyHandle extends ILoopbackProxyHandle {
	/** e.g. `http://127.0.0.1:54321` — no trailing slash. */
	readonly baseUrl: string;
	/** 256-bit hex string. Combine with a session id as `Bearer <nonce>.<sessionId>`. */
	readonly nonce: string;
}

/**
 * How the Claude provider reaches Anthropic, resolved once per session at
 * materialize time and threaded as data through `IMaterializeContext` into
 * `buildOptions` / `buildSubprocessEnv`.
 *
 * - `proxy`: Copilot-routed Claude (the default). All `messages` traffic goes
 *   through the local {@link IClaudeProxyHandle} → Copilot CAPI.
 * - `native`: BYO-Anthropic (Phase 19). The SDK talks to Anthropic directly on
 *   the user's own credentials (`ANTHROPIC_API_KEY`, or a subscription OAuth
 *   token in `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`); no proxy is
 *   involved. The SDK's bundled `claude` CLI runs the turn.
 */
export type ClaudeTransport =
	| { readonly kind: 'proxy'; readonly handle: IClaudeProxyHandle }
	| { readonly kind: 'native' };

/**
 * A per-request credits report. CAPI returns the actual billed credits
 * for a `/v1/messages` request as `copilot_usage.total_nano_aiu` on the
 * Anthropic SSE stream. The Claude SDK subprocess strips this field from
 * its `result` message, so the proxy — which sees the raw CAPI response —
 * is the only place the real billed amount survives. `sessionId` is
 * decoded from the proxy Bearer token (`<nonce>.<sessionId>`) so consumers
 * can attribute credits to the originating session/turn.
 */
export interface IClaudeProxyCreditsReport {
	readonly sessionId: string;
	/** Billed credits for the request, in nano-AIU (1 credit = 1e9 nano-AIU). */
	readonly totalNanoAiu: number;
}

export interface IClaudeProxyService {
	readonly _serviceBrand: undefined;

	/**
	 * Fires once per completed CAPI `/v1/messages` request that reported
	 * `copilot_usage.total_nano_aiu`. Consumers accumulate per turn to
	 * surface real per-turn Copilot credits (the SDK-computed
	 * `total_cost_usd` is an Anthropic-list-price estimate, not the
	 * amount CAPI actually bills).
	 */
	readonly onDidReportCredits: Event<IClaudeProxyCreditsReport>;

	/**
	 * Start the proxy (if not already running) and return a refcounted
	 * handle. The supplied `githubToken` becomes the active token for
	 * outbound CAPI requests; if multiple callers hold handles
	 * concurrently, the most recent token wins (single-tenant assumption,
	 * see roadmap section 6).
	 */
	start(githubToken: string): Promise<IClaudeProxyHandle>;

	/**
	 * Force-close the proxy regardless of refcount and abort any
	 * in-flight requests. Idempotent. Subsequent `start()` calls rebind.
	 */
	dispose(): void;
}

export const IClaudeProxyService = createDecorator<IClaudeProxyService>('claudeProxyService');

// #endregion

// #region Internal state

/** Subclass-owned per-bind mutable state: the active outbound CAPI token. */
interface IClaudeProxyState {
	githubToken: string;
}

type IClaudeProxyRuntime = ILoopbackProxyRuntime<IClaudeProxyState>;

// #endregion

// #region Implementation

const KNOWN_CLAUDE_VENDORS = new Set(['anthropic']);
const ANTHROPIC_MESSAGES_ENDPOINT = '/v1/messages';
const PROXY_USER_FACING_NAME = 'ClaudeProxyService';
const USER_AGENT_PREFIX = 'vscode_claude_code';

/**
 * CAPI augments the Anthropic `/v1/messages` response with the request's
 * billed credits under `copilot_usage.total_nano_aiu`. The published
 * Anthropic SDK types don't declare it, so narrow through this shape
 * (mirrors `messagesApi.ts` in the Copilot extension).
 */
interface ICopilotUsageEnvelope {
	readonly copilot_usage?: { readonly total_nano_aiu?: number };
}

/**
 * Read `copilot_usage.total_nano_aiu` off an Anthropic stream event or
 * message, returning `undefined` unless it is a finite, non-negative
 * number.
 */
function readCopilotUsageNanoAiu(event: unknown): number | undefined {
	const value = (event as ICopilotUsageEnvelope | undefined)?.copilot_usage?.total_nano_aiu;
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Local HTTP proxy that speaks the Anthropic Messages API on the inbound
 * side and {@link ICopilotApiService} on the outbound side. The Claude
 * Agent SDK connects via `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`
 * and sees this as a real Anthropic endpoint.
 *
 * Lifecycle is refcounted via {@link IClaudeProxyHandle}; see
 * {@link IClaudeProxyService.start} and the subprocess-ownership
 * invariant on `IClaudeProxyHandle`.
 */
export class ClaudeProxyService extends LoopbackProxyServer<IClaudeProxyState, string> implements IClaudeProxyService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidReportCredits = new Emitter<IClaudeProxyCreditsReport>();
	readonly onDidReportCredits: Event<IClaudeProxyCreditsReport> = this._onDidReportCredits.event;

	constructor(
		@ILogService logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
	) {
		super(PROXY_USER_FACING_NAME, logService);
	}

	protected createState(githubToken: string): IClaudeProxyState {
		return { githubToken };
	}

	async start(githubToken: string): Promise<IClaudeProxyHandle> {
		const { runtime, release } = await this.acquire(githubToken);
		// Late-binding token update covers the case where multiple
		// concurrent callers awaited the same bind — last caller's token
		// wins, matching the single-tenant contract.
		runtime.state.githubToken = githubToken;
		return {
			baseUrl: runtime.baseUrl,
			nonce: runtime.nonce,
			dispose: release,
		};
	}

	override dispose(): void {
		super.dispose();
		this._onDidReportCredits.dispose();
	}

	protected override writeInternalError(res: http.ServerResponse): void {
		writeJsonError(res, 500, 'api_error', 'Internal proxy error');
	}

	/**
	 * Fire {@link onDidReportCredits} for a completed request. No-op when
	 * the request carried no credits (`copilot_usage` absent) or the
	 * Bearer token lacked a session id (shouldn't happen post-auth).
	 */
	private _reportCredits(sessionId: string | undefined, totalNanoAiu: number | undefined): void {
		if (sessionId === undefined || totalNanoAiu === undefined) {
			return;
		}
		this._logService.trace(`[${PROXY_USER_FACING_NAME}] credits: session=${sessionId} totalNanoAiu=${totalNanoAiu}`);
		this._onDidReportCredits.fire({ sessionId, totalNanoAiu });
	}

	// #region Dispatch

	protected override async handleRequest(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		runtime: IClaudeProxyRuntime,
	): Promise<void> {
		const method = req.method ?? 'GET';
		const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
		this._logService.trace(`[${PROXY_USER_FACING_NAME}] ${method} ${pathname}`);

		// Health check is the only unauthenticated route.
		if (method === 'GET' && pathname === '/') {
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.end('ok');
			return;
		}

		const auth = parseProxyBearer(req.headers, runtime.nonce);
		if (!auth.valid) {
			writeJsonError(res, 401, 'authentication_error', 'Invalid authentication');
			return;
		}

		if (method === 'GET' && pathname === '/v1/models') {
			await this._handleModels(req, res, runtime);
			return;
		}

		if (method === 'POST' && pathname === '/v1/messages') {
			await this._handleMessages(req, res, runtime, auth.sessionId);
			return;
		}

		if (method === 'POST' && pathname === '/v1/messages/count_tokens') {
			writeJsonError(res, 501, 'api_error', 'count_tokens not supported by CAPI');
			return;
		}

		writeJsonError(res, 404, 'not_found_error', `No route for ${method} ${pathname}`);
	}

	// #endregion

	// #region GET /v1/models

	private async _handleModels(req: http.IncomingMessage, res: http.ServerResponse, runtime: IClaudeProxyRuntime): Promise<void> {
		const headers = buildOutboundHeaders(req.headers);
		let models: CCAModel[];
		try {
			models = await this._copilotApiService.models(runtime.state.githubToken, { headers, suppressIntegrationId: true });
		} catch (err) {
			this._writeUpstreamErrorResponse(res, err);
			return;
		}

		const data: Anthropic.ModelInfo[] = [];
		for (const m of models) {
			if (!isAnthropicMessagesModel(m)) {
				continue;
			}
			const parsed = tryParseClaudeModelId(m.id);
			const sdkId = parsed ? parsed.toSdkModelId() : m.id;
			data.push({
				id: sdkId,
				type: 'model',
				display_name: m.name || sdkId,
				created_at: '1970-01-01T00:00:00Z',
				capabilities: null,
				max_input_tokens: null,
				max_tokens: null,
			});
		}

		const body = {
			data,
			has_more: false,
			first_id: data.length > 0 ? data[0].id : null,
			last_id: data.length > 0 ? data[data.length - 1].id : null,
		};
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(body));
	}

	// #endregion

	// #region POST /v1/messages

	private async _handleMessages(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		runtime: IClaudeProxyRuntime,
		sessionId: string | undefined,
	): Promise<void> {
		let bodyString: string;
		try {
			bodyString = await readProxyRequestBody(req);
		} catch (err) {
			writeJsonError(res, 400, 'invalid_request_error', `Failed to read request body: ${stringifyError(err)}`);
			return;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(bodyString);
		} catch {
			writeJsonError(res, 400, 'invalid_request_error', 'Request body is not valid JSON');
			return;
		}
		if (!parsed || typeof parsed !== 'object') {
			writeJsonError(res, 400, 'invalid_request_error', 'Request body must be a JSON object');
			return;
		}

		const body = parsed as Record<string, unknown>;
		const sdkModelId = body.model;
		if (typeof sdkModelId !== 'string' || sdkModelId.length === 0) {
			writeJsonError(res, 400, 'invalid_request_error', 'Missing required field: model');
			return;
		}
		if (!Array.isArray(body.messages)) {
			writeJsonError(res, 400, 'invalid_request_error', 'Missing required field: messages');
			return;
		}

		const parsedModel = tryParseClaudeModelId(sdkModelId);
		if (!parsedModel) {
			writeJsonError(res, 404, 'not_found_error', `Unknown model: ${sdkModelId}`);
			return;
		}
		// The SDK/CLI sends the model in SDK format (dashed, `claude-haiku-4-5`);
		// CAPI's `/v1/messages` expects the endpoint format (dotted,
		// `claude-haiku-4.5`). Rewrite on the way out.
		const endpointModelId = parsedModel.toEndpointModelId();
		body.model = endpointModelId;

		const stream = body.stream === true;
		const headers = buildOutboundHeaders(req.headers);

		const entry: IProxyInFlight = {
			ac: new AbortController(),
			res,
			clientGone: false,
		};
		runtime.inFlight.add(entry);
		const onClose = () => {
			entry.clientGone = true;
			entry.ac.abort();
		};
		res.on('close', onClose);

		try {
			if (stream) {
				await this._streamMessages(
					body as unknown as Anthropic.MessageCreateParamsStreaming,
					headers,
					res,
					entry,
					runtime,
					sdkModelId,
					sessionId,
				);
			} else {
				await this._sendNonStreamingMessage(
					body as unknown as Anthropic.MessageCreateParamsNonStreaming,
					headers,
					res,
					entry,
					runtime,
					sdkModelId,
					sessionId,
				);
			}
		} finally {
			res.removeListener('close', onClose);
			runtime.inFlight.delete(entry);
		}
	}

	private async _sendNonStreamingMessage(
		body: Anthropic.MessageCreateParamsNonStreaming,
		headers: Record<string, string>,
		res: http.ServerResponse,
		entry: IProxyInFlight,
		runtime: IClaudeProxyRuntime,
		originalSdkModelId: string,
		sessionId: string | undefined,
	): Promise<void> {
		const options: ICopilotApiServiceRequestOptions = { headers, signal: entry.ac.signal, suppressIntegrationId: true };
		let message: Anthropic.Message;
		try {
			message = await this._copilotApiService.messages(runtime.state.githubToken, body, options);
		} catch (err) {
			if (entry.ac.signal.aborted) {
				if (!entry.clientGone && !res.writableEnded) {
					res.destroy();
				}
				return;
			}
			this._writeUpstreamErrorResponse(res, err, true);
			return;
		}

		this._reportCredits(sessionId, readCopilotUsageNanoAiu(message));

		// Rewrite outbound `model` to SDK format. Failure to re-parse
		// shouldn't normally happen because we just translated it on
		// the way in, but log + passthrough rather than dropping.
		const outboundModel = rewriteModelToSdk(message.model, this._logService) ?? originalSdkModelId;
		const responseBody: Anthropic.Message = { ...message, model: outboundModel };

		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify(responseBody));
	}

	private async _streamMessages(
		body: Anthropic.MessageCreateParamsStreaming,
		headers: Record<string, string>,
		res: http.ServerResponse,
		entry: IProxyInFlight,
		runtime: IClaudeProxyRuntime,
		_originalSdkModelId: string,
		sessionId: string | undefined,
	): Promise<void> {
		const options: ICopilotApiServiceRequestOptions = { headers, signal: entry.ac.signal, suppressIntegrationId: true };
		let stream: AsyncGenerator<Anthropic.MessageStreamEvent>;
		try {
			stream = this._copilotApiService.messages(runtime.state.githubToken, body, options);
		} catch (err) {
			// Synchronous throws from the generator factory (rare —
			// CAPI errors come from the first iteration).
			if (entry.ac.signal.aborted) {
				if (!entry.clientGone && !res.writableEnded) {
					res.destroy();
				}
				return;
			}
			this._writeUpstreamErrorResponse(res, err, true);
			return;
		}

		// Pull the first event before committing to a 200 response so
		// we can surface a pre-stream error as a regular JSON error.
		let first: IteratorResult<Anthropic.MessageStreamEvent>;
		try {
			first = await stream.next();
		} catch (err) {
			if (entry.ac.signal.aborted) {
				if (!entry.clientGone && !res.writableEnded) {
					res.destroy();
				}
				return;
			}
			this._writeUpstreamErrorResponse(res, err, true);
			return;
		}

		// Commit to streaming response now.
		res.writeHead(200, {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache',
			'Connection': 'keep-alive',
		});
		res.flushHeaders();
		req_setNoDelay(res);

		const writeFrame = async (event: Anthropic.MessageStreamEvent): Promise<boolean> => {
			const transformed = rewriteEventModel(event, this._logService);
			const frame = `event: ${transformed.type}\ndata: ${JSON.stringify(transformed)}\n\n`;
			const ok = res.write(frame);
			if (!ok) {
				try {
					await once(res, 'drain', { signal: entry.ac.signal });
				} catch {
					// signal aborted while waiting on drain — bail out
					return false;
				}
			}
			return true;
		};

		// Tracks the latest `copilot_usage.total_nano_aiu` seen on the
		// stream; CAPI sends the request's running total on `message_delta`
		// (assign-last-wins). Reported once on clean stream end.
		let reportedNanoAiu: number | undefined;

		try {
			if (!first.done) {
				reportedNanoAiu = readCopilotUsageNanoAiu(first.value) ?? reportedNanoAiu;
				const ok = await writeFrame(first.value);
				if (!ok) {
					return;
				}
			}
			while (true) {
				let next: IteratorResult<Anthropic.MessageStreamEvent>;
				try {
					next = await stream.next();
				} catch (err) {
					if (entry.ac.signal.aborted) {
						if (!entry.clientGone && !res.writableEnded) {
							res.destroy();
						}
						return;
					}
					// Mid-stream error: emit Anthropic SSE error frame, then end.
					const envelope = err instanceof CopilotApiError
						? embedForwardedChatError(err)
						: buildErrorEnvelope('api_error', stringifyError(err));
					if (!res.writableEnded) {
						try {
							res.write(formatSseErrorFrame(envelope));
						} catch { /* socket may have died */ }
						try {
							res.end();
						} catch { /* ignore */ }
					}
					return;
				}
				if (next.done) {
					break;
				}
				reportedNanoAiu = readCopilotUsageNanoAiu(next.value) ?? reportedNanoAiu;
				const ok = await writeFrame(next.value);
				if (!ok) {
					return;
				}
			}
			if (!res.writableEnded) {
				res.end();
			}
			// CAPI reports the request's billed credits as the last
			// `copilot_usage.total_nano_aiu` seen on the stream
			// (assign-last-wins, matching the Copilot messages client).
			// Fire only after a clean end so we never attribute credits
			// for a request the client abandoned mid-stream.
			this._reportCredits(sessionId, reportedNanoAiu);
		} catch (err) {
			// Defense in depth — should not be reached.
			this._logService.warn(`[${PROXY_USER_FACING_NAME}] stream loop unexpected error: ${stringifyError(err)}`);
			if (!res.writableEnded) {
				try { res.end(); } catch { /* ignore */ }
			}
		}
	}

	// #endregion

	// #region Error helpers

	/**
	 * Writes an upstream error as a JSON response. When `embedChatError` is set
	 * (the `/v1/messages` paths), a `VSCODE_PROXY_ERROR` marker is appended to
	 * the envelope message so the structured CAPI error round-trips back through
	 * the SDK subprocess to the agent host (which decodes it into `_meta` and
	 * strips the marker). The `/v1/models` path does not round-trip, so it
	 * re-emits the envelope verbatim.
	 */
	private _writeUpstreamErrorResponse(res: http.ServerResponse, err: unknown, embedChatError = false): void {
		if (res.headersSent) {
			// Headers are already sent — caller should have routed to
			// the SSE error path. This is a defensive log.
			this._logService.warn(`[${PROXY_USER_FACING_NAME}] cannot write upstream error after headers sent: ${stringifyError(err)}`);
			if (!res.writableEnded) {
				try { res.end(); } catch { /* ignore */ }
			}
			return;
		}
		if (err instanceof CopilotApiError) {
			// Mid-stream sentinel doesn't map to a meaningful HTTP
			// status before headers are sent. Coerce to 502 so we
			// don't ship a 520 with a JSON body that violates HTTP
			// semantics for the consumer.
			const status = err.status === COPILOT_API_ERROR_STATUS_STREAMING ? 502 : err.status;
			writeUpstreamJsonError(res, status, embedChatError ? embedForwardedChatError(err) : err.envelope);
			return;
		}
		writeJsonError(res, 502, 'api_error', err instanceof Error ? err.message : String(err));
	}

	// #endregion
}

// #endregion

// #region Helpers

function isAnthropicMessagesModel(m: CCAModel): boolean {
	if (!KNOWN_CLAUDE_VENDORS.has(m.vendor.toLowerCase())) {
		return false;
	}
	return Array.isArray(m.supported_endpoints) && m.supported_endpoints.includes(ANTHROPIC_MESSAGES_ENDPOINT);
}

function rewriteModelToSdk(modelId: string, logService: ILogService): string | undefined {
	const parsed = tryParseClaudeModelId(modelId);
	if (!parsed) {
		logService.warn(`[${PROXY_USER_FACING_NAME}] outbound model ID could not be parsed for SDK rewrite: ${modelId}`);
		return undefined;
	}
	return parsed.toSdkModelId();
}

/**
 * Pure-function rewrite of `model` fields on `Anthropic.MessageStreamEvent`
 * objects from CAPI (endpoint format) to SDK (hyphenated) format. Only
 * `message_start.message.model` carries a model ID in the streaming
 * taxonomy; other event types pass through unchanged.
 */
function rewriteEventModel(
	event: Anthropic.MessageStreamEvent,
	logService: ILogService,
): Anthropic.MessageStreamEvent {
	if (event.type !== 'message_start') {
		return event;
	}
	const sdkModel = rewriteModelToSdk(event.message.model, logService);
	if (sdkModel === undefined || sdkModel === event.message.model) {
		return event;
	}
	return {
		...event,
		message: { ...event.message, model: sdkModel },
	};
}

/**
 * Build the headers we forward to {@link ICopilotApiService.messages}
 * from the inbound request. Forwards `anthropic-version` (verbatim),
 * `anthropic-beta` (filtered through {@link filterSupportedBetas}), and
 * `user-agent` (transformed via {@link transformUserAgent}).
 */
function buildOutboundHeaders(inbound: http.IncomingHttpHeaders): Record<string, string> {
	const out: Record<string, string> = {};
	const version = inbound['anthropic-version'];
	if (typeof version === 'string' && version.length > 0) {
		out['anthropic-version'] = version;
	}
	const beta = inbound['anthropic-beta'];
	if (typeof beta === 'string' && beta.length > 0) {
		const filtered = filterSupportedBetas(beta);
		if (filtered !== undefined) {
			out['anthropic-beta'] = filtered;
		}
	}
	const userAgent = inbound['user-agent'];
	if (typeof userAgent === 'string' && userAgent.length > 0) {
		out['User-Agent'] = transformUserAgent(userAgent);
	}
	return out;
}

/**
 * Transform an incoming user-agent string by replacing the client name
 * portion (before the first `/`) with {@link USER_AGENT_PREFIX}. This
 * mirrors the pattern used by `claudeLanguageModelServer.ts` in the
 * extension, ensuring all Claude requests are tagged with a consistent
 * prefix for server-side identification.
 *
 * Examples:
 * - `claude-code/1.2.3` → `vscode_claude_code/1.2.3`
 * - `Anthropic/Python/1.0` → `vscode_claude_code/Python/1.0`
 * - `unknown` → `vscode_claude_code/unknown`
 */
function transformUserAgent(userAgent: string): string {
	const slashIndex = userAgent.indexOf('/');
	if (slashIndex === -1) {
		return `${USER_AGENT_PREFIX}/${userAgent}`;
	}
	return `${USER_AGENT_PREFIX}${userAgent.substring(slashIndex)}`;
}

function req_setNoDelay(res: http.ServerResponse): void {
	const socket = res.socket;
	if (socket && typeof socket.setNoDelay === 'function') {
		try {
			socket.setNoDelay(true);
		} catch {
			// not all socket implementations support it (mocks etc.)
		}
	}
}

function stringifyError(err: unknown): string {
	if (err instanceof Error) {
		return err.message;
	}
	return String(err);
}

/**
 * Returns a copy of a {@link CopilotApiError}'s Anthropic envelope with a
 * `VSCODE_PROXY_ERROR:<base64>` marker appended to the error message. The
 * marker carries the structured chat fetch error so the agent host can
 * forward rich, localized error messaging to core once the SDK subprocess
 * echoes the text back. The original message is preserved (the decoder stops
 * at the first whitespace), so non-core consumers still read it verbatim.
 */
function embedForwardedChatError(err: CopilotApiError): Anthropic.ErrorResponse {
	const marker = encodeForwardedChatError(buildForwardedChatError(err));
	return {
		...err.envelope,
		error: {
			...err.envelope.error,
			message: `${err.envelope.error.message} ${marker}`,
		},
	};
}

// #endregion
