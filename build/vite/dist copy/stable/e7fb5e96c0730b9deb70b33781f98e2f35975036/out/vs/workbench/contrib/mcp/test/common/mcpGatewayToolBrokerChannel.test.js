/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import assert from 'assert';
import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { observableValue } from '../../../../../base/common/observable.js';
import { runWithFakedTimers } from '../../../../../base/test/common/timeTravelScheduler.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { NullLogService } from '../../../../../platform/log/common/log.js';
import { McpGatewayToolBrokerChannel } from '../../common/mcpGatewayToolBrokerChannel.js';
import { TestMcpService } from './testMcpService.js';
suite('McpGatewayToolBrokerChannel', () => {
    ensureNoDisposablesAreLeakedInTestSuite();
    test('lists model-visible tools for a specific server', async () => {
        const mcpService = new TestMcpService();
        const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
        const serverA = createServer('collectionA', 'serverA', [
            createTool('mcp_serverA_echo', async () => ({ content: [{ type: 'text', text: 'A' }] })),
            createTool('app-only', async () => ({ content: [{ type: 'text', text: 'A2' }] }), 2 /* McpToolVisibility.App */),
        ]);
        const serverB = createServer('collectionB', 'serverB', [
            createTool('mcp_serverB_echo', async () => ({ content: [{ type: 'text', text: 'B' }] })),
        ]);
        mcpService.servers.set([serverA, serverB], undefined);
        const resultA = await channel.call(undefined, 'listToolsForServer', { serverId: 'serverA' });
        assert.deepStrictEqual(resultA.map(t => t.name), ['mcp_serverA_echo']);
        const resultB = await channel.call(undefined, 'listToolsForServer', { serverId: 'serverB' });
        assert.deepStrictEqual(resultB.map(t => t.name), ['mcp_serverB_echo']);
        channel.dispose();
    });
    test('routes tool calls to specific server', async () => {
        const mcpService = new TestMcpService();
        const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
        const invoked = [];
        const serverA = createServer('collectionA', 'serverA', [
            createTool('mcp_serverA_echo', async (args) => {
                invoked.push(`A:${String(args.name)}`);
                return { content: [{ type: 'text', text: 'from A' }] };
            }),
        ]);
        const serverB = createServer('collectionB', 'serverB', [
            createTool('mcp_serverB_echo', async (args) => {
                invoked.push(`B:${String(args.name)}`);
                return { content: [{ type: 'text', text: 'from B' }] };
            }),
        ]);
        mcpService.servers.set([serverA, serverB], undefined);
        const resultA = await channel.call(undefined, 'callToolForServer', {
            serverId: 'serverA',
            name: 'mcp_serverA_echo',
            args: { name: 'one' },
        });
        const resultB = await channel.call(undefined, 'callToolForServer', {
            serverId: 'serverB',
            name: 'mcp_serverB_echo',
            args: { name: 'two' },
        });
        assert.deepStrictEqual(invoked, ['A:one', 'B:two']);
        assert.strictEqual(resultA.content[0].text, 'from A');
        assert.strictEqual(resultB.content[0].text, 'from B');
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
        const disposable = channel.listen(undefined, 'onDidChangeTools')(() => {
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
        const server = createServer('collectionA', 'serverA', [createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] }))], 5 /* McpServerCacheState.Live */);
        mcpService.servers.set([server], undefined);
        await channel.call(undefined, 'listToolsForServer', { serverId: 'serverA' });
        assert.strictEqual(server.startCalls, 0);
        channel.dispose();
    });
    test('starts server when cache state is unknown', async () => {
        const mcpService = new TestMcpService();
        const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
        const server = createServer('collectionA', 'serverA', [createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] }))], 0 /* McpServerCacheState.Unknown */);
        mcpService.servers.set([server], undefined);
        const tools = await channel.call(undefined, 'listToolsForServer', { serverId: 'serverA' });
        // Server started during the grace period; tools are now available.
        assert.strictEqual(server.startCalls, 1);
        assert.deepStrictEqual(tools.map(t => t.name), ['echo']);
        channel.dispose();
    });
    test('starts server and waits within grace period when cache state is outdated', async () => {
        const mcpService = new TestMcpService();
        const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
        const server = createServer('collectionA', 'serverA', [createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] }))], 2 /* McpServerCacheState.Outdated */);
        mcpService.servers.set([server], undefined);
        const tools = await channel.call(undefined, 'listToolsForServer', { serverId: 'serverA' });
        // Outdated server gets the same grace period as Unknown — started and tools returned.
        assert.strictEqual(server.startCalls, 1);
        assert.deepStrictEqual(tools.map(t => t.name), ['echo']);
        channel.dispose();
    });
    test('returns empty tools and does not re-wait if server does not start within grace period', () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            const mcpService = new TestMcpService();
            const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService(), 100);
            const server = createNeverStartingServer('collectionA', 'serverA', [createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] }))]);
            mcpService.servers.set([server], undefined);
            // First call: waits up to the grace period, server never starts → empty result.
            const tools = await channel.call(undefined, 'listToolsForServer', { serverId: 'serverA' });
            assert.deepStrictEqual(tools, []);
            // Second call: grace-period promise already resolved; returns immediately without re-waiting.
            const tools2 = await channel.call(undefined, 'listToolsForServer', { serverId: 'serverA' });
            assert.deepStrictEqual(tools2, []);
            channel.dispose();
        });
    });
    test('invalidates stale grace entry when cacheState regresses to Unknown after timeout', () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            const mcpService = new TestMcpService();
            const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService(), 100);
            const server = createNeverStartingServer('collectionA', 'serverA', [createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] }))]);
            mcpService.servers.set([server], undefined);
            // First call: grace period elapses, server never starts → empty.
            const tools1 = await channel.call(undefined, 'listToolsForServer', { serverId: 'serverA' });
            assert.deepStrictEqual(tools1, []);
            assert.strictEqual(server.startCalls, 1);
            // Simulate a cache reset: server goes back to Unknown.
            server.cacheStateValue.set(0 /* McpServerCacheState.Unknown */, undefined);
            // Make the server succeed this time.
            server.startBehavior = 'succeed';
            // Second call: stale grace entry should be discarded, a new grace race starts,
            // and the server successfully starts → tools returned.
            const tools2 = await channel.call(undefined, 'listToolsForServer', { serverId: 'serverA' });
            assert.deepStrictEqual(tools2.map(t => t.name), ['echo']);
            assert.strictEqual(server.startCalls, 2);
            channel.dispose();
        });
    });
    test('does not invalidate grace entry when cacheState is not Unknown/Outdated', () => {
        return runWithFakedTimers({ useFakeTimers: true }, async () => {
            const mcpService = new TestMcpService();
            const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService(), 100);
            const server = createServer('collectionA', 'serverA', [createTool('echo', async () => ({ content: [{ type: 'text', text: 'A' }] }))], 0 /* McpServerCacheState.Unknown */);
            mcpService.servers.set([server], undefined);
            // First call: server starts successfully during grace period.
            const tools1 = await channel.call(undefined, 'listToolsForServer', { serverId: 'serverA' });
            assert.deepStrictEqual(tools1.map(t => t.name), ['echo']);
            assert.strictEqual(server.startCalls, 1);
            // Second call: cacheState is now Live (server started), grace entry should NOT
            // be invalidated, so no additional start call is made.
            const tools2 = await channel.call(undefined, 'listToolsForServer', { serverId: 'serverA' });
            assert.deepStrictEqual(tools2.map(t => t.name), ['echo']);
            assert.strictEqual(server.startCalls, 1);
            channel.dispose();
        });
    });
    test('listServers returns all servers regardless of cache state', async () => {
        const mcpService = new TestMcpService();
        const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
        const liveServer = createServer('collectionA', 'serverA', [], 5 /* McpServerCacheState.Live */);
        const unknownServer = createServer('collectionB', 'serverB', [], 0 /* McpServerCacheState.Unknown */);
        mcpService.servers.set([liveServer, unknownServer], undefined);
        const servers = await channel.call(undefined, 'listServers');
        assert.deepStrictEqual(servers, [
            { id: 'serverA', label: 'serverA' },
            { id: 'serverB', label: 'serverB' },
        ]);
        channel.dispose();
    });
    test('emits onDidChangeServers with descriptors when servers change', () => {
        const mcpService = new TestMcpService();
        const channel = new McpGatewayToolBrokerChannel(mcpService, new NullLogService());
        const serverA = createServer('collectionA', 'serverA', []);
        mcpService.servers.set([serverA], undefined);
        const received = [];
        const disposable = channel.listen(undefined, 'onDidChangeServers')(e => {
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
function createServer(collectionId, definitionId, initialTools, initialCacheState = 5 /* McpServerCacheState.Live */) {
    const owner = {};
    const tools = observableValue(owner, initialTools);
    const connectionState = observableValue(owner, { state: 2 /* McpConnectionState.Kind.Running */ });
    const cacheState = observableValue(owner, initialCacheState);
    let startCalls = 0;
    return {
        collection: { id: collectionId, label: collectionId },
        definition: { id: definitionId, label: definitionId },
        connection: observableValue(owner, undefined),
        connectionState,
        enablement: observableValue(owner, 2 /* ContributionEnablementState.EnabledProfile */),
        serverMetadata: observableValue(owner, undefined),
        readDefinitions: () => observableValue(owner, { server: undefined, collection: undefined }),
        showOutput: async () => { },
        start: async () => {
            startCalls++;
            cacheState.set(5 /* McpServerCacheState.Live */, undefined);
            return { state: 2 /* McpConnectionState.Kind.Running */ };
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
function createNeverStartingServer(collectionId, definitionId, initialTools) {
    const owner = {};
    const tools = observableValue(owner, initialTools);
    const connectionState = observableValue(owner, { state: 2 /* McpConnectionState.Kind.Running */ });
    const cacheState = observableValue(owner, 0 /* McpServerCacheState.Unknown */);
    let startCalls = 0;
    let startBehavior = 'hang';
    const result = {
        collection: { id: collectionId, label: collectionId },
        definition: { id: definitionId, label: definitionId },
        connection: observableValue(owner, undefined),
        connectionState,
        enablement: observableValue(owner, 2 /* ContributionEnablementState.EnabledProfile */),
        serverMetadata: observableValue(owner, undefined),
        readDefinitions: () => observableValue(owner, { server: undefined, collection: undefined }),
        showOutput: async () => { },
        start: async () => {
            startCalls++;
            if (result.startBehavior === 'succeed') {
                cacheState.set(5 /* McpServerCacheState.Live */, undefined);
                return { state: 2 /* McpConnectionState.Kind.Running */ };
            }
            // Never resolves — simulates a server that hangs on startup.
            return new Promise(() => { });
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
function createTool(name, call, visibility = 1 /* McpToolVisibility.Model */) {
    const definition = {
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
        icons: {},
        definition,
        visibility,
        uiResourceUri: undefined,
        call: (params, _context, _token) => call(params),
        callWithProgress: (params, _progress, _context, _token = CancellationToken.None) => call(params),
    };
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoibWNwR2F0ZXdheVRvb2xCcm9rZXJDaGFubmVsLnRlc3QuanMiLCJzb3VyY2VSb290IjoiZmlsZTovLy9ob21lL2Evd2ViY29kZS5ob3N0L3ZzY29kZS9zcmMvIiwic291cmNlcyI6WyJ2cy93b3JrYmVuY2gvY29udHJpYi9tY3AvdGVzdC9jb21tb24vbWNwR2F0ZXdheVRvb2xCcm9rZXJDaGFubmVsLnRlc3QudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxNQUFNLE1BQU0sUUFBUSxDQUFDO0FBQzVCLE9BQU8sRUFBRSxpQkFBaUIsRUFBRSxNQUFNLDRDQUE0QyxDQUFDO0FBQy9FLE9BQU8sRUFBRSxlQUFlLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUMzRSxPQUFPLEVBQUUsa0JBQWtCLEVBQUUsTUFBTSx3REFBd0QsQ0FBQztBQUM1RixPQUFPLEVBQUUsdUNBQXVDLEVBQUUsTUFBTSwwQ0FBMEMsQ0FBQztBQUVuRyxPQUFPLEVBQUUsY0FBYyxFQUFFLE1BQU0sMkNBQTJDLENBQUM7QUFHM0UsT0FBTyxFQUFFLDJCQUEyQixFQUFFLE1BQU0sNkNBQTZDLENBQUM7QUFFMUYsT0FBTyxFQUFFLGNBQWMsRUFBRSxNQUFNLHFCQUFxQixDQUFDO0FBRXJELEtBQUssQ0FBQyw2QkFBNkIsRUFBRSxHQUFHLEVBQUU7SUFDekMsdUNBQXVDLEVBQUUsQ0FBQztJQUUxQyxJQUFJLENBQUMsaURBQWlELEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDbEUsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUN4QyxNQUFNLE9BQU8sR0FBRyxJQUFJLDJCQUEyQixDQUFDLFVBQVUsRUFBRSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFFbEYsTUFBTSxPQUFPLEdBQUcsWUFBWSxDQUFDLGFBQWEsRUFBRSxTQUFTLEVBQUU7WUFDdEQsVUFBVSxDQUFDLGtCQUFrQixFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDeEYsVUFBVSxDQUFDLFVBQVUsRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQyxnQ0FBd0I7U0FDeEcsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxPQUFPLEdBQUcsWUFBWSxDQUFDLGFBQWEsRUFBRSxTQUFTLEVBQUU7WUFDdEQsVUFBVSxDQUFDLGtCQUFrQixFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7U0FDeEYsQ0FBQyxDQUFDO1FBRUgsVUFBVSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxPQUFPLEVBQUUsT0FBTyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFdEQsTUFBTSxPQUFPLEdBQUcsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFzQixTQUFTLEVBQUUsb0JBQW9CLEVBQUUsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUNsSCxNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7UUFFdkUsTUFBTSxPQUFPLEdBQUcsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFzQixTQUFTLEVBQUUsb0JBQW9CLEVBQUUsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUNsSCxNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxrQkFBa0IsQ0FBQyxDQUFDLENBQUM7UUFFdkUsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ25CLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHNDQUFzQyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ3ZELE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7UUFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSwyQkFBMkIsQ0FBQyxVQUFVLEVBQUUsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBRWxGLE1BQU0sT0FBTyxHQUFhLEVBQUUsQ0FBQztRQUM3QixNQUFNLE9BQU8sR0FBRyxZQUFZLENBQUMsYUFBYSxFQUFFLFNBQVMsRUFBRTtZQUN0RCxVQUFVLENBQUMsa0JBQWtCLEVBQUUsS0FBSyxFQUFDLElBQUksRUFBQyxFQUFFO2dCQUMzQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3ZDLE9BQU8sRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUN4RCxDQUFDLENBQUM7U0FDRixDQUFDLENBQUM7UUFDSCxNQUFNLE9BQU8sR0FBRyxZQUFZLENBQUMsYUFBYSxFQUFFLFNBQVMsRUFBRTtZQUN0RCxVQUFVLENBQUMsa0JBQWtCLEVBQUUsS0FBSyxFQUFDLElBQUksRUFBQyxFQUFFO2dCQUMzQyxPQUFPLENBQUMsSUFBSSxDQUFDLEtBQUssTUFBTSxDQUFDLElBQUksQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLENBQUM7Z0JBQ3ZDLE9BQU8sRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLFFBQVEsRUFBRSxDQUFDLEVBQUUsQ0FBQztZQUN4RCxDQUFDLENBQUM7U0FDRixDQUFDLENBQUM7UUFFSCxVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE9BQU8sRUFBRSxPQUFPLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUV0RCxNQUFNLE9BQU8sR0FBRyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQXFCLFNBQVMsRUFBRSxtQkFBbUIsRUFBRTtZQUN0RixRQUFRLEVBQUUsU0FBUztZQUNuQixJQUFJLEVBQUUsa0JBQWtCO1lBQ3hCLElBQUksRUFBRSxFQUFFLElBQUksRUFBRSxLQUFLLEVBQUU7U0FDckIsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxPQUFPLEdBQUcsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFxQixTQUFTLEVBQUUsbUJBQW1CLEVBQUU7WUFDdEYsUUFBUSxFQUFFLFNBQVM7WUFDbkIsSUFBSSxFQUFFLGtCQUFrQjtZQUN4QixJQUFJLEVBQUUsRUFBRSxJQUFJLEVBQUUsS0FBSyxFQUFFO1NBQ3JCLENBQUMsQ0FBQztRQUVILE1BQU0sQ0FBQyxlQUFlLENBQUMsT0FBTyxFQUFFLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxDQUFDLENBQUM7UUFDcEQsTUFBTSxDQUFDLFdBQVcsQ0FBRSxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBcUIsQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFDM0UsTUFBTSxDQUFDLFdBQVcsQ0FBRSxPQUFPLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBcUIsQ0FBQyxJQUFJLEVBQUUsUUFBUSxDQUFDLENBQUM7UUFFM0UsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ25CLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLCtDQUErQyxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2hFLE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7UUFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSwyQkFBMkIsQ0FBQyxVQUFVLEVBQUUsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sTUFBTSxHQUFHLFlBQVksQ0FBQyxhQUFhLEVBQUUsU0FBUyxFQUFFO1lBQ3JELFVBQVUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQztTQUM1RSxDQUFDLENBQUM7UUFFSCxVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRTVDLElBQUksTUFBTSxHQUFHLENBQUMsQ0FBQztRQUNmLE1BQU0sVUFBVSxHQUFHLE9BQU8sQ0FBQyxNQUFNLENBQU8sU0FBUyxFQUFFLGtCQUFrQixDQUFDLENBQUMsR0FBRyxFQUFFO1lBQzNFLE1BQU0sRUFBRSxDQUFDO1FBQ1YsQ0FBQyxDQUFDLENBQUM7UUFFSCxNQUFNLENBQUMsVUFBVSxDQUFDLEdBQUcsQ0FBQztZQUNyQixVQUFVLENBQUMsTUFBTSxFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUM7WUFDNUUsVUFBVSxDQUFDLE9BQU8sRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLElBQUksRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDO1NBQzlFLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFZCxNQUFNLENBQUMsRUFBRSxDQUFDLE1BQU0sSUFBSSxDQUFDLENBQUMsQ0FBQztRQUV2QixVQUFVLENBQUMsT0FBTyxFQUFFLENBQUM7UUFDckIsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ25CLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGdEQUFnRCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQ2pFLE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7UUFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSwyQkFBMkIsQ0FBQyxVQUFVLEVBQUUsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBRWxGLE1BQU0sTUFBTSxHQUFHLFlBQVksQ0FDMUIsYUFBYSxFQUNiLFNBQVMsRUFDVCxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLG1DQUU5RSxDQUFDO1FBRUYsVUFBVSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxNQUFNLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUM1QyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQXNCLFNBQVMsRUFBRSxvQkFBb0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1FBRWxHLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6QyxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbkIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsMkNBQTJDLEVBQUUsS0FBSyxJQUFJLEVBQUU7UUFDNUQsTUFBTSxVQUFVLEdBQUcsSUFBSSxjQUFjLEVBQUUsQ0FBQztRQUN4QyxNQUFNLE9BQU8sR0FBRyxJQUFJLDJCQUEyQixDQUFDLFVBQVUsRUFBRSxJQUFJLGNBQWMsRUFBRSxDQUFDLENBQUM7UUFFbEYsTUFBTSxNQUFNLEdBQUcsWUFBWSxDQUMxQixhQUFhLEVBQ2IsU0FBUyxFQUNULENBQUMsVUFBVSxDQUFDLE1BQU0sRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDLENBQUMsRUFBRSxPQUFPLEVBQUUsQ0FBQyxFQUFFLElBQUksRUFBRSxNQUFNLEVBQUUsSUFBSSxFQUFFLEdBQUcsRUFBRSxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsc0NBRTlFLENBQUM7UUFFRixVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBQzVDLE1BQU0sS0FBSyxHQUFHLE1BQU0sT0FBTyxDQUFDLElBQUksQ0FBc0IsU0FBUyxFQUFFLG9CQUFvQixFQUFFLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7UUFFaEgsbUVBQW1FO1FBQ25FLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN6QyxNQUFNLENBQUMsZUFBZSxDQUFDLEtBQUssQ0FBQyxHQUFHLENBQUMsQ0FBQyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUMsSUFBSSxDQUFDLEVBQUUsQ0FBQyxNQUFNLENBQUMsQ0FBQyxDQUFDO1FBQ3pELE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNuQixDQUFDLENBQUMsQ0FBQztJQUVILElBQUksQ0FBQywwRUFBMEUsRUFBRSxLQUFLLElBQUksRUFBRTtRQUMzRixNQUFNLFVBQVUsR0FBRyxJQUFJLGNBQWMsRUFBRSxDQUFDO1FBQ3hDLE1BQU0sT0FBTyxHQUFHLElBQUksMkJBQTJCLENBQUMsVUFBVSxFQUFFLElBQUksY0FBYyxFQUFFLENBQUMsQ0FBQztRQUVsRixNQUFNLE1BQU0sR0FBRyxZQUFZLENBQzFCLGFBQWEsRUFDYixTQUFTLEVBQ1QsQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyx1Q0FFOUUsQ0FBQztRQUVGLFVBQVUsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFDNUMsTUFBTSxLQUFLLEdBQUcsTUFBTSxPQUFPLENBQUMsSUFBSSxDQUFzQixTQUFTLEVBQUUsb0JBQW9CLEVBQUUsRUFBRSxRQUFRLEVBQUUsU0FBUyxFQUFFLENBQUMsQ0FBQztRQUVoSCxzRkFBc0Y7UUFDdEYsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO1FBQ3pDLE1BQU0sQ0FBQyxlQUFlLENBQUMsS0FBSyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7UUFDekQsT0FBTyxDQUFDLE9BQU8sRUFBRSxDQUFDO0lBQ25CLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHVGQUF1RixFQUFFLEdBQUcsRUFBRTtRQUNsRyxPQUFPLGtCQUFrQixDQUFDLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzdELE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSwyQkFBMkIsQ0FBQyxVQUFVLEVBQUUsSUFBSSxjQUFjLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUV2RixNQUFNLE1BQU0sR0FBRyx5QkFBeUIsQ0FDdkMsYUFBYSxFQUNiLFNBQVMsRUFDVCxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQzlFLENBQUM7WUFFRixVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBRTVDLGdGQUFnRjtZQUNoRixNQUFNLEtBQUssR0FBRyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQXNCLFNBQVMsRUFBRSxvQkFBb0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ2hILE1BQU0sQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBRWxDLDhGQUE4RjtZQUM5RixNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQXNCLFNBQVMsRUFBRSxvQkFBb0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ2pILE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBRW5DLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNuQixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLGtGQUFrRixFQUFFLEdBQUcsRUFBRTtRQUM3RixPQUFPLGtCQUFrQixDQUFDLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzdELE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSwyQkFBMkIsQ0FBQyxVQUFVLEVBQUUsSUFBSSxjQUFjLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUV2RixNQUFNLE1BQU0sR0FBRyx5QkFBeUIsQ0FDdkMsYUFBYSxFQUNiLFNBQVMsRUFDVCxDQUFDLFVBQVUsQ0FBQyxNQUFNLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQyxDQUFDLEVBQUUsT0FBTyxFQUFFLENBQUMsRUFBRSxJQUFJLEVBQUUsTUFBTSxFQUFFLElBQUksRUFBRSxHQUFHLEVBQUUsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLENBQzlFLENBQUM7WUFFRixVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLE1BQU0sQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1lBRTVDLGlFQUFpRTtZQUNqRSxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQXNCLFNBQVMsRUFBRSxvQkFBb0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ2pILE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxFQUFFLEVBQUUsQ0FBQyxDQUFDO1lBQ25DLE1BQU0sQ0FBQyxXQUFXLENBQUMsTUFBTSxDQUFDLFVBQVUsRUFBRSxDQUFDLENBQUMsQ0FBQztZQUV6Qyx1REFBdUQ7WUFDdkQsTUFBTSxDQUFDLGVBQWUsQ0FBQyxHQUFHLHNDQUE4QixTQUFTLENBQUMsQ0FBQztZQUVuRSxxQ0FBcUM7WUFDckMsTUFBTSxDQUFDLGFBQWEsR0FBRyxTQUFTLENBQUM7WUFFakMsK0VBQStFO1lBQy9FLHVEQUF1RDtZQUN2RCxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQXNCLFNBQVMsRUFBRSxvQkFBb0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ2pILE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDMUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRXpDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNuQixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLHlFQUF5RSxFQUFFLEdBQUcsRUFBRTtRQUNwRixPQUFPLGtCQUFrQixDQUFDLEVBQUUsYUFBYSxFQUFFLElBQUksRUFBRSxFQUFFLEtBQUssSUFBSSxFQUFFO1lBQzdELE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7WUFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSwyQkFBMkIsQ0FBQyxVQUFVLEVBQUUsSUFBSSxjQUFjLEVBQUUsRUFBRSxHQUFHLENBQUMsQ0FBQztZQUV2RixNQUFNLE1BQU0sR0FBRyxZQUFZLENBQzFCLGFBQWEsRUFDYixTQUFTLEVBQ1QsQ0FBQyxVQUFVLENBQUMsTUFBTSxFQUFFLEtBQUssSUFBSSxFQUFFLENBQUMsQ0FBQyxFQUFFLE9BQU8sRUFBRSxDQUFDLEVBQUUsSUFBSSxFQUFFLE1BQU0sRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxzQ0FFOUUsQ0FBQztZQUVGLFVBQVUsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsTUFBTSxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7WUFFNUMsOERBQThEO1lBQzlELE1BQU0sTUFBTSxHQUFHLE1BQU0sT0FBTyxDQUFDLElBQUksQ0FBc0IsU0FBUyxFQUFFLG9CQUFvQixFQUFFLEVBQUUsUUFBUSxFQUFFLFNBQVMsRUFBRSxDQUFDLENBQUM7WUFDakgsTUFBTSxDQUFDLGVBQWUsQ0FBQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsQ0FBQyxFQUFFLENBQUMsQ0FBQyxDQUFDLElBQUksQ0FBQyxFQUFFLENBQUMsTUFBTSxDQUFDLENBQUMsQ0FBQztZQUMxRCxNQUFNLENBQUMsV0FBVyxDQUFDLE1BQU0sQ0FBQyxVQUFVLEVBQUUsQ0FBQyxDQUFDLENBQUM7WUFFekMsK0VBQStFO1lBQy9FLHVEQUF1RDtZQUN2RCxNQUFNLE1BQU0sR0FBRyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQXNCLFNBQVMsRUFBRSxvQkFBb0IsRUFBRSxFQUFFLFFBQVEsRUFBRSxTQUFTLEVBQUUsQ0FBQyxDQUFDO1lBQ2pILE1BQU0sQ0FBQyxlQUFlLENBQUMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsRUFBRSxDQUFDLENBQUMsQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLE1BQU0sQ0FBQyxDQUFDLENBQUM7WUFDMUQsTUFBTSxDQUFDLFdBQVcsQ0FBQyxNQUFNLENBQUMsVUFBVSxFQUFFLENBQUMsQ0FBQyxDQUFDO1lBRXpDLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztRQUNuQixDQUFDLENBQUMsQ0FBQztJQUNKLENBQUMsQ0FBQyxDQUFDO0lBRUgsSUFBSSxDQUFDLDJEQUEyRCxFQUFFLEtBQUssSUFBSSxFQUFFO1FBQzVFLE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7UUFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSwyQkFBMkIsQ0FBQyxVQUFVLEVBQUUsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBRWxGLE1BQU0sVUFBVSxHQUFHLFlBQVksQ0FBQyxhQUFhLEVBQUUsU0FBUyxFQUFFLEVBQUUsbUNBQTJCLENBQUM7UUFDeEYsTUFBTSxhQUFhLEdBQUcsWUFBWSxDQUFDLGFBQWEsRUFBRSxTQUFTLEVBQUUsRUFBRSxzQ0FBOEIsQ0FBQztRQUU5RixVQUFVLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxDQUFDLFVBQVUsRUFBRSxhQUFhLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUUvRCxNQUFNLE9BQU8sR0FBRyxNQUFNLE9BQU8sQ0FBQyxJQUFJLENBQXlDLFNBQVMsRUFBRSxhQUFhLENBQUMsQ0FBQztRQUNyRyxNQUFNLENBQUMsZUFBZSxDQUFDLE9BQU8sRUFBRTtZQUMvQixFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRTtZQUNuQyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRTtTQUNuQyxDQUFDLENBQUM7UUFFSCxPQUFPLENBQUMsT0FBTyxFQUFFLENBQUM7SUFDbkIsQ0FBQyxDQUFDLENBQUM7SUFFSCxJQUFJLENBQUMsK0RBQStELEVBQUUsR0FBRyxFQUFFO1FBQzFFLE1BQU0sVUFBVSxHQUFHLElBQUksY0FBYyxFQUFFLENBQUM7UUFDeEMsTUFBTSxPQUFPLEdBQUcsSUFBSSwyQkFBMkIsQ0FBQyxVQUFVLEVBQUUsSUFBSSxjQUFjLEVBQUUsQ0FBQyxDQUFDO1FBQ2xGLE1BQU0sT0FBTyxHQUFHLFlBQVksQ0FBQyxhQUFhLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBRTNELFVBQVUsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLEVBQUUsU0FBUyxDQUFDLENBQUM7UUFFN0MsTUFBTSxRQUFRLEdBQStDLEVBQUUsQ0FBQztRQUNoRSxNQUFNLFVBQVUsR0FBRyxPQUFPLENBQUMsTUFBTSxDQUF5QyxTQUFTLEVBQUUsb0JBQW9CLENBQUMsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUM5RyxRQUFRLENBQUMsSUFBSSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2xCLENBQUMsQ0FBQyxDQUFDO1FBRUgsc0JBQXNCO1FBQ3RCLE1BQU0sT0FBTyxHQUFHLFlBQVksQ0FBQyxhQUFhLEVBQUUsU0FBUyxFQUFFLEVBQUUsQ0FBQyxDQUFDO1FBQzNELFVBQVUsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLENBQUMsT0FBTyxFQUFFLE9BQU8sQ0FBQyxFQUFFLFNBQVMsQ0FBQyxDQUFDO1FBRXRELE1BQU0sQ0FBQyxXQUFXLENBQUMsUUFBUSxDQUFDLE1BQU0sRUFBRSxDQUFDLENBQUMsQ0FBQztRQUN2QyxNQUFNLENBQUMsZUFBZSxDQUFDLFFBQVEsQ0FBQyxDQUFDLENBQUMsRUFBRTtZQUNuQyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRTtZQUNuQyxFQUFFLEVBQUUsRUFBRSxTQUFTLEVBQUUsS0FBSyxFQUFFLFNBQVMsRUFBRTtTQUNuQyxDQUFDLENBQUM7UUFFSCwwQkFBMEI7UUFDMUIsVUFBVSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsQ0FBQyxPQUFPLENBQUMsRUFBRSxTQUFTLENBQUMsQ0FBQztRQUU3QyxNQUFNLENBQUMsV0FBVyxDQUFDLFFBQVEsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDdkMsTUFBTSxDQUFDLGVBQWUsQ0FBQyxRQUFRLENBQUMsQ0FBQyxDQUFDLEVBQUU7WUFDbkMsRUFBRSxFQUFFLEVBQUUsU0FBUyxFQUFFLEtBQUssRUFBRSxTQUFTLEVBQUU7U0FDbkMsQ0FBQyxDQUFDO1FBRUgsVUFBVSxDQUFDLE9BQU8sRUFBRSxDQUFDO1FBQ3JCLE9BQU8sQ0FBQyxPQUFPLEVBQUUsQ0FBQztJQUNuQixDQUFDLENBQUMsQ0FBQztBQUNKLENBQUMsQ0FBQyxDQUFDO0FBRUgsU0FBUyxZQUFZLENBQ3BCLFlBQW9CLEVBQ3BCLFlBQW9CLEVBQ3BCLFlBQWlDLEVBQ2pDLG9EQUFpRTtJQUVqRSxNQUFNLEtBQUssR0FBRyxFQUFFLENBQUM7SUFDakIsTUFBTSxLQUFLLEdBQUcsZUFBZSxDQUFzQixLQUFLLEVBQUUsWUFBWSxDQUFDLENBQUM7SUFDeEUsTUFBTSxlQUFlLEdBQUcsZUFBZSxDQUFxQixLQUFLLEVBQUUsRUFBRSxLQUFLLHlDQUFpQyxFQUFFLENBQUMsQ0FBQztJQUMvRyxNQUFNLFVBQVUsR0FBRyxlQUFlLENBQXNCLEtBQUssRUFBRSxpQkFBaUIsQ0FBQyxDQUFDO0lBQ2xGLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztJQUVuQixPQUFPO1FBQ04sVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFO1FBQ3JELFVBQVUsRUFBRSxFQUFFLEVBQUUsRUFBRSxZQUFZLEVBQUUsS0FBSyxFQUFFLFlBQVksRUFBRTtRQUNyRCxVQUFVLEVBQUUsZUFBZSxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUM7UUFDN0MsZUFBZTtRQUNmLFVBQVUsRUFBRSxlQUFlLENBQUMsS0FBSyxxREFBNkM7UUFDOUUsY0FBYyxFQUFFLGVBQWUsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDO1FBQ2pELGVBQWUsRUFBRSxHQUFHLEVBQUUsQ0FBQyxlQUFlLENBQUMsS0FBSyxFQUFFLEVBQUUsTUFBTSxFQUFFLFNBQVMsRUFBRSxVQUFVLEVBQUUsU0FBUyxFQUFFLENBQUM7UUFDM0YsVUFBVSxFQUFFLEtBQUssSUFBSSxFQUFFLEdBQUcsQ0FBQztRQUMzQixLQUFLLEVBQUUsS0FBSyxJQUFJLEVBQUU7WUFDakIsVUFBVSxFQUFFLENBQUM7WUFDYixVQUFVLENBQUMsR0FBRyxtQ0FBMkIsU0FBUyxDQUFDLENBQUM7WUFDcEQsT0FBTyxFQUFFLEtBQUsseUNBQWlDLEVBQUUsQ0FBQztRQUNuRCxDQUFDO1FBQ0QsSUFBSSxFQUFFLEtBQUssSUFBSSxFQUFFLEdBQUcsQ0FBQztRQUNyQixVQUFVO1FBQ1YsS0FBSztRQUNMLE9BQU8sRUFBRSxlQUFlLENBQUMsS0FBSyxFQUFFLEVBQUUsQ0FBQztRQUNuQyxZQUFZLEVBQUUsZUFBZSxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUM7UUFDL0MsU0FBUyxFQUFFLEdBQUcsRUFBRSxDQUFDLENBQUMsS0FBSyxTQUFTLENBQUMsTUFBTSxDQUFDLENBQUMsRUFBRTtRQUMzQyxpQkFBaUIsRUFBRSxLQUFLLElBQUksRUFBRSxDQUFDLEVBQUU7UUFDakMsT0FBTyxFQUFFLEdBQUcsRUFBRSxHQUFHLENBQUM7UUFDbEIsVUFBVSxFQUFFLEtBQUs7UUFDakIsSUFBSSxVQUFVLEtBQUssT0FBTyxVQUFVLENBQUMsQ0FBQyxDQUFDO0tBQ3ZDLENBQUM7QUFDSCxDQUFDO0FBRUQsU0FBUyx5QkFBeUIsQ0FDakMsWUFBb0IsRUFDcEIsWUFBb0IsRUFDcEIsWUFBaUM7SUFFakMsTUFBTSxLQUFLLEdBQUcsRUFBRSxDQUFDO0lBQ2pCLE1BQU0sS0FBSyxHQUFHLGVBQWUsQ0FBc0IsS0FBSyxFQUFFLFlBQVksQ0FBQyxDQUFDO0lBQ3hFLE1BQU0sZUFBZSxHQUFHLGVBQWUsQ0FBcUIsS0FBSyxFQUFFLEVBQUUsS0FBSyx5Q0FBaUMsRUFBRSxDQUFDLENBQUM7SUFDL0csTUFBTSxVQUFVLEdBQUcsZUFBZSxDQUFzQixLQUFLLHNDQUE4QixDQUFDO0lBQzVGLElBQUksVUFBVSxHQUFHLENBQUMsQ0FBQztJQUNuQixJQUFJLGFBQWEsR0FBdUIsTUFBTSxDQUFDO0lBRS9DLE1BQU0sTUFBTSxHQUFxSjtRQUNoSyxVQUFVLEVBQUUsRUFBRSxFQUFFLEVBQUUsWUFBWSxFQUFFLEtBQUssRUFBRSxZQUFZLEVBQUU7UUFDckQsVUFBVSxFQUFFLEVBQUUsRUFBRSxFQUFFLFlBQVksRUFBRSxLQUFLLEVBQUUsWUFBWSxFQUFFO1FBQ3JELFVBQVUsRUFBRSxlQUFlLENBQUMsS0FBSyxFQUFFLFNBQVMsQ0FBQztRQUM3QyxlQUFlO1FBQ2YsVUFBVSxFQUFFLGVBQWUsQ0FBQyxLQUFLLHFEQUE2QztRQUM5RSxjQUFjLEVBQUUsZUFBZSxDQUFDLEtBQUssRUFBRSxTQUFTLENBQUM7UUFDakQsZUFBZSxFQUFFLEdBQUcsRUFBRSxDQUFDLGVBQWUsQ0FBQyxLQUFLLEVBQUUsRUFBRSxNQUFNLEVBQUUsU0FBUyxFQUFFLFVBQVUsRUFBRSxTQUFTLEVBQUUsQ0FBQztRQUMzRixVQUFVLEVBQUUsS0FBSyxJQUFJLEVBQUUsR0FBRyxDQUFDO1FBQzNCLEtBQUssRUFBRSxLQUFLLElBQUksRUFBRTtZQUNqQixVQUFVLEVBQUUsQ0FBQztZQUNiLElBQUksTUFBTSxDQUFDLGFBQWEsS0FBSyxTQUFTLEVBQUUsQ0FBQztnQkFDeEMsVUFBVSxDQUFDLEdBQUcsbUNBQTJCLFNBQVMsQ0FBQyxDQUFDO2dCQUNwRCxPQUFPLEVBQUUsS0FBSyx5Q0FBaUMsRUFBRSxDQUFDO1lBQ25ELENBQUM7WUFDRCw2REFBNkQ7WUFDN0QsT0FBTyxJQUFJLE9BQU8sQ0FBcUIsR0FBRyxFQUFFLEdBQUcsQ0FBQyxDQUFDLENBQUM7UUFDbkQsQ0FBQztRQUNELElBQUksRUFBRSxLQUFLLElBQUksRUFBRSxHQUFHLENBQUM7UUFDckIsVUFBVTtRQUNWLEtBQUs7UUFDTCxPQUFPLEVBQUUsZUFBZSxDQUFDLEtBQUssRUFBRSxFQUFFLENBQUM7UUFDbkMsWUFBWSxFQUFFLGVBQWUsQ0FBQyxLQUFLLEVBQUUsU0FBUyxDQUFDO1FBQy9DLFNBQVMsRUFBRSxHQUFHLEVBQUUsQ0FBQyxDQUFDLEtBQUssU0FBUyxDQUFDLE1BQU0sQ0FBQyxDQUFDLEVBQUU7UUFDM0MsaUJBQWlCLEVBQUUsS0FBSyxJQUFJLEVBQUUsQ0FBQyxFQUFFO1FBQ2pDLE9BQU8sRUFBRSxHQUFHLEVBQUUsR0FBRyxDQUFDO1FBQ2xCLElBQUksVUFBVSxLQUFLLE9BQU8sVUFBVSxDQUFDLENBQUMsQ0FBQztRQUN2QyxJQUFJLGFBQWEsS0FBSyxPQUFPLGFBQWEsQ0FBQyxDQUFDLENBQUM7UUFDN0MsSUFBSSxhQUFhLENBQUMsQ0FBQyxJQUFJLGFBQWEsR0FBRyxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQzNDLGVBQWUsRUFBRSxVQUFVO0tBQzNCLENBQUM7SUFDRixPQUFPLE1BQU0sQ0FBQztBQUNmLENBQUM7QUFFRCxTQUFTLFVBQVUsQ0FBQyxJQUFZLEVBQUUsSUFBc0UsRUFBRSw0Q0FBdUQ7SUFDaEssTUFBTSxVQUFVLEdBQWE7UUFDNUIsSUFBSTtRQUNKLFdBQVcsRUFBRSxRQUFRLElBQUksRUFBRTtRQUMzQixXQUFXLEVBQUU7WUFDWixJQUFJLEVBQUUsUUFBUTtZQUNkLFVBQVUsRUFBRTtnQkFDWCxLQUFLLEVBQUUsRUFBRSxJQUFJLEVBQUUsUUFBUSxFQUFFO2FBQ3pCO1NBQ0Q7S0FDRCxDQUFDO0lBRUYsT0FBTztRQUNOLEVBQUUsRUFBRSxRQUFRLElBQUksRUFBRTtRQUNsQixhQUFhLEVBQUUsSUFBSTtRQUNuQixLQUFLLEVBQUUsRUFBZTtRQUN0QixVQUFVO1FBQ1YsVUFBVTtRQUNWLGFBQWEsRUFBRSxTQUFTO1FBQ3hCLElBQUksRUFBRSxDQUFDLE1BQStCLEVBQUUsUUFBUSxFQUFFLE1BQU0sRUFBRSxFQUFFLENBQUMsSUFBSSxDQUFDLE1BQU0sQ0FBQztRQUN6RSxnQkFBZ0IsRUFBRSxDQUFDLE1BQStCLEVBQUUsU0FBUyxFQUFFLFFBQVEsRUFBRSxNQUFNLEdBQUcsaUJBQWlCLENBQUMsSUFBSSxFQUFFLEVBQUUsQ0FBQyxJQUFJLENBQUMsTUFBTSxDQUFDO0tBQ3pILENBQUM7QUFDSCxDQUFDIn0=