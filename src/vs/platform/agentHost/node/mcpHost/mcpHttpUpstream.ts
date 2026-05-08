/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationError } from '../../../../base/common/errors.js';
import { Emitter, type Event } from '../../../../base/common/event.js';
import { Disposable } from '../../../../base/common/lifecycle.js';
import { observableValue, type IObservable } from '../../../../base/common/observable.js';
import type { JsonRpcMessage } from '../../../../base/common/jsonRpcProtocol.js';
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
 * Caveats:
 *  - The probe may briefly initialize the upstream server before the
 *    SDK does. For session-bearing servers this is still acceptable
 *    per MCP, but it does mean the handshake is observable upstream.
 *  - SSE for server→client messages is not supported in v1; only the
 *    request/response pattern is plumbed through {@link send}. Adding
 *    SSE is a Phase 6 follow-up.
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
				response = await this._fetch(this._config.url, {
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

	public async send(message: JsonRpcMessage): Promise<void> {
		const current = this._status.get();
		if (current.kind !== McpServerStatusKind.Ready) {
			throw new Error(`McpHttpUpstream: cannot send while in state '${current.kind}'`);
		}

		const ac = new AbortController();

		return this._trackRequest(ac, async () => {
			let response: IHttpResponse;
			try {
				response = await this._fetch(this._config.url, {
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

			const text = await response.text();
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
		});
	}

	public setBearerToken(token: string | undefined): void {
		this._bearerToken = token;
		if (token) {
			this._hadPriorToken = true;
		}
	}

	public setUpstreamCapabilities(caps: IMcpUpstreamCapabilities | undefined): void {
		this._upstreamCapabilities.set(caps, undefined);
	}

	private _buildHeaders(): Record<string, string> {
		const headers: Record<string, string> = {
			'Content-Type': 'application/json',
			'Accept': 'application/json',
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
			resource = await this._fetchResourceMetadata(challenge.resourceMetadataUrl);
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

	private async _fetchResourceMetadata(url: string): Promise<ProtectedResourceMetadata | undefined> {
		try {
			const response = await this._fetch(url, {
				method: 'GET',
				headers: { 'Accept': 'application/json' },
			});
			if (response.status < 200 || response.status >= 300) {
				this._logger.warn(`McpHttpUpstream: resource_metadata fetch returned HTTP ${response.status}`);
				return undefined;
			}
			const text = await response.text();
			return JSON.parse(text) as ProtectedResourceMetadata;
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this._logger.warn(`McpHttpUpstream: failed to fetch or parse resource_metadata: ${message}`);
			return undefined;
		}
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
