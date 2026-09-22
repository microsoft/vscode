/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { Emitter } from '../../../../../base/common/event.js';
import { DisposableMap, DisposableStore } from '../../../../../base/common/lifecycle.js';
import { mock } from '../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../base/test/common/utils.js';
import { AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY, AGENT_SDK_SETUP_RELOAD_REQUEST_KEY, agentSdkSetupStatusKey, type AgentSdkDownloadStatus, type IAgentSdkSetupRequest } from '../../../../../platform/agentHost/common/agentSdkSetup.js';
import { IAgentConnection, IAgentHostService } from '../../../../../platform/agentHost/common/agentService.js';
import { AgentHostConnectionsService } from '../../../../../platform/agentHost/browser/agentHostConnectionsService.js';
import { IAgentHostConnectionsService } from '../../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { agentHostAuthority } from '../../../../../platform/agentHost/common/agentHostUri.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IAgentSubscription } from '../../../../../platform/agentHost/common/state/agentSubscription.js';
import type { RootState } from '../../../../../platform/agentHost/common/state/protocol/state.js';
import { ActionType, type IRootConfigChangedAction } from '../../../../../platform/agentHost/common/state/sessionActions.js';
import { ROOT_STATE_URI } from '../../../../../platform/agentHost/common/state/sessionState.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { getSingletonServiceDescriptors } from '../../../../../platform/instantiation/common/extensions.js';
import { createServices } from '../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../platform/log/common/log.js';
import { IOpenerService } from '../../../../../platform/opener/common/opener.js';
import { ITelemetryData, ITelemetryService } from '../../../../../platform/telemetry/common/telemetry.js';
import { NullTelemetryServiceShape } from '../../../../../platform/telemetry/common/telemetryUtils.js';
import { IAgentSdkSetupService } from '../../browser/agentSdkSetupService.js';
import { ICodexAccountService } from '../../browser/codexAccountService.js';

suite('AgentSdkSetupService', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();

	function createRootState(initialDownloads: Readonly<Record<string, AgentSdkDownloadStatus>>) {
		const onDidChangeRootState = store.add(new Emitter<RootState>());
		const onDidError = store.add(new Emitter<Error>());
		let rootStateValue: RootState | Error | undefined = setupRootState(initialDownloads);
		const subscription = new class extends mock<IAgentSubscription<RootState>>() {
			override get value() {
				return rootStateValue;
			}
			override readonly onDidChange = onDidChangeRootState.event;
			override readonly onDidError = onDidError.event;
		}();
		const updateRootState = (state: Partial<RootState>) => {
			const previousState = rootStateValue instanceof Error ? undefined : rootStateValue;
			const nextState: RootState = { agents: [], ...previousState, ...state };
			rootStateValue = nextState;
			onDidChangeRootState.fire(nextState);
		};
		const setDownloads = (downloads: Readonly<Record<string, AgentSdkDownloadStatus>>) => updateRootState(setupRootState(downloads));
		const fail = (error: Error) => {
			rootStateValue = error;
			onDidError.fire(error);
		};
		return { subscription, updateRootState, setDownloads, fail, hasListeners: () => onDidChangeRootState.hasListeners() || onDidError.hasListeners() };
	}

	function createConnection(initialDownloads: Readonly<Record<string, AgentSdkDownloadStatus>>) {
		let rootState = createRootState(initialDownloads);
		const onAgentHostStart = store.add(new Emitter<void>());
		const onAgentHostExit = store.add(new Emitter<number>());
		const onDidDispose = store.add(new Emitter<void>());
		const dispatched: { channel: string; action: IRootConfigChangedAction }[] = [];
		let dispatchError: Error | undefined;
		let disposed = false;
		const connection = store.add(new class extends mock<IAgentHostService>() {
			override readonly clientId = 'test-client';
			override readonly onAgentHostStart = onAgentHostStart.event;
			override readonly onAgentHostExit = onAgentHostExit.event;
			override get rootState() {
				return rootState.subscription;
			}

			override dispatch(channel: string, action: Parameters<IAgentHostService['dispatch']>[1]): void {
				assert.ok(!disposed, 'Cannot dispatch to a disposed connection');
				if (dispatchError) {
					const error = dispatchError;
					dispatchError = undefined;
					throw error;
				}
				if (action.type === ActionType.RootConfigChanged) {
					dispatched.push({ channel, action });
				}
			}
			dispose(): void {
				if (!disposed) {
					disposed = true;
					onAgentHostExit.fire(0);
					onDidDispose.fire();
				}
			}
		}());
		const requestedAgents = () => dispatched.map(({ action }) => {
			const value = action.config[AGENT_SDK_SETUP_DOWNLOAD_REQUEST_KEY];
			assert.ok(value && typeof value === 'object');
			const request: Partial<IAgentSdkSetupRequest> = value;
			assert.ok(typeof request.agent === 'string');
			return request.agent;
		});
		return {
			connection,
			onDidDispose: onDidDispose.event,
			get rootState() { return rootState; },
			dispatched,
			requestedAgents,
			setDownloads: (downloads: Readonly<Record<string, AgentSdkDownloadStatus>>) => rootState.setDownloads(downloads),
			updateRootState: (state: Partial<RootState>) => rootState.updateRootState(state),
			failNextDispatch: (error: Error) => { dispatchError = error; },
			exit: () => onAgentHostExit.fire(0),
			restart: (downloads: Readonly<Record<string, AgentSdkDownloadStatus>>) => {
				rootState = createRootState(downloads);
				onAgentHostStart.fire();
			},
		};
	}

	function createFixture(initialDownloads: Readonly<Record<string, AgentSdkDownloadStatus>>, initialRemotes: Readonly<Record<string, ReturnType<typeof createConnection>>> = {}) {
		const host = createConnection(initialDownloads);
		const onDidChangeConnections = store.add(new Emitter<void>());
		const remoteDisposalListeners = store.add(new DisposableMap<string>());
		const remotes = new Map<string, { host: ReturnType<typeof createConnection>; status: RemoteAgentHostConnectionStatus }>();
		const remoteAgentHostService = new class extends mock<IRemoteAgentHostService>() {
			override readonly onDidChangeConnections = onDidChangeConnections.event;
			override get connections() {
				return [...remotes].map(([address, { host, status }]) => ({ address, name: address, clientId: host.connection.clientId, status }));
			}
			override getConnection(address: string) {
				const entry = remotes.get(address);
				return entry?.status.kind === 'connected' ? entry.host.connection : undefined;
			}
			override getConnectionByAuthority(authority: string) {
				const address = [...remotes.keys()].find(address => agentHostAuthority(address) === authority);
				return address ? this.getConnection(address) : undefined;
			}
		}();
		const setRemoteStatus = (address: string, status: RemoteAgentHostConnectionStatus) => {
			const entry = remotes.get(address);
			assert.ok(entry);
			entry.status = status;
			onDidChangeConnections.fire();
		};
		const connectRemote = (address: string, remote: ReturnType<typeof createConnection>) => {
			remotes.set(address, { host: remote, status: RemoteAgentHostConnectionStatus.connected });
			remoteDisposalListeners.set(address, remote.onDidDispose(() => setRemoteStatus(address, RemoteAgentHostConnectionStatus.disconnected)));
			onDidChangeConnections.fire();
		};
		const removeRemote = (address: string) => {
			remoteDisposalListeners.deleteAndDispose(address);
			remotes.delete(address);
			onDidChangeConnections.fire();
		};
		for (const [address, remote] of Object.entries(initialRemotes)) {
			connectRemote(address, remote);
		}
		const descriptor = getSingletonServiceDescriptors().find(([id]) => id === IAgentSdkSetupService)?.[1];
		assert.ok(descriptor);
		const telemetryEvents: { eventName: string | undefined; data: ITelemetryData | undefined }[] = [];
		const openedLinks: Parameters<IOpenerService['open']>[] = [];
		const traceMessages: string[] = [];
		const signInConnections: (IAgentConnection | undefined)[] = [];
		const serviceStore = store.add(new DisposableStore());
		const instantiationService = createServices(serviceStore, [
			[IAgentSdkSetupService, descriptor.ctor],
			[IAgentHostService, host.connection],
			[IAgentHostConnectionsService, AgentHostConnectionsService],
			[IRemoteAgentHostService, remoteAgentHostService],
			[ITelemetryService, new class extends NullTelemetryServiceShape {
				override publicLog2(eventName?: string, data?: ITelemetryData): void {
					telemetryEvents.push({ eventName, data });
				}
			}()],
			[ILogService, new class extends NullLogService {
				override trace(message: string): void {
					traceMessages.push(message);
				}
			}()],
			[IOpenerService, new class extends mock<IOpenerService>() {
				override async open(...args: Parameters<IOpenerService['open']>): Promise<boolean> {
					openedLinks.push(args);
					return true;
				}
			}()],
			[ICommandService, new class extends mock<ICommandService>() { }()],
			[ICodexAccountService, new class extends mock<ICodexAccountService>() {
				override readonly agent = 'codex';
				override signIn(connection?: IAgentConnection): void {
					signInConnections.push(connection);
				}
			}()],
		]);
		const service = instantiationService.get(IAgentSdkSetupService);
		return {
			service, serviceStore, telemetryEvents, openedLinks, traceMessages, signInConnections,
			connectRemote, removeRemote, setRemoteStatus,
			refreshRemoteConnections: () => onDidChangeConnections.fire(),
			...host,
			get rootState() { return host.rootState; },
		};
	}

	test('starts only missing selected SDKs and deduplicates concurrent requests', () => {
		const fixture = createFixture({
			claude: 'notDownloaded',
			codex: 'downloadOnUse',
			installed: 'ready',
			active: 'downloading',
		});

		fixture.service.requestDownload('claude', fixture.connection, { source: 'turn' });
		fixture.service.requestDownload('claude', fixture.connection, { source: 'turn' });
		fixture.service.requestDownload('installed', fixture.connection, { source: 'turn' });
		fixture.service.requestDownload('active', fixture.connection, { source: 'turn' });
		fixture.service.requestDownload('unpublished', fixture.connection, { source: 'turn' });
		fixture.service.requestDownload('codex', fixture.connection, { source: 'turn' });
		fixture.service.requestDownload('codex', fixture.connection, { source: 'turn' });

		assert.deepStrictEqual(fixture.requestedAgents(), ['claude', 'codex']);
	});

	for (const download of ['notDownloaded', 'downloadOnUse'] as const) {
		test(`keeps ${download} requests pending across unrelated root-state updates`, () => {
			const fixture = createFixture({ codex: download });

			fixture.service.requestDownload('codex', fixture.connection, { source: 'turn' });
			fixture.updateRootState({ activeSessions: 1 });
			const pendingAfterUpdate = fixture.service.isDownloadPending('codex', fixture.connection);
			fixture.service.requestDownload('codex', fixture.connection, { source: 'turn' });

			assert.deepStrictEqual({
				pendingAfterUpdate,
				requestedAgents: fixture.requestedAgents(),
			}, {
				pendingAfterUpdate: true,
				requestedAgents: ['codex'],
			});
		});
	}

	for (const download of ['downloading', 'ready'] as const) {
		test(`clears only the acknowledged request when an agent reports ${download}`, () => {
			const fixture = createFixture({ claude: 'notDownloaded', codex: 'downloadOnUse' });

			fixture.service.requestDownload('claude', fixture.connection, { source: 'turn' });
			fixture.service.requestDownload('codex', fixture.connection, { source: 'turn' });
			fixture.setDownloads({ claude: download, codex: 'downloadOnUse' });

			assert.deepStrictEqual({
				claudePending: fixture.service.isDownloadPending('claude', fixture.connection),
				codexPending: fixture.service.isDownloadPending('codex', fixture.connection),
			}, {
				claudePending: false,
				codexPending: true,
			});
		});
	}

	test('allows a failed download to be retried without disturbing another agent', () => {
		const fixture = createFixture({ claude: 'notDownloaded', codex: 'downloadOnUse' });

		fixture.service.requestDownload('claude', fixture.connection, { source: 'turn' });
		fixture.service.requestDownload('codex', fixture.connection, { source: 'turn' });
		fixture.setDownloads({ claude: 'downloading', codex: 'downloadOnUse' });
		fixture.service.requestDownload('claude', fixture.connection, { source: 'turn' });
		fixture.setDownloads({ claude: 'notDownloaded', codex: 'downloadOnUse' });
		fixture.service.requestDownload('claude', fixture.connection, { source: 'turn' });
		fixture.service.requestDownload('codex', fixture.connection, { source: 'turn' });

		assert.deepStrictEqual(fixture.requestedAgents(), ['claude', 'codex', 'claude']);
	});

	test('downloads a missing remote SDK without changing the ambient host setup', () => {
		const fixture = createFixture({ claude: 'ready' });
		const remote = createConnection({ claude: 'notDownloaded' });
		const remoteStates: string[] = [];
		store.add(fixture.service.onDidChangeSetups(setups => {
			const setup = setups.find(setup => setup.host.connection === remote.connection);
			if (setup) {
				remoteStates.push(setup.download);
			}
		}));
		fixture.connectRemote('remote', remote);

		fixture.service.requestDownload('claude', remote.connection, { source: 'turn' });
		remote.setDownloads({ claude: 'downloading' });
		remote.setDownloads({ claude: 'ready' });

		assert.deepStrictEqual({
			localRequests: fixture.requestedAgents(),
			remoteRequests: remote.requestedAgents(),
			channels: remote.dispatched.map(request => request.channel),
			localDownload: fixture.service.setups[0].download,
			localPending: fixture.service.isDownloadPending('claude', fixture.connection),
			remoteStates,
		}, {
			localRequests: [],
			remoteRequests: ['claude'],
			channels: [ROOT_STATE_URI],
			localDownload: 'ready',
			localPending: false,
			remoteStates: ['notDownloaded', 'notDownloaded', 'notDownloaded', 'downloading', 'ready'],
		});
	});

	test('tracks connections that are already connected when the service starts', () => {
		const remote = createConnection({ claude: 'notDownloaded' });
		const fixture = createFixture({}, { remote });

		fixture.service.requestDownload('claude', remote.connection, { source: 'turn' });

		assert.deepStrictEqual({
			hasListeners: remote.rootState.hasListeners(),
			requests: remote.requestedAgents(),
		}, {
			hasListeners: true,
			requests: ['claude'],
		});
	});

	test('publishes only named agents on live hosts without blocking SDK prefetch', () => {
		const fixture = createFixture({ claude: 'notDownloaded', codex: 'notDownloaded' });
		fixture.updateRootState({ agents: [] });
		const beforeMetadata = fixture.service.setups;
		fixture.service.requestDownload('claude', fixture.connection, { source: 'turn' });
		fixture.updateRootState({
			agents: [
				{ provider: 'claude', displayName: 'Claude', description: '', models: [] },
				{ provider: 'codex', displayName: '', description: '', models: [] },
			],
		});

		assert.deepStrictEqual({
			beforeMetadata,
			namedAgents: fixture.service.setups.map(setup => [setup.agent, setup.displayName]),
			requests: fixture.requestedAgents(),
		}, {
			beforeMetadata: [],
			namedAgents: [['claude', 'Claude']],
			requests: ['claude'],
		});
	});

	test('assigns stable opaque setup identities even when remote hosts share a client ID', () => {
		const first = createConnection({ claude: 'notDownloaded' });
		const second = createConnection({ claude: 'notDownloaded' });
		const fixture = createFixture({}, { first, second });
		const initialIds = fixture.service.setups.map(setup => setup.id);
		first.updateRootState({ activeSessions: 1 });
		fixture.refreshRemoteConnections();
		const updatedIds = fixture.service.setups.map(setup => setup.id);

		assert.deepStrictEqual({
			sameClientId: first.connection.clientId === second.connection.clientId,
			distinctIds: new Set(initialIds).size,
			stableIds: updatedIds,
			exposesHostOrClientId: initialIds.some(id => ['first', 'second', first.connection.clientId].some(value => id.includes(value))),
		}, {
			sameClientId: true,
			distinctIds: 2,
			stableIds: initialIds,
			exposesHostOrClientId: false,
		});
	});

	test('does not track or dispatch to a connection outside the host services', () => {
		const fixture = createFixture({});
		const remote = createConnection({ claude: 'notDownloaded' });

		fixture.service.requestDownload('claude', remote.connection, { source: 'turn' });

		assert.deepStrictEqual({
			hasListeners: remote.rootState.hasListeners(),
			requests: remote.requestedAgents(),
			traceMessages: fixture.traceMessages,
		}, {
			hasListeners: false,
			requests: [],
			traceMessages: ['[AgentSdkSetup] claude: skipping download request for an unavailable connection'],
		});
	});

	test('uses remote setup status rather than the ambient status to decide whether to download', () => {
		const fixture = createFixture({ claude: 'notDownloaded', codex: 'notDownloaded' });
		const remote = createConnection({ claude: 'ready', codex: 'downloading' });
		fixture.connectRemote('remote', remote);

		fixture.service.requestDownload('claude', remote.connection, { source: 'turn' });
		fixture.service.requestDownload('codex', remote.connection, { source: 'turn' });
		fixture.service.requestDownload('unpublished', remote.connection, { source: 'turn' });

		assert.deepStrictEqual([fixture.requestedAgents(), remote.requestedAgents()], [[], []]);
	});

	test('deduplicates and retries the same provider independently on each host', () => {
		const fixture = createFixture({ claude: 'downloadOnUse' });
		const firstRemote = createConnection({ claude: 'downloadOnUse' });
		const secondRemote = createConnection({ claude: 'downloadOnUse' });
		fixture.connectRemote('first', firstRemote);
		fixture.connectRemote('second', secondRemote);
		const hosts = [fixture, firstRemote, secondRemote];

		for (const host of hosts) {
			fixture.service.requestDownload('claude', host.connection, { source: 'turn' });
			host.updateRootState({ activeSessions: 1 });
			fixture.service.requestDownload('claude', host.connection, { source: 'turn' });
		}
		firstRemote.setDownloads({ claude: 'downloading' });
		firstRemote.setDownloads({ claude: 'notDownloaded' });
		for (const host of hosts) {
			fixture.service.requestDownload('claude', host.connection, { source: 'turn' });
		}

		assert.deepStrictEqual(hosts.map(host => host.requestedAgents()), [['claude'], ['claude', 'claude'], ['claude']]);
	});

	test('shares pending local requests between explicit downloads and first use', () => {
		const fixture = createFixture({ claude: 'notDownloaded', codex: 'downloadOnUse' });

		fixture.service.requestDownload('claude', fixture.connection, { source: 'setup' });
		fixture.service.requestDownload('claude', fixture.connection, { source: 'turn' });
		fixture.service.requestDownload('codex', fixture.connection, { source: 'turn' });
		fixture.service.requestDownload('codex', fixture.connection, { source: 'setup' });

		assert.deepStrictEqual(fixture.requestedAgents(), ['claude', 'codex']);
	});

	test('records a Download click only for an explicit setup action', () => {
		const fixture = createFixture({ claude: 'notDownloaded', codex: 'downloadOnUse' });

		fixture.service.requestDownload('codex', fixture.connection, { source: 'turn' });
		fixture.service.requestDownload('claude', fixture.connection, { source: 'setup' });

		assert.deepStrictEqual({
			requestedAgents: fixture.requestedAgents(),
			telemetryEvents: fixture.telemetryEvents,
		}, {
			requestedAgents: ['codex', 'claude'],
			telemetryEvents: [{
				eventName: 'agentHost.agentSdkSetup',
				data: { agent: 'claude', step: 'downloadClicked' },
			}],
		});
	});

	test('the request source never selects the download host', () => {
		const fixture = createFixture({ claude: 'notDownloaded' });
		const first = createConnection({ claude: 'notDownloaded' });
		const second = createConnection({ claude: 'notDownloaded' });
		fixture.connectRemote('first', first);
		fixture.connectRemote('second', second);

		fixture.service.requestDownload('claude', first.connection, { source: 'setup' });
		fixture.service.requestDownload('claude', first.connection, { source: 'turn' });
		fixture.service.requestDownload('claude', second.connection, { source: 'turn' });
		fixture.service.requestDownload('claude', second.connection, { source: 'setup' });

		assert.deepStrictEqual({
			requests: [fixture, first, second].map(host => host.requestedAgents()),
			pending: [fixture, first, second].map(host => fixture.service.isDownloadPending('claude', host.connection)),
		}, {
			requests: [[], ['claude'], ['claude']],
			pending: [false, true, true],
		});
	});

	test('reload, documentation, and account setup use the supplied remote connection', () => {
		const fixture = createFixture({ codex: 'ready' });
		const remote = createConnection({ codex: 'ready' });
		fixture.connectRemote('remote', remote);
		fixture.updateRootState({
			_meta: { [agentSdkSetupStatusKey('codex')]: { download: 'ready', setupDocsUrl: 'https://example.com/local' } },
		});
		remote.updateRootState({
			_meta: { [agentSdkSetupStatusKey('codex')]: { download: 'ready', setupDocsUrl: 'https://example.com/remote' } },
		});

		fixture.service.requestReload('codex', remote.connection);
		fixture.service.openSetupDocs('codex', remote.connection);
		fixture.service.signIn('codex', remote.connection);

		assert.deepStrictEqual({
			ambientRequests: fixture.dispatched,
			remoteKeys: remote.dispatched.map(({ action }) => Object.keys(action.config)),
			openedLinks: fixture.openedLinks,
			signInConnections: fixture.signInConnections,
		}, {
			ambientRequests: [],
			remoteKeys: [[AGENT_SDK_SETUP_RELOAD_REQUEST_KEY]],
			openedLinks: [['https://example.com/remote', { openExternal: true }]],
			signInConnections: [remote.connection],
		});
	});

	test('stale setup actions reject without falling back to the ambient connection', () => {
		const fixture = createFixture({ claude: 'notDownloaded' });
		const remote = createConnection({ claude: 'notDownloaded' });
		fixture.connectRemote('remote', remote);
		remote.connection.dispose();

		assert.throws(() => fixture.service.requestDownload('claude', remote.connection, { source: 'setup' }), /disconnected/);
		assert.throws(() => fixture.service.requestReload('claude', remote.connection), /disconnected/);
		assert.deepStrictEqual([fixture.dispatched, remote.dispatched], [[], []]);
	});

	test('opens the latest ambient setup documentation without using remote setup links', () => {
		const fixture = createFixture({ claude: 'notDownloaded' });
		const remote = createConnection({ claude: 'notDownloaded' });
		fixture.connectRemote('remote', remote);
		remote.updateRootState({
			_meta: { [agentSdkSetupStatusKey('claude')]: { download: 'notDownloaded', setupDocsUrl: 'https://example.com/remote' } },
		});
		fixture.service.openSetupDocs('claude', fixture.connection);
		fixture.updateRootState({
			_meta: { [agentSdkSetupStatusKey('claude')]: { download: 'notDownloaded', setupDocsUrl: 'https://example.com/ambient' } },
		});
		fixture.service.openSetupDocs('claude', fixture.connection);
		fixture.setDownloads({ claude: 'ready' });
		fixture.service.openSetupDocs('claude', fixture.connection);

		assert.deepStrictEqual(fixture.openedLinks, [['https://example.com/ambient', { openExternal: true }]]);
	});

	test('releases a disposed connection without a caller-managed registration', () => {
		const fixture = createFixture({});
		const remote = createConnection({ claude: 'notDownloaded' });
		fixture.connectRemote('remote', remote);
		fixture.service.requestDownload('claude', remote.connection, { source: 'turn' });
		remote.connection.dispose();
		const oldRootHasListeners = remote.rootState.hasListeners();
		fixture.service.requestDownload('claude', remote.connection, { source: 'turn' });

		const replacement = createConnection({ claude: 'notDownloaded' });
		fixture.connectRemote('remote', replacement);
		fixture.service.requestDownload('claude', replacement.connection, { source: 'turn' });

		assert.deepStrictEqual({
			oldRootHasListeners,
			requests: [remote.requestedAgents(), replacement.requestedAgents()],
			traceMessages: fixture.traceMessages,
		}, {
			oldRootHasListeners: false,
			requests: [['claude'], ['claude']],
			traceMessages: ['[AgentSdkSetup] claude: skipping download request for an unavailable connection'],
		});
	});

	test('releases listeners when a remote host is removed from the catalog', () => {
		const fixture = createFixture({});
		const remote = createConnection({ claude: 'notDownloaded' });
		fixture.connectRemote('remote', remote);
		fixture.service.requestDownload('claude', remote.connection, { source: 'turn' });

		fixture.removeRemote('remote');
		fixture.service.requestDownload('claude', remote.connection, { source: 'turn' });

		assert.deepStrictEqual({
			hasListeners: remote.rootState.hasListeners(),
			requests: remote.requestedAgents(),
		}, {
			hasListeners: false,
			requests: ['claude'],
		});
	});

	test('releases all root listeners when the setup service is disposed', () => {
		const fixture = createFixture({ claude: 'notDownloaded' });
		const remote = createConnection({ claude: 'notDownloaded' });
		fixture.connectRemote('remote', remote);

		fixture.serviceStore.dispose();
		fixture.refreshRemoteConnections();

		assert.deepStrictEqual({
			ambientHasListeners: fixture.rootState.hasListeners(),
			remoteHasListeners: remote.rootState.hasListeners(),
		}, {
			ambientHasListeners: false,
			remoteHasListeners: false,
		});
	});

	test('disposing a replaced connection does not remove tracking for its replacement', () => {
		const fixture = createFixture({});
		const remote = createConnection({ claude: 'notDownloaded' });
		fixture.connectRemote('remote', remote);
		fixture.service.requestDownload('claude', remote.connection, { source: 'turn' });
		const replacement = createConnection({ claude: 'notDownloaded' });
		fixture.connectRemote('remote', replacement);
		remote.connection.dispose();

		fixture.service.requestDownload('claude', replacement.connection, { source: 'turn' });
		fixture.service.requestDownload('claude', replacement.connection, { source: 'turn' });

		assert.deepStrictEqual({
			oldRootHasListeners: remote.rootState.hasListeners(),
			newRootHasListeners: replacement.rootState.hasListeners(),
			requests: replacement.requestedAgents(),
		}, {
			oldRootHasListeners: false,
			newRootHasListeners: true,
			requests: ['claude'],
		});
	});

	for (const download of ['notDownloaded', 'downloadOnUse'] as const) {
		test(`retries an unacknowledged ${download} request after same-client recovery`, () => {
			const fixture = createFixture({ claude: download });
			const remote = createConnection({ claude: download });
			const otherRemote = createConnection({ claude: download });
			fixture.connectRemote('remote', remote);
			fixture.connectRemote('other', otherRemote);
			const hosts = [fixture, remote, otherRemote];
			for (const host of hosts) {
				fixture.service.requestDownload('claude', host.connection, { source: 'turn' });
			}
			const originalRoot = remote.connection.rootState;
			const originalClientId = remote.connection.clientId;

			fixture.setRemoteStatus('remote', RemoteAgentHostConnectionStatus.reconnecting);
			const listenersWhileReconnecting = remote.rootState.hasListeners();
			fixture.setRemoteStatus('remote', RemoteAgentHostConnectionStatus.reconnectingUntil(1000));
			fixture.service.requestDownload('claude', remote.connection, { source: 'turn' });
			fixture.setRemoteStatus('remote', RemoteAgentHostConnectionStatus.connected);
			fixture.refreshRemoteConnections();
			for (const host of hosts) {
				fixture.service.requestDownload('claude', host.connection, { source: 'turn' });
				fixture.refreshRemoteConnections();
				fixture.service.requestDownload('claude', host.connection, { source: 'turn' });
			}

			assert.deepStrictEqual({
				listenersWhileReconnecting,
				sameRoot: remote.connection.rootState === originalRoot,
				sameClientId: remote.connection.clientId === originalClientId,
				requests: hosts.map(host => host.requestedAgents()),
			}, {
				listenersWhileReconnecting: false,
				sameRoot: true,
				sameClientId: true,
				requests: [['claude'], ['claude', 'claude'], ['claude']],
			});
		});
	}

	test('rebinds and clears pending requests when the ambient host restarts', () => {
		const fixture = createFixture({ claude: 'downloadOnUse' });
		const oldRoot = fixture.rootState;
		fixture.service.requestDownload('claude', fixture.connection, { source: 'turn' });

		fixture.restart({ claude: 'downloadOnUse' });
		fixture.service.requestDownload('claude', fixture.connection, { source: 'turn' });

		assert.deepStrictEqual({
			oldRootHasListeners: oldRoot.hasListeners(),
			requests: fixture.requestedAgents(),
		}, {
			oldRootHasListeners: false,
			requests: ['claude', 'claude'],
		});
	});

	test('drops ambient setup state on exit and restores tracking on restart', () => {
		const fixture = createFixture({ claude: 'notDownloaded' });
		fixture.service.requestDownload('claude', fixture.connection, { source: 'setup' });

		fixture.exit();
		const afterExit = {
			hasListeners: fixture.rootState.hasListeners(),
			pending: fixture.service.isDownloadPending('claude', fixture.connection),
			setups: fixture.service.setups,
		};
		fixture.service.requestDownload('claude', fixture.connection, { source: 'turn' });
		fixture.restart({ claude: 'notDownloaded' });
		fixture.service.requestDownload('claude', fixture.connection, { source: 'turn' });

		assert.deepStrictEqual({
			afterExit,
			hasListenersAfterRestart: fixture.rootState.hasListeners(),
			requests: fixture.requestedAgents(),
		}, {
			afterExit: { hasListeners: false, pending: false, setups: [] },
			hasListenersAfterRestart: true,
			requests: ['claude', 'claude'],
		});
	});

	test('allows a remote request to retry after a root-state error', () => {
		const fixture = createFixture({});
		const remote = createConnection({ claude: 'downloadOnUse' });
		fixture.connectRemote('remote', remote);
		fixture.service.requestDownload('claude', remote.connection, { source: 'turn' });

		remote.rootState.fail(new Error('Connection lost'));
		fixture.service.requestDownload('claude', remote.connection, { source: 'turn' });
		remote.setDownloads({ claude: 'downloadOnUse' });
		fixture.service.requestDownload('claude', remote.connection, { source: 'turn' });

		assert.deepStrictEqual(remote.requestedAgents(), ['claude', 'claude']);
	});

	test('propagates dispatch errors without leaving a request pending', () => {
		const fixture = createFixture({ claude: 'notDownloaded' });
		const error = new Error('Dispatch failed');
		fixture.failNextDispatch(error);

		assert.throws(() => fixture.service.requestDownload('claude', fixture.connection, { source: 'turn' }), error);
		fixture.service.requestDownload('claude', fixture.connection, { source: 'turn' });

		assert.deepStrictEqual(fixture.requestedAgents(), ['claude']);
	});
});

function setupRootState(downloads: Readonly<Record<string, AgentSdkDownloadStatus>>): RootState {
	return {
		agents: Object.keys(downloads).map(provider => ({ provider, displayName: provider, description: '', models: [] })),
		_meta: Object.fromEntries(Object.entries(downloads).map(([agent, download]) => [agentSdkSetupStatusKey(agent), { download }])),
	};
}
