/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import { DeferredPromise, timeout } from '../../../../../../../base/common/async.js';
import { CancellationToken, CancellationTokenSource } from '../../../../../../../base/common/cancellation.js';
import { Emitter, Event } from '../../../../../../../base/common/event.js';
import { isCancellationError } from '../../../../../../../base/common/errors.js';
import { constObservable, derived, ISettableObservable, observableValue } from '../../../../../../../base/common/observable.js';
import { isWindows, OperatingSystem } from '../../../../../../../base/common/platform.js';
import { mock, upcastPartial } from '../../../../../../../base/test/common/mock.js';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../../base/test/common/utils.js';
import { runWithFakedTimers } from '../../../../../../../base/test/common/virtualScheduling/index.js';
import { cloudSandboxAddress } from '../../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { withAgentHostResources } from '../../../../../../../platform/agentHost/common/meta/agentHostResources.js';
import { RootState } from '../../../../../../../platform/agentHost/common/state/sessionState.js';
import { ExtensionRemoteAgentHostsService, IExtensionRemoteAgentHostsService } from '../../../../../../../platform/agentHost/common/extensionRemoteAgentHosts.js';
import { GitHubEnvironmentsEnabledSettingId, IMissionControlAvailabilityService, IMissionControlEnvironmentService, IMissionControlHost, IRemoteGitHubEnvironmentShare, IRemoteGitHubEnvironmentSharingService } from '../../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { addSSHRemoteAgentHostEntry, IRemoteAgentHostConnectionInfo, IRemoteAgentHostService, readSSHRemoteAgentHostEntries, removeSSHRemoteAgentHostEntry, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService, ISSHResolvedConfig } from '../../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ISSHHostKeyTrustService, ISSHTrustedHostKey } from '../../../../../../../platform/agentHost/common/sshHostKeyTrust.js';
import { IRemoteConnectionDiagnosticEvent } from '../../../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { IExtensionDescription } from '../../../../../../../platform/extensions/common/extensions.js';
import { IExtensionService } from '../../../../../../services/extensions/common/extensions.js';
import { ICachedTunnel, ITunnelAgentHostService, ITunnelInfo, TunnelAuthenticationRequiredError } from '../../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IRemoteAgentHostLocationPreferenceService, RemoteAgentHostLocationPreference } from '../../../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { IAgentConnection } from '../../../../../../../platform/agentHost/common/agentService.js';
import { Implementation, InitializeResult, PathStyle } from '../../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { IVscodeUpgradeResult } from '../../../../../../../platform/agentHost/common/state/protocolUpgrade.js';
import { IClipboardService } from '../../../../../../../platform/clipboard/common/clipboardService.js';
import { IWSLCachedDistro, IWSLDistro, IWSLRemoteAgentHostService } from '../../../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { ConfigurationTarget, IConfigurationService } from '../../../../../../../platform/configuration/common/configuration.js';
import { TestConfigurationService } from '../../../../../../../platform/configuration/test/common/testConfigurationService.js';
import { IConfirmation, IConfirmationResult, IDialogService } from '../../../../../../../platform/dialogs/common/dialogs.js';
import { TestDialogService } from '../../../../../../../platform/dialogs/test/common/testDialogService.js';
import { TestInstantiationService } from '../../../../../../../platform/instantiation/test/common/instantiationServiceMock.js';
import { ILogService, NullLogService } from '../../../../../../../platform/log/common/log.js';
import { INotification, INotificationService } from '../../../../../../../platform/notification/common/notification.js';
import { TestNotificationService } from '../../../../../../../platform/notification/test/common/testNotificationService.js';
import { IProductService } from '../../../../../../../platform/product/common/productService.js';
import { IProgressService } from '../../../../../../../platform/progress/common/progress.js';
import { IRemoteTunnelService, TunnelStatus } from '../../../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { TestProgressService } from '../../../../../../test/browser/workbenchTestServices.js';
import { IInputOptions, IQuickInputService, IQuickPickItem, QuickPickInput } from '../../../../../../../platform/quickinput/common/quickInput.js';
import { InMemoryStorageService, IStorageService, StorageScope, StorageTarget } from '../../../../../../../platform/storage/common/storage.js';
import { IAgentHostSessionsProvider, LocalAgentHostRegistration } from '../../../../common/agentHostSessionsProvider.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerEnvironmentsEnabledSettingId, IDevContainerAgentHostService, IDevContainerEnvironment, LocalDevContainerEnvironmentHost } from '../../../../common/devContainerAgentHostService.js';
import { ITelemetryService } from '../../../../../../../platform/telemetry/common/telemetry.js';
import { TestExperimentTriggerTelemetryService } from '../../../../../../../platform/telemetry/test/common/experimentTriggerTestUtils.js';
import { ISessionsProvidersService } from '../../../../browser/sessionsProvidersService.js';
import { ISession, SessionStatus } from '../../../../../../services/sessions/common/session.js';
import { buildTestSession } from '../../../../test/common/testSessionBuilder.js';
import { IRemoteRefreshProgress, RemotesModel, remoteKinds } from '../../browser/remotesModel.js';
import { getRemoteAgentHostPickerKey, RemoteAgentHostPickerVisibility } from '../../browser/remoteAgentHostPickerVisibility.js';
import { getSessionCreationEnvironments } from '../../../../browser/chat/sessionEnvironmentPicker.js';

