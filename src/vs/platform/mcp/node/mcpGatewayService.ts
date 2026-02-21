/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import { DeferredPromise } from '../../../base/common/async.js';
import { JsonRpcMessage, JsonRpcProtocol } from '../../../base/common/jsonRpcProtocol.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogService } from '../../log/common/log.js';
import { IMcpGatewayInfo, IMcpGatewayService, IMcpGatewayToolInvoker } from '../common/mcpGateway.js';
import { isInitializeMessage, McpGatewaySession } from './mcpGatewaySession.js';

/**
 * Node.js implementation of the MCP Gateway Service.
 *
 * Creates and manages an HTTP server on localhost that provides MCP gateway endpoints.
 * The server is shared among all gateways and uses ref-counting for lifecycle management.
 */
export class McpGatewayService extends Disposable implements IMcpGatewayService {
	declare readonly _serviceBrand: undefined;

	private _server: http.Server | undefined;
	private _port: number | undefined;
	private readonly _gateways = new Map<string, McpGatewayRoute>();
	/** Maps gatewayId to clientId for tracking ownership */
	private readonly _gatewayToClient = new Map<string, unknown>();
	private _serverStartPromise: Promise<void> | undefined;

	constructor(
		@ILogService private readonly _logService: ILogService,
	) {
		super();
	}

	async createGateway(clientId: unknown, toolInvoker?: IMcpGatewayToolInvoker): Promise<IMcpGatewayInfo> {
		// Ensure server is running
		await this._ensureServer();

		if (this._port === undefined) {
			throw new Error('[McpGatewayService] Server failed to start, port is undefined');
		}

		// Generate a secure random ID for the gateway route
		const gatewayId = generateUuid();

		// Create the gateway route
		if (!toolInvoker) {
			throw new Error('[McpGatewayService] Tool invoker is required to create gateway');
		}

		const gateway = new McpGatewayRoute(gatewayId, this._logService, toolInvoker);
		this._gateways.set(gatewayId, gateway);

		// Track client ownership if clientId provided (for cleanup on disconnect)
		if (clientId) {
			this._gatewayToClient.set(gatewayId, clientId);
			this._logService.info(`[McpGatewayService] Created gateway at http://127.0.0.1:${this._port}/gateway/${gatewayId} for client ${clientId}`);
		} else {
			this._logService.warn(`[McpGatewayService] Created gateway without client tracking at http://127.0.0.1:${this._port}/gateway/${gatewayId}`);
		}

		const address = URI.parse(`http://127.0.0.1:${this._port}/gateway/${gatewayId}`);

		return {
			address,
			gatewayId,
		};
	}

	async disposeGateway(gatewayId: string): Promise<void> {
		const gateway = this._gateways.get(gatewayId);
		if (!gateway) {
			this._logService.warn(`[McpGatewayService] Attempted to dispose unknown gateway: ${gatewayId}`);
			return;
		}

		gateway.dispose();
		this._gateways.delete(gatewayId);
		this._gatewayToClient.delete(gatewayId);
		this._logService.info(`[McpGatewayService] Disposed gateway: ${gatewayId}`);

		// If no more gateways, shut down the server
		if (this._gateways.size === 0) {
			this._stopServer();
		}
	}

	disposeGatewaysForClient(clientId: unknown): void {
		const gatewaysToDispose: string[] = [];

		for (const [gatewayId, ownerClientId] of this._gatewayToClient) {
			if (ownerClientId === clientId) {
				gatewaysToDispose.push(gatewayId);
			}
		}

		if (gatewaysToDispose.length > 0) {
			this._logService.info(`[McpGatewayService] Disposing ${gatewaysToDispose.length} gateway(s) for disconnected client ${clientId}`);

			for (const gatewayId of gatewaysToDispose) {
				this._gateways.get(gatewayId)?.dispose();
				this._gateways.delete(gatewayId);
				this._gatewayToClient.delete(gatewayId);
			}

			// If no more gateways, shut down the server
			if (this._gateways.size === 0) {
				this._stopServer();
			}
		}
	}

	private async _ensureServer(): Promise<void> {
		if (this._server?.listening) {
			return;
		}

		// If server is already starting, wait for it
		if (this._serverStartPromise) {
			return this._serverStartPromise;
		}

		this._serverStartPromise = this._startServer();
		try {
			await this._serverStartPromise;
		} finally {
			this._serverStartPromise = undefined;
		}
	}

	private async _startServer(): Promise<void> {
		const { createServer } = await import('http'); // Lazy due to https://github.com/nodejs/node/issues/59686
		const deferredPromise = new DeferredPromise<void>();

		this._server = createServer((req, res) => {
			this._handleRequest(req, res);
		});

		const portTimeout = setTimeout(() => {
			deferredPromise.error(new Error('[McpGatewayService] Timeout waiting for server to start'));
		}, 5000);

		this._server.on('listening', () => {
			const address = this._server!.address();
			if (typeof address === 'string') {
				this._port = parseInt(address);
			} else if (address instanceof Object) {
				this._port = address.port;
			} else {
				clearTimeout(portTimeout);
				deferredPromise.error(new Error('[McpGatewayService] Unable to determine port'));
				return;
			}

			clearTimeout(portTimeout);
			this._logService.info(`[McpGatewayService] Server started on port ${this._port}`);
			deferredPromise.complete();
		});

		this._server.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'EADDRINUSE') {
				this._logService.warn('[McpGatewayService] Port in use, retrying with random port...');
				// Try with a random port
				this._server!.listen(0, '127.0.0.1');
				return;
			}
			clearTimeout(portTimeout);
			this._logService.error(`[McpGatewayService] Server error: ${err}`);
			deferredPromise.error(err);
		});

		// Use dynamic port assignment (port 0)
		this._server.listen(0, '127.0.0.1');

		return deferredPromise.p;
	}

	private _stopServer(): void {
		if (!this._server) {
			return;
		}

		this._logService.info('[McpGatewayService] Stopping server (no more gateways)');

		this._server.close(err => {
			if (err) {
				this._logService.error(`[McpGatewayService] Error closing server: ${err}`);
			} else {
				this._logService.info('[McpGatewayService] Server stopped');
			}
		});

		this._server = undefined;
		this._port = undefined;
	}

	private _handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		const url = new URL(req.url!, `http://${req.headers.host}`);
		const pathParts = url.pathname.split('/').filter(Boolean);

		// Expected path: /gateway/{gatewayId}
		if (pathParts.length >= 2 && pathParts[0] === 'gateway') {
			const gatewayId = pathParts[1];
			const gateway = this._gateways.get(gatewayId);

			if (gateway) {
				gateway.handleRequest(req, res);
				return;
			}
		}

		// Not found
		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Gateway not found' }));
	}

	override dispose(): void {
		this._stopServer();
		for (const gateway of this._gateways.values()) {
			gateway.dispose();
		}
		this._gateways.clear();
		super.dispose();
	}
}

/**
 * Represents a single MCP gateway route.
 */
class McpGatewayRoute extends Disposable {
	private readonly _sessions = new Map<string, McpGatewaySession>();

	private static readonly SessionHeaderName = 'mcp-session-id';

	constructor(
		public readonly gatewayId: string,
		private readonly _logService: ILogService,
		private readonly _toolInvoker: IMcpGatewayToolInvoker,
	) {
		super();
	}

	handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		if (req.method === 'POST') {
			void this._handlePost(req, res);
			return;
		}

		if (req.method === 'GET') {
			this._handleGet(req, res);
			return;
		}

		if (req.method === 'DELETE') {
			this._handleDelete(req, res);
			return;
		}

