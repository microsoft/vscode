/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import { AddressInfo } from 'net';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../instantiation/common/instantiation.js';
import { ILogService } from '../../../log/common/log.js';
import { CopilotApiError, ICopilotApiService } from '../shared/copilotApiService.js';

/**
 * Refcounted handle to the local OpenAI-Responses → CAPI proxy. Mirrors
 * `IClaudeProxyHandle`: dispose when the consumer is done; the underlying
 * server tears down once every handle is gone.
 *
 * Subprocess-ownership invariant: any subprocess given `baseUrl` /
 * `apiKey` MUST be killed before this handle is disposed, otherwise the
 * proxy may rebind on a different port and the subprocess silently
 * loses its endpoint.
 */
export interface ICodexProxyHandle extends IDisposable {
	/** e.g. `http://127.0.0.1:54321` — no trailing slash. */
	readonly baseUrl: string;
	/** Random per-process nonce used as `Bearer <nonce>` by the codex CLI. */
	readonly nonce: string;
}

export interface ICodexProxyService {
	readonly _serviceBrand: undefined;

	/**
	 * Start the proxy (if not already running) and return a refcounted
	 * handle. Most recent token wins (single-tenant assumption).
	 */
	start(githubToken: string): Promise<ICodexProxyHandle>;

	/** Force-close the proxy regardless of refcount. Idempotent. */
	dispose(): void;
}

export const ICodexProxyService = createDecorator<ICodexProxyService>('codexProxyService');

interface IInFlight {
	readonly ac: AbortController;
	readonly res: http.ServerResponse;
	clientGone: boolean;
}

interface IProxyRuntime {
	readonly server: http.Server;
	readonly baseUrl: string;
	readonly nonce: string;
	readonly inFlight: Set<IInFlight>;
	githubToken: string;
	refcount: number;
}

const PROXY_USER_FACING_NAME = 'CodexProxyService';

function generateNonce(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	let out = '';
	for (let i = 0; i < bytes.length; i++) {
		out += bytes[i].toString(16).padStart(2, '0');
	}
	return out;
}

function writeJsonError(res: http.ServerResponse, status: number, type: string, message: string): void {
	if (res.headersSent || res.writableEnded) {
		return;
	}
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(JSON.stringify({ error: { type, message } }));
}

function readRequestBody(req: http.IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		req.on('data', c => chunks.push(c));
		req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
		req.on('error', reject);
	});
}

/**
 * Local HTTP server that speaks the OpenAI Responses API on its inbound
 * side and forwards to {@link ICopilotApiService.responses} on the
 * outbound side. The bundled `@openai/codex-sdk` connects via
 * `--config openai_base_url=<baseUrl>/v1` + `CODEX_API_KEY=<nonce>` and
 * sees this as a real OpenAI endpoint.
 *
 * Lifecycle mirrors {@link ClaudeProxyService}: refcounted handles,
 * shared in-flight bind, in-flight requests are aborted on teardown.
 */
export class CodexProxyService implements ICodexProxyService {

	declare readonly _serviceBrand: undefined;

	private _runtime: IProxyRuntime | undefined;
	private _starting: Promise<IProxyRuntime> | undefined;
	private _disposed = false;

	constructor(
		@ILogService private readonly _logService: ILogService,
		@ICopilotApiService private readonly _copilotApiService: ICopilotApiService,
	) { }

	async start(githubToken: string): Promise<ICodexProxyHandle> {
		if (this._disposed) {
			throw new Error('CodexProxyService has been disposed');
		}
		const runtime = await this._ensureRuntime(githubToken);
		if (this._disposed || this._runtime !== runtime) {
			throw new Error('CodexProxyService has been disposed');
		}
		runtime.githubToken = githubToken;
		runtime.refcount++;

		let disposed = false;
		return {
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
	}

	dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._teardownRuntime();
	}

	private _ensureRuntime(githubToken: string): Promise<IProxyRuntime> {
		if (this._runtime) {
			return Promise.resolve(this._runtime);
		}
		if (!this._starting) {
			this._starting = (async () => {
				try {
					const rt = await this._startServer(githubToken);
					if (this._disposed) {
						rt.server.closeAllConnections();
						rt.server.close();
						throw new Error('CodexProxyService has been disposed');
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
			const onError = (err: Error) => reject(err);
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

		server.on('request', (req, res) => {
			this._handleRequest(req, res, runtime).catch(err => {
				this._logService.error(`[${PROXY_USER_FACING_NAME}] unhandled request error`, err);
				if (!res.headersSent) {
					try {
						writeJsonError(res, 500, 'api_error', 'Internal proxy error');
					} catch { /* ignore */ }
				} else if (!res.writableEnded) {
					try { res.end(); } catch { /* ignore */ }
				}
			});
		});

		return runtime;
	}

	private async _handleRequest(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		runtime: IProxyRuntime,
	): Promise<void> {
		const method = req.method ?? 'GET';
		const pathname = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
		const incomingHeaders = Object.keys(req.headers).join(', ');
		this._logService.info(`[${PROXY_USER_FACING_NAME}] >>> ${method} ${pathname} (headers: ${incomingHeaders})`);

		if (method === 'GET' && pathname === '/') {
			res.writeHead(200, { 'Content-Type': 'text/plain' });
			res.end('ok');
			return;
		}

		// Codex CLI sends `Bearer <CODEX_API_KEY>` — plain nonce, no sessionId suffix.
		const authHeader = req.headers['authorization'];
		const expected = `Bearer ${runtime.nonce}`;
		if (typeof authHeader !== 'string' || authHeader !== expected) {
			writeJsonError(res, 401, 'authentication_error', 'Invalid authentication');
			return;
		}

		// Codex sends `/v1/responses`, `//responses` (when base_url ends in `/`),
		// or plain `/responses`. Accept all three.
		if (method === 'POST' && (pathname === '/v1/responses' || pathname === '/responses' || pathname === '//responses')) {
			await this._handleResponses(req, res, runtime);
			return;
		}

		writeJsonError(res, 404, 'not_found_error', `No route for ${method} ${pathname}`);
	}

	private async _handleResponses(
		req: http.IncomingMessage,
		res: http.ServerResponse,
		runtime: IProxyRuntime,
	): Promise<void> {
		let body: string;
		try {
			body = await readRequestBody(req);
		} catch (err) {
			writeJsonError(res, 400, 'invalid_request_error', `Failed to read request body: ${err instanceof Error ? err.message : String(err)}`);
			return;
		}

		// --- DEBUG: log the model and key fields from the request body ---
		try {
			const parsed = JSON.parse(body);
			this._logService.info(`[${PROXY_USER_FACING_NAME}] >>> /responses body: model=${parsed.model ?? '<none>'}, previous_response_id=${parsed.previous_response_id ?? '<none>'}, stream=${parsed.stream ?? '<none>'}, input_items=${Array.isArray(parsed.input) ? parsed.input.length : '<not-array>'}`);
		} catch {
			this._logService.info(`[${PROXY_USER_FACING_NAME}] >>> /responses body (unparseable): ${body.slice(0, 200)}`);
		}

		const entry: IInFlight = { ac: new AbortController(), res, clientGone: false };
		runtime.inFlight.add(entry);
		const onClose = () => {
			entry.clientGone = true;
			entry.ac.abort();
		};
		res.on('close', onClose);

		try {
			this._logService.info(`[${PROXY_USER_FACING_NAME}] forwarding to CAPI responses...`);
			const upstream = await this._copilotApiService.responses(runtime.githubToken, body, { signal: entry.ac.signal });
			// Mirror upstream status + content-type and stream the body
			// through. Responses API uses SSE for streaming, plain JSON
			// otherwise — both are byte-faithful pipes.
			const contentType = upstream.headers.get('content-type') ?? 'application/json';
			const upstreamHeaders = [...upstream.headers.entries()].map(([k, v]) => `${k}: ${v}`).join(', ');
			this._logService.info(`[${PROXY_USER_FACING_NAME}] <<< CAPI response: status=${upstream.status}, contentType=${contentType}, headers=[${upstreamHeaders}]`);
			res.writeHead(upstream.status, { 'Content-Type': contentType });
			if (!upstream.body) {
				res.end();
				return;
			}
			const reader = upstream.body.getReader();
			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) {
						break;
					}
					if (entry.clientGone) {
						break;
					}
					if (value && value.byteLength > 0) {
						res.write(Buffer.from(value));
					}
				}
			} finally {
				try { reader.releaseLock(); } catch { /* ignore */ }
			}
			res.end();
		} catch (err) {
			if (entry.clientGone) {
				this._logService.info(`[${PROXY_USER_FACING_NAME}] client disconnected during upstream call`);
				return;
			}
			if (err instanceof CopilotApiError) {
				this._logService.error(`[${PROXY_USER_FACING_NAME}] CAPI error: status=${err.status}, message=${err.message}`);
				writeJsonError(res, err.status, 'api_error', err.message);
				return;
			}
			this._logService.error(`[${PROXY_USER_FACING_NAME}] upstream error: ${err instanceof Error ? err.message : String(err)}`);
			writeJsonError(res, 502, 'api_error', err instanceof Error ? err.message : String(err));
		} finally {
			res.removeListener('close', onClose);
			runtime.inFlight.delete(entry);
		}
	}
}
