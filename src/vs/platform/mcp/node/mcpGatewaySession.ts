/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type * as http from 'http';
import {
	IJsonRpcNotification, IJsonRpcRequest,
	isJsonRpcNotification, isJsonRpcResponse, JsonRpcError, JsonRpcMessage, JsonRpcProtocol
} from '../../../base/common/jsonRpcProtocol.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { hasKey } from '../../../base/common/types.js';
import { ILogService } from '../../log/common/log.js';
import { IMcpGatewayToolInvoker } from '../common/mcpGateway.js';
import { MCP } from '../common/modelContextProtocol.js';

const MCP_LATEST_PROTOCOL_VERSION = '2025-11-25';
const MCP_INVALID_REQUEST = -32600;
const MCP_METHOD_NOT_FOUND = -32601;
const MCP_INVALID_PARAMS = -32602;

export class McpGatewaySession extends Disposable {
	private readonly _rpc: JsonRpcProtocol;
	private readonly _sseClients = new Set<http.ServerResponse>();
	private readonly _pendingResponses: JsonRpcMessage[] = [];
	private _isCollectingPostResponses = false;
	private _lastEventId = 0;
	private _isInitialized = false;

	constructor(
		public readonly id: string,
		private readonly _logService: ILogService,
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

			this._rpc.sendNotification({ method: 'notifications/tools/list_changed' });
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

		res.on('close', () => {
			this._sseClients.delete(res);
		});
	}

	public async handleIncoming(message: JsonRpcMessage | JsonRpcMessage[]): Promise<JsonRpcMessage[]> {
		this._pendingResponses.length = 0;
		this._isCollectingPostResponses = true;
		try {
			await this._rpc.handleMessage(message);
			return [...this._pendingResponses];
		} finally {
			this._isCollectingPostResponses = false;
			this._pendingResponses.length = 0;
		}
	}

	public override dispose(): void {
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
			if (this._isCollectingPostResponses) {
				this._pendingResponses.push(message);
			}
			return;
		}

		if (isJsonRpcNotification(message)) {
			this._broadcastSse(message);
			return;
		}

		this._logService.warn('[McpGatewayService] Ignored unsupported outgoing gateway message');
	}

	private _broadcastSse(message: JsonRpcMessage): void {
		if (this._sseClients.size === 0) {
			return;
		}

		const payload = JSON.stringify(message);
		const eventId = String(++this._lastEventId);
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
		if (request.method === 'initialize') {
			return this._handleInitialize();
		}

		if (!this._isInitialized) {
			throw new JsonRpcError(MCP_INVALID_REQUEST, 'Session is not initialized');
		}

		switch (request.method) {
			case 'ping':
				return {};
			case 'tools/list':
				return this._handleListTools();
			case 'tools/call':
				return this._handleCallTool(request);
			default:
				throw new JsonRpcError(MCP_METHOD_NOT_FOUND, `Method not found: ${request.method}`);
		}
	}

	private _handleNotification(notification: IJsonRpcNotification): void {
		if (notification.method === 'notifications/initialized') {
			this._isInitialized = true;
			this._rpc.sendNotification({ method: 'notifications/tools/list_changed' });
		}
	}

	private _handleInitialize(): MCP.InitializeResult {
		return {
			protocolVersion: MCP_LATEST_PROTOCOL_VERSION,
			capabilities: {
				tools: {
					listChanged: true,
				},
			},
			serverInfo: {
				name: 'VS Code MCP Gateway',
				version: '1.0.0',
			}
		};
	}

	private _handleCallTool(request: IJsonRpcRequest): unknown {
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

		return this._toolInvoker.callTool(params.name, argumentsValue).catch(error => {
			this._logService.error('[McpGatewayService] Tool call invocation failed', error);
			throw new JsonRpcError(MCP_INVALID_PARAMS, String(error));
		});
	}

	private _handleListTools(): unknown {
		return this._toolInvoker.listTools()
			.then(tools => ({ tools }));
	}
}

export function isInitializeMessage(message: JsonRpcMessage | JsonRpcMessage[]): boolean {
	const first = Array.isArray(message) ? message[0] : message;
	if (!first || !hasKey(first, { method: true })) {
		return false;
	}

	return first.method === 'initialize';
}
