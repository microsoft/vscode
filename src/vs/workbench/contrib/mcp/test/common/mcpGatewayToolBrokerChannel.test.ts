/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { MCP } from '../../common/modelContextProtocol.js';
import { McpGatewayToolBrokerChannel } from '../../common/mcpGatewayToolBrokerChannel.js';
import { IMcpIcons, IMcpServer, IMcpTool, McpConnectionState, McpServerCacheState, McpToolVisibility } from '../../common/mcpTypes.js';
import { TestMcpService } from './testMcpService.js';

suite('McpGatewayToolBrokerChannel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('lists model-visible tools with namespaced identities', async () => {
		const mcpService = new TestMcpService();
		const channel = new McpGatewayToolBrokerChannel(mcpService);

		const serverA = createServer('collectionA', 'serverA', [
			createTool('mcp_serverA_echo', async () => ({ content: [{ type: 'text', text: 'A' }] })),
			createTool('app-only', async () => ({ content: [{ type: 'text', text: 'A2' }] }), McpToolVisibility.App),
		]);
		const serverB = createServer('collectionB', 'serverB', [
			createTool('mcp_serverB_echo', async () => ({ content: [{ type: 'text', text: 'B' }] })),
		]);

		mcpService.servers.set([serverA, serverB], undefined);

		const result = await channel.call<readonly MCP.Tool[]>(undefined, 'listTools');
		const names = result.map(tool => tool.name).sort();

		assert.deepStrictEqual(names, [
			'mcp_serverA_echo',
			'mcp_serverB_echo',
		]);

		channel.dispose();
	});

	test('routes tool calls by namespaced identity', async () => {
		const mcpService = new TestMcpService();
		const channel = new McpGatewayToolBrokerChannel(mcpService);

		const invoked: string[] = [];
		const serverA = createServer('collectionA', 'serverA', [
			createTool('mcp_serverA_echo', async args => {
				invoked.push(`A:${String(args.name)}`);
				return { content: [{ type: 'text', text: 'from A' }] };
			}),
		]);
		const serverB = createServer('collectionB', 'serverB', [
			createTool('mcp_serverB_echo', async args => {
				invoked.push(`B:${String(args.name)}`);
				return { content: [{ type: 'text', text: 'from B' }] };
			}),
		]);

		mcpService.servers.set([serverA, serverB], undefined);

		const resultA = await channel.call<MCP.CallToolResult>(undefined, 'callTool', {
			name: 'mcp_serverA_echo',
			args: { name: 'one' },
		});
		const resultB = await channel.call<MCP.CallToolResult>(undefined, 'callTool', {
			name: 'mcp_serverB_echo',
			args: { name: 'two' },
		});

		assert.deepStrictEqual(invoked, ['A:one', 'B:two']);
		assert.strictEqual((resultA.content[0] as MCP.TextContent).text, 'from A');
		assert.strictEqual((resultB.content[0] as MCP.TextContent).text, 'from B');

		channel.dispose();
	});

	test('emits onDidChangeTools when tool lists change', async () => {
		const mcpService = new TestMcpService();
		const channel = new McpGatewayToolBrokerChannel(mcpService);
		const server = createServer('collectionA', 'serverA', [
			createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] })),
		]);

		mcpService.servers.set([server], undefined);

		let events = 0;
		const disposable = channel.listen<void>(undefined, 'onDidChangeTools')(() => {
			events++;
		});

		server.toolsValue.set([
			createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] })),
			createTool('echo2', async () => ({ content: [{ type: 'text', text: 'A2' }] })),
		], undefined);

		assert.ok(events >= 1);

		disposable.dispose();
		channel.dispose();
	});

	test('does not start server when cache state is live', async () => {
		const mcpService = new TestMcpService();
		const channel = new McpGatewayToolBrokerChannel(mcpService);

		const server = createServer(
			'collectionA',
			'serverA',
			[createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] }))],
			McpServerCacheState.Live,
		);

		mcpService.servers.set([server], undefined);
		await channel.call<readonly MCP.Tool[]>(undefined, 'listTools');

		assert.strictEqual(server.startCalls, 0);
		channel.dispose();
	});

	test('starts server when cache state is unknown', async () => {
		const mcpService = new TestMcpService();
		const channel = new McpGatewayToolBrokerChannel(mcpService);

		const server = createServer(
			'collectionA',
			'serverA',
			[createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] }))],
			McpServerCacheState.Unknown,
		);

		mcpService.servers.set([server], undefined);
		await channel.call<readonly MCP.Tool[]>(undefined, 'listTools');

		assert.strictEqual(server.startCalls, 1);
		channel.dispose();
	});
});

function createServer(
	collectionId: string,
	definitionId: string,
	initialTools: readonly IMcpTool[],
	initialCacheState: McpServerCacheState = McpServerCacheState.Live,
): IMcpServer & { toolsValue: ReturnType<typeof observableValue<readonly IMcpTool[]>>; startCalls: number } {
	const owner = {};
	const tools = observableValue<readonly IMcpTool[]>(owner, initialTools);
	const connectionState = observableValue<McpConnectionState>(owner, { state: McpConnectionState.Kind.Running });
	const cacheState = observableValue<McpServerCacheState>(owner, initialCacheState);
	let startCalls = 0;

	return {
		collection: { id: collectionId, label: collectionId },
		definition: { id: definitionId, label: definitionId },
		connection: observableValue(owner, undefined),
		connectionState,
		serverMetadata: observableValue(owner, undefined),
		readDefinitions: () => observableValue(owner, { server: undefined, collection: undefined }),
		showOutput: async () => { },
		start: async () => {
			startCalls++;
			cacheState.set(McpServerCacheState.Live, undefined);
			return { state: McpConnectionState.Kind.Running };
		},
		stop: async () => { },
		cacheState,
		tools,
		prompts: observableValue(owner, []),
		capabilities: observableValue(owner, undefined),
		resources: () => (async function* () { })(),
		resourceTemplates: async () => [],
		dispose: () => { },
		toolsValue: tools,
		get startCalls() { return startCalls; },
	};
}

function createTool(name: string, call: (params: Record<string, unknown>) => Promise<MCP.CallToolResult>, visibility: McpToolVisibility = McpToolVisibility.Model): IMcpTool {
	const definition: MCP.Tool = {
		name,
		description: `Tool ${name}`,
		inputSchema: {
			type: 'object',
			properties: {
				input: { type: 'string' },
			},
		},
	};

	return {
		id: `tool_${name}`,
		referenceName: name,
		icons: {} as IMcpIcons,
		definition,
		visibility,
		uiResourceUri: undefined,
		call: (params: Record<string, unknown>, _context, _token) => call(params),
		callWithProgress: (params: Record<string, unknown>, _progress, _context, _token = CancellationToken.None) => call(params),
	};
}
