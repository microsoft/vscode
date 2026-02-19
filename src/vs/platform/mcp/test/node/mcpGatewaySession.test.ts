/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import type * as http from 'http';
import { EventEmitter } from 'events';
import { Emitter } from '../../../../base/common/event.js';
import { IJsonRpcErrorResponse, IJsonRpcSuccessResponse } from '../../../../base/common/jsonRpcProtocol.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { MCP } from '../../common/modelContextProtocol.js';
import { McpGatewaySession } from '../../node/mcpGatewaySession.js';

class TestServerResponse extends EventEmitter {
	public statusCode: number | undefined;
	public headers: Record<string, string> | undefined;
	public readonly writes: string[] = [];
	public destroyed = false;
	public writableEnded = false;

	writeHead(statusCode: number, headers?: Record<string, string>) {
		this.statusCode = statusCode;
		this.headers = headers;
		return this;
	}

	write(chunk: string): boolean {
		this.writes.push(chunk);
		return true;
	}

	end(chunk?: string): this {
		if (chunk) {
			this.writes.push(chunk);
		}

		this.writableEnded = true;
		this.destroyed = true;
		this.emit('close');
		return this;
	}
}

suite('McpGatewaySession', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	function createInvoker() {
		const onDidChangeTools = new Emitter<void>();
		const tools: readonly MCP.Tool[] = [{
			name: 'test_tool',
			description: 'Test tool',
			inputSchema: {
				type: 'object',
				properties: {
					name: { type: 'string' }
				}
			}
		}];

		return {
			onDidChangeTools,
			invoker: {
				onDidChangeTools: onDidChangeTools.event,
				listTools: async () => tools,
				callTool: async (_name: string, args: Record<string, unknown>): Promise<MCP.CallToolResult> => ({
					content: [{ type: 'text', text: `Hello, ${typeof args.name === 'string' ? args.name : 'World'}!` }]
				})
			}
		};
	}

	test('returns initialize result', async () => {
		const { invoker, onDidChangeTools } = createInvoker();
		const session = new McpGatewaySession('session-1', new NullLogService(), () => { }, invoker);

		const responses = await session.handleIncoming({
			jsonrpc: '2.0',
			id: 1,
			method: 'initialize',
			params: {
				protocolVersion: '2025-11-25',
				capabilities: {},
				clientInfo: { name: 'test-client', version: '1.0.0' },
			},
		});

		assert.strictEqual(responses.length, 1);
		const response = responses[0] as IJsonRpcSuccessResponse;
		assert.strictEqual(response.jsonrpc, '2.0');
		assert.strictEqual(response.id, 1);
		assert.strictEqual((response.result as { protocolVersion: string }).protocolVersion, '2025-11-25');
		session.dispose();
		onDidChangeTools.dispose();
	});

	test('rejects non-initialize requests before initialized notification', async () => {
		const { invoker, onDidChangeTools } = createInvoker();
		const session = new McpGatewaySession('session-2', new NullLogService(), () => { }, invoker);

		const responses = await session.handleIncoming({
			jsonrpc: '2.0',
			id: 2,
			method: 'tools/list',
		});

		assert.strictEqual(responses.length, 1);
		const response = responses[0] as IJsonRpcErrorResponse;
		assert.strictEqual(response.jsonrpc, '2.0');
		assert.strictEqual(response.id, 2);
		assert.strictEqual(response.error.code, -32600);
		session.dispose();
		onDidChangeTools.dispose();
	});

	test('serves tools/list and tools/call after initialized notification', async () => {
		const { invoker, onDidChangeTools } = createInvoker();
		const session = new McpGatewaySession('session-3', new NullLogService(), () => { }, invoker);

		await session.handleIncoming({ jsonrpc: '2.0', id: 1, method: 'initialize' });
		const notificationResponses = await session.handleIncoming({ jsonrpc: '2.0', method: 'notifications/initialized' });
		assert.strictEqual(notificationResponses.length, 0);

		const listResponses = await session.handleIncoming({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
		const listResponse = listResponses[0] as IJsonRpcSuccessResponse;
		const tools = (listResponse.result as { tools: Array<{ name: string }> }).tools;
		assert.strictEqual(tools.length, 1);
		assert.strictEqual(tools[0].name, 'test_tool');

		const callResponses = await session.handleIncoming({
			jsonrpc: '2.0',
			id: 4,
			method: 'tools/call',
			params: {
				name: 'test_tool',
				arguments: {
					name: 'VS Code',
				},
			},
		});

		const callResponse = callResponses[0] as IJsonRpcSuccessResponse;
		const text = ((callResponse.result as { content: Array<{ text: string }> }).content[0].text);
		assert.strictEqual(text, 'Hello, VS Code!');
		session.dispose();
		onDidChangeTools.dispose();
	});

	test('broadcasts notifications to attached SSE clients', async () => {
		const { invoker, onDidChangeTools } = createInvoker();
		const session = new McpGatewaySession('session-4', new NullLogService(), () => { }, invoker);
		const response = new TestServerResponse();

		session.attachSseClient({} as http.IncomingMessage, response as unknown as http.ServerResponse);
		await session.handleIncoming({ jsonrpc: '2.0', id: 1, method: 'initialize' });
		await session.handleIncoming({ jsonrpc: '2.0', method: 'notifications/initialized' });

		assert.strictEqual(response.statusCode, 200);
		assert.strictEqual(response.headers?.['Content-Type'], 'text/event-stream');
		assert.ok(response.writes.some(chunk => chunk.includes(': connected')));
		assert.ok(response.writes.some(chunk => chunk.includes('event: message')));
		assert.ok(response.writes.some(chunk => chunk.includes('notifications/tools/list_changed')));
		session.dispose();
		onDidChangeTools.dispose();
	});

	test('emits list changed on tool invoker changes', async () => {
		const { invoker, onDidChangeTools } = createInvoker();
		const session = new McpGatewaySession('session-5', new NullLogService(), () => { }, invoker);
		const response = new TestServerResponse();

		session.attachSseClient({} as http.IncomingMessage, response as unknown as http.ServerResponse);
		await session.handleIncoming({ jsonrpc: '2.0', id: 1, method: 'initialize' });
		await session.handleIncoming({ jsonrpc: '2.0', method: 'notifications/initialized' });

		const writesBefore = response.writes.length;
		onDidChangeTools.fire();

		assert.ok(response.writes.length > writesBefore);
		assert.ok(response.writes.slice(writesBefore).some(chunk => chunk.includes('notifications/tools/list_changed')));
		session.dispose();
		onDidChangeTools.dispose();
	});

	test('disposes attached SSE clients and callback', () => {
		const { invoker, onDidChangeTools } = createInvoker();
		let disposed = false;
		const session = new McpGatewaySession('session-6', new NullLogService(), () => {
			disposed = true;
		}, invoker);
		const response = new TestServerResponse();

		session.attachSseClient({} as http.IncomingMessage, response as unknown as http.ServerResponse);
		session.dispose();

		assert.strictEqual(response.writableEnded, true);
		assert.strictEqual(disposed, true);
		onDidChangeTools.dispose();
	});
});
