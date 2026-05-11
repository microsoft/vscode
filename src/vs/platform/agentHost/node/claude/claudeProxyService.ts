/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type Anthropic from '@anthropic-ai/sdk';
import type { CCAModel } from '@vscode/copilot-api';
import type * as http from 'http';
import { once } from 'events';
import { AddressInfo } from 'net';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import {
	COPILOT_API_ERROR_STATUS_STREAMING,
	CopilotApiError,
	ICopilotApiService,
	type ICopilotApiServiceRequestOptions,
} from '../shared/copilotApiService.js';
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
export interface IClaudeProxyHandle extends IDisposable {
	/** e.g. `http://127.0.0.1:54321` — no trailing slash. */
	readonly baseUrl: string;
	/** 256-bit hex string. Combine with a session id as `Bearer <nonce>.<sessionId>`. */
	readonly nonce: string;
}

export interface IClaudeProxyService {
	readonly _serviceBrand: undefined;

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

/**
 * Per-request bookkeeping. `clientGone` distinguishes a client-driven
 * disconnect (socket already closed — write nothing) from a service-
 * driven `dispose()` (socket still open — `res.destroy()` to unblock
 * the client) when the abort signal fires.
 */
interface IInFlight {
	readonly ac: AbortController;
	readonly res: http.ServerResponse;
	clientGone: boolean;
}

/**
 * Process-wide proxy state. Created lazily on first `start()` and torn
 * down when refcount → 0 (or `dispose()` is called explicitly).
 */
interface IProxyRuntime {
	readonly server: http.Server;
	readonly baseUrl: string;
	readonly nonce: string;
	readonly inFlight: Set<IInFlight>;
	githubToken: string;
	refcount: number;
}

// #endregion

// #region Implementation

const KNOWN_CLAUDE_VENDORS = new Set(['anthropic']);
const ANTHROPIC_MESSAGES_ENDPOINT = '/v1/messages';
const PROXY_USER_FACING_NAME = 'ClaudeProxyService';

/**
 * Build the 256-bit hex nonce embedded in the `Bearer <nonce>.<sessionId>`
 * token. Web Crypto is available in Node 18+ (used elsewhere in this
 * folder via `generateUuid`).
 */
function generateNonce(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	let out = '';
	for (let i = 0; i < bytes.length; i++) {
		out += bytes[i].toString(16).padStart(2, '0');
	}
	return out;
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
export class ClaudeProxyService implements IClaudeProxyService {

	declare readonly _serviceBrand: undefined;

	private _runtime: IProxyRuntime | undefined;
	private _starting: Promise<IProxyRuntime> | undefined;
	private _disposed = false;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
	) { }

	async start(githubToken: string): Promise<IClaudeProxyHandle> {
		if (this._disposed) {
			throw new Error('ClaudeProxyService has been disposed');
		}

		const runtime = await this._ensureRuntime(githubToken);
		// Re-check after the await: dispose() may have run while
		// _ensureRuntime was awaiting the bind, in which case the
		// runtime we received is already torn down (see
		// _ensureRuntime) — but a fresh start() in between is also
		// possible, so verify the active runtime hasn't moved.
		if (this._disposed || this._runtime !== runtime) {
			throw new Error('ClaudeProxyService has been disposed');
		}
		// Late-binding token update covers the case where multiple
		// concurrent callers awaited the same _ensureRuntime — last
		// caller's token wins, matching the single-tenant contract.
		runtime.githubToken = githubToken;
		runtime.refcount++;

		let disposed = false;
		const handle: IClaudeProxyHandle = {
			baseUrl: runtime.baseUrl,
			nonce: runtime.nonce,
			dispose: () => {
				if (disposed) {
					return;
				}
				disposed = true;
				this._releaseHandle(runtime);
			},
		};
		return handle;
	}

	dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._teardownRuntime();
	}

	/**
	 * Returns the shared runtime, binding a new server if there isn't
	 * one yet. Concurrent callers share the same in-flight bind via
	 * {@link _starting}; this prevents two listeners from being
	 * created when {@link start} is invoked twice before the first
	 * bind resolves.
	 *
	 * If {@link dispose} runs while the bind is in flight, the
	 * just-bound server is torn down here and the awaiting caller
	 * sees a rejected promise.
	 */
	private _ensureRuntime(githubToken: string): Promise<IProxyRuntime> {
		if (this._runtime) {
			return Promise.resolve(this._runtime);
		}
		if (!this._starting) {
			this._starting = (async () => {
				try {
					const rt = await this._startServer(githubToken);
					if (this._disposed) {
						// dispose() ran while we were binding — the
						// teardown noop'd because _runtime was still
						// undefined, so close what we just created.
						rt.server.closeAllConnections();
						rt.server.close();
						throw new Error('ClaudeProxyService has been disposed');
					}
					this._runtime = rt;
					return rt;
				} finally {
					this._starting = undefined;
				}
			})();
		}
		return this._starting;
	}

	private _releaseHandle(runtime: IProxyRuntime): void {
		// If `dispose()` (or a later `start()`) already replaced the
		// runtime, the handle's refcount no longer applies.
		if (this._runtime !== runtime) {
			return;
		}
		runtime.refcount--;
		if (runtime.refcount === 0) {
			this._teardownRuntime();
		}
	}

