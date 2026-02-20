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
import { decodeGatewayResourceUri, encodeGatewayResourceUri, McpGatewaySession } from '../../node/mcpGatewaySession.js';

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
		const onDidChangeResources = new Emitter<void>();
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

		const resources: readonly MCP.Resource[] = [{
			uri: 'file:///test/resource.txt',
			name: 'resource.txt',
		}];

		return {
			onDidChangeTools,
			onDidChangeResources,
			invoker: {
				onDidChangeTools: onDidChangeTools.event,
				onDidChangeResources: onDidChangeResources.event,
				listTools: async () => tools,
				callTool: async (_name: string, args: Record<string, unknown>) => ({
					result: {
						content: [{ type: 'text' as const, text: `Hello, ${typeof args.name === 'string' ? args.name : 'World'}!` }]
					},
					serverIndex: 0,
				}),
				listResources: async () => [{ serverIndex: 0, resources }],
				readResource: async (_serverIndex: number, _uri: string) => ({
					contents: [{ uri: 'file:///test/resource.txt', text: 'hello world', mimeType: 'text/plain' }],
				}),
				listResourceTemplates: async () => [{ serverIndex: 0, resourceTemplates: [{ uriTemplate: 'file:///test/{name}', name: 'Test Template' }] }],
			}
		};
	}

	test('returns initialize result', async () => {
		const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
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
		onDidChangeResources.dispose();
	});

	test('rejects non-initialize requests before initialized notification', async () => {
		const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
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
		onDidChangeResources.dispose();
	});

	test('serves tools/list and tools/call after initialized notification', async () => {
		const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
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
		onDidChangeResources.dispose();
	});

	test('broadcasts notifications to attached SSE clients', async () => {
		const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
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
		assert.ok(response.writes.some(chunk => chunk.includes('notifications/resources/list_changed')));
		session.dispose();
		onDidChangeTools.dispose();
		onDidChangeResources.dispose();
	});

	test('emits list changed on tool invoker changes', async () => {
		const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
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
		onDidChangeResources.dispose();
	});

	test('disposes attached SSE clients and callback', () => {
		const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
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
		onDidChangeResources.dispose();
	});

	test('emits resources list changed on resource invoker changes', async () => {
		const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
		const session = new McpGatewaySession('session-7', new NullLogService(), () => { }, invoker);
		const response = new TestServerResponse();

		session.attachSseClient({} as http.IncomingMessage, response as unknown as http.ServerResponse);
		await session.handleIncoming({ jsonrpc: '2.0', id: 1, method: 'initialize' });
		await session.handleIncoming({ jsonrpc: '2.0', method: 'notifications/initialized' });

		const writesBefore = response.writes.length;
		onDidChangeResources.fire();

		assert.ok(response.writes.length > writesBefore);
		assert.ok(response.writes.slice(writesBefore).some(chunk => chunk.includes('notifications/resources/list_changed')));
		session.dispose();
		onDidChangeTools.dispose();
		onDidChangeResources.dispose();
	});

	test('serves resources/list with encoded URIs', async () => {
		const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
		const session = new McpGatewaySession('session-8', new NullLogService(), () => { }, invoker);

		await session.handleIncoming({ jsonrpc: '2.0', id: 1, method: 'initialize' });
		await session.handleIncoming({ jsonrpc: '2.0', method: 'notifications/initialized' });

		const responses = await session.handleIncoming({ jsonrpc: '2.0', id: 2, method: 'resources/list' });
		const response = responses[0] as IJsonRpcSuccessResponse;
		const resources = (response.result as { resources: Array<{ uri: string; name: string }> }).resources;
		assert.strictEqual(resources.length, 1);
		assert.strictEqual(resources[0].uri, 'file://-0/test/resource.txt');
		assert.strictEqual(resources[0].name, 'resource.txt');
		session.dispose();
		onDidChangeTools.dispose();
		onDidChangeResources.dispose();
	});

	test('serves resources/read with URI decoding and re-encoding', async () => {
		const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
		const session = new McpGatewaySession('session-9', new NullLogService(), () => { }, invoker);

		await session.handleIncoming({ jsonrpc: '2.0', id: 1, method: 'initialize' });
		await session.handleIncoming({ jsonrpc: '2.0', method: 'notifications/initialized' });

		const responses = await session.handleIncoming({
			jsonrpc: '2.0',
			id: 2,
			method: 'resources/read',
			params: { uri: 'file://-0/test/resource.txt' },
		});
		const response = responses[0] as IJsonRpcSuccessResponse;
		const contents = (response.result as { contents: Array<{ uri: string; text: string }> }).contents;
		assert.strictEqual(contents.length, 1);
		assert.strictEqual(contents[0].uri, 'file://-0/test/resource.txt');
		assert.strictEqual(contents[0].text, 'hello world');
		session.dispose();
		onDidChangeTools.dispose();
		onDidChangeResources.dispose();
	});

	test('serves resources/templates/list with encoded URI templates', async () => {
		const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
		const session = new McpGatewaySession('session-10', new NullLogService(), () => { }, invoker);

		await session.handleIncoming({ jsonrpc: '2.0', id: 1, method: 'initialize' });
		await session.handleIncoming({ jsonrpc: '2.0', method: 'notifications/initialized' });

		const responses = await session.handleIncoming({ jsonrpc: '2.0', id: 2, method: 'resources/templates/list' });
		const response = responses[0] as IJsonRpcSuccessResponse;
		const templates = (response.result as { resourceTemplates: Array<{ uriTemplate: string; name: string }> }).resourceTemplates;
		assert.strictEqual(templates.length, 1);
		assert.strictEqual(templates[0].uriTemplate, 'file://-0/test/{name}');
		assert.strictEqual(templates[0].name, 'Test Template');
		session.dispose();
		onDidChangeTools.dispose();
		onDidChangeResources.dispose();
	});
});

