/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { URI } from '../../../../../base/common/uri.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { ContributionEnablementState } from '../../../chat/common/enablement.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { IMcpGatewayServerDescriptor } from '../../../../../platform/mcp/common/mcpGateway.js';
import { MCP } from '../../common/modelContextProtocol.js';
import { McpGatewayToolBrokerChannel } from '../../common/mcpGatewayToolBrokerChannel.js';
import { IMcpIcons, IMcpServer, IMcpTool, IMcpToolCallContext, McpConnectionState, McpServerCacheState, McpToolVisibility } from '../../common/mcpTypes.js';
import { TestMcpService } from './testMcpService.js';

suite('McpGatewayToolBrokerChannel', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('lists model-visible tools for a specific server', async () => {
		const mcpService = new TestMcpService();
		const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());

		const serverA = createServer('collectionA', 'serverA', [
			createTool('mcp_serverA_echo', async () => ({ content: [{ type: 'text', text: 'A' }] })),
			createTool('app-only', async () => ({ content: [{ type: 'text', text: 'A2' }] }), McpToolVisibility.App),
		]);
		const serverB = createServer('collectionB', 'serverB', [
			createTool('mcp_serverB_echo', async () => ({ content: [{ type: 'text', text: 'B' }] })),
		]);

		mcpService.servers.set([serverA, serverB], undefined);

		const resultA = await channel.call<readonly MCP.Tool[]>(undefined, 'listToolsForServer', { serverId: 'serverA' });
		assert.deepStrictEqual(resultA.map(t => t.name), ['mcp_serverA_echo']);

		const resultB = await channel.call<readonly MCP.Tool[]>(undefined, 'listToolsForServer', { serverId: 'serverB' });
		assert.deepStrictEqual(resultB.map(t => t.name), ['mcp_serverB_echo']);

		channel.dispose();
	});

	test('routes tool calls to specific server', async () => {
		const mcpService = new TestMcpService();
		const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());

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

		const resultA = await channel.call<MCP.CallToolResult>(undefined, 'callToolForServer', {
			serverId: 'serverA',
			name: 'mcp_serverA_echo',
			args: { name: 'one' },
		});
		const resultB = await channel.call<MCP.CallToolResult>(undefined, 'callToolForServer', {
			serverId: 'serverB',
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
		const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
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
		const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());

		const server = createServer(
			'collectionA',
			'serverA',
			[createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] }))],
			McpServerCacheState.Live,
		);

		mcpService.servers.set([server], undefined);
		await channel.call<readonly MCP.Tool[]>(undefined, 'listToolsForServer', { serverId: 'serverA' });

		assert.strictEqual(server.startCalls, 0);
		channel.dispose();
	});

	test('starts server when cache state is unknown', async () => {
		const mcpService = new TestMcpService();
		const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());

		const server = createServer(
			'collectionA',
			'serverA',
			[createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] }))],
			McpServerCacheState.Unknown,
		);

		mcpService.servers.set([server], undefined);
		const tools = await channel.call<readonly MCP.Tool[]>(undefined, 'listToolsForServer', { serverId: 'serverA' });

		// Server started during the grace period; tools are now available.
		assert.strictEqual(server.startCalls, 1);
		assert.deepStrictEqual(tools.map(t => t.name), ['echo']);
		channel.dispose();
	});

	test('starts server and waits within grace period when cache state is outdated', async () => {
		const mcpService = new TestMcpService();
		const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());

		const server = createServer(
			'collectionA',
			'serverA',
			[createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] }))],
			McpServerCacheState.Outdated,
		);

		mcpService.servers.set([server], undefined);
		const tools = await channel.call<readonly MCP.Tool[]>(undefined, 'listToolsForServer', { serverId: 'serverA' });

		// Outdated server gets the same grace period as Unknown — started and tools returned.
		assert.strictEqual(server.startCalls, 1);
		assert.deepStrictEqual(tools.map(t => t.name), ['echo']);
		channel.dispose();
	});

	test('returns empty tools and does not re-wait if server does not start within grace period', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const mcpService = new TestMcpService();
			const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService(), 100);

			const server = createNeverStartingServer(
				'collectionA',
				'serverA',
				[createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] }))],
			);

			mcpService.servers.set([server], undefined);

			// First call: waits up to the grace period, server never starts → empty result.
			const tools = await channel.call<readonly MCP.Tool[]>(undefined, 'listToolsForServer', { serverId: 'serverA' });
			assert.deepStrictEqual(tools, []);

			// Second call: grace-period promise already resolved; returns immediately without re-waiting.
			const tools2 = await channel.call<readonly MCP.Tool[]>(undefined, 'listToolsForServer', { serverId: 'serverA' });
			assert.deepStrictEqual(tools2, []);

			channel.dispose();
		});
	});

	test('invalidates stale grace entry when cacheState regresses to Unknown after timeout', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const mcpService = new TestMcpService();
			const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService(), 100);

			const server = createNeverStartingServer(
				'collectionA',
				'serverA',
				[createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] }))],
			);

			mcpService.servers.set([server], undefined);

			// First call: grace period elapses, server never starts → empty.
			const tools1 = await channel.call<readonly MCP.Tool[]>(undefined, 'listToolsForServer', { serverId: 'serverA' });
			assert.deepStrictEqual(tools1, []);
			assert.strictEqual(server.startCalls, 1);

			// Simulate a cache reset: server goes back to Unknown.
			server.cacheStateValue.set(McpServerCacheState.Unknown, undefined);

			// Make the server succeed this time.
			server.startBehavior = 'succeed';

			// Second call: stale grace entry should be discarded, a new grace race starts,
			// and the server successfully starts → tools returned.
			const tools2 = await channel.call<readonly MCP.Tool[]>(undefined, 'listToolsForServer', { serverId: 'serverA' });
			assert.deepStrictEqual(tools2.map(t => t.name), ['echo']);
			assert.strictEqual(server.startCalls, 2);

			channel.dispose();
		});
	});

	test('does not invalidate grace entry when cacheState is not Unknown/Outdated', () => {
		return runWithFakedTimers({ useFakeTimers: true }, async () => {
			const mcpService = new TestMcpService();
			const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService(), 100);

			const server = createServer(
				'collectionA',
				'serverA',
				[createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] }))],
				McpServerCacheState.Unknown,
			);

			mcpService.servers.set([server], undefined);

			// First call: server starts successfully during grace period.
			const tools1 = await channel.call<readonly MCP.Tool[]>(undefined, 'listToolsForServer', { serverId: 'serverA' });
			assert.deepStrictEqual(tools1.map(t => t.name), ['echo']);
			assert.strictEqual(server.startCalls, 1);

			// Second call: cacheState is now Live (server started), grace entry should NOT
			// be invalidated, so no additional start call is made.
			const tools2 = await channel.call<readonly MCP.Tool[]>(undefined, 'listToolsForServer', { serverId: 'serverA' });
			assert.deepStrictEqual(tools2.map(t => t.name), ['echo']);
			assert.strictEqual(server.startCalls, 1);

			channel.dispose();
		});
	});

	test('listServers returns all servers regardless of cache state', async () => {
		const mcpService = new TestMcpService();
		const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());

		const liveServer = createServer('collectionA', 'serverA', [], McpServerCacheState.Live);
		const unknownServer = createServer('collectionB', 'serverB', [], McpServerCacheState.Unknown);

		mcpService.servers.set([liveServer, unknownServer], undefined);

		const servers = await channel.call<readonly IMcpGatewayServerDescriptor[]>(undefined, 'listServers');
		assert.deepStrictEqual(servers, [
			{ id: 'serverA', label: 'serverA' },
			{ id: 'serverB', label: 'serverB' },
		]);

		channel.dispose();
	});

	test('forwards chatSessionResource as tool call context', async () => {
		const mcpService = new TestMcpService();
		const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());

		const receivedContexts: (IMcpToolCallContext | undefined)[] = [];
		const server = createServer('collectionA', 'serverA', [
			createToolWithContextCapture('echo', receivedContexts, async () => ({ content: [{ type: 'text', text: 'ok' }] })),
		]);

		mcpService.servers.set([server], undefined);

		const sessionUri = 'vscode-chat-session://test/session-123';
		await channel.call<MCP.CallToolResult>(undefined, 'callToolForServer', {
			serverId: 'serverA',
			name: 'echo',
			args: { input: 'hello' },
			chatSessionResource: sessionUri,
		});

		assert.strictEqual(receivedContexts.length, 1);
		assert.ok(receivedContexts[0]);
		assert.strictEqual(receivedContexts[0]!.chatSessionResource!.toString(), URI.parse(sessionUri).toString());

		channel.dispose();
	});

	test('passes undefined context when chatSessionResource is omitted', async () => {
		const mcpService = new TestMcpService();
		const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());

		const receivedContexts: (IMcpToolCallContext | undefined)[] = [];
		const server = createServer('collectionA', 'serverA', [
			createToolWithContextCapture('echo', receivedContexts, async () => ({ content: [{ type: 'text', text: 'ok' }] })),
		]);

		mcpService.servers.set([server], undefined);

		await channel.call<MCP.CallToolResult>(undefined, 'callToolForServer', {
			serverId: 'serverA',
			name: 'echo',
			args: { input: 'hello' },
		});

		assert.strictEqual(receivedContexts.length, 1);
		assert.strictEqual(receivedContexts[0], undefined);

		channel.dispose();
	});

	test('emits onDidChangeServers with descriptors when servers change', () => {
		const mcpService = new TestMcpService();
		const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
		const serverA = createServer('collectionA', 'serverA', []);

		mcpService.servers.set([serverA], undefined);

		const received: (readonly IMcpGatewayServerDescriptor[])[] = [];
		const disposable = channel.listen<readonly IMcpGatewayServerDescriptor[]>(undefined, 'onDidChangeServers')(e => {
			received.push(e);
		});

		// Add a second server
		const serverB = createServer('collectionB', 'serverB', []);
		mcpService.servers.set([serverA, serverB], undefined);

		assert.strictEqual(received.length, 1);
		assert.deepStrictEqual(received[0], [
			{ id: 'serverA', label: 'serverA' },
			{ id: 'serverB', label: 'serverB' },
		]);

		// Remove the first server
		mcpService.servers.set([serverB], undefined);

		assert.strictEqual(received.length, 2);
		assert.deepStrictEqual(received[1], [
			{ id: 'serverB', label: 'serverB' },
		]);

		disposable.dispose();
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
		collection: { id: collectionId, label: collectionId, order: 0 },
		definition: { id: definitionId, label: definitionId },
		connection: observableValue(owner, undefined),
		connectionState,
		enablement: observableValue(owner, ContributionEnablementState.EnabledProfile),
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

function createNeverStartingServer(
	collectionId: string,
	definitionId: string,
	initialTools: readonly IMcpTool[],
): IMcpServer & { startCalls: number; startBehavior: 'hang' | 'succeed'; cacheStateValue: ReturnType<typeof observableValue<McpServerCacheState>> } {
	const owner = {};
	const tools = observableValue<readonly IMcpTool[]>(owner, initialTools);
	const connectionState = observableValue<McpConnectionState>(owner, { state: McpConnectionState.Kind.Running });
	const cacheState = observableValue<McpServerCacheState>(owner, McpServerCacheState.Unknown);
	let startCalls = 0;
	let startBehavior: 'hang' | 'succeed' = 'hang';

	const result: IMcpServer & { startCalls: number; startBehavior: 'hang' | 'succeed'; cacheStateValue: ReturnType<typeof observableValue<McpServerCacheState>> } = {
		collection: { id: collectionId, label: collectionId, order: 0 },
		definition: { id: definitionId, label: definitionId },
		connection: observableValue(owner, undefined),
		connectionState,
		enablement: observableValue(owner, ContributionEnablementState.EnabledProfile),
		serverMetadata: observableValue(owner, undefined),
		readDefinitions: () => observableValue(owner, { server: undefined, collection: undefined }),
		showOutput: async () => { },
		start: async () => {
			startCalls++;
			if (result.startBehavior === 'succeed') {
				cacheState.set(McpServerCacheState.Live, undefined);
				return { state: McpConnectionState.Kind.Running };
			}
			// Never resolves — simulates a server that hangs on startup.
			return new Promise<McpConnectionState>(() => { });
		},
		stop: async () => { },
		cacheState,
		tools,
		prompts: observableValue(owner, []),
		capabilities: observableValue(owner, undefined),
		resources: () => (async function* () { })(),
		resourceTemplates: async () => [],
		dispose: () => { },
		get startCalls() { return startCalls; },
		get startBehavior() { return startBehavior; },
		set startBehavior(v) { startBehavior = v; },
		cacheStateValue: cacheState,
	};
	return result;
}

function createToolWithContextCapture(
	name: string,
	receivedContexts: (IMcpToolCallContext | undefined)[],
	call: (params: Record<string, unknown>) => Promise<MCP.CallToolResult>,
	visibility: McpToolVisibility = McpToolVisibility.Model,
): IMcpTool {
	const definition: MCP.Tool = {
		name,
		description: `Tool ${name}`,
		inputSchema: { type: 'object', properties: { input: { type: 'string' } } },
	};

	return {
		id: `tool_${name}`,
		referenceName: name,
		icons: {} as IMcpIcons,
		definition,
		visibility,
		uiResourceUri: undefined,
		call: (params: Record<string, unknown>, context, _token) => {
			receivedContexts.push(context);
			return call(params);
		},
		callWithProgress: (params: Record<string, unknown>, _progress, context, _token = CancellationToken.None) => {
			receivedContexts.push(context);
			return call(params);
		},
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
