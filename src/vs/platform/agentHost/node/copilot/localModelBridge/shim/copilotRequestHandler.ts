/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CopilotRequestHandler, type CopilotRequestContext } from '@github/copilot-sdk';
import { DisposableStore } from '../../../../../../base/common/lifecycle.js';
import { localize } from '../../../../../../nls.js';
import type { ILogService } from '../../../../../log/common/log.js';
import type { ITelemetryService } from '../../../../../telemetry/common/telemetry.js';
import { FIRST_OUTPUT_TIMEOUT_MS, PROMPT_PROGRESS_INTERVAL_MS, PROMPT_PROGRESS_MIN_TOKENS, SENTINEL_ORIGIN } from './constants.js';
import {
	adaptLocalJsonResponse,
	adaptLocalRequestBody,
	buildContextLengthExceededBody,
	buildFallbackChatRequest,
	buildInjectedAutoRequest,
	classifyLocalModelRequest,
	computeLocalModelLimits,
	createLocalModelRouterEnv,
	decideAutoInjection,
	describeAutoDecision,
	encodeJsonBody,
	evaluateAutoResponse,
	hasImageParts,
	isAncillaryInteraction,
	isConnectFailure,
	isErrorPayload,
	isLocalCapiModelId,
	LocalChatCompletionAssembler,
	LocalSseResponseAdapter,
	parseJsonObject,
	readAutoSelectedModelId,
	readLocalContextOverflow,
	SseCommitScanner,
	toStreamingLocalRequestBody,
	type ILocalContextOverflow,
	type ILocalModelBufferedRequest,
	type ILocalModelRouterEnv,
	type ILocalPromptProgress,
	type LocalModelFallbackReason,
	type LocalModelJsonBody,
	type LocalModelRejectReason,
} from './requestRouter.js';
import { hashRouteToken, type IRouteRecord, type RouteTable } from './routeTable.js';
import { LocalModelServingError, type ILocalModelClock, type ILocalModelLoopbackEndpoint, type IServingAccess, type IServingIdentity, type IServingSlot, type IServingSnapshot } from './servingAccess.js';
import type { TurnLedger } from './turnLedger.js';

export type { ILocalModelBufferedRequest } from './requestRouter.js';

/** A fetch implementation the handler forwards through. */
export type LocalModelFetch = (input: Request, init?: RequestInit) => Promise<Response>;

/** Where the handler sends traffic. Injected so tests never touch the network. */
export interface ILocalModelRequestHandlerTransport {
	/** Proxy-aware fetch (PAC, system certificates, Kerberos), used for every non-loopback origin. */
	readonly proxyFetch: LocalModelFetch;
	/** Direct fetch for loopback origins: the BYOK bridge, whose nonce bearer must reach it unchanged, and the local `llama-server`. Never proxied. */
	readonly loopbackFetch: LocalModelFetch;
}

const LOOPBACK_HOSTNAMES = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** Whether `url` targets this machine's loopback interface. */
export function isLoopbackUrl(url: URL): boolean {
	return LOOPBACK_HOSTNAMES.has(url.hostname.toLowerCase());
}

/** Reads a request's body once into memory. */
export async function bufferRequest(request: Request): Promise<ILocalModelBufferedRequest> {
	const method = request.method.toUpperCase();
	let body: Uint8Array | undefined;
	if (method !== 'GET' && method !== 'HEAD' && request.body) {
		const bytes = new Uint8Array(await request.arrayBuffer());
		body = bytes.byteLength > 0 ? bytes : undefined;
	}
	return { url: new URL(request.url), method, headers: new Headers(request.headers), body, redirect: request.redirect };
}

/** Builds a fresh `Request` from a buffered one; the body is copied so it can be replayed again. */
export function toRequest(buffered: ILocalModelBufferedRequest): Request {
	return new Request(buffered.url, {
		method: buffered.method,
		headers: buffered.headers,
		body: buffered.body ? buffered.body.slice() : undefined,
		redirect: buffered.redirect,
	});
}

// #region Telemetry

/** `localModel.route` `selection`. */
export type LocalModelRouteSelection = 'local' | 'fallback' | 'cloud' | 'cloudOnlyReissue' | 'notDeclared' | 'modelNotActive';

/** One `localModel.route` event. Never carries URLs, tokens, model output or prompts. */
export interface ILocalModelRouteTelemetryEvent {
	readonly selection: LocalModelRouteSelection;
	/** A closed reason code (fallback reason, skip reason, ...), or `''`. */
	readonly reason: string;
	/** The runtime's `interactionType` (bounded identifier), or `''`. */
	readonly interactionType: string;
	/** `/auto` `tier` (bounded identifier), or `''`. */
	readonly tier: string;
	/** Dispatch to first local output; `-1` when there was none. */
	readonly firstOutputMs: number;
	/** `usage.completion_tokens` of a local response; `-1` when unknown. */
	readonly outputTokens: number;
	/** Time a direct request waited for a slot; `-1` when it did not queue. */
	readonly queueWaitMs: number;
	/** A direct-selection (sentinel) request rather than Auto. */
	readonly direct: boolean;
}

type LocalModelRouteClassification = {
	selection: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'Where the request ran: local, fallback, cloud, cloudOnlyReissue, notDeclared or modelNotActive.' };
	reason: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; comment: 'Closed reason code for the selection, for example staleModel, slotsFull or firstOutputTimeout.' };
	interactionType: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The runtime interaction type of the request, for example conversation-agent.' };
	tier: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; comment: 'The Auto tier the runtime requested.' };
	firstOutputMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds from local dispatch to the first output, or -1.' };
	outputTokens: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Output tokens of a local response, or -1 when unknown.' };
	queueWaitMs: { classification: 'SystemMetaData'; purpose: 'PerformanceAndHealth'; isMeasurement: true; comment: 'Milliseconds a direct request waited for a local slot, or -1.' };
	direct: { classification: 'SystemMetaData'; purpose: 'FeatureInsight'; isMeasurement: true; comment: 'Whether the request came from the direct on-device model row rather than Auto.' };
	owner: 'lramos15';
	comment: 'Routing decisions for on-device model requests (local, cloud fallback or rejected).';
};

/** Receives `localModel.route` events. */
export interface ILocalModelRouteTelemetrySink {
	reportRoute(event: ILocalModelRouteTelemetryEvent): void;
}

/** A sink that logs `localModel.route` through the Agent Host's `ITelemetryService`. */
export function createLocalModelRouteTelemetrySink(telemetryService: ITelemetryService): ILocalModelRouteTelemetrySink {
	return {
		reportRoute: event => telemetryService.publicLog2<ILocalModelRouteTelemetryEvent, LocalModelRouteClassification>('localModel.route', event),
	};
}

/** Keeps telemetry dimensions to short identifiers. */
function toTelemetryIdentifier(value: string | undefined): string {
	return value && /^[A-Za-z0-9._-]{1,64}$/.test(value) ? value : value ? 'other' : '';
}

// #endregion

/** An on-device request waiting for its first output, so the host can show it loading, queued (direct requests) or reading the conversation. */
export interface ILocalModelDirectWaitEvent {
	readonly sessionId: string | undefined;
	readonly familyId: string;
	readonly kind: 'loading' | 'queued' | 'processing' | 'done';
	/** 1-based queue position for `queued`. */
	readonly position?: number;
	/** For `processing`: how much of the uncached prompt `llama-server` has processed (0-100), when it reports progress. */
	readonly percent?: number;
}

/**
 * Reports what one on-device request waits for before its first output: its load or queue position, then reading the
 * prompt. Prompt reading shows only once `llama-server` reports enough uncached work ({@link PROMPT_PROGRESS_MIN_TOKENS}),
 * so a cached prompt never flashes; `done` is reported once, only after something was shown.
 */
class LocalRequestWaitReporter {

	private _shown = false;
	private _ended = false;
	private _percent: number | undefined;
	private _percentAt = 0;

	constructor(
		private readonly _report: (kind: ILocalModelDirectWaitEvent['kind'], details?: { readonly position?: number; readonly percent?: number }) => void,
		private readonly _clock: ILocalModelClock,
	) { }

	loading(): void {
		this._emit('loading');
	}

	queued(position: number): void {
		this._emit('queued', { position });
	}

	/** The request was sent to `llama-server`; a non-streaming one reports nothing more. */
	dispatched(streaming: boolean): void {
		if (!streaming) {
			this.end();
		} else if (this._shown) {
			this._emit('processing');
		}
	}

	/** At most every {@link PROMPT_PROGRESS_INTERVAL_MS}, as the share of the uncached prompt processed. */
	promptProgress(progress: ILocalPromptProgress): void {
		const uncached = progress.total - progress.cache;
		if (this._ended || uncached < PROMPT_PROGRESS_MIN_TOKENS) {
			return;
		}
		const percent = Math.max(0, Math.min(100, Math.floor(100 * (progress.processed - progress.cache) / uncached)));
		const now = this._clock.now();
		if (percent === this._percent || (this._percent !== undefined && now - this._percentAt < PROMPT_PROGRESS_INTERVAL_MS)) {
			return;
		}
		this._percent = percent;
		this._percentAt = now;
		this._emit('processing', { percent });
	}

	/** The first output arrived, or the request failed or was cancelled. */
	end(): void {
		if (this._ended) {
			return;
		}
		this._ended = true;
		if (this._shown) {
			this._report('done');
		}
	}

	private _emit(kind: ILocalModelDirectWaitEvent['kind'], details?: { readonly position?: number; readonly percent?: number }): void {
		if (!this._ended) {
			this._shown = true;
			this._report(kind, details);
		}
	}
}

/** Everything the router needs, injected so the serving side and tests can provide their own implementations. */
export interface ILocalModelRoutingDependencies {
	readonly serving: IServingAccess;
	readonly routeTable: RouteTable;
	readonly ledger: TurnLedger;
	/** Current CAPI base URLs and sentinel (see `createLocalModelRouterEnv`); read on every request. */
	readonly getRouterEnv: () => ILocalModelRouterEnv;
	readonly telemetry: ILocalModelRouteTelemetrySink;
	readonly clock: ILocalModelClock;
	/** Optional progress for on-device requests that wait for a load, a slot or the prompt to be read. */
	readonly onDirectRequestWaiting?: (event: ILocalModelDirectWaitEvent) => void;
}

/** Used when CAPI's `/auto` answer carries no `expires_at`. */
const DEFAULT_ROUTE_TTL_MS = 30 * 60_000;

type LocalDispatchResult =
	| { readonly kind: 'committed'; readonly response: Response }
	| { readonly kind: 'cancelled' }
	| { readonly kind: 'failed'; readonly reason: LocalModelFallbackReason; readonly status?: number; readonly overflow?: ILocalContextOverflow };

/** Largest local error body read to recognize a context overflow. */
const LOCAL_ERROR_BODY_MAX_BYTES = 64 * 1024;

/** The JSON object of an error response, reading at most {@link LOCAL_ERROR_BODY_MAX_BYTES}; `undefined` otherwise. */
async function readBoundedJson(response: Response, signal: AbortSignal): Promise<LocalModelJsonBody | undefined> {
	const reader = response.body?.getReader();
	if (!reader) {
		return undefined;
	}
	const chunks: Uint8Array[] = [];
	let total = 0;
	try {
		while (!signal.aborted) {
			const { done, value } = await reader.read();
			if (done) {
				return parseJsonObject(concatBytes(chunks));
			}
			total += value.byteLength;
			if (total > LOCAL_ERROR_BODY_MAX_BYTES) {
				return undefined;
			}
			chunks.push(value);
		}
		return undefined;
	} catch {
		return undefined;
	} finally {
		reader.cancel().catch(() => { /* already done */ });
	}
}

/**
 * The context-limit error the runtime recognizes: HTTP 413 (a 400 reads as an ordinary query error) with the OpenAI
 * `context_length_exceeded` body, so the runtime compacts the conversation and retries.
 */
function contextLengthExceededResponse(overflow: ILocalContextOverflow): Response {
	return new Response(JSON.stringify(buildContextLengthExceededBody(overflow)), { status: 413, headers: { 'content-type': 'application/json' } });
}

interface ILocalDispatch {
	readonly endpoint: ILocalModelLoopbackEndpoint;
	readonly identity: IServingIdentity;
	readonly displayName: string | undefined;
	readonly body: LocalModelJsonBody;
	readonly accept: string;
	readonly mode: 'auto' | 'direct';
	/** The runtime asked for a non-streaming response: `llama-server` still streams (the commit point is the first token) and one `chat.completion` is assembled. */
	readonly assemble: boolean;
	readonly firstOutputTimeoutMs: number | undefined;
	/** Released when the local body reaches EOF, is cancelled, or errors (or before a fallback). */
	readonly resources: DisposableStore;
	/** Ended at the commit point, or when the dispatch fails or is cancelled. */
	readonly waits: LocalRequestWaitReporter;
	readonly onEnd: (end: { readonly outcome: 'eof' | 'cancel' | 'error'; readonly firstOutputMs: number; readonly outputTokens: number | undefined }) => void;
}