suite('RemotesModel', () => {
	const store = ensureNoDisposablesAreLeakedInTestSuite();
	const tunnel: ITunnelInfo = { tunnelId: 'laptop', clusterId: 'eu', name: 'Laptop', protocolVersion: 6, tags: [], hostConnectionCount: 1 };
	const savedSSHHost = {
		name: 'Saved host',
		connectionToken: undefined,
		connection: { type: RemoteAgentHostEntryType.SSH as const, address: 'ssh:removed', sshConfigHost: 'removed', hostName: 'removed.example', user: undefined, port: undefined },
	};

	function setup(initialConnections: readonly IRemoteAgentHostConnectionInfo[] = [], initialTunnelStatus?: Promise<TunnelStatus>, storageOverride?: InMemoryStorageService) {
		const instantiationService = store.add(new TestInstantiationService());
		const storage = storageOverride ?? store.add(new InMemoryStorageService());
		const configuration = new TestConfigurationService({
			[RemoteAgentHostsEnabledSettingId]: true,
		});
		store.add(configuration.onDidChangeConfigurationEmitter);
		let distros: IWSLCachedDistro[] = [{ distro: 'Ubuntu', name: 'Ubuntu' }];
		let tunnels: ICachedTunnel[] = [];
		const providersChanged = store.add(new Emitter<{ added: []; removed: [] }>());
		const connectionsChanged = store.add(new Emitter<void>());
		const tunnelsChanged = store.add(new Emitter<void>());
		const wslConnectionsChanged = store.add(new Emitter<void>());
		const tunnelStatusChanged = store.add(new Emitter<TunnelStatus>());
		const tunnelState: { canDelete: boolean; pendingDeletion?: DeferredPromise<void>; failure?: Error } = { canDelete: true };
		const deletedTunnels: { tunnel: ITunnelInfo; authProvider?: 'github' | 'microsoft' }[] = [];
		let connections = initialConnections;
		const dismissed = new Set<string>();
		const removals: string[] = [];
		const sshDisconnects: string[] = [];
		const resolvedSSHHosts: string[] = [];
		const sshConfigs = new Map<string, Partial<ISSHResolvedConfig>>();
		const removedConnections: string[] = [];
		const connectionChanges: { id: string; connected: boolean }[] = [];
		const reconnects: string[] = [];
		const tunnelConnections: { tunnel: ITunnelInfo; authProvider?: 'github' | 'microsoft' }[] = [];
		const signIns: string[] = [];
		const displayNames = new Map<string, string>();
		const displayNamesChanged = store.add(new Emitter<string>());
		const renameInputs: IInputOptions[] = [];
		let renameInput: string | undefined;
		const devContainerPicks: { picked?: string; readonly offered: string[][] } = { offered: [] };
		const environmentHosts = observableValue<readonly IMissionControlHost[]>(store, []);
		const ownEnvironmentId = observableValue<string | undefined>(store, undefined);
		const environmentAvailable = observableValue<boolean | undefined>(store, false);
		const environmentState = {
			account: 'account-one' as string | undefined,
			refreshCalls: 0,
			refreshFailure: undefined as Error | undefined,
			pendingRename: undefined as DeferredPromise<string | undefined> | undefined,
			pendingConfirmation: undefined as DeferredPromise<IConfirmationResult> | undefined,
		};
		const confirmations: IConfirmation[] = [];
		const copiedAddresses: string[] = [];
		const locationPromptResult: { result: RemoteAgentHostLocationPreference | undefined } = { result: undefined };
		const locationPreferences = new Map<string, RemoteAgentHostLocationPreference>();
		const notifications: INotification[] = [];
		const upgrades: { address: string; method: string }[] = [];
		const upgrade: { result: IVscodeUpgradeResult; failure?: Error } = { result: { ok: true, upgradeNeeded: false } };
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
		const initializeResults = new Map<string, ISettableObservable<InitializeResult | undefined>>();
		const initializeResultFor = (address: string) => {
			let result = initializeResults.get(address);
			if (!result) {
				result = observableValue<InitializeResult | undefined>(store, undefined);
				initializeResults.set(address, result);
			}
			return result;
		};
		const logEntries: { message: string; args: readonly unknown[] }[] = [];
		let wslDiscoveryCalls = 0;
		const wslState: { discoveryFailure?: Error; runningFailure?: Error } = {};
		let wslDistros: IWSLDistro[] = [{ name: 'Ubuntu', isDefault: true, isRunning: false, version: 2 }];
		let sshDiscovery: () => Promise<string[]> = async () => ['build', 'build'];
		let tunnelDiscovery: () => Promise<ITunnelInfo[]> = async () => [tunnel];
		let tunnelAuthentication: () => Promise<'github' | 'microsoft' | undefined> = async () => 'github';
		const diagnosticEvents: IRemoteConnectionDiagnosticEvent[] = [];
		const terminatedDistros: string[] = [];
		instantiationService.stub(IStorageService, storage);
		instantiationService.stub(IConfigurationService, configuration);
		const extensionHosts = store.add(new ExtensionRemoteAgentHostsService(storage));
		instantiationService.stub(IExtensionRemoteAgentHostsService, extensionHosts);
		instantiationService.stub(IDialogService, new class extends TestDialogService {
			override async confirm(confirmation: IConfirmation) {
				confirmations.push(confirmation);
				return environmentState.pendingConfirmation?.p ?? { confirmed: true };
			}
		}({ confirmed: true }, locationPromptResult));
		instantiationService.stub(IClipboardService, { writeText: async text => { copiedAddresses.push(text); } });
		instantiationService.stub(IRemoteAgentHostLocationPreferenceService, {
			getPreference: key => locationPreferences.get(key),
			setPreference: (key, preference) => { locationPreferences.set(key, preference); },
		});
		instantiationService.stub(IProductService, { nameShort: 'Code - OSS', nameLong: 'Code - OSS', version: '1.140.0', commit: 'client-commit', quality: 'insider', date: '2026-11-20T00:00:00.000Z' });
		instantiationService.stub(IProgressService, new TestProgressService());
		instantiationService.stub(IRemoteTunnelService, {
			onDidChangeTunnelStatus: tunnelStatusChanged.event,
			getTunnelStatus: () => initialTunnelStatus ?? Promise.resolve({ type: 'disconnected' }),
		});
		instantiationService.stub(INotificationService, new class extends TestNotificationService {
			override notify(notification: INotification) {
				notifications.push(notification);
				return super.notify(notification);
			}
		}());
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
			removeRemoteAgentHost: async address => { removedConnections.push(address); },
			getConnection: address => upcastPartial<IAgentConnection>({ initializeResult: initializeResultFor(address) }),
			triggerServerUpgrade: async (address, method) => {
				upgrades.push({ address, method });
				if (upgrade.failure) {
					throw upgrade.failure;
				}
				return upgrade.result;
			},
			waitForConnection: async address => {
				if (connectionFailure) {
					throw connectionFailure;
				}
				return { address, name: address, status: RemoteAgentHostConnectionStatus.connected };
			},
			getConnectionDiagnostics: () => diagnosticEvents,
		});
		const trustedHostKeys = new Map<string, ISSHTrustedHostKey[]>();
		const forgottenHosts: string[] = [];
		instantiationService.stub(ISSHHostKeyTrustService, {
			onDidChangeTrustedHosts: Event.None,
			getTrustedKeys: (host, port) => trustedHostKeys.get(`${host}:${port}`) ?? [],
			forgetHost: (host, port) => {
				forgottenHosts.push(`${host}:${port}`);
				trustedHostKeys.delete(`${host}:${port}`);
			},
		});
		instantiationService.stub(IExtensionService, {
			onDidChangeExtensions: Event.None,
			getExtension: async id => id === 'publisher.jobs' ? upcastPartial<IExtensionDescription>({ version: '1.4.2', bugs: { url: 'https://github.com/publisher/jobs/issues' } }) : undefined,
		});
		instantiationService.stub(IQuickInputService, {
			input: async options => {
				if (options) {
					renameInputs.push(options);
				}
				return environmentState.pendingRename?.p ?? renameInput;
			},
			pick: (async (picks: QuickPickInput<IQuickPickItem>[]) => {
				const items = picks.filter((pick): pick is IQuickPickItem => pick.type !== 'separator');
				devContainerPicks.offered.push(items.map(item => item.description ? `${item.label} (${item.description})` : item.label));
				return items.find(item => item.id === devContainerPicks.picked);
			}) as IQuickInputService['pick'],
		});
		instantiationService.stub(IMissionControlAvailabilityService, { available: environmentAvailable });
		instantiationService.stub(IMissionControlEnvironmentService, {
			hosts: environmentHosts,
			ownEnvironmentId,
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
		const sharing = {
			shareable: observableValue<ReadonlySet<string>>(store, new Set()),
			shares: observableValue<ReadonlyMap<string, IRemoteGitHubEnvironmentShare>>(store, new Map()),
			environmentIds: observableValue<ReadonlySet<string>>(store, new Set()),
			// Result of the keep-sharing prompt on disconnect: `false` means the user cancelled the disconnect.
			disconnectConfirmed: true,
			// Records how many removals had happened, to verify that sharing stops first.
			events: [] as string[],
		};
		instantiationService.stub(IRemoteGitHubEnvironmentSharingService, {
			shareable: sharing.shareable,
			shares: sharing.shares,
			environmentIds: sharing.environmentIds,
			confirmDisconnect: async (address, name) => {
				sharing.events.push(`confirm disconnect ${address} (${name})`);
				return sharing.disconnectConfirmed;
			},
			setShared: async (address, shared) => {
				sharing.events.push(`${shared ? 'share' : 'unshare'} ${address} after ${removals.length + sshDisconnects.length + deletedTunnels.length} removals`);
				const shares = new Map(sharing.shares.get());
				if (shared) {
					shares.set(address, { state: 'enabled', environmentId: `env-${address}` });
				} else {
					shares.delete(address);
				}
				sharing.shares.set(shares, undefined);
			},
		});
		instantiationService.stub(ISSHRemoteAgentHostService, {
			listSSHConfigHosts: () => sshDiscovery(),
			disconnect: async key => {
				sshDisconnects.push(key);
				if (connectionFailure) {
					throw connectionFailure;
				}
				removeSSHRemoteAgentHostEntry(storage, key);
			},
			resolveSSHConfig: async host => {
				resolvedSSHHosts.push(host);
				return { hostname: 'build.example', user: 'developer', port: 22, identityFile: [], identityAgent: undefined, forwardAgent: false, userKnownHostsFiles: [], globalKnownHostsFiles: [], strictHostKeyChecking: undefined, ...sshConfigs.get(host) };
			},
		});
		instantiationService.stub(IWSLRemoteAgentHostService, {
			onDidChangeConnections: wslConnectionsChanged.event,
			getCachedDistros: () => distros,
			listDistros: async () => {
				wslDiscoveryCalls++;
				if (wslState.discoveryFailure) {
					throw wslState.discoveryFailure;
				}
				return wslDistros;
			},
			listRunningDistros: async () => {
				if (wslState.runningFailure) {
					throw wslState.runningFailure;
				}
				return wslDistros.filter(distro => distro.isRunning).map(distro => distro.name);
			},
			terminateDistro: async distro => {
				terminatedDistros.push(distro);
				wslDistros = wslDistros.map(value => value.name === distro ? { ...value, isRunning: false } : value);
			},
			cacheDistro: distro => { distros = [distro]; },
		});
		instantiationService.stub(ITunnelAgentHostService, {
			get canDeleteTunnels() { return tunnelState.canDelete; },
			deleteTunnel: async (tunnel, authProvider) => {
				deletedTunnels.push({ tunnel, authProvider });
				await tunnelState.pendingDeletion?.p;
				if (tunnelState.failure) {
					throw tunnelState.failure;
				}
				tunnels = tunnels.filter(cached => cached.tunnelId !== tunnel.tunnelId);
				tunnelsChanged.fire();
			},
			onDidChangeTunnels: tunnelsChanged.event,
			getCachedTunnels: () => tunnels,
			getAuthProvider: () => tunnelAuthentication(),
			listTunnels: () => tunnelDiscovery(),
			isTunnelDismissed: id => dismissed.has(id),
			clearTunnelDismissal: id => { dismissed.delete(id); },
			cacheTunnel: (value, authProvider) => { tunnels = [{ ...value, authProvider }]; },
			connect: async (value, authProvider) => {
				reconnects.push(`tunnel:${value.tunnelId}`);
				tunnelConnections.push({ tunnel: value, authProvider });
			},
			signIn: async provider => { signIns.push(provider); },
		});
		const pickerVisibility = store.add(new RemoteAgentHostPickerVisibility(storage));
		const createProvider = (address: string, preferenceKey?: string) => new class extends mock<IAgentHostSessionsProvider>() {
			readonly sessions: ISession[] = [];
			sessionReads = 0;
			override readonly sessionListVersion = observableValue(this, 0);
			readonly root = observableValue<RootState | undefined>(this, undefined);
			override getRootState(): RootState | undefined { return this.root.get(); }
			override readonly onDidChangeSessions = Event.None;
			override getSessions(): ISession[] { this.sessionReads++; return this.sessions; }
			override readonly id = `agenthost-${address}`;
			override readonly remoteAddress = address;
			override readonly remoteLocationPreferenceKey = preferenceKey;
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
		const devContainers = {
			environments: observableValue<readonly IDevContainerEnvironment[]>(store, []),
			hosts: observableValue<ReadonlySet<string>>(store, new Set()),
			deletions: [] as string[],
		};
		instantiationService.stub(IDevContainerAgentHostService, {
			environments: devContainers.environments,
			environmentHosts: devContainers.hosts,
			createEnvironment: async sourceAddress => {
				const environment = { address: `devcontainer:${sourceAddress}`, sourceAddress, providerId: `agenthost-devcontainer:${sourceAddress}` };
				devContainers.environments.set([...devContainers.environments.get(), environment], undefined);
				return { ...environment, workspaceUri: undefined };
			},
			deleteEnvironment: async address => {
				devContainers.deletions.push(address);
				devContainers.environments.set(devContainers.environments.get().filter(environment => environment.address !== address), undefined);
			},
		});
		const telemetry = new TestExperimentTriggerTelemetryService();
		instantiationService.stub(ITelemetryService, telemetry);
		const model = store.add(instantiationService.createInstance(RemotesModel));
		const addProvider = (address: string, localRegistration?: LocalAgentHostRegistration) => {
			const provider = createProvider(address);
			Object.assign(provider, { localRegistration: constObservable(localRegistration) });
			providers.set(address, provider);
			providersChanged.fire({ added: [], removed: [] });
			return provider;
		};
		return {
			model, storage, configuration, removals, sshDisconnects, removedConnections, logEntries, providers, providersChanged, connectionChanges, reconnects, signIns,
			copiedAddresses, locationPromptResult, locationPreferences, notifications, upgrades, upgrade,
			wslState, wslConnectionsChanged, terminatedDistros, diagnosticEvents, trustedHostKeys, forgottenHosts, resolvedSSHHosts, sshConfigs,
			setConnections: (value: readonly IRemoteAgentHostConnectionInfo[]) => { connections = value; connectionsChanged.fire(); },
			createProvider, setCachedDistros: (cached: IWSLCachedDistro[]) => { distros = cached; },
			getCachedTunnels: () => tunnels,
			setCachedTunnels: (cached: ICachedTunnel[]) => { tunnels = cached; tunnelsChanged.fire(); },
			tunnelConnections, tunnelState, deletedTunnels,
			setTunnelStatus: (status: TunnelStatus) => tunnelStatusChanged.fire(status),
			failConnection: (error: Error | undefined) => { connectionFailure = error; },
			renameInputs, setRenameInput: (value: string | undefined) => { renameInput = value; }, setDisplayName,
			getWSLDiscoveryCalls: () => wslDiscoveryCalls, setWSLDistros: (value: IWSLDistro[]) => { wslDistros = value; }, setSSHDiscovery: (discovery: () => Promise<string[]>) => { sshDiscovery = discovery; },
			setTunnelDiscovery: (discovery: () => Promise<ITunnelInfo[]>) => { tunnelDiscovery = discovery; },
			setTunnelAuthentication: (authentication: () => Promise<'github' | 'microsoft' | undefined>) => { tunnelAuthentication = authentication; },
			environmentHosts, ownEnvironmentId, environmentAvailable, environmentState, environmentConnections, environmentNames, environmentDeletions, confirmations, sharing, extensionHosts, devContainers, devContainerPicks, telemetry,
			setConfiguration: async (key: string, value: boolean) => {
				await configuration.setUserConfiguration(key, value);
				configuration.onDidChangeConfigurationEmitter.fire({
					source: ConfigurationTarget.USER, affectedKeys: new Set([key]),
					change: { keys: [key], overrides: [] }, affectsConfiguration: section => section === key,
				});
			},
			addEnvironmentProvider: (id: string, localRegistration?: LocalAgentHostRegistration) => addProvider(cloudSandboxAddress(id), localRegistration),
			addProvider,
			setInitializeResultMeta: (address: string, meta: Record<string, unknown> | undefined, serverInfo?: Implementation) => initializeResultFor(address).set({ protocolVersion: '1.0.0', serverSeq: 0, snapshots: [], _meta: meta, ...(serverInfo ? { serverInfo } : {}) }, undefined),
		};
	}

	test('retains last-known metadata without reading an unresolved list or guessing the system from path style', async () => {
		const first = setup();
		const provider = first.providers.get('ssh:build')!;
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		await first.model.refresh(CancellationToken.None);
		first.setConnections([{ address: 'ssh:build', name: 'Build', status: RemoteAgentHostConnectionStatus.connected, pathStyle: PathStyle.Posix }]);
		const unresolvedReads = provider.sessionReads;
		const session = buildTestSession({ id: 'working', title: 'Working', status: SessionStatus.InProgress }, 100000);
		provider.sessions.push(session.session);
		provider.sessionListVersion.set(1, undefined);
		const observed = first.model.remotes.get().find(remote => remote.id === 'ssh:build')!.metadata!;
		provider.sessionListVersion.set(0, undefined);
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.disconnected, undefined);
		first.model.dispose();
		const second = setup([], undefined, first.storage);
		await second.model.refresh(CancellationToken.None);
		const restored = second.model.remotes.get().find(remote => remote.id === 'ssh:build')!;
		const cached = { metadata: restored.metadata, stale: restored.metadataIsStale };
		const nextProvider = second.providers.get('ssh:build')!;
		nextProvider.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		const whileLoading = second.model.remotes.get().find(remote => remote.id === 'ssh:build')!.metadata;
		nextProvider.sessionListVersion.set(1, undefined);
		const empty = second.model.remotes.get().find(remote => remote.id === 'ssh:build')!.metadata!;
		assert.deepStrictEqual({
			unresolvedReads, observed: { ...observed, observedAt: observed.observedAt > 0, lastOnlineAt: typeof observed.lastOnlineAt },
			cached, whileLoading: whileLoading?.activeSessionCount, empty: empty.activeSessionCount,
			connectionChanges: [...first.connectionChanges, ...second.connectionChanges],
		}, {
			unresolvedReads: 0, observed: { operatingSystem: undefined, activeSessionCount: 1, observedSessionCount: 1, lastConnectedAt: undefined, lastActivityAt: session.session.updatedAt.get().getTime(), lastOnlineAt: 'number', observedAt: true },
			cached: { metadata: observed, stale: true }, whileLoading: 1, empty: 0, connectionChanges: [],
		});
	});

	test('last activity uses session updates, survives disconnection and never substitutes connection time', async () => {
		const { model, providers } = setup();
		await model.refresh(CancellationToken.None);
		const provider = providers.get('ssh:build')!;
		const updatedAt = observableValue(model, new Date(200_000));
		const session = buildTestSession({ id: 'activity', title: 'Activity' }, 100_000).session;
		provider.sessions.push({ ...session, updatedAt });
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		const pending = model.remotes.get().find(remote => remote.id === 'ssh:build')!.metadata?.lastActivityAt;
		provider.sessionListVersion.set(1, undefined);
		const observed = model.remotes.get().find(remote => remote.id === 'ssh:build')!.metadata?.lastActivityAt;
		updatedAt.set(new Date(300_000), undefined);
		const latest = model.remotes.get().find(remote => remote.id === 'ssh:build')!.metadata?.lastActivityAt;
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.disconnected, undefined);
		updatedAt.set(new Date(400_000), undefined);
		assert.deepStrictEqual({ pending, observed, latest, cached: model.remotes.get().find(remote => remote.id === 'ssh:build')!.metadata?.lastActivityAt }, {
			pending: undefined, observed: 200_000, latest: 300_000, cached: 300_000,
		});
	});

	test('reads host-reported system resources for every connection method and retains them as last known after disconnect', async () => {
		const { model, providers, environmentAvailable, environmentHosts, setConfiguration, addEnvironmentProvider, connectionChanges } = setup();
		environmentAvailable.set(true, undefined);
		await setConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentHosts.set([{ id: 'personal', name: 'Personal', kind: 'user-local', status: 'online' }], undefined);
		addEnvironmentProvider('personal');
		await model.refresh(CancellationToken.None);
		const samples = [];
		for (const [address, provider] of providers) {
			provider.root.set({ agents: [], _meta: withAgentHostResources(undefined, { platform: 'linux', architecture: 'arm64', cpuCount: 8, memoryBytes: 16 * 1024 ** 3 }) }, undefined);
			provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
			const live = model.remotes.get().find(remote => remote.id === address)!;
			provider.connectionStatus.set(RemoteAgentHostConnectionStatus.disconnected, undefined);
			const cached = model.remotes.get().find(remote => remote.id === address)!;
			samples.push({
				kind: live.kind,
				resources: [live.metadata?.operatingSystem, live.metadata?.architecture, live.metadata?.cpuCount, live.metadata?.memoryBytes],
				loadingSessions: live.metadata?.observedSessionCount,
				retained: cached.metadata?.architecture,
			});
		}
		assert.deepStrictEqual({ samples, connectionChanges }, {
			samples: ['ssh', 'wsl', 'tunnel', 'environment'].map(kind => ({
				kind, resources: [OperatingSystem.Linux, 'arm64', 8, 16 * 1024 ** 3],
				loadingSessions: undefined, retained: 'arm64',
			})),
			connectionChanges: [],
		});
	});

	test('shows resolved SSH identity without connecting or changing the alias used to connect', async () => {
		const { model, connectionChanges } = setup();
		await model.refresh(CancellationToken.None);
		const remote = model.remotes.get().find(remote => remote.id === 'ssh:build')!;
		assert.deepStrictEqual({ name: remote.name, detail: remote.detail, id: remote.id, connectionChanges }, {
			name: 'build', detail: 'developer@build.example', id: 'ssh:build', connectionChanges: [],
		});
	});

	test('distinguishes ambiguous names without exposing IDs, merging hosts or renumbering on availability changes', async () => {
		const { model, environmentAvailable, environmentHosts, setConfiguration } = setup();
		environmentAvailable.set(true, undefined);
		await setConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentHosts.set(['one', 'two', 'three'].map(id => ({ id, name: 'Workstation', kind: 'user-local', status: 'offline' })), undefined);
		const before = model.remotes.get().filter(remote => remote.kind === 'environment').map(remote => [remote.id, remote.name]);
		environmentHosts.set([...environmentHosts.get()].reverse().map(host => ({ ...host, status: 'online' })), undefined);
		const after = model.remotes.get().filter(remote => remote.kind === 'environment').map(remote => [remote.id, remote.name]);
		assert.deepStrictEqual({ before, after }, {
			before: [['cloudsandbox:one', 'Workstation'], ['cloudsandbox:three', 'Workstation (2)'], ['cloudsandbox:two', 'Workstation (3)']],
			after: before,
		});
	});

	test('excludes this computer by registration identity even without a connected local provider, not by its name', async () => {
		const { model, ownEnvironmentId, environmentAvailable, environmentHosts, setConfiguration } = setup();
		environmentAvailable.set(true, undefined);
		await setConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentHosts.set(['own', 'other'].map(id => ({ id, name: 'Workstation', kind: 'user-local', status: 'offline' })), undefined);
		ownEnvironmentId.set('own', undefined);
		assert.deepStrictEqual(model.remotes.get().filter(remote => remote.kind === 'environment').map(remote => [remote.id, remote.name]), [
			['cloudsandbox:other', 'Workstation'],
		]);
	});

	test('same-named connection methods get meaningful route names and keep their original connection targets', async () => {
		const { model, environmentAvailable, environmentHosts, setConfiguration, connectionChanges } = setup();
		environmentAvailable.set(true, undefined);
		await setConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentHosts.set([{ id: 'remote', name: 'build', kind: 'user-local', status: 'online' }], undefined);
		await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({
			hosts: model.remotes.get().filter(remote => remote.name.startsWith('build')).map(remote => [remote.id, remote.name]),
			connectionChanges,
		}, {
			hosts: [['ssh:build', 'build (SSH)'], ['cloudsandbox:remote', 'build (GitHub Environment)']], connectionChanges: [],
		});
	});

	test('counts only active work, including waiting for input, and observes completion', async () => {
		const { model, providers } = setup();
		await model.refresh(CancellationToken.None);
		const provider = providers.get('ssh:build')!;
		const sessions = [SessionStatus.InProgress, SessionStatus.NeedsInput, SessionStatus.Completed, SessionStatus.Error, SessionStatus.Untitled]
			.map((status, index) => buildTestSession({ id: `session-${index}`, title: 'Session', status }));
		provider.sessions.push(...sessions.map(session => session.session));
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		provider.sessionListVersion.set(1, undefined);
		const count = () => model.remotes.get().find(remote => remote.id === 'ssh:build')?.metadata?.activeSessionCount;
		const working = count();
		const total = model.remotes.get().find(remote => remote.id === 'ssh:build')!.metadata?.observedSessionCount;
		sessions[0].status.set(SessionStatus.Completed, undefined);
		const waiting = count();
		sessions[1].status.set(SessionStatus.Completed, undefined);
		assert.deepStrictEqual({ working, waiting, idle: count(), total }, { working: 2, waiting: 1, idle: 0, total: 4 });
	});

	test('ignores legacy cached totals while preserving known system metadata', async () => {
		const { model, storage, connectionChanges } = setup();
		storage.store(`remoteAgentHost.lastKnownMetadata.${getRemoteAgentHostPickerKey('tunnel:laptop')}`, {
			operatingSystem: OperatingSystem.Macintosh, sessionCount: 393, runningSessionCount: 0, observedAt: 100000,
		}, StorageScope.PROFILE, StorageTarget.MACHINE);
		await model.refresh(CancellationToken.None);
		const remote = model.remotes.get().find(remote => remote.id === 'tunnel:laptop')!;
		assert.deepStrictEqual({ metadata: { ...remote.metadata, lastOnlineAt: typeof remote.metadata?.lastOnlineAt }, stale: remote.metadataIsStale, connectionChanges }, {
			// Recording when the tunnel was seen online must not refresh when its system details were observed.
			metadata: { operatingSystem: OperatingSystem.Macintosh, activeSessionCount: undefined, observedSessionCount: undefined, observedAt: 100000, lastConnectedAt: undefined, lastActivityAt: undefined, lastOnlineAt: 'number' },
			stale: true, connectionChanges: [],
		});
	});

	test('last connection records successful observed connections, not discovery or session updates', async () => {
		const { model, providers, storage } = setup();
		await model.refresh(CancellationToken.None);
		const provider = providers.get('ssh:build')!;
		const before = model.remotes.get().find(remote => remote.id === 'ssh:build')?.metadata?.lastConnectedAt;
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connecting, undefined);
		const pending = model.remotes.get().find(remote => remote.id === 'ssh:build')?.metadata?.lastConnectedAt;
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		const connected = model.remotes.get().find(remote => remote.id === 'ssh:build')?.metadata?.lastConnectedAt;
		provider.sessions.push(buildTestSession({ id: 'later', title: 'Later', status: SessionStatus.InProgress }, Date.now() + 100000).session);
		provider.sessionListVersion.set(1, undefined);
		const afterSession = model.remotes.get().find(remote => remote.id === 'ssh:build')?.metadata?.lastConnectedAt;
		model.dispose();
		const next = setup([], undefined, storage);
		await next.model.refresh(CancellationToken.None);
		assert.deepStrictEqual({ before, pending, recorded: typeof connected, unchanged: afterSession === connected, restored: next.model.remotes.get().find(remote => remote.id === 'ssh:build')?.metadata?.lastConnectedAt }, {
			before: undefined, pending: undefined, recorded: 'number', unchanged: true, restored: connected,
		});
	});

	test('explicit inline run behavior bypasses the prompt and uses the existing stable preference and reconnect path', async () => {
		const { model, providers, locationPreferences, connectionChanges } = setup();
		await model.refresh(CancellationToken.None);
		providers.get('ssh:build')!.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		const result = await model.changePreferredAgentLocation('ssh:build', 'dedicated');
		assert.deepStrictEqual({ result, preference: locationPreferences.get('ssh:build'), connections: connectionChanges }, {
			result: 'reconnected', preference: 'dedicated', connections: [{ id: 'ssh:build', connected: true }],
		});
	});

	test('last-known environment metadata is account-scoped and corrupt cache entries are discarded with a warning', async () => {
		const { model, storage, setConfiguration, environmentAvailable, environmentHosts, environmentState, addEnvironmentProvider, logEntries } = setup();
		environmentAvailable.set(true, undefined);
		await setConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		const host = { id: 'personal', name: 'Personal', kind: 'user-local', status: 'online' };
		environmentHosts.set([host], undefined);
		const provider = addEnvironmentProvider(host.id);
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		provider.sessionListVersion.set(1, undefined);
		const id = cloudSandboxAddress(host.id);
		const recorded = model.remotes.get().find(remote => remote.id === id)!.metadata?.activeSessionCount;
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.disconnected, undefined);
		environmentState.account = 'account-two';
		environmentHosts.set([{ ...host, status: 'offline' }], undefined);
		const otherAccount = model.remotes.get().find(remote => remote.id === id)!.metadata;
		const key = `remoteAgentHost.lastKnownMetadata.${getRemoteAgentHostPickerKey(id, 'account-two')}`;
		storage.store(key, { observedAt: -1, activeSessionCount: 'not a count' }, StorageScope.PROFILE, StorageTarget.MACHINE);
		environmentHosts.set([{ ...host, status: 'offline' }], undefined);
		assert.deepStrictEqual({ recorded, otherAccount, discarded: storage.get(key, StorageScope.PROFILE), warned: logEntries.some(entry => entry.message.includes('Invalid cached environment metadata')) }, {
			recorded: 0, otherAccount: undefined, discarded: undefined, warned: true,
		});
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

	test('lists extension remotes while registered, connects user-disconnected ones and refuses to remove them', async () => {
		const { model, extensionHosts, reconnects } = setup();
		const registration = extensionHosts.registerHost({ extensionId: 'publisher.jobs', extensionDisplayName: 'Job Runner', name: 'Runner Jobs', address: 'ws://127.0.0.1:8445', connectionToken: 'secret' });
		extensionHosts.setDisconnected('127.0.0.1:8445', true);
		const extensionRemotes = () => model.remotes.get().filter(remote => remote.kind === 'extension')
			.map(({ id, name, detail, contributedBy, canRemove, connectionStatus }) => ({ id, name, detail, contributedBy, canRemove, status: connectionStatus.kind }));
		const registered = extensionRemotes();
		const removal = await model.remove('127.0.0.1:8445').then(() => 'removed', (error: Error) => error.message);
		await model.setConnected('127.0.0.1:8445', true);
		const disconnected = [...extensionHosts.disconnectedAddresses.get()];
		registration.dispose();

		assert.deepStrictEqual({ registered, removal, disconnected, reconnects, unregistered: extensionRemotes() }, {
			registered: [{ id: '127.0.0.1:8445', name: 'Runner Jobs', detail: '127.0.0.1:8445', contributedBy: { extensionId: 'publisher.jobs', displayName: 'Job Runner' }, canRemove: false, status: 'disconnected' }],
			removal: 'This remote cannot be removed. Only registered remotes that support removal can be removed.',
			disconnected: [],
			reconnects: ['127.0.0.1:8445'],
			unregistered: [],
		});
	});

	test('offers Create Dev Container on Docker hosts only when enabled, triggering the experiment in every arm', async () => {
		const results = [];
		for (const enabled of [false, true]) {
			const { model, devContainers, telemetry, setConfiguration } = setup();
			await setConfiguration(DevContainerAgentHostEnabledSettingId, true);
			await setConfiguration(DevContainerEnvironmentsEnabledSettingId, enabled);
			const triggersWithoutHosts = [...telemetry.triggers];
			devContainers.hosts.set(new Set(['wsl:Ubuntu']), undefined);
			results.push({
				enabled, triggersWithoutHosts, triggers: telemetry.triggers,
				creatable: model.remotes.get().filter(remote => remote.canCreateDevContainer).map(remote => remote.id),
			});
		}
		const trigger = `config.${DevContainerEnvironmentsEnabledSettingId}`;
		assert.deepStrictEqual(results, [
			{ enabled: false, triggersWithoutHosts: [], triggers: [trigger], creatable: [] },
			{ enabled: true, triggersWithoutHosts: [], triggers: [trigger], creatable: ['wsl:Ubuntu'] },
		]);
	});

	test('lists created Dev Containers with their host and deletes them after confirmation', async () => {
		const { model, devContainers, confirmations, setConfiguration } = setup();
		await setConfiguration(DevContainerAgentHostEnabledSettingId, true);
		await setConfiguration(DevContainerEnvironmentsEnabledSettingId, true);
		const devContainerRows = () => model.remotes.get().filter(remote => remote.kind === 'devContainer')
			.map(({ id, name, description, canDelete, canRemove }) => ({ id, name, description, canDelete, canRemove }));
		await assert.rejects(model.createDevContainer('wsl:Ubuntu'), /cannot be created/);
		devContainers.hosts.set(new Set(['wsl:Ubuntu']), undefined);
		await model.createDevContainer('wsl:Ubuntu');
		const created = devContainerRows();
		await setConfiguration(DevContainerEnvironmentsEnabledSettingId, false);
		const disabled = devContainerRows();
		await setConfiguration(DevContainerEnvironmentsEnabledSettingId, true);
		await model.deleteDevContainer('devcontainer:wsl:Ubuntu');
		assert.deepStrictEqual({ created, disabled, confirmations: confirmations.map(confirmation => confirmation.message), deletions: devContainers.deletions, deleted: devContainerRows() }, {
			created: [{ id: 'devcontainer:wsl:Ubuntu', name: 'Dev Container', description: 'Ubuntu', canDelete: true, canRemove: false }],
			disabled: [],
			confirmations: ['Are you sure you want to delete Dev Container \'Dev Container\'?'],
			deletions: ['devcontainer:wsl:Ubuntu'],
			deleted: [],
		});
	});

	test('offers creating a Dev Container when only this computer has Docker, triggering the experiment in every arm', async () => {
		const results = [];
		for (const enabled of [false, true]) {
			const { model, devContainers, telemetry, setConfiguration } = setup();
			await setConfiguration(DevContainerAgentHostEnabledSettingId, true);
			await setConfiguration(DevContainerEnvironmentsEnabledSettingId, enabled);
			const before = { triggers: [...telemetry.triggers], canCreate: model.canCreateDevContainer.get() };
			devContainers.hosts.set(new Set([LocalDevContainerEnvironmentHost]), undefined);
			results.push({ enabled, before, triggers: telemetry.triggers, canCreate: model.canCreateDevContainer.get() });
		}
		const trigger = `config.${DevContainerEnvironmentsEnabledSettingId}`;
		assert.deepStrictEqual(results, [
			{ enabled: false, before: { triggers: [], canCreate: false }, triggers: [trigger], canCreate: false },
			{ enabled: true, before: { triggers: [], canCreate: false }, triggers: [trigger], canCreate: true },
		]);
	});

	test('creates Dev Containers from the section on the only host or a picked one, naming those on this computer', async () => {
		const { model, devContainers, devContainerPicks, confirmations, setConfiguration } = setup();
		await setConfiguration(DevContainerAgentHostEnabledSettingId, true);
		await setConfiguration(DevContainerEnvironmentsEnabledSettingId, true);
		const unavailable = await model.createDevContainer().then(() => 'created', (error: Error) => error.message);
		devContainers.hosts.set(new Set([LocalDevContainerEnvironmentHost]), undefined);
		await model.createDevContainer();
		devContainers.hosts.set(new Set([LocalDevContainerEnvironmentHost, 'wsl:Ubuntu']), undefined);
		await model.createDevContainer();
		devContainerPicks.picked = 'wsl:Ubuntu';
		await model.createDevContainer();
		const rows = model.remotes.get().filter(remote => remote.kind === 'devContainer').map(({ id, description, connectsWithHost }) => ({ id, description, connectsWithHost }));
		await model.deleteDevContainer('devcontainer:local');
		assert.deepStrictEqual({ unavailable, offered: devContainerPicks.offered, rows, details: confirmations.map(confirmation => confirmation.detail), deletions: devContainers.deletions }, {
			unavailable: 'Dev Containers cannot be created on this remote now. Connect to it and make sure Docker is installed.',
			offered: [['This Computer', 'Ubuntu (WSL)'], ['This Computer', 'Ubuntu (WSL)']],
			rows: [
				{ id: 'devcontainer:local', description: 'This Computer', connectsWithHost: undefined },
				{ id: 'devcontainer:wsl:Ubuntu', description: 'Ubuntu', connectsWithHost: true },
			],
			details: ['This removes the container and its Docker volume from this computer, including all files in the container. Sessions that ran in it can no longer continue.'],
			deletions: ['devcontainer:local'],
		});
	});

	test('troubleshooting info reads SSH configuration, saved host keys and the last connection step without connecting', async () => {
		const { model, storage, diagnosticEvents, trustedHostKeys, forgottenHosts, confirmations, connectionChanges } = setup();
		addSSHRemoteAgentHostEntry(storage, savedSSHHost);
		trustedHostKeys.set('build.example:22', [{ keyType: 'ssh-ed25519', fingerprint: 'SHA256:abc', addedAt: 0 }]);
		// Trust saved under the alias belongs to another identity; the connector trusts the resolved host name here.
		trustedHostKeys.set('removed:22', [{ keyType: 'ssh-rsa', fingerprint: 'SHA256:other', addedAt: 0 }]);
		diagnosticEvents.push(
			{ address: 'ssh:removed', operationId: '1', phase: 'transport.connect', outcome: 'failed', timestamp: 2, error: { name: 'Error', message: 'Host key verification failed' } },
			{ address: 'ssh:removed', operationId: '1', phase: 'connection.closed', outcome: 'info', timestamp: 3 },
			{ address: 'ssh:other', operationId: '2', phase: 'transport.connect', outcome: 'succeeded', timestamp: 4 },
		);
		const saved = await model.getTroubleshootingInfo('ssh:removed');
		await model.forgetSSHHostKey('ssh:removed');
		const forgotten = (await model.getTroubleshootingInfo('ssh:removed')).ssh?.hasSavedHostKey;
		const forgetAgain = await model.forgetSSHHostKey('ssh:removed').then(() => 'forgotten', (error: Error) => error.message);
		assert.deepStrictEqual({ saved, forgottenHosts, remainingTrust: [...trustedHostKeys.keys()], confirmations: confirmations.map(({ message, detail }) => ({ message, detail })), forgotten, forgetAgain, connectionChanges }, {
			saved: {
				lastStep: { phase: 'transport.connect', outcome: 'failed', timestamp: 2, error: 'Error: Host key verification failed' },
				ssh: { alias: 'removed', hostName: 'build.example', user: 'developer', port: 22, hasSavedHostKey: true },
				versions: { client: { name: 'Code - OSS', version: '1.140.0', build: { commit: 'client-commit', quality: 'insider', date: '2026-11-20T00:00:00.000Z' } } },
			},
			forgottenHosts: ['build.example:22'],
			remainingTrust: ['removed:22'],
			confirmations: [{
				message: 'Forget the saved host key for \'Saved host\'?',
				detail: 'The next time you connect, you\'ll be asked to verify the remote computer\'s host key. Only continue if you know why the key changed.\n\nssh-ed25519 SHA256:abc',
			}],
			forgotten: false,
			forgetAgain: 'No host key is saved for this remote.',
			connectionChanges: [],
		});
	});

	test('troubleshooting info resolves saved SSH hosts without an alias, and falls back from a HostKeyAlias without keys like the connector', async () => {
		const { model, storage, trustedHostKeys, forgottenHosts, resolvedSSHHosts, sshConfigs } = setup();
		addSSHRemoteAgentHostEntry(storage, {
			name: 'Direct host', connectionToken: undefined,
			connection: { type: RemoteAgentHostEntryType.SSH, address: 'ssh:dev@direct.example:2222', hostName: 'direct.example', user: 'dev', port: 2222 },
		});
		sshConfigs.set('direct.example', { hostname: 'direct.internal', hostKeyAlias: 'direct-key', port: 22 });
		trustedHostKeys.set('direct.internal:2222', [{ keyType: 'ssh-ed25519', fingerprint: 'SHA256:legacy', addedAt: 0 }]);
		const legacy = await model.getTroubleshootingInfo('ssh:dev@direct.example:2222');
		trustedHostKeys.set('direct-key:2222', [{ keyType: 'ssh-ed25519', fingerprint: 'SHA256:alias', addedAt: 0 }]);
		await model.forgetSSHHostKey('ssh:dev@direct.example:2222');
		assert.deepStrictEqual({ ssh: legacy.ssh, resolvedSSHHosts, forgottenHosts, remainingTrust: [...trustedHostKeys.keys()] }, {
			ssh: { host: 'direct.example', hostName: 'direct.internal', user: 'dev', port: 2222, hasSavedHostKey: true },
			resolvedSSHHosts: ['direct.example', 'direct.example'],
			forgottenHosts: ['direct-key:2222'],
			remainingTrust: ['direct.internal:2222'],
		});
	});

	test('troubleshooting info describes tunnels, extension remotes and Dev Container hosts', async () => {
		const { model, extensionHosts, devContainers, setConfiguration, setCachedTunnels } = setup();
		await setConfiguration(DevContainerAgentHostEnabledSettingId, true);
		await setConfiguration(DevContainerEnvironmentsEnabledSettingId, true);
		setCachedTunnels([{ ...tunnel, tunnelId: 'saved', name: 'Saved', authProvider: 'github' }, { ...tunnel, tunnelId: 'other', name: 'Other account', authProvider: 'microsoft' }]);
		await model.refresh(CancellationToken.None);
		const savedTunnels = { saved: (await model.getTroubleshootingInfo('tunnel:saved')).tunnel, otherAccount: (await model.getTroubleshootingInfo('tunnel:other')).tunnel };
		const registration = extensionHosts.registerHost({ extensionId: 'publisher.jobs', extensionDisplayName: 'Job Runner', name: 'Runner Jobs', address: 'ws://127.0.0.1:8445', connectionToken: 'secret' });
		devContainers.hosts.set(new Set(['ssh:build']), undefined);
		await model.setConnected('ssh:build', true);
		await model.createDevContainer('ssh:build');
		const hostConnected = (await model.getTroubleshootingInfo('devcontainer:ssh:build')).devContainer;
		await model.setConnected('ssh:build', false);
		const hostDisconnected = (await model.getTroubleshootingInfo('devcontainer:ssh:build')).devContainer;
		const info = {
			tunnel: (await model.getTroubleshootingInfo('tunnel:laptop')).tunnel, extension: (await model.getTroubleshootingInfo('127.0.0.1:8445')).extension,
			hostConnected, hostDisconnected,
		};
		registration.dispose();
		assert.deepStrictEqual({ ...info, savedTunnels }, {
			tunnel: { authProvider: 'github', inLastDiscovery: true, hostConnectionCount: 1 },
			extension: { version: '1.4.2', issuesUrl: 'https://github.com/publisher/jobs/issues' },
			hostConnected: { hostId: 'ssh:build', hostName: 'build', hostConnected: true, dockerAvailable: true },
			hostDisconnected: { hostId: 'ssh:build', hostName: 'build', hostConnected: false },
			// Saved tunnels have no host count, and discovery with one account says nothing about another's tunnels.
			savedTunnels: { saved: { authProvider: 'github', inLastDiscovery: false }, otherAccount: { authProvider: 'microsoft' } },
		});
	});

	test('troubleshooting info shows the server version of the current or last connection and whether an update is available', async () => {
		const { model, providers, setInitializeResultMeta } = setup();
		await model.refresh(CancellationToken.None);
		const provider = providers.get('tunnel:laptop')!;
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		const serverInfo: Implementation = { name: 'vscode-agent-host', title: 'VS Code Agent Host', version: '1.140.0' };
		const build = { commit: 'host-commit', quality: 'insider', date: '2026-11-19T00:00:00.000Z' };
		const method = { 'vscode.upgradeMethod': '_vscodeUpgrade' };
		const versions = async (meta: Record<string, unknown> | undefined) => {
			setInitializeResultMeta('tunnel:laptop', meta, serverInfo);
			return (await model.getTroubleshootingInfo('tunnel:laptop')).versions;
		};
		const results = {
			relay: await versions(undefined),
			otherQuality: await versions({ ...method, 'vscode.build': { ...build, quality: 'stable' } }),
			sameBuild: await versions({ ...method, 'vscode.build': { ...build, commit: 'client-commit' } }),
			olderBuild: await versions({ ...method, 'vscode.build': build }),
		};
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.disconnected, undefined);
		const lastConnection = (await model.getTroubleshootingInfo('tunnel:laptop')).versions;
		const client = { name: 'Code - OSS', version: '1.140.0', build: { commit: 'client-commit', quality: 'insider', date: '2026-11-20T00:00:00.000Z' } };
		const server = { name: 'VS Code Agent Host', version: '1.140.0', current: true };
		assert.deepStrictEqual({ ...results, lastConnection }, {
			relay: { server, client, update: 'unavailable' },
			otherQuality: { server: { ...server, build: { ...build, quality: 'stable' } }, client, update: 'otherQuality' },
			sameBuild: { server: { ...server, build: { ...build, commit: 'client-commit' } }, client, update: 'upToDate' },
			olderBuild: { server: { ...server, build }, client, update: 'available' },
			lastConnection: { server: { ...server, build, current: false }, client },
		});
	});

	(isWindows ? test : test.skip)('Restart Distribution stops the distribution after confirmation and connects again', async () => {
		const { model, setWSLDistros, terminatedDistros, connectionChanges, confirmations, environmentState } = setup();
		setWSLDistros([{ name: 'Ubuntu', isDefault: true, isRunning: true, version: 2 }]);
		await model.refresh(CancellationToken.None);
		const info = await model.getTroubleshootingInfo('wsl:Ubuntu');
		environmentState.pendingConfirmation = new DeferredPromise<IConfirmationResult>();
		void environmentState.pendingConfirmation.complete({ confirmed: false });
		const cancelled = await model.restartWSLDistribution('wsl:Ubuntu').then(() => false, isCancellationError);
		environmentState.pendingConfirmation = undefined;
		await model.restartWSLDistribution('wsl:Ubuntu');
		assert.deepStrictEqual({ canRestart: info.canRestartDistribution, cancelled, terminatedDistros, connectionChanges, confirmations: confirmations.map(confirmation => confirmation.message) }, {
			canRestart: true,
			cancelled: true,
			terminatedDistros: ['Ubuntu'],
			connectionChanges: [{ id: 'wsl:Ubuntu', connected: true }],
			confirmations: ['Restart the WSL distribution \'Ubuntu\'?', 'Restart the WSL distribution \'Ubuntu\'?'],
		});
	});

	test('reads service-owned error metadata even when opened midway through a retry', async () => {
		const connection: IRemoteAgentHostConnectionInfo = {
			address: 'ssh:build', name: 'Build', status: RemoteAgentHostConnectionStatus.connecting, lastConnectionError: 'First failure',
		};
		const { model, providers, setConnections } = setup([connection]);
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

	test('live connection service state wins over a lagging provider and offline discovery', async () => {
		const connection: IRemoteAgentHostConnectionInfo = { address: 'tunnel:laptop', name: 'Laptop', status: RemoteAgentHostConnectionStatus.connected };
		const { model, providers, setConnections, setTunnelDiscovery, connectionChanges } = setup([connection]);
		setTunnelDiscovery(async () => [{ ...tunnel, hostConnectionCount: 0 }]);
		await model.refresh(CancellationToken.None);
		const snapshot = () => {
			const remote = model.remotes.get().find(remote => remote.id === connection.address)!;
			return { status: remote.connectionStatus.kind, availability: remote.availability };
		};
		const connected = snapshot();
		await model.setConnected(connection.address, true);
		const redundantAttempts = connectionChanges.length;
		providers.get(connection.address)!.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		setConnections([{ ...connection, status: RemoteAgentHostConnectionStatus.disconnected }]);
		const disconnected = snapshot();
		await assert.rejects(model.setConnected(connection.address, true), /offline/);
		assert.deepStrictEqual({ connected, redundantAttempts, disconnected, connectionChanges }, {
			connected: { status: 'connected', availability: 'online' }, redundantAttempts: 0,
			disconnected: { status: 'disconnected', availability: 'offline' },
			connectionChanges: [],
		});
	});

	test('unrecognized GitHub Environment states and failed refreshes are not reported as offline', async () => {
		const { model, setConfiguration, environmentAvailable, environmentHosts, environmentState } = setup();
		await setConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentAvailable.set(true, undefined);
		const host = { id: 'desktop', name: 'Desktop', kind: 'user-local', status: 'starting' };
		environmentHosts.set([host], undefined);
		await model.refresh(CancellationToken.None);
		const snapshot = () => model.remotes.get().find(remote => remote.id === cloudSandboxAddress(host.id))!.availability;
		const unrecognized = snapshot();
		environmentHosts.set([{ ...host, status: 'online' }], undefined);
		const online = snapshot();
		environmentState.refreshFailure = new Error('Network unavailable');
		await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({ unrecognized, online, failed: snapshot() }, { unrecognized: 'unknown', online: 'online', failed: 'unknown' });
	});

	test('fresh tunnel discovery wins over cached and provider names without registering or connecting', async () => {
		const { model, setCachedTunnels, getCachedTunnels, setTunnelDiscovery, providersChanged, connectionChanges, reconnects } = setup();
		const cached: ICachedTunnel[] = [
			{ ...tunnel, name: 'Old cached name', authProvider: 'github' },
			{ ...tunnel, tunnelId: 'offline', name: 'Cached offline', authProvider: 'github' },
		];
		setCachedTunnels(cached);
		setTunnelDiscovery(async () => [
			{ ...tunnel, name: 'Renamed tunnel' },
			{ ...tunnel, tunnelId: 'new', name: 'New tunnel' },
		]);
		await model.refresh(CancellationToken.None);
		const snapshot = () => model.remotes.get().filter(remote => remote.kind === 'tunnel').map(({ id, name, canRemove }) => ({ id, name, canRemove }));
		const refreshed = snapshot();
		providersChanged.fire({ added: [], removed: [] });
		setCachedTunnels([...cached]);
		assert.deepStrictEqual({ refreshed, afterEvents: snapshot(), cached: getCachedTunnels(), connectionChanges, reconnects }, {
			refreshed: [
				{ id: 'tunnel:offline', name: 'Cached offline', canRemove: false },
				{ id: 'tunnel:new', name: 'New tunnel', canRemove: false },
				{ id: 'tunnel:laptop', name: 'Renamed tunnel', canRemove: true },
			],
			afterEvents: refreshed, cached, connectionChanges: [], reconnects: [],
		});
	});

	test('tunnel availability follows discovery even when a GitHub Environment has the same name', async () => {
		const { model, providers, setCachedTunnels, setTunnelDiscovery, setConfiguration, environmentAvailable, environmentHosts } = setup();
		const reasons = () => Object.fromEntries(model.remotes.get().filter(remote => remote.kind === 'tunnel').map(remote => [remote.id, `${remote.availability}: ${remote.unavailableReason?.split(' ').slice(0, 4).join(' ')}`]));
		setCachedTunnels([{ ...tunnel, tunnelId: 'gone', name: 'Gone', authProvider: 'github' }]);
		setTunnelDiscovery(async () => { throw new Error('network'); });
		await model.refresh(CancellationToken.None);
		const discoveryFailed = reasons();
		setTunnelDiscovery(async () => [
			{ ...tunnel },
			{ ...tunnel, tunnelId: 'idle', name: 'Idle', hostConnectionCount: 0 },
			{ ...tunnel, tunnelId: 'moogle', name: 'Moogle' },
		]);
		await model.refresh(CancellationToken.None);
		const discovered = reasons();
		environmentAvailable.set(true, undefined);
		await setConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentHosts.set([{ id: 'moogle', name: 'moogle', kind: 'user-local', status: 'online' }], undefined);
		const matchingName = reasons()['tunnel:moogle'];
		environmentHosts.set([{ id: 'other', name: 'other', displayName: 'Moogle', kind: 'user-local', status: 'online' }], undefined);
		const matchingDisplayName = reasons()['tunnel:moogle'];
		await model.setConnected('tunnel:moogle', true);
		providers.get('tunnel:laptop')!.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		setTunnelDiscovery(async () => [{ ...tunnel, hostConnectionCount: 0 }]);
		await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({ discoveryFailed, discovered, matchingName, matchingDisplayName, connectedWithoutHost: reasons()['tunnel:laptop'] }, {
			discoveryFailed: { 'tunnel:gone': 'unknown: Couldn\'t check this environment\'s' },
			discovered: {
				'tunnel:gone': 'unknown: This saved Dev Tunnel',
				'tunnel:idle': 'offline: The Dev Tunnel host',
				'tunnel:laptop': 'online: undefined',
				'tunnel:moogle': 'online: undefined',
			},
			matchingName: 'online: undefined',
			matchingDisplayName: 'online: undefined',
			connectedWithoutHost: 'online: undefined',
		});
	});

	test('explicit tunnel rename overrides discovery and clearing it restores the latest discovered name', async () => {
		const { model, setCachedTunnels, setTunnelDiscovery, setRenameInput, renameInputs } = setup();
		setCachedTunnels([{ ...tunnel, name: 'Old cached name' }]);
		setTunnelDiscovery(async () => [{ ...tunnel, name: 'Discovered name' }]);
		await model.refresh(CancellationToken.None);
		setRenameInput('My tunnel');
		await model.rename('tunnel:laptop');
		setTunnelDiscovery(async () => [{ ...tunnel, name: 'Newest discovered name' }]);
		await model.refresh(CancellationToken.None);
		const renamed = model.remotes.get().find(remote => remote.id === 'tunnel:laptop')!.name;
		setRenameInput('');
		await model.rename('tunnel:laptop');
		assert.deepStrictEqual({ renamed, cleared: model.remotes.get().find(remote => remote.id === 'tunnel:laptop')!.name, initialRenameValue: renameInputs[0].value }, {
			renamed: 'My tunnel', cleared: 'Newest discovered name', initialRenameValue: 'Discovered name',
		});
	});

	test('missing or failed tunnel status stays unverified and confirmed offline blocks connection until refresh', async () => {
		const { model, providers, setTunnelDiscovery, connectionChanges } = setup();
		const snapshot = () => model.remotes.get().find(remote => remote.id === 'tunnel:laptop')!.availability;
		setTunnelDiscovery(async () => [{ ...tunnel, hostConnectionCount: undefined }]);
		await model.refresh(CancellationToken.None);
		const missing = snapshot();
		setTunnelDiscovery(async () => [{ ...tunnel, hostConnectionCount: 1 }]);
		await model.refresh(CancellationToken.None);
		const online = snapshot();
		setTunnelDiscovery(async () => { throw new Error('Network unavailable'); });
		await model.refresh(CancellationToken.None);
		const failed = snapshot();
		setTunnelDiscovery(async () => [{ ...tunnel, hostConnectionCount: 0 }]);
		await model.refresh(CancellationToken.None);
		const offline = snapshot();
		providers.get('tunnel:laptop')!.connectionStatus.set(RemoteAgentHostConnectionStatus.connecting, undefined);
		const connecting = snapshot();
		providers.get('tunnel:laptop')!.connectionStatus.set(RemoteAgentHostConnectionStatus.disconnected, undefined);
		await assert.rejects(model.setConnected('tunnel:laptop', true), /offline/);
		const offlineAttempts = connectionChanges.length;
		setTunnelDiscovery(async () => [{ ...tunnel, hostConnectionCount: 1 }]);
		await model.refresh(CancellationToken.None);
		await model.setConnected('tunnel:laptop', true);
		assert.deepStrictEqual({ missing, online, failed, offline, connecting, offlineAttempts, connected: snapshot(), connectionChanges }, {
			missing: 'unknown', online: 'online', failed: 'unknown', offline: 'offline', connecting: 'offline', connected: 'online',
			offlineAttempts: 0,
			connectionChanges: [{ id: 'tunnel:laptop', connected: true }],
		});
	});

	test('connecting a cached tunnel uses fresh discovery metadata when the provider is absent', async () => {
		const { model, providers, setCachedTunnels, setTunnelDiscovery, setTunnelAuthentication, tunnelConnections } = setup();
		providers.delete('tunnel:laptop');
		setCachedTunnels([{ ...tunnel, name: 'Old name', protocolVersion: 5, clusterId: 'old', authProvider: 'microsoft' }]);
		const discovered = { ...tunnel, name: 'New name', tags: ['updated'], clusterId: 'new' };
		setTunnelDiscovery(async () => [discovered]);
		setTunnelAuthentication(async () => 'github');
		await model.refresh(CancellationToken.None);
		await model.setConnected('tunnel:laptop', true);
		assert.deepStrictEqual(tunnelConnections, [{ tunnel: discovered, authProvider: 'github' }]);
	});

	test('missing discovery falls back to live cache updates while failed and canceled discovery retain the snapshot', async () => {
		const { model, setCachedTunnels, setTunnelDiscovery } = setup();
		setCachedTunnels([{ ...tunnel, name: 'Cached name' }]);
		setTunnelDiscovery(async () => [{ ...tunnel, name: 'Discovered name' }]);
		await model.refresh(CancellationToken.None);
		const name = () => model.remotes.get().find(remote => remote.id === 'tunnel:laptop')!.name;
		setTunnelDiscovery(async () => { throw new Error('Discovery failed'); });
		await model.refresh(CancellationToken.None);
		setCachedTunnels([{ ...tunnel, name: 'Updated cache' }]);
		const afterFailure = name();
		const pending = new DeferredPromise<ITunnelInfo[]>();
		setTunnelDiscovery(() => pending.p);
		const cancellation = store.add(new CancellationTokenSource());
		const refresh = model.refresh(cancellation.token);
		cancellation.cancel();
		await pending.complete([]);
		await refresh;
		const afterCancellation = name();
		setTunnelDiscovery(async () => []);
		await model.refresh(CancellationToken.None);
		const fallback = name();
		setCachedTunnels([{ ...tunnel, name: 'Latest cache' }]);
		assert.deepStrictEqual({ afterFailure, afterCancellation, fallback, cacheUpdate: name() }, {
			afterFailure: 'Discovered name', afterCancellation: 'Discovered name', fallback: 'Updated cache', cacheUpdate: 'Latest cache',
		});
	});

	test('copies only pasteable SSH hosts, without connecting or copying display names', async () => {
		const { model, storage, configuration, environmentAvailable, environmentHosts, copiedAddresses, connectionChanges, reconnects, setDisplayName } = setup();
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentAvailable.set(true, undefined);
		environmentHosts.set([{ id: 'desktop', name: 'Friendly desktop', kind: 'user-local', status: 'offline' }], undefined);
		for (const port of [2222, 22]) {
			addSSHRemoteAgentHostEntry(storage, {
				name: `Explicit ${port}`, connection: { type: RemoteAgentHostEntryType.SSH, address: `localhost:${port}`, hostName: `host${port}.example.com`, user: 'user', port },
			});
		}
		await model.refresh(CancellationToken.None);
		setDisplayName('ssh:build', 'Renamed SSH');
		const copyable = model.remotes.get().filter(remote => remote.copyableAddress).map(remote => remote.id);
		for (const id of copyable) {
			await model.copyAddress(id);
		}
		for (const id of ['wsl:Ubuntu', 'tunnel:laptop', 'cloudsandbox:desktop']) {
			await assert.rejects(model.copyAddress(id), /no longer available/);
		}
		assert.deepStrictEqual({ copiedAddresses: [...copiedAddresses].sort(), connectionChanges, reconnects }, {
			copiedAddresses: ['build', 'user@host22.example.com', 'user@host2222.example.com:2222'], connectionChanges: [], reconnects: [],
		});
	});

	for (const id of ['ssh:build', 'tunnel:laptop']) {
		for (const preference of [undefined, 'editor', 'dedicated'] as const) {
			test(`${id} location action saves without connecting a disconnected provider (${preference})`, async () => {
				const { model, locationPromptResult, locationPreferences, connectionChanges } = setup();
				await model.refresh(CancellationToken.None);
				locationPromptResult.result = preference;
				await model.changePreferredAgentLocation(id);
				assert.deepStrictEqual({ preferences: [...locationPreferences], connectionChanges }, {
					preferences: preference ? [[id, preference]] : [],
					connectionChanges: [],
				});
			});
		}
	}

	for (const connected of [false, true]) {
		test(`explicit run behavior saves without connecting an offline environment and reconnects only a connected one (connected=${connected})`, async () => {
			const { model, providers, setTunnelDiscovery, locationPreferences, connectionChanges } = setup();
			setTunnelDiscovery(async () => [{ ...tunnel, hostConnectionCount: 0 }]);
			await model.refresh(CancellationToken.None);
			if (connected) {
				providers.get('tunnel:laptop')!.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
			}
			const result = await model.changePreferredAgentLocation('tunnel:laptop', 'dedicated');
			assert.deepStrictEqual({ result, preferences: [...locationPreferences], connectionChanges }, {
				result: connected ? 'reconnected' : 'saved', preferences: [['tunnel:laptop', 'dedicated']],
				connectionChanges: connected ? [{ id: 'tunnel:laptop', connected: true }] : [],
			});
		});
	}

	for (const sshConfigHost of ['remote', undefined]) {
		test(`SSH location uses a stable ${sshConfigHost ? 'alias' : 'credential'} key, including without a provider`, async () => {
			const { model, storage, providers, providersChanged, createProvider, locationPromptResult, locationPreferences, connectionChanges } = setup();
			const address = 'localhost:4321';
			addSSHRemoteAgentHostEntry(storage, {
				name: 'Forwarded SSH', connection: {
					type: RemoteAgentHostEntryType.SSH, address, sshConfigHost,
					hostName: 'remote.example.com', user: 'user', port: 2222,
				},
			});
			const key = sshConfigHost ? 'ssh:remote' : 'user@remote.example.com:2222';
			providers.set(address, createProvider(address, key));
			providers.get(address)!.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
			providersChanged.fire({ added: [], removed: [] });
			locationPromptResult.result = 'editor';
			await model.changePreferredAgentLocation(address);
			providers.delete(address);
			providersChanged.fire({ added: [], removed: [] });
			locationPromptResult.result = 'dedicated';
			await model.changePreferredAgentLocation(address);
			assert.deepStrictEqual({ preferences: [...locationPreferences], connectionChanges }, {
				preferences: [[key, 'dedicated']], connectionChanges: [{ id: address, connected: true }],
			});
		});
	}

	test('Update Server uses the advertised method and waits before reconnecting', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { model, providers, upgrade, upgrades, connectionChanges } = setup();
		await model.refresh(CancellationToken.None);
		providers.get('tunnel:laptop')!.connectionStatus.set(RemoteAgentHostConnectionStatus.incompatible('Update required', ['1'], ['2'], 'vendor/update'), undefined);
		upgrade.result = { ok: true, upgradeStarted: true, restartDelayMs: 1000 };
		const start = Date.now();
		await model.updateServer('tunnel:laptop');
		assert.deepStrictEqual({ upgrades, connectionChanges, elapsed: Date.now() - start }, {
			upgrades: [{ address: 'tunnel:laptop', method: 'vendor/update' }],
			connectionChanges: [{ id: 'tunnel:laptop', connected: true }], elapsed: 3000,
		});
	}));

	test('Update Server notifies already-current hosts and rejects with failures, for the caller to show', async () => {
		const { model, providers, upgrade, upgrades, notifications, connectionChanges } = setup();
		await model.refresh(CancellationToken.None);
		providers.get('tunnel:laptop')!.connectionStatus.set(RemoteAgentHostConnectionStatus.incompatible('Update required', ['1'], undefined, 'vendor/update'), undefined);
		await model.updateServer('tunnel:laptop');
		upgrade.result = { ok: false, error: 'Download failed' };
		const notStarted = await model.updateServer('tunnel:laptop').then(() => 'updated', (error: Error) => error.message);
		upgrade.failure = new Error('Connection lost');
		const failed = await model.updateServer('tunnel:laptop').then(() => 'updated', (error: Error) => error.message);
		assert.deepStrictEqual({ calls: upgrades.length, messages: notifications.map(notification => notification.message), notStarted, failed, connectionChanges }, {
			calls: 3, messages: ['Laptop is already on the latest version.'],
			notStarted: 'Failed to update Laptop: Download failed', failed: 'Failed to update Laptop: Connection lost', connectionChanges: [],
		});
	});

	test('Update Server rejects unsupported, stale, removed, disabled and disposed targets', async () => {
		const { model, providers, setConfiguration, upgrades } = setup();
		await model.refresh(CancellationToken.None);
		const provider = providers.get('tunnel:laptop')!;
		for (const status of [RemoteAgentHostConnectionStatus.disconnected, RemoteAgentHostConnectionStatus.incompatible('Too old', ['1'])]) {
			provider.connectionStatus.set(status, undefined);
			await assert.rejects(model.updateServer('tunnel:laptop'), /does not support updating/);
		}
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.incompatible('Too old', ['1'], undefined, 'vendor/update'), undefined);
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		await assert.rejects(model.updateServer('tunnel:laptop'), /does not support updating/);
		await assert.rejects(model.updateServer('missing'), /no longer available/);
		providers.delete('tunnel:laptop');
		await assert.rejects(model.updateServer('tunnel:laptop'), /no longer available/);
		providers.set('tunnel:laptop', provider);
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.incompatible('Too old', ['1'], undefined, 'vendor/update'), undefined);
		await setConfiguration(RemoteAgentHostsEnabledSettingId, false);
		await assert.rejects(model.updateServer('tunnel:laptop'), /no longer available/);
		await setConfiguration(RemoteAgentHostsEnabledSettingId, true);
		model.dispose();
		await assert.rejects(model.updateServer('tunnel:laptop'), /no longer available/);
		assert.deepStrictEqual(upgrades, []);
	});

	test('connected hosts offer Update Server only while they run an older build, and ask before updating', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { model, providers, upgrade, upgrades, confirmations, connectionChanges, environmentState, setInitializeResultMeta } = setup();
		await model.refresh(CancellationToken.None);
		providers.get('tunnel:laptop')!.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		await assert.rejects(model.updateServer('tunnel:laptop'), /does not support updating/);
		const canUpdate = (meta: Record<string, unknown> | undefined) => {
			setInitializeResultMeta('tunnel:laptop', meta);
			return model.remotes.get().find(remote => remote.id === 'tunnel:laptop')!.canUpdateServer ?? false;
		};
		const method = { 'vscode.upgradeMethod': 'vendor/update' };
		const olderBuild = { commit: 'host-commit', quality: 'insider', date: '2026-11-19T00:00:00.000Z' };
		const offered = {
			absent: canUpdate(undefined),
			methodWithoutBuild: canUpdate(method),
			buildWithoutMethod: canUpdate({ 'vscode.build': olderBuild }),
			malformedMethod: canUpdate({ 'vscode.upgradeMethod': 42, 'vscode.build': olderBuild }),
			malformedBuild: canUpdate({ ...method, 'vscode.build': { ...olderBuild, date: 'yesterday' } }),
			sameBuild: canUpdate({ ...method, 'vscode.build': { ...olderBuild, commit: 'client-commit' } }),
			newerBuild: canUpdate({ ...method, 'vscode.build': { ...olderBuild, date: '2026-11-21T00:00:00.000Z' } }),
			otherQuality: canUpdate({ ...method, 'vscode.build': { ...olderBuild, quality: 'stable' } }),
			olderBuild: canUpdate({ ...method, 'vscode.build': olderBuild }),
		};
		const declined = new DeferredPromise<IConfirmationResult>();
		void declined.complete({ confirmed: false });
		environmentState.pendingConfirmation = declined;
		await assert.rejects(model.updateServer('tunnel:laptop'), isCancellationError);
		const afterDecline = [...upgrades];
		environmentState.pendingConfirmation = undefined;
		upgrade.result = { ok: true, upgradeStarted: true, restartDelayMs: 1000 };
		const start = Date.now();
		await model.updateServer('tunnel:laptop');
		assert.deepStrictEqual({
			offered, afterDecline, upgrades, connectionChanges, elapsed: Date.now() - start,
			confirmations: confirmations.map(({ message, primaryButton }) => ({ message, primaryButton })),
		}, {
			offered: {
				absent: false, methodWithoutBuild: false, buildWithoutMethod: false, malformedMethod: false, malformedBuild: false,
				sameBuild: false, newerBuild: false, otherQuality: false, olderBuild: true,
			},
			afterDecline: [],
			upgrades: [{ address: 'tunnel:laptop', method: 'vendor/update' }],
			// The connection stayed up through the restart delay, so the update reconnects explicitly.
			connectionChanges: [{ id: 'tunnel:laptop', connected: true }], elapsed: 3000,
			confirmations: Array(2).fill({ message: 'Update the server on \'Laptop\'?', primaryButton: '&&Update Server' }),
		});
	}));

	test('updating a connected server leaves reconnecting to a connection that drops during the restart', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { model, providers, upgrade, connectionChanges, setInitializeResultMeta } = setup();
		await model.refresh(CancellationToken.None);
		const provider = providers.get('tunnel:laptop')!;
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		setInitializeResultMeta('tunnel:laptop', { 'vscode.upgradeMethod': '_vscodeUpgrade', 'vscode.build': { commit: 'host-commit', quality: 'insider', date: '2026-11-19T00:00:00.000Z' } });
		upgrade.result = { ok: true, upgradeStarted: true, restartDelayMs: 1000 };
		setTimeout(() => provider.connectionStatus.set(RemoteAgentHostConnectionStatus.reconnecting, undefined), 1500);
		const start = Date.now();
		await model.updateServer('tunnel:laptop');
		assert.deepStrictEqual({ connectionChanges, elapsed: Date.now() - start }, { connectionChanges: [], elapsed: 2000 });
	}));

	test('Connect asks to update a server that requires it and connects through the update', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { model, providers, upgrade, upgrades, confirmations, connectionChanges, environmentState } = setup();
		await model.refresh(CancellationToken.None);
		providers.get('tunnel:laptop')!.connectionStatus.set(RemoteAgentHostConnectionStatus.incompatible('Unsupported protocol version', ['1'], ['2'], 'vendor/update'), undefined);
		const declined = new DeferredPromise<IConfirmationResult>();
		void declined.complete({ confirmed: false });
		environmentState.pendingConfirmation = declined;
		await assert.rejects(model.setConnected('tunnel:laptop', true), /Canceled/);
		const afterDecline = { upgrades: [...upgrades], connectionChanges: [...connectionChanges] };
		environmentState.pendingConfirmation = undefined;
		upgrade.result = { ok: true, upgradeStarted: true, restartDelayMs: 1000 };
		await model.setConnected('tunnel:laptop', true);
		assert.deepStrictEqual({
			afterDecline, upgrades, connectionChanges,
			confirmations: confirmations.map(({ message, detail, primaryButton }) => ({ message, detail, primaryButton })),
		}, {
			afterDecline: { upgrades: [], connectionChanges: [] },
			upgrades: [{ address: 'tunnel:laptop', method: 'vendor/update' }],
			connectionChanges: [{ id: 'tunnel:laptop', connected: true }],
			confirmations: Array(2).fill({
				message: 'Update the server on \'Laptop\' to connect?',
				detail: 'Unsupported protocol version\n\nUpdating restarts the server and then connects to it.',
				primaryButton: '&&Update and Connect',
			}),
		});
	}));

	test('tunnel location saves without a provider and reports reconnect failures', async () => {
		const { model, providers, locationPromptResult, locationPreferences, notifications, failConnection } = setup();
		await model.refresh(CancellationToken.None);
		locationPromptResult.result = 'editor';
		providers.get('tunnel:laptop')!.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		failConnection(new Error('Connection refused'));
		await model.changePreferredAgentLocation('tunnel:laptop');
		providers.delete('tunnel:laptop');
		await model.changePreferredAgentLocation('tunnel:laptop');
		assert.deepStrictEqual({ preferences: [...locationPreferences], messages: notifications.map(notification => notification.message) }, {
			preferences: [['tunnel:laptop', 'editor']],
			messages: ['Preference saved for Laptop, but reconnection failed: Connection refused', 'Preference saved for Laptop, but no active connection was found. This takes effect the next time it connects.'],
		});
	});

	test('new management actions reject absent, disabled and unsupported targets', async () => {
		const { model, setConfiguration, copiedAddresses, locationPreferences } = setup();
		await model.refresh(CancellationToken.None);
		await assert.rejects(model.changePreferredAgentLocation('wsl:Ubuntu'), /only be changed for SSH hosts and tunnels/);
		await assert.rejects(model.copyAddress('missing'), /no longer available/);
		await assert.rejects(model.changePreferredAgentLocation('missing'), /no longer available/);
		await setConfiguration(RemoteAgentHostsEnabledSettingId, false);
		await assert.rejects(model.copyAddress('ssh:build'), /no longer available/);
		await assert.rejects(model.changePreferredAgentLocation('tunnel:laptop'), /no longer available/);
		assert.deepStrictEqual({ copiedAddresses, preferences: [...locationPreferences] }, { copiedAddresses: [], preferences: [] });
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

	test('SSH hosts stay connectable without a status check', async () => {
		const { model, storage } = setup();
		addSSHRemoteAgentHostEntry(storage, savedSSHHost);
		const availability = () => ['ssh:removed', 'ssh:build'].map(id => model.remotes.get().find(remote => remote.id === id)?.availability);
		const initial = availability();
		await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({ initial, refreshed: availability() }, { initial: ['unknown', undefined], refreshed: ['unknown', 'unknown'] });
	});

	test('last seen online changes only after a fresh positive check, not cached availability or a failed recheck', () => runWithFakedTimers({ useFakeTimers: true }, async () => {
		const { model, setTunnelDiscovery, setConfiguration } = setup();
		await model.refresh(CancellationToken.None);
		const onlineAt = () => model.remotes.get().find(remote => remote.id === 'tunnel:laptop')?.metadata?.lastOnlineAt;
		const first = Date.now();
		const observations = [onlineAt()];
		await timeout(60001);
		await setConfiguration(RemoteAgentHostsEnabledSettingId, true);
		observations.push(onlineAt());
		const discovery = new DeferredPromise<ITunnelInfo[]>();
		setTunnelDiscovery(() => discovery.p);
		const refresh = model.refresh(CancellationToken.None);
		await timeout(0);
		observations.push(onlineAt());
		await discovery.complete([{ ...tunnel, hostConnectionCount: 0 }]);
		await refresh;
		observations.push(onlineAt());
		await timeout(60001);
		setTunnelDiscovery(async () => [tunnel]);
		await model.refresh(CancellationToken.None);
		observations.push(onlineAt());
		assert.deepStrictEqual(observations, [first, first, first, first, Date.now()]);
	}));

	(isWindows ? test : test.skip)('failed WSL checks cannot reuse an old offline result', async () => {
		const { model, setWSLDistros, wslState, wslConnectionsChanged } = setup();
		setWSLDistros([]);
		await model.refresh(CancellationToken.None);
		const snapshot = () => model.remotes.get().find(remote => remote.id === 'wsl:Ubuntu')!.availability;
		const missing = snapshot();
		wslState.discoveryFailure = new Error('WSL unavailable');
		await model.refresh(CancellationToken.None);
		const discoveryFailed = snapshot();
		wslState.discoveryFailure = undefined;
		setWSLDistros([{ name: 'Ubuntu', isDefault: true, isRunning: false, version: 2 }]);
		await model.refresh(CancellationToken.None);
		wslState.runningFailure = new Error('Running distributions unavailable');
		wslConnectionsChanged.fire();
		await timeout(0);
		assert.deepStrictEqual({ missing, discoveryFailed, runningFailed: snapshot() }, {
			missing: 'offline', discoveryFailed: 'unknown', runningFailed: 'unknown',
		});
	});

	test('SSH Delete is offered only for saved hosts absent from successfully read configuration', async () => {
		const { model, storage, setSSHDiscovery } = setup();
		addSSHRemoteAgentHostEntry(storage, savedSSHHost);
		const deletable = () => model.remotes.get().find(remote => remote.id === 'ssh:removed')?.canDelete;
		const unknown = deletable();
		await model.refresh(CancellationToken.None);
		const absent = deletable();
		const discoveryOnly = model.remotes.get().find(remote => remote.id === 'ssh:build')?.canDelete;
		setSSHDiscovery(async () => ['removed']);
		await model.refresh(CancellationToken.None);
		const configured = deletable();
		setSSHDiscovery(async () => { throw new Error('Cannot read SSH config'); });
		await model.refresh(CancellationToken.None);
		const failed = deletable();
		setSSHDiscovery(async () => []);
		await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({ unknown, absent, discoveryOnly, configured, failed, recovered: deletable() }, {
			unknown: false, absent: true, discoveryOnly: false, configured: false, failed: false, recovered: true,
		});
	});

	for (const confirmed of [true, false]) {
		test(`SSH Delete ${confirmed ? 'forgets and disconnects' : 'preserves'} an orphaned saved host after confirmation without a provider`, async () => {
			const { model, storage, environmentState, confirmations, sshDisconnects, removedConnections, connectionChanges } = setup();
			addSSHRemoteAgentHostEntry(storage, savedSSHHost);
			await model.refresh(CancellationToken.None);
			environmentState.pendingConfirmation = new DeferredPromise<IConfirmationResult>();
			const deletion = model.deleteSSHHost('ssh:removed');
			await timeout(0);
			const pending = { cached: readSSHRemoteAgentHostEntries(storage).length, disconnects: [...sshDisconnects], confirmations: [...confirmations] };
			await environmentState.pendingConfirmation.complete({ confirmed });
			await deletion;
			await model.refresh(CancellationToken.None);
			assert.deepStrictEqual({
				pending, cached: readSSHRemoteAgentHostEntries(storage), sshDisconnects, removedConnections, connectionChanges,
				present: model.remotes.get().some(remote => remote.id === 'ssh:removed'),
			}, {
				pending: {
					cached: 1, disconnects: [], confirmations: [{
						type: 'warning',
						message: 'Forget saved SSH connection \'Saved host\'?',
						detail: 'This forgets the saved connection and disconnects this client. Your SSH configuration, the remote computer, and its files are kept.',
						primaryButton: '&&Forget',
					}],
				},
				cached: confirmed ? [] : [savedSSHHost],
				sshDisconnects: confirmed ? ['ssh:removed'] : [],
				removedConnections: confirmed ? ['ssh:removed'] : [],
				connectionChanges: [], present: !confirmed,
			});
		});
	}

	test('SSH Delete removes forwarded saved addresses using their stable SSH connection key', async () => {
		const { model, storage, sshDisconnects, removedConnections } = setup();
		addSSHRemoteAgentHostEntry(storage, {
			name: 'Forwarded host',
			connection: { type: RemoteAgentHostEntryType.SSH, address: 'localhost:4321', hostName: 'removed.example', user: 'alice', port: 2222 },
		});
		await model.refresh(CancellationToken.None);
		await model.deleteSSHHost('localhost:4321');
		assert.deepStrictEqual({ cached: readSSHRemoteAgentHostEntries(storage), sshDisconnects, removedConnections }, {
			cached: [], sshDisconnects: ['alice@removed.example:2222'], removedConnections: ['localhost:4321'],
		});
	});

	test('SSH Delete rejects configured hosts and unreadable config before confirmation', async () => {
		const { model, storage, setSSHDiscovery, confirmations, sshDisconnects } = setup();
		addSSHRemoteAgentHostEntry(storage, savedSSHHost);
		setSSHDiscovery(async () => ['removed']);
		await model.refresh(CancellationToken.None);
		await assert.rejects(model.deleteSSHHost('ssh:removed'), /still in your SSH configuration/);
		setSSHDiscovery(async () => { throw new Error('Cannot read SSH config'); });
		await assert.rejects(model.deleteSSHHost('ssh:removed'), /Cannot read SSH config/);
		assert.deepStrictEqual({ confirmations, sshDisconnects, cached: readSSHRemoteAgentHostEntries(storage) }, {
			confirmations: [], sshDisconnects: [], cached: [savedSSHHost],
		});
	});

	for (const change of ['configured', 'removed', 'disabled', 'disposed', 'config-error'] as const) {
		test(`SSH Delete revalidates ${change} during confirmation`, async () => {
			const { model, storage, setSSHDiscovery, setConfiguration, environmentState, sshDisconnects, removedConnections } = setup();
			addSSHRemoteAgentHostEntry(storage, savedSSHHost);
			await model.refresh(CancellationToken.None);
			environmentState.pendingConfirmation = new DeferredPromise<IConfirmationResult>();
			const deletion = model.deleteSSHHost('ssh:removed');
			const rejected = assert.rejects(deletion);
			await timeout(0);
			switch (change) {
				case 'configured':
					setSSHDiscovery(async () => ['removed']);
					break;
				case 'removed':
					removeSSHRemoteAgentHostEntry(storage, 'ssh:removed');
					break;
				case 'disabled':
					await setConfiguration(RemoteAgentHostsEnabledSettingId, false);
					break;
				case 'disposed':
					model.dispose();
					break;
				case 'config-error':
					setSSHDiscovery(async () => { throw new Error('Cannot read SSH config'); });
					break;
			}
			await environmentState.pendingConfirmation.complete({ confirmed: true });
			await rejected;
			assert.deepStrictEqual({ sshDisconnects, removedConnections, cached: readSSHRemoteAgentHostEntries(storage) }, {
				sshDisconnects: [], removedConnections: [], cached: change === 'removed' ? [] : [savedSSHHost],
			});
		});
	}

	test('SSH deletion invalidates discovery that started before the saved entry was deleted', async () => {
		const { model, storage, setSSHDiscovery } = setup();
		addSSHRemoteAgentHostEntry(storage, savedSSHHost);
		await model.refresh(CancellationToken.None);
		const oldDiscovery = new DeferredPromise<string[]>();
		setSSHDiscovery(() => oldDiscovery.p);
		const refresh = model.refresh(CancellationToken.None);
		setSSHDiscovery(async () => []);
		await model.deleteSSHHost('ssh:removed');
		await oldDiscovery.complete(['removed']);
		await refresh;
		assert.deepStrictEqual({
			cached: readSSHRemoteAgentHostEntries(storage),
			present: model.remotes.get().some(remote => remote.id === 'ssh:removed'),
		}, { cached: [], present: false });
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

	for (const olderFails of [false, true]) {
		test(`newer discovery survives an older ${olderFails ? 'authentication failure' : 'offline result'} arriving last`, async () => {
			const { model, setTunnelDiscovery, logEntries } = setup();
			const older = new DeferredPromise<ITunnelInfo[]>();
			const started = new DeferredPromise<void>();
			setTunnelDiscovery(() => {
				started.complete();
				return older.p;
			});
			const refreshing = model.refresh(CancellationToken.None);
			await started.p;
			setTunnelDiscovery(async () => [tunnel]);
			await model.refresh(CancellationToken.None);
			if (olderFails) {
				await older.error(new TunnelAuthenticationRequiredError('github'));
			} else {
				await older.complete([{ ...tunnel, hostConnectionCount: 0 }]);
			}
			const olderFailures = await refreshing;
			assert.deepStrictEqual({
				availability: model.remotes.get().find(remote => remote.id === 'tunnel:laptop')?.availability,
				authenticationRequired: model.tunnelAuthenticationRequired.get(),
				olderFailures, logEntries,
			}, { availability: 'online', authenticationRequired: undefined, olderFailures: [], logEntries: [] });
		});
	}

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
		// Extension remotes are registered and Dev Containers are created in this client rather than discovered.
		const discoveredKinds = remoteKinds.filter(kind => kind !== 'extension' && kind !== 'devContainer').sort();
		assert.deepStrictEqual({
			partial, failures, remaining: [...refreshing],
			started: updates.filter(update => update.refreshing).map(update => update.kind).sort(),
			finished: updates.filter(update => !update.refreshing).map(update => update.kind).sort(),
		}, { partial: { ssh: false, tunnel: true }, failures: ['tunnel'], remaining: [], started: discoveredKinds, finished: discoveredKinds });
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
		const { model, configuration, setSSHDiscovery } = setup();
		setSSHDiscovery(async () => { calls++; return []; });
		await configuration.setUserConfiguration('chat.disableAIFeatures', true);
		await model.refresh(CancellationToken.None);
		await assert.rejects(model.remove('wsl:Ubuntu'), /no longer available/);
		await assert.rejects(model.rename('wsl:Ubuntu'), /no longer available/);
		assert.strictEqual(calls, 0);
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

	(isWindows ? test : test.skip)('WSL rows are available only while the distribution is running', async () => {
		const { model, setWSLDistros } = setup();
		const snapshot = async (running: boolean | undefined) => {
			setWSLDistros(running === undefined ? [] : [{ name: 'Ubuntu', isDefault: true, isRunning: running, version: 2 }]);
			await model.refresh(CancellationToken.None);
			const remote = model.remotes.get().find(remote => remote.id === 'wsl:Ubuntu');
			return { availability: remote?.availability, startsOnConnect: remote?.startsOnConnect ?? false };
		};
		assert.deepStrictEqual({
			running: await snapshot(true),
			stopped: await snapshot(false),
			uninstalled: await snapshot(undefined),
		}, {
			running: { availability: 'online', startsOnConnect: false },
			stopped: { availability: 'offline', startsOnConnect: true },
			uninstalled: { availability: 'offline', startsOnConnect: false },
		});
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

	test('connection failures before transport registration stay on the row until a successful connection', async () => {
		const { model, failConnection } = setup();
		await model.refresh(CancellationToken.None);
		failConnection(new Error('All configured authentication methods failed'));
		await assert.rejects(model.setConnected('ssh:build', true), /authentication methods failed/);
		const failure = model.remotes.get().find(remote => remote.id === 'ssh:build')!.lastConnectionError;
		await model.refresh(CancellationToken.None);
		const afterRefresh = model.remotes.get().find(remote => remote.id === 'ssh:build')!.lastConnectionError;
		failConnection(undefined);
		await model.setConnected('ssh:build', true);
		assert.deepStrictEqual({ failure, afterRefresh, afterSuccess: model.remotes.get().find(remote => remote.id === 'ssh:build')!.lastConnectionError }, {
			failure: 'All configured authentication methods failed', afterRefresh: 'All configured authentication methods failed', afterSuccess: undefined,
		});
	});

	test('a provider hook returning early cannot report success before connection readiness', async () => {
		const { model, providers, failConnection } = setup();
		await model.refresh(CancellationToken.None);
		providers.get('ssh:build')!.connect = async () => { };
		failConnection(new Error('Agent host handshake failed'));
		await assert.rejects(model.setConnected('ssh:build', true), /handshake failed/);
		assert.deepStrictEqual(model.remotes.get().find(remote => remote.id === 'ssh:build')?.lastConnectionError, 'Agent host handshake failed');
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

	test('offline environment visibility remains editable and account-scoped without bypassing availability', async () => {
		const { model, configuration, providers, environmentAvailable, environmentHosts, environmentState, environmentConnections, addEnvironmentProvider } = setup();
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentAvailable.set(true, undefined);
		const host = { id: 'desktop', name: 'Desktop', kind: 'user-local', status: 'online' } as const;
		environmentHosts.set([host], undefined);
		const provider = addEnvironmentProvider(host.id);
		await model.refresh(CancellationToken.None);
		const id = cloudSandboxAddress('desktop');
		const snapshot = () => {
			const remote = model.remotes.get().find(remote => remote.id === id)!;
			return {
				hidden: remote.hidden, reason: remote.pickerUnavailableReason,
				inPicker: getSessionCreationEnvironments([...providers.values()]).some(environment => environment.providerIds.includes(provider.id)),
			};
		};
		model.setHidden(id, true);
		const hosts = [{ ...host, status: 'offline' }] as const;
		environmentHosts.set(hosts, undefined);
		provider.isAvailableInEnvironmentPicker.set(false, undefined);
		const hiddenOffline = snapshot();
		model.setHidden(id, false);
		const shownOffline = snapshot();
		model.setHidden(id, true);
		environmentState.account = 'account-two';
		environmentHosts.set([...hosts], undefined);
		const otherAccount = model.remotes.get().find(remote => remote.id === id)?.hidden;
		environmentState.account = 'account-one';
		environmentHosts.set([...hosts], undefined);
		const restored = model.remotes.get().find(remote => remote.id === id)?.hidden;
		await assert.rejects(model.setConnected(id, true), /offline/);
		environmentHosts.set([host], undefined);
		provider.isAvailableInEnvironmentPicker.set(true, undefined);
		provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
		const hiddenOnline = snapshot();
		model.setHidden(id, false);
		const shownOnline = snapshot();
		environmentHosts.set(hosts, undefined);
		provider.isAvailableInEnvironmentPicker.set(false, undefined);
		const offlineAgain = snapshot();
		environmentHosts.set([host], undefined);
		provider.isAvailableInEnvironmentPicker.set(true, undefined);
		assert.deepStrictEqual({ hiddenOffline, shownOffline, otherAccount, restored, hiddenOnline, shownOnline, offlineAgain, onlineAgain: snapshot(), environmentConnections }, {
			hiddenOffline: { hidden: true, reason: undefined, inPicker: false },
			shownOffline: { hidden: false, reason: undefined, inPicker: false },
			otherAccount: false, restored: true,
			hiddenOnline: { hidden: true, reason: undefined, inPicker: false },
			shownOnline: { hidden: false, reason: undefined, inPicker: true },
			offlineAgain: { hidden: false, reason: undefined, inPicker: false },
			onlineAgain: { hidden: false, reason: undefined, inPicker: true },
			environmentConnections: [],
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
			model.setHidden(id, true);
			const hiddenBeforeRegistration = snapshot();
			providers.set(id, provider);
			providersChanged.fire({ added: [], removed: [] });
			const registeredHidden = snapshot();
			model.setHidden(id, false);
			const registered = snapshot();
			model.setHidden(id, true);
			const hiddenDisconnected = snapshot();
			provider.connectionStatus.set(RemoteAgentHostConnectionStatus.connected, undefined);
			const hiddenConnected = snapshot();
			model.setHidden(id, false);
			const connected = snapshot();
			model.setHidden(id, true);
			const hidden = snapshot();
			provider.isAvailableInEnvironmentPicker.set(false, undefined);
			const unavailable = snapshot();
			model.setHidden(id, false);
			const shownUnavailable = snapshot();
			provider.isAvailableInEnvironmentPicker.set(true, undefined);
			const availableAgain = snapshot();
			provider.connectionStatus.set(RemoteAgentHostConnectionStatus.disconnected, undefined);
			const disconnected = snapshot();
			provider.connectionStatus.set(RemoteAgentHostConnectionStatus.incompatible('Update required', ['1']), undefined);
			const incompatible = snapshot();
			model.setHidden(id, true);
			const hiddenIncompatible = snapshot();
			model.setHidden(id, false);
			providers.delete(id);
			providersChanged.fire({ added: [], removed: [] });
			assert.deepStrictEqual({
				discovered, hiddenBeforeRegistration, registeredHidden, registered, hiddenDisconnected, hiddenConnected, connected, hidden, unavailable, shownUnavailable, availableAgain, disconnected, incompatible, hiddenIncompatible, withdrawn: snapshot(), connectionChanges, reconnects, removals,
			}, {
				discovered: { hidden: false, reason: undefined, inPicker: false },
				hiddenBeforeRegistration: { hidden: true, reason: undefined, inPicker: false },
				registeredHidden: { hidden: true, reason: undefined, inPicker: false },
				registered: { hidden: false, reason: undefined, inPicker: true },
				hiddenDisconnected: { hidden: true, reason: undefined, inPicker: false },
				hiddenConnected: { hidden: true, reason: undefined, inPicker: false },
				connected: { hidden: false, reason: undefined, inPicker: true },
				hidden: { hidden: true, reason: undefined, inPicker: false },
				unavailable: { hidden: true, reason: undefined, inPicker: false },
				shownUnavailable: { hidden: false, reason: undefined, inPicker: false },
				availableAgain: { hidden: false, reason: undefined, inPicker: true },
				disconnected: { hidden: false, reason: undefined, inPicker: true },
				incompatible: { hidden: false, reason: undefined, inPicker: true },
				hiddenIncompatible: { hidden: true, reason: undefined, inPicker: false },
				withdrawn: { hidden: false, reason: undefined, inPicker: false },
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
		assert.throws(() => model.setHidden('ssh:build', false), /can't appear as a separate entry/);
		provider.supportsWorkspaceSelection = true;
		provider.hostGroup = { id: 'group', label: 'Group' };
		providersChanged.fire({ added: [], removed: [] });
		assert.deepStrictEqual({
			unsupported, grouped: model.remotes.get().find(remote => remote.id === 'ssh:build')?.pickerUnavailableReason,
			inPicker: getSessionCreationEnvironments([...providers.values()]).some(environment => environment.providerIds.includes(provider.id)),
		}, {
			unsupported: 'This remote can\'t appear as a separate entry in the environment picker.',
			grouped: 'This remote can\'t appear as a separate entry in the environment picker.', inPicker: false,
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
		const environmentRows = () => model.remotes.get().filter(remote => remote.kind === 'environment').map(remote => ({
			id: remote.id, name: remote.name, availability: remote.availability, unavailable: !!remote.unavailableReason, canRemove: remote.canRemove,
		}));
		// Hosts restored before discovery keep a stale status, so they aren't reported as online or offline.
		const restored = environmentRows().map(row => row.availability);
		await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({ restored, verified: environmentRows() }, {
			restored: ['pending', 'pending'],
			verified: [
				{ id: cloudSandboxAddress('online'), name: 'A desktop', availability: 'online', unavailable: false, canRemove: true },
				{ id: cloudSandboxAddress('offline'), name: 'B desktop', availability: 'offline', unavailable: true, canRemove: true },
			],
		});
		await assert.rejects(model.setConnected(cloudSandboxAddress('offline'), true), /offline/);
		await assert.rejects(model.remove(cloudSandboxAddress('sandbox')), /no longer available/);
		await model.remove(cloudSandboxAddress('online'));
		await model.remove(cloudSandboxAddress('offline'));
		assert.deepStrictEqual({
			environmentDeletions, removals, remaining: model.remotes.get().filter(remote => remote.kind === 'environment'),
		}, { environmentDeletions: ['online', 'offline'], removals: [], remaining: [] });
	});

	for (const confirmed of [true, false]) {
		test(`tunnel deletion ${confirmed ? 'deletes the service-side registration' : 'cancels without deleting'} after confirmation`, async () => {
			const { model, setTunnelDiscovery, setDisplayName, environmentState, confirmations, deletedTunnels, removals, connectionChanges } = setup();
			const offline = { ...tunnel, hostConnectionCount: 0 };
			setTunnelDiscovery(async () => [offline, { ...tunnel, tunnelId: 'other' }]);
			await model.refresh(CancellationToken.None);
			setDisplayName('tunnel:laptop', 'My test tunnel');
			environmentState.pendingConfirmation = new DeferredPromise<IConfirmationResult>();
			const deletion = model.deleteTunnel('tunnel:laptop');
			const before = { confirmations: [...confirmations], deletedTunnels: [...deletedTunnels] };
			await environmentState.pendingConfirmation.complete({ confirmed });
			await deletion;
			assert.deepStrictEqual({
				before, deletedTunnels, removals, connectionChanges,
				remaining: model.remotes.get().filter(remote => remote.kind === 'tunnel').map(remote => remote.id).sort(),
			}, {
				before: {
					confirmations: [{
						type: 'warning',
						message: 'Delete Dev Tunnel \'My test tunnel\'?',
						detail: 'This removes the tunnel registration and disconnects all its clients. The remote computer and its files stay available. The tunnel returns when sharing restarts on that computer.',
						primaryButton: '&&Delete',
					}],
					deletedTunnels: [],
				},
				deletedTunnels: confirmed ? [{ tunnel: offline, authProvider: 'github' }] : [],
				removals: [], connectionChanges: [],
				remaining: confirmed ? ['tunnel:other'] : ['tunnel:laptop', 'tunnel:other'],
			});
		});
	}

	test('failed tunnel deletion keeps the row and cache and can be retried', async () => {
		const { model, setCachedTunnels, getCachedTunnels, tunnelState, deletedTunnels } = setup();
		setCachedTunnels([{ ...tunnel, authProvider: 'github' }]);
		await model.refresh(CancellationToken.None);
		tunnelState.failure = new Error('Forbidden');
		await assert.rejects(model.deleteTunnel('tunnel:laptop'), /Forbidden/);
		const retained = { row: model.remotes.get().some(remote => remote.id === 'tunnel:laptop'), cached: getCachedTunnels().length };
		tunnelState.failure = undefined;
		await model.deleteTunnel('tunnel:laptop');
		assert.deepStrictEqual({ retained, calls: deletedTunnels.length, row: model.remotes.get().some(remote => remote.id === 'tunnel:laptop'), cached: getCachedTunnels() }, {
			retained: { row: true, cached: 1 }, calls: 2, row: false, cached: [],
		});
	});

	test('tunnel deletion rejects unsupported targets and protects the currently hosted tunnel by ID', async () => {
		const { model, setTunnelStatus, tunnelState, deletedTunnels, confirmations, providersChanged } = setup();
		await model.refresh(CancellationToken.None);
		await assert.rejects(model.deleteTunnel('ssh:build'), /no longer available/);
		await assert.rejects(model.deleteTunnel('missing'), /no longer available/);
		tunnelState.canDelete = false;
		providersChanged.fire({ added: [], removed: [] });
		const unsupported = model.remotes.get().find(remote => remote.id === 'tunnel:laptop')!.canDelete;
		await assert.rejects(model.deleteTunnel('tunnel:laptop'), /not supported/);
		tunnelState.canDelete = true;
		setTunnelStatus({ type: 'connected', info: { tunnelId: 'laptop', tunnelName: 'Different display name', isAttached: false }, serviceInstallFailed: false });
		const hosted = model.remotes.get().find(remote => remote.id === 'tunnel:laptop')!.canDelete;
		await assert.rejects(model.deleteTunnel('tunnel:laptop'), /sharing this dev tunnel/);
		setTunnelStatus({ type: 'disconnected' });
		assert.deepStrictEqual({ unsupported, hosted, stopped: model.remotes.get().find(remote => remote.id === 'tunnel:laptop')!.canDelete, deletedTunnels, confirmations }, {
			unsupported: false, hosted: false, stopped: true, deletedTunnels: [], confirmations: [],
		});
	});

	test('initial hosted tunnel status cannot overwrite a newer event', async () => {
		const initialStatus = new DeferredPromise<TunnelStatus>();
		const { model, setTunnelStatus } = setup([], initialStatus.p);
		await model.refresh(CancellationToken.None);
		const loading = model.remotes.get().find(remote => remote.id === 'tunnel:laptop')!.canDelete;
		await assert.rejects(model.deleteTunnel('tunnel:laptop'), /hosting status is not available/);
		setTunnelStatus({ type: 'connected', info: { tunnelId: 'laptop', tunnelName: 'Laptop', isAttached: false }, serviceInstallFailed: false });
		await initialStatus.complete({ type: 'disconnected' });
		assert.deepStrictEqual({ loading, hosted: model.remotes.get().find(remote => remote.id === 'tunnel:laptop')!.canDelete }, {
			loading: false, hosted: false,
		});
	});

	for (const change of ['inventory', 'configuration', 'AI', 'disposal', 'hosting', 'capability', 'authentication', 'cluster'] as const) {
		test(`tunnel deletion revalidates ${change} after confirmation`, async () => {
			const { model, setConfiguration, setTunnelDiscovery, setTunnelAuthentication, setTunnelStatus, tunnelState, environmentState, deletedTunnels } = setup();
			await model.refresh(CancellationToken.None);
			environmentState.pendingConfirmation = new DeferredPromise<IConfirmationResult>();
			const deletion = model.deleteTunnel('tunnel:laptop');
			const rejected = assert.rejects(deletion, change === 'hosting' ? /sharing this dev tunnel/ : change === 'capability' ? /not supported/ : isCancellationError);
			switch (change) {
				case 'inventory':
					setTunnelDiscovery(async () => []);
					await model.refresh(CancellationToken.None);
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
				case 'hosting':
					setTunnelStatus({ type: 'connected', info: { tunnelId: 'laptop', tunnelName: 'Laptop', isAttached: false }, serviceInstallFailed: false });
					break;
				case 'capability':
					tunnelState.canDelete = false;
					break;
				case 'authentication':
					setTunnelAuthentication(async () => 'microsoft');
					await model.refresh(CancellationToken.None);
					break;
				case 'cluster':
					setTunnelDiscovery(async () => [{ ...tunnel, clusterId: 'other' }]);
					await model.refresh(CancellationToken.None);
					break;
			}
			await environmentState.pendingConfirmation.complete({ confirmed: true });
			await rejected;
			assert.deepStrictEqual(deletedTunnels, []);
		});
	}

	test('an in-flight refresh cannot restore a deleted tunnel but a later discovery can', async () => {
		const { model, setCachedTunnels, setTunnelDiscovery, deletedTunnels } = setup();
		setCachedTunnels([{ ...tunnel, authProvider: 'github' }]);
		await model.refresh(CancellationToken.None);
		const pendingDiscovery = new DeferredPromise<ITunnelInfo[]>();
		setTunnelDiscovery(() => pendingDiscovery.p);
		const refresh = model.refresh(CancellationToken.None);
		await model.deleteTunnel('tunnel:laptop');
		await pendingDiscovery.complete([tunnel]);
		await refresh;
		const afterStaleRefresh = model.remotes.get().some(remote => remote.id === 'tunnel:laptop');
		await assert.rejects(model.deleteTunnel('tunnel:laptop'), /no longer available/);
		setTunnelDiscovery(async () => [{ ...tunnel, name: 'Recreated tunnel' }]);
		await model.refresh(CancellationToken.None);
		assert.deepStrictEqual({ afterStaleRefresh, recreated: model.remotes.get().find(remote => remote.id === 'tunnel:laptop')!.name, deletions: deletedTunnels.length }, {
			afterStaleRefresh: false, recreated: 'Recreated tunnel', deletions: 1,
		});
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
					message: 'Remove environment \'Office desktop\'?',
					detail: 'This removes the environment registration and disconnects this client. The remote computer and its files are kept. The environment may reappear if its owning application registers it again.',
					primaryButton: '&&Remove',
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
		const { model, configuration, environmentAvailable, environmentHosts, environmentConnections, connectionChanges, addEnvironmentProvider, sharing } = setup();
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentAvailable.set(true, undefined);
		environmentHosts.set([{ id: 'desktop', name: 'Desktop', kind: 'user-local', status: 'online' }], undefined);
		const id = cloudSandboxAddress('desktop');
		await model.setConnected(id, true);
		addEnvironmentProvider('desktop');
		await model.setConnected(id, true);
		await model.setConnected(id, false);
		assert.deepStrictEqual({ environmentConnections, connectionChanges, retained: model.remotes.get().some(remote => remote.id === id), sharingEvents: sharing.events }, {
			environmentConnections: ['desktop'], connectionChanges: [{ id, connected: true }, { id, connected: false }], retained: true, sharingEvents: [],
		});
	});

	test('omits this computer\'s own registrations', async () => {
		const { model, configuration, environmentAvailable, environmentHosts, addEnvironmentProvider, addProvider } = setup();
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentAvailable.set(true, undefined);
		environmentHosts.set([
			{ id: 'self', name: 'Workstation', kind: 'user-local', status: 'online' },
			{ id: 'desktop', name: 'Desktop', kind: 'user-local', status: 'offline' },
		], undefined);
		addEnvironmentProvider('self', 'githubEnvironment');
		addEnvironmentProvider('desktop');
		const names = () => model.remotes.get()
			.filter(remote => remote.kind === 'environment' || remote.kind === 'tunnel')
			.map(remote => remote.name);
		const cached = names();
		await model.refresh(CancellationToken.None);
		const discovered = names();
		addProvider('tunnel:laptop', 'devTunnel');
		assert.deepStrictEqual({ cached, discovered, ownTunnel: names() }, {
			cached: ['Desktop'],
			discovered: ['Laptop', 'Desktop'],
			ownTunnel: ['Desktop'],
		});
	});

	test('GitHub environment sharing is gated, lists shared remotes once and rejects unsupported targets', async () => {
		const { model, configuration, setConfiguration, environmentAvailable, environmentHosts, sharing } = setup();
		await model.refresh(CancellationToken.None);
		sharing.shareable.set(new Set(['ssh:build', 'tunnel:laptop']), undefined);
		const snapshot = () => ({
			rows: model.remotes.get().filter(remote => remote.canShareAsGitHubEnvironment !== undefined)
				.map(remote => `${remote.id}: ${remote.canShareAsGitHubEnvironment ? 'shareable' : 'not shareable'}${remote.gitHubEnvironment ? `, ${remote.gitHubEnvironment.state}` : ''}`),
			environments: model.remotes.get().filter(remote => remote.kind === 'environment').map(remote => remote.name),
		});
		const gated = snapshot();
		await assert.rejects(model.setSharedAsGitHubEnvironment('ssh:build', true), /no longer available/);
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentAvailable.set(true, undefined);
		environmentHosts.set([
			{ id: 'shared-build', name: 'Shared build', kind: 'user-local', status: 'online' },
			{ id: 'desktop', name: 'Desktop', kind: 'user-local', status: 'online' },
		], undefined);
		await model.setSharedAsGitHubEnvironment('ssh:build', true);
		sharing.environmentIds.set(new Set(['shared-build']), undefined);
		const shared = snapshot();
		await assert.rejects(model.setSharedAsGitHubEnvironment('wsl:Ubuntu', true), /no longer available/);
		await assert.rejects(model.setSharedAsGitHubEnvironment('tunnel:laptop', false), /no longer available/);
		await assert.rejects(model.setSharedAsGitHubEnvironment(cloudSandboxAddress('desktop'), true), /no longer available/);
		await setConfiguration(GitHubEnvironmentsEnabledSettingId, false);
		const disabled = snapshot();
		await setConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		await model.setSharedAsGitHubEnvironment('ssh:build', false);
		sharing.environmentIds.set(new Set(), undefined);
		assert.deepStrictEqual({ gated, shared, disabled, unshared: snapshot(), events: sharing.events }, {
			gated: { rows: [], environments: [] },
			shared: { rows: ['ssh:build: shareable, enabled', 'tunnel:laptop: shareable'], environments: ['Desktop'] },
			disabled: { rows: [], environments: [] },
			unshared: { rows: ['ssh:build: shareable', 'tunnel:laptop: shareable'], environments: ['Desktop', 'Shared build'] },
			events: ['share ssh:build after 0 removals', 'unshare ssh:build after 0 removals'],
		});
	});

	test('removing or deleting a shared remote stops sharing it first', async () => {
		const { model, storage, configuration, environmentAvailable, sharing } = setup();
		await configuration.setUserConfiguration(GitHubEnvironmentsEnabledSettingId, true);
		environmentAvailable.set(true, undefined);
		addSSHRemoteAgentHostEntry(storage, savedSSHHost);
		await model.refresh(CancellationToken.None);
		const ids = ['ssh:removed', 'wsl:Ubuntu', 'tunnel:laptop'];
		sharing.shareable.set(new Set(ids), undefined);
		for (const id of ids) {
			await model.setSharedAsGitHubEnvironment(id, true);
		}
		await model.deleteSSHHost('ssh:removed');
		await model.remove('wsl:Ubuntu');
		await model.deleteTunnel('tunnel:laptop');
		assert.deepStrictEqual({ events: sharing.events.slice(ids.length), shares: [...sharing.shares.get().keys()] }, {
			events: ['unshare ssh:removed after 0 removals', 'unshare wsl:Ubuntu after 1 removals', 'unshare tunnel:laptop after 2 removals'],
			shares: [],
		});
	});

	test('disconnecting asks whether to keep sharing as a GitHub environment and can be cancelled', async () => {
		const { model, sharing, connectionChanges } = setup();
		await model.refresh(CancellationToken.None);
		await model.setConnected('ssh:build', true);
		sharing.disconnectConfirmed = false;
		await model.setConnected('ssh:build', false);
		const cancelled = model.remotes.get().find(remote => remote.id === 'ssh:build')?.connectionStatus.kind;
		sharing.disconnectConfirmed = true;
		await model.setConnected('ssh:build', false);
		assert.deepStrictEqual({ cancelled, events: sharing.events, connectionChanges }, {
			cancelled: 'connected',
			events: ['confirm disconnect ssh:build (build)', 'confirm disconnect ssh:build (build)'],
			connectionChanges: [{ id: 'ssh:build', connected: true }, { id: 'ssh:build', connected: false }],
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