		this._respondHttpError(res, 405, 'Method not allowed');
	}

	public override dispose(): void {
		for (const session of this._sessions.values()) {
			session.dispose();
		}
		this._sessions.clear();
		super.dispose();
	}

	private _handleDelete(req: http.IncomingMessage, res: http.ServerResponse): void {
		const sessionId = this._getSessionId(req);
		if (!sessionId) {
			this._respondHttpError(res, 400, 'Missing Mcp-Session-Id header');
			return;
		}

		const session = this._sessions.get(sessionId);
		if (!session) {
			this._respondHttpError(res, 404, 'Session not found');
			return;
		}

		session.dispose();
		this._sessions.delete(sessionId);
		res.writeHead(204);
		res.end();
	}

	private _handleGet(req: http.IncomingMessage, res: http.ServerResponse): void {
		const sessionId = this._getSessionId(req);
		if (!sessionId) {
			this._respondHttpError(res, 400, 'Missing Mcp-Session-Id header');
			return;
		}

		const session = this._sessions.get(sessionId);
		if (!session) {
			this._respondHttpError(res, 404, 'Session not found');
			return;
		}

		session.attachSseClient(req, res);
	}

	private async _handlePost(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this._readRequestBody(req);
		if (body === undefined) {
			this._respondHttpError(res, 413, 'Payload too large');
			return;
		}

		let message: JsonRpcMessage | JsonRpcMessage[];
		try {
			message = JSON.parse(body) as JsonRpcMessage | JsonRpcMessage[];
		} catch (error) {
			res.writeHead(400, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(JsonRpcProtocol.createParseError('Parse error', error instanceof Error ? error.message : String(error))));
			return;
		}

		const headerSessionId = this._getSessionId(req);
		const session = this._resolveSessionForPost(headerSessionId, message, res);
		if (!session) {
			return;
		}

		try {
			const responses = await session.handleIncoming(message);

			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
				'Mcp-Session-Id': session.id,
			};

			if (responses.length === 0) {
				res.writeHead(202, headers);
				res.end();
				return;
			}

			res.writeHead(200, headers);
			res.end(JSON.stringify(Array.isArray(message) ? responses : responses[0]));
		} catch (error) {
			this._logService.error('[McpGatewayService] Failed handling gateway request', error);
			this._respondHttpError(res, 500, 'Internal server error');
		}
	}

	private _resolveSessionForPost(headerSessionId: string | undefined, message: JsonRpcMessage | JsonRpcMessage[], res: http.ServerResponse): McpGatewaySession | undefined {
		if (headerSessionId) {
			const existing = this._sessions.get(headerSessionId);
			if (!existing) {
				this._respondHttpError(res, 404, 'Session not found');
				return undefined;
			}

			return existing;
		}

		if (!isInitializeMessage(message)) {
			this._respondHttpError(res, 400, 'Missing Mcp-Session-Id header');
			return undefined;
		}

		const sessionId = generateUuid();
		const session = new McpGatewaySession(sessionId, this._logService, () => {
			this._sessions.delete(sessionId);
		}, this._toolInvoker);
		this._sessions.set(sessionId, session);
		return session;
	}

	private _respondHttpError(res: http.ServerResponse, statusCode: number, error: string): void {
		res.writeHead(statusCode, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: statusCode, message: error } } satisfies JsonRpcMessage));
	}

	private _getSessionId(req: http.IncomingMessage): string | undefined {
		const value = req.headers[McpGatewayRoute.SessionHeaderName];
		if (Array.isArray(value)) {
			return value[0];
		}

		return value;
	}

	private async _readRequestBody(req: http.IncomingMessage): Promise<string | undefined> {
		const chunks: Buffer[] = [];
		let size = 0;
		const maxBytes = 1024 * 1024;

		for await (const chunk of req) {
			const asBuffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
			size += asBuffer.byteLength;
			if (size > maxBytes) {
				return undefined;
			}
			chunks.push(asBuffer);
		}

		return Buffer.concat(chunks).toString('utf8');
	}
}
