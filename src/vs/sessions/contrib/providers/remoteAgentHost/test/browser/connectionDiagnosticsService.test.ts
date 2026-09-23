/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { Codicon } from '../../../../../../base/common/codicons.js';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { VSBuffer } from '../../../../../../base/common/buffer.js';
import { URI } from '../../../../../../base/common/uri.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import { traceConnectionOperation, type IRemoteConnectionDiagnosticEvent } from '../../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { IRemoteAgentHostConnectionInfo, IRemoteAgentHostEntry, IRemoteAgentHostPendingConnection, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostAutoConnectSettingId, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ICachedTunnel, ITunnelAgentHostService, ITunnelInfo } from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { FileService } from '../../../../../../platform/files/common/fileService.js';
import { InMemoryFileSystemProvider } from '../../../../../../platform/files/common/inMemoryFilesystemProvider.js';
import { NullLogService } from '../../../../../../platform/log/common/log.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { CommandsRegistry } from '../../../../../../platform/commands/common/commands.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IQuickInputService, IQuickPick, IQuickPickItem, QuickInputHideReason } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IRemoteTunnelService } from '../../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { IAuthenticationService } from '../../../../../../workbench/services/authentication/common/authentication.js';
import { IWorkbenchEnvironmentService } from '../../../../../../workbench/services/environment/common/environmentService.js';
import { ConnectionDiagnosticsService } from '../../browser/connectionDiagnosticsService.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry, IAgentHostFilterService } from '../../../../../services/agentHostFilter/common/agentHostFilter.js';
import { IConnectionDiagnosticsService, IConnectionDiagnosticsSnapshot } from '../../browser/connectionDiagnostics.js';
import { RemoteAgentHostCommandIds } from '../../browser/remoteAgentHostActions.js';

