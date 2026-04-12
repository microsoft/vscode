/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { isJsonRpcNotification, isJsonRpcResponse, JsonRpcError, JsonRpcProtocol } from '../../../base/common/jsonRpcProtocol.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
const MCP_LATEST_PROTOCOL_VERSION = '2025-11-25';
const MCP_SUPPORTED_PROTOCOL_VERSIONS = [
    '2025-11-25',
    '2025-06-18',
    '2025-03-26',
    '2024-11-05',
    '2024-10-07',
];
const MCP_INVALID_REQUEST = -32600;
const MCP_METHOD_NOT_FOUND = -32601;
const MCP_INVALID_PARAMS = -32602;
export class McpGatewaySession extends Disposable {
    constructor(id, _logService, _onDidDispose, _serverInvoker) {
        super();
        this.id = id;
        this._logService = _logService;
        this._onDidDispose = _onDidDispose;
        this._serverInvoker = _serverInvoker;
        this._sseClients = new Set();
        this._lastEventId = 0;
        this._isInitialized = false;
        this._rpc = this._register(new JsonRpcProtocol(message => this._handleOutgoingMessage(message), {
            handleRequest: request => this._handleRequest(request),
            handleNotification: notification => this._handleNotification(notification),
        }));
        this._register(this._serverInvoker.onDidChangeTools(() => {
            if (!this._isInitialized) {
                return;
            }
            this._logService.info(`[McpGateway][session ${this.id}] Tools changed, notifying client`);
            this._rpc.sendNotification({ method: 'notifications/tools/list_changed' });
        }));
        this._register(this._serverInvoker.onDidChangeResources(() => {
            if (!this._isInitialized) {
                return;
            }
            this._logService.info(`[McpGateway][session ${this.id}] Resources changed, notifying client`);
            this._rpc.sendNotification({ method: 'notifications/resources/list_changed' });
        }));
    }
    attachSseClient(_req, res) {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache, no-transform',
            'Connection': 'keep-alive',
        });
        res.write(': connected\n\n');
        this._sseClients.add(res);
        this._logService.info(`[McpGateway][session ${this.id}] SSE client attached (total: ${this._sseClients.size})`);
        res.on('close', () => {
            this._sseClients.delete(res);
            this._logService.info(`[McpGateway][session ${this.id}] SSE client detached (total: ${this._sseClients.size})`);
        });
    }
    async handleIncoming(message) {
        return this._rpc.handleMessage(message);
    }
    dispose() {
        this._logService.info(`[McpGateway][session ${this.id}] Disposing session (SSE clients: ${this._sseClients.size})`);
        for (const client of this._sseClients) {
            if (!client.destroyed) {
                client.end();
            }
        }
        this._sseClients.clear();
        this._onDidDispose();
        super.dispose();
    }
    _handleOutgoingMessage(message) {
        if (isJsonRpcResponse(message)) {
            this._logService.debug(`[McpGateway][session ${this.id}] --> response: ${JSON.stringify(message)}`);
            return;
        }
        if (isJsonRpcNotification(message)) {
            this._logService.debug(`[McpGateway][session ${this.id}] --> notification: ${message.method}`);
            this._broadcastSse(message);
            return;
        }
        this._logService.warn('[McpGatewayService] Ignored unsupported outgoing gateway message');
    }
    _broadcastSse(message) {
        if (this._sseClients.size === 0) {
            this._logService.debug(`[McpGateway][session ${this.id}] No SSE clients to broadcast to, dropping message`);
            return;
        }
        const payload = JSON.stringify(message);
        const eventId = String(++this._lastEventId);
        this._logService.debug(`[McpGateway][session ${this.id}] Broadcasting SSE event id=${eventId} to ${this._sseClients.size}`);
        const lines = payload.split(/\r?\n/g);
        const data = [
            `id: ${eventId}`,
            'event: message',
            ...lines.map(line => `data: ${line}`),
            '',
            ''
        ].join('\n');
        for (const client of [...this._sseClients]) {
            if (client.destroyed || client.writableEnded) {
                this._sseClients.delete(client);
                continue;
            }
            client.write(data);
        }
    }
    async _handleRequest(request) {
        this._logService.debug(`[McpGateway][session ${this.id}] <-- request: ${request.method} (id=${String(request.id)})`);
        if (request.method === 'initialize') {
            return this._handleInitialize(request);
        }
        if (!this._isInitialized) {
            this._logService.warn(`[McpGateway][session ${this.id}] Rejected request '${request.method}': session not initialized`);
            throw new JsonRpcError(MCP_INVALID_REQUEST, 'Session is not initialized');
        }
        switch (request.method) {
            case 'ping':
                return {};
            case 'tools/list':
                return this._handleListTools();
            case 'tools/call':
                return this._handleCallTool(request);
            case 'resources/list':
                return this._handleListResources();
            case 'resources/read':
                return this._handleReadResource(request);
            case 'resources/templates/list':
                return this._handleListResourceTemplates();
            default:
                this._logService.warn(`[McpGateway][session ${this.id}] Unknown method: ${request.method}`);
                throw new JsonRpcError(MCP_METHOD_NOT_FOUND, `Method not found: ${request.method}`);
        }
    }
    _handleNotification(notification) {
        this._logService.debug(`[McpGateway][session ${this.id}] <-- notification: ${notification.method}`);
        if (notification.method === 'notifications/initialized') {
            this._isInitialized = true;
            this._logService.info(`[McpGateway][session ${this.id}] Session initialized`);
            this._rpc.sendNotification({ method: 'notifications/tools/list_changed' });
            this._rpc.sendNotification({ method: 'notifications/resources/list_changed' });
        }
    }
    _handleInitialize(request) {
        const params = typeof request.params === 'object' && request.params ? request.params : undefined;
        const clientVersion = typeof params?.protocolVersion === 'string' ? params.protocolVersion : undefined;
        const clientInfo = params?.clientInfo;
        const negotiatedVersion = clientVersion && MCP_SUPPORTED_PROTOCOL_VERSIONS.includes(clientVersion)
            ? clientVersion
            : MCP_LATEST_PROTOCOL_VERSION;
        this._logService.info(`[McpGateway] Initialize: client=${clientInfo?.name ?? 'unknown'}/${clientInfo?.version ?? '?'}, clientProtocol=${clientVersion ?? '(none)'}, negotiated=${negotiatedVersion}`);
        if (clientVersion && clientVersion !== negotiatedVersion) {
            this._logService.warn(`[McpGateway] Client requested unsupported protocol version '${clientVersion}', falling back to '${negotiatedVersion}'`);
        }
        return {
            protocolVersion: negotiatedVersion,
            capabilities: {
                tools: {
                    listChanged: true,
                },
                resources: {
                    listChanged: true,
                },
            },
            serverInfo: {
                name: 'VS Code MCP Gateway',
                version: '1.0.0',
            }
        };
    }
    async _handleCallTool(request) {
        const params = typeof request.params === 'object' && request.params ? request.params : undefined;
        if (!params || typeof params.name !== 'string') {
            throw new JsonRpcError(MCP_INVALID_PARAMS, 'Missing tool call params');
        }
        if (params.arguments && typeof params.arguments !== 'object') {
            throw new JsonRpcError(MCP_INVALID_PARAMS, 'Invalid tool call arguments');
        }
        const argumentsValue = (params.arguments && typeof params.arguments === 'object')
            ? params.arguments
            : {};
        this._logService.debug(`[McpGateway][session ${this.id}] Calling tool '${params.name}' with args: ${JSON.stringify(argumentsValue)}`);
        try {
            const result = await this._serverInvoker.callTool(params.name, argumentsValue);
            this._logService.debug(`[McpGateway][session ${this.id}] Tool '${params.name}' completed (isError=${result.isError ?? false}, content blocks=${result.content.length})`);
            return result;
        }
        catch (error) {
            this._logService.error(`[McpGateway][session ${this.id}] Tool '${params.name}' invocation failed`, error);
            throw new JsonRpcError(MCP_INVALID_PARAMS, String(error));
        }
    }
    async _handleListTools() {
        const tools = await this._serverInvoker.listTools();
        this._logService.debug(`[McpGateway][session ${this.id}] Listed ${tools.length} tool(s): [${tools.map(t => t.name).join(', ')}]`);
        return { tools: tools };
    }
    async _handleListResources() {
        const resources = await this._serverInvoker.listResources();
        this._logService.debug(`[McpGateway][session ${this.id}] Listed ${resources.length} resource(s)`);
        return { resources: resources };
    }
    async _handleReadResource(request) {
        const params = typeof request.params === 'object' && request.params ? request.params : undefined;
        if (!params || typeof params.uri !== 'string') {
            throw new JsonRpcError(MCP_INVALID_PARAMS, 'Missing resource URI');
        }
        this._logService.debug(`[McpGateway][session ${this.id}] Reading resource '${params.uri}'`);
        try {
            const result = await this._serverInvoker.readResource(params.uri);
            this._logService.debug(`[McpGateway][session ${this.id}] Resource read returned ${result.contents.length} content(s)`);
            return result;
        }
        catch (error) {
            this._logService.error(`[McpGateway][session ${this.id}] Resource read failed for '${params.uri}'`, error);
            throw new JsonRpcError(MCP_INVALID_PARAMS, String(error));
        }
    }
    async _handleListResourceTemplates() {
        const resourceTemplates = await this._serverInvoker.listResourceTemplates();
        this._logService.debug(`[McpGateway][session ${this.id}] Listed ${resourceTemplates.length} resource template(s)`);
        return { resourceTemplates: resourceTemplates };
    }
}
export function isInitializeMessage(message) {
    const first = Array.isArray(message) ? message[0] : message;
    if (!first || !hasKey(first, { method: true })) {
        return false;
    }
    return first.method === 'initialize';
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwR2F0ZXdheVNlc3Npb24uanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy9wbGF0Zm9ybS9tY3Avbm9kZS9tY3BHYXRld2F5U2Vzc2lvbi50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUdoRyxPQUFPLEVBRU4scUJBQXFCLEVBQUUsaUJBQWlCLEVBQUUsWUFBWSxFQUFrQixlQUFlLEVBQ3ZGLE1BQU0seUNBQXlDLENBQUM7QUFDakQsT0FBTyxFQUFFLFVBQVUsRUFBRSxNQUFNLG1DQUFtQyxDQUFDO0FBQy9ELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSwrQkFBK0IsQ0FBQztBQUt2RCxNQUFNLDJCQUEyQixHQUFHLFlBQVksQ0FBQztBQUNqRCxNQUFNLCtCQUErQixHQUFHO0lBQ3ZDLFlBQVk7SUFDWixZQUFZO0lBQ1osWUFBWTtJQUNaLFlBQVk7SUFDWixZQUFZO0NBQ1osQ0FBQztBQUNGLE1BQU0sbUJBQW1CLEdBQUcsQ0FBQyxLQUFLLENBQUM7QUFDbkMsTUFBTSxvQkFBb0IsR0FBRyxDQUFDLEtBQUssQ0FBQztBQUNwQyxNQUFNLGtCQUFrQixHQUFHLENBQUMsS0FBSyxDQUFDO0FBRWxDLE1BQU0sT0FBTyxpQkFBa0IsU0FBUSxVQUFVO0lBTWhELFlBQ2lCLEVBQVUsRUFDVCxXQUFvQixFQUNwQixhQUF5QixFQUN6QixjQUE4QztRQUUvRCxLQUFLLEVBQUUsQ0FBQztRQUxRLE9BQUUsR0FBRixFQUFFLENBQVE7UUFDVCxnQkFBVyxHQUFYLFdBQVcsQ0FBUztRQUNwQixrQkFBYSxHQUFiLGFBQWEsQ0FBWTtRQUN6QixtQkFBYyxHQUFkLGNBQWMsQ0FBZ0M7UUFSL0MsZ0JBQVcsR0FBRyxJQUFJLEdBQUcsRUFBdUIsQ0FBQztRQUN0RCxpQkFBWSxHQUFHLENBQUMsQ0FBQztRQUNqQixtQkFBYyxHQUFHLEtBQUssQ0FBQztRQVU5QixJQUFJ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