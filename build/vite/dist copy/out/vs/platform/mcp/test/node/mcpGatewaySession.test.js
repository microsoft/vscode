/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { EventEmitter } from 'events';
import { Emitter } from '../../../../base/common/event.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../base/test/common/utils.js';
import { NullLogService } from '../../../log/common/log.js';
import { McpGatewaySession } from '../../node/mcpGatewaySession.js';
class TestServerResponse extends EventEmitter {
    constructor() {
        super(...arguments);
        this.writes = [];
        this.destroyed = false;
        this.writableEnded = false;
    }
    writeHead(statusCode, headers) {
        this.statusCode = statusCode;
        this.headers = headers;
        return this;
    }
    write(chunk) {
        this.writes.push(chunk);
        return true;
    }
    end(chunk) {
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
        const onDidChangeTools = new Emitter();
        const onDidChangeResources = new Emitter();
        const tools = [{
                name: 'test_tool',
                description: 'Test tool',
                inputSchema: {
                    type: 'object',
                    properties: {
                        name: { type: 'string' }
                    }
                }
            }];
        const resources = [{
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
                callTool: async (_name, args) => ({
                    content: [{ type: 'text', text: `Hello, ${typeof args.name === 'string' ? args.name : 'World'}!` }]
                }),
                listResources: async () => resources,
                readResource: async (_uri) => ({
                    contents: [{ uri: 'file:///test/resource.txt', text: 'hello world', mimeType: 'text/plain' }],
                }),
                listResourceTemplates: async () => [{ uriTemplate: 'file:///test/{name}', name: 'Test Template' }],
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
        const response = responses[0];
        assert.strictEqual(response.jsonrpc, '2.0');
        assert.strictEqual(response.id, 1);
        assert.strictEqual(response.result.protocolVersion, '2025-11-25');
        session.dispose();
        onDidChangeTools.dispose();
        onDidChangeResources.dispose();
    });
    test('negotiates to older protocol version when client requests it', async () => {
        const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
        const session = new McpGatewaySession('session-negotiate-1', new NullLogService(), () => { }, invoker);
        const responses = await session.handleIncoming({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2025-03-26',
                capabilities: {},
                clientInfo: { name: 'test-client', version: '1.0.0' },
            },
        });
        assert.strictEqual(responses.length, 1);
        const response = responses[0];
        assert.strictEqual(response.result.protocolVersion, '2025-03-26');
        session.dispose();
        onDidChangeTools.dispose();
        onDidChangeResources.dispose();
    });
    test('negotiates to each supported protocol version', async () => {
        const supportedVersions = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05', '2024-10-07'];
        for (const version of supportedVersions) {
            const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
            const session = new McpGatewaySession(`session-ver-${version}`, new NullLogService(), () => { }, invoker);
            const responses = await session.handleIncoming({
                jsonrpc: '2.0',
                id: 1,
                method: 'initialize',
                params: { protocolVersion: version, capabilities: {} },
            });
            const response = responses[0];
            assert.strictEqual(response.result.protocolVersion, version, `Expected server to negotiate to ${version}`);
            session.dispose();
            onDidChangeTools.dispose();
            onDidChangeResources.dispose();
        }
    });
    test('falls back to latest version for unsupported client version', async () => {
        const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
        const session = new McpGatewaySession('session-negotiate-2', new NullLogService(), () => { }, invoker);
        const responses = await session.handleIncoming({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: '2099-01-01',
                capabilities: {},
                clientInfo: { name: 'test-client', version: '1.0.0' },
            },
        });
        assert.strictEqual(responses.length, 1);
        const response = responses[0];
        assert.strictEqual(response.result.protocolVersion, '2025-11-25');
        session.dispose();
        onDidChangeTools.dispose();
        onDidChangeResources.dispose();
    });
    test('falls back to latest version when no params provided', async () => {
        const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
        const session = new McpGatewaySession('session-negotiate-3', new NullLogService(), () => { }, invoker);
        const responses = await session.handleIncoming({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
        });
        assert.strictEqual(responses.length, 1);
        const response = responses[0];
        assert.strictEqual(response.result.protocolVersion, '2025-11-25');
        session.dispose();
        onDidChangeTools.dispose();
        onDidChangeResources.dispose();
    });
    test('falls back to latest version when protocolVersion is not a string', async () => {
        const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
        const session = new McpGatewaySession('session-negotiate-4', new NullLogService(), () => { }, invoker);
        const responses = await session.handleIncoming({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
                protocolVersion: 42,
                capabilities: {},
            },
        });
        assert.strictEqual(responses.length, 1);
        const response = responses[0];
        assert.strictEqual(response.result.protocolVersion, '2025-11-25');
        session.dispose();
        onDidChangeTools.dispose();
        onDidChangeResources.dispose();
    });
    test('initialize response includes server info and capabilities', async () => {
        const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
        const session = new McpGatewaySession('session-init-caps', new NullLogService(), () => { }, invoker);
        const responses = await session.handleIncoming({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: { protocolVersion: '2025-03-26', capabilities: {} },
        });
        const result = responses[0].result;
        assert.deepStrictEqual(result, {
            protocolVersion: '2025-03-26',
            capabilities: {
                tools: { listChanged: true },
                resources: { listChanged: true },
            },
            serverInfo: {
                name: 'VS Code MCP Gateway',
                version: '1.0.0',
            },
        });
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
        const response = responses[0];
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
        const listResponse = listResponses[0];
        const tools = listResponse.result.tools;
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
        const callResponse = callResponses[0];
        const text = (callResponse.result.content[0].text);
        assert.strictEqual(text, 'Hello, VS Code!');
        session.dispose();
        onDidChangeTools.dispose();
        onDidChangeResources.dispose();
    });
    test('broadcasts notifications to attached SSE clients', async () => {
        const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
        const session = new McpGatewaySession('session-4', new NullLogService(), () => { }, invoker);
        const response = new TestServerResponse();
        session.attachSseClient({}, response);
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
        session.attachSseClient({}, response);
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
        session.attachSseClient({}, response);
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
        session.attachSseClient({}, response);
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
    test('serves resources/list with raw URIs', async () => {
        const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
        const session = new McpGatewaySession('session-8', new NullLogService(), () => { }, invoker);
        await session.handleIncoming({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        await session.handleIncoming({ jsonrpc: '2.0', method: 'notifications/initialized' });
        const responses = await session.handleIncoming({ jsonrpc: '2.0', id: 2, method: 'resources/list' });
        const response = responses[0];
        const resources = response.result.resources;
        assert.strictEqual(resources.length, 1);
        assert.strictEqual(resources[0].uri, 'file:///test/resource.txt');
        assert.strictEqual(resources[0].name, 'resource.txt');
        session.dispose();
        onDidChangeTools.dispose();
        onDidChangeResources.dispose();
    });
    test('serves resources/read with raw URIs', async () => {
        const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
        const session = new McpGatewaySession('session-9', new NullLogService(), () => { }, invoker);
        await session.handleIncoming({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        await session.handleIncoming({ jsonrpc: '2.0', method: 'notifications/initialized' });
        const responses = await session.handleIncoming({
            jsonrpc: '2.0',
            id: 2,
            method: 'resources/read',
            params: { uri: 'file:///test/resource.txt' },
        });
        const response = responses[0];
        const contents = response.result.contents;
        assert.strictEqual(contents.length, 1);
        assert.strictEqual(contents[0].uri, 'file:///test/resource.txt');
        assert.strictEqual(contents[0].text, 'hello world');
        session.dispose();
        onDidChangeTools.dispose();
        onDidChangeResources.dispose();
    });
    test('serves resources/templates/list with raw URI templates', async () => {
        const { invoker, onDidChangeTools, onDidChangeResources } = createInvoker();
        const session = new McpGatewaySession('session-10', new NullLogService(), () => { }, invoker);
        await session.handleIncoming({ jsonrpc: '2.0', id: 1, method: 'initialize' });
        await session.handleIncoming({ jsonrpc: '2.0', method: 'notifications/initialized' });
        const responses = await session.handleIncoming({ jsonrpc: '2.0', id: 2, method: 'resources/templates/list' });
        const response = responses[0];
        const templates = response.result.resourceTemplates;
        assert.strictEqual(templates.length, 1);
        assert.strictEqual(templates[0].uriTemplate, 'file:///test/{name}');
        assert.strictEqual(templates[0].name, 'Test Template');
        session.dispose();
        onDidChangeTools.dispose();
        onDidChangeResources.dispose();
    });
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwR2F0ZXdheVNlc3Npb24udGVzdC5qcyIsInNvdXJjZVJvb3QiOiJmaWxlOi8vL2hvbWUvYS93ZWJjb2RlLmhvc3QvdnNjb2RlL3NyYy8iLCJzb3VyY2VzIjpbInZzL3BsYXRmb3JtL21jcC90ZXN0L25vZGUvbWNwR2F0ZXdheVNlc3Npb24udGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiQUFBQTs7O2dHQUdnRztBQUVoRyxPQUFPLE1BQU0sTUFBTSxRQUFRLENBQUM7QUFFNUIsT0FBTyxFQUFFLFlBQVksRUFBRSxNQUFNLFFBQVEsQ0FBQztBQUN0QyxPQUFPLEVBQUUsT0FBTyxFQUFFLE1BQU0sa0NBQWtDLENBQUM7QUFFM0QsT0FBTyxFQUFFLHVDQUF1QyxFQUFFLE1BQU0sdUNBQXVDLENBQUM7QUFDaEcsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLDRCQUE0QixDQUFDO0FBRTVELE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLGlDQUFpQyxDQUFDO0FBRXBFLE1BQU0sa0JBQW1CLFNBQVEsWUFBWTtJQUE3Qzs7UUFHaUIsV0FBTSxHQUFhLEVBQUUsQ0FBQztRQUMvQixjQUFTLEdBQUcsS0FBSyxDQUFDO1FBQ2xCLGtCQUFhLEdBQUcsS0FBSyxDQUFDO0lBdUI5QixDQUFDO0lBckJBLFNBQVMsQ0FBQyxVQUFrQixFQUFFLE9BQWdDO1FBQzdELElBQUksQ0FBQyxVQUFVLEdBQUcsVUFBVSxDQUFDO1FBQzdCLElBQUksQ0FBQyxPQUFPLEdBQUcsT0FBTyxDQUFDO1FBQ3ZCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELEtBQUssQ0FBQyxLQUFhO1FBQ2xCLElBQUksQ0FBQyxNQUFNLENBQUMsSUFBSSxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ3hCLE9BQU8sSUFBSSxDQUFDO0lBQ2IsQ0FBQztJQUVELEdBQUcsQ0FBQyxLQUFjO1FBQ2pCLElBQUksS0FBSyxFQUFFLENBQUM7WUFDWCxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxL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