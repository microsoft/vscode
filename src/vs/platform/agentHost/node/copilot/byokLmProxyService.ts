/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { IByokLmChatRequest, IByokLmThinkingPart, IByokLmToolCall } from '../../common/agentHostByokLm.js';
import { IByokLmBridgeRegistry } from '../byokLmBridgeRegistry.js';
import { parseProxyBearer } from '../claude/claudeProxyAuth.js';
import {
	ILoopbackProxyHandle,
	ILoopbackProxyRuntime,
	IProxyInFlight,
	LoopbackProxyServer,
	readProxyRequestBody,
} from '../shared/loopbackProxyServer.js';
import {
	IOpenAiChatRequest,
	OpenAiTranslationError,
	bridgeResultToSseFrames,
	openAiErrorBody,
	openAiRequestToBridge,
} from './byokOpenAiTranslation.js';

// #region Public types

/**
 * Handle returned by {@link IByokLmProxyService.start}. Refcounts the shared
 * loopback server (see {@link LoopbackProxyServer}): when every handle is
 * disposed the listener closes and the nonce is destroyed; the next `start()`
 * rebinds with a fresh port and nonce.
 *
 * **Subprocess ownership invariant.** Callers that hand `baseUrl`/`nonce` to
 * the Copilot SDK runtime subprocess MUST kill that subprocess before calling
 * `dispose()` — after disposal the proxy may rebind on a different port and the
 * subprocess would silently lose its endpoint (same contract as the Claude and
 * Codex proxies).
 */
export interface IByokLmProxyHandle extends ILoopbackProxyHandle {
	/** e.g. `http://127.0.0.1:54321` — no trailing slash. */
	readonly baseUrl: string;
	/** 256-bit hex string. Combine with a session id as `Bearer <nonce>.<sessionId>`. */
	readonly nonce: string;
	/**
	 * Build the provider `baseUrl` for a given BYOK vendor. The vendor is
	 * encoded into the path so a single proxy can serve every vendor; the
	 * runtime appends `/chat/completions` to this URL.
	 */
	providerBaseUrl(vendor: string): string;
}

export const IByokLmProxyService = createDecorator<IByokLmProxyService>('byokLmProxyService');

export interface IByokLmProxyService {
	readonly _serviceBrand: undefined;

	/** Start the proxy (if not already running) and return a refcounted handle. */
	start(): Promise<IByokLmProxyHandle>;

	/**
	 * Force-close the proxy regardless of refcount and abort in-flight
	 * requests. Idempotent; subsequent `start()` calls rebind.
	 */
	dispose(): void;
}

// #endregion

const PROXY_USER_FACING_NAME = 'ByokLmProxyService';
const VENDOR_PATH_PREFIX = '/v/';
const CHAT_COMPLETIONS_SUFFIX = '/chat/completions';

/** Store bounds: 16 sessions × 64 tool-call entries (1024 total); per-session nesting keeps eviction fair. */
const MAX_CONTINUATION_SESSIONS = 16;
const MAX_CONTINUATION_ENTRIES_PER_SESSION = 64;

/**
 * Bounded store of opaque provider continuation parts, nested by session id then
 * tool-call id, so they can be rehydrated onto replayed tool calls the OpenAI
 * wire cannot round-trip. Lookups never evict (replays may repeat).
 */
class ByokLmContinuationStore {

	private readonly _sessions = new Map<string, Map<string, readonly IByokLmThinkingPart[]>>();

	/** Cache the continuation parts for a session's tool call, refreshing recency. */
	remember(sessionId: string, toolCallId: string, parts: readonly IByokLmThinkingPart[]): void {
		let entries = this._sessions.get(sessionId);
		// Re-insert so the most recently used session/entry sorts last for LRU eviction.
		this._sessions.delete(sessionId);
		if (!entries) {
			entries = new Map();
		}
		this._sessions.set(sessionId, entries);
		entries.delete(toolCallId);
		entries.set(toolCallId, parts);

		this._evictOldest(entries, MAX_CONTINUATION_ENTRIES_PER_SESSION);
		this._evictOldest(this._sessions, MAX_CONTINUATION_SESSIONS);
	}

	/** Look up cached continuation parts; does not evict, so retries can reuse them. */
	get(sessionId: string, toolCallId: string): readonly IByokLmThinkingPart[] | undefined {
		return this._sessions.get(sessionId)?.get(toolCallId);
	}

	private _evictOldest<V>(map: Map<string, V>, max: number): void {
		while (map.size > max) {
			const oldest = map.keys().next().value;
			if (oldest === undefined) {
				break;
			}
			map.delete(oldest);
		}
	}
}

/** Per-bind mutable state: the continuation store preserving opaque provider metadata across the loopback boundary. */
type ByokLmProxyState = ByokLmContinuationStore;

/**
 * Local OpenAI-compatible HTTP proxy that lets the Copilot SDK runtime run
 * BYOK models provided by VS Code extensions. The runtime is configured with a
 * `type: 'openai'`, `wireApi: 'completions'` provider whose `baseUrl` points
 * here; inbound `POST /v/<vendor>/chat/completions` requests are authenticated,
 * translated, and forwarded to the renderer LM API via
 * {@link IByokLmBridgeRegistry}, and the buffered completion is streamed back
 * as OpenAI Chat Completions SSE.
 *
 * The server lifecycle — lazy bind on `127.0.0.1`, nonce minting, refcounted
 * handles, in-flight tracking, and teardown — is inherited from
 * {@link LoopbackProxyServer}; this subclass only implements request routing.
 */
export class ByokLmProxyService extends LoopbackProxyServer<ByokLmProxyState> implements IByokLmProxyService {

	declare readonly _serviceBrand: undefined;

	constructor(
		@ILogService logService: ILogService,
		@IByokLmBridgeRegistry private readonly _bridgeRegistry: IByokLmBridgeRegistry,
	) {
		super(PROXY_USER_FACING_NAME, logService);
	}

	protected createState(): ByokLmProxyState {
		// One continuation store per bind; discarded when the proxy unbinds.
		return new ByokLmContinuationStore();
	}

	async start(): Promise<IByokLmProxyHandle> {
		const { runtime, release } = await this.acquire();

		let disposed = false;
		return {
			baseUrl: runtime.baseUrl,
			nonce: runtime.nonce,
			providerBaseUrl: (vendor: string) => `${runtime.baseUrl}${VENDOR_PATH_PREFIX}${encodeURIComponent(vendor)}`,
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				release();
			},
		};
	}

	/** Emit the base's fallback failure using the OpenAI error envelope. */
	protected override writeInternalError(res: http.ServerResponse): void {
		this._writeJsonError(res, 500, 'Internal proxy error');
	}

	protected override async handleRequest(req: http.IncomingMessage, res: http.ServerResponse, runtime: ILoopbackProxyRuntime<ByokLmProxyState>): Promise<void> {
		const method = req.method ?? 'GET';
		const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
		this._logService.trace(`[${PROXY_USER_FACING_NAME}] ${method} ${pathname}`);

		if (method === 'GET' && pathname === '/') {
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.end('ok');
			return;
		}

		// Inbound requests carry `Bearer <nonce>.<sessionId>`; the runtime is
		// handed `<nonce>.<sessionId>` at session launch.
		const auth = parseProxyBearer(req.headers, runtime.nonce);
		if (!auth.valid || !auth.sessionId) {
			this._writeJsonError(res, 401, 'Invalid authentication', 'authentication_error');
			return;
		}

		const vendor = this._parseVendorFromChatPath(pathname);
		if (method === 'POST' && vendor !== undefined) {
			await this._handleChatCompletions(req, res, runtime, vendor, auth.sessionId);
			return;
		}

		this._writeJsonError(res, 404, `No route for ${method} ${pathname}`, 'not_found_error');
	}

	/**
	 * Extract the vendor from a `/v/<vendor>/chat/completions` path, or return
	 * `undefined` when the path is not a chat-completions route.
	 */
	private _parseVendorFromChatPath(pathname: string): string | undefined {
		if (!pathname.startsWith(VENDOR_PATH_PREFIX) || !pathname.endsWith(CHAT_COMPLETIONS_SUFFIX)) {
			return undefined;
		}
		const vendorSegment = pathname.slice(VENDOR_PATH_PREFIX.length, pathname.length - CHAT_COMPLETIONS_SUFFIX.length);
		if (!vendorSegment) {
			return undefined;
		}
		let vendor: string;
		try {
			vendor = decodeURIComponent(vendorSegment);
		} catch {
			return undefined;
		}
		// Re-check for a path separator *after* decoding: a `%2F` survives the
		// pre-decode prefix/suffix checks but would decode into a second path
		// segment, breaking the single-segment `vendor/id` selection-id convention.
		if (!vendor || vendor.includes('/')) {
			return undefined;
		}
		return vendor;
	}

	private async _handleChatCompletions(req: http.IncomingMessage, res: http.ServerResponse, runtime: ILoopbackProxyRuntime<ByokLmProxyState>, vendor: string, sessionId: string): Promise<void> {
		let body: IOpenAiChatRequest;
		try {
			const raw = await readProxyRequestBody(req);
			body = JSON.parse(raw) as IOpenAiChatRequest;
		} catch (err) {
			this._writeJsonError(res, 400, `Invalid request body: ${err instanceof Error ? err.message : String(err)}`, 'invalid_request_error');
			return;
		}

		let bridgeRequest;
		try {
			bridgeRequest = openAiRequestToBridge(vendor, body);
		} catch (err) {
			const message = err instanceof OpenAiTranslationError ? err.message : String(err);
			this._writeJsonError(res, 400, message, 'invalid_request_error');
			return;
		}

		// Rehydrate continuation metadata the OpenAI wire dropped from replayed tool calls.
		bridgeRequest = this._restoreContinuations(bridgeRequest, runtime.state, sessionId);

		const connection = this._bridgeRegistry.getServingConnection();
		if (!connection) {
			this._writeJsonError(res, 503, 'No renderer connection available to service BYOK models', 'api_error');
			return;
		}

		// Register the request so {@link LoopbackProxyServer} aborts it on
		// teardown; a client-side disconnect also flips `clientGone` and aborts.
		// Both surface through the shared `AbortController`, which we re-check
		// after the async bridge hop before touching the response.
		const entry: IProxyInFlight = { ac: new AbortController(), res, clientGone: false };
		runtime.inFlight.add(entry);
		const onClose = () => {
			entry.clientGone = true;
			entry.ac.abort();
		};
		res.on('close', onClose);

		try {
			const result = await connection.chat(bridgeRequest);
			if (entry.ac.signal.aborted || res.writableEnded) {
				return;
			}
			if (result.error) {
				this._writeJsonError(res, 502, result.error, 'api_error');
				return;
			}
			// Cache continuation metadata for later replays; the SSE omits it, leaving the tool-call id as the only wire correlation.
			this._rememberContinuations(result.toolCalls, runtime.state, sessionId);
			res.writeHead(200, {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive',
			});
			for (const frame of bridgeResultToSseFrames(result, bridgeRequest.modelId)) {
				res.write(frame);
			}
			res.end();
		} catch (err) {
			if (entry.ac.signal.aborted || res.writableEnded) {
				return;
			}
			const message = err instanceof Error ? err.message : String(err);
			if (!res.headersSent) {
				this._writeJsonError(res, 502, message, 'api_error');
			} else {
				try { res.end(); } catch { /* ignore */ }
			}
		} finally {
			res.removeListener('close', onClose);
			runtime.inFlight.delete(entry);
		}
	}

	/** Restore cached continuation parts onto assistant tool calls that lack them; explicit parts win. */
	private _restoreContinuations(request: IByokLmChatRequest, store: ByokLmContinuationStore, sessionId: string): IByokLmChatRequest {
		let requestChanged = false;
		const messages = request.messages.map(message => {
			if (message.role !== 'assistant' || !message.toolCalls?.length) {
				return message;
			}
			let messageChanged = false;
			const toolCalls = message.toolCalls.map(call => {
				if (call.continuationParts?.length) {
					return call;
				}
				const cached = store.get(sessionId, call.id);
				if (!cached) {
					return call;
				}
				messageChanged = true;
				return { ...call, continuationParts: cached };
			});
			if (!messageChanged) {
				return message;
			}
			requestChanged = true;
			return { ...message, toolCalls };
		});
		return requestChanged ? { ...request, messages } : request;
	}

	/** Cache continuation parts carried by result tool calls, keyed by session + call id. */
	private _rememberContinuations(toolCalls: readonly IByokLmToolCall[] | undefined, store: ByokLmContinuationStore, sessionId: string): void {
		if (!toolCalls?.length) {
			return;
		}
		for (const call of toolCalls) {
			if (call.continuationParts?.length) {
				store.remember(sessionId, call.id, call.continuationParts);
			}
		}
	}

	private _writeJsonError(res: http.ServerResponse, status: number, message: string, type = 'api_error'): void {
		if (res.headersSent || res.writableEnded) {
			return;
		}
		res.writeHead(status, { 'Content-Type': 'application/json' });
		res.end(openAiErrorBody(message, type));
	}
}

/**
 * No-op {@link IByokLmProxyService} for agent host entrypoints that do not
 * support BYOK — e.g. the remote agent host, where no extension host runs
 * alongside the agent host to serve the renderer LM API.
 *
 */
export class NullByokLmProxyService implements IByokLmProxyService {

	declare readonly _serviceBrand: undefined;

	start(): Promise<IByokLmProxyHandle> {
		return Promise.reject(new Error('BYOK is not supported in this agent host'));
	}

	dispose(): void {
		// No-op: the null proxy never binds a socket, so there is nothing to close.
	}
}
