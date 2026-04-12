/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { DeferredPromise } from '../../../base/common/async.js';
import { Emitter } from '../../../base/common/event.js';
import { JsonRpcProtocol } from '../../../base/common/jsonRpcProtocol.js';
import { Disposable, DisposableStore } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { generateUuid } from '../../../base/common/uuid.js';
import { ILoggerService } from '../../log/common/log.js';
import { isInitializeMessage, McpGatewaySession } from './mcpGatewaySession.js';
/**
 * Node.js implementation of the MCP Gateway Service.
 *
 * Creates and manages an HTTP server on localhost that provides MCP gateway endpoints.
 * The server is shared among all gateways and uses ref-counting for lifecycle management.
 */
let McpGatewayService = class McpGatewayService extends Disposable {
    constructor(loggerService) {
        super();
        /** All active routes keyed by their route UUID */
        this._routes = new Map();
        /** Maps gatewayId → set of route UUIDs belonging to that gateway */
        this._gatewayRoutes = new Map();
        /** Maps gatewayId → serverId → routeId for reverse lookup */
        this._gatewayServerRoutes = new Map();
        /** Maps gatewayId to clientId for tracking ownership */
        this._gatewayToClient = new Map();
        /** Per-gateway disposables (e.g. event listeners) */
        this._gatewayDisposables = new Map();
        this._logger = this._register(loggerService.createLogger('mcpGateway', { name: 'MCP Gateway', logLevel: 'always' }));
        this._logger.info('[McpGatewayService] Initialized');
    }
    async createGateway(clientId, toolInvoker) {
        // Ensure server is running
        await this._ensureServer();
        if (this._port === undefined) {
            throw new Error('[McpGatewayService] Server failed to start, port is undefined');
        }
        if (!toolInvoker) {
            throw new Error('[McpGatewayService] Tool invoker is required to create gateway');
        }
        const gatewayId = generateUuid();
        const routeIds = new Set();
        const serverRouteMap = new Map();
        this._gatewayRoutes.set(gatewayId, routeIds);
        this._gatewayServerRoutes.set(gatewayId, serverRouteMap);
        const disposables = new DisposableStore();
        this._gatewayDisposables.set(gatewayId, disposables);
        try {
            // Create initial server routes
            const serverDescriptors = toolInvoker.listServers();
            const servers = [];
            for (const descriptor of serverDescriptors) {
                const serverInfo = this._createRouteForServer(gatewayId, descriptor.id, descriptor.label, toolInvoker, routeIds, serverRouteMap);
                servers.push(serverInfo);
            }
            // Track client ownership
            if (clientId) {
                this._gatewayToClient.set(gatewayId, clientId);
                this._logger.info(`[McpGatewayService] Created gateway ${gatewayId} with ${servers.length} server(s) for client ${clientId}`);
            }
            else {
                this._logger.warn(`[McpGatewayService] Created gateway ${gatewayId} with ${servers.length} server(s) without client tracking`);
            }
            // Listen for server changes to dynamically add/remove routes
            const onDidChangeServers = disposables.add(new Emitter());
            disposables.add(toolInvoker.onDidChangeServers(newDescriptors => {
                this._refreshGatewayServers(gatewayId, newDescriptors, toolInvoker, routeIds, serverRouteMap, onDidChangeServers);
            }));
            return {
                servers,
                onDidChangeServers: onDidChangeServers.event,
                gatewayId,
            };
        }
        catch (error) {
            // Clean up partially-created state on failure
            this._cleanupGateway(gatewayId);
            throw error;
        }
    }
    _refreshGatewayServers(gatewayId, newDescriptors, toolInvoker, routeIds, serverRouteMap, onDidChangeServers) {
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
    _cleanupGateway(gatewayId) {
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
    _createRouteForServer(gatewayId, serverId, label, toolInvoker, routeIds, serverRouteMap) {
        const routeId = generateUuid();
        // Create a single-server invoker that delegates to the aggregating invoker
        const singleServerInvoker = {
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
    _getGatewayServers(gatewayId) {
        const serverRouteMap = this._gatewayServerRoutes.get(gatewayId);
        if (!serverRouteMap) {
            return [];
        }
        const servers = [];
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
    _disposeRoute(routeId) {
        const route = this._routes.get(routeId);
        if (route) {
            route.dispose();
            this._routes.delete(routeId);
            this._logger.info(`[McpGatewayService] Disposed route: ${routeId}`);
        }
    }
    async disposeGateway(gatewayId) {
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
    disposeGatewaysForClient(clientId) {
        const gatewaysToDispose = [];
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
    async _ensureServer() {
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
        }
        finally {
            this._serverStartPromise = undefined;
        }
    }
    async _startServer() {
        const { createServer } = await import('http'); // Lazy due to https://github.com/nodejs/node/issues/59686
        const deferredPromise = new DeferredPromise();
        this._server = createServer((req, res) => {
            this._handleRequest(req, res);
        });
        const portTimeout = setTimeout(() => {
            deferredPromise.error(new Error('[McpGatewayService] Timeout waiting for server to start'));
        }, 5000);
        this._server.on('listening', () => {
            const address = this._server.address();
            if (typeof address === 'string') {
                this._port = parseInt(address);
            }
            else if (address instanceof Object) {
                this._port = address.port;
            }
            else {
                clearTimeout(portTimeout);
                deferredPromise.error(new Error('[McpGatewayService] Unable to determine port'));
                return;
            }
            clearTimeout(portTimeout);
            this._logger.info(`[McpGatewayService] Server started on port ${this._port}`);
            deferredPromise.complete();
        });
        this._server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                this._logger.warn('[McpGatewayService] Port in use, retrying with random port...');
                // Try with a random port
                this._server.listen(0, '127.0.0.1');
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
    _stopServer() {
        if (!this._server) {
            return;
        }
        this._logger.info('[McpGatewayService] Stopping server (no more routes)');
        this._server.close(err => {
            if (err) {
                this._logger.error(`[McpGatewayService] Error closing server: ${err}`);
            }
            else {
                this._logger.info('[McpGatewayService] Server stopped');
            }
        });
        this._server = undefined;
        this._port = undefined;
    }
    _handleRequest(req, res) {
        const url = new URL(req.url, `http://${req.headers.host}`);
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
    dispose() {
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
};
McpGatewayService = __decorate([
    __param(0, ILoggerService)
], McpGatewayService);
export { McpGatewayService };
/**
 * Represents a single MCP gateway route for one MCP server.
 */
class McpGatewayRoute extends Disposable {
    static { this.SessionHeaderName = 'mcp-session-id'; }
    constructor(routeId, _logger, _serverInvoker, label = '') {
        super();
        this.routeId = routeId;
        this._logger = _logger;
        this._serverInvoker = _serverInvoker;
        this.label = label;
        this._sessions = new Map();
    }
    handleRequest(req, res) {
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
    dispose() {
        this._logger.info(`[McpGateway][route ${this.routeId}] Disposing route (sessions: ${this._sessions.size})`);
        for (const session of this._sessions.values()) {
            session.dispose();
        }
        this._sessions.clear();
        super.dispose();
    }
    _handleDelete(req, res) {
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
    _handleGet(req, res) {
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
    async _handlePost(req, res) {
        const body = await this._readRequestBody(req);
        if (body === undefined) {
            this._respondHttpError(res, 413, 'Payload too large');
            return;
        }
        this._logger.debug(`[McpGateway][route ${this.routeId}] Handling POST`);
        let message;
        try {
            message = JSON.parse(body);
        }
        catch (error) {
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
            const headers = {
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
        }
        catch (error) {
            this._logger.error('[McpGatewayService] Failed handling gateway request', error);
            this._respondHttpError(res, 500, 'Internal server error');
        }
    }
    _resolveSessionForPost(headerSessionId, message, res) {
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
    _respondHttpError(res, statusCode, error) {
        this._logger.debug(`[McpGateway][route ${this.routeId}] HTTP error response: ${statusCode} ${error}`);
        res.writeHead(statusCode, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', error: { code: statusCode, message: error } }));
    }
    _getSessionId(req) {
        const value = req.headers[McpGatewayRoute.SessionHeaderName];
        if (Array.isArray(value)) {
            return value[0];
        }
        return value;
    }
    async _readRequestBody(req) {
        const chunks = [];
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwR2F0ZXdheVNlcnZpY2UuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9tY3Avbm9kZS9tY3BHYXRld2F5U2VydmljZS50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRzs7Ozs7Ozs7OztBQUdoRyxPQUFPLEVBQUUsZUFBZSxFQUFFLE1BQU0sK0JBQStCLENBQUM7QUFDaEUsT0FBTyxFQUFFLE9BQU8sRUFBRSxNQUFNLCtCQUErQixDQUFDO0FBQ3hELE9BQU8sRUFBa0IsZUFBZSxFQUFFLE1BQU0seUNBQXlDLENBQUM7QUFDMUYsT0FBTyxFQUFFLFVBQVUsRUFBRSxlQUFlLEVBQUUsTUFBTSxtQ0FBbUMsQ0FBQztBQUNoRixPQUFPLEVBQUUsR0FBRyxFQUFFLE1BQU0sNkJBQTZCLENBQUM7QUFDbEQsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLDhCQUE4QixDQUFDO0FBQzVELE9BQU8sRUFBVyxjQUFjLEVBQUUsTUFBTSx5QkFBeUIsQ0FBQztBQUVsRSxPQUFPLEVBQUUsbUJBQW1CLEVBQUUsaUJBQWlCLEVBQUUsTUFBTSx3QkFBd0IsQ0FBQztBQUVoRjs7Ozs7R0FLRztBQUNJLElBQU0saUJBQWlCLEdBQXZCLE1BQU0saUJBQWtCLFNBQVEsVUFBVTtJQWtCaEQsWUFDaUIsYUFBNkI7UUFFN0MsS0FBSyxFQUFFLENBQUM7UUFoQlQsa0RBQWtEO1FBQ2pDLFlBQU8sR0FBRyxJQUFJLEdBQUcsRUFBMkIsQ0FBQztRQUM5RCxvRUFBb0U7UUFDbkQsbUJBQWMsR0FBRyxJQUFJLEdBQUcsRUFBdUIsQ0FBQztRQUNqRSw2REFBNkQ7UUFDNUMseUJBQW9CLEdBQUcsSUFBSSxHQUFHLEVBQStCLENBQUM7UUFDL0Usd0RBQXdEO1FBQ3ZDLHFCQUFnQixHQUFHLElBQUksR0FBRyxFQUFtQixDQUFDO1FBQy9ELHFEQUFxRDtRQUNwQyx3QkFBbUIs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