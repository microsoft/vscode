/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ICachedTunnel, ITunnelAgentHostService, ITunnelInfo } from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPick, IQuickPickItem, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IRemoteTunnelService } from '../../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { IAuthenticationService } from '../../../../../../workbench/services/authentication/common/authentication.js';
import { ConnectionDiagnosticsService } from '../../browser/connectionDiagnosticsService.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry, IAgentHostFilterService } from '../../../../../services/agentHostFilter/common/agentHostFilter.js';
import { IConnectionDiagnosticsService, IConnectionDiagnosticsSnapshot } from '../../browser/connectionDiagnostics.js';
import { RemoteAgentHostCommandIds } from '../../browser/remoteAgentHostActions.js';

suite('ConnectionDiagnosticsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const tunnel: ITunnelInfo = { tunnelId: 'mock', clusterId: 'local', name: 'Mock host', protocolVersion: 5, hostConnectionCount: 1, tags: [] };

	function createService() {
		const changes = store.add(new Emitter<void>());
		const remote = new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConnections = changes.event;
			override connections: IRemoteAgentHostConnectionInfo[] = [];
			override configuredEntries: IRemoteAgentHostEntry[] = [];
			override getConnection(): IAgentConnection | undefined { return undefined; }
		}();
		const tunnels = new class extends mock<ITunnelAgentHostService>() {
			override readonly onDidChangeTunnels = Event.None;
			cached: ICachedTunnel[] = [];
			dismissed = new Set<string>();
			suppressed = new Set<string>();
			disconnects: string[] = [];
			list: (() => Promise<ITunnelInfo[]>) | undefined;
			override readonly canDeleteTunnels = false;
			override getCachedTunnels(): ICachedTunnel[] { return this.cached; }
			override isTunnelDismissed(id: string): boolean { return this.dismissed.has(id); }
			override isAutoConnectSuppressed(id: string): boolean { return this.suppressed.has(id); }
			override getTunnelVisibility() { return { dismissed: [...this.dismissed], autoConnectSuppressed: [...this.suppressed] }; }
			override clearTunnelDismissal(id: string): void { this.dismissed.delete(id); }
			override dismissTunnel(id: string): void { this.dismissed.add(id); }
			override clearAutoConnectSuppression(id: string): void { this.suppressed.delete(id); }
			override async disconnect(address: string): Promise<void> { this.disconnects.push(address); }
			override listTunnels(): Promise<ITunnelInfo[]> {
				if (!this.list) {
					throw new Error('Diagnostics must not make discovery requests');
				}
				return this.list();
			}
		}();
		const configuration = new TestConfigurationService({ [RemoteAgentHostsEnabledSettingId]: true, [RemoteAgentHostAutoConnectSettingId]: true });
		const instantiation = store.add(new TestInstantiationService());
		instantiation.stub(IRemoteAgentHostService, remote);
		instantiation.stub(ITunnelAgentHostService, tunnels);
		instantiation.stub(IConfigurationService, configuration);
		const filter = new class extends mock<IAgentHostFilterService>() {
			override readonly onDidChange = Event.None;
			override readonly onDidChangeDiscovering = Event.None;
			override hosts: IAgentHostFilterEntry[] = [];
			override readonly selectedHost = undefined;
			override readonly selectedHostId = undefined;
			override readonly isDiscovering = false;
			readonly reconnects: string[] = [];
			readonly disconnects: string[] = [];
			rediscoverCount = 0;
			discoverySucceeded = true;
			override async reconnect(id: string): Promise<void> { this.reconnects.push(id); }
			override async disconnect(id: string): Promise<void> { this.disconnects.push(id); }
			override async rediscover(): Promise<boolean> { this.rediscoverCount++; return this.discoverySucceeded; }
		}();
		instantiation.stub(IAgentHostFilterService, filter);
		instantiation.stub(IProductService, { version: '1.139.0', commit: 'test-commit' });
		const service = store.add(instantiation.createInstance(ConnectionDiagnosticsService));
		return { service, remote, tunnels, changes, configuration, instantiation, filter };
	}

	function values(snapshot: IConnectionDiagnosticsSnapshot, title: string): Record<string, string> {
		const section = snapshot.sections.find(section => section.title.startsWith(title));
		assert.ok(section, `Missing ${title} section`);
		return Object.fromEntries(section.entries.map(entry => [entry.label, entry.value]));
	}

	test('shows online dismissed hosts even when the cache and picker are empty', async () => {
		const { service, tunnels } = createService();
		tunnels.dismissed.add('mock');
		await service.trackDiscovery('startup', async () => [tunnel]);
		const snapshot = service.getSnapshot();

		assert.deepStrictEqual({
			host: values(snapshot, 'Mock host'),
			hasInferredIssues: snapshot.sections.some(section => section.title === 'Possible issues'),
			discoveryResult: values(snapshot, 'Tunnel discovery').Result,
			cached: tunnels.cached,
		}, {
			host: {
				'Address': 'tunnel:mock',
				'Connection type': 'tunnel',
				'Connection status': 'No connection entry',
				'Selectable': 'No',
				'Configured': 'No',
				'Cached': 'No',
				'In last successful discovery': 'Yes',
				'Persistently dismissed': 'Yes',
				'Auto-connect suppressed': 'No',
				'Tunnel cluster': 'local',
				'Active tunnel hosts': '1',
				'Tunnel protocol version': '5',
			},
			hasInferredIssues: false,
			discoveryResult: 'succeeded',
			cached: [],
		});
	});

	test('collapsed host summary distinguishes connectivity from selectability', () => {
		const { service, remote, filter } = createService();
		remote.connections = [{ address: 'tunnel:mock', name: 'Mock host', status: RemoteAgentHostConnectionStatus.connected }];
		filter.hosts = [{ id: 'host', address: 'tunnel:mock', label: 'Mock host', providerIds: ['mock'], grouped: false, connectable: true, icon: Codicon.remote, status: AgentHostFilterConnectionStatus.Connected }];
		const connected = service.getSnapshot().sections;
		remote.connections = [{ ...remote.connections[0], status: RemoteAgentHostConnectionStatus.disconnected }];
		const disconnected = service.getSnapshot().sections;
		assert.deepStrictEqual({
			connected: connected[1].title,
			disconnected: disconnected[1].title,
			allCollapsed: connected.every(section => section.collapsed) && disconnected.every(section => section.collapsed),
		}, {
			connected: 'Mock host - connected, selectable',
			disconnected: 'Mock host - disconnected, selectable',
			allCollapsed: true,
		});
	});

	test('manages selectable and hidden hosts from current state', async () => {
		const { service, remote, filter, tunnels } = createService();
		remote.connections = [{ address: 'tunnel:mock', name: 'Mock host', status: RemoteAgentHostConnectionStatus.connected }];
		filter.hosts = [{ id: 'host', address: 'tunnel:mock', label: 'Mock host', providerIds: ['mock'], grouped: false, connectable: true, icon: Codicon.remote, status: AgentHostFilterConnectionStatus.Connected }];
		tunnels.suppressed.add('mock');
		tunnels.dismissed.add('hidden');

		const before = service.getHostManagementState();
		await service.runHostAction('host', 'disconnect');
		await service.runHostAction('host', 'reconnect');
		await service.runHostAction('tunnel:hidden', 'restore');

		assert.deepStrictEqual({
			before,
			filterDisconnects: filter.disconnects,
			tunnelDisconnects: tunnels.disconnects,
			reconnects: filter.reconnects,
			suppressed: [...tunnels.suppressed],
			dismissed: [...tunnels.dismissed],
			rediscoverCount: filter.rediscoverCount,
		}, {
			before: {
				hosts: [{
					id: 'host',
					label: 'Mock host',
					address: 'tunnel:mock',
					status: 'connected',
					selectable: true,
					selected: false,
					hidden: false,
					autoConnectSuppressed: true,
					connectable: true,
				}, {
					id: 'tunnel:hidden',
					label: 'hidden',
					address: 'tunnel:hidden',
					status: 'disconnected',
					selectable: false,
					selected: false,
					hidden: true,
					autoConnectSuppressed: false,
					connectable: false,
				}],
				isDiscovering: false,
			},
			filterDisconnects: ['host'],
			tunnelDisconnects: [],
			reconnects: ['host'],
			suppressed: [],
			dismissed: [],
			rediscoverCount: 1,
		});
	});

	test('restore reports discovery failure without clearing unrelated suppression', async () => {
		const { service, filter, tunnels } = createService();
		tunnels.dismissed.add('hidden');
		tunnels.suppressed.add('hosted-here');
		filter.discoverySucceeded = false;
		await assert.rejects(service.runHostAction('tunnel:hidden', 'restore'), /Host is no longer hidden, but discovery failed/);
		assert.deepStrictEqual({
			dismissed: [...tunnels.dismissed],
			suppressed: [...tunnels.suppressed],
			reconnects: filter.reconnects,
		}, { dismissed: [], suppressed: ['hosted-here'], reconnects: [] });
	});

	test('preserves last successful inventory after failure and excludes raw error content', async () => {
		const { service } = createService();
		await service.trackDiscovery('startup', async () => [tunnel]);
		const error = new Error('Private failure details https://relay/?token=private');
		await assert.rejects(service.trackDiscovery('rediscover', async () => { throw error; }), caught => caught === error);
		const snapshot = service.getSnapshot();

		assert.deepStrictEqual({
			result: values(snapshot, 'Tunnel discovery').Result,
			hostRetained: snapshot.sections.some(section => section.title.startsWith('Mock host -')),
			containsRawError: /secret-value|private|Bearer/.test(snapshot.text),
			error: values(snapshot, 'Tunnel discovery').Error,
		}, {
			result: 'failed',
			hostRetained: true,
			containsRawError: false,
			error: 'Request failed; see the Window log for error details.',
		});
	});

	test('shows persisted hidden host IDs before any discovery succeeds', () => {
		const { service, tunnels } = createService();
		tunnels.dismissed.add('previous-host');
		tunnels.suppressed.add('hosted-here');
		const snapshot = service.getSnapshot();

		assert.deepStrictEqual({
			dismissed: values(snapshot, 'tunnel:previous-host')['Persistently dismissed'],
			suppressed: values(snapshot, 'tunnel:hosted-here')['Auto-connect suppressed'],
			discovery: values(snapshot, 'Tunnel discovery').Result,
		}, {
			dismissed: 'Yes',
			suppressed: 'Yes',
			discovery: 'No discovery observed in this window.',
		});
	});

	test('interactive enumeration updates diagnostics after background failure even when picker is cancelled', async () => {
		const { service, tunnels, instantiation } = createService();
		await assert.rejects(service.trackDiscovery('startup', async () => { throw new Error('offline'); }));
		const result = [tunnel];
		tunnels.list = async () => result;
		instantiation.stub(IConnectionDiagnosticsService, service);
		const pickerReady = new DeferredPromise<void>();
		const hide = store.add(new Emitter<void>());
		let itemLabels: readonly string[] = [];
		instantiation.stub(IQuickInputService, {
			createQuickPick: <T extends IQuickPickItem>() => new class extends mock<IQuickPick<T>>() {
				override items: readonly T[] = [];
				override readonly onDidTriggerButton = Event.None;
				override readonly onDidAccept = Event.None;
				override readonly onDidTriggerItemButton = Event.None;
				override readonly onDidHide = Event.map(hide.event, () => ({ reason: QuickInputHideReason.Gesture }));
				override show(): void { }
				override hide(): void { hide.fire(); }
				override dispose(): void { }
				override set busy(value: boolean) {
					if (!value) {
						itemLabels = this.items.map(item => item.label);
						void pickerReady.complete();
					}
				}
			}(),
		});
		instantiation.stub(IRemoteTunnelService, { onDidChangeTunnelStatus: Event.None, getTunnelStatus: async () => ({ type: 'disconnected' }) });
		instantiation.stub(IAuthenticationService, {
			getSessions: async () => [{ id: 'session', accessToken: 'test-token', account: { id: 'account', label: 'Account' }, scopes: [] }],
		});
		instantiation.stub(INotificationService, new class extends mock<INotificationService>() { }());
		instantiation.stub(IDialogService, new class extends mock<IDialogService>() { }());
		const command = CommandsRegistry.getCommand(RemoteAgentHostCommandIds.connectViaTunnel)!;
		const run = instantiation.invokeFunction(accessor => command.handler(accessor));
		await pickerReady.p;
		hide.fire();
		await run;
		const snapshot = service.getSnapshot();
		assert.deepStrictEqual({
			itemLabels,
			trigger: values(snapshot, 'Tunnel discovery').Trigger,
			result: values(snapshot, 'Tunnel discovery').Result,
			count: values(snapshot, 'Tunnel discovery')['Hosts in last successful discovery'],
			host: values(snapshot, 'Mock host').Address,
			cache: tunnels.cached,
		}, {
			itemLabels: ['Mock host'],
			trigger: 'interactive',
			result: 'succeeded',
			count: '1',
			host: 'tunnel:mock',
			cache: [],
		});
	});

	test('late older discovery completion cannot replace newer successful inventory', async () => {
		const { service } = createService();
		const pending = new DeferredPromise<ITunnelInfo[]>();
		const first = service.trackDiscovery('startup', () => pending.p);
		await service.trackDiscovery('rediscover', async () => [tunnel]);
		await pending.complete([]);
		await first;
		const snapshot = service.getSnapshot();

		assert.deepStrictEqual({
			attempt: values(snapshot, 'Tunnel discovery').Attempt,
			result: values(snapshot, 'Tunnel discovery').Result,
			hostRetained: snapshot.sections.some(section => section.title.startsWith('Mock host -')),
		}, { attempt: '#2', result: 'succeeded', hostRetained: true });
	});

	test('reports bounded HTTP and network failure categories without error payloads', async () => {
		const { service } = createService();
		const errors = [
			{ statusCode: 403, message: 'private server details' },
			{ code: 'ECONNREFUSED', message: 'private endpoint' },
			new Error('No authentication is available to enumerate tunnels.'),
		];
		const descriptions: string[] = [];
		for (const error of errors) {
			await assert.rejects(service.trackDiscovery('rediscover', async () => { throw error; }), caught => caught === error);
			descriptions.push(values(service.getSnapshot(), 'Tunnel discovery').Error);
		}
		assert.deepStrictEqual(descriptions, [
			'Request failed (HTTP 403).',
			'Network request failed (ECONNREFUSED).',
			'No authentication is available to enumerate tunnels.',
		]);
	});

	test('records connection transitions, retry deadlines and removals without duplicate events', () => {
		const { service, remote, changes } = createService();
		remote.connections = [{ address: 'tunnel:mock', name: 'Mock host', status: RemoteAgentHostConnectionStatus.connecting }];
		changes.fire();
		changes.fire();
		remote.connections = [{ ...remote.connections[0], status: RemoteAgentHostConnectionStatus.reconnectingUntil(1000) }];
		changes.fire();
		const retry = values(service.getSnapshot(), 'Mock host')['Next reconnect attempt'];
		remote.connections = [];
		changes.fire();

		assert.deepStrictEqual({
			retry,
			activity: service.getSnapshot().sections.find(section => section.title === 'Recent activity logs')?.entries.map(entry => entry.value),
		}, {
			retry: '1970-01-01T00:00:01.000Z',
			activity: [
				'tunnel:mock: connecting.',
				'tunnel:mock: reconnecting; next attempt at 1970-01-01T00:00:01.000Z.',
				'tunnel:mock: connection entry removed.',
			],
		});
	});

	test('excludes connection tokens, URL credentials, query strings and fragments', () => {
		const { service, remote, changes } = createService();
		const address = 'wss://alice:password@example.test:443/?token=query-secret#fragment-secret';
		remote.configuredEntries = [{ name: address, connectionToken: 'connection-secret', connection: { type: RemoteAgentHostEntryType.WebSocket, address } }];
		remote.connections = [{ address, name: address, status: RemoteAgentHostConnectionStatus.connected }];
		changes.fire();
		service.recordHostAction(address, 'connect', true);
		const snapshot = service.getSnapshot();

		assert.deepStrictEqual({
			address: values(snapshot, 'wss://example.test:443/').Address,
			exposesSecret: /alice|password|query-secret|fragment-secret|connection-secret/.test(snapshot.text),
		}, { address: 'wss://example.test:443/', exposesSecret: false });
	});

	test('bounded activity records explicit dismissal and copies the same displayed evidence', () => {
		const { service } = createService();
		for (let i = 0; i < 105; i++) {
			service.recordHostAction(`tunnel:${i}`, 'disconnect', true);
		}
		const snapshot = service.getSnapshot();
		const activity = snapshot.sections.find(section => section.title === 'Recent activity logs')!;

		assert.deepStrictEqual({
			count: activity.entries.length,
			newest: activity.entries.at(-1)?.value,
			oldest: activity.entries[0].value,
			textMatches: snapshot.sections.every(section => section.entries.every(entry => snapshot.text.includes(`${entry.label}: ${entry.value}`))),
		}, {
			count: 100,
			newest: 'tunnel:104: disconnect requested by the user; automatic reconnect suppressed.',
			oldest: 'tunnel:5: disconnect requested by the user; automatic reconnect suppressed.',
			textMatches: true,
		});

	});

	test('puts client information last and collapsed without excluding it from exported text', async () => {
		const { service } = createService();
		await service.trackDiscovery('startup', async () => [tunnel]);
		const snapshot = service.getSnapshot();
		const client = snapshot.sections.at(-1)!;

		assert.deepStrictEqual({
			titles: snapshot.sections.map(section => section.title),
			collapsed: client.collapsed,
			exported: client.entries.every(entry => snapshot.text.includes(`${entry.label}: ${entry.value}`)),
			containsRecommendation: /possible issue|No issue identified|Explicitly connect|Check protocol compatibility/.test(snapshot.text),
		}, {
			titles: ['Tunnel discovery successful with 1 tunnel', 'Mock host - no connection, not selectable', 'Recent activity logs', 'This client'],
			collapsed: true,
			exported: true,
			containsRecommendation: false,
		});
	});
});