suite('Gateway Resource URI encoding', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('encodes and decodes URI with authority', () => {
		const encoded = encodeGatewayResourceUri('https://example.com/resource', 3);
		assert.strictEqual(encoded, 'https://example.com-3/resource');
		const decoded = decodeGatewayResourceUri(encoded);
		assert.strictEqual(decoded.serverIndex, 3);
		assert.strictEqual(decoded.originalUri, 'https://example.com/resource');
	});

	test('encodes and decodes URI with empty authority', () => {
		const encoded = encodeGatewayResourceUri('file:///path/to/file', 0);
		assert.strictEqual(encoded, 'file://-0/path/to/file');
		const decoded = decodeGatewayResourceUri(encoded);
		assert.strictEqual(decoded.serverIndex, 0);
		assert.strictEqual(decoded.originalUri, 'file:///path/to/file');
	});

	test('encodes and decodes URI with authority containing hyphens', () => {
		const encoded = encodeGatewayResourceUri('https://my-server.example.com/res', 12);
		assert.strictEqual(encoded, 'https://my-server.example.com-12/res');
		const decoded = decodeGatewayResourceUri(encoded);
		assert.strictEqual(decoded.serverIndex, 12);
		assert.strictEqual(decoded.originalUri, 'https://my-server.example.com/res');
	});

	test('encodes and decodes URI with port', () => {
		const encoded = encodeGatewayResourceUri('http://localhost:8080/api', 5);
		assert.strictEqual(encoded, 'http://localhost:8080-5/api');
		const decoded = decodeGatewayResourceUri(encoded);
		assert.strictEqual(decoded.serverIndex, 5);
		assert.strictEqual(decoded.originalUri, 'http://localhost:8080/api');
	});

	test('encodes and decodes URI with query and fragment', () => {
		const encoded = encodeGatewayResourceUri('https://example.com/resource?q=1#section', 2);
		assert.strictEqual(encoded, 'https://example.com-2/resource?q=1#section');
		const decoded = decodeGatewayResourceUri(encoded);
		assert.strictEqual(decoded.serverIndex, 2);
		assert.strictEqual(decoded.originalUri, 'https://example.com/resource?q=1#section');
	});

	test('encodes and decodes custom scheme URIs', () => {
		const encoded = encodeGatewayResourceUri('custom://myhost/path', 7);
		assert.strictEqual(encoded, 'custom://myhost-7/path');
		const decoded = decodeGatewayResourceUri(encoded);
		assert.strictEqual(decoded.serverIndex, 7);
		assert.strictEqual(decoded.originalUri, 'custom://myhost/path');
	});

	test('returns URI unchanged if no scheme match', () => {
		const encoded = encodeGatewayResourceUri('not-a-uri', 1);
		assert.strictEqual(encoded, 'not-a-uri');
	});

	test('throws on decode of URI without server index suffix', () => {
		assert.throws(() => decodeGatewayResourceUri('https://example.com/resource'));
	});
});
