/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { IncomingMessage, Server, ServerResponse } from 'http';
import type { AddressInfo } from 'net';
import { Disposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { generateUuid } from '../../../../base/common/uuid.js';
import type { ILogger } from '../../../log/common/log.js';

function truncate(s: string, max: number): string {
	return s.length <= max ? s : s.slice(0, max) + '…';
}

/**
 * Handles a single inbound HTTP request body for a registered route.
 * Each route owns its own JSON-RPC dispatch.
 *
 * @param body The request body as a UTF-8 string.
 * @returns The response body to send back. The listener writes
 *   `200 OK` with `Content-Type: application/json` for non-empty bodies
 *   and `204 No Content` for empty strings.
 */
export type RouteHandler = (body: string) => Promise<string>;

export interface IRouteRegistration {
	/** The URL the upstream-facing SDK should POST to. */
	readonly endpoint: URI;
	/** Removes the route. Shuts down the HTTP server when the last route is removed. */
	dispose(): void;
}

/** Maximum accepted request-body size (1MB). */
const MAX_REQUEST_BODY_BYTES = 1024 * 1024;

/** Path prefix every registered route lives under. */
const ROUTE_PATH_PREFIX = '/mcp/';

/** Path suffix every registered route lives under. */
const ROUTE_PATH_SUFFIX = '/message';

/**
 * A shared HTTP listener bound on `127.0.0.1` that hosts per-MCP-server
 * routes at randomized paths.
 *
 * The first registration starts the server; disposing the last route
 * shuts it down. Loopback-only — never binds to a non-loopback
 * interface. The randomized path is the access control mechanism;
 * clients must know the URL exactly. URLs are passed only to the local
 * SDK process spawned by the proxy.
 */
export class McpProxyHttpListener extends Disposable {

	private _server: Server | undefined;
	private _origin: string | undefined;
	private readonly _routes = new Map<string, RouteHandler>();
	private _disposed = false;

	constructor(private readonly _logger: ILogger) {
		super();
		this._register(toDisposable(() => this._shutdown()));
	}

	/**
	 * Register a route. Returns the URI the SDK should connect to and a
	 * disposable that removes the route. When the last route is removed,
	 * the server is shut down.
	 */
	public async registerRoute(handler: RouteHandler): Promise<IRouteRegistration> {
		if (this._disposed) {
			throw new Error('McpProxyHttpListener: cannot register route after dispose');
		}
		const origin = await this._ensureServer();
		const routeId = generateUuid();
		this._routes.set(routeId, handler);
		const path = `${ROUTE_PATH_PREFIX}${routeId}${ROUTE_PATH_SUFFIX}`;
		const endpoint = URI.parse(`${origin}${path}`);
		let removed = false;
		const dispose = () => {
			if (removed) {
				return;
			}
			removed = true;
			this._routes.delete(routeId);
			if (this._routes.size === 0) {
				this._closeServer();
			}
		};
		return { endpoint, dispose };
	}

	private async _ensureServer(): Promise<string> {
		if (this._server && this._origin) {
			return this._origin;
		}
		const { createServer } = await import('http');
		return new Promise<string>((resolve, reject) => {
			const server = createServer((req, res) => this._handleRequest(req, res));
			server.on('error', err => {
				this._logger.error(`McpProxyHttpListener: server error: ${err instanceof Error ? err.message : String(err)}`);
				if (!this._origin) {
					reject(err);
				}
			});
			server.listen(0, '127.0.0.1', () => {
				const address = server.address() as AddressInfo | null;
				if (!address || typeof address !== 'object') {
					reject(new Error('McpProxyHttpListener: failed to determine listening port'));
					return;
				}
				this._server = server;
				this._origin = `http://127.0.0.1:${address.port}`;
				resolve(this._origin);
			});
		});
	}

	private _handleRequest(req: IncomingMessage, res: ServerResponse): void {
		if (req.method !== 'POST') {
			res.statusCode = 405;
			res.setHeader('Allow', 'POST');
			res.end();
			return;
		}

		const url = req.url ?? '';
		if (!url.startsWith(ROUTE_PATH_PREFIX)) {
			res.statusCode = 404;
			res.end();
			return;
		}

		const segments = url.split('/').filter(s => s.length > 0);
		// Expect ['mcp', '<routeId>', 'message'].
		if (segments.length < 3 || segments[0] !== 'mcp' || segments[2] !== 'message') {
			res.statusCode = 404;
			res.end();
			return;
		}
		const routeId = segments[1];
		const handler = this._routes.get(routeId);
		if (!handler) {
			res.statusCode = 404;
			res.end();
			return;
		}

		const declaredLength = Number(req.headers['content-length']);
		if (Number.isFinite(declaredLength) && declaredLength > MAX_REQUEST_BODY_BYTES) {
			res.statusCode = 413;
			res.end();
			return;
		}

		const chunks: Buffer[] = [];
		let received = 0;
		let aborted = false;
		req.on('data', (chunk: Buffer) => {
			if (aborted) {
				return;
			}
			received += chunk.length;
			if (received > MAX_REQUEST_BODY_BYTES) {
				aborted = true;
				res.statusCode = 413;
				res.end();
				req.destroy();
				return;
			}
			chunks.push(chunk);
		});
		req.on('error', err => {
			this._logger.warn(`McpProxyHttpListener: request error: ${err instanceof Error ? err.message : String(err)}`);
		});
		req.on('end', () => {
			if (aborted) {
				return;
			}
			const body = Buffer.concat(chunks).toString('utf8');
			const traceId = generateUuid().slice(0, 8);
			this._logger.trace(`McpProxyHttpListener[${routeId.slice(0, 8)}] -> ${traceId}: POST ${url}${body ? `, body=${truncate(body, 256)}` : ''}`);
			handler(body).then(
				responseBody => {
					if (responseBody.length === 0) {
						this._logger.trace(`McpProxyHttpListener[${routeId.slice(0, 8)}] <- ${traceId}: 204`);
						res.statusCode = 204;
						res.end();
						return;
					}
					this._logger.trace(`McpProxyHttpListener[${routeId.slice(0, 8)}] <- ${traceId}: 200, body=${truncate(responseBody, 256)}`);
					res.statusCode = 200;
					res.setHeader('Content-Type', 'application/json');
					res.end(responseBody);
				},
				err => {
					this._logger.trace(`McpProxyHttpListener[${routeId.slice(0, 8)}] <- ${traceId}: 500: ${err instanceof Error ? err.message : String(err)}`);
					this._logger.error(`McpProxyHttpListener: route handler error: ${err instanceof Error ? err.message : String(err)}`);
					if (!res.headersSent) {
						res.statusCode = 500;
					}
					res.end();
				},
			);
		});
	}

	private _closeServer(): void {
		const server = this._server;
		if (!server) {
			return;
		}
		this._server = undefined;
		this._origin = undefined;
		server.close(err => {
			if (err) {
				this._logger.warn(`McpProxyHttpListener: server.close error: ${err instanceof Error ? err.message : String(err)}`);
			}
		});
	}

	private _shutdown(): void {
		if (this._disposed) {
			return;
		}
		this._disposed = true;
		this._routes.clear();
		this._closeServer();
	}
}
