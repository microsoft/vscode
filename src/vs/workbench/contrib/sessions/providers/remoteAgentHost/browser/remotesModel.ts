/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter, raceTimeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader, observableSignal, observableSignalFromEvent, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { isWindows, OperatingSystem } from '../../../../../../base/common/platform.js';
import { isObject } from '../../../../../../base/common/types.js';
import { localize } from '../../../../../../nls.js';
import { cloudSandboxAddress } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IMissionControlAvailabilityService, IMissionControlEnvironmentService, IMissionControlHost, IRemoteGitHubEnvironmentShare, IRemoteGitHubEnvironmentSharingService } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { addSSHRemoteAgentHostEntry, getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, IRemoteAgentHostSSHConnection, readSSHRemoteAgentHostEntries, removeSSHRemoteAgentHostEntry, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { computeSSHConnectionKey, ISSHRemoteAgentHostService, SSHHostReachability } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { isTunnelHosted, ITunnelAgentHostService, ITunnelInfo, TUNNEL_ADDRESS_PREFIX, TUNNEL_MIN_PROTOCOL_VERSION, TunnelAuthenticationRequiredError } from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IWSLRemoteAgentHostService, WSL_ADDRESS_PREFIX } from '../../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IRemoteAgentHostLocationPreferenceService, RemoteAgentHostLocationPreference } from '../../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IProgress, IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IRemoteTunnelService, TunnelStatus } from '../../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { IAgentHostSessionsProvider, isAgentHostProvider, isRemoteSessionCreationEnvironment } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { isActiveSessionStatus } from '../../../../../services/sessions/common/session.js';
import { applyRemoteAgentHostLocationPreference, changeRemoteAgentHostLocationPreference, confirmTunnelDeletion, disconnectSSHEntry, getCopyableRemoteAddress, reconnectRemoteHost, removeRemoteHost, renameRemoteHost, sshConnectionKey, upgradeRemoteHost } from './remoteHostOptions.js';
import { getRemoteAgentHostPickerKey, RemoteAgentHostPickerVisibility } from './remoteAgentHostPickerVisibility.js';

export const remoteKinds = ['ssh', 'wsl', 'tunnel', 'environment'] as const;
export type RemoteKind = typeof remoteKinds[number];
const metadataKeyPrefix = 'remoteAgentHost.lastKnownMetadata.';

export interface IRemoteMetadata {
	readonly operatingSystem?: OperatingSystem;
	readonly activeSessionCount?: number;
	readonly lastConnectedAt?: number;
	/** When this window last confirmed the remote was online. */
	readonly lastOnlineAt?: number;
	readonly observedAt: number;
}

/**
 * Whether a remote is confirmed running right now, independent of whether this computer is connected to it.
 * - `online`: a live check in this window confirmed it is running.
 * - `offline`: discovery explicitly reported it offline, or WSL confirmed it isn't running or installed.
 * - `pending`: the first live check in this window hasn't finished. Later checks keep the previous result until they finish.
 * - `unknown`: it couldn't be checked, for example while signed out or when it's reached through a proxy.
 */
export type RemoteAvailability = 'online' | 'offline' | 'pending' | 'unknown';

/** Minimum time between persisted updates of {@link IRemoteMetadata.lastOnlineAt}. */
const lastOnlineWriteIntervalMs = 60_000;
const sshReachabilityConcurrency = 8;

export const remoteKindLabels: Record<RemoteKind, string> = {
	ssh: localize('remotes.ssh', "SSH"),
	wsl: localize('remotes.wsl', "WSL"),
	tunnel: localize('remotes.tunnels', "Dev Tunnels"),
	environment: localize('remotes.environments', "GitHub Environments"),
};

export interface ICustomizationRemote {
	readonly id: string;
	readonly kind: RemoteKind;
	readonly name: string;
	readonly detail: string;
	readonly canRemove: boolean;
	readonly canDelete?: boolean;
	/** A pasteable connection address; Copy Address is offered only when set. */
	readonly copyableAddress?: string;
	readonly connectionStatus: RemoteAgentHostConnectionStatus;
	readonly lastConnectionError?: string;
	readonly availability: RemoteAvailability;
	/** Explains why the remote isn't confirmed online; set whenever {@link availability} is `offline` or `unknown`. */
	readonly unavailableReason?: string;
	/** Connecting starts this offline remote (for example a stopped WSL distribution), so Connect stays enabled. */
	readonly startsOnConnect?: boolean;
	readonly hidden?: boolean;
	readonly pickerUnavailableReason?: string;
	readonly metadata?: IRemoteMetadata;
	readonly metadataIsStale?: boolean;
	/** Whether this remote's agent host can be shared as a GitHub environment now. */
	readonly canShareAsGitHubEnvironment?: boolean;
	/** Present while this remote's agent host is, or is being, shared as a GitHub environment. */
	readonly gitHubEnvironment?: IRemoteGitHubEnvironmentShare;
}

export function canConnectToRemote(remote: ICustomizationRemote): boolean {
	return RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus) || remote.availability !== 'offline' || !!remote.startsOnConnect;
}

export type IRemoteRefreshProgress =
	| { readonly kind: RemoteKind; readonly refreshing: true }
	| { readonly kind: RemoteKind; readonly refreshing: false; readonly failed: boolean };

export interface IRemotesModel extends IDisposable {
	readonly remotes: IObservable<readonly ICustomizationRemote[]>;
	readonly environmentsEnabled: IObservable<boolean>;
	readonly tunnelAuthenticationRequired: IObservable<'github' | 'microsoft' | undefined>;
	signInToTunnels(): Promise<void>;
	/** Returns the kinds that failed to refresh; diagnostic details are written to the log. */
	refresh(token: CancellationToken, progress?: IProgress<IRemoteRefreshProgress>): Promise<readonly RemoteKind[]>;
	setConnected(id: string, connected: boolean): Promise<void>;
	rename(id: string): Promise<void>;
	copyAddress(id: string): Promise<void>;
	getPreferredAgentLocation(id: string): RemoteAgentHostLocationPreference | undefined;
	changePreferredAgentLocation(id: string, preference?: RemoteAgentHostLocationPreference): Promise<'saved' | 'reconnected' | undefined>;
	updateServer(id: string): Promise<void>;
	setSharedAsGitHubEnvironment(id: string, shared: boolean): Promise<void>;
	deleteTunnel(id: string): Promise<void>;
	deleteSSHHost(id: string): Promise<void>;
	remove(id: string): Promise<void>;
	setHidden(id: string, hidden: boolean): void;
}

