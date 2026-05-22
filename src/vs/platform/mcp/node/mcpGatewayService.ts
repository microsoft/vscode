/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { JsonRpcMessage, JsonRpcProtocol } from '../../../base/common/jsonRpcProtocol.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILogger, ILoggerService } from '../../log/common/log.js';
import { IMcpGatewayInfo, IMcpGatewayServerDescriptor, IMcpGatewayServerInfo, IMcpGatewayService, IMcpGatewaySingleServerInvoker, IMcpGatewayToolInvoker } from '../common/mcpGateway.js';
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
	/** All active routes keyed by their route UUID */
	private readonly _routes = new Map<string, McpGatewayRoute>();
	/** Maps gatewayId → set of route UUIDs belonging to that gateway */
	private readonly _gatewayRoutes = new Map<string, Set<string>>();
	/** Maps gatewayId → serverId → routeId for reverse lookup */
	private readonly _gatewayServerRoutes = new Map<string, Map<string, string>>();
	/** Maps gatewayId to clientId for tracking ownership */
	private readonly _gatewayToClient = new Map<string, unknown>();
	/** Per-gateway disposables (e.g. event listeners) */
	private readonly _gatewayDisposables = new Map<string, DisposableStore>();
	private _serverStartPromise: Promise<void> | undefined;
	private readonly _logger: ILogger;

	constructor(
		@ILoggerService loggerService: ILoggerService,
	) {
		super();
		this._logger = this._register(loggerService.createLogger('mcpGateway', { name: 'MCP Gateway', logLevel: 'always' }));
		this._logger.info('[McpGatewayService] Initialized');
	}

	async createGateway(clientId: unknown, toolInvoker?: IMcpGatewayToolInvoker): Promise<IMcpGatewayInfo> {
		// Ensure server is running
		await this._ensureServer();

		if (this._port === undefined) {
			throw new Error('[McpGatewayService] Server failed to start, port is undefined');
		}

		if (!toolInvoker) {
			throw new Error('[McpGatewayService] Tool invoker is required to create gateway');
		}

		const gatewayId = generateUuid();
		const routeIds = new Set<string>();
		const serverRouteMap = new Map<string, string>();
		this._gatewayRoutes.set(gatewayId, routeIds);
		this._gatewayServerRoutes.set(gatewayId, serverRouteMap);

		const disposables = new DisposableStore();
		this._gatewayDisposables.set(gatewayId, disposables);

		try {
			// Create initial server routes
			const serverDescriptors = toolInvoker.listServers();
			const servers: IMcpGatewayServerInfo[] = [];
			for (const descriptor of serverDescriptors) {
				const serverInfo = this._createRouteForServer(gatewayId, descriptor.id, descriptor.label, toolInvoker, routeIds, serverRouteMap);
				servers.push(serverInfo);
			}

			// Track client ownership
			if (clientId) {
				this._gatewayToClient.set(gatewayId, clientId);
				this._logger.info(`[McpGatewayService] Created gateway ${gatewayId} with ${servers.length} server(s) for client ${clientId}`);
			} else {
				this._logger.warn(`[McpGatewayService] Created gateway ${gatewayId} with ${servers.length} server(s) without client tracking`);
			}

			// Listen for server changes to dynamically add/remove routes
			const onDidChangeServers = disposables.add(new Emitter<readonly IMcpGatewayServerInfo[]>());
			disposables.add(toolInvoker.onDidChangeServers(newDescriptors => {
				this._refreshGatewayServers(gatewayId, newDescriptors, toolInvoker, routeIds, serverRouteMap, onDidChangeServers);
			}));

			return {
				servers,
				onDidChangeServers: onDidChangeServers.event,
				gatewayId,
			};
		} catch (error) {
			// Clean up partially-created state on failure
			this._cleanupGateway(gatewayId);
			throw error;
		}
	}

	private _refreshGatewayServers(
		gatewayId: string,
		newDescriptors: readonly IMcpGatewayServerDescriptor[],
		toolInvoker: IMcpGatewayToolInvoker,
		routeIds: Set<string>,
		serverRouteMap: Map<string, string>,
		onDidChangeServers: Emitter<readonly IMcpGatewayServerInfo[]>,
	): void {
		// Bail out if the gateway has been disposed
		if (!this._gatewayRoutes.has(gatewayId)) {
			return;
		}

		const newServerIds = new Set(newDescriptors.map(d => d.id));
		const existingServerIds = new Set(serverRouteMap.keys());

		// Remove routes for servers that are gone
		for (const serverId of existingServerIds) {
			if (!newServerIds.has(serverId)) {
				const routeId = serverRouteMap.get(serverId);
				if (routeId) {
					this._disposeRoute(routeId);
					routeIds.delete(routeId);
					serverRouteMap.delete(serverId);
				}
			}
		}

		// Add routes for new servers, and update labels for existing ones.
		for (const descriptor of newDescriptors) {
			if (!existingServerIds.has(descriptor.id)) {
				this._createRouteForServer(gatewayId, descriptor.id, descriptor.label, toolInvoker, routeIds, serverRouteMap);
				continue;
			}

			const routeId = serverRouteMap.get(descriptor.id);
			const route = routeId ? this._routes.get(routeId) : undefined;
			if (route && route.label !== descriptor.label) {
				route.label = descriptor.label;
			}
		}

		const updatedServers = this._getGatewayServers(gatewayId);
		this._logger.info(`[McpGatewayService] Gateway ${gatewayId} servers changed: ${updatedServers.length} server(s)`);
		onDidChangeServers.fire(updatedServers);
	}

	private _cleanupGateway(gatewayId: string): void {
		const routeIds = this._gatewayRoutes.get(gatewayId);
		if (routeIds) {
			for (const routeId of routeIds) {
				this._disposeRoute(routeId);
			}
		}
		this._gatewayRoutes.delete(gatewayId);
		this._gatewayServerRoutes.delete(gatewayId);
		this._gatewayToClient.delete(gatewayId);
		this._gatewayDisposables.get(gatewayId)?.dispose();
		this._gatewayDisposables.delete(gatewayId);
	}

	private _createRouteForServer(
		gatewayId: string,
		serverId: string,
		label: string,
		toolInvoker: IMcpGatewayToolInvoker,
		routeIds: Set<string>,
		serverRouteMap: Map<string, string>,
	): IMcpGatewayServerInfo {
		const routeId = generateUuid();

		// Create a single-server invoker that delegates to the aggregating invoker
		const singleServerInvoker: IMcpGatewaySingleServerInvoker = {
			onDidChangeTools: toolInvoker.onDidChangeTools,
			onDidChangeResources: toolInvoker.onDidChangeResources,
			listTools: () => toolInvoker.listToolsForServer(serverId),
			callTool: (name, args) => toolInvoker.callToolForServer(serverId, name, args),
			listResources: () => toolInvoker.listResourcesForServer(serverId),
			readResource: uri => toolInvoker.readResourceForServer(serverId, uri),
			listResourceTemplates: () => toolInvoker.listResourceTemplatesForServer(serverId),
		};

		const route = new McpGatewayRoute(routeId, this._logger, singleServerInvoker, label);
		this._routes.set(routeId, route);
		routeIds.add(routeId);
		serverRouteMap.set(serverId, routeId);

		const address = URI.parse(`http://127.0.0.1:${this._port}/gateway/${routeId}`);
		this._logger.info(`[McpGatewayService] Created route ${routeId} for server '${label}' (${serverId}) at ${address}`);

		return { label, address };
	}

	private _getGatewayServers(gatewayId: string): IMcpGatewayServerInfo[] {
		const serverRouteMap = this._gatewayServerRoutes.get(gatewayId);
		if (!serverRouteMap) {
			return [];
		}
		const servers: IMcpGatewayServerInfo[] = [];
		for (const [_serverId, routeId] of serverRouteMap) {
			const route = this._routes.get(routeId);
			if (route) {
				servers.push({
					label: route.label,
					address: URI.parse(`http://127.0.0.1:${this._port}/gateway/${routeId}`),
				});
			}
		}
		return servers;
	}

	private _disposeRoute(routeId: string): void {
		const route = this._routes.get(routeId);
		if (route) {
			route.dispose();
			this._routes.delete(routeId);
			this._logger.info(`[McpGatewayService] Disposed route: ${routeId}`);
		}
	}

	async disposeGateway(gatewayId: string): Promise<void> {
		if (!this._gatewayRoutes.has(gatewayId)) {
			this._logger.warn(`[McpGatewayService] Attempted to dispose unknown gateway: ${gatewayId}`);
			return;
		}

		this._cleanupGateway(gatewayId);
		this._logger.info(`[McpGatewayService] Disposed gateway: ${gatewayId} (remaining routes: ${this._routes.size})`);

		// If no more routes, shut down the server
		if (this._routes.size === 0) {
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
			this._logger.info(`[McpGatewayService] Disposing ${gatewaysToDispose.length} gateway(s) for disconnected client ${clientId}`);

			for (const gatewayId of gatewaysToDispose) {
				this._cleanupGateway(gatewayId);
			}

			// If no more routes, shut down the server
			if (this._routes.size === 0) {
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
			this._logger.info(`[McpGatewayService] Server started on port ${this._port}`);
			deferredPromise.complete();
		});

		this._server.on('error', (err: NodeJS.ErrnoException) => {
			if (err.code === 'EADDRINUSE') {
				this._logger.warn('[McpGatewayService] Port in use, retrying with random port...');
				// Try with a random port
				this._server!.listen(0, '127.0.0.1');
				return;
			}
			clearTimeout(portTimeout);
			this._logger.error(`[McpGatewayService] Server error: ${err}`);
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

		this._logger.info('[McpGatewayService] Stopping server (no more routes)');

		this._server.close(err => {
			if (err) {
				this._logger.error(`[McpGatewayService] Error closing server: ${err}`);
			} else {
				this._logger.info('[McpGatewayService] Server stopped');
			}
		});

		this._server = undefined;
		this._port = undefined;
	}

	private _handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		const url = new URL(req.url!, `http://${req.headers.host}`);
		const pathParts = url.pathname.split('/').filter(Boolean);

		this._logger.debug(`[McpGatewayService] ${req.method} ${url.pathname} (active routes: ${this._routes.size})`);

		// Expected path: /gateway/{routeId}
		if (pathParts.length >= 2 && pathParts[0] === 'gateway') {
			const routeId = pathParts[1];
			const route = this._routes.get(routeId);

			if (route) {
				route.handleRequest(req, res);
				return;
			}
		}

		// Not found
		this._logger.warn(`[McpGatewayService] ${req.method} ${url.pathname}: route not found`);
		res.writeHead(404, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ error: 'Gateway not found' }));
	}

	override dispose(): void {
		this._logger.info(`[McpGatewayService] Disposing service (routes: ${this._routes.size})`);
		this._stopServer();
		for (const route of this._routes.values()) {
			route.dispose();
		}
		this._routes.clear();
		this._gatewayRoutes.clear();
		this._gatewayServerRoutes.clear();
		this._gatewayToClient.clear();
		for (const disposables of this._gatewayDisposables.values()) {
			disposables.dispose();
		}
		this._gatewayDisposables.clear();
		super.dispose();
	}
}

