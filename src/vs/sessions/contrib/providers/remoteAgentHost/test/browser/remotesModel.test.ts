/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise } from '../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { isCancellationError } from '../../../../../../base/common/errors.js';
import { derived, observableValue } from '../../../../../../base/common/observable.js';
import { isWindows } from '../../../../../../base/common/platform.js';
import { URI } from '../../../../../../base/common/uri.js';
import { mock } from '../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { IDiscoveredDevContainer } from '../../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { cloudSandboxAddress } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { GitHubEnvironmentsEnabledSettingId, IMissionControlAvailabilityService, IMissionControlEnvironmentService, IMissionControlHost } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { addSSHRemoteAgentHostEntry, IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, readSSHRemoteAgentHostEntries, removeSSHRemoteAgentHostEntry, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ICachedTunnel, ITunnelAgentHostService, ITunnelInfo, TunnelAuthenticationRequiredError } from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IWSLCachedDistro, IWSLRemoteAgentHostService } from '../../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { TestInstantiationService } from '../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../platform/log/common/log.js';
import { IInputOptions, IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService, IStorageService } from '../../../../../../platform/storage/common/storage.js';
import { IAgentHostSessionsProvider } from '../../../../../common/agentHostSessionsProvider.js';
import { DevContainerAgentHostEnabledSettingId, IDevContainerAgentHostService } from '../../../../../common/devContainerAgentHostService.js';
import { ISessionsProvidersService } from '../../../../../services/sessions/browser/sessionsProvidersService.js';
import { IRemoteRefreshProgress, RemotesModel, remoteKinds } from '../../browser/remotesModel.js';
import { getRemoteAgentHostPickerKey, RemoteAgentHostPickerVisibility } from '../../browser/remoteAgentHostPickerVisibility.js';
import { getSessionCreationEnvironments } from '../../../../chat/browser/sessionEnvironmentPicker.js';