export function getVisibleRemoteKinds(operatingSystem: OperatingSystem, environmentsEnabled = false): readonly RemoteKind[] {
	return [
		...(environmentsEnabled ? ['environment' as const] : []),
		'tunnel',
		...(operatingSystem === OperatingSystem.Windows ? ['wsl' as const] : []),
		'ssh',
	];
}

type RemoteTarget =
	| { readonly kind: 'ssh'; readonly entry: IRemoteAgentHostEntry }
	| { readonly kind: 'wsl'; readonly distro: string; readonly name: string; readonly running?: boolean }
	| { readonly kind: 'tunnel'; readonly tunnel: ITunnelInfo; readonly authProvider?: 'github' | 'microsoft'; readonly source: 'discovered' | 'cached' }
	| { readonly kind: 'environment'; readonly host: IMissionControlHost; readonly account: string };

export class RemotesModel extends Disposable implements IRemotesModel {
	private readonly targets = new Map<string, RemoteTarget>();
	private readonly registered = new Set<string>();
	private readonly _remotes = observableValue<readonly ICustomizationRemote[]>(this, []);
	readonly remotes = this._remotes;
	private readonly _environmentsEnabled = observableValue(this, false);
	readonly environmentsEnabled = this._environmentsEnabled;
	private readonly _tunnelAuthenticationRequired = observableValue<'github' | 'microsoft' | undefined>(this, undefined);
	readonly tunnelAuthenticationRequired = this._tunnelAuthenticationRequired;
	private readonly pickerVisibility: RemoteAgentHostPickerVisibility;
	private remoteTunnelStatus: TunnelStatus | undefined;
	private receivedTunnelStatusEvent = false;
	private tunnelDiscoveryVersion = 0;
	/** Account that the most recent successful tunnel discovery listed tunnels for, if any. */
	private tunnelDiscoveryAuthProvider: 'github' | 'microsoft' | undefined;
	private tunnelDiscoverySucceeded = false;
	private sshConfigAddresses: ReadonlySet<string> | undefined;
	private sshDiscoveryVersion = 0;
	private readonly observedConnections = new Map<string, boolean>();
	/** Kinds whose live check is running. */
	private readonly checkingKinds = new Set<RemoteKind>();
	/** Kinds whose live check finished at least once in this window, successfully or not. */
	private readonly checkedKinds = new Set<RemoteKind>();
	/** The account whose GitHub Environments this window refreshed; restored hosts carry a status from an earlier session. */
	private environmentsVerifiedAccount: string | undefined;
	/** WSL distributions installed on this computer, from the most recent successful discovery. */
	private installedDistros: ReadonlySet<string> | undefined;
	/** Installed WSL distributions that were running when last checked. */
	private runningDistros: ReadonlySet<string> | undefined;
	private runningDistrosVersion = 0;
	private readonly sshReachability = new Map<string, SSHHostReachability | 'pending'>();
	/** The last settled availability of each remote, shown while a later check is still running. */
	private readonly settledAvailability = new Map<string, Pick<ICustomizationRemote, 'availability' | 'unavailableReason' | 'startsOnConnect'>>();
	private sshReachabilityVersion = 0;

	constructor(
		@ISSHRemoteAgentHostService private readonly sshService: ISSHRemoteAgentHostService,
		@IWSLRemoteAgentHostService private readonly wslService: IWSLRemoteAgentHostService,
		@ITunnelAgentHostService private readonly tunnelService: ITunnelAgentHostService,
		@IRemoteAgentHostService private readonly remoteAgentHostService: IRemoteAgentHostService,
		@ISessionsProvidersService private readonly providersService: ISessionsProvidersService,
		@IStorageService private readonly storageService: IStorageService,
		@IConfigurationService private readonly configurationService: IConfigurationService,
		@ILogService private readonly logService: ILogService,
		@IQuickInputService private readonly quickInputService: IQuickInputService,
		@IMissionControlEnvironmentService private readonly environmentService: IMissionControlEnvironmentService,
		@IMissionControlAvailabilityService environmentAvailabilityService: IMissionControlAvailabilityService,
		@IDialogService private readonly dialogService: IDialogService,
		@IClipboardService private readonly clipboardService: IClipboardService,
		@IRemoteAgentHostLocationPreferenceService private readonly locationPreferenceService: IRemoteAgentHostLocationPreferenceService,
		@INotificationService private readonly notificationService: INotificationService,
		@IProgressService private readonly progressService: IProgressService,
		@IProductService private readonly productService: IProductService,
		@IRemoteTunnelService remoteTunnelService: IRemoteTunnelService,
		@IRemoteGitHubEnvironmentSharingService private readonly remoteSharing: IRemoteGitHubEnvironmentSharingService,
	) {
		super();
		this.pickerVisibility = this._register(new RemoteAgentHostPickerVisibility(storageService));
		// Lazy services can publish providers while the initial cached state is being read.
		this.update();
		this._register(tunnelService.onDidChangeTunnels(() => this.update()));
		this._register(wslService.onDidChangeConnections(() => {
			this.update();
			// Connecting starts a distribution, and it keeps running after disconnecting.
			void this.refreshRunningDistros();
		}));
		const providersChanged = observableSignalFromEvent(this, providersService.onDidChangeProviders);
		const sessionsChanged = observableSignal(this);
		this._register(autorun(reader => {
			providersChanged.read(reader);
			sessionsChanged.read(reader);
			environmentAvailabilityService.available.read(reader);
			// Read unconditionally: `update` only reads them while GitHub environments are enabled.
			remoteSharing.shareable.read(reader);
			remoteSharing.shares.read(reader);
			remoteSharing.environmentIds.read(reader);
			for (const provider of providersService.getProviders().filter(isAgentHostProvider)) {
				provider.localRegistration?.read(reader);
				provider.sessionListVersion?.read(reader);
				reader.store.add(provider.onDidChangeSessions(() => sessionsChanged.trigger(undefined)));
			}
			this.update(reader);
		}));
		this._register(remoteAgentHostService.onDidChangeConnections(() => this.update()));
		this._register(remoteAgentHostService.onDidChangeDisplayName(() => this.update()));
		this._register(storageService.onDidChangeValue(StorageScope.APPLICATION, undefined, this._store)(() => this.update()));
		this._register(configurationService.onDidChangeConfiguration(() => this.update()));
		this._register(remoteTunnelService.onDidChangeTunnelStatus(status => {
			this.receivedTunnelStatusEvent = true;
			this.remoteTunnelStatus = status;
			this.update();
		}));
		void this.loadTunnelStatus(remoteTunnelService);
	}