type CommitRead =
	| { readonly kind: 'committed'; readonly prefix: Uint8Array[] }
	| { readonly kind: 'empty' | 'error' };

function responseHeaders(source: Headers, contentType?: string): Headers {
	const headers = new Headers(source);
	// The body was decoded and re-serialized.
	headers.delete('content-length');
	headers.delete('content-encoding');
	headers.delete('transfer-encoding');
	if (contentType) {
		headers.set('content-type', contentType);
	}
	return headers;
}

const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);

function rebuildResponse(response: Response, bytes: Uint8Array<ArrayBuffer>): Response {
	return new Response(NULL_BODY_STATUSES.has(response.status) ? null : bytes, { status: response.status, statusText: response.statusText, headers: responseHeaders(response.headers) });
}

function errorResponse(status: number, code: string, message: string): Response {
	return new Response(JSON.stringify({ error: { code, message, type: code } }), { status, headers: { 'content-type': 'application/json' } });
}

function unavailableMessage(displayName: string | undefined): string {
	return displayName
		? localize('localModel.unavailable', "{0} is unavailable. Start a new chat or pick another model.", displayName)
		: localize('localModel.sentinelUnavailable', "The on-device model is not available. Start a new chat or pick another model.");
}

function errorCode(error: unknown): string {
	if (error instanceof LocalModelServingError) {
		return error.code;
	}
	if (error instanceof Error) {
		const cause = (error as Error & { cause?: { code?: unknown } }).cause;
		return typeof cause?.code === 'string' ? `${error.name}/${cause.code}` : error.name;
	}
	return typeof error;
}

function throwAborted(signal: AbortSignal): never {
	signal.throwIfAborted();
	throw new Error('Request cancelled');
}

/**
 * The bridge's `CopilotRequestHandler`: the runtime relays every model-layer HTTP request through {@link sendRequest}.
 *
 * Routes:
 * - `capiAuto` (fail open): declares the active model to `/auto` and patches a local pick;
 * - `localAuto` (fail closed): serves a CAPI `-local` request on `llama-server`, with cloud fallback before the first output;
 * - `localDirect` (fail closed): serves the direct row on `llama-server`, no fallback;
 * - `passThrough`: byte-for-byte; loopback directly, everything else through the proxy-aware fetch.
 *
 * A `-local` id or the sentinel host never leaves for anything but the loopback `llama-server`, which only receives
 * `content-type`, `accept` and its own `authorization` header. The runtime prefers HTTP Responses over WebSockets while
 * this handler is installed (`COPILOT_CLI_DISABLE_WEBSOCKET_RESPONSES`).
 */
export class LocalModelCopilotRequestHandler extends CopilotRequestHandler {

	constructor(
		private readonly _transport: ILocalModelRequestHandlerTransport,
		private readonly _logService: ILogService,
		private readonly _routing: ILocalModelRoutingDependencies,
	) {
		super();
	}

	protected override sendRequest(request: Request, ctx: CopilotRequestContext): Promise<Response> {
		return this.handleRequest(request, ctx);
	}

	/** Entry point for every relayed HTTP request. */
	async handleRequest(request: Request, ctx: CopilotRequestContext): Promise<Response> {
		const buffered = await bufferRequest(request);
		return this.route(buffered, ctx);
	}

	/** Decides where a buffered request goes. */
	protected async route(request: ILocalModelBufferedRequest, ctx: CopilotRequestContext): Promise<Response> {
		const routing = this._routing;
		const env = this._readEnv(routing);
		const classification = classifyLocalModelRequest(request, ctx, env);
		switch (classification.kind) {
			case 'capiAuto':
				return this._handleCapiAuto(routing, env, request, ctx, classification.body);
			case 'localAuto':
				return this._failClosed(routing, ctx, false, () => this._handleLocalAuto(routing, request, ctx, classification.body, classification.model));
			case 'localDirect':
				return this._failClosed(routing, ctx, true, () => this._handleLocalDirect(routing, request, ctx, classification.body));
			case 'rejected':
				return this._reject(routing, ctx, classification.reason);
			case 'passThrough':
				if (request.url.pathname.endsWith('/auto')) {
					this._logService.info(`[LocalModel] /auto: request not recognized as Auto model selection (${request.method}, ${ctx.transport}, ${request.url.origin}${request.url.pathname}); passed through`);
				}
				return this.passThrough(request, ctx);
		}
	}

	/** Forwards a buffered request unchanged. */
	protected passThrough(request: ILocalModelBufferedRequest, ctx: CopilotRequestContext): Promise<Response> {
		const fetchFn = isLoopbackUrl(request.url) ? this._transport.loopbackFetch : this._transport.proxyFetch;
		return fetchFn(toRequest(request), { signal: ctx.signal });
	}

	private _readEnv(routing: ILocalModelRoutingDependencies): ILocalModelRouterEnv {
		try {
			return routing.getRouterEnv();
		} catch (error) {
			this._logService.warn(`[LocalModel] Could not read CAPI endpoints; using the defaults (${errorCode(error)})`);
			return createLocalModelRouterEnv();
		}
	}

	/** Sends a CAPI request the router built, enforcing the isolation boundary: never the sentinel host, never a `-local` model id. */
	private _sendToCapi(request: ILocalModelBufferedRequest, ctx: CopilotRequestContext): Promise<Response> {
		const model = parseJsonObject(request.body)?.model;
		if (request.url.origin === SENTINEL_ORIGIN || (typeof model === 'string' && isLocalCapiModelId(model))) {
			throw new Error('Refusing to send an on-device request to the cloud');
		}
		return this.passThrough(request, ctx);
	}

	private _report(routing: ILocalModelRoutingDependencies, ctx: CopilotRequestContext, selection: LocalModelRouteSelection, fields: { readonly reason?: string; readonly tier?: string; readonly firstOutputMs?: number; readonly outputTokens?: number; readonly queueWaitMs?: number; readonly direct?: boolean }): void {
		try {
			routing.telemetry.reportRoute({
				selection,
				reason: fields.reason ?? '',
				interactionType: toTelemetryIdentifier(ctx.interactionType),
				tier: toTelemetryIdentifier(fields.tier),
				firstOutputMs: fields.firstOutputMs ?? -1,
				outputTokens: fields.outputTokens ?? -1,
				queueWaitMs: fields.queueWaitMs ?? -1,
				direct: fields.direct ?? false,
			});
		} catch (error) {
			this._logService.trace(`[LocalModel] Telemetry failed: ${errorCode(error)}`);
		}
	}

