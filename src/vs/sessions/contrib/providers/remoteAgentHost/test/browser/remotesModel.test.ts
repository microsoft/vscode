/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IDiscoveredDevContainer } from '../../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { IRemoteAgentHostService, readSSHRemoteAgentHostEntries, removeSSHRemoteAgentHostEntry, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ICachedTunnel, ITunnelAgentHostService, ITunnelInfo } from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IWSLCachedDistro, IWSLRemoteAgentHostService } from '../../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
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
		const logEntries: { message: string; args: readonly unknown[] }[] = [];
		let wslDiscoveryCalls = 0;
		let sshDiscovery: () => Promise<string[]> = async () => ['build', 'build'];
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(ILogService, new class extends NullLogService {
			override warn(message: string, ...args: unknown[]) { logEntries.push({ message, args }); }
		}());
		instantiationService.stub(IRemoteAgentHostService, {});
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
			listTunnels: async () => [tunnel],
			isTunnelDismissed: id => dismissed.has(id),
			clearTunnelDismissal: id => { dismissed.delete(id); },
			cacheTunnel: (value, authProvider) => { tunnels = [{ ...value, authProvider }]; },
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
		instantiationService.stub(ISessionsProvidersService, {
			onDidChangeProviders: providersChanged.event,
			getProviders: () => ['ssh:build', 'wsl:Ubuntu', 'tunnel:laptop'].map(address => new class extends mock<IAgentHostSessionsProvider>() {
				override readonly id = `agenthost-${address}`;
				override readonly remoteAddress = address;
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
			}()),
		});
		const model = store.add(instantiationService.createInstance(RemotesModel, discover));
		return { model, storage, configuration, removals, logEntries, initializationReentered, getWSLDiscoveryCalls: () => wslDiscoveryCalls, setSSHDiscovery: (discovery: () => Promise<string[]>) => { sshDiscovery = discovery; } };
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
		assert.deepStrictEqual(model.remotes.get().map(({ kind, name, enabled }) => ({ kind, name, enabled })), [
			{ kind: 'ssh', name: 'build', enabled: false },
			{ kind: 'wsl', name: 'Ubuntu', enabled: true },
			{ kind: 'tunnel', name: 'Laptop', enabled: false },
			{ kind: 'devContainer', name: 'Project', enabled: false },
		]);
	});

	test('adds without calling connect and delegates removals while retaining unchecked rows', async () => {
		const { model, storage, removals } = setup();
		await model.refresh(CancellationToken.None);
		const ids = model.remotes.get().map(remote => remote.id);
		for (const id of ids) {
			await model.setEnabled(id, true);
		}
		const entries = readSSHRemoteAgentHostEntries(storage);
		const checked = model.remotes.get().map(remote => remote.enabled);
		for (const id of ids) {
			await model.setEnabled(id, false);
		}
		const unchecked = model.remotes.get().map(remote => remote.enabled);
		await model.setEnabled('wsl:Ubuntu', true);
		await model.setEnabled('tunnel:laptop', true);
		assert.deepStrictEqual({
			checked, unchecked, removals,
			ssh: entries[0],
			restored: model.remotes.get().filter(remote => remote.enabled).map(remote => remote.kind),
		}, {
			checked: [true, true, true, true], unchecked: [false, false, false, false],
			removals: ['ssh:build', 'wsl:Ubuntu', 'tunnel:laptop', 'container'],
			ssh: { name: 'build', connectionToken: undefined, connection: { type: 'ssh', address: 'ssh:build', hostName: 'build.example', user: 'developer', port: 22, sshConfigHost: 'build' } },
			restored: ['wsl', 'tunnel'],
		});
	});

	test('identifies failed sources and logs details without returning raw errors to the UI', async () => {
		const { model, setSSHDiscovery, logEntries } = setup();
		await model.refresh(CancellationToken.None);
		const error = new Error('EACCES: permission denied reading /private/config');
		setSSHDiscovery(async () => { throw error; });
		const failedKinds = await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({ failedKinds, kinds: model.remotes.get().map(remote => remote.kind), logEntries }, {
			failedKinds: ['ssh'], kinds: ['ssh', 'wsl', 'tunnel', 'devContainer'],
			logEntries: [{ message: '[Remotes] ssh discovery failed', args: [error] }],
		});
	});

	test('does not publish canceled discovery results', async () => {
		const deferred = new DeferredPromise<readonly IDiscoveredDevContainer[]>();
		const { model } = setup(() => deferred.p);
		const cancellation = store.add(new CancellationTokenSource());
		const refresh = model.refresh(cancellation.token);
		cancellation.cancel();
		await deferred.complete([{ id: 'late', name: 'Late container', workspaceFolder: '/late' }]);
		await refresh;
		assert.deepStrictEqual(model.remotes.get().filter(remote => remote.kind === 'devContainer'), []);
	});

	test('does not discover or mutate when AI is disabled', async () => {
		let calls = 0;
		const { model, configuration } = setup(async () => { calls++; return []; });
		await configuration.setUserConfiguration('chat.disableAIFeatures', true);
		await model.refresh(CancellationToken.None);
		await assert.rejects(model.setEnabled('wsl:Ubuntu', false), /no longer available/);
		assert.strictEqual(calls, 0);
	});

	test('shows unsupported containers without pretending they can be selected', async () => {
		const { model } = setup(async () => [{ id: 'volume', name: 'Volume container' }]);
		await model.refresh(CancellationToken.None);
		const remote = model.remotes.get().find(remote => remote.kind === 'devContainer')!;
		await assert.rejects(model.setEnabled(remote.id, true), /no local source folder/);
		assert.strictEqual(remote.enabled, false);
	});

	test('WSL discovery follows the platform', async () => {
		const { model, getWSLDiscoveryCalls } = setup();
		await model.setEnabled('wsl:Ubuntu', false);
		await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({
			shown: model.remotes.get().filter(remote => remote.kind === 'wsl').map(remote => remote.enabled),
			discoveryCalls: getWSLDiscoveryCalls(),
		}, { shown: [false], discoveryCalls: isWindows ? 1 : 0 });
	});
});