/**
 * Represents a single MCP gateway route for one MCP server.
 */
class McpGatewayRoute extends Disposable {
	private readonly _sessions = new Map<string, McpGatewaySession>();

	private static readonly SessionHeaderName = 'mcp-session-id';

	constructor(
		public readonly routeId: string,
		private readonly _logger: ILogger,
		private readonly _serverInvoker: IMcpGatewaySingleServerInvoker,
		public label: string = '',
	) {
		super();
	}

	handleRequest(req: http.IncomingMessage, res: http.ServerResponse): void {
		this._logger.debug(`[McpGateway][route ${this.routeId}] ${req.method} request (sessions: ${this._sessions.size})`);

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
		this._logger.info(`[McpGateway][route ${this.routeId}] Disposing route (sessions: ${this._sessions.size})`);
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

		this._logger.info(`[McpGateway][route ${this.routeId}] Deleting session ${sessionId}`);
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

		this._logger.info(`[McpGateway][route ${this.routeId}] SSE connection requested for session ${sessionId}`);
		session.attachSseClient(req, res);
	}

	private async _handlePost(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
		const body = await this._readRequestBody(req);
		if (body === undefined) {
			this._respondHttpError(res, 413, 'Payload too large');
			return;
		}

		this._logger.debug(`[McpGateway][route ${this.routeId}] Handling POST`);

		let message: JsonRpcMessage | JsonRpcMessage[];
		try {
			message = JSON.parse(body) as JsonRpcMessage | JsonRpcMessage[];
		} catch (error) {
			this._logger.warn(`[McpGateway][route ${this.routeId}] JSON parse error: ${error instanceof Error ? error.message : String(error)}`);
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
				this._logger.debug(`[McpGateway][route ${this.routeId}] POST response: 202 (no content)`);
				res.writeHead(202, headers);
				res.end();
				return;
			}

			const responseBody = JSON.stringify(Array.isArray(message) ? responses : responses[0]);
			this._logger.debug(`[McpGateway][route ${this.routeId}] POST response: 200, body: ${responseBody}`);
			res.writeHead(200, headers);
			res.end(responseBody);
		} catch (error) {
			this._logger.error('[McpGatewayService] Failed handling gateway request', error);
			this._respondHttpError(res, 500, 'Internal server error');
		}
	}

	private _resolveSessionForPost(headerSessionId: string | undefined, message: JsonRpcMessage | JsonRpcMessage[], res: http.ServerResponse): McpGatewaySession | undefined {
		if (headerSessionId) {
			const existing = this._sessions.get(headerSessionId);
			if (!existing) {
				this._logger.warn(`[McpGateway][route ${this.routeId}] Session not found: ${headerSessionId}`);
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
		this._logger.info(`[McpGateway][route ${this.routeId}] Creating new session ${sessionId}`);
		const session = new McpGatewaySession(sessionId, this._logger, () => {
			this._sessions.delete(sessionId);
		}, this._serverInvoker);
		this._sessions.set(sessionId, session);
		return session;
	}

	private _respondHttpError(res: http.ServerResponse, statusCode: number, error: string): void {
		this._logger.debug(`[McpGateway][route ${this.routeId}] HTTP error response: ${statusCode} ${error}`);
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