	private async _failClosed(routing: ILocalModelRoutingDependencies, ctx: CopilotRequestContext, direct: boolean, serve: () => Promise<Response>): Promise<Response> {
		try {
			return await serve();
		} catch (error) {
			if (ctx.signal.aborted) {
				throw error;
			}
			this._logService.error(`[LocalModel] On-device request failed closed (${errorCode(error)})`);
			this._report(routing, ctx, 'modelNotActive', { reason: 'localError', direct });
			return errorResponse(503, 'modelNotActive', unavailableMessage(this._activeDisplayName(routing)));
		}
	}

	/** The active family's display name for error messages; never throws. */
	private _activeDisplayName(routing: ILocalModelRoutingDependencies): string | undefined {
		try {
			return routing.serving.getActiveServing()?.displayName;
		} catch {
			return undefined;
		}
	}

	private async _reject(routing: ILocalModelRoutingDependencies, ctx: CopilotRequestContext, reason: LocalModelRejectReason): Promise<Response> {
		this._logService.warn(`[LocalModel] Rejected an on-device request (${reason})`);
		this._report(routing, ctx, 'modelNotActive', { reason, direct: reason === 'sentinelEndpoint' });
		if (reason === 'sentinelEndpoint') {
			return errorResponse(404, 'notFound', unavailableMessage(undefined));
		}
		return errorResponse(503, 'modelNotActive', unavailableMessage(this._activeDisplayName(routing)));
	}

	// #region `capiAuto`: fail open

	private async _handleCapiAuto(routing: ILocalModelRoutingDependencies, env: ILocalModelRouterEnv, request: ILocalModelBufferedRequest, ctx: CopilotRequestContext, body: LocalModelJsonBody): Promise<Response> {
		const tier = typeof body.tier === 'string' ? body.tier : undefined;
		let serving: IServingSnapshot;
		let accountGeneration: number;
		try {
			const active = routing.serving.getActiveServing();
			const decision = decideAutoInjection(body, {
				gates: routing.serving.getGates(),
				serving: active,
				endpointDown: !!active && routing.serving.isEndpointDown(active.identity.servingGeneration),
				knownAutoLocalIds: env.knownAutoLocalIds,
			});
			if (!decision.inject) {
				this._logService.info(`[LocalModel] /auto: on-device model not offered (${decision.reason})`);
				this._report(routing, ctx, 'notDeclared', { reason: decision.reason, tier });
				return this.passThrough(request, ctx);
			}
			// Both are captured before sending: a route is bound to the account and
			// serving identity that issued the request, never to those current when
			// the answer arrives.
			serving = decision.serving;
			accountGeneration = routing.serving.getAccountGeneration();
		} catch (error) {
			this._logService.warn(`[LocalModel] /auto: router error; sending the original request (${errorCode(error)})`);
			return this.passThrough(request, ctx);
		}

		try {
			const response = await this._sendToCapi(buildInjectedAutoRequest(request, body, serving.identity.capiId), ctx);
			return await this._completeCapiAuto(routing, request, body, ctx, response, serving, accountGeneration, tier);
		} catch (error) {
			if (ctx.signal.aborted) {
				throw error;
			}
			this._logService.warn(`[LocalModel] /auto: declaration failed; sending the original request (${errorCode(error)})`);
			return this.passThrough(request, ctx);
		}
	}

	/** Settles CAPI's answer to an `/auto` request that declared the on-device model, logging each decision with {@link describeAutoDecision}. */
	private async _completeCapiAuto(routing: ILocalModelRoutingDependencies, request: ILocalModelBufferedRequest, body: LocalModelJsonBody, ctx: CopilotRequestContext, response: Response, serving: IServingSnapshot, accountGeneration: number, tier: string | undefined): Promise<Response> {
		const bytes = new Uint8Array(await response.arrayBuffer());
		if (!response.ok) {
			const decision = describeAutoDecision(body, undefined, response.headers);
			if (response.status === 400 || response.status === 422) {
				this._logService.warn(`[LocalModel] /auto: CAPI rejected the declaration (${response.status}); sending the original request (${decision})`);
				this._report(routing, ctx, 'notDeclared', { reason: 'declarationRejected', tier });
				return this.passThrough(request, ctx);
			}
			this._logService.info(`[LocalModel] /auto: CAPI answered ${response.status} to the declaration (${decision})`);
			return rebuildResponse(response, bytes);
		}
		const json = parseJsonObject(bytes);
		const decision = describeAutoDecision(body, json, response.headers);
		const outcome = json ? evaluateAutoResponse(json, serving) : { kind: 'notOurs' as const };
		switch (outcome.kind) {
			case 'notOurs':
				this._logService.info(`[LocalModel] /auto: on-device model offered; Auto selected ${(json && readAutoSelectedModelId(json)) ?? 'no model'} (${decision})`);
				this._report(routing, ctx, 'cloud', { tier });
				return rebuildResponse(response, bytes);
			case 'reissue':
				this._logService.info(`[LocalModel] /auto: local pick without a usable fallback (${outcome.reason}); re-issuing cloud-only (${decision})`);
				this._report(routing, ctx, 'cloudOnlyReissue', { reason: outcome.reason, tier });
				return this.passThrough(request, ctx);
			case 'patch': {
				if (routing.serving.getAccountGeneration() !== accountGeneration) {
					// The account changed while `/auto` was in flight: the answer (and its
					// session token) belongs to the previous account, so no route is
					// recorded; the runtime gets the cloud-only answer to its own request.
					this._logService.info(`[LocalModel] /auto: account changed while declaring; re-issuing cloud-only (${decision})`);
					this._report(routing, ctx, 'cloudOnlyReissue', { reason: 'accountChanged', tier });
					return this.passThrough(request, ctx);
				}
				const now = routing.clock.now();
				routing.routeTable.add(outcome.sessionToken, {
					fallback: outcome.fallback,
					serving: serving.identity,
					capiOrigin: request.url.origin,
					accountGeneration,
					expiresAt: outcome.expiresAtMs ?? now + DEFAULT_ROUTE_TTL_MS,
					limits: outcome.limits,
					tier,
				});
				this._logService.info(`[LocalModel] /auto: local pick routed (route ${hashRouteToken(outcome.sessionToken)}, generation ${serving.identity.servingGeneration}; ${decision})`);
				return new Response(encodeJsonBody(outcome.body), { status: response.status, statusText: response.statusText, headers: responseHeaders(response.headers, 'application/json') });
			}
		}
	}

	// #endregion

	// #region `localAuto`: fail closed

	private async _handleLocalAuto(routing: ILocalModelRoutingDependencies, request: ILocalModelBufferedRequest, ctx: CopilotRequestContext, body: LocalModelJsonBody, model: string): Promise<Response> {
		const resources = new DisposableStore();
		const ownership = { transferred: false };
		try {
			const token = request.headers.get('copilot-session-token') ?? undefined;
			const routeLease = token ? routing.routeTable.acquire(token, routing.serving.getAccountGeneration()) : undefined;
			if (token && routeLease) {
				resources.add(routeLease);
				return await this._serveRoutedAuto(routing, request, ctx, body, model, token, routeLease.record, resources, ownership);
			}
			return await this._serveUnroutedAuto(routing, request, ctx, body, model, resources, ownership);
		} finally {
			if (!ownership.transferred) {
				resources.dispose();
			}
		}
	}

	private async _serveRoutedAuto(routing: ILocalModelRoutingDependencies, request: ILocalModelBufferedRequest, ctx: CopilotRequestContext, body: LocalModelJsonBody, model: string, token: string, route: IRouteRecord, resources: DisposableStore, ownership: { transferred: boolean }): Promise<Response> {
		const serving = routing.serving;
		const servingLease = serving.acquireServingLease(route.serving, ctx.sessionId);
		if (servingLease) {
			resources.add(servingLease);
		}
		// A turn holding the routed generation continues on it through a swap, reload or stop.
		const held = serving.getHeldServing(ctx.sessionId);
		const snapshot = held?.identity.servingGeneration === route.serving.servingGeneration ? held : serving.getActiveServing();
		const gates = serving.getGates();
		const generation = route.serving.servingGeneration;

		let reason: LocalModelFallbackReason | undefined;
		if (!servingLease || !snapshot || snapshot.identity.servingGeneration !== generation || snapshot.swapInProgress || model.toLowerCase() !== route.serving.capiId.toLowerCase()) {
			reason = 'staleModel';
		} else if (!gates.enabled || !gates.accountGate || !gates.useInAuto) {
			reason = 'disabled';
		} else if (isAncillaryInteraction(ctx.interactionType)) {
			reason = 'ancillary';
		} else if (hasImageParts(body)) {
			reason = 'image';
		} else if (snapshot.server !== 'ready' || !snapshot.endpoint || serving.isEndpointDown(generation)) {
			reason = 'endpointDown';
		} else {
			const slot = serving.tryAcquireSlot(servingLease);
			if (slot) {
				resources.add(slot);
			} else {
				reason = 'slotsFull';
			}
		}
		if (reason || !snapshot?.endpoint) {
			resources.dispose();
			return this._fallback(routing, request, ctx, body, token, route, reason ?? 'endpointDown');
		}

		const result = await this._dispatchLocal(routing, ctx, {
			endpoint: snapshot.endpoint,
			identity: route.serving,
			displayName: snapshot.displayName,
			body: adaptLocalRequestBody(body, { mode: 'auto', alias: route.serving.alias, maxOutputTokens: route.limits.maxOutputTokens, thinking: snapshot.thinking }),
			accept: request.headers.get('accept') ?? (body.stream === true ? 'text/event-stream' : 'application/json'),
			mode: 'auto',
			assemble: body.stream !== true,
			firstOutputTimeoutMs: FIRST_OUTPUT_TIMEOUT_MS,
			resources,
			waits: this._createWaitReporter(routing, ctx, route.serving.familyId),
			onEnd: end => this._onLocalEnd(routing, ctx, end, route.tier, false),
		});
		switch (result.kind) {
			case 'committed':
				ownership.transferred = true;
				routing.ledger.record(ctx.sessionId, { kind: 'local', serving: route.serving });
				return result.response;
			case 'cancelled':
				resources.dispose();
				this._report(routing, ctx, 'local', { reason: 'cancelled', tier: route.tier });
				return throwAborted(ctx.signal);
			case 'failed':
				resources.dispose();
				if (result.reason === 'connectFailed') {
					serving.markEndpointDown(generation);
				}
				return this._fallback(routing, request, ctx, body, token, route, result.reason, result.status);
		}
	}

	private async _serveUnroutedAuto(routing: ILocalModelRoutingDependencies, request: ILocalModelBufferedRequest, ctx: CopilotRequestContext, body: LocalModelJsonBody, model: string, resources: DisposableStore, ownership: { transferred: boolean }): Promise<Response> {
		const serving = routing.serving;
		// A turn holding the model continues on it through a swap, reload or stop.
		const held = serving.getHeldServing(ctx.sessionId);
		const snapshot = held && model.toLowerCase() === held.identity.capiId.toLowerCase() ? held : serving.getActiveServing();
		const gates = serving.getGates();
		const notServed = (reason: string): Response => {
			this._logService.info(`[LocalModel] On-device Auto request without a route not served (${reason})`);
			this._report(routing, ctx, 'modelNotActive', { reason });
			return errorResponse(503, 'modelNotActive', unavailableMessage(snapshot?.displayName));
		};
		if (!snapshot || model.toLowerCase() !== snapshot.identity.capiId.toLowerCase()) {
			return notServed('noRoute');
		}
		if (!gates.enabled || !gates.accountGate || !gates.useInAuto) {
			return notServed('disabled');
		}
		const generation = snapshot.identity.servingGeneration;
		if (snapshot.server !== 'ready' || !snapshot.endpoint || !snapshot.props || snapshot.swapInProgress || serving.isEndpointDown(generation)) {
			return notServed('endpointDown');
		}
		const servingLease = serving.acquireServingLease(snapshot.identity, ctx.sessionId);
		if (!servingLease) {
			return notServed('staleModel');
		}
		resources.add(servingLease);
		const slot = serving.tryAcquireSlot(servingLease);
		if (!slot) {
			return notServed('slotsFull');
		}
		resources.add(slot);

		const limits = computeLocalModelLimits(snapshot.props, snapshot.limits);
		const result = await this._dispatchLocal(routing, ctx, {
			endpoint: snapshot.endpoint,
			identity: snapshot.identity,
			displayName: snapshot.displayName,
			body: adaptLocalRequestBody(body, { mode: 'auto', alias: snapshot.identity.alias, maxOutputTokens: limits?.maxOutputTokens, thinking: snapshot.thinking }),
			accept: request.headers.get('accept') ?? (body.stream === true ? 'text/event-stream' : 'application/json'),
			mode: 'auto',
			assemble: body.stream !== true,
			// No fallback exists, so a slow first token is not cut off.
			firstOutputTimeoutMs: undefined,
			resources,
			waits: this._createWaitReporter(routing, ctx, snapshot.identity.familyId),
			onEnd: end => this._onLocalEnd(routing, ctx, end, undefined, false),
		});
		switch (result.kind) {
			case 'committed':
				ownership.transferred = true;
				routing.ledger.record(ctx.sessionId, { kind: 'local', serving: snapshot.identity });
				return result.response;
			case 'cancelled':
				return throwAborted(ctx.signal);
			case 'failed':
				resources.dispose();
				if (result.reason === 'connectFailed') {
					serving.markEndpointDown(generation);
				}
				if (result.overflow) {
					this._report(routing, ctx, 'modelNotActive', { reason: result.reason });
					return contextLengthExceededResponse(result.overflow);
				}
				return notServed(result.reason);
		}
	}