suite('RemotesModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const tunnel: ITunnelInfo = { tunnelId: 'laptop', clusterId: 'eu', name: 'Laptop', protocolVersion: 6, tags: [], hostConnectionCount: 1 };

	function setup(discover: (token: CancellationToken) => Promise<readonly IDiscoveredDevContainer[]> = async () => [{ id: 'container', name: 'Project', workspaceFolder: '/project' }], restoreProvidersDuringInitialization = false, initialConnections: readonly IRemoteAgentHostConnectionInfo[] = []) {
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
		const connectionsChanged = store.add(new Emitter<void>());
		let connections = initialConnections;
		let workspacesInitialized = false;
		let initializingWorkspaces = false;
		let initializationReentered = false;
		const dismissed = new Set<string>();
		const removals: string[] = [];
		const connectionChanges: { id: string; connected: boolean }[] = [];
		const reconnects: string[] = [];
		const signIns: string[] = [];
		const displayNames = new Map<string, string>();
		const displayNamesChanged = store.add(new Emitter<string>());
		const renameInputs: IInputOptions[] = [];
		let renameInput: string | undefined;
		const environmentHosts = observableValue<readonly IMissionControlHost[]>(store, []);
		const environmentAvailable = observableValue<boolean | undefined>(store, false);
		const environmentState = {
			account: 'account-one' as string | undefined,
			refreshCalls: 0,
			refreshFailure: undefined as Error | undefined,
			pendingRename: undefined as DeferredPromise<string | undefined> | undefined,
			pendingConfirmation: undefined as DeferredPromise<IConfirmationResult> | undefined,
		};
		const confirmations: IConfirmation[] = [];
		const environmentConnections: string[] = [];
		const environmentNames: { id: string; name: string | undefined }[] = [];
		const environmentDeletions: string[] = [];
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
		let tunnelAuthentication: () => Promise<'github' | 'microsoft' | undefined> = async () => 'github';
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(IConfigurationService, configuration);
		instantiationService.stub(IDialogService, {
			confirm: async confirmation => {
				confirmations.push(confirmation);
				return environmentState.pendingConfirmation?.p ?? { confirmed: true };
			},
		});
		instantiationService.stub(ILogService, new class extends NullLogService {
			override warn(message: string, ...args: unknown[]) { logEntries.push({ message, args }); }
		}());
		instantiationService.stub(IRemoteAgentHostService, {
			get connections() { return connections; },
			onDidChangeConnections: connectionsChanged.event,
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
				return environmentState.pendingRename?.p ?? renameInput;
			},
		});
		instantiationService.stub(IMissionControlAvailabilityService, { available: environmentAvailable });
		instantiationService.stub(IMissionControlEnvironmentService, {
			hosts: environmentHosts,
			get enabled() {
				return environmentAvailable.get() === true && configuration.getValue<boolean>(GitHubEnvironmentsEnabledSettingId) === true;
			},
			get accountKey() { return environmentState.account; },
			refresh: async () => {
				environmentState.refreshCalls++;
				if (environmentState.refreshFailure) {
					throw environmentState.refreshFailure;
				}
			},
			connect: async id => { environmentConnections.push(id); },
			delete: async id => {
				environmentDeletions.push(id);
				environmentHosts.set(environmentHosts.get().filter(host => host.id !== id), undefined);
			},
			setDisplayName: (id, name) => {
				environmentNames.push({ id, name });
				environmentHosts.set(environmentHosts.get().map(host => host.id === id ? { ...host, displayName: name?.trim() || undefined } : host), undefined);
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
			getAuthProvider: () => tunnelAuthentication(),
			listTunnels: () => tunnelDiscovery(),
			isTunnelDismissed: id => dismissed.has(id),
			clearTunnelDismissal: id => { dismissed.delete(id); },
			cacheTunnel: (value, authProvider) => { tunnels = [{ ...value, authProvider }]; },
			connect: async value => { reconnects.push(`tunnel:${value.tunnelId}`); },
			signIn: async provider => { signIns.push(provider); },
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
		const pickerVisibility = store.add(new RemoteAgentHostPickerVisibility(storage));
		const createProvider = (address: string) => new class extends mock<IAgentHostSessionsProvider>() {
			override readonly id = `agenthost-${address}`;
			override readonly remoteAddress = address;
			override readonly environment = { id: 'remote', label: 'Remote' };
			override supportsWorkspaceSelection = true;
			override hostGroup: IAgentHostSessionsProvider['hostGroup'];
			override readonly isAvailableInEnvironmentPicker = observableValue(this, true);
			private readonly pickerKey = getRemoteAgentHostPickerKey(address, address.startsWith('cloudsandbox:') ? environmentState.account : undefined);
			override readonly isVisibleInEnvironmentPicker = derived(reader =>
				this.isAvailableInEnvironmentPicker.read(reader) && !pickerVisibility.isHidden(this.pickerKey, reader));
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
				if (!environmentHosts.get().some(host => cloudSandboxAddress(host.id) === address)) {
					await this.remove();
				}
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
		const providers = new Map(['ssh:build', 'wsl:Ubuntu', 'tunnel:laptop'].map(address => [address, createProvider(address)]));
		instantiationService.stub(ISessionsProvidersService, {
			onDidChangeProviders: providersChanged.event,
			getProviders: () => [...providers.values()],
		});
		const model = store.add(instantiationService.createInstance(RemotesModel, discover));
		return {
			model, storage, configuration, removals, logEntries, initializationReentered, providers, providersChanged, connectionChanges, reconnects, signIns,
			setConnections: (value: readonly IRemoteAgentHostConnectionInfo[]) => { connections = value; connectionsChanged.fire(); },
			createProvider, setCachedDistros: (cached: IWSLCachedDistro[]) => { distros = cached; },
			failConnection: (error: Error) => { connectionFailure = error; },
			renameInputs, setRenameInput: (value: string | undefined) => { renameInput = value; }, setDisplayName,
			getWSLDiscoveryCalls: () => wslDiscoveryCalls, setSSHDiscovery: (discovery: () => Promise<string[]>) => { sshDiscovery = discovery; },
			setTunnelDiscovery: (discovery: () => Promise<ITunnelInfo[]>) => { tunnelDiscovery = discovery; },
			setTunnelAuthentication: (authentication: () => Promise<'github' | 'microsoft' | undefined>) => { tunnelAuthentication = authentication; },
			environmentHosts, environmentAvailable, environmentState, environmentConnections, environmentNames, environmentDeletions, confirmations,
			setConfiguration: async (key: string, value: boolean) => {
				await configuration.setUserConfiguration(key, value);
				configuration.onDidChangeConfigurationEmitter.fire({
					source: ConfigurationTarget.USER, affectedKeys: new Set([key]),
					change: { keys: [key], overrides: [] }, affectsConfiguration: section => section === key,
				});
			},
			addEnvironmentProvider: (id: string) => {
				const address = cloudSandboxAddress(id);
				const provider = createProvider(address);
				providers.set(address, provider);
				providersChanged.fire({ added: [], removed: [] });
				return provider;
			},
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

	test('reads service-owned error metadata even when opened midway through a retry', async () => {
		const connection: IRemoteAgentHostConnectionInfo = {
			address: 'ssh:build', name: 'Build', status: RemoteAgentHostConnectionStatus.connecting, lastConnectionError: 'First failure',
		};
		const { model, providers, setConnections } = setup(undefined, false, [connection]);
		await model.refresh(CancellationToken.None);
		const provider = providers.get('ssh:build')!;
		const snapshot = () => {
			const remote = model.remotes.get().find(remote => remote.id === 'ssh:build')!;
			return { status: remote.connectionStatus, error: remote.lastConnectionError };
		};
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connecting, undefined);
		const pending = snapshot();
		setConnections([{ ...connection, lastConnectionError: 'Updated failure' }]);
		const updated = snapshot();
		setConnections([{ ...connection, status: RemoteAgentHostConnectionStatus.connected, lastConnectionError: undefined }]);
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		const connected = snapshot();
		setConnections([]);
		assert.deepStrictEqual({ pending, updated, connected, removed: snapshot().error }, {
			pending: { status: RemoteAgentHostConnectionStatus.connecting, error: 'First failure' },
			updated: { status: RemoteAgentHostConnectionStatus.connecting, error: 'Updated failure' },
			connected: { status: RemoteAgentHostConnectionStatus.connected, error: undefined },
			removed: undefined,
		});
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

	test('reports each source finishing independently, including discovery failures', async () => {
		const { model, setSSHDiscovery, setTunnelDiscovery } = setup();
		const ssh = new DeferredPromise<string[]>();
		const tunnel = new DeferredPromise<ITunnelInfo[]>();
		const sshFinished = new DeferredPromise<void>();
		setSSHDiscovery(() => ssh.p);
		setTunnelDiscovery(() => tunnel.p);
		const updates: IRemoteRefreshProgress[] = [];
		const refreshing = new Set<string>();
		const refresh = model.refresh(CancellationToken.None, {
			report: update => {
				updates.push(update);
				if (update.refreshing) {
					refreshing.add(update.kind);
				} else {
					refreshing.delete(update.kind);
					if (update.kind === 'ssh') {
						sshFinished.complete();
					}
				}
			},
		});
		await ssh.complete([]);
		await sshFinished.p;
		const partial = { ssh: refreshing.has('ssh'), tunnel: refreshing.has('tunnel') };
		await tunnel.error(new Error('Tunnel discovery failed'));
		const failures = await refresh;
		assert.deepStrictEqual({
			partial, failures, remaining: [...refreshing],
			started: updates.filter(update => update.refreshing).map(update => update.kind).sort(),
			finished: updates.filter(update => !update.refreshing).map(update => update.kind).sort(),
		}, { partial: { ssh: false, tunnel: true }, failures: ['tunnel'], remaining: [], started: [...remoteKinds].sort(), finished: [...remoteKinds].sort() });
	});

	test('tunnel progress spans authentication and reports missing-scope failure before other discovery finishes', async () => {
		const { model, setSSHDiscovery, setTunnelAuthentication, setTunnelDiscovery, logEntries } = setup();
		const ssh = new DeferredPromise<string[]>();
		const authentication = new DeferredPromise<'github' | 'microsoft' | undefined>();
		const tunnelFinished = new DeferredPromise<void>();
		const progress: IRemoteRefreshProgress[] = [];
		const error = new Error('No authentication is available to enumerate tunnels.');
		setSSHDiscovery(() => ssh.p);
		setTunnelAuthentication(() => authentication.p);
		setTunnelDiscovery(async () => { throw error; });
		const refresh = model.refresh(CancellationToken.None, {
			report: update => {
				progress.push(update);
				if (update.kind === 'tunnel' && !update.refreshing) {
					tunnelFinished.complete();
				}
			},
		});
		const waitingForAuthentication = progress.filter(update => update.kind === 'tunnel');
		await authentication.complete(undefined);
		await tunnelFinished.p;
		const failedBeforeSSH = !progress.some(update => update.kind === 'ssh' && !update.refreshing);
		await ssh.complete([]);
		const failures = await refresh;
		assert.deepStrictEqual({
			waitingForAuthentication, failedBeforeSSH, failures,
			tunnelProgress: progress.filter(update => update.kind === 'tunnel'), logEntries,
		}, {
			waitingForAuthentication: [{ kind: 'tunnel', refreshing: true }], failedBeforeSSH: true, failures: ['tunnel'],
			tunnelProgress: [{ kind: 'tunnel', refreshing: true }, { kind: 'tunnel', refreshing: false, failed: true }],
			logEntries: [{ message: '[Remotes] tunnel discovery failed', args: [error] }],
		});
	});

	test('only authentication failures offer sign-in and recovery never connects or forgets cached hosts', async () => {
		const { model, setTunnelDiscovery, setTunnelAuthentication, reconnects, signIns, setConfiguration } = setup();
		await model.refresh(CancellationToken.None);
		setTunnelAuthentication(async () => undefined);
		setTunnelDiscovery(async () => { throw new TunnelAuthenticationRequiredError('github'); });
		await model.refresh(CancellationToken.None);
		const required = model.tunnelAuthenticationRequired.get();
		await model.signInToTunnels();
		const retained = model.remotes.get().some(remote => remote.id === 'tunnel:laptop');
		setTunnelDiscovery(async () => { throw new Error('Network unavailable'); });
		await model.refresh(CancellationToken.None);
		const network = model.tunnelAuthenticationRequired.get();
		await assert.rejects(model.signInToTunnels(), isCancellationError);
		setTunnelDiscovery(async () => { throw new TunnelAuthenticationRequiredError('microsoft'); });
		await model.refresh(CancellationToken.None);
		await setConfiguration('chat.disableAIFeatures', true);
		await assert.rejects(model.signInToTunnels(), isCancellationError);
		await setConfiguration('chat.disableAIFeatures', false);
		setTunnelDiscovery(async () => [tunnel]);
		await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({ required, retained, network, recovered: model.tunnelAuthenticationRequired.get(), reconnects, signIns }, {
			required: 'github', retained: true, network: undefined, recovered: undefined, reconnects: [], signIns: ['github'],
		});
	});

	test('canceled discovery does not publish an authentication prompt', async () => {
		const { model, setTunnelDiscovery } = setup();
		const pending = new DeferredPromise<ITunnelInfo[]>();
		setTunnelDiscovery(() => pending.p);
		const cancellation = store.add(new CancellationTokenSource());
		const refresh = model.refresh(cancellation.token);
		cancellation.cancel();
		await pending.error(new TunnelAuthenticationRequiredError('github'));
		await refresh;
		assert.strictEqual(model.tunnelAuthenticationRequired.get(), undefined);
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

	test('visibility persists for eligible remotes without changing registration, connection, or removal', async () => {
		const { model, storage, connectionChanges, reconnects, removals, setRenameInput } = setup();
		await model.refresh(CancellationToken.None);
		const preference = store.add(new RemoteAgentHostPickerVisibility(storage));
		model.setHidden('ssh:build', true);
		model.setHidden('tunnel:laptop', true);
		setRenameInput('Renamed');
		await model.rename('ssh:build');
		await model.refresh(CancellationToken.None);
		const hidden = model.remotes.get().filter(remote => remote.hidden).map(remote => remote.id);
		preference.setHidden(getRemoteAgentHostPickerKey('ssh:build'), false);
		const externallyShown = model.remotes.get().find(remote => remote.id === 'ssh:build')?.hidden;
		model.setHidden('tunnel:laptop', false);
		assert.deepStrictEqual({
			hidden, externallyShown, remainingHidden: model.remotes.get().filter(remote => remote.hidden),
			entries: readSSHRemoteAgentHostEntries(storage), connectionChanges, reconnects, removals,
		}, { hidden: ['ssh:build', 'tunnel:laptop'], externallyShown: false, remainingHidden: [], entries: [], connectionChanges: [], reconnects: [], removals: [] });
	});

	test('offline environment visibility is account-scoped and cannot bypass availability', async () => {
		const { model, configuration, environmentAvailable, environmentHosts, environmentState, environmentConnections, addEnvironmentProvider } = setup();
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentAvailable.set(true, undefined);
		const host = { id: 'desktop', name: 'Desktop', kind: 'user-local', status: 'online' } as const;
		environmentHosts.set([host], undefined);
		addEnvironmentProvider(host.id);
		const id = cloudSandboxAddress('desktop');
		model.setHidden(id, true);
		const hosts = [{ ...host, status: 'offline' }] as const;
		environmentHosts.set(hosts, undefined);
		const hidden = model.remotes.get().find(remote => remote.id === id)?.hidden;
		assert.throws(() => model.setHidden(id, false), /when the owning application is online/);
		const reason = model.remotes.get().find(remote => remote.id === id)?.pickerUnavailableReason;
		environmentState.account = 'account-two';
		environmentHosts.set([...hosts], undefined);
		const otherAccount = model.remotes.get().find(remote => remote.id === id)?.hidden;
		environmentState.account = 'account-one';
		environmentHosts.set([...hosts], undefined);
		const restored = model.remotes.get().find(remote => remote.id === id)?.hidden;
		await assert.rejects(model.setConnected(id, true), /not online/);
		environmentHosts.set([host], undefined);
		model.setHidden(id, false);
		assert.deepStrictEqual({ hidden, otherAccount, restored, reason, environmentConnections }, {
			hidden: true, otherAccount: false, restored: true, reason: 'Available in the picker when the owning application is online.', environmentConnections: [],
		});
		environmentHosts.set([], undefined);
		assert.throws(() => model.setHidden(id, true), /no longer available/);
	});

	test('SSH picker visibility uses the stable host key rather than the forwarded endpoint', () => {
		const { model, storage, providers, providersChanged, createProvider } = setup();
		addSSHRemoteAgentHostEntry(storage, {
			name: 'Forwarded SSH', connection: {
				type: RemoteAgentHostEntryType.SSH, address: 'localhost:4321', sshConfigHost: 'remote',
				hostName: 'remote.example.com', user: 'user', port: 22,
			},
		});
		providers.set('localhost:4321', createProvider('localhost:4321'));
		providersChanged.fire({ added: [], removed: [] });
		model.setHidden('localhost:4321', true);
		const preference = store.add(new RemoteAgentHostPickerVisibility(storage));
		assert.deepStrictEqual({
			hostHidden: preference.isHidden(getRemoteAgentHostPickerKey('ssh:remote')),
			endpointHidden: preference.isHidden(getRemoteAgentHostPickerKey('localhost:4321')),
		}, { hostHidden: true, endpointHidden: false });
	});

	for (const id of ['ssh:build', 'tunnel:laptop', ...(isWindows ? ['wsl:Ubuntu'] : [])]) {
		test(`picker state follows discovery, provider registration, availability and visibility (${id})`, async () => {
			const { model, providers, providersChanged, setCachedDistros, connectionChanges, reconnects, removals } = setup();
			const provider = providers.get(id)!;
			providers.delete(id);
			setCachedDistros([]);
			providersChanged.fire({ added: [], removed: [] });
			await model.refresh(CancellationToken.None);
			const snapshot = () => {
				const remote = model.remotes.get().find(remote => remote.id === id)!;
				return {
					hidden: remote.hidden, reason: remote.pickerUnavailableReason,
					inPicker: getSessionCreationEnvironments([...providers.values()]).some(environment => environment.providerIds.includes(provider.id)),
				};
			};
			const discovered = snapshot();
			assert.throws(() => model.setHidden(id, false), /Connect once/);
			assert.throws(() => model.setHidden(id, true), /Connect once/);
			providers.set(id, provider);
			providersChanged.fire({ added: [], removed: [] });
			const registered = snapshot();
			model.setHidden(id, true);
			const hidden = snapshot();
			provider.isAvailableInEnvironmentPicker.set(false, undefined);
			const unavailable = snapshot();
			assert.throws(() => model.setHidden(id, false), /currently unavailable/);
			provider.isAvailableInEnvironmentPicker.set(true, undefined);
			const availableAgain = snapshot();
			model.setHidden(id, false);
			const shown = snapshot();
			providers.delete(id);
			providersChanged.fire({ added: [], removed: [] });
			assert.deepStrictEqual({
				discovered, registered, hidden, unavailable, availableAgain, shown, withdrawn: snapshot(), connectionChanges, reconnects, removals,
			}, {
				discovered: { hidden: false, reason: 'Connect once to add this remote to the picker.', inPicker: false },
				registered: { hidden: false, reason: undefined, inPicker: true },
				hidden: { hidden: true, reason: undefined, inPicker: false },
				unavailable: { hidden: true, reason: 'This remote is currently unavailable in the picker.', inPicker: false },
				availableAgain: { hidden: true, reason: undefined, inPicker: false },
				shown: { hidden: false, reason: undefined, inPicker: true },
				withdrawn: { hidden: false, reason: 'Connect once to add this remote to the picker.', inPicker: false },
				connectionChanges: [], reconnects: [], removals: [],
			});
		});
	}

	test('grouped providers and providers without workspace selection cannot be shown independently', async () => {
		const { model, providers, providersChanged } = setup();
		await model.refresh(CancellationToken.None);
		const provider = providers.get('ssh:build')!;
		provider.supportsWorkspaceSelection = false;
		providersChanged.fire({ added: [], removed: [] });
		const unsupported = model.remotes.get().find(remote => remote.id === 'ssh:build')?.pickerUnavailableReason;
		assert.throws(() => model.setHidden('ssh:build', false), /does not support/);
		provider.supportsWorkspaceSelection = true;
		provider.hostGroup = { id: 'group', label: 'Group' };
		providersChanged.fire({ added: [], removed: [] });
		assert.deepStrictEqual({
			unsupported, grouped: model.remotes.get().find(remote => remote.id === 'ssh:build')?.pickerUnavailableReason,
			inPicker: getSessionCreationEnvironments([...providers.values()]).some(environment => environment.providerIds.includes(provider.id)),
		}, {
			unsupported: 'This remote does not support a separate entry in the Environment picker.',
			grouped: 'This remote does not support a separate entry in the Environment picker.', inPicker: false,
		});
	});

	test('disabled AI or remote hosts reject visibility changes', async () => {
		const { model, setConfiguration } = setup();
		await model.refresh(CancellationToken.None);
		await setConfiguration('chat.disableAIFeatures', true);
		assert.throws(() => model.setHidden('ssh:build', true), /no longer available/);
		await setConfiguration('chat.disableAIFeatures', false);
		await setConfiguration(RemoteAgentHostsEnabledSettingId, false);
		assert.throws(() => model.setHidden('ssh:build', true), /no longer available/);
	});

	test('environment inventory is gated and reacts to availability, configuration and account changes', async () => {
		const { model, configuration, setConfiguration, environmentAvailable, environmentHosts, environmentState } = setup();
		environmentHosts.set([{ id: 'env-one', name: 'Shared desktop', kind: 'user-local', status: 'online' }], undefined);
		const snapshot = () => ({ enabled: model.environmentsEnabled.get(), names: model.remotes.get().filter(remote => remote.kind === 'environment').map(remote => remote.name) });
		await model.refresh(CancellationToken.None);
		const hidden = snapshot();
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		const unavailable = snapshot();
		environmentAvailable.set(true, undefined);
		const available = snapshot();
		await model.refresh(CancellationToken.None);
		await setConfiguration(GitHubEnvironmentsEnabledSettingId, false);
		const configurationDisabled = snapshot();
		await model.refresh(CancellationToken.None);
		await setConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentState.account = undefined;
		environmentHosts.set([], undefined);
		const signedOut = snapshot();
		environmentAvailable.set(false, undefined);
		assert.deepStrictEqual({ hidden, unavailable, available, configurationDisabled, signedOut, disabled: snapshot(), refreshCalls: environmentState.refreshCalls }, {
			hidden: { enabled: false, names: [] }, unavailable: { enabled: false, names: [] },
			available: { enabled: true, names: ['Shared desktop'] }, configurationDisabled: { enabled: false, names: [] }, signedOut: { enabled: true, names: [] },
			disabled: { enabled: false, names: [] }, refreshCalls: 1,
		});
	});

	test('environments include deletable offline hosts but exclude other kinds', async () => {
		const { model, configuration, environmentAvailable, environmentHosts, environmentDeletions, removals } = setup();
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentAvailable.set(true, undefined);
		environmentHosts.set([
			{ id: 'online', name: 'A desktop', kind: 'user-local', status: 'online' },
			{ id: 'offline', name: 'B desktop', kind: 'user-local', status: 'offline' },
			{ id: 'sandbox', name: 'Task sandbox', kind: 'managed-sandbox', status: 'online' },
			{ id: 'future', name: 'Future kind', kind: 'future', status: 'online' },
		], undefined);
		assert.deepStrictEqual(model.remotes.get().filter(remote => remote.kind === 'environment').map(remote => ({
			id: remote.id, name: remote.name, unavailable: !!remote.unavailableReason, canRemove: remote.canRemove,
		})), [
			{ id: cloudSandboxAddress('online'), name: 'A desktop', unavailable: false, canRemove: true },
			{ id: cloudSandboxAddress('offline'), name: 'B desktop', unavailable: true, canRemove: true },
		]);
		await assert.rejects(model.setConnected(cloudSandboxAddress('offline'), true), /not online/);
		await assert.rejects(model.remove(cloudSandboxAddress('sandbox')), /no longer available/);
		await model.remove(cloudSandboxAddress('online'));
		await model.remove(cloudSandboxAddress('offline'));
		assert.deepStrictEqual({
			environmentDeletions, removals, remaining: model.remotes.get().filter(remote => remote.kind === 'environment'),
		}, { environmentDeletions: ['online', 'offline'], removals: [], remaining: [] });
	});

	for (const confirmed of [true, false]) {
		test(`environment deletion waits for confirmation and ${confirmed ? 'deletes only the chosen host' : 'preserves inventory on cancellation'}`, async () => {
			const { model, configuration, environmentAvailable, environmentHosts, environmentState, environmentDeletions, confirmations } = setup();
			await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
			environmentAvailable.set(true, undefined);
			const host: IMissionControlHost = { id: 'desktop', name: 'Desktop', displayName: 'Office desktop', kind: 'user-local', status: 'offline' };
			const retained: IMissionControlHost = { id: 'retained', name: 'Other machine', kind: 'user-local', status: 'online' };
			environmentHosts.set([host, retained], undefined);
			environmentState.pendingConfirmation = new DeferredPromise<IConfirmationResult>();
			const deletion = model.remove(cloudSandboxAddress(host.id));
			assert.deepStrictEqual({
				confirmations, deletions: environmentDeletions, hosts: environmentHosts.get(),
			}, {
				confirmations: [{
					type: 'warning',
					message: 'Are you sure you want to delete environment \'Office desktop\'?',
					detail: 'This removes the environment registration and disconnects this client. Files on the machine will not be deleted. The environment may reappear if its owning application registers it again.',
					primaryButton: '&&Delete',
				}],
				deletions: [], hosts: [host, retained],
			});
			await environmentState.pendingConfirmation.complete({ confirmed });
			await deletion;
			assert.deepStrictEqual({ deletions: environmentDeletions, hosts: environmentHosts.get() }, {
				deletions: confirmed ? ['desktop'] : [], hosts: confirmed ? [retained] : [host, retained],
			});
		});
	}

	for (const change of ['account', 'inventory', 'availability', 'configuration', 'AI', 'disposal'] as const) {
		test(`environment deletion is cancelled when ${change} changes during confirmation`, async () => {
			const { model, configuration, setConfiguration, environmentAvailable, environmentHosts, environmentState, environmentDeletions } = setup();
			await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
			environmentAvailable.set(true, undefined);
			const host: IMissionControlHost = { id: 'desktop', name: 'Desktop', kind: 'user-local', status: 'online' };
			environmentHosts.set([host], undefined);
			environmentState.pendingConfirmation = new DeferredPromise<IConfirmationResult>();
			const deletion = model.remove(cloudSandboxAddress(host.id));
			const rejected = assert.rejects(deletion, isCancellationError);
			switch (change) {
				case 'account':
					environmentState.account = 'account-two';
					environmentHosts.set([{ ...host, name: 'Other account desktop' }], undefined);
					break;
				case 'inventory':
					environmentHosts.set([], undefined);
					break;
				case 'availability':
					environmentAvailable.set(false, undefined);
					break;
				case 'configuration':
					await setConfiguration(RemoteAgentHostsEnabledSettingId, false);
					break;
				case 'AI':
					await setConfiguration('chat.disableAIFeatures', true);
					break;
				case 'disposal':
					model.dispose();
					break;
			}
			await environmentState.pendingConfirmation.complete({ confirmed: true });
			await rejected;
			assert.deepStrictEqual(environmentDeletions, []);
		});
	}

	test('environment connections prefer provider hooks and retain inventory on disconnect', async () => {
		const { model, configuration, environmentAvailable, environmentHosts, environmentConnections, connectionChanges, addEnvironmentProvider } = setup();
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentAvailable.set(true, undefined);
		environmentHosts.set([{ id: 'desktop', name: 'Desktop', kind: 'user-local', status: 'online' }], undefined);
		const id = cloudSandboxAddress('desktop');
		await model.setConnected(id, true);
		addEnvironmentProvider('desktop');
		await model.setConnected(id, true);
		await model.setConnected(id, false);
		assert.deepStrictEqual({ environmentConnections, connectionChanges, retained: model.remotes.get().some(remote => remote.id === id) }, {
			environmentConnections: ['desktop'], connectionChanges: [{ id, connected: true }, { id, connected: false }], retained: true,
		});
	});

	test('environment rename uses inventory names and cancels when the account changes during the prompt', async () => {
		const { model, configuration, environmentAvailable, environmentHosts, environmentState, environmentNames, setRenameInput } = setup();
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentAvailable.set(true, undefined);
		const host: IMissionControlHost = { id: 'desktop', name: 'Desktop', kind: 'user-local', status: 'online' };
		environmentHosts.set([host], undefined);
		const id = cloudSandboxAddress(host.id);
		setRenameInput('Office desktop');
		await model.rename(id);
		const name = model.remotes.get().find(remote => remote.id === id)?.name;
		environmentState.pendingRename = new DeferredPromise<string | undefined>();
		const rename = model.rename(id);
		environmentState.account = 'account-two';
		environmentHosts.set([{ ...host, name: 'Other account desktop' }], undefined);
		await environmentState.pendingRename.complete('Stale name');
		await assert.rejects(rename, isCancellationError);
		assert.deepStrictEqual({ name, environmentNames, currentName: model.remotes.get().find(remote => remote.id === id)?.name }, {
			name: 'Office desktop', environmentNames: [{ id: 'desktop', name: 'Office desktop' }], currentName: 'Other account desktop',
		});
	});

	test('environment refresh failures retain current inventory and later removals are reflected immediately', async () => {
		const { model, configuration, environmentAvailable, environmentHosts, environmentState } = setup();
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentAvailable.set(true, undefined);
		environmentHosts.set([{ id: 'desktop', name: 'Desktop', kind: 'user-local', status: 'online' }], undefined);
		environmentState.refreshFailure = new Error('Network unavailable');
		const failures = await model.refresh(CancellationToken.None);
		const retained = model.remotes.get().filter(remote => remote.kind === 'environment').length;
		environmentHosts.set([], undefined);
		assert.deepStrictEqual({ failures, retained, current: model.remotes.get().filter(remote => remote.kind === 'environment').length }, {
			failures: ['environment'], retained: 1, current: 0,
		});
		await assert.rejects(model.setConnected(cloudSandboxAddress('desktop'), true), /no longer available/);
	});

	test('disabled AI withdraws environment rows and blocks subsequent connection or rename actions', async () => {
		const { model, configuration, setConfiguration, environmentAvailable, environmentHosts, environmentNames, environmentConnections } = setup();
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentAvailable.set(true, undefined);
		environmentHosts.set([{ id: 'desktop', name: 'Desktop', kind: 'user-local', status: 'online' }], undefined);
		await setConfiguration('chat.disableAIFeatures', true);
		await assert.rejects(model.setConnected(cloudSandboxAddress('desktop'), true), /no longer available/);
		await assert.rejects(model.rename(cloudSandboxAddress('desktop')), /no longer available/);
		await assert.rejects(model.remove(cloudSandboxAddress('desktop')), /no longer available/);
		assert.deepStrictEqual({
			enabled: model.environmentsEnabled.get(), environments: model.remotes.get().filter(remote => remote.kind === 'environment'), environmentNames, environmentConnections,
		}, { enabled: false, environments: [], environmentNames: [], environmentConnections: [] });
	});
});
