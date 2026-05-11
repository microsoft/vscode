/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, type Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue, type IObservable } from '../../../../base/common/observable.js';
import type { JsonRpcMessage } from '../../../../base/common/jsonRpcProtocol.js';
import { SSEParser } from '../../../../base/common/sseParser.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import type { ILogger } from '../../../log/common/log.js';
import type { IMcpRemoteServerConfiguration } from '../../../mcp/common/mcpPlatformTypes.js';
import {
	McpServerStatusKind,
	type McpServerStatus,
	type ProtectedResourceMetadata,
} from '../../common/state/protocol/state.js';
import { buildAuthRequiredStatus, parseWwwAuthenticate } from './mcpAuthChallengeParser.js';
import type { IMcpUpstream, IMcpUpstreamCapabilities } from './mcpUpstream.js';

/** HTTP-fetcher signature. Test seam — defaults to global `fetch`. */
export type HttpFetch = (url: string, init: {
	method: 'GET' | 'POST';
	headers: Record<string, string>;
	body?: string;
	signal?: AbortSignal;
}) => Promise<IHttpResponse>;

export interface IHttpResponse {
	status: number;
	headers: { get(name: string): string | null };
	text(): Promise<string>;
	/**
	 * Optional response body stream. Required for `text/event-stream`
	 * responses. When `undefined`/`null`, the upstream falls back to
	 * {@link text} and skips SSE handling.
	 */
	body?: ReadableStream<Uint8Array> | null;
}

export interface IMcpHttpUpstreamOptions {
	readonly config: IMcpRemoteServerConfiguration;
	readonly logger: ILogger;
	/** Test seam — defaults to global `fetch`. */
	readonly fetch?: HttpFetch;
}

const PROBE_BODY = JSON.stringify({
	jsonrpc: '2.0',
	id: 0,
	method: 'initialize',
	params: {
		protocolVersion: '2024-11-05',
		capabilities: {},
		clientInfo: { name: 'ahp-proxy', version: '0.0.0' },
	},
});

/**
 * MCP upstream backed by a remote HTTP endpoint. The class performs a
 * discovery handshake on {@link start} by sending a method-level
 * `initialize` probe to the configured URL: the result is discarded
 * but the HTTP status drives the state machine (2xx → Ready, 401/403 →
 * AuthRequired, otherwise Error).
 *
 * Supports the streamable HTTP transport: a POST may receive either a
 * one-shot `application/json` reply or an SSE (`text/event-stream`)
 * stream that delivers one or more JSON-RPC messages. Both are routed
 * through {@link IMcpUpstream.onMessage}.
 *
 * Caveats:
 *  - The probe may briefly initialize the upstream server before the
 *    SDK does. For session-bearing servers this is still acceptable
 *    per MCP, but it does mean the handshake is observable upstream.
 *  - A long-lived `GET` SSE stream for purely server-initiated
 *    messages (the second half of the streamable HTTP spec) is not
 *    yet plumbed; only POST-response streams are consumed.
 */
export class McpHttpUpstream extends Disposable implements IMcpUpstream {

	private readonly _status = observableValue<McpServerStatus>(this, { kind: McpServerStatusKind.Stopped });
	public readonly status: IObservable<McpServerStatus> = this._status;

	private readonly _onMessage = this._register(new Emitter<JsonRpcMessage>());
	public readonly onMessage: Event<JsonRpcMessage> = this._onMessage.event;

	private readonly _upstreamCapabilities = observableValue<IMcpUpstreamCapabilities | undefined>(this, undefined);
	public readonly upstreamCapabilities: IObservable<IMcpUpstreamCapabilities | undefined> = this._upstreamCapabilities;

	private readonly _config: IMcpRemoteServerConfiguration;
	private readonly _logger: ILogger;
	private readonly _fetch: HttpFetch;

	private _bearerToken: string | undefined;
	private _hadPriorToken = false;
	private readonly _pendingRequests = new Set<AbortController>();
	private _disposed = false;
	private _startInFlight: Promise<McpServerStatus> | undefined;

	constructor(options: IMcpHttpUpstreamOptions) {
		super();
		this._config = options.config;
		this._logger = options.logger;
		this._fetch = options.fetch ?? ((url, init) => globalThis.fetch(url, init) as Promise<IHttpResponse>);
	}

	public async start(): Promise<McpServerStatus> {
		if (this._disposed) {
			return this._status.get();
		}
		const current = this._status.get();
		if (current.kind === McpServerStatusKind.Ready) {
			return current;
		}
		if (this._startInFlight) {
			return this._startInFlight;
		}
		const promise = this._doStart();
		this._startInFlight = promise;
		try {
			return await promise;
		} finally {
			this._startInFlight = undefined;
		}
	}

	private async _doStart(): Promise<McpServerStatus> {
		this._status.set({ kind: McpServerStatusKind.Starting }, undefined);

		const ac = new AbortController();

		return this._trackRequest(ac, async () => {
			let response: IHttpResponse;
			try {
				response = await this._traceFetch('probe', this._config.url, {
					method: 'POST',
					headers: this._buildHeaders(),
					body: PROBE_BODY,
					signal: ac.signal,
				});
			} catch (err) {
				if (this._disposed || ac.signal.aborted) {
					return this._status.get();
				}
				const message = err instanceof Error ? err.message : String(err);
				const status: McpServerStatus = {
					kind: McpServerStatusKind.Error,
					error: { errorType: 'httpError', message },
				};
				this._status.set(status, undefined);
				return status;
			}

			if (this._disposed || ac.signal.aborted) {
				return this._status.get();
			}

			if (response.status >= 200 && response.status < 300) {
				this._status.set({ kind: McpServerStatusKind.Ready }, undefined);
				// Drain or close the probe response body. The probe payload is
				// not consumed (the SDK runs its own initialize), but leaving an
				// SSE stream open would hold the underlying connection.
				response.body?.cancel().catch(() => { /* best-effort */ });
				return this._status.get();
			}

			if (response.status === 401 || response.status === 403) {
				const status = await this._buildAuthRequired(response, response.status);
				if (this._disposed) {
					return this._status.get();
				}
				this._status.set(status, undefined);
				return status;
			}

			let bodyText = '';
			try {
				bodyText = await response.text();
			} catch {
				// best-effort capture only
			}
			const message = `HTTP ${response.status}${bodyText ? `: ${truncate(bodyText, 256)}` : ''}`;
			const errStatus: McpServerStatus = {
				kind: McpServerStatusKind.Error,
				error: { errorType: 'httpError', message },
			};
			this._status.set(errStatus, undefined);
			return errStatus;
		});
	}

	private _trackRequest<T>(ac: AbortController, work: () => Promise<T>): Promise<T> {
		this._pendingRequests.add(ac);
		return work().finally(() => this._pendingRequests.delete(ac));
	}

	/**
	 * Wraps {@link _fetch} with trace-level logging. Each call produces a
	 * short correlation id so the request and response lines pair up in
	 * logs. Bodies are truncated; bearer tokens and configured headers
	 * are redacted.
	 */
	private async _traceFetch(label: string, url: string, init: {
		readonly method: 'GET' | 'POST';
		readonly headers: Record<string, string>;
		readonly body?: string;
		readonly signal?: AbortSignal;
	}): Promise<IHttpResponse> {
		const id = generateUuid().slice(0, 8);
		const bodyPreview = init.body ? `, body=${truncate(init.body, 256)}` : '';
		this._logger.trace(`McpHttpUpstream[${label}] -> ${id}: ${init.method} ${url}${bodyPreview}`);
		try {
			const response = await this._fetch(url, init);
			const contentType = response.headers.get('content-type') ?? '';
			this._logger.trace(`McpHttpUpstream[${label}] <- ${id}: HTTP ${response.status}${contentType ? ` content-type=${contentType}` : ''}`);
			return response;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._logger.trace(`McpHttpUpstream[${label}] <- ${id}: error: ${message}`);
			throw err;
		}
	}

