/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { observableValue } from '../../../../../../base/common/observable.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IDiscoveredDevContainer } from '../../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { IRemoteAgentHostService, readSSHRemoteAgentHostEntries, removeSSHRemoteAgentHostEntry, RemoteAgentHostConnectionStatus, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ICachedTunnel, ITunnelAgentHostService, ITunnelInfo } from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IWSLCachedDistro, IWSLRemoteAgentHostService } from '../../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IInputOptions, IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { DevContainerAgentHostEnabledSettingId, IDevContainerAgentHostService } from '../../../../../common/devContainerAgentHostService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { RemotesModel } from '../../browser/remotesModel.js';

suite('RemotesModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const tunnel: ITunnelInfo = { tunnelId: 'laptop', clusterId: 'eu', name: 'Laptop', protocolVersion: 6, tags: [], hostConnectionCount: 1 };

	function setup(discover: (token: CancellationToken) => Promise<readonly IDiscoveredDevContainer[]> = async () => [{ id: 'container', name: 'Project', workspaceFolder: '/project' }], restoreProvidersDuringInitialization = false) {
		const instantiationService = store.add(new TestInstantiationService());
		const storage = store.add(new InMemoryStorageService());
		const configuration = new TestConfigurationService({
			[RemoteAgentHostsEnabledSettingId]: true,
			[DevContainerAgentHostEnabledSettingId]: true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		let distros: IWSLCachedDistro[] = [{ distro: 'Ubuntu', name: 'Ubuntu' }];
		let tunnels: ICachedTunnel[] = [];
		let workspaces: { workspaceUri: URI; name: string }[] = [];
		const providersChanged = store.add(new Emitter<{ added: []; removed: [] }>());
		let workspacesInitialized = false;
		let initializingWorkspaces = false;
		let initializationReentered = false;
		const dismissed = new Set<string>();
		const removals: string[] = [];
		const connectionChanges: { id: string; connected: boolean }[] = [];
		const reconnects: string[] = [];
		const displayNames = new Map<string, string>();
		const displayNamesChanged = store.add(new Emitter<string>());
		const renameInputs: IInputOptions[] = [];
		let renameInput: string | undefined;
		const setDisplayName = (address: string, name: string | undefined) => {
			if (name?.trim()) {
				displayNames.set(address, name.trim());
			} else {
				displayNames.delete(address);
			}
			displayNamesChanged.fire(address);
		};
		let connectionFailure: Error | undefined;
		const logEntries: { message: string; args: readonly unknown[] }[] = [];
		let wslDiscoveryCalls = 0;
		let sshDiscovery: () => Promise<string[]> = async () => ['build', 'build'];
		let tunnelDiscovery: () => Promise<ITunnelInfo[]> = async () => [tunnel];
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(ILogService, new class extends NullLogService {
			override warn(message: string, ...args: unknown[]) { logEntries.push({ message, args }); }
		}());
		instantiationService.stub(IRemoteAgentHostService, {
			connections: [],
			onDidChangeConnections: Event.None,
			onDidChangeDisplayName: displayNamesChanged.event,
			getDisplayNameOverride: address => displayNames.get(address),
			setDisplayName,
			reconnect: address => { reconnects.push(address); },
			waitForConnection: async address => {
				if (connectionFailure) {
					throw connectionFailure;
				}
				return { address, name: address, status: RemoteAgentHostConnectionStatus.connected };
			},
		});
		instantiationService.stub(IQuickInputService, {
			input: async options => {
				if (options) {
					renameInputs.push(options);
				}
				return renameInput;
			},
		});
		instantiationService.stub(ISSHRemoteAgentHostService, {
			listSSHConfigHosts: () => sshDiscovery(),
			resolveSSHConfig: async () => ({ hostname: 'build.example', user: 'developer', port: 22, identityFile: [], identityAgent: undefined, forwardAgent: false, userKnownHostsFiles: [], globalKnownHostsFiles: [], strictHostKeyChecking: undefined }),
		});
		instantiationService.stub(IWSLRemoteAgentHostService, {
			onDidChangeConnections: Event.None,
			getCachedDistros: () => distros,
			listDistros: async () => {
				wslDiscoveryCalls++;
				return [{ name: 'Ubuntu', isDefault: true, isRunning: false, version: 2 }];
			},
			cacheDistro: distro => { distros = [distro]; },
		});
		instantiationService.stub(ITunnelAgentHostService, {
			onDidChangeTunnels: Event.None,
			getCachedTunnels: () => tunnels,
			getAuthProvider: async () => 'github',
			listTunnels: () => tunnelDiscovery(),
			isTunnelDismissed: id => dismissed.has(id),
			clearTunnelDismissal: id => { dismissed.delete(id); },
			cacheTunnel: (value, authProvider) => { tunnels = [{ ...value, authProvider }]; },
			connect: async value => { reconnects.push(`tunnel:${value.tunnelId}`); },
		});
		instantiationService.stub(IDevContainerAgentHostService, {
			onDidChangeAvailability: Event.None,
			getWorkspaces: () => {
				if (restoreProvidersDuringInitialization) {
					initializationReentered ||= initializingWorkspaces;
					if (!workspacesInitialized) {
						workspacesInitialized = true;
						initializingWorkspaces = true;
						providersChanged.fire({ added: [], removed: [] });
						initializingWorkspaces = false;
					}
				}
				return workspaces;
			},
			addWorkspace: (workspaceUri, name) => { workspaces = [{ workspaceUri, name }]; },
			removeWorkspace: async () => { workspaces = []; removals.push('container'); },
		});
		const providers = new Map(['ssh:build', 'wsl:Ubuntu', 'tunnel:laptop'].map(address => {
			const provider = new class extends mock<IAgentHostSessionsProvider>() {
				override readonly id = `agenthost-${address}`;
				override readonly remoteAddress = address;
				override canRemove = true;
				override get label(): string {
					return displayNames.get(address) ?? (address === 'ssh:build' ? 'build' : address === 'wsl:Ubuntu' ? 'Ubuntu' : 'Laptop');
				}
				override readonly connectionStatus = observableValue<RemoteAgentHostConnectionStatus>(this, RemoteAgentHostConnectionStatus.disconnected);
				override async connect() {
					connectionChanges.push({ id: address, connected: true });
					if (connectionFailure) {
						throw connectionFailure;
					}
					this.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
				}
				override async disconnect() {
					connectionChanges.push({ id: address, connected: false });
					if (connectionFailure) {
						throw connectionFailure;
					}
					await this.remove();
					this.connectionStatus.set(RemoteAgentHostConnectionStatus.disconnected, undefined);
				}
				override async remove() {
					removals.push(address);
					if (address === 'ssh:build') {
						removeSSHRemoteAgentHostEntry(storage, address);
					} else if (address === 'wsl:Ubuntu') {
						distros = [];
					} else {
						dismissed.add('laptop');
						tunnels = [];
					}
				}
			}();
			return [address, provider] as const;
		}));
		instantiationService.stub(ISessionsProvidersService, {
			onDidChangeProviders: providersChanged.event,
			getProviders: () => [...providers.values()],
		});
		const model = store.add(instantiationService.createInstance(RemotesModel, discover));
		return {
			model, storage, configuration, removals, logEntries, initializationReentered, providers, providersChanged, connectionChanges, reconnects,
			failConnection: (error: Error) => { connectionFailure = error; },
			renameInputs, setRenameInput: (value: string | undefined) => { renameInput = value; }, setDisplayName,
			getWSLDiscoveryCalls: () => wslDiscoveryCalls, setSSHDiscovery: (discovery: () => Promise<string[]>) => { sshDiscovery = discovery; },
			setTunnelDiscovery: (discovery: () => Promise<ITunnelInfo[]>) => { tunnelDiscovery = discovery; },
		};
	}

	test('does not re-enter a lazy inventory service while it restores providers', () => {
		const { model, initializationReentered } = setup(undefined, true);
		assert.deepStrictEqual({
			initializationReentered,
			registered: model.remotes.get().map(remote => remote.id),
		}, { initializationReentered: false, registered: ['wsl:Ubuntu'] });
	});

	test('merges discovery and registered remotes, deduplicates and groups in the requested order', async () => {
		const { model } = setup();
		await model.refresh(CancellationToken.None);
		assert.deepStrictEqual(model.remotes.get().map(({ kind, name, canRemove }) => ({ kind, name, canRemove })), [
			{ kind: 'ssh', name: 'build', canRemove: false },
			{ kind: 'wsl', name: 'Ubuntu', canRemove: true },
			{ kind: 'tunnel', name: 'Laptop', canRemove: false },
		]);
	});

	test('Remove forgets registered remotes and discovery can find them again', async () => {
		const { model, storage, removals } = setup();
		await model.refresh(CancellationToken.None);
		const ids = model.remotes.get().map(remote => remote.id);
		for (const id of ids) {
			await model.setConnected(id, true);
		}
		const entries = readSSHRemoteAgentHostEntries(storage);
		const removable = model.remotes.get().map(remote => remote.canRemove);
		for (const id of ids) {
			await model.remove(id);
		}
		const afterRemoval = model.remotes.get();
		await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({
			removable, afterRemoval, removals,
			ssh: entries[0],
			rediscovered: model.remotes.get().map(remote => ({ kind: remote.kind, canRemove: remote.canRemove })),
		}, {
			removable: [true, true, true], afterRemoval: [],
			removals: ['ssh:build', 'wsl:Ubuntu', 'tunnel:laptop'],
			ssh: { name: 'build', connectionToken: undefined, connection: { type: 'ssh', address: 'ssh:build', hostName: 'build.example', user: 'developer', port: 22, sshConfigHost: 'build' } },
			rediscovered: [{ kind: 'ssh', canRemove: false }, ...(isWindows ? [{ kind: 'wsl', canRemove: false }] : []), { kind: 'tunnel', canRemove: false }],
		});
	});

	test('identifies failed sources and logs details without returning raw errors to the UI', async () => {
		const { model, setSSHDiscovery, logEntries } = setup();
		await model.refresh(CancellationToken.None);
		const error = new Error('EACCES: permission denied reading /private/config');
		setSSHDiscovery(async () => { throw error; });
		const failedKinds = await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({ failedKinds, kinds: model.remotes.get().map(remote => remote.kind), logEntries }, {
			failedKinds: ['ssh'], kinds: ['ssh', 'wsl', 'tunnel'],
			logEntries: [{ message: '[Remotes] ssh discovery failed', args: [error] }],
		});
	});

	test('successful refresh replaces discovered rows and removes obsolete connection targets', async () => {
		const { model, setSSHDiscovery, setTunnelDiscovery } = setup();
		await model.refresh(CancellationToken.None);
		setSSHDiscovery(async () => ['replacement']);
		setTunnelDiscovery(async () => []);
		await model.refresh(CancellationToken.None);
		assert.deepStrictEqual(model.remotes.get().map(remote => remote.id), ['ssh:replacement', 'wsl:Ubuntu']);
		await assert.rejects(model.setConnected('ssh:build', true), /no longer available/);
		await assert.rejects(model.setConnected('tunnel:laptop', true), /no longer available/);
	});

	test('refresh retains registered remotes even when discovery no longer finds them', async () => {
		const { model, setSSHDiscovery, setTunnelDiscovery } = setup();
		await model.refresh(CancellationToken.None);
		await model.setConnected('ssh:build', true);
		await model.setConnected('tunnel:laptop', true);
		setSSHDiscovery(async () => []);
		setTunnelDiscovery(async () => []);
		await model.refresh(CancellationToken.None);
		assert.deepStrictEqual(model.remotes.get().map(({ id, canRemove }) => ({ id, canRemove })), [
			{ id: 'ssh:build', canRemove: true },
			{ id: 'wsl:Ubuntu', canRemove: true },
			{ id: 'tunnel:laptop', canRemove: true },
		]);
	});

	test('a failed source retains its discovery rows while successful sources are pruned', async () => {
		const { model, setSSHDiscovery, setTunnelDiscovery } = setup();
		await model.refresh(CancellationToken.None);
		setSSHDiscovery(async () => { throw new Error('SSH discovery failed'); });
		setTunnelDiscovery(async () => []);
		const failedKinds = await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({ failedKinds, ids: model.remotes.get().map(remote => remote.id) }, {
			failedKinds: ['ssh'], ids: ['ssh:build', 'wsl:Ubuntu'],
		});
	});

	test('a canceled discovery does not prune the last successful snapshot', async () => {
		const { model, setSSHDiscovery } = setup();
		await model.refresh(CancellationToken.None);
		const deferred = new DeferredPromise<string[]>();
		setSSHDiscovery(() => deferred.p);
		const cancellation = store.add(new CancellationTokenSource());
		const refresh = model.refresh(cancellation.token);
		cancellation.cancel();
		await deferred.complete([]);
		await refresh;
		assert.deepStrictEqual(model.remotes.get().map(remote => remote.id), ['ssh:build', 'wsl:Ubuntu', 'tunnel:laptop']);
	});

	test('does not publish canceled discovery results', async () => {
		const deferred = new DeferredPromise<string[]>();
		const { model, setSSHDiscovery } = setup();
		setSSHDiscovery(() => deferred.p);
		const cancellation = store.add(new CancellationTokenSource());
		const refresh = model.refresh(cancellation.token);
		cancellation.cancel();
		await deferred.complete(['late-host']);
		await refresh;
		assert.deepStrictEqual(model.remotes.get().filter(remote => remote.kind === 'ssh'), []);
	});

	test('does not discover or mutate when AI is disabled', async () => {
		let calls = 0;
		const { model, configuration } = setup(async () => { calls++; return []; });
		await configuration.setUserConfiguration('chat.disableAIFeatures', true);
		await model.refresh(CancellationToken.None);
		await assert.rejects(model.remove('wsl:Ubuntu'), /no longer available/);
		await assert.rejects(model.rename('wsl:Ubuntu'), /no longer available/);
		assert.strictEqual(calls, 0);
	});

	test('does not discover hidden Dev Containers even when the feature is enabled', async () => {
		let calls = 0;
		const { model } = setup(async () => {
			calls++;
			throw new Error('Docker unavailable');
		});
		const failures = await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({ calls, failures, containers: model.remotes.get().filter(remote => remote.kind === 'devContainer') }, {
			calls: 0, failures: [], containers: [],
		});
	});

	test('WSL discovery follows the platform', async () => {
		const { model, getWSLDiscoveryCalls } = setup();
		await model.remove('wsl:Ubuntu');
		await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({
			removable: model.remotes.get().filter(remote => remote.kind === 'wsl').map(remote => remote.canRemove),
			discoveryCalls: getWSLDiscoveryCalls(),
		}, { removable: isWindows ? [false] : [], discoveryCalls: isWindows ? 1 : 0 });
	});

	test('tracks provider connection state and stops observing removed providers', async () => {
		const { model, providers, providersChanged } = setup();
		await model.refresh(CancellationToken.None);
		const provider = providers.get('ssh:build')!;
		const observed = [];
		for (const status of [RemoteAgentHostConnectionStatus.connecting, RemoteAgentHostConnectionStatus.connected, RemoteAgentHostConnectionStatus.reconnecting, RemoteAgentHostConnectionStatus.incompatible('Update required', ['1'])]) {
			provider.connectionStatus.set(status, undefined);
			observed.push(model.remotes.get().find(remote => remote.id === 'ssh:build')?.connectionStatus.kind);
		}
		providers.delete('ssh:build');
		providersChanged.fire({ added: [], removed: [] });
		const afterRemoval = model.remotes.get();
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		assert.deepStrictEqual({
			observed, afterRemoval: afterRemoval.find(remote => remote.id === 'ssh:build')?.connectionStatus.kind,
			unsubscribed: model.remotes.get() === afterRemoval,
		}, { observed: ['connecting', 'connected', 'reconnecting', 'incompatible'], afterRemoval: 'disconnected', unsubscribed: true });
	});

	test('connect registers discovered remotes and disconnect uses existing provider behavior', async () => {
		const { model, connectionChanges } = setup();
		await model.refresh(CancellationToken.None);
		const ids = ['ssh:build', 'wsl:Ubuntu', 'tunnel:laptop'];
		for (const id of ids) {
			await model.setConnected(id, true);
			await model.setConnected(id, true);
		}
		const connected = model.remotes.get().map(({ canRemove, connectionStatus }) => [canRemove, connectionStatus.kind]);
		for (const id of ids) {
			await model.setConnected(id, false);
		}
		assert.deepStrictEqual({
			connectionChanges, connected, disconnected: model.remotes.get().map(({ canRemove, connectionStatus }) => [canRemove, connectionStatus.kind]),
		}, {
			connectionChanges: [...ids.map(id => ({ id, connected: true })), ...ids.map(id => ({ id, connected: false }))],
			connected: [[true, 'connected'], [true, 'connected'], [true, 'connected']],
			disconnected: [[false, 'disconnected'], [false, 'disconnected'], [false, 'disconnected']],
		});
	});

	test('connect works before newly registered providers have reconciled', async () => {
		const { model, providers, providersChanged, reconnects } = setup();
		await model.refresh(CancellationToken.None);
		providers.clear();
		providersChanged.fire({ added: [], removed: [] });
		for (const id of ['ssh:build', 'wsl:Ubuntu', 'tunnel:laptop']) {
			await model.setConnected(id, true);
		}
		assert.deepStrictEqual(reconnects, ['ssh:build', 'wsl:Ubuntu', 'tunnel:laptop']);
	});

	test('connection errors propagate and disabled AI prevents connection changes', async () => {
		const { model, configuration, failConnection, connectionChanges } = setup();
		await model.refresh(CancellationToken.None);
		const error = new Error('Connection refused');
		failConnection(error);
		await assert.rejects(model.setConnected('ssh:build', true), error);
		await configuration.setUserConfiguration('chat.disableAIFeatures', true);
		await assert.rejects(model.setConnected('ssh:build', false), /no longer available/);
		await assert.rejects(model.setConnected('missing', true), /no longer available/);
		assert.deepStrictEqual(connectionChanges, [{ id: 'ssh:build', connected: true }]);
	});

	test('Remove is unavailable for discovery-only or non-removable providers', async () => {
		const { model, providers, providersChanged, removals } = setup();
		await model.refresh(CancellationToken.None);
		await assert.rejects(model.remove('ssh:build'), /cannot be removed/);
		providers.get('wsl:Ubuntu')!.canRemove = false;
		providersChanged.fire({ added: [], removed: [] });
		await assert.rejects(model.remove('wsl:Ubuntu'), /cannot be removed/);
		assert.deepStrictEqual({ removals, canRemove: model.remotes.get().map(remote => remote.canRemove) }, {
			removals: [], canRemove: [false, false, false],
		});
	});

	test('Rename uses the Manage prompt and display-name overrides without changing the address', async () => {
		const { model, renameInputs, setRenameInput, setDisplayName } = setup();
		await model.refresh(CancellationToken.None);
		setRenameInput('Build machine');
		await model.rename('ssh:build');
		const renamed = model.remotes.get().find(remote => remote.id === 'ssh:build')!;
		setDisplayName('ssh:build', 'From another UI');
		const externalName = model.remotes.get().find(remote => remote.id === 'ssh:build')?.name;
		setRenameInput('');
		await model.rename('ssh:build');
		assert.deepStrictEqual({
			renamed: { name: renamed.name, address: renamed.id, canRemove: renamed.canRemove }, externalName,
			defaultName: model.remotes.get().find(remote => remote.id === 'ssh:build')?.name,
			input: { value: renameInputs[0].value, selection: renameInputs[0].valueSelection },
		}, {
			renamed: { name: 'Build machine', address: 'ssh:build', canRemove: false }, externalName: 'From another UI',
			defaultName: 'build', input: { value: 'build', selection: [0, 5] },
		});
	});

	test('Rename also works for discovery-only rows without registering or connecting them', async () => {
		const { model, storage, providers, providersChanged, setRenameInput, connectionChanges } = setup();
		await model.refresh(CancellationToken.None);
		providers.clear();
		providersChanged.fire({ added: [], removed: [] });
		setRenameInput('Discovered server');
		await model.rename('ssh:build');
		const remote = model.remotes.get().find(remote => remote.id === 'ssh:build')!;
		assert.deepStrictEqual({ name: remote.name, canRemove: remote.canRemove, entries: readSSHRemoteAgentHostEntries(storage), connectionChanges }, {
			name: 'Discovered server', canRemove: false, entries: [], connectionChanges: [],
		});
	});
});
