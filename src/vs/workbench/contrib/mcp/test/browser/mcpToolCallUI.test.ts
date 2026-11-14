/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { CancellationToken, CancellationTokenSource } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Emitter, Event } from '../../../../../base/common/event.js';
import { constObservable } from '../../../../../base/common/observable.js';
import { upcastPartial } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { ServiceCollection } from '../../../../../platform/instantiation/common/serviceCollection.js';
import { TestInstantiationService } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IThemeService } from '../../../../../platform/theme/common/themeService.js';
import { TestThemeService } from '../../../../../platform/theme/test/common/testThemeService.js';
import { McpToolCallUI } from '../../browser/mcpToolCallUI.js';
import { IMcpServer, IMcpService, IMcpTool, IMcpToolCallContext, IMcpToolCallUIData, McpConnectionState, McpServerCacheState, McpToolVisibility } from '../../common/mcpTypes.js';
import { MCP } from '../../common/modelContextProtocol.js';

suite('McpToolCallUI', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	test('preserves local tool request metadata and app visibility checks', async () => {
		const calls: { args: Record<string, unknown>; context: IMcpToolCallContext | undefined; meta: MCP.RequestMetaObject | undefined }[] = [];
		const tool = upcastPartial<IMcpTool>({
			definition: { name: 'correlation_probe', inputSchema: { type: 'object' } },
			visibility: McpToolVisibility.App,
			call: async (args, context, _token, meta) => {
				calls.push({ args, context, meta });
				return { content: [] };
			},
		});
		const hiddenTool = upcastPartial<IMcpTool>({
			...tool,
			definition: { name: 'model_only', inputSchema: { type: 'object' } },
			visibility: McpToolVisibility.Model,
		});
		const server = upcastPartial<IMcpServer>({
			definition: { id: 'server', label: 'Server' },
			collection: { id: 'collection', label: 'Collection', order: 0 },
			start: async () => ({ state: McpConnectionState.Kind.Running }),
			connectionState: constObservable({ state: McpConnectionState.Kind.Running }),
			cacheState: constObservable(McpServerCacheState.Live),
			tools: constObservable([tool, hiddenTool]),
		});
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IMcpService, upcastPartial<IMcpService>({ servers: constObservable([server]) })],
			[IThemeService, new TestThemeService()],
		)));
		const ui = store.add(instantiationService.createInstance(McpToolCallUI, {
			kind: 'local', serverDefinitionId: 'server', collectionId: 'collection', resourceUri: 'ui://probe/app',
		}));
		const meta = { 'com.example/correlation-id': 'correlation-1', 'com.example/context': { enabled: false, value: null } };
		await ui.callTool({ name: 'correlation_probe', arguments: { value: 42 }, _meta: meta }, CancellationToken.None);
		await ui.callTool({ name: 'correlation_probe', _meta: {} }, CancellationToken.None);
		await ui.callTool({ name: 'correlation_probe' }, CancellationToken.None);
		await assert.rejects(ui.callTool({ name: 'model_only', _meta: meta }, CancellationToken.None), /Tool not found on server/);
		assert.deepStrictEqual(calls, [
			{ args: { value: 42 }, context: undefined, meta },
			{ args: {}, context: undefined, meta: {} },
			{ args: {}, context: undefined, meta: undefined },
		]);
	});

	test('preserves Agent Host tool request metadata separately from arguments', async () => {
		const calls: { channel: string; method: string; params: Record<string, unknown> | undefined }[] = [];
		const connection = upcastPartial<IAgentConnection>({
			onMcpNotification: Event.None,
			handleMcpRequest: async (channel, method, params) => {
				calls.push({ channel, method, params });
				return { content: [] };
			},
		});
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
				onDidChangeConnections: Event.None,
				getConnectionByAuthority: authority => authority === 'remote-host' ? connection : undefined,
			})],
			[IThemeService, new TestThemeService()],
		)));
		const channel = 'mcp://opaque-host-defined-channel/probe';
		const ui = store.add(instantiationService.createInstance(McpToolCallUI, {
			kind: 'agentHost', resourceUri: 'ui://probe/app', connectionAuthority: 'remote-host', channel, serverId: 'probe',
		}));
		const requests: MCP.CallToolRequestParams[] = [
			{ name: 'correlation_probe', arguments: { value: 42 }, _meta: { 'com.example/correlation-id': 'correlation-1', 'com.example/context': { enabled: false, value: null } } },
			{ name: 'correlation_probe', _meta: {} },
			{ name: 'correlation_probe' },
		];
		for (const request of requests) {
			await ui.callTool(request, CancellationToken.None);
		}
		assert.deepStrictEqual(calls, requests.map(params => ({
			channel, method: 'tools/call', params: { ...params, arguments: params.arguments ?? {} },
		})));
	});

	test('waits for the owning Agent Host connection before loading an app resource', async () => {
		const calls: { channel: string; method: string; params: Record<string, unknown> | undefined }[] = [];
		const connection = upcastPartial<IAgentConnection>({
			onMcpNotification: Event.None,
			handleMcpRequest: async (channel, method, params) => {
				calls.push({ channel, method, params });
				return { contents: [{ uri: 'ui://probe/app', text: '<html>App</html>' }] };
			},
		});
		let remote: IAgentConnection | undefined = undefined;
		const onDidChangeConnections = store.add(new Emitter<void>());
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
				onDidChangeConnections: onDidChangeConnections.event,
				getConnectionByAuthority: authority => authority === 'remote-host' ? remote : connection,
			})],
			[IThemeService, new TestThemeService()],
		)));
		const channel = 'mcp://opaque-host-defined-channel/probe';
		const ui = store.add(instantiationService.createInstance(McpToolCallUI, {
			kind: 'agentHost', resourceUri: 'ui://probe/app', connectionAuthority: 'remote-host', channel, serverId: 'probe',
		}));
		const pending = ui.loadResource(CancellationToken.None);
		onDidChangeConnections.fire();
		assert.deepStrictEqual(calls, []);
		remote = connection;
		onDidChangeConnections.fire();
		onDidChangeConnections.fire();
		const loaded = await pending;
		assert.deepStrictEqual({ loaded, calls }, {
			loaded: { html: '<html>App</html>', mimeType: 'text/html' },
			calls: [{ channel, method: 'resources/read', params: { uri: 'ui://probe/app' } }],
		});
	});

	test('rechecks the owning Agent Host connection before dispatching a resource load', async () => {
		const calls: { connection: string; channel: string; method: string; params: Record<string, unknown> | undefined }[] = [];
		const connection = (name: string) => upcastPartial<IAgentConnection>({
			onMcpNotification: Event.None,
			handleMcpRequest: async (channel, method, params) => {
				calls.push({ connection: name, channel, method, params });
				return { contents: [{ uri: 'ui://probe/app', text: `<html>${name}</html>` }] };
			},
		});
		const original = connection('original');
		let remote: IAgentConnection | undefined = undefined;
		const onDidChangeConnections = store.add(new Emitter<void>());
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
				onDidChangeConnections: onDidChangeConnections.event,
				getConnectionByAuthority: authority => authority === 'remote-host' ? remote : undefined,
			})],
			[IThemeService, new TestThemeService()],
		)));
		const channel = 'mcp://opaque-host-defined-channel/probe';
		const ui = store.add(instantiationService.createInstance(McpToolCallUI, {
			kind: 'agentHost', resourceUri: 'ui://probe/app', connectionAuthority: 'remote-host', channel, serverId: 'probe',
		}));
		const pending = ui.loadResource(CancellationToken.None);
		remote = original;
		onDidChangeConnections.fire();
		remote = undefined;
		onDidChangeConnections.fire();
		await Promise.resolve();
		assert.deepStrictEqual(calls, []);
		remote = original;
		onDidChangeConnections.fire();
		remote = connection('latest');
		onDidChangeConnections.fire();
		const loaded = await pending;
		assert.deepStrictEqual({ loaded, calls }, {
			loaded: { html: '<html>latest</html>', mimeType: 'text/html' },
			calls: [{ connection: 'latest', channel, method: 'resources/read', params: { uri: 'ui://probe/app' } }],
		});
	});

	test('routes Agent Host requests and notifications through the reconnected authority', async () => {
		const calls: Array<{ connection: string; channel: string; method: string; params: Record<string, unknown> | undefined }> = [];
		const connection = (name: string) => {
			const onMcpNotification = store.add(new Emitter<{ channel: string; method: string; params?: Record<string, unknown> }>());
			return {
				value: upcastPartial<IAgentConnection>({
					onMcpNotification: onMcpNotification.event,
					handleMcpRequest: async (channel, method, params) => {
						calls.push({ connection: name, channel, method, params });
						return {
							contents: [{
								uri: 'ui://github-mcp-server/get-me',
								mimeType: 'text/html',
								text: `<html>${name}</html>`,
							}],
						};
					},
				}),
				notify: (channel: string, method: string) => onMcpNotification.fire({ channel, method }),
			};
		};
		const ambient = connection('ambient');
		const originalRemote = connection('remote-1');
		let remote: ReturnType<typeof connection> | undefined = originalRemote;
		const onDidChangeConnections = store.add(new Emitter<void>());
		const connectionsService = upcastPartial<IAgentHostConnectionsService>({
			onDidChangeConnections: onDidChangeConnections.event,
			getConnectionByAuthority: authority => authority === 'remote-host' ? remote?.value : authority === 'local' ? ambient.value : undefined,
		});
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IAgentHostConnectionsService, connectionsService],
			[IThemeService, new TestThemeService()],
		)));
		const channel = 'mcp://copilotcli/ahp-chat%3A%2F%2Fdefault%2Fsession/GitHub';
		const ui = store.add(instantiationService.createInstance(McpToolCallUI, {
			kind: 'agentHost',
			resourceUri: 'ui://github-mcp-server/get-me',
			connectionAuthority: 'remote-host',
			channel,
			serverId: 'github',
		}));
		const notifications: Array<{ method: string; params?: unknown }> = [];
		store.add(ui.onNotification(notification => notifications.push(notification)));

		const first = await ui.loadResource(CancellationToken.None);
		originalRemote.notify(channel, 'notifications/first');
		remote = undefined;
		onDidChangeConnections.fire();
		const pending = ui.loadResource(CancellationToken.None);
		originalRemote.notify(channel, 'notifications/disconnected');
		remote = connection('remote-2');
		onDidChangeConnections.fire();
		originalRemote.notify(channel, 'notifications/stale');
		remote.notify('mcp://other', 'notifications/wrong-channel');
		remote.notify(channel, 'notifications/second');
		const reconnected = await pending;
		const second = await ui.readResource('ui://github-mcp-server/details', CancellationToken.None);

		assert.deepStrictEqual({
			first: first.html,
			reconnected: reconnected.html,
			second: second.contents[0],
			calls,
			notifications,
		}, {
			first: '<html>remote-1</html>',
			reconnected: '<html>remote-2</html>',
			second: {
				uri: 'ui://github-mcp-server/get-me',
				mimeType: 'text/html',
				text: '<html>remote-2</html>',
			},
			calls: [
				{
					connection: 'remote-1',
					channel,
					method: 'resources/read',
					params: { uri: 'ui://github-mcp-server/get-me' },
				},
				{
					connection: 'remote-2',
					channel,
					method: 'resources/read',
					params: { uri: 'ui://github-mcp-server/get-me' },
				},
				{
					connection: 'remote-2',
					channel,
					method: 'resources/read',
					params: { uri: 'ui://github-mcp-server/details' },
				},
			],
			notifications: [
				{ method: 'notifications/first', params: undefined },
				{ method: 'notifications/second', params: undefined },
			],
		});
	});

	for (const cancel of ['caller', 'disposal'] as const) {
		for (const connected of [false, true]) {
			test(`cancels Agent Host app resource loading on ${cancel}${connected ? ' just after connecting' : ' while disconnected'}`, async () => {
				const calls: string[] = [];
				const connection = upcastPartial<IAgentConnection>({
					onMcpNotification: Event.None,
					handleMcpRequest: async (_channel, method) => {
						calls.push(method);
						return { contents: [{ uri: 'ui://probe/app', text: '<html>App</html>' }] };
					},
				});
				let remote: IAgentConnection | undefined;
				const onDidChangeConnections = store.add(new Emitter<void>());
				const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
					[IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
						onDidChangeConnections: onDidChangeConnections.event,
						getConnectionByAuthority: authority => authority === 'remote-host' ? remote : undefined,
					})],
					[IThemeService, new TestThemeService()],
				)));
				const ui = store.add(instantiationService.createInstance(McpToolCallUI, {
					kind: 'agentHost', resourceUri: 'ui://probe/app', connectionAuthority: 'remote-host', channel: 'mcp://opaque-host-defined-channel/probe', serverId: 'probe',
				}));
				const cancellation = store.add(new CancellationTokenSource());
				const rejected = assert.rejects(ui.loadResource(cancellation.token), isCancellationError);
				if (connected) {
					remote = connection;
					onDidChangeConnections.fire();
				}
				if (cancel === 'caller') {
					cancellation.cancel();
				} else {
					ui.dispose();
				}
				remote = connection;
				onDidChangeConnections.fire();
				await rejected;
				await assert.rejects(ui.loadResource(cancellation.token), isCancellationError);
				assert.deepStrictEqual(calls, []);
			});
		}
	}

	test('preserves remote MCP resource provenance across denied loads, retry and restored render data', async () => {
		const channel = 'mcp://opaque-host-defined-channel/github';
		const resourceUri = 'ui://github-mcp-server/get-me';
		const uiData: IMcpToolCallUIData = {
			kind: 'agentHost',
			resourceUri,
			connectionAuthority: 'remote-host',
			channel,
			serverId: 'github',
		};
		const calls: { channel: string; method: string; params: Record<string, unknown> | undefined }[] = [];
		let denied = true;
		const onMcpNotification = store.add(new Emitter<{ channel: string; method: string; params?: Record<string, unknown> }>());
		const connection = upcastPartial<IAgentConnection>({
			onMcpNotification: onMcpNotification.event,
			handleMcpRequest: async (channel, method, params) => {
				calls.push({ channel, method, params });
				if (denied) {
					throw new Error('MCP app resource is not allowed');
				}
				return { contents: [{ uri: resourceUri, text: '<html>GitHub profile</html>', mimeType: 'text/html;profile=mcp-app' }] };
			},
		});
		const onDidChangeConnections = store.add(new Emitter<void>());
		const instantiationService = store.add(new TestInstantiationService(new ServiceCollection(
			[IAgentHostConnectionsService, upcastPartial<IAgentHostConnectionsService>({
				onDidChangeConnections: onDidChangeConnections.event,
				getConnectionByAuthority: authority => authority === 'remote-host' ? connection : undefined,
			})],
			[IThemeService, new TestThemeService()],
		)));
		const ui = store.add(instantiationService.createInstance(McpToolCallUI, uiData));
		await assert.rejects(ui.loadResource(CancellationToken.None), /MCP app resource is not allowed/);
		denied = false;
		onDidChangeConnections.fire();
		onDidChangeConnections.fire();
		const retried = await ui.loadResource(CancellationToken.None);
		ui.dispose();
		const restored = store.add(instantiationService.createInstance(McpToolCallUI, { ...uiData }));
		const loaded = await restored.loadResource(CancellationToken.None);
		assert.deepStrictEqual({ retried, loaded, calls }, {
			retried: { html: '<html>GitHub profile</html>', mimeType: 'text/html;profile=mcp-app' },
			loaded: { html: '<html>GitHub profile</html>', mimeType: 'text/html;profile=mcp-app' },
			calls: Array.from({ length: 3 }, () => ({ channel, method: 'resources/read', params: { uri: resourceUri } })),
		});
	});
});