	private async _fallback(routing: ILocalModelRoutingDependencies, request: ILocalModelBufferedRequest, ctx: CopilotRequestContext, body: LocalModelJsonBody, token: string, route: IRouteRecord, reason: LocalModelFallbackReason, localStatus?: number): Promise<Response> {
		if (ctx.signal.aborted) {
			// User cancellation never starts cloud inference.
			throwAborted(ctx.signal);
		}
		this._logService.info(`[LocalModel] Auto request falls back to the cloud (${reason}${localStatus ? `, local status ${localStatus}` : ''}, route ${hashRouteToken(token)})`);
		routing.ledger.record(ctx.sessionId, { kind: 'fallback', reason, fallbackModel: route.fallback.id, serving: route.serving });
		this._report(routing, ctx, 'fallback', { reason, tier: route.tier });
		// A 401 (expired token) goes back to the runtime, which renews `/auto`.
		return this._sendToCapi(buildFallbackChatRequest(request, body, route.fallback, token), ctx);
	}

	// #endregion

	// #region `localDirect`: fail closed, no fallback

	private async _handleLocalDirect(routing: ILocalModelRoutingDependencies, request: ILocalModelBufferedRequest, ctx: CopilotRequestContext, body: LocalModelJsonBody | undefined): Promise<Response> {
		const serving = routing.serving;
		const model = typeof body?.model === 'string' ? body.model : undefined;
		if (!body || !model) {
			this._report(routing, ctx, 'modelNotActive', { reason: 'invalidRequest', direct: true });
			return errorResponse(400, 'invalidRequest', localize('localModel.invalidRequest', "The on-device model received a request it could not read."));
		}
		const gates = serving.getGates();
		if (!gates.enabled || !gates.accountGate) {
			this._report(routing, ctx, 'modelNotActive', { reason: 'disabled', direct: true });
			return errorResponse(503, 'modelNotActive', unavailableMessage(undefined));
		}
		const family = serving.findFamilyByAlias(model);
		// A turn holding this model continues on it through a swap, reload or stop, until the turn ends.
		const held = family ? serving.getHeldServing(ctx.sessionId) : undefined;
		const heldSnapshot = held && held.identity.familyId === family?.familyId ? held : undefined;
		if (!family || (family.state === 'inactive' && !heldSnapshot)) {
			// Never trigger a swap from a request, and never serve another model.
			this._logService.info(`[LocalModel] Direct request for a model that is not active (${family ? 'inactive' : 'unknown'})`);
			this._report(routing, ctx, 'modelNotActive', { reason: family ? 'inactive' : 'unknown', direct: true });
			return errorResponse(409, 'modelNotActive', localize('localModel.modelNotActive', "{0} isn't loaded.", family?.displayName ?? model));
		}

		const resources = new DisposableStore();
		const ownership = { transferred: false };
		const waits = this._createWaitReporter(routing, ctx, family.familyId);
		try {
			let snapshot: IServingSnapshot;
			if (heldSnapshot) {
				snapshot = heldSnapshot;
			} else {
				const current = serving.getActiveServing();
				if (family.state === 'incoming' || current?.identity.familyId !== family.familyId || current.server !== 'ready') {
					waits.loading();
				}
				try {
					snapshot = await serving.ensureStarted(family.familyId, ctx.signal);
				} catch (error) {
					return this._directServingError(routing, ctx, error, family.displayName);
				}
			}
			const servingLease = snapshot.identity.familyId === family.familyId && snapshot.endpoint ? serving.acquireServingLease(snapshot.identity, ctx.sessionId) : undefined;
			if (!servingLease || !snapshot.endpoint) {
				this._report(routing, ctx, 'modelNotActive', { reason: 'staleModel', direct: true });
				return errorResponse(503, 'modelNotActive', unavailableMessage(family.displayName));
			}
			resources.add(servingLease);

			const queueStart = routing.clock.now();
			let queued = false;
			let slot: IServingSlot;
			try {
				slot = await serving.acquireSlot(servingLease, {
					signal: ctx.signal,
					onQueuePosition: position => {
						queued = true;
						waits.queued(position);
					},
				});
			} catch (error) {
				return this._directServingError(routing, ctx, error, family.displayName);
			}
			resources.add(slot);
			const queueWaitMs = queued ? routing.clock.now() - queueStart : undefined;

			const limits = snapshot.props ? computeLocalModelLimits(snapshot.props, snapshot.limits) : undefined;
			const result = await this._dispatchLocal(routing, ctx, {
				endpoint: snapshot.endpoint,
				identity: snapshot.identity,
				displayName: family.displayName,
				body: adaptLocalRequestBody(body, { mode: 'direct', alias: snapshot.identity.alias, maxOutputTokens: limits?.maxOutputTokens, thinking: snapshot.thinking }),
				accept: request.headers.get('accept') ?? (body.stream === true ? 'text/event-stream' : 'application/json'),
				mode: 'direct',
				assemble: body.stream !== true,
				firstOutputTimeoutMs: undefined,
				resources,
				waits,
				onEnd: end => this._onLocalEnd(routing, ctx, end, undefined, true, queueWaitMs),
			});
			if (result.kind === 'committed') {
				ownership.transferred = true;
				routing.ledger.record(ctx.sessionId, { kind: 'local', serving: snapshot.identity });
				return result.response;
			}
			if (result.kind === 'cancelled') {
				return throwAborted(ctx.signal);
			}
			if (result.reason === 'connectFailed') {
				serving.markEndpointDown(snapshot.identity.servingGeneration);
			}
			if (result.overflow) {
				// Built for a larger context (for example before the context size was reduced): the runtime compacts and retries against the row's current limits.
				this._logService.info('[LocalModel] Direct request does not fit the on-device model\'s context');
				this._report(routing, ctx, 'modelNotActive', { reason: result.reason, direct: true, queueWaitMs });
				return contextLengthExceededResponse(result.overflow);
			}
			this._logService.warn(`[LocalModel] Direct request failed before output (${result.reason}${result.status ? `, local status ${result.status}` : ''})`);
			this._report(routing, ctx, 'modelNotActive', { reason: result.reason, direct: true, queueWaitMs });
			return errorResponse(503, 'modelNotActive', unavailableMessage(family.displayName));
		} finally {
			waits.end();
			if (!ownership.transferred) {
				resources.dispose();
			}
		}
	}

	private _directServingError(routing: ILocalModelRoutingDependencies, ctx: CopilotRequestContext, error: unknown, displayName: string): Response {
		if (ctx.signal.aborted) {
			throwAborted(ctx.signal);
		}
		const code = error instanceof LocalModelServingError ? error.code : 'startFailed';
		this._logService.warn(`[LocalModel] Direct request not served (${errorCode(error)})`);
		this._report(routing, ctx, 'modelNotActive', { reason: code, direct: true });
		const message = error instanceof LocalModelServingError ? error.message : unavailableMessage(displayName);
		return errorResponse(code === 'modelNotActive' ? 409 : 503, code, message);
	}

	// #endregion

	// #region Local dispatch

	/** Reports one request's waits for `familyId` to {@link ILocalModelRoutingDependencies.onDirectRequestWaiting}. */
	private _createWaitReporter(routing: ILocalModelRoutingDependencies, ctx: CopilotRequestContext, familyId: string): LocalRequestWaitReporter {
		return new LocalRequestWaitReporter((kind, details) => {
			try {
				routing.onDirectRequestWaiting?.({ sessionId: ctx.sessionId, familyId, kind, ...details });
			} catch (error) {
				this._logService.trace(`[LocalModel] Wait observer failed: ${errorCode(error)}`);
			}
		}, routing.clock);
	}

	private _onLocalEnd(routing: ILocalModelRoutingDependencies, ctx: CopilotRequestContext, end: { readonly outcome: 'eof' | 'cancel' | 'error'; readonly firstOutputMs: number; readonly outputTokens: number | undefined }, tier: string | undefined, direct: boolean, queueWaitMs?: number): void {
		const reason = end.outcome === 'eof' ? '' : end.outcome === 'cancel' ? 'cancelled' : 'streamError';
		if (end.outcome === 'error') {
			this._logService.warn('[LocalModel] Local response ended with an error after output started; not replayed');
		}
		this._report(routing, ctx, 'local', { reason, tier, firstOutputMs: end.firstOutputMs, outputTokens: end.outputTokens, queueWaitMs, direct });
	}

	/**
	 * Sends the adapted request to `llama-server` and reads up to the commit point: the first non-empty SSE `data:` event
	 * other than prompt progress (or a complete JSON body). Until then nothing has reached the runtime, so the caller can
	 * still fall back. The first-output timer is separate from the user's signal and cleared at the commit point.
	 */
	private async _dispatchLocal(routing: ILocalModelRoutingDependencies, ctx: CopilotRequestContext, requested: ILocalDispatch): Promise<LocalDispatchResult> {
		const dispatch: ILocalDispatch = requested.assemble
			? { ...requested, accept: 'text/event-stream', body: toStreamingLocalRequestBody(requested.body) }
			: requested;
		const url = new URL('/v1/chat/completions', dispatch.endpoint.baseUrl);
		if (!isLoopbackUrl(url)) {
			this._logService.error('[LocalModel] Refusing to send an on-device request to a non-loopback endpoint');
			return { kind: 'failed', reason: 'localError' };
		}
		const localAbort = new AbortController();
		const signal = AbortSignal.any([ctx.signal, localAbort.signal]);
		let timedOut = false;
		const timer = dispatch.firstOutputTimeoutMs === undefined ? undefined : routing.clock.setTimeout(() => {
			timedOut = true;
			localAbort.abort();
		}, dispatch.firstOutputTimeoutMs);
		const startedAt = routing.clock.now();
		const failure = (error: unknown): LocalDispatchResult => {
			if (ctx.signal.aborted) {
				return { kind: 'cancelled' };
			}
			if (timedOut) {
				return { kind: 'failed', reason: 'firstOutputTimeout' };
			}
			return { kind: 'failed', reason: isConnectFailure(error) ? 'connectFailed' : 'localError' };
		};

		try {
			let response: Response;
			dispatch.waits.dispatched(!requested.assemble);
			try {
				response = await this._transport.loopbackFetch(new Request(url, {
					method: 'POST',
					// Only these three headers: no CAPI/GitHub credentials, no `Copilot-*` or integration headers.
					headers: { 'content-type': 'application/json', 'accept': dispatch.accept, 'authorization': `Bearer ${dispatch.endpoint.apiKey}` },
					body: JSON.stringify(dispatch.body),
				}), { signal });
			} catch (error) {
				return failure(error);
			}
			if (!response.ok || !response.body) {
				const overflow = !response.ok && response.status === 400 ? readLocalContextOverflow(await readBoundedJson(response, ctx.signal)) : undefined;
				response.body?.cancel().catch(() => { /* already failed */ });
				if (ctx.signal.aborted) {
					return { kind: 'cancelled' };
				}
				if (overflow) {
					return { kind: 'failed', reason: 'contextExceeded', status: response.status, overflow };
				}
				return { kind: 'failed', reason: response.ok ? 'emptyStream' : 'httpError', status: response.status };
			}

			const reader = response.body.getReader();
			const sse = (response.headers.get('content-type') ?? '').includes('text/event-stream');
			let commit: CommitRead;
			try {
				commit = await this._readUntilCommit(reader, sse, progress => dispatch.waits.promptProgress(progress));
			} catch (error) {
				reader.cancel().catch(() => { /* already failed */ });
				return failure(error);
			}
			if (commit.kind !== 'committed') {
				reader.cancel().catch(() => { /* already failed */ });
				if (ctx.signal.aborted) {
					return { kind: 'cancelled' };
				}
				return { kind: 'failed', reason: commit.kind === 'empty' ? 'emptyStream' : 'streamError' };
			}

			// Commit point: from here on there is no fallback and no replay.
			timer?.dispose();
			dispatch.waits.end();
			const firstOutputMs = routing.clock.now() - startedAt;
			const capiId = dispatch.identity.capiId;
			if (!sse) {
				const payload = parseJsonObject(concatBytes(commit.prefix));
				const adapted = payload ? adaptLocalJsonResponse(payload, dispatch.mode, capiId) : undefined;
				dispatch.resources.dispose();
				dispatch.onEnd({ outcome: 'eof', firstOutputMs, outputTokens: adapted?.outputTokens });
				return { kind: 'committed', response: new Response(adapted ? encodeJsonBody(adapted.body) : concatBytes(commit.prefix), { status: response.status, headers: { 'content-type': 'application/json' } }) };
			}
			if (dispatch.assemble) {
				return await this._assembleCompletion(ctx, dispatch, reader, commit.prefix, response.status, firstOutputMs);
			}
			const adapter = new LocalSseResponseAdapter(dispatch.mode, capiId);
			const stream = createReleasingStream(commit.prefix, reader, adapter, ctx.signal, unavailableMessage(dispatch.displayName), outcome => {
				dispatch.resources.dispose();
				dispatch.onEnd({ outcome, firstOutputMs, outputTokens: adapter.outputTokens });
			});
			return { kind: 'committed', response: new Response(stream, { status: response.status, headers: { 'content-type': 'text/event-stream' } }) };
		} finally {
			timer?.dispose();
			// Failed or cancelled before the first output.
			dispatch.waits.end();
		}
	}