	private _teardownRuntime(): void {
		const runtime = this._runtime;
		if (!runtime) {
			return;
		}
		this._runtime = undefined;
		// Abort in-flight requests so the catch handlers run and
		// destroy still-open responses; closeAllConnections() then
		// frees the listening socket immediately.
		for (const entry of runtime.inFlight) {
			entry.ac.abort();
		}
		runtime.server.closeAllConnections();
		runtime.server.close(err => {
			if (err) {
				this._logService.warn(`[${PROXY_USER_FACING_NAME}] server.close error: ${err.message}`);
			}
		});
	}

	private async _startServer(githubToken: string): Promise<IProxyRuntime> {
		const nonce = generateNonce();
		const inFlight = new Set<IInFlight>();
		const httpModule = await import('http');
		const server = httpModule.createServer();

		await new Promise<void>((resolve, reject) => {
			const onError = (err: Error) => { reject(err); };
			server.once('error', onError);
			server.listen(0, '127.0.0.1', () => {
				server.removeListener('error', onError);
				resolve();
			});
		});

		const address = server.address();
		if (!address || typeof address === 'string') {
			server.close();
			throw new Error(`${PROXY_USER_FACING_NAME} failed to bind: unexpected address ${String(address)}`);
		}
		const baseUrl = `http://127.0.0.1:${(address as AddressInfo).port}`;
		this._logService.info(`[${PROXY_USER_FACING_NAME}] listening on ${baseUrl}`);

		const runtime: IProxyRuntime = {
			server,
			baseUrl,
			nonce,
			inFlight,
			githubToken,
			refcount: 0,
		};

		// Attach the request handler only after `runtime` is fully
		// built. Node's single-threaded event loop guarantees no
		// `request` event can be parsed and dispatched between
		// `listen` resolving and this synchronous registration, so
		// the handler can safely close over `runtime` as a `const`.
		server.on('request', (req, res) => {
			this._handleRequest(req, res, runtime).catch(err => {
				// Last-resort safety net. All known throw paths are
				// already handled inside `_handleRequest`.
				this._logService.error(`[${PROXY_USER_FACING_NAME}] unhandled request error: ${stringifyError(err)}`);
				if (!res.headersSent) {
					try {
						writeJsonError(res, 500, 'api_error', 'Internal proxy error');
					} catch {
						// nothing else we can do
					}
				} else if (!res.writableEnded) {
					try {
						res.end();
					} catch { /* ignore */ }
				}
			});
		});

		return runtime;
	}

	// #region Dispatch

	private async _handleRequest(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		runtime: IProxyRuntime,
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
			await this._handleModels(res, runtime);
			return;
		}

		if (method === 'POST' && pathname === '/v1/messages') {
			await this._handleMessages(req, res, runtime);
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

	private async _handleModels(res: http.ServerResponse, runtime: IProxyRuntime): Promise<void> {
		let models: CCAModel[];
		try {
			models = await this._copilotApiService.models(runtime.githubToken);
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
		runtime: IProxyRuntime,
	): Promise<void> {
		let bodyString: string;
		try {
			bodyString = await readRequestBody(req);
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
		const endpointModelId = parsedModel.toEndpointModelId();
		body.model = endpointModelId;

		const stream = body.stream === true;
		const headers = buildOutboundHeaders(req.headers);

		const entry: IInFlight = {
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
				);
			} else {
				await this._sendNonStreamingMessage(
					body as unknown as Anthropic.MessageCreateParamsNonStreaming,
					headers,
					res,
					entry,
					runtime,
					sdkModelId,
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
		entry: IInFlight,
		runtime: IProxyRuntime,
		originalSdkModelId: string,
	): Promise<void> {
		const options: ICopilotApiServiceRequestOptions = { headers, signal: entry.ac.signal };
		let message: Anthropic.Message;
		try {
			message = await this._copilotApiService.messages(runtime.githubToken, body, options);
		} catch (err) {
			if (entry.ac.signal.aborted) {
				if (!entry.clientGone && !res.writableEnded) {
					res.destroy();
				}
				return;
			}
			this._writeUpstreamErrorResponse(res, err);
			return;
		}

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
		entry: IInFlight,
		runtime: IProxyRuntime,
		_originalSdkModelId: string,
	): Promise<void> {
		const options: ICopilotApiServiceRequestOptions = { headers, signal: entry.ac.signal };
		let stream: AsyncGenerator<Anthropic.MessageStreamEvent>;
		try {
			stream = this._copilotApiService.messages(runtime.githubToken, body, options);
		} catch (err) {
			// Synchronous throws from the generator factory (rare —
			// CAPI errors come from the first iteration).
			if (entry.ac.signal.aborted) {
				if (!entry.clientGone && !res.writableEnded) {
					res.destroy();
				}
				return;
			}
			this._writeUpstreamErrorResponse(res, err);
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
			this._writeUpstreamErrorResponse(res, err);
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

		try {
			if (!first.done) {
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
						? err.envelope
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
				const ok = await writeFrame(next.value);
				if (!ok) {
					return;
				}
			}
			if (!res.writableEnded) {
				res.end();
			}
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

	private _writeUpstreamErrorResponse(res: http.ServerResponse, err: unknown): void {
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
			writeUpstreamJsonError(res, status, err.envelope);
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
 * from the inbound request. Drops everything except `anthropic-version`
 * (verbatim) and `anthropic-beta` (filtered through
 * {@link filterSupportedBetas}).
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
	return out;
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', chunk => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
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

// #endregion
