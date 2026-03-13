/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import {
	IJsonRpcNotification, IJsonRpcRequest,
	isJsonRpcNotification, isJsonRpcResponse, JsonRpcError, JsonRpcMessage, JsonRpcProtocol, JsonRpcResponse
} from '../../../base/common/jsonRpcProtocol.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { ILogger } from '../../log/common/log.js';
import { IMcpGatewayToolInvoker } from '../common/mcpGateway.js';
import { MCP } from '../common/modelContextProtocol.js';

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

const GATEWAY_URI_AUTHORITY_RE = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)([^/?#]*)(.*)/;

/**
 * Encodes a resource URI for the gateway by appending `-{serverIndex}` to the authority.
 * This namespaces resources from different MCP servers served through the same gateway.
 */
export function encodeGatewayResourceUri(uri: string, serverIndex: number): string {
	const match = uri.match(GATEWAY_URI_AUTHORITY_RE);
	if (!match) {
		return uri;
	}
	const [, prefix, authority, rest] = match;
	return `${prefix}${authority}-${serverIndex}${rest}`;
}

/**
 * Decodes a gateway-encoded resource URI, extracting the server index and original URI.
 */
export function decodeGatewayResourceUri(uri: string): { serverIndex: number; originalUri: string } {
	const match = uri.match(GATEWAY_URI_AUTHORITY_RE);
	if (!match) {
		throw new JsonRpcError(MCP_INVALID_PARAMS, `Invalid resource URI: ${uri}`);
	}
	const [, prefix, authority, rest] = match;
	const suffixMatch = authority.match(/^(.*)-([0-9]+)$/);
	if (!suffixMatch) {
		throw new JsonRpcError(MCP_INVALID_PARAMS, `Invalid gateway resource URI (no server index): ${uri}`);
	}
	const [, originalAuthority, indexStr] = suffixMatch;
	return {
		serverIndex: parseInt(indexStr, 10),
		originalUri: `${prefix}${originalAuthority}${rest}`,
	};
}

function encodeResourceUrisInContent(content: MCP.ContentBlock[], serverIndex: number): MCP.ContentBlock[] {
	return content.map(block => {
		if (block.type === 'resource_link') {
			return { ...block, uri: encodeGatewayResourceUri(block.uri, serverIndex) };
		}
		if (block.type === 'resource') {
			return {
				...block,
				resource: { ...block.resource, uri: encodeGatewayResourceUri(block.resource.uri, serverIndex) },
			};
		}
		return block;
	});
}

export class McpGatewaySession extends Disposable {
	private readonly _rpc: JsonRpcProtocol;
	private readonly _sseClients = new Set<http.ServerResponse>();
	private _lastEventId = 0;
	private _isInitialized = false;

	constructor(
		public readonly id: string,
		private readonly _logService: ILogger,
		private readonly _onDidDispose: () => void,
		private readonly _toolInvoker: IMcpGatewayToolInvoker,
	) {
		super();

		this._rpc = this._register(new JsonRpcProtocol(
			message => this._handleOutgoingMessage(message),
			{
				handleRequest: request => this._handleRequest(request),
				handleNotification: notification => this._handleNotification(notification),
			}
		));

		this._register(this._toolInvoker.onDidChangeTools(() => {
			if (!this._isInitialized) {
				return;
			}

			this._logService.info(`[McpGateway][session ${this.id}] Tools changed, notifying client`);
			this._rpc.sendNotification({ method: 'notifications/tools/list_changed' });
		}));

		this._register(this._toolInvoker.onDidChangeResources(() => {
			if (!this._isInitialized) {
				return;
			}

			this._logService.info(`[McpGateway][session ${this.id}] Resources changed, notifying client`);
			this._rpc.sendNotification({ method: 'notifications/resources/list_changed' });
		}));
	}

	public attachSseClient(_req: http.IncomingMessage, res: http.ServerResponse): void {
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

	public async handleIncoming(message: JsonRpcMessage | JsonRpcMessage[]): Promise<JsonRpcResponse[]> {
		return this._rpc.handleMessage(message);
	}

	public override dispose(): void {
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

	private _handleOutgoingMessage(message: JsonRpcMessage): void {
		if (isJsonRpcResponse(message)) {
			this._logService.debug(`[McpGateway][session ${this.id}] --> response: ${JSON.stringify(message)}`);
			return;
		}

		if (isJsonRpcNotification(message)) {
			this._logService.debug(`[McpGateway][session ${this.id}] --> notification: ${(message as IJsonRpcNotification).method}`);
			this._broadcastSse(message);
			return;
		}

		this._logService.warn('[McpGatewayService] Ignored unsupported outgoing gateway message');
	}

	private _broadcastSse(message: JsonRpcMessage): void {
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

	private async _handleRequest(request: IJsonRpcRequest): Promise<unknown> {
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

	private _handleNotification(notification: IJsonRpcNotification): void {
		this._logService.debug(`[McpGateway][session ${this.id}] <-- notification: ${notification.method}`);

		if (notification.method === 'notifications/initialized') {
			this._isInitialized = true;
			this._logService.info(`[McpGateway][session ${this.id}] Session initialized`);
			this._rpc.sendNotification({ method: 'notifications/tools/list_changed' });
			this._rpc.sendNotification({ method: 'notifications/resources/list_changed' });
		}
	}

	private _handleInitialize(request: IJsonRpcRequest): MCP.InitializeResult {
		const params = typeof request.params === 'object' && request.params ? request.params as Record<string, unknown> : undefined;
		const clientVersion = typeof params?.protocolVersion === 'string' ? params.protocolVersion : undefined;
		const clientInfo = params?.clientInfo as { name?: string; version?: string } | undefined;
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

	private async _handleCallTool(request: IJsonRpcRequest): Promise<MCP.CallToolResult> {
		const params = typeof request.params === 'object' && request.params ? request.params as Record<string, unknown> : undefined;
		if (!params || typeof params.name !== 'string') {
			throw new JsonRpcError(MCP_INVALID_PARAMS, 'Missing tool call params');
		}

		if (params.arguments && typeof params.arguments !== 'object') {
			throw new JsonRpcError(MCP_INVALID_PARAMS, 'Invalid tool call arguments');
		}

		const argumentsValue = (params.arguments && typeof params.arguments === 'object')
			? params.arguments as Record<string, unknown>
			: {};

		this._logService.debug(`[McpGateway][session ${this.id}] Calling tool '${params.name}' with args: ${JSON.stringify(argumentsValue)}`);

		try {
			const { result, serverIndex } = await this._toolInvoker.callTool(params.name, argumentsValue);
			this._logService.debug(`[McpGateway][session ${this.id}] Tool '${params.name}' completed (isError=${result.isError ?? false}, content blocks=${result.content.length})`);
			return {
				...result,
				content: encodeResourceUrisInContent(result.content, serverIndex),
			};
		} catch (error) {
			this._logService.error(`[McpGateway][session ${this.id}] Tool '${params.name}' invocation failed`, error);
			throw new JsonRpcError(MCP_INVALID_PARAMS, String(error));
		}
	}

	private _handleListTools(): unknown {
		return this._toolInvoker.listTools()
			.then(tools => {
				this._logService.debug(`[McpGateway][session ${this.id}] Listed ${tools.length} tool(s): [${tools.map(t => t.name).join(', ')}]`);
				return { tools };
			});
	}

	private async _handleListResources(): Promise<MCP.ListResourcesResult> {
		const serverResults = await this._toolInvoker.listResources();
		const allResources: MCP.Resource[] = [];
		for (const { serverIndex, resources } of serverResults) {
			for (const resource of resources) {
				allResources.push({
					...resource,
					uri: encodeGatewayResourceUri(resource.uri, serverIndex),
				});
			}
		}
		this._logService.debug(`[McpGateway][session ${this.id}] Listed ${allResources.length} resource(s) from ${serverResults.length} server(s)`);
		return { resources: allResources };
	}

	private async _handleReadResource(request: IJsonRpcRequest): Promise<MCP.ReadResourceResult> {
		const params = typeof request.params === 'object' && request.params ? request.params as Record<string, unknown> : undefined;
		if (!params || typeof params.uri !== 'string') {
			throw new JsonRpcError(MCP_INVALID_PARAMS, 'Missing resource URI');
		}

		const { serverIndex, originalUri } = decodeGatewayResourceUri(params.uri);
		this._logService.debug(`[McpGateway][session ${this.id}] Reading resource '${originalUri}' from server ${serverIndex}`);
		try {
			const result = await this._toolInvoker.readResource(serverIndex, originalUri);
			this._logService.debug(`[McpGateway][session ${this.id}] Resource read returned ${result.contents.length} content(s)`);
			return {
				contents: result.contents.map(content => ({
					...content,
					uri: encodeGatewayResourceUri(content.uri, serverIndex),
				})),
			};
		} catch (error) {
			this._logService.error(`[McpGateway][session ${this.id}] Resource read failed for '${originalUri}'`, error);
			throw new JsonRpcError(MCP_INVALID_PARAMS, String(error));
		}
	}

	private async _handleListResourceTemplates(): Promise<MCP.ListResourceTemplatesResult> {
		const serverResults = await this._toolInvoker.listResourceTemplates();
		const allTemplates: MCP.ResourceTemplate[] = [];
		for (const { serverIndex, resourceTemplates } of serverResults) {
			for (const template of resourceTemplates) {
				allTemplates.push({
					...template,
					uriTemplate: encodeGatewayResourceUri(template.uriTemplate, serverIndex),
				});
			}
		}
		this._logService.debug(`[McpGateway][session ${this.id}] Listed ${allTemplates.length} resource template(s) from ${serverResults.length} server(s)`);
		return { resourceTemplates: allTemplates };
	}
}

export function isInitializeMessage(message: JsonRpcMessage | JsonRpcMessage[]): boolean {
	const first = Array.isArray(message) ? message[0] : message;
	if (!first || !hasKey(first, { method: true })) {
		return false;
	}

	return first.method === 'initialize';
}
