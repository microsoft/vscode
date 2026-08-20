/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import type { IByokLmChatResult } from '../../common/agentHostByokLm.js';
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
	bridgeResultToResponsesBody,
	bridgeResultToResponsesSseFrames,
	IResponsesRequest,
	responsesErrorBody,
	responsesRequestToBridge,
	ResponsesTranslationError,
} from './byokResponsesTranslation.js';

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
	 * runtime appends `/responses` to this URL.
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
const RESPONSES_SUFFIX = '/responses';
const MAX_PENDING_TOOL_CONTINUATIONS = 256;

type PendingToolCallKind = 'function_call' | 'custom_tool_call';

interface IPendingToolContinuation {
	readonly responseId: string;
	readonly calls: ReadonlyMap<string, PendingToolCallKind>;
}

/** Provider state awaiting the SDK's immediate tool-result request. */
type ByokLmProxyState = Map<string, IPendingToolContinuation>;

/**
 * Local OpenAI-compatible HTTP proxy that lets the Copilot SDK runtime run
 * BYOK models provided by VS Code extensions. The runtime is configured with a
 * `type: 'openai'`, `wireApi: 'responses'` provider whose `baseUrl` points
 * here; inbound `POST /v/<vendor>/responses` requests are authenticated,
 * translated, and forwarded to the renderer LM API via
 * {@link IByokLmBridgeRegistry}, and the buffered completion is streamed back
 * as OpenAI Responses SSE.
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
		return new Map();
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
		const sessionId = auth.sessionId;
		if (!auth.valid || !sessionId) {
			this._writeJsonError(res, 401, 'Invalid authentication', 'authentication_error');
			return;
		}

		const vendor = this._parseVendorFromResponsesPath(pathname);
		if (method === 'POST' && vendor !== undefined) {
			await this._handleResponses(req, res, runtime, vendor, sessionId);
			return;
		}

		this._writeJsonError(res, 404, `No route for ${method} ${pathname}`, 'not_found_error');
	}

	/**
	 * Extract the vendor from a `/v/<vendor>/responses` path.
	 */
	private _parseVendorFromResponsesPath(pathname: string): string | undefined {
		if (!pathname.startsWith(VENDOR_PATH_PREFIX) || !pathname.endsWith(RESPONSES_SUFFIX)) {
			return undefined;
		}
		const vendorSegment = pathname.slice(VENDOR_PATH_PREFIX.length, pathname.length - RESPONSES_SUFFIX.length);
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

	private async _handleResponses(req: http.IncomingMessage, res: http.ServerResponse, runtime: ILoopbackProxyRuntime<ByokLmProxyState>, vendor: string, sessionId: string): Promise<void> {
		let body: IResponsesRequest;
		try {
			const raw = await readProxyRequestBody(req);
			body = JSON.parse(raw) as IResponsesRequest;
		} catch (err) {
			this._writeJsonError(res, 400, `Invalid request body: ${err instanceof Error ? err.message : String(err)}`, 'invalid_request_error');
			return;
		}

		const continuationKey = typeof body?.model === 'string' ? this._continuationKey(sessionId, vendor, body.model) : undefined;
		let bridgeBody = body;
		if (continuationKey && body.previous_response_id === undefined) {
			const pending = runtime.state.get(continuationKey);
			const input = pending && this._recoverToolContinuation(body.input, pending);
			if (input) {
				bridgeBody = { ...body, input, previous_response_id: pending.responseId };
			}
		}

		let bridgeRequest;
		try {
			bridgeRequest = responsesRequestToBridge(vendor, bridgeBody);
		} catch (err) {
			const message = err instanceof ResponsesTranslationError ? err.message : String(err);
			this._writeJsonError(res, 400, message, 'invalid_request_error');
			return;
		}

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
			if (continuationKey) {
				this._updateToolContinuation(runtime.state, continuationKey, result);
			}
			if (body.stream === true) {
				res.writeHead(200, {
					'Content-Type': 'text/event-stream',
					'Cache-Control': 'no-cache',
					'Connection': 'keep-alive',
				});
				for (const frame of bridgeResultToResponsesSseFrames(result, bridgeRequest.modelId)) {
					res.write(frame);
				}
				res.end();
			} else {
				res.writeHead(200, { 'Content-Type': 'application/json' });
				res.end(bridgeResultToResponsesBody(result, bridgeRequest.modelId));
			}
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

	private _continuationKey(sessionId: string, vendor: string, modelId: string): string {
		return JSON.stringify([sessionId, vendor, modelId]);
	}

	private _recoverToolContinuation(input: IResponsesRequest['input'], pending: IPendingToolContinuation): IResponsesRequest['input'] | undefined {
		if (!Array.isArray(input)) {
			return undefined;
		}

		// A previous_response_id request must contain only the new tool outputs.
		let start = input.length;
		while (start > 0 && this._toolOutputKind((input[start - 1] as { readonly type?: unknown } | null)?.type)) {
			start--;
		}
		if (input.length - start !== pending.calls.size) {
			return undefined;
		}

		const outputs = input.slice(start);
		const seen = new Set<string>();
		for (const value of outputs) {
			if (typeof value !== 'object' || value === null || Array.isArray(value)) {
				return undefined;
			}
			const item = value as { readonly type?: unknown; readonly call_id?: unknown; readonly output?: unknown };
			const kind = this._toolOutputKind(item.type);
			const callId = item.call_id;
			if (
				!kind
				|| typeof callId !== 'string'
				|| !callId
				|| seen.has(callId)
				|| pending.calls.get(callId) !== kind
				|| (item.output !== undefined && typeof item.output !== 'string')
			) {
				return undefined;
			}
			seen.add(callId);
		}
		return outputs;
	}

	private _toolOutputKind(type: unknown): PendingToolCallKind | undefined {
		switch (type) {
			case 'function_call_output':
				return 'function_call';
			case 'custom_tool_call_output':
				return 'custom_tool_call';
			default:
				return undefined;
		}
	}

	private _updateToolContinuation(state: ByokLmProxyState, key: string, result: IByokLmChatResult): void {
		if (!result.responseId) {
			state.delete(key);
			return;
		}
		const calls = new Map<string, PendingToolCallKind>();
		for (const item of result.output) {
			if (item.type === 'function_call' || item.type === 'custom_tool_call') {
				if (!item.callId || calls.has(item.callId)) {
					state.delete(key);
					return;
				}
				calls.set(item.callId, item.type);
			}
		}
		if (calls.size) {
			// A session can disappear after receiving a tool call, so keep abandoned
			// continuations from growing for the lifetime of the shared proxy.
			state.delete(key);
			state.set(key, { responseId: result.responseId, calls });
			if (state.size > MAX_PENDING_TOOL_CONTINUATIONS) {
				const oldestKey = state.keys().next().value;
				if (oldestKey !== undefined) {
					state.delete(oldestKey);
				}
			}
		} else {
			state.delete(key);
		}
	}

	private _writeJsonError(res: http.ServerResponse, status: number, message: string, type = 'api_error'): void {
		if (res.headersSent || res.writableEnded) {
			return;
		}
		res.writeHead(status, { 'Content-Type': 'application/json' });
		res.end(responsesErrorBody(message, type));
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