suite('ConnectionDiagnosticsService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const tunnel: ITunnelInfo = { tunnelId: 'mock', clusterId: 'local', name: 'Mock host', protocolVersion: 5, hostConnectionCount: 1, tags: [] };

	function createService(web = true) {
		const changes = store.add(new Emitter<void>());
		const pendingChanges = store.add(new Emitter<void>());
		const remote = new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConnections = changes.event;
			override readonly onDidChangePendingConnections = pendingChanges.event;
			override pendingConnections: IRemoteAgentHostPendingConnection[] = [];
			override connections: IRemoteAgentHostConnectionInfo[] = [];
			override configuredEntries: IRemoteAgentHostEntry[] = [];
			override getConnection(): IAgentConnection | undefined { return undefined; }
			diagnostics: IRemoteConnectionDiagnosticEvent[] = [];
			override getConnectionDiagnostics() { return this.diagnostics; }
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
		const files = store.add(new FileService(new NullLogService()));
		store.add(files.registerProvider('test', store.add(new InMemoryFileSystemProvider())));
		const logFile = URI.parse('test:/window.log');
		instantiation.stub(IFileService, files);
		instantiation.stub(IWorkbenchEnvironmentService, { logFile });
		const service = store.add(instantiation.createInstance(class extends ConnectionDiagnosticsService {
			protected override get isWebPlatform(): boolean { return web; }
		}));
		return { service, remote, tunnels, changes, pendingChanges, configuration, instantiation, filter, files, logFile };
	}

	function values(snapshot: IConnectionDiagnosticsSnapshot, title: string): Record<string, string> {
		const section = snapshot.sections.find(section => section.title.startsWith(title));
		assert.ok(section, `Missing ${title} section`);
		return Object.fromEntries(section.entries.map(entry => [entry.label, entry.value]));
	}

	test('exports authoritative pending automatic setup and updates live host status before a connection exists', async () => {
		const { service, remote, filter, pendingChanges, files, logFile } = createService();
		filter.hosts = [{ id: 'host', address: 'tunnel:mock', label: 'Mock host', providerIds: ['mock'], grouped: false, connectable: true, icon: Codicon.remote, status: AgentHostFilterConnectionStatus.Disconnected }];
		remote.pendingConnections = [{ address: 'tunnel:mock', startedAt: Date.now() - 5000, userInitiated: false }];
		remote.diagnostics.push({ address: 'tunnel:mock', operationId: 'setup', phase: 'relay.connect', outcome: 'started', timestamp: remote.pendingConnections[0].startedAt });
		await files.writeFile(logFile, VSBuffer.fromString('2026-09-16 12:00:00.000 [info] [RemoteAgentHost] Connecting to mock host'));
		let notifications = 0;
		store.add(service.onDidChangeHostManagement(() => notifications++));
		pendingChanges.fire();
		const snapshot = await service.getSnapshot();
		const details = values(snapshot, 'Mock host');
		const pendingStatus = service.getHostManagementState().hosts[0].status;
		remote.pendingConnections = [];
		pendingChanges.fire();
		const completedSnapshot = await service.getSnapshot();
		assert.deepStrictEqual({
			pendingStatus,
			statusAfterCompletion: service.getHostManagementState().hosts[0].status,
			status: details['Connection status'],
			attempt: details['Connection attempt'],
			trigger: details['Attempt trigger'],
			entry: details['Connection entry present'],
			elapsed: Number(details['Attempt elapsed at capture (ms)']) >= 5000,
			exported: snapshot.text.includes('Connection attempt: Pending'),
			stage: details['Last observed connection stage'],
			logs: snapshot.text.includes('[RemoteAgentHost] Connecting to mock host'),
			completedStatus: values(completedSnapshot, 'Mock host')['Connection status'],
			historicalStartRetained: completedSnapshot.text.includes('relay.connect: started'),
			notified: notifications,
		}, {
			pendingStatus: 'connecting', statusAfterCompletion: 'disconnected', status: 'connecting',
			attempt: 'Pending', trigger: 'automatic', entry: 'No', elapsed: true, exported: true,
			stage: 'relay.connect: started', logs: true, completedStatus: 'No connection entry', historicalStartRetained: true, notified: 2,
		});
	});

	test('native host status does not change for pending setup metadata', async () => {
		const { service, remote, filter } = createService(false);
		filter.hosts = [{ id: 'host', address: 'tunnel:mock', label: 'Mock host', providerIds: ['mock'], grouped: false, connectable: true, icon: Codicon.remote, status: AgentHostFilterConnectionStatus.Disconnected }];
		remote.pendingConnections = [{ address: 'tunnel:mock', startedAt: Date.now(), userInitiated: false }];
		const details = values(await service.getSnapshot(), 'Mock host');
		assert.deepStrictEqual({
			live: service.getHostManagementState().hosts[0].status,
			status: details['Connection status'],
			attempt: details['Connection attempt'],
		}, { live: 'disconnected', status: 'No connection entry', attempt: undefined });
	});

	test('pending metadata does not replace established or retrying connection state', async () => {
		const { service, remote, filter } = createService();
		filter.hosts = [{ id: 'host', address: 'tunnel:mock', label: 'Mock host', providerIds: ['mock'], grouped: false, connectable: true, icon: Codicon.remote, status: AgentHostFilterConnectionStatus.Connecting }];
		remote.pendingConnections = [{ address: 'tunnel:mock', startedAt: Date.now(), userInitiated: false }];
		const states = [RemoteAgentHostConnectionStatus.connected, RemoteAgentHostConnectionStatus.reconnecting, RemoteAgentHostConnectionStatus.incompatible('Version mismatch', ['1'])];
		const actual = [];
		for (const status of states) {
			remote.connections = [{ address: 'tunnel:mock', name: 'Mock host', status }];
			actual.push({
				live: service.getHostManagementState().hosts[0].status,
				captured: values(await service.getSnapshot(), 'Mock host')['Connection status'],
			});
		}
		assert.deepStrictEqual(actual, [
			{ live: 'connected', captured: 'connected' },
			{ live: 'reconnecting', captured: 'reconnecting' },
			{ live: 'incompatible', captured: 'incompatible' },
		]);
	});

	test('shows online dismissed hosts even when the cache and picker are empty', async () => {
		const { service, tunnels } = createService();
		tunnels.dismissed.add('mock');
		await service.trackDiscovery('startup', async () => [tunnel]);
		const snapshot = await service.getSnapshot();

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

	test('collapsed host summary distinguishes connectivity from selectability', async () => {
		const { service, remote, filter } = createService();
		remote.connections = [{ address: 'tunnel:mock', name: 'Mock host', status: RemoteAgentHostConnectionStatus.connected }];
		filter.hosts = [{ id: 'host', address: 'tunnel:mock', label: 'Mock host', providerIds: ['mock'], grouped: false, connectable: true, icon: Codicon.remote, status: AgentHostFilterConnectionStatus.Connected }];
		const connected = (await service.getSnapshot()).sections;
		remote.connections = [{ ...remote.connections[0], status: RemoteAgentHostConnectionStatus.disconnected }];
		const disconnected = (await service.getSnapshot()).sections;
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
			suppressed: ['mock'],
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
		const snapshot = await service.getSnapshot();

		assert.deepStrictEqual({
			result: values(snapshot, 'Tunnel discovery').Result,
			hostRetained: snapshot.sections.some(section => section.title.startsWith('Mock host -')),
			containsRawError: /secret-value|private|Bearer/.test(snapshot.text),
			error: values(snapshot, 'Tunnel discovery').Error,
		}, {
			result: 'failed',
			hostRetained: true,
			containsRawError: false,
			error: 'Error: Private failure details https://relay/?[redacted]',
		});
	});

	test('shows persisted hidden host IDs before any discovery succeeds', async () => {
		const { service, tunnels } = createService();
		tunnels.dismissed.add('previous-host');
		tunnels.suppressed.add('hosted-here');
		const snapshot = await service.getSnapshot();

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
		const snapshot = await service.getSnapshot();
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
		const snapshot = await service.getSnapshot();

		assert.deepStrictEqual({
			attempt: values(snapshot, 'Tunnel discovery').Attempt,
			result: values(snapshot, 'Tunnel discovery').Result,
			hostRetained: snapshot.sections.some(section => section.title.startsWith('Mock host -')),
		}, { attempt: '#2', result: 'succeeded', hostRetained: true });
	});

	test('reports error messages with HTTP and network metadata without response bodies', async () => {
		const { service } = createService();
		const errors = [
			{ statusCode: 403, message: 'private server details' },
			{ code: 'ECONNREFUSED', message: 'private endpoint' },
			new Error('No authentication is available to enumerate tunnels.'),
		];
		const descriptions: string[] = [];
		for (const error of errors) {
			await assert.rejects(service.trackDiscovery('rediscover', async () => { throw error; }), caught => caught === error);
			descriptions.push(values(await service.getSnapshot(), 'Tunnel discovery').Error);
		}
		assert.deepStrictEqual(descriptions, [
			'Error: private server details; HTTP 403',
			'Error: private endpoint; code=ECONNREFUSED',
			'Error: No authentication is available to enumerate tunnels.',
		]);
	});

	test('records connection transitions, retry deadlines and removals without duplicate events', async () => {
		const { service, remote, changes } = createService();
		remote.connections = [{ address: 'tunnel:mock', name: 'Mock host', status: RemoteAgentHostConnectionStatus.connecting }];
		changes.fire();
		changes.fire();
		remote.connections = [{ ...remote.connections[0], status: RemoteAgentHostConnectionStatus.reconnectingUntil(1000) }];
		changes.fire();
		const retry = values(await service.getSnapshot(), 'Mock host')['Next reconnect attempt'];
		remote.connections = [];
		changes.fire();

		assert.deepStrictEqual({
			retry,
			activity: (await service.getSnapshot()).sections.find(section => section.title === 'Recent activity logs')?.entries.map(entry => entry.value),
		}, {
			retry: '1970-01-01T00:00:01.000Z',
			activity: [
				'tunnel:mock: connecting.',
				'tunnel:mock: reconnecting; next attempt at 1970-01-01T00:00:01.000Z.',
				'tunnel:mock: connection entry removed.',
			],
		});
	});

	test('excludes connection tokens, URL credentials, query strings and fragments', async () => {
		const { service, remote, changes } = createService();
		const address = 'wss://alice:password@example.test:443/?token=query-secret#fragment-secret';
		remote.configuredEntries = [{ name: address, connectionToken: 'connection-secret', connection: { type: RemoteAgentHostEntryType.WebSocket, address } }];
		remote.connections = [{ address, name: address, status: RemoteAgentHostConnectionStatus.connected }];
		changes.fire();
		service.recordHostAction(address, 'connect', true);
		const snapshot = await service.getSnapshot();

		assert.deepStrictEqual({
			address: values(snapshot, 'wss://example.test:443/').Address,
			exposesSecret: /alice|password|query-secret|fragment-secret|connection-secret/.test(snapshot.text),
		}, { address: 'wss://example.test:443/', exposesSecret: false });
	});

	test('bounded activity records explicit disconnect and copies the same displayed evidence', async () => {
		const { service } = createService();
		for (let i = 0; i < 105; i++) {
			service.recordHostAction(`tunnel:${i}`, 'disconnect', true);
		}
		const snapshot = await service.getSnapshot();
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

	test('shows setup evidence before a connection entry exists', async () => {
		const { service, remote } = createService();
		remote.configuredEntries = [{ name: 'Mock host', connection: { type: RemoteAgentHostEntryType.Tunnel, tunnelId: 'mock', clusterId: 'local' } }];
		remote.diagnostics.push({ address: 'tunnel:mock', operationId: 'setup', attemptId: 'attempt', phase: 'relay.connect', outcome: 'started', timestamp: 1000 });
		const pending = values(await service.getSnapshot(), 'Mock host');
		remote.diagnostics.push({ address: 'tunnel:mock', operationId: 'setup', attemptId: 'attempt', phase: 'relay.connect', outcome: 'failed', timestamp: 2000, error: { name: 'Error', message: 'Network Error', requestId: 'request-123' } });
		const failed = values(await service.getSnapshot(), 'Mock host');
		assert.deepStrictEqual({
			status: pending['Connection status'],
			start: pending['Last observed connection stage'],
			finish: failed['Last observed connection stage'],
			time: failed['Stage observed at'],
			error: failed['Stage error'],
			connections: remote.connections,
		}, {
			status: 'No connection entry',
			start: 'relay.connect: started',
			finish: 'relay.connect: failed',
			time: '1970-01-01T00:00:02.000Z',
			error: 'Error: Network Error; requestId=request-123',
			connections: [],
		});
	});

	test('discovery stage history preserves the rejection and redacts request secrets', async () => {
		const { service } = createService();
		const error = new Error('Failed https://relay/?token=private');
		await assert.rejects(service.trackDiscovery('rediscover', observer =>
			traceConnectionOperation(observer, 'discovery.enumeration', async () => { throw error; })), caught => caught === error);
		const snapshot = await service.getSnapshot();
		const events = snapshot.sections.find(section => section.title === 'Connection and discovery stages')!.entries;
		assert.deepStrictEqual({
			count: events.length,
			start: events[0].value.startsWith('discovery.enumeration: started'),
			failed: events[1].value.includes('Error: Failed https://relay/?[redacted]'),
			addresses: events.every(event => event.label.endsWith('discovery:1')),
			secret: snapshot.text.includes('private'),
		}, { count: 2, start: true, failed: true, addresses: true, secret: false });
	});

	test('snapshot captures Window logs and keeps that excerpt stable until refreshed', async () => {
		const { service, files, logFile } = createService();
		const prefix = '2026-09-16 12:00:00.000 [info] ';
		await files.writeFile(logFile, VSBuffer.fromString(`${prefix}[RemoteAgentHost] Connected to test-host\n[Other] private payload`));
		const snapshot = await service.getSnapshot();
		const section = snapshot.sections.at(-2)!;
		await files.writeFile(logFile, VSBuffer.fromString(`${prefix}[RemoteAgentHost] Reconnecting to test-host`));
		const refreshed = await service.getSnapshot();
		assert.deepStrictEqual({
			title: section.title,
			collapsed: section.collapsed,
			messages: values(snapshot, section.title).Messages,
			copied: snapshot.text.includes(`Messages: ${prefix}[RemoteAgentHost] Connected to test-host`),
			excludesPayload: !snapshot.text.includes('private payload'),
			refreshed: values(refreshed, section.title).Messages,
		}, {
			title: 'Connection-related Window log excerpt',
			collapsed: true,
			messages: `${prefix}[RemoteAgentHost] Connected to test-host`,
			copied: true,
			excludesPayload: true,
			refreshed: `${prefix}[RemoteAgentHost] Reconnecting to test-host`,
		});
	});

	test('missing Window logs are reported in the snapshot and exported text', async () => {
		const { service } = createService();
		const snapshot = await service.getSnapshot();
		const error = values(snapshot, 'Connection-related Window log excerpt')['Log collection failed'];
		assert.ok(error && snapshot.text.includes(`Log collection failed: ${error}`));
	});

	test('puts client information last and collapsed without excluding it from exported text', async () => {
		const { service } = createService();
		await service.trackDiscovery('startup', async () => [tunnel]);
		const snapshot = await service.getSnapshot();
		const client = snapshot.sections.at(-1)!;

		assert.deepStrictEqual({
			titles: snapshot.sections.map(section => section.title),
			collapsed: client.collapsed,
			exported: client.entries.every(entry => snapshot.text.includes(`${entry.label}: ${entry.value}`)),
			containsRecommendation: /possible issue|No issue identified|Explicitly connect|Check protocol compatibility/.test(snapshot.text),
		}, {
			titles: ['Tunnel discovery successful with 1 tunnel', 'Mock host - no connection, not selectable', 'Recent activity logs', 'Connection and discovery stages', 'Connection-related Window log excerpt', 'This client'],
			collapsed: true,
			exported: true,
			containsRecommendation: false,
		});
	});
});