	public async send(message: JsonRpcMessage): Promise<void> {
		const current = this._status.get();
		if (current.kind !== McpServerStatusKind.Ready) {
			throw new Error(`McpHttpUpstream: cannot send while in state '${current.kind}'`);
		}

		const ac = new AbortController();

		return this._trackRequest(ac, async () => {
			let response: IHttpResponse;
			try {
				response = await this._traceFetch('send', this._config.url, {
					method: 'POST',
					headers: this._buildHeaders(),
					body: JSON.stringify(message),
					signal: ac.signal,
				});
			} catch (err) {
				if (ac.signal.aborted) {
					throw new CancellationError();
				}
				throw err;
			}

			if (response.status === 401 || response.status === 403) {
				const authStatus = await this._buildAuthRequired(response, response.status);
				if (this._disposed) {
					// Race: a concurrent dispose dropped us into Stopped — leave alone.
					throw new CancellationError();
				}
				this._status.set(authStatus, undefined);
				throw new Error('McpHttpUpstream: upstream is now AuthRequired');
			}

			await this._consumeResponseBody(response, ac, 'send');
		});
	}

	/**
	 * Reads a POST response body and emits any contained JSON-RPC
	 * messages via {@link onMessage}. Branches on `Content-Type`:
	 *  - `text/event-stream` → stream-parsed via {@link SSEParser};
	 *    each `data` event whose payload is JSON-RPC fires `onMessage`.
	 *    Resolves once the stream closes or the upstream is disposed.
	 *  - anything else → reads the body as a one-shot JSON message.
	 */
	private async _consumeResponseBody(response: IHttpResponse, ac: AbortController, label: string): Promise<void> {
		const contentType = (response.headers.get('content-type') ?? '').toLowerCase();
		if (contentType.includes('text/event-stream')) {
			await this._consumeSseStream(response, ac, label);
			return;
		}

		const text = await response.text();
		if (text) {
			this._logger.trace(`McpHttpUpstream[${label}] body: ${truncate(text, 256)}`);
		}
		if (!text) {
			return;
		}
		let parsed: JsonRpcMessage;
		try {
			parsed = JSON.parse(text) as JsonRpcMessage;
		} catch (err) {
			const errMessage = err instanceof Error ? err.message : String(err);
			this._logger.error(`McpHttpUpstream: failed to parse response body: ${errMessage}`);
			return;
		}
		this._onMessage.fire(parsed);
	}

	/**
	 * Streams an SSE response body through {@link SSEParser}. Each
	 * `message` event whose `data` parses as JSON-RPC is emitted via
	 * {@link onMessage}. Custom event types are logged and ignored.
	 * Resolves when the stream closes (server side) or the upstream is
	 * disposed/aborted.
	 */
	private async _consumeSseStream(response: IHttpResponse, ac: AbortController, label: string): Promise<void> {
		const body = response.body;
		if (!body) {
			this._logger.warn(`McpHttpUpstream[${label}]: text/event-stream response has no body`);
			return;
		}
		const parser = new SSEParser(event => {
			// Per the MCP streamable HTTP spec, JSON-RPC payloads are carried
			// on the default `message` event. Other event names are reserved
			// for future protocol extensions — trace and ignore.
			if (event.type && event.type !== 'message') {
				this._logger.trace(`McpHttpUpstream[${label}] sse: ignoring event type=${event.type}`);
				return;
			}
			if (!event.data) {
				return;
			}
			this._logger.trace(`McpHttpUpstream[${label}] sse: ${truncate(event.data, 256)}`);
			let parsed: JsonRpcMessage;
			try {
				parsed = JSON.parse(event.data) as JsonRpcMessage;
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				this._logger.error(`McpHttpUpstream: failed to parse SSE event data: ${message}`);
				return;
			}
			this._onMessage.fire(parsed);
		});

		const reader = body.getReader();
		try {
			for (; ;) {
				if (ac.signal.aborted || this._disposed) {
					return;
				}
				const { done, value } = await reader.read();
				if (done) {
					return;
				}
				if (value && value.length > 0) {
					parser.feed(value);
				}
			}
		} catch (err) {
			if (ac.signal.aborted || this._disposed) {
				return;
			}
			const message = err instanceof Error ? err.message : String(err);
			this._logger.warn(`McpHttpUpstream[${label}]: SSE read error: ${message}`);
		} finally {
			try {
				await reader.cancel();
			} catch {
				// best-effort
			}
		}
	}

	public setBearerToken(token: string | undefined): void {
		this._bearerToken = token;
		this._hadPriorToken = !!token;
	}

	public setUpstreamCapabilities(caps: IMcpUpstreamCapabilities | undefined): void {
		this._upstreamCapabilities.set(caps, undefined);
	}

	private _buildHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Accept': 'application/json, text/event-stream',
		};
		if (this._config.headers) {
			for (const [key, value] of Object.entries(this._config.headers)) {
				headers[key] = value;
			}
		}
		if (this._bearerToken) {
			headers['Authorization'] = `Bearer ${this._bearerToken}`;
		}
		return headers;
	}

	private async _buildAuthRequired(response: IHttpResponse, httpStatus: 401 | 403): Promise<McpServerStatus> {
		const challenge = parseWwwAuthenticate(response.headers.get('WWW-Authenticate') ?? undefined);
		let resource: ProtectedResourceMetadata | undefined;
		if (challenge.resourceMetadataUrl) {
			if (this._isSafeMetadataUrl(challenge.resourceMetadataUrl)) {
				resource = await this._fetchResourceMetadata(challenge.resourceMetadataUrl);
			} else {
				this._logger.warn(`McpHttpUpstream: ignoring resource_metadata URL '${challenge.resourceMetadataUrl}' — not at the same origin/scheme as ${this._config.url}`);
			}
		}
		if (!resource) {
			this._logger.warn(`McpHttpUpstream: server returned ${httpStatus} without usable resource_metadata; synthesizing minimal metadata for ${this._config.url}`);
			resource = { resource: this._config.url };
		}
		return buildAuthRequiredStatus({
			httpStatus,
			challenge,
			resource,
			hadPriorToken: this._hadPriorToken,
		});
	}

	/**
	 * RFC 9728 expects the protected-resource metadata to live at the same
	 * authority as the protected resource. We enforce that strictly to
	 * prevent a malicious or misconfigured server from steering us into
	 * fetching arbitrary URLs (e.g. cloud-metadata endpoints, intranet
	 * services, `file:`/`javascript:`/`data:` URIs).
	 */
	private _isSafeMetadataUrl(metadataUrl: string): boolean {
		let parsed: URL;
		let configUrl: URL;
		try {
			parsed = new URL(metadataUrl, this._config.url);
			configUrl = new URL(this._config.url);
		} catch {
			return false;
		}
		if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
			return false;
		}
		// `host` includes hostname + port, so this enforces same authority.
		return parsed.protocol === configUrl.protocol && parsed.host === configUrl.host;
	}

	private async _fetchResourceMetadata(url: string): Promise<ProtectedResourceMetadata | undefined> {
		const ac = new AbortController();
		return this._trackRequest(ac, async () => {
			try {
				const response = await this._traceFetch('resource_metadata', url, {
					method: 'GET',
					headers: { 'Accept': 'application/json' },
					signal: ac.signal,
				});
				if (this._disposed || ac.signal.aborted) {
					return undefined;
				}
				if (response.status < 200 || response.status >= 300) {
					this._logger.warn(`McpHttpUpstream: resource_metadata fetch returned HTTP ${response.status}`);
					return undefined;
				}
				const text = await response.text();
				return JSON.parse(text) as ProtectedResourceMetadata;
			} catch (err) {
				if (ac.signal.aborted) {
					return undefined;
				}
				const message = err instanceof Error ? err.message : String(err);
				this._logger.warn(`McpHttpUpstream: failed to fetch or parse resource_metadata: ${message}`);
				return undefined;
			}
		});
	}

	public override dispose(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		for (const ac of this._pendingRequests) {
			ac.abort();
		}
		this._pendingRequests.clear();
		this._upstreamCapabilities.set(undefined, undefined);
		this._status.set({ kind: McpServerStatusKind.Stopped }, undefined);
		super.dispose();
	}
}

function truncate(s: string, max: number): string {
	return s.length <= max ? s : s.slice(0, max) + '…';
}