	private async loadTunnelStatus(remoteTunnelService: IRemoteTunnelService): Promise<void> {
		try {
			const status = await remoteTunnelService.getTunnelStatus();
			if (!this._store.isDisposed && !this.receivedTunnelStatusEvent) {
				this.remoteTunnelStatus = status;
				this.update();
			}
		} catch (error) {
			this.logService.warn('[Remotes] Could not read hosted tunnel status', error);
		}
	}

	private get enabled(): boolean {
		return this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId) === true
			&& this.configurationService.getValue<boolean>('chat.disableAIFeatures') !== true;
	}

	async refresh(token: CancellationToken, progress?: IProgress<IRemoteRefreshProgress>): Promise<readonly RemoteKind[]> {
		if (!this.enabled || token.isCancellationRequested) {
			return [];
		}
		let discoveredTunnelAuthProvider: 'github' | 'microsoft' | undefined;
		const discover = async (kind: RemoteKind, task: () => Promise<readonly RemoteTarget[]>, afterApply?: () => Promise<void>): Promise<RemoteKind | undefined> => {
			const tunnelDiscoveryVersion = this.tunnelDiscoveryVersion;
			const sshDiscoveryVersion = this.sshDiscoveryVersion;
			progress?.report({ kind, refreshing: true });
			this.checkingKinds.add(kind);
			this.update();
			let failed = false;
			try {
				const targets = await task();
				if (!token.isCancellationRequested && !this._store.isDisposed && this.enabled
					&& (kind !== 'tunnel' || tunnelDiscoveryVersion === this.tunnelDiscoveryVersion)
					&& (kind !== 'ssh' || sshDiscoveryVersion === this.sshDiscoveryVersion)) {
					for (const [id, target] of this.targets) {
						if (target.kind === kind) {
							this.targets.delete(id);
						}
					}
					for (const target of targets) {
						this.targets.set(this.getId(target), target);
					}
					if (kind === 'ssh') {
						this.sshConfigAddresses = new Set(targets.map(target => this.getId(target)));
					}
					// Discovery is unsupported off Windows, so its empty result says nothing about installed distributions.
					if (kind === 'wsl' && isWindows) {
						this.installedDistros = new Set(targets.flatMap(target => target.kind === 'wsl' ? [target.distro] : []));
						this.runningDistros = new Set(targets.flatMap(target => target.kind === 'wsl' && target.running ? [target.distro] : []));
						this.runningDistrosVersion++;
					}
					if (kind === 'tunnel') {
						this.tunnelDiscoveryAuthProvider = discoveredTunnelAuthProvider;
						this.tunnelDiscoverySucceeded = true;
						this._tunnelAuthenticationRequired.set(undefined, undefined);
					}
					if (kind === 'environment') {
						this.environmentsVerifiedAccount = this.environmentService.accountKey;
					}
					this.checkedKinds.add(kind);
					this.update();
					await afterApply?.();
				}
			} catch (error) {
				if (!token.isCancellationRequested && !isCancellationError(error)) {
					if (kind === 'ssh' && !this._store.isDisposed) {
						this.sshConfigAddresses = undefined;
						this.sshReachability.clear();
						this.sshReachabilityVersion++;
					}
					if (kind === 'wsl' && !this._store.isDisposed) {
						this.installedDistros = undefined;
						this.runningDistros = undefined;
						this.runningDistrosVersion++;
					}
					if (kind === 'tunnel' && !this._store.isDisposed && this.enabled) {
						this.tunnelDiscoverySucceeded = false;
						this._tunnelAuthenticationRequired.set(error instanceof TunnelAuthenticationRequiredError ? error.authProvider : undefined, undefined);
					}
					if (kind === 'environment') {
						this.environmentsVerifiedAccount = undefined;
					}
					this.logService.warn(`[Remotes] ${kind} discovery failed`, error);
					this.checkedKinds.add(kind);
					failed = true;
					return kind;
				}
			} finally {
				this.checkingKinds.delete(kind);
				if (!this._store.isDisposed) {
					this.update();
				}
				progress?.report({ kind, refreshing: false, failed });
			}
			return undefined;
		};
		const errors = await Promise.all([
			discover('ssh', async () => (await this.sshService.listSSHConfigHosts()).map(host => ({
				kind: 'ssh',
				entry: { name: host, connection: { type: RemoteAgentHostEntryType.SSH, address: `ssh:${host}`, hostName: host, sshConfigHost: host } },
			})), () => this.checkSSHReachability(token)),
			discover('wsl', async () => isWindows ? (await this.wslService.listDistros()).map(distro => ({ kind: 'wsl', distro: distro.name, name: distro.name, running: distro.isRunning })) : []),
			discover('tunnel', async () => {
				const authProvider = await this.tunnelService.getAuthProvider({ silent: true });
				discoveredTunnelAuthProvider = authProvider;
				return (await this.tunnelService.listTunnels({ silent: true, authProvider })).map(tunnel => ({ kind: 'tunnel', tunnel, authProvider, source: 'discovered' }));
			}),
			discover('environment', async () => {
				if (this.environmentService.enabled) {
					await this.environmentService.refresh(token);
				}
				return [];
			}),
		]);
		return errors.filter((error): error is RemoteKind => error !== undefined);
	}

	private async checkSSHReachability(token: CancellationToken): Promise<void> {
		const service = this.sshService;
		if (!service.checkReachability) {
			return;
		}
		const version = ++this.sshReachabilityVersion;
		const hosts: { id: string; host: string; port: number | undefined }[] = [];
		for (const [id, target] of this.targets) {
			if (target.kind === 'ssh' && target.entry.connection.type === RemoteAgentHostEntryType.SSH) {
				const connection = target.entry.connection;
				// A config alias carries its own port; a manually added host only has the address it was saved with.
				hosts.push(connection.sshConfigHost
					? { id, host: connection.sshConfigHost, port: undefined }
					: { id, host: connection.hostName, port: connection.port });
				// Keep the previous result while re-checking so rows don't move on every refresh.
				if (!this.sshReachability.has(id)) {
					this.sshReachability.set(id, 'pending');
				}
			}
		}
		this.update();
		const limiter = new Limiter<void>(sshReachabilityConcurrency);
		try {
			await Promise.all(hosts.map(({ id, host, port }) => limiter.queue(async () => {
				if (token.isCancellationRequested || version !== this.sshReachabilityVersion || this._store.isDisposed) {
					return;
				}
				let result: SSHHostReachability;
				try {
					result = await service.checkReachability!(host, port);
				} catch (error) {
					this.logService.info(`[Remotes] Could not check whether ${host} is reachable`, error);
					result = 'unknown';
				}
				if (version === this.sshReachabilityVersion && !this._store.isDisposed) {
					this.sshReachability.set(id, result);
					this.update();
				}
			})));
		} finally {
			limiter.dispose();
			if (version === this.sshReachabilityVersion) {
				for (const { id } of hosts) {
					if (this.sshReachability.get(id) === 'pending') {
						this.sshReachability.delete(id);
					}
				}
			}
		}
	}

	private async refreshRunningDistros(): Promise<void> {
		if (!isWindows || !this.installedDistros) {
			return;
		}
		const version = ++this.runningDistrosVersion;
		try {
			const running = await this.wslService.listRunningDistros();
			if (version === this.runningDistrosVersion && !this._store.isDisposed) {
				this.runningDistros = new Set(running);
				this.update();
			}
		} catch (error) {
			this.logService.info('[Remotes] Could not check which WSL distributions are running', error);
			if (version === this.runningDistrosVersion && !this._store.isDisposed) {
				this.runningDistros = undefined;
				this.update();
			}
		}
	}

	async signInToTunnels(): Promise<void> {
		const authProvider = this.tunnelAuthenticationRequired.get();
		if (!authProvider || !this.enabled || this._store.isDisposed) {
			throw new CancellationError();
		}
		if (!this.tunnelService.signIn) {
			throw new Error(localize('remotes.tunnelSignInUnsupported', "Tunnel sign-in is not supported by this application."));
		}
		await this.tunnelService.signIn(authProvider);
	}

	private async registerRemote(id: string): Promise<void> {
		const target = this.targets.get(id);
		if (!target || !this.enabled) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		if (this.registered.has(id)) {
			return;
		}
		switch (target.kind) {
			case 'ssh': {
				const connection = target.entry.connection;
				if (connection.type !== RemoteAgentHostEntryType.SSH) {
					throw new Error('Expected an SSH connection.');
				}
				const resolved = connection.sshConfigHost ? await this.sshService.resolveSSHConfig(connection.sshConfigHost) : undefined;
				if (!this.enabled) {
					throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
				}
				addSSHRemoteAgentHostEntry(this.storageService, {
					...target.entry,
					connection: { ...connection, ...(resolved ? { hostName: resolved.hostname, user: resolved.user, port: resolved.port } : {}) },
				});
				break;
			}
			case 'wsl':
				this.wslService.cacheDistro({ distro: target.distro, name: target.name });
				break;
			case 'tunnel':
				this.tunnelService.clearTunnelDismissal(target.tunnel.tunnelId);
				this.tunnelService.cacheTunnel(target.tunnel, target.authProvider);
				break;
			case 'environment':
				break;
		}
		this.update();
	}

	async copyAddress(id: string): Promise<void> {
		const address = this.enabled && !this._store.isDisposed ? this._remotes.get().find(remote => remote.id === id)?.copyableAddress : undefined;
		if (!address) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		await this.clipboardService.writeText(address);
	}

	getPreferredAgentLocation(id: string): RemoteAgentHostLocationPreference | undefined {
		const target = this.targets.get(id);
		const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
		return target ? this.locationPreferenceService.getPreference(provider?.remoteLocationPreferenceKey ?? this.getLocationPreferenceKey(target)) : undefined;
	}

	async changePreferredAgentLocation(id: string, preference?: RemoteAgentHostLocationPreference): Promise<'saved' | 'reconnected' | undefined> {
		const remote = this._remotes.get().find(remote => remote.id === id);
		if (!this.enabled || this._store.isDisposed || !remote) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		const target = this.targets.get(id);
		if (target?.kind !== 'tunnel' && target?.kind !== 'ssh') {
			throw new Error(localize('remotes.locationUnavailable', "Preferred agent location can only be changed for SSH hosts and tunnels here."));
		}
		const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
		const options = {
			preferenceKey: provider?.remoteLocationPreferenceKey ?? this.getLocationPreferenceKey(target),
			hostLabel: remote.name,
			productName: this.productService.nameShort,
			provider: RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus) ? provider : undefined,
			dialogService: this.dialogService,
			locationPreferenceService: this.locationPreferenceService,
			notificationService: this.notificationService,
			remoteAgentHostService: this.remoteAgentHostService,
			progressService: this.progressService,
		};
		if (preference) {
			return applyRemoteAgentHostLocationPreference(options, preference);
		}
		await changeRemoteAgentHostLocationPreference(options);
		return undefined;
	}

	async updateServer(id: string): Promise<void> {
		const remote = this._remotes.get().find(remote => remote.id === id);
		const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
		if (!this.enabled || this._store.isDisposed || !remote || !provider) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		const status = provider.connectionStatus?.get() ?? remote.connectionStatus;
		if (!RemoteAgentHostConnectionStatus.isIncompatible(status) || !status.vscodeUpgradeMethod) {
			throw new Error(localize('remotes.updateUnavailable', "This remote does not support updating its server."));
		}
		await upgradeRemoteHost(provider, status.vscodeUpgradeMethod, this.remoteAgentHostService, this.notificationService, this.progressService);
	}

	async setSharedAsGitHubEnvironment(id: string, shared: boolean): Promise<void> {
		const target = this.targets.get(id);
		const remote = this._remotes.get().find(remote => remote.id === id);
		if (!this.enabled || this._store.isDisposed || !remote || !target || target.kind === 'environment' || remote.gitHubEnvironment?.state === 'unavailable'
			|| (shared ? !remote.canShareAsGitHubEnvironment : !remote.gitHubEnvironment)) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		await this.remoteSharing.setShared(id, shared);
	}

	/**
	 * Stops sharing a remote before it is removed, while it can still withdraw its registration.
	 * Bounded so that an unresponsive remote cannot block removal; the service retries a failed withdrawal.
	 */
	private async unshareBeforeRemoval(id: string): Promise<void> {
		const share = this.remoteSharing.shares.get().get(id);
		if (share && share.state !== 'unavailable') {
			await raceTimeout(this.remoteSharing.setShared(id, false), 5000);
		}
	}

	async rename(id: string): Promise<void> {
		const remote = this._remotes.get().find(remote => remote.id === id);
		if (!remote || !this.enabled) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		const target = this.targets.get(id);
		const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
		const renameTarget = target?.kind === 'environment' ? {
			remoteAddress: id, label: remote.name,
			setDisplayName: (name: string | undefined) => {
				this.checkEnvironment(target);
				this.environmentService.setDisplayName(target.host.id, name);
			},
		} : {
			remoteAddress: id, label: remote.name,
			setDisplayName: provider?.setDisplayName ? (name: string | undefined) => provider.setDisplayName?.(name) : undefined,
		};
		await renameRemoteHost(renameTarget, this.quickInputService, this.remoteAgentHostService);
		if (!this._store.isDisposed) {
			this.update();
		}
	}

	async remove(id: string): Promise<void> {
		const remote = this._remotes.get().find(remote => remote.id === id);
		if (!remote || !this.enabled) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		if (!remote.canRemove) {
			throw new Error(localize('remotes.cannotRemove', "This remote cannot be removed. Only registered remotes that support removal can be removed."));
		}
		const target = this.targets.get(id);
		if (target?.kind === 'environment') {
			this.checkEnvironment(target);
			const { confirmed } = await this.dialogService.confirm({
				type: 'warning',
				message: localize('remotes.removeEnvironmentConfirmation', "Remove environment '{0}'?", remote.name),
				detail: localize('remotes.forgetEnvironmentDetail', "This removes the environment registration and disconnects this client. The remote computer and its files are kept. The environment may reappear if its owning application registers it again."),
				primaryButton: localize('remotes.removeEnvironmentButton', "&&Remove"),
			});
			if (!confirmed) {
				return;
			}
			if (this._store.isDisposed || !this.enabled) {
				throw new CancellationError();
			}
			this.checkEnvironment(target);
			await this.environmentService.delete(target.host.id, CancellationToken.None);
			this.storageService.remove(`${metadataKeyPrefix}${this.getPickerKey(target)}`, StorageScope.PROFILE);
			return;
		} else {
			const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
			if (!provider) {
				throw new Error(localize('remotes.providerUnavailable', "The remote is not ready to be removed. Try again."));
			}
			await this.unshareBeforeRemoval(id);
			await removeRemoteHost(provider, this.remoteAgentHostService, this.configurationService);
		}
		this.targets.delete(id);
		if (target) {
			this.storageService.remove(`${metadataKeyPrefix}${this.getPickerKey(target)}`, StorageScope.PROFILE);
		}
		if (!this._store.isDisposed) {
			this.update();
		}
	}

	async deleteTunnel(id: string): Promise<void> {
		const target = this.targets.get(id);
		const remote = this._remotes.get().find(remote => remote.id === id);
		if (!this.enabled || this._store.isDisposed || !remote || target?.kind !== 'tunnel') {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		this.checkTunnelDeletion(target.tunnel);
		if (!await confirmTunnelDeletion(this.dialogService, remote.name)) {
			return;
		}
		const current = this.targets.get(id);
		if (this._store.isDisposed || !this.enabled || current?.kind !== 'tunnel'
			|| current.tunnel.clusterId !== target.tunnel.clusterId || current.authProvider !== target.authProvider) {
			throw new CancellationError();
		}
		this.checkTunnelDeletion(current.tunnel);
		await this.unshareBeforeRemoval(id);
		await this.tunnelService.deleteTunnel(current.tunnel, current.authProvider);
		this.storageService.remove(`${metadataKeyPrefix}${this.getPickerKey(current)}`, StorageScope.PROFILE);
		this.tunnelDiscoveryVersion++;
		this.targets.delete(id);
		if (!this._store.isDisposed) {
			this.update();
		}
	}

	async deleteSSHHost(id: string): Promise<void> {
		const connection = await this.checkSSHHostDeletion(id);
		const remote = this._remotes.get().find(remote => remote.id === id);
		const { confirmed } = await this.dialogService.confirm({
			type: 'warning',
			message: localize('remotes.forgetSSHConfirmation', "Forget saved SSH connection '{0}'?", remote?.name ?? id),
			detail: localize('remotes.forgetSSHDetail', "This forgets the saved connection and disconnects this client. Your SSH configuration, the remote computer, and its files are kept."),
			primaryButton: localize('remotes.forgetSSHButton', "&&Forget"),
		});
		if (!confirmed) {
			return;
		}
		const current = await this.checkSSHHostDeletion(id);
		if (sshConnectionKey(current) !== sshConnectionKey(connection)) {
			throw new CancellationError();
		}
		const target = this.targets.get(id);
		await this.unshareBeforeRemoval(id);
		removeSSHRemoteAgentHostEntry(this.storageService, id);
		this.sshDiscoveryVersion++;
		try {
			await disconnectSSHEntry(current, this.remoteAgentHostService, this.sshService);
		} finally {
			this.targets.delete(id);
			if (target) {
				this.storageService.remove(`${metadataKeyPrefix}${this.getPickerKey(target)}`, StorageScope.PROFILE);
			}
			if (!this._store.isDisposed) {
				this.update();
			}
		}
	}

	private async checkSSHHostDeletion(id: string): Promise<IRemoteAgentHostSSHConnection> {
		if (!this.enabled || this._store.isDisposed) {
			throw new CancellationError();
		}
		const hosts = await this.sshService.listSSHConfigHosts();
		if (!this.enabled || this._store.isDisposed) {
			throw new CancellationError();
		}
		this.sshConfigAddresses = new Set(hosts.map(host => `ssh:${host}`));
		this.update();
		const entry = readSSHRemoteAgentHostEntries(this.storageService).find(entry => getEntryAddress(entry) === id);
		if (!entry || entry.connection.type !== RemoteAgentHostEntryType.SSH) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		if (this.isSSHHostConfigured(entry.connection)) {
			throw new Error(localize('remotes.sshConfigured', "This host is still in your SSH configuration. Remove it from the configuration before deleting its saved connection."));
		}
		return entry.connection;
	}

	private isSSHHostConfigured(connection: IRemoteAgentHostSSHConnection): boolean {
		return this.sshConfigAddresses === undefined || this.sshConfigAddresses.has(`ssh:${connection.sshConfigHost ?? connection.hostName}`);
	}

	private checkTunnelDeletion(tunnel: ITunnelInfo): void {
		if (!this.tunnelService.canDeleteTunnels) {
			throw new Error(localize('remotes.tunnelForgetUnsupported', "Removing tunnel registrations is not supported by this application."));
		}
		if (!this.remoteTunnelStatus) {
			throw new Error(localize('remotes.tunnelStatusUnavailable', "Tunnel hosting status is not available yet. Try again."));
		}
		if (isTunnelHosted(this.remoteTunnelStatus.type === 'connected' ? this.remoteTunnelStatus.info : undefined, tunnel)) {
			throw new Error(localize('remotes.tunnelDeleteHosted', "This computer is sharing this dev tunnel. Stop sharing it before deleting it."));
		}
	}

	async setConnected(id: string, connected: boolean): Promise<void> {
		const target = this.targets.get(id);
		if (!target || !this.enabled) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		if (connected) {
			this.checkCanConnect(id);
		}
		if (target.kind === 'environment') {
			this.checkEnvironment(target);
		} else if (connected) {
			await this.registerRemote(id);
		}
		const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
		try {
			if (connected) {
				const connectionStatus = this.remoteAgentHostService.connections.find(connection => connection.address === id)?.status ?? provider?.connectionStatus?.get();
				if (RemoteAgentHostConnectionStatus.isConnected(connectionStatus)) {
					return;
				}
				this.checkCanConnect(id);
				if (provider) {
					await reconnectRemoteHost(provider, this.remoteAgentHostService);
				} else if (target.kind === 'environment') {
					await this.environmentService.connect(target.host.id, CancellationToken.None);
				} else if (target.kind === 'tunnel') {
					await this.tunnelService.connect(target.tunnel, target.authProvider, { userInitiated: true });
				} else if (target.kind === 'ssh' || target.kind === 'wsl') {
					// Registration can precede the provider's scheduled reconciliation.
					this.remoteAgentHostService.reconnect(id, true);
					await this.remoteAgentHostService.waitForConnection(id);
				} else {
					throw new Error(localize('remotes.providerNotReady', "The remote provider is not ready. Try again."));
				}
			} else if (provider?.disconnect) {
				await provider.disconnect();
			} else if (provider?.remoteAddress) {
				await this.remoteAgentHostService.removeRemoteAgentHost(provider.remoteAddress);
			} else {
				throw new Error(localize('remotes.providerNotReady', "The remote provider is not ready. Try again."));
			}
		} finally {
			if (!this._store.isDisposed) {
				this.update();
			}
		}
	}

	private checkCanConnect(id: string): void {
		const remote = this._remotes.get().find(remote => remote.id === id);
		if (remote && !canConnectToRemote(remote)) {
			throw new Error(remote.unavailableReason ?? localize('remotes.offlineConnect', "This environment is offline. Refresh its status before connecting."));
		}
	}

	private checkEnvironment(target: Extract<RemoteTarget, { kind: 'environment' }>): void {
		if (!this.environmentService.enabled || this.environmentService.accountKey !== target.account
			|| !this.environmentService.hosts.get().some(host => host.id === target.host.id)) {
			throw new CancellationError();
		}
	}

	private getId(target: RemoteTarget): string {
		switch (target.kind) {
			case 'ssh': return getEntryAddress(target.entry);
			case 'wsl': return `${WSL_ADDRESS_PREFIX}${target.distro}`;
			case 'tunnel': return `${TUNNEL_ADDRESS_PREFIX}${target.tunnel.tunnelId}`;
			case 'environment': return cloudSandboxAddress(target.host.id);
		}
	}

	setHidden(id: string, hidden: boolean): void {
		const target = this.targets.get(id);
		if (!target || !this.enabled) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		if (target.kind === 'environment') {
			this.checkEnvironment(target);
		}
		const key = this.getPickerKey(target);
		const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
		const reason = this.getPickerUnavailableReason(provider);
		if (reason) {
			throw new Error(reason);
		}
		this.pickerVisibility.setHidden(key, hidden);
	}

	private getPickerUnavailableReason(provider: IAgentHostSessionsProvider | undefined): string | undefined {
		if (provider && !isRemoteSessionCreationEnvironment(provider)) {
			return localize('remotes.pickerUnsupported', "This remote can't appear as a separate entry in the environment picker.");
		}
		return undefined;
	}

	/** Returns the live availability, or the last settled one while a check is still running. */
	private getAvailability(id: string, target: RemoteTarget): Pick<ICustomizationRemote, 'availability' | 'unavailableReason' | 'startsOnConnect'> {
		const current = this.computeAvailability(id, target);
		if (current.availability === 'pending') {
			return this.settledAvailability.get(id) ?? current;
		}
		this.settledAvailability.set(id, current);
		return current;
	}

	private computeAvailability(id: string, target: RemoteTarget): Pick<ICustomizationRemote, 'availability' | 'unavailableReason' | 'startsOnConnect'> {
		const unknown = (unavailableReason = localize('remotes.availabilityUnknown', "Couldn't check this environment's status. Select Connect to try.")) =>
			this.checkingKinds.has(target.kind) || !this.checkedKinds.has(target.kind) ? { availability: 'pending' as const } : { availability: 'unknown' as const, unavailableReason };
		switch (target.kind) {
			case 'ssh':
				switch (this.sshReachability.get(id)) {
					case 'reachable': return { availability: 'online' };
					case 'unreachable': return { availability: 'unknown', unavailableReason: localize('remotes.sshUnreachable', "The SSH server didn't respond to a direct check from this network. This doesn't confirm the computer is offline. Select Connect to try.") };
					case 'pending': return { availability: 'pending' };
					case 'unknown': return { availability: 'unknown', unavailableReason: localize('remotes.sshUnknown', "A direct SSH status check isn't available for this host. Select Connect to try.") };
					default: return unknown();
				}
			case 'wsl':
				if (!this.installedDistros) {
					return unknown();
				}
				if (!this.installedDistros.has(target.distro)) {
					return { availability: 'offline', unavailableReason: localize('remotes.wslNotInstalled', "This WSL distribution is no longer installed on this computer.") };
				}
				if (!this.runningDistros) {
					return unknown();
				}
				return this.runningDistros.has(target.distro) ? { availability: 'online' }
					: { availability: 'offline', startsOnConnect: true, unavailableReason: localize('remotes.wslStopped', "This WSL distribution is installed but not running. Select Connect to start it.") };
			case 'tunnel':
				if (!this.tunnelDiscoverySucceeded) {
					return unknown(this._tunnelAuthenticationRequired.get()
						? localize('remotes.tunnelSignedOut', "Sign in to Dev Tunnels to check whether this tunnel is online.")
						: undefined);
				}
				if (target.source === 'cached') {
					if (!target.authProvider || target.authProvider === this.tunnelDiscoveryAuthProvider) {
						return { availability: 'unknown', unavailableReason: localize('remotes.tunnelNotDiscovered', "This saved Dev Tunnel wasn't returned by discovery for your account. Its current status couldn't be confirmed. Select Connect to try.") };
					}
					return unknown(this._tunnelAuthenticationRequired.get()
						? localize('remotes.tunnelSignedOut', "Sign in to Dev Tunnels to check whether this tunnel is online.")
						: undefined);
				}
				if (target.tunnel.hostConnectionCount === undefined) {
					return { availability: 'unknown', unavailableReason: localize('remotes.tunnelStatusUnknown', "This Dev Tunnel didn't report its host status. Select Connect to try.") };
				}
				return target.tunnel.hostConnectionCount > 0 ? { availability: 'online' }
					: { availability: 'offline', unavailableReason: localize('remotes.tunnelOffline', "The Dev Tunnel host is offline. Start sharing on the remote computer, then refresh.") };
			case 'environment':
				// Hosts restored from storage keep the status from when they were last fetched.
				if (this.environmentsVerifiedAccount === undefined || this.environmentsVerifiedAccount !== target.account) {
					return unknown();
				}
				switch (target.host.status) {
					case 'online': return { availability: 'online' };
					case 'offline': return { availability: 'offline', unavailableReason: localize('remotes.environmentOffline', "This GitHub Environment is offline. Keep the remote computer awake, online, and sharing before connecting.") };
					default: return unknown();
				}
		}
	}

	private getPickerKey(target: RemoteTarget): string {
		return getRemoteAgentHostPickerKey(this.getLocationPreferenceKey(target), target.kind === 'environment' ? target.account : undefined);
	}

	private getLocationPreferenceKey(target: RemoteTarget): string {
		if (target.kind === 'ssh' && target.entry.connection.type === RemoteAgentHostEntryType.SSH) {
			const connection = target.entry.connection;
			return computeSSHConnectionKey({
				sshConfigHost: connection.sshConfigHost, host: connection.hostName, username: connection.user, port: connection.port,
			});
		}
		return this.getId(target);
	}

	private readMetadata(key: string): IRemoteMetadata | undefined {
		const raw = this.storageService.get(key, StorageScope.PROFILE);
		if (!raw) {
			return undefined;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch (error) {
			if (!(error instanceof SyntaxError)) {
				throw error;
			}
			this.logService.warn('[Remotes] Invalid cached environment metadata');
			this.storageService.remove(key, StorageScope.PROFILE);
			return undefined;
		}
		const value = isObject(parsed) ? parsed as Partial<Record<keyof IRemoteMetadata, unknown>> : undefined;
		const validNumber = (candidate: unknown): candidate is number => typeof candidate === 'number' && Number.isFinite(candidate) && candidate >= 0;
		if (!value || !validNumber(value.observedAt)
			|| value.operatingSystem !== undefined && value.operatingSystem !== OperatingSystem.Windows && value.operatingSystem !== OperatingSystem.Macintosh && value.operatingSystem !== OperatingSystem.Linux
			|| value.activeSessionCount !== undefined && (!validNumber(value.activeSessionCount) || !Number.isInteger(value.activeSessionCount))
			|| value.lastConnectedAt !== undefined && !validNumber(value.lastConnectedAt)
			|| value.lastOnlineAt !== undefined && !validNumber(value.lastOnlineAt)) {
			this.logService.warn('[Remotes] Invalid cached environment metadata');
			this.storageService.remove(key, StorageScope.PROFILE);
			return undefined;
		}
		return {
			observedAt: value.observedAt,
			operatingSystem: value.operatingSystem,
			activeSessionCount: value.activeSessionCount,
			lastConnectedAt: value.lastConnectedAt,
			lastOnlineAt: value.lastOnlineAt,
		};
	}

	private getMetadata(target: RemoteTarget, provider: IAgentHostSessionsProvider | undefined, status: RemoteAgentHostConnectionStatus, availability: RemoteAvailability, operatingSystem: OperatingSystem | undefined, reader?: IReader): Pick<ICustomizationRemote, 'metadata' | 'metadataIsStale'> {
		const key = `${metadataKeyPrefix}${this.getPickerKey(target)}`;
		const previous = this.readMetadata(key);
		const sessionListVersion = provider?.sessionListVersion?.read(reader) ?? 0;
		const live = RemoteAgentHostConnectionStatus.isConnected(status);
		const sessions = live && sessionListVersion > 0 ? provider?.getSessions() : undefined;
		const justConnected = live && this.observedConnections.get(key) === false;
		this.observedConnections.set(key, live);
		const now = Date.now();
		const next = {
			operatingSystem: operatingSystem ?? (target.kind === 'wsl' ? OperatingSystem.Linux : previous?.operatingSystem),
			activeSessionCount: sessions?.filter(session => isActiveSessionStatus(session.status.read(reader))).length ?? previous?.activeSessionCount,
			lastConnectedAt: justConnected ? now : previous?.lastConnectedAt,
			lastOnlineAt: availability === 'online' && (previous?.lastOnlineAt === undefined || now - previous.lastOnlineAt >= lastOnlineWriteIntervalMs)
				? now : previous?.lastOnlineAt,
		};
		if (next.operatingSystem === undefined && next.activeSessionCount === undefined && next.lastConnectedAt === undefined && next.lastOnlineAt === undefined) {
			return {};
		}
		let metadata = previous;
		const observedChanged = !previous || previous.operatingSystem !== next.operatingSystem || previous.activeSessionCount !== next.activeSessionCount
			|| previous.lastConnectedAt !== next.lastConnectedAt;
		if (observedChanged || previous.lastOnlineAt !== next.lastOnlineAt) {
			// A last-online heartbeat must not make the recorded system details look freshly observed.
			metadata = { ...next, observedAt: observedChanged ? now : previous.observedAt };
			this.storageService.store(key, metadata, StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		return { metadata, metadataIsStale: !live || sessionListVersion === 0 };
	}

	private update(reader?: IReader): void {
		const sshEntries = readSSHRemoteAgentHostEntries(this.storageService);
		const distros = this.wslService.getCachedDistros();
		const tunnels = this.tunnelService.getCachedTunnels().filter(tunnel => !this.tunnelService.isTunnelDismissed(tunnel.tunnelId));
		const environments = this.environmentService.hosts.read(reader);
		const environmentsEnabled = this.enabled && this.environmentService.enabled;
		const shareable = environmentsEnabled ? this.remoteSharing.shareable.read(reader) : new Set<string>();
		const shares = environmentsEnabled ? this.remoteSharing.shares.read(reader) : new Map<string, IRemoteGitHubEnvironmentShare>();
		// Remotes this client shares as GitHub environments are already listed under their own kind.
		const sharedEnvironmentIds = environmentsEnabled ? this.remoteSharing.environmentIds.read(reader) : new Set<string>();
		for (const [id, target] of this.targets) {
			if (target.kind === 'environment') {
				this.targets.delete(id);
			}
		}
		const account = this.environmentService.accountKey;
		if (environmentsEnabled && account) {
			for (const host of environments) {
				if (host.kind === 'user-local' && !sharedEnvironmentIds.has(host.id)) {
					const target = { kind: 'environment' as const, host, account };
					this.targets.set(this.getId(target), target);
				}
			}
		}
		const providers = this.providersService.getProviders().filter(isAgentHostProvider);
		const providersByAddress = new Map(providers.map(provider => [provider.remoteAddress, provider]));
		const connectionStatuses = new Map(providers.map(provider => [provider.remoteAddress, provider.connectionStatus?.read(reader)]));
		const connectionErrors = new Map<string, string>();
		const operatingSystems = new Map(this.remoteAgentHostService.connections.map(connection => [connection.address, connection.operatingSystem]));
		for (const connection of this.remoteAgentHostService.connections) {
			connectionStatuses.set(connection.address, connection.status);
			if (connection.lastConnectionError) {
				connectionErrors.set(connection.address, connection.lastConnectionError);
			}
		}
		const registered: RemoteTarget[] = [
			...sshEntries.map((entry): RemoteTarget => ({ kind: 'ssh', entry })),
			...distros.map((distro): RemoteTarget => ({ kind: 'wsl', ...distro })),
			...tunnels.map((tunnel): RemoteTarget => ({
				kind: 'tunnel', authProvider: tunnel.authProvider, source: 'cached',
				tunnel: { ...tunnel, tags: [], protocolVersion: tunnel.protocolVersion ?? TUNNEL_MIN_PROTOCOL_VERSION, hostConnectionCount: 0 },
			})),
		];
		this.registered.clear();
		for (const target of registered) {
			const id = this.getId(target);
			const existing = this.targets.get(id);
			if (existing?.kind !== 'tunnel' || existing.source !== 'discovered') {
				this.targets.set(id, target);
			}
			this.registered.add(id);
		}
		const remotes: ICustomizationRemote[] = [];
		for (const [id, target] of this.targets) {
			let name: string;
			let detail: string;
			switch (target.kind) {
				case 'ssh':
					name = target.entry.name;
					detail = target.entry.connection.type === RemoteAgentHostEntryType.SSH ? target.entry.connection.hostName : id;
					break;
				case 'wsl':
					name = target.name;
					detail = target.distro;
					break;
				case 'tunnel':
					name = target.tunnel.name;
					detail = target.tunnel.tunnelId;
					break;
				case 'environment':
					name = target.host.displayName ?? target.host.name;
					detail = target.host.id;
					break;
			}
			const connectionStatus = connectionStatuses.get(id) ?? RemoteAgentHostConnectionStatus.disconnected;
			// Starting a connection is not evidence that the remote is online.
			const availability = RemoteAgentHostConnectionStatus.isConnected(connectionStatus)
				|| RemoteAgentHostConnectionStatus.isIncompatible(connectionStatus)
				? { availability: 'online' as const } : this.getAvailability(id, target);
			const provider = providersByAddress.get(id);
			// This window already runs sessions on this computer, so its own sharing registrations are not remotes to manage.
			if (provider?.localRegistration?.read(reader)) {
				continue;
			}
			if (target.kind !== 'environment') {
				name = this.remoteAgentHostService.getDisplayNameOverride(id) ?? (target.kind === 'tunnel' ? name : provider?.label ?? name);
			}
			const canRemove = target.kind === 'environment' || this.registered.has(id) && !!provider && provider.canRemove !== false;
			const hidden = this.pickerVisibility.isHidden(this.getPickerKey(target), reader);
			remotes.push({
				id, kind: target.kind, name, detail, canRemove, ...availability,
				...this.getMetadata(target, provider, connectionStatus, availability.availability, operatingSystems.get(id), reader),
				...(target.kind === 'tunnel' ? {
					canDelete: this.tunnelService.canDeleteTunnels && !!this.remoteTunnelStatus
						&& !isTunnelHosted(this.remoteTunnelStatus.type === 'connected' ? this.remoteTunnelStatus.info : undefined, target.tunnel),
				} : {}),
				...(target.kind === 'ssh' ? {
					canDelete: this.registered.has(id) && target.entry.connection.type === RemoteAgentHostEntryType.SSH && !this.isSSHHostConfigured(target.entry.connection),
					copyableAddress: getCopyableRemoteAddress(target.entry),
				} : {}),
				hidden, pickerUnavailableReason: this.getPickerUnavailableReason(provider),
				...(target.kind !== 'environment' && (shareable.has(id) || shares.has(id)) ? {
					canShareAsGitHubEnvironment: shareable.has(id),
					...(shares.has(id) ? { gitHubEnvironment: shares.get(id) } : {}),
				} : {}),
				connectionStatus,
				...(connectionErrors.has(id) ? { lastConnectionError: connectionErrors.get(id) } : {}),
			});
		}
		for (const id of this.settledAvailability.keys()) {
			if (!this.targets.has(id)) {
				this.settledAvailability.delete(id);
			}
		}
		transaction(tx => {
			this._environmentsEnabled.set(environmentsEnabled, tx);
			this._remotes.set(remotes.sort((a, b) => remoteKinds.indexOf(a.kind) - remoteKinds.indexOf(b.kind) || a.name.localeCompare(b.name)), tx);
		});
	}
}