	/**
	 * After the commit point of a non-streaming request: reads the rest of the stream with no overall timeout and returns
	 * one `chat.completion`. No fallback or replay from here; the slot and leases are released when assembly ends.
	 */
	private async _assembleCompletion(ctx: CopilotRequestContext, dispatch: ILocalDispatch, reader: ReadableStreamDefaultReader<Uint8Array>, prefix: readonly Uint8Array[], status: number, firstOutputMs: number): Promise<LocalDispatchResult> {
		const assembler = new LocalChatCompletionAssembler(dispatch.mode, dispatch.identity.capiId);
		let outcome: 'eof' | 'cancel' | 'error' = 'error';
		try {
			for (const chunk of prefix) {
				assembler.push(chunk);
			}
			let eof = false;
			while (!eof && !assembler.done && !assembler.failed) {
				const { value, done } = await reader.read();
				if (done) {
					eof = true;
				} else {
					assembler.push(value);
				}
			}
			if (!eof) {
				reader.cancel().catch(() => { /* the response is complete or failed */ });
			}
			const completion = assembler.finish();
			if (assembler.failed || !assembler.terminated) {
				// An error event, or EOF before any choice finished: a truncated answer is never returned as complete.
				this._logService.warn(`[LocalModel] Local generation ${assembler.failed ? 'failed' : 'ended before finishing'} after output started; not replayed`);
				return { kind: 'committed', response: errorResponse(502, 'localModelFailed', unavailableMessage(dispatch.displayName)) };
			}
			outcome = 'eof';
			return { kind: 'committed', response: new Response(encodeJsonBody(completion), { status, headers: { 'content-type': 'application/json' } }) };
		} catch (error) {
			reader.cancel().catch(() => { /* already failed */ });
			if (ctx.signal.aborted) {
				outcome = 'cancel';
				return throwAborted(ctx.signal);
			}
			this._logService.warn(`[LocalModel] Local generation failed after output started (${errorCode(error)})`);
			return { kind: 'committed', response: errorResponse(502, 'localModelFailed', unavailableMessage(dispatch.displayName)) };
		} finally {
			dispatch.resources.dispose();
			dispatch.onEnd({ outcome, firstOutputMs, outputTokens: assembler.outputTokens });
		}
	}

	private async _readUntilCommit(reader: ReadableStreamDefaultReader<Uint8Array>, sse: boolean, onPromptProgress: (progress: ILocalPromptProgress) => void): Promise<CommitRead> {
		const prefix: Uint8Array[] = [];
		const scanner = sse ? new SseCommitScanner(onPromptProgress) : undefined;
		while (true) {
			const { value, done } = await reader.read();
			if (done) {
				if (!scanner) {
					const payload = parseJsonObject(concatBytes(prefix));
					return payload && !isErrorPayload(payload) ? { kind: 'committed', prefix } : { kind: prefix.length ? 'error' : 'empty' };
				}
				const state = scanner.end();
				return state === 'committed' ? { kind: 'committed', prefix } : { kind: state === 'error' ? 'error' : 'empty' };
			}
			if (!value || value.byteLength === 0) {
				continue;
			}
			prefix.push(value);
			if (scanner) {
				const state = scanner.push(value);
				if (state === 'committed') {
					return { kind: 'committed', prefix };
				}
				if (state === 'empty' || state === 'error') {
					return { kind: state };
				}
			}
		}
	}

	// #endregion
}

function concatBytes(chunks: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
	const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
	let offset = 0;
	for (const chunk of chunks) {
		result.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return result;
}

/**
 * The response body after the commit point: the read prefix, then the rest of the local stream through the adapter.
 * `onDone` runs exactly once, when the local body reaches EOF, is cancelled or errors (never merely because
 * `sendRequest` returned); an EOF before proper termination errors the body with `truncatedMessage`.
 */
function createReleasingStream(prefix: readonly Uint8Array[], reader: ReadableStreamDefaultReader<Uint8Array>, adapter: LocalSseResponseAdapter, userSignal: AbortSignal, truncatedMessage: string, onDone: (outcome: 'eof' | 'cancel' | 'error') => void): ReadableStream<Uint8Array> {
	const pending = [...prefix];
	let finished = false;
	let consumerCancelled = false;
	const finish = (outcome: 'eof' | 'cancel' | 'error') => {
		if (!finished) {
			finished = true;
			userSignal.removeEventListener('abort', onAbort);
			onDone(outcome);
		}
	};
	const onAbort = () => {
		try {
			reader.cancel().catch(() => { /* already finished */ });
		} finally {
			finish('cancel');
		}
	};
	userSignal.addEventListener('abort', onAbort);
	if (userSignal.aborted) {
		onAbort();
	}

	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				while (true) {
					const next = pending.shift();
					let chunk: Uint8Array;
					if (next) {
						chunk = adapter.push(next);
					} else {
						const { value, done } = await reader.read();
						if (consumerCancelled) {
							return;
						}
						if (done) {
							if (userSignal.aborted) {
								finish('cancel');
								controller.error(userSignal.reason);
								return;
							}
							const tail = adapter.flush();
							if (!adapter.terminated) {
								// EOF before any choice finished: end with an error, which the SDK relays as an
								// error end of the response (not a clean end the runtime would take as complete).
								finish('error');
								controller.error(new Error(truncatedMessage));
								return;
							}
							if (tail.byteLength) {
								controller.enqueue(tail);
							}
							controller.close();
							finish('eof');
							return;
						}
						chunk = adapter.push(value);
					}
					if (chunk.byteLength) {
						controller.enqueue(chunk);
						return;
					}
				}
			} catch (error) {
				finish(userSignal.aborted || consumerCancelled ? 'cancel' : 'error');
				if (!consumerCancelled) {
					controller.error(error);
				}
			}
		},
		async cancel(reason) {
			consumerCancelled = true;
			try {
				await reader.cancel(reason);
			} catch {
				// The local body is gone either way.
			} finally {
				finish('cancel');
			}
		},
	});
}
