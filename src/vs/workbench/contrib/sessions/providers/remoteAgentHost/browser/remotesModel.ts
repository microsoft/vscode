/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter, raceTimeout } from '../../../../../../base/common/async.js';
import { CancellationToken } from '../../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../../base/common/errors.js';
import { toErrorMessage } from '../../../../../../base/common/errorMessage.js';
import { Emitter, Event } from '../../../../../../base/common/event.js';
import { Disposable, IDisposable } from '../../../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader, observableSignal, observableSignalFromEvent, observableValue, transaction } from '../../../../../../base/common/observable.js';
import { isWindows, OperatingSystem } from '../../../../../../base/common/platform.js';
import { isDefined, isObject } from '../../../../../../base/common/types.js';
import { localize } from '../../../../../../nls.js';
import { cloudSandboxAddress } from '../../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { normalizeRemoteAgentHostAddress } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { formatConnectionDiagnosticError, sanitizeConnectionDiagnosticText } from '../../../../../../platform/agentHost/common/connectionDiagnostics.js';
import { readAgentHostResources } from '../../../../../../platform/agentHost/common/meta/agentHostResources.js';
import { IAgentHostBuild, readAgentHostBuild, readAgentHostUpgradeMethod } from '../../../../../../platform/agentHost/common/meta/agentHostUpgradeMeta.js';
import type { Implementation, InitializeResult } from '../../../../../../platform/agentHost/common/state/protocol/common/commands.js';
import { IExtensionRemoteAgentHost, IExtensionRemoteAgentHostsService } from '../../../../../../platform/agentHost/common/extensionRemoteAgentHosts.js';
import { IMissionControlAvailabilityService, IMissionControlEnvironmentService, IMissionControlHost, IRemoteGitHubEnvironmentShare, IRemoteGitHubEnvironmentSharingService } from '../../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { addSSHRemoteAgentHostEntry, getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, IRemoteAgentHostSSHConnection, readSSHRemoteAgentHostEntries, removeSSHRemoteAgentHostEntry, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { computeSSHConnectionKey, ISSHRemoteAgentHostService, ISSHResolvedConfig } from '../../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ISSHHostKeyTrustService } from '../../../../../../platform/agentHost/common/sshHostKeyTrust.js';
import { isTunnelHosted, ITunnelAgentHostService, ITunnelInfo, TUNNEL_ADDRESS_PREFIX, TUNNEL_MIN_PROTOCOL_VERSION, TunnelAuthenticationRequiredError } from '../../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IWSLRemoteAgentHostService, WSL_ADDRESS_PREFIX } from '../../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IRemoteAgentHostLocationPreferenceService, RemoteAgentHostLocationPreference } from '../../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { IClipboardService } from '../../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../../platform/product/common/productService.js';
import { IQuickInputService, IQuickPickItem } from '../../../../../../platform/quickinput/common/quickInput.js';
import { IProgress, IProgressService } from '../../../../../../platform/progress/common/progress.js';
import { IRemoteTunnelService, TunnelStatus } from '../../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';
import { logSettingExperimentTrigger } from '../../../../../../platform/telemetry/common/experimentTrigger.js';
import { ITelemetryService } from '../../../../../../platform/telemetry/common/telemetry.js';
import { IAgentHostSessionsProvider, isAgentHostProvider, isRemoteSessionCreationEnvironment } from '../../../common/agentHostSessionsProvider.js';
import { areDevContainerEnvironmentsEnabled, DevContainerEnvironmentsEnabledSettingId, IDevContainerAgentHostService, IDevContainerEnvironment, LocalDevContainerEnvironmentHost } from '../../../common/devContainerAgentHostService.js';
import { ISessionsProvidersService } from '../../../browser/sessionsProvidersService.js';
import { isActiveSessionStatus, SessionStatus } from '../../../../../services/sessions/common/session.js';
import { IExtensionService } from '../../../../../services/extensions/common/extensions.js';
import { applyRemoteAgentHostLocationPreference, changeRemoteAgentHostLocationPreference, confirmRemoteHostServerUpdate, confirmTunnelDeletion, disconnectSSHEntry, getCopyableRemoteAddress, getRemoteHostUpgradeMethod, reconnectRemoteHost, removeRemoteHost, renameRemoteHost, sshConnectionKey, upgradeRemoteHost } from './remoteHostOptions.js';
import { getRemoteAgentHostPickerKey, RemoteAgentHostPickerVisibility } from './remoteAgentHostPickerVisibility.js';

export const remoteKinds = ['ssh', 'wsl', 'tunnel', 'environment', 'extension', 'devContainer'] as const;
export type RemoteKind = typeof remoteKinds[number];
const metadataKeyPrefix = 'remoteAgentHost.lastKnownMetadata.';

export interface IRemoteMetadata {
	readonly operatingSystem?: OperatingSystem;
	readonly architecture?: string;
	readonly cpuCount?: number;
	readonly memoryBytes?: number;
	readonly activeSessionCount?: number;
	/** Total non-draft sessions in the last reconciled session list. */
	readonly observedSessionCount?: number;
	readonly lastConnectedAt?: number;
	/** Most recent session update observed on this environment. */
	readonly lastActivityAt?: number;
	/** When this window last confirmed the remote was online. */
	readonly lastOnlineAt?: number;
	/** How the server identified itself on the last connection. */
	readonly server?: Implementation;
	/** The VS Code build the server advertised on the last connection, when it did. */
	readonly serverBuild?: IAgentHostBuild;
	readonly observedAt: number;
}

/**
 * Whether a remote is confirmed running right now, independent of whether this computer is connected to it.
 * - `online`: a live check in this window confirmed it is running.
 * - `offline`: discovery reported no live endpoint, or WSL isn't running or installed.
 * - `pending`: the first live check in this window hasn't finished. Later checks keep the previous result until they finish.
 * - `unknown`: it isn't or couldn't be checked, for example SSH hosts, which aren't probed, or while signed out.
 */
export type RemoteAvailability = 'online' | 'offline' | 'pending' | 'unknown';

/** Minimum time between persisted updates of {@link IRemoteMetadata.lastOnlineAt}. */
const lastOnlineWriteIntervalMs = 60_000;
const sshConfigResolveConcurrency = 8;

function readCachedServer(value: unknown): Implementation | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const { name, title, version } = value as Partial<Record<keyof Implementation, unknown>>;
	return typeof name === 'string' && name && (title === undefined || typeof title === 'string') && (version === undefined || typeof version === 'string')
		? { name, ...(title ? { title } : {}), ...(version ? { version } : {}) }
		: undefined;
}

function readCachedBuild(value: unknown): IAgentHostBuild | undefined {
	if (!isObject(value)) {
		return undefined;
	}
	const { commit, quality, date } = value as Partial<Record<keyof IAgentHostBuild, unknown>>;
	return typeof commit === 'string' && commit && typeof quality === 'string' && quality && typeof date === 'string' && !isNaN(Date.parse(date))
		? { commit, quality, date }
		: undefined;
}

export const remoteKindLabels: Record<RemoteKind, string> = {
	ssh: localize('remotes.ssh', "SSH"),
	wsl: localize('remotes.wsl', "WSL"),
	tunnel: localize('remotes.tunnels', "Dev Tunnels"),
	environment: localize('remotes.environments', "GitHub Environments"),
	extension: localize('remotes.extensions', "Extensions"),
	devContainer: localize('remotes.devContainers', "Dev Containers"),
};

export interface ICustomizationRemote {
	readonly id: string;
	readonly kind: RemoteKind;
	readonly name: string;
	readonly detail: string;
	/** The extension that registered this remote, when an extension did. */
	readonly contributedBy?: { readonly extensionId: string; readonly displayName: string };
	/** Secondary text shown after the name, such as the host of a Dev Container. */
	readonly description?: string;
	readonly canRemove: boolean;
	readonly canDelete?: boolean;
	/** A pasteable connection address; Copy Address is offered only when set. */
	readonly copyableAddress?: string;
	readonly connectionStatus: RemoteAgentHostConnectionStatus;
	readonly lastConnectionError?: string;
	readonly availability: RemoteAvailability;
	/** Explains why the remote isn't confirmed online; set whenever {@link availability} is `offline` or `unknown`. */
	readonly unavailableReason?: string;
	readonly requiresTunnelSignIn?: boolean;
	/** Connecting starts this offline remote (for example a stopped WSL distribution), so Connect stays enabled. */
	readonly startsOnConnect?: boolean;
	readonly hidden?: boolean;
	readonly pickerUnavailableReason?: string;
	readonly metadata?: IRemoteMetadata;
	readonly metadataIsStale?: boolean;
	readonly lastHeartbeatAt?: number;
	readonly reportedSessionCount?: number;
	/** Whether this remote's agent host can be shared as a GitHub environment now. */
	readonly canShareAsGitHubEnvironment?: boolean;
	/** Present while this remote's agent host is, or is being, shared as a GitHub environment. */
	readonly gitHubEnvironment?: IRemoteGitHubEnvironmentShare;
	/** Whether a Dev Container environment can be created on this connected host now. */
	readonly canCreateDevContainer?: boolean;
	/** Whether this remote connects and disconnects with its host, so it has no connect action of its own. */
	readonly connectsWithHost?: boolean;
	/** Whether this remote's server can be updated from here, either to connect again or, while connected, because a newer version is available. */
	readonly canUpdateServer?: boolean;
}

export function canConnectToRemote(remote: ICustomizationRemote): boolean {
	return RemoteAgentHostConnectionStatus.isConnected(remote.connectionStatus) || !remote.requiresTunnelSignIn && (remote.availability !== 'offline' || !!remote.startsOnConnect);
}

export type IRemoteRefreshProgress =
	| { readonly kind: RemoteKind; readonly refreshing: true }
	| { readonly kind: RemoteKind; readonly refreshing: false; readonly failed: boolean };

/** Facts for the Troubleshoot Connection page, read from local state and configuration without connecting. */
export interface IRemoteTroubleshootingInfo {
	/** The last connection step this window observed for the remote. */
	readonly lastStep?: { readonly phase: string; readonly outcome: 'started' | 'succeeded' | 'failed'; readonly timestamp: number; readonly error?: string };
	readonly ssh?: {
		/** The SSH configuration alias used to connect, if any. */
		readonly alias?: string;
		/** The saved host of a connection without an alias, which SSH configuration resolves to {@link hostName}. */
		readonly host?: string;
		readonly hostName?: string;
		readonly user?: string;
		readonly port?: number;
		readonly identityFiles?: readonly string[];
		readonly proxyCommand?: string;
		/** Whether a host key was saved for this host, which Forget Saved Host Key removes. */
		readonly hasSavedHostKey: boolean;
	};
	readonly tunnel?: {
		readonly authProvider?: 'github' | 'microsoft';
		/** Whether the most recent successful discovery listed this tunnel; undefined until discovery succeeds in this window. */
		readonly inLastDiscovery?: boolean;
		readonly hostConnectionCount?: number;
	};
	readonly extension?: { readonly version?: string; readonly issuesUrl?: string };
	readonly devContainer?: {
		/** The SSH, WSL, or tunnel host that runs the container; undefined for this computer. */
		readonly hostId?: string;
		readonly hostName: string;
		readonly hostConnected: boolean;
		/** True once a check on the connected host found Docker; otherwise unknown, because the check may be pending or unsupported. */
		readonly dockerAvailable?: true;
	};
	/** Whether Restart Distribution can stop and start this WSL distribution again. */
	readonly canRestartDistribution?: boolean;
	/** Whether this remote's connection log can be shown. */
	readonly canShowLog?: boolean;
	readonly versions?: {
		/** The server as it identified itself on the current connection, or else on the last one. */
		readonly server?: { readonly name: string; readonly version?: string; readonly build?: IAgentHostBuild; readonly current: boolean };
		readonly client: { readonly name: string; readonly version: string; readonly build?: IAgentHostBuild };
		/** Whether updating the connected server from here would install a newer build; undefined when that can't be told. */
		readonly update?: 'available' | 'upToDate' | 'otherQuality' | 'unavailable';
	};
}

export interface IRemotesModel extends IDisposable {
	readonly remotes: IObservable<readonly ICustomizationRemote[]>;
	readonly environmentsEnabled: IObservable<boolean>;
	/** Whether a Dev Container environment can be created now, on this computer or on a connected host. */
	readonly canCreateDevContainer: IObservable<boolean>;
	readonly tunnelAuthenticationRequired: IObservable<'github' | 'microsoft' | undefined>;
	signInToTunnels(): Promise<void>;
	/** Returns the kinds that failed to refresh; diagnostic details are written to the log. */
	refresh(token: CancellationToken, progress?: IProgress<IRemoteRefreshProgress>): Promise<readonly RemoteKind[]>;
	setConnected(id: string, connected: boolean): Promise<void>;
	rename(id: string): Promise<void>;
	copyAddress(id: string): Promise<void>;
	getPreferredAgentLocation(id: string): RemoteAgentHostLocationPreference | undefined;
	changePreferredAgentLocation(id: string, preference?: RemoteAgentHostLocationPreference): Promise<'saved' | 'reconnected' | undefined>;
	/** Updates the server after confirmation, rejecting with a cancellation when declined and with an error when the update fails. */
	updateServer(id: string): Promise<void>;
	setSharedAsGitHubEnvironment(id: string, shared: boolean): Promise<void>;
	deleteTunnel(id: string): Promise<void>;
	deleteSSHHost(id: string): Promise<void>;
	/**
	 * Creates a Dev Container environment on a connected SSH, WSL, or tunnel host, or on {@link LocalDevContainerEnvironmentHost}.
	 * Without a host, asks where to create it when there is more than one choice.
	 */
	createDevContainer(id?: string): Promise<void>;
	/** Deletes a Dev Container environment, including its container and files, after confirmation. */
	deleteDevContainer(id: string): Promise<void>;
	remove(id: string): Promise<void>;
	setHidden(id: string, hidden: boolean): void;
	getTroubleshootingInfo(id: string): Promise<IRemoteTroubleshootingInfo>;
	/** Fires when facts that {@link getTroubleshootingInfo} reads may have changed, such as discovery results, Docker checks, trusted host keys, or extensions. */
	readonly onDidChangeTroubleshootingInfo: Event<void>;
	/** Forgets the saved SSH host key after confirmation, so the next connection asks to verify the host again. */
	forgetSSHHostKey(id: string): Promise<void>;
	/** Stops a WSL distribution after confirmation, then connects again, which starts it with the latest available server. */
	restartWSLDistribution(id: string): Promise<void>;
	showConnectionLog(id: string): Promise<void>;
}

/**
 * The kinds of remotes to show, in display order. Extensions are listed only while
 * an extension registers a remote, since users cannot add remotes of that kind. Dev
 * Containers are listed only while one exists or one can be created.
 */
export function getVisibleRemoteKinds(operatingSystem: OperatingSystem, environmentsEnabled = false, hasExtensionRemotes = false, hasDevContainers = false): readonly RemoteKind[] {
	return [
		...(environmentsEnabled ? ['environment' as const] : []),
		'tunnel',
		...(operatingSystem === OperatingSystem.Windows ? ['wsl' as const] : []),
		'ssh',
		...(hasExtensionRemotes ? ['extension' as const] : []),
		...(hasDevContainers ? ['devContainer' as const] : []),
	];
}

type RemoteTarget =
	| { readonly kind: 'ssh'; readonly entry: IRemoteAgentHostEntry }
	| { readonly kind: 'wsl'; readonly distro: string; readonly name: string; readonly running?: boolean }
	| { readonly kind: 'tunnel'; readonly tunnel: ITunnelInfo; readonly authProvider?: 'github' | 'microsoft'; readonly source: 'discovered' | 'cached' }
	| { readonly kind: 'environment'; readonly host: IMissionControlHost; readonly account: string }
	| { readonly kind: 'extension'; readonly host: IExtensionRemoteAgentHost }
	| { readonly kind: 'devContainer'; readonly environment: IDevContainerEnvironment };

export class RemotesModel extends Disposable implements IRemotesModel {
	private readonly targets = new Map<string, RemoteTarget>();
	private readonly registered = new Set<string>();
	private readonly _remotes = observableValue<readonly ICustomizationRemote[]>(this, []);
	private readonly _onDidChangeTroubleshootingInfo = this._register(new Emitter<void>());
	readonly onDidChangeTroubleshootingInfo = this._onDidChangeTroubleshootingInfo.event;
	private troubleshootingInputs = '';
	readonly remotes = this._remotes;
	private readonly _environmentsEnabled = observableValue(this, false);
	readonly environmentsEnabled = this._environmentsEnabled;
	private readonly _canCreateDevContainer = observableValue(this, false);
	readonly canCreateDevContainer = this._canCreateDevContainer;
	private readonly _tunnelAuthenticationRequired = observableValue<'github' | 'microsoft' | undefined>(this, undefined);
	readonly tunnelAuthenticationRequired = this._tunnelAuthenticationRequired;
	private readonly pickerVisibility: RemoteAgentHostPickerVisibility;
	private remoteTunnelStatus: TunnelStatus | undefined;
	private receivedTunnelStatusEvent = false;
	private refreshVersion = 0;
	private tunnelDiscoveryVersion = 0;
	/** Account that the most recent successful tunnel discovery listed tunnels for, if any. */
	private tunnelDiscoveryAuthProvider: 'github' | 'microsoft' | undefined;
	private tunnelDiscoverySucceeded = false;
	private sshConfigAddresses: ReadonlySet<string> | undefined;
	private sshDiscoveryVersion = 0;
	private readonly observedConnections = new Map<string, boolean>();
	private readonly onlineObservations = new Map<string, number>();
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
	/** The last settled availability of each remote, shown while a later check is still running. */
	private readonly settledAvailability = new Map<string, Pick<ICustomizationRemote, 'availability' | 'unavailableReason' | 'startsOnConnect'>>();
	private readonly connectionFailures = new Map<string, string>();

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
		@IExtensionRemoteAgentHostsService private readonly extensionRemoteAgentHostsService: IExtensionRemoteAgentHostsService,
		@IDevContainerAgentHostService private readonly devContainerService: IDevContainerAgentHostService,
		@ITelemetryService private readonly telemetryService: ITelemetryService,
		@ISSHHostKeyTrustService private readonly hostKeyTrustService: ISSHHostKeyTrustService,
		@IExtensionService private readonly extensionService: IExtensionService,
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
			devContainerService.environments.read(reader);
			devContainerService.environmentHosts.read(reader);
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
		this._register(hostKeyTrustService.onDidChangeTrustedHosts(() => this._onDidChangeTroubleshootingInfo.fire()));
		this._register(extensionService.onDidChangeExtensions(() => this._onDidChangeTroubleshootingInfo.fire()));
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
		const refreshVersion = ++this.refreshVersion;
		let discoveredTunnelAuthProvider: 'github' | 'microsoft' | undefined;
		const discover = async (kind: RemoteKind, task: () => Promise<readonly RemoteTarget[]>, afterApply?: () => Promise<void>): Promise<RemoteKind | undefined> => {
			const tunnelDiscoveryVersion = this.tunnelDiscoveryVersion;
			const sshDiscoveryVersion = this.sshDiscoveryVersion;
			const isCurrent = () => refreshVersion === this.refreshVersion && !token.isCancellationRequested && !this._store.isDisposed && this.enabled
				&& (kind !== 'tunnel' || tunnelDiscoveryVersion === this.tunnelDiscoveryVersion)
				&& (kind !== 'ssh' || sshDiscoveryVersion === this.sshDiscoveryVersion);
			progress?.report({ kind, refreshing: true });
			this.checkingKinds.add(kind);
			this.update();
			let failed = false;
			try {
				const targets = await task();
				if (isCurrent()) {
					for (const [id, target] of this.targets) {
						if (target.kind === kind) {
							this.targets.delete(id);
						}
					}
					for (const target of targets) {
						this.targets.set(this.getId(target), target);
						if (target.kind === 'wsl' && target.running
							|| target.kind === 'tunnel' && target.tunnel.hostConnectionCount !== undefined && target.tunnel.hostConnectionCount > 0) {
							this.recordOnlineObservation(target);
						}
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
						if (this.environmentService.enabled && this.environmentsVerifiedAccount !== undefined) {
							for (const host of this.environmentService.hosts.get()) {
								if (host.kind === 'user-local' && host.status === 'online') {
									this.recordOnlineObservation({ kind: 'environment', host, account: this.environmentsVerifiedAccount });
								}
							}
						}
					}
					this.checkedKinds.add(kind);
					this.update();
					await afterApply?.();
				}
			} catch (error) {
				if (isCurrent() && !isCancellationError(error)) {
					if (kind === 'ssh' && !this._store.isDisposed) {
						this.sshConfigAddresses = undefined;
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
				if (refreshVersion === this.refreshVersion && !this._store.isDisposed) {
					this.checkingKinds.delete(kind);
					this.update();
				}
				progress?.report({ kind, refreshing: false, failed });
			}
			return undefined;
		};
		const errors = await Promise.all([
			discover('ssh', () => this.discoverSSHHosts(token)),
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

	private async discoverSSHHosts(token: CancellationToken): Promise<RemoteTarget[]> {
		const hosts = [...new Set(await this.sshService.listSSHConfigHosts())];
		const limiter = new Limiter<RemoteTarget>(sshConfigResolveConcurrency);
		try {
			return await Promise.all(hosts.map(host => limiter.queue(async () => {
				if (token.isCancellationRequested) {
					throw new CancellationError();
				}
				let resolved: ISSHResolvedConfig | undefined;
				try {
					resolved = await this.sshService.resolveSSHConfig(host);
				} catch (error) {
					if (isCancellationError(error)) {
						throw error;
					}
					this.logService.info(`[Remotes] Could not resolve SSH configuration for ${host}`, error);
				}
				return {
					kind: 'ssh',
					entry: {
						name: host, connection: {
							type: RemoteAgentHostEntryType.SSH, address: `ssh:${host}`, sshConfigHost: host,
							hostName: resolved?.hostname ?? host, user: resolved?.user, port: resolved?.port,
						}
					},
				};
			})));
		} finally {
			limiter.dispose();
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
				for (const target of this.targets.values()) {
					if (target.kind === 'wsl' && this.runningDistros.has(target.distro)) {
						this.recordOnlineObservation(target);
					}
				}
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
			case 'extension':
				this.extensionRemoteAgentHostsService.setDisconnected(target.host.address, false);
				break;
			case 'environment':
			case 'devContainer':
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
		const upgradeMethod = getRemoteHostUpgradeMethod(status, this.remoteAgentHostService.getConnection(id), this.productService);
		if (!upgradeMethod) {
			throw new Error(localize('remotes.updateUnavailable', "This remote does not support updating its server."));
		}
		if (!await confirmRemoteHostServerUpdate(this.dialogService, remote.name, status)) {
			throw new CancellationError();
		}
		// Callers show failures where the update was requested.
		await upgradeRemoteHost(provider, upgradeMethod, this.remoteAgentHostService, this.notificationService, this.progressService, 'throw');
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

	async createDevContainer(id?: string): Promise<void> {
		const unavailable = () => new Error(localize('remotes.devContainerUnavailable', "Dev Containers cannot be created on this remote now. Connect to it and make sure Docker is installed."));
		const hosts = this.getDevContainerHosts();
		if (!this.enabled || this._store.isDisposed || !hosts.length) {
			throw unavailable();
		}
		let hostId = id;
		if (hostId === undefined) {
			const picked = hosts.length === 1 ? hosts[0] : await this.quickInputService.pick(hosts, {
				placeHolder: localize('remotes.pickDevContainerHost', "Select where to create the Dev Container"),
			});
			if (!picked) {
				return;
			}
			hostId = picked.id;
		}
		if (this._store.isDisposed || !this.getDevContainerHosts().some(host => host.id === hostId)) {
			throw unavailable();
		}
		await this.devContainerService.createEnvironment(hostId);
	}

	/** This computer first, then the connected hosts that can run Dev Containers now. */
	private getDevContainerHosts(): (IQuickPickItem & { readonly id: string })[] {
		if (!this.canCreateDevContainer.get()) {
			return [];
		}
		const local = this.devContainerService.environmentHosts.get().has(LocalDevContainerEnvironmentHost)
			? [{ id: LocalDevContainerEnvironmentHost, label: localize('remotes.thisComputer', "This Computer") }] : [];
		return [
			...local,
			...this._remotes.get().filter(remote => remote.canCreateDevContainer).map(remote => ({ id: remote.id, label: remote.name, description: remoteKindLabels[remote.kind] })),
		];
	}

	async deleteDevContainer(id: string): Promise<void> {
		const remote = this._remotes.get().find(remote => remote.id === id);
		const target = this.targets.get(id);
		if (!this.enabled || this._store.isDisposed || remote?.kind !== 'devContainer' || target?.kind !== 'devContainer') {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		const { confirmed } = await this.dialogService.confirm({
			type: 'warning',
			message: localize('remotes.deleteDevContainerConfirmation', "Are you sure you want to delete Dev Container '{0}'?", remote.name),
			detail: target.environment.sourceAddress === LocalDevContainerEnvironmentHost
				? localize('remotes.deleteLocalDevContainerDetail', "This removes the container and its Docker volume from this computer, including all files in the container. Sessions that ran in it can no longer continue.")
				: localize('remotes.deleteDevContainerDetail', "This removes the container and its Docker volume from {0}, including all files in the container. Sessions that ran in it can no longer continue.", remote.detail),
			primaryButton: localize('remotes.deleteDevContainerButton', "&&Delete"),
		});
		if (!confirmed) {
			return;
		}
		if (this._store.isDisposed || !this.enabled) {
			throw new CancellationError();
		}
		await this.devContainerService.deleteEnvironment(id);
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
		const failureKey = this.getPickerKey(target);
		try {
			if (connected) {
				this.checkCanConnect(id);
			}
			if (target.kind === 'environment') {
				this.checkEnvironment(target);
			} else if (connected) {
				await this.registerRemote(id);
			}
			const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
			if (connected) {
				const connectionStatus = this.remoteAgentHostService.connections.find(connection => connection.address === id)?.status ?? provider?.connectionStatus?.get();
				if (RemoteAgentHostConnectionStatus.isConnected(connectionStatus)) {
					return;
				}
				// Connecting would fail until the server is updated, so Connect offers the update instead.
				if (provider && RemoteAgentHostConnectionStatus.isIncompatible(connectionStatus) && connectionStatus.vscodeUpgradeMethod) {
					const { confirmed } = await this.dialogService.confirm({
						message: localize('remotes.updateBeforeConnect', "Update the server on '{0}' to connect?", this._remotes.get().find(remote => remote.id === id)?.name ?? provider.label),
						detail: localize('remotes.updateBeforeConnectDetail', "{0}\n\nUpdating restarts the server and then connects to it.", connectionStatus.message),
						primaryButton: localize('remotes.updateAndConnect', "&&Update and Connect"),
					});
					if (!confirmed) {
						throw new CancellationError();
					}
					await upgradeRemoteHost(provider, connectionStatus.vscodeUpgradeMethod, this.remoteAgentHostService, this.notificationService, this.progressService);
					return;
				}
				this.checkCanConnect(id);
				if (provider) {
					await reconnectRemoteHost(provider, this.remoteAgentHostService);
				} else if (target.kind === 'environment') {
					await this.environmentService.connect(target.host.id, CancellationToken.None);
				} else if (target.kind === 'tunnel') {
					await this.tunnelService.connect(target.tunnel, target.authProvider, { userInitiated: true });
				} else if (target.kind === 'ssh' || target.kind === 'wsl' || target.kind === 'extension') {
					// Registration can precede the provider's scheduled reconciliation.
					this.remoteAgentHostService.reconnect(id, true);
				} else {
					throw new Error(localize('remotes.providerNotReady', "The remote provider is not ready. Try again."));
				}
				await this.remoteAgentHostService.waitForConnection(id);
				this.connectionFailures.delete(failureKey);
			} else {
				if (target.kind !== 'environment' && !await this.remoteSharing.confirmDisconnect(id, this._remotes.get().find(remote => remote.id === id)?.name ?? provider?.label ?? id)) {
					return;
				}
				if (provider?.disconnect) {
					await provider.disconnect();
				} else if (provider?.remoteAddress) {
					await this.remoteAgentHostService.removeRemoteAgentHost(provider.remoteAddress);
				} else {
					throw new Error(localize('remotes.providerNotReady', "The remote provider is not ready. Try again."));
				}
			}
		} catch (error) {
			const current = this.targets.get(id);
			if (connected && !isCancellationError(error) && !this._store.isDisposed && current && this.getPickerKey(current) === failureKey) {
				this.connectionFailures.set(failureKey, toErrorMessage(error));
				this.logService.warn(`[Remotes] Connection to ${id} failed`, error);
			}
			throw error;
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
			case 'extension': return target.host.address;
			case 'devContainer': return target.environment.address;
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

	async getTroubleshootingInfo(id: string): Promise<IRemoteTroubleshootingInfo> {
		const target = this.targets.get(id);
		if (!target || !this.enabled) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
		const lastStep = this.getLastConnectionStep(id);
		const common: IRemoteTroubleshootingInfo = {
			...(lastStep ? { lastStep } : {}), ...(provider?.showConnectionLog ? { canShowLog: true } : {}),
			versions: this.getVersions(id),
		};
		switch (target.kind) {
			case 'ssh': {
				const { info } = await this.resolveSSHHostKeyIdentity(target.entry);
				return { ...common, ssh: info };
			}
			case 'wsl':
				return { ...common, canRestartDistribution: !this.installedDistros || this.installedDistros.has(target.distro) };
			case 'tunnel': {
				// Like availability: a saved tunnel's absence from discovery only counts when discovery queried its account.
				const queried = this.tunnelDiscoverySucceeded && (target.source === 'discovered' || !target.authProvider || target.authProvider === this.tunnelDiscoveryAuthProvider);
				return {
					...common, tunnel: {
						...(target.authProvider ? { authProvider: target.authProvider } : {}),
						...(queried ? { inLastDiscovery: target.source === 'discovered' } : {}),
						// Saved tunnels have no host count of their own.
						...(target.source === 'discovered' && target.tunnel.hostConnectionCount !== undefined ? { hostConnectionCount: target.tunnel.hostConnectionCount } : {}),
					},
				};
			}
			case 'extension': {
				const extension = await this.extensionService.getExtension(target.host.extensionId);
				return { ...common, extension: { ...(extension?.version ? { version: extension.version } : {}), ...(extension?.bugs?.url ? { issuesUrl: extension.bugs.url } : {}) } };
			}
			case 'devContainer': {
				const source = target.environment.sourceAddress;
				const local = source === LocalDevContainerEnvironmentHost;
				const host = local ? undefined : this._remotes.get().find(remote => remote.id === source);
				const hostConnected = local || RemoteAgentHostConnectionStatus.isConnected(host?.connectionStatus);
				return {
					...common, devContainer: {
						...(local ? {} : { hostId: source }),
						hostName: local ? localize('remotes.thisComputer', "This Computer") : host?.name ?? this.remoteAgentHostService.getDisplayNameOverride(source) ?? source,
						hostConnected,
						// A host is missing from the Docker hosts while its check runs or when it can't host Dev Containers, not only without Docker.
						...(hostConnected && this.devContainerService.environmentHosts.get().has(source) ? { dockerAvailable: true } : {}),
					},
				};
			}
			case 'environment':
				return common;
		}
	}

	/** The server's and this client's versions, and for a connected server whether updating it from here installs a newer build. */
	private getVersions(id: string): NonNullable<IRemoteTroubleshootingInfo['versions']> {
		const remote = this._remotes.get().find(remote => remote.id === id);
		const result = RemoteAgentHostConnectionStatus.isConnected(remote?.connectionStatus) ? this.remoteAgentHostService.getConnection(id)?.initializeResult.get() : undefined;
		const server = remote?.metadata?.server;
		const serverBuild = remote?.metadata?.serverBuild;
		const { nameLong, version, commit, quality, date } = this.productService;
		const hostBuild = readAgentHostBuild(result);
		// Servers that don't identify themselves predate update offers, so their update state is unknown.
		const update = !result?.serverInfo ? undefined
			: remote?.canUpdateServer ? 'available'
				: !readAgentHostUpgradeMethod(result) ? 'unavailable'
					: !hostBuild || !commit || !date ? undefined
						: hostBuild.quality !== quality ? 'otherQuality' : 'upToDate';
		return {
			...(server ? {
				server: {
					name: server.title || server.name, ...(server.version ? { version: server.version } : {}), ...(serverBuild ? { build: serverBuild } : {}),
					current: !!result?.serverInfo,
				},
			} : {}),
			client: { name: nameLong, version, ...(commit && quality && date ? { build: { commit, quality, date } } : {}) },
			...(update ? { update } : {}),
		};
	}

	/** The last connection step the remote connection service observed, skipping informational events such as closed relays. */
	private getLastConnectionStep(id: string): IRemoteTroubleshootingInfo['lastStep'] {
		const address = normalizeRemoteAgentHostAddress(id);
		const events = this.remoteAgentHostService.getConnectionDiagnostics();
		for (let index = events.length - 1; index >= 0; index--) {
			const event = events[index];
			if (event.outcome !== 'info' && normalizeRemoteAgentHostAddress(event.address) === address) {
				return {
					phase: event.phase, outcome: event.outcome, timestamp: event.timestamp,
					...(event.error ? { error: sanitizeConnectionDiagnosticText(formatConnectionDiagnosticError(event.error)) } : {}),
				};
			}
		}
		return undefined;
	}

	/**
	 * Resolves an SSH host from local configuration like the SSH connector, which also resolves saved hosts without an alias,
	 * and the identity its host key is trusted under: `HostKeyAlias` or else the resolved host name, falling back to the
	 * resolved host name when the alias has no saved key, with the saved entry's port before the configured one.
	 */
	private async resolveSSHHostKeyIdentity(entry: IRemoteAgentHostEntry): Promise<{ readonly info: NonNullable<IRemoteTroubleshootingInfo['ssh']>; readonly trusted?: { readonly host: string; readonly port: number } }> {
		const connection = entry.connection.type === RemoteAgentHostEntryType.SSH ? entry.connection : undefined;
		const alias = connection?.sshConfigHost;
		const configHost = alias ?? connection?.hostName;
		let resolved: ISSHResolvedConfig | undefined;
		if (configHost) {
			try {
				resolved = await this.sshService.resolveSSHConfig(configHost);
			} catch (error) {
				this.logService.trace(`[Remotes] Couldn't resolve SSH configuration for ${configHost}`, error);
			}
		}
		const hostName = resolved?.hostname ?? connection?.hostName;
		const port = connection?.port ?? resolved?.port;
		// The connector uses the saved user of a connection without an alias.
		const user = alias ? resolved?.user ?? connection?.user : connection?.user ?? resolved?.user;
		const trusted = [resolved?.hostKeyAlias ?? hostName, hostName]
			.filter(isDefined)
			.map(host => ({ host, port: port ?? 22 }))
			.find(identity => this.hostKeyTrustService.getTrustedKeys(identity.host, identity.port).length > 0);
		return {
			info: {
				...(alias ? { alias } : connection?.hostName ? { host: connection.hostName } : {}),
				...(hostName ? { hostName } : {}), ...(user ? { user } : {}), ...(port !== undefined ? { port } : {}),
				...(resolved?.identityFile.length ? { identityFiles: resolved.identityFile } : {}),
				...(resolved?.proxyCommand ? { proxyCommand: resolved.proxyCommand } : {}),
				hasSavedHostKey: !!trusted,
			},
			...(trusted ? { trusted } : {}),
		};
	}

	async forgetSSHHostKey(id: string): Promise<void> {
		const target = this.targets.get(id);
		if (!target || target.kind !== 'ssh' || !this.enabled) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		const { trusted } = await this.resolveSSHHostKeyIdentity(target.entry);
		if (!trusted) {
			throw new Error(localize('remotes.noSavedHostKey', "No host key is saved for this remote."));
		}
		const keys = this.hostKeyTrustService.getTrustedKeys(trusted.host, trusted.port).map(key => `${key.keyType} ${key.fingerprint}`);
		const { confirmed } = await this.dialogService.confirm({
			type: 'warning',
			message: localize('remotes.forgetHostKeyConfirmation', "Forget the saved host key for '{0}'?", this._remotes.get().find(remote => remote.id === id)?.name ?? id),
			detail: localize('remotes.forgetHostKeyDetail', "The next time you connect, you'll be asked to verify the remote computer's host key. Only continue if you know why the key changed.\n\n{0}", keys.join('\n')),
			primaryButton: localize('remotes.forgetHostKeyButton', "&&Forget"),
		});
		if (!confirmed) {
			throw new CancellationError();
		}
		this.hostKeyTrustService.forgetHost(trusted.host, trusted.port);
	}

	async restartWSLDistribution(id: string): Promise<void> {
		const target = this.targets.get(id);
		if (!target || target.kind !== 'wsl' || !this.enabled) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		const { confirmed } = await this.dialogService.confirm({
			type: 'warning',
			message: localize('remotes.restartDistributionConfirmation', "Restart the WSL distribution '{0}'?", this._remotes.get().find(remote => remote.id === id)?.name ?? target.name),
			detail: localize('remotes.restartDistributionDetail', "This stops everything running in the distribution, including agent sessions and other programs. Then it connects again, which starts a new agent host."),
			primaryButton: localize('remotes.restartDistributionButton', "&&Restart"),
		});
		if (!confirmed) {
			throw new CancellationError();
		}
		await this.wslService.terminateDistro(target.distro);
		if (this._store.isDisposed) {
			throw new CancellationError();
		}
		await this.refreshRunningDistros();
		await this.setConnected(id, true);
	}

	async showConnectionLog(id: string): Promise<void> {
		const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
		if (!this.enabled || !provider?.showConnectionLog) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		await provider.showConnectionLog();
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
			// SSH hosts aren't probed: probing would open connections and leave entries in the server's logs.
			case 'ssh':
			case 'extension':
			case 'devContainer':
				return { availability: 'unknown' };
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
			|| value.architecture !== undefined && (typeof value.architecture !== 'string' || !value.architecture.trim())
			|| value.cpuCount !== undefined && (!Number.isSafeInteger(value.cpuCount) || typeof value.cpuCount !== 'number' || value.cpuCount <= 0)
			|| value.memoryBytes !== undefined && (!Number.isSafeInteger(value.memoryBytes) || typeof value.memoryBytes !== 'number' || value.memoryBytes <= 0)
			|| value.activeSessionCount !== undefined && (!validNumber(value.activeSessionCount) || !Number.isInteger(value.activeSessionCount))
			|| value.observedSessionCount !== undefined && (!validNumber(value.observedSessionCount) || !Number.isInteger(value.observedSessionCount))
			|| value.lastConnectedAt !== undefined && !validNumber(value.lastConnectedAt)
			|| value.lastActivityAt !== undefined && !validNumber(value.lastActivityAt)
			|| value.lastOnlineAt !== undefined && !validNumber(value.lastOnlineAt)
			|| value.server !== undefined && !readCachedServer(value.server)
			|| value.serverBuild !== undefined && !readCachedBuild(value.serverBuild)) {
			this.logService.warn('[Remotes] Invalid cached environment metadata');
			this.storageService.remove(key, StorageScope.PROFILE);
			return undefined;
		}
		const server = readCachedServer(value.server);
		const serverBuild = readCachedBuild(value.serverBuild);
		return {
			observedAt: value.observedAt,
			operatingSystem: value.operatingSystem,
			...(value.architecture !== undefined ? { architecture: value.architecture } : {}),
			...(value.cpuCount !== undefined ? { cpuCount: value.cpuCount } : {}),
			...(value.memoryBytes !== undefined ? { memoryBytes: value.memoryBytes } : {}),
			activeSessionCount: value.activeSessionCount,
			observedSessionCount: value.observedSessionCount,
			lastConnectedAt: value.lastConnectedAt,
			lastActivityAt: value.lastActivityAt,
			lastOnlineAt: value.lastOnlineAt,
			...(server ? { server } : {}),
			...(serverBuild ? { serverBuild } : {}),
		};
	}

	private recordOnlineObservation(target: RemoteTarget): void {
		this.onlineObservations.set(this.getPickerKey(target), Date.now());
	}

	private getMetadata(target: RemoteTarget, provider: IAgentHostSessionsProvider | undefined, status: RemoteAgentHostConnectionStatus, initializeResult: InitializeResult | undefined, reader?: IReader): Pick<ICustomizationRemote, 'metadata' | 'metadataIsStale'> {
		const pickerKey = this.getPickerKey(target);
		const key = `${metadataKeyPrefix}${pickerKey}`;
		const previous = this.readMetadata(key);
		const sessionListVersion = provider?.sessionListVersion?.read(reader) ?? 0;
		const live = RemoteAgentHostConnectionStatus.isConnected(status);
		const resources = live ? readAgentHostResources(provider?.getRootState()) : undefined;
		const operatingSystem = resources?.platform === 'windows' ? OperatingSystem.Windows
			: resources?.platform === 'macos' ? OperatingSystem.Macintosh
				: resources?.platform === 'linux' || target.kind === 'wsl' ? OperatingSystem.Linux : undefined;
		const sessions = live && sessionListVersion > 0 ? provider?.getSessions() : undefined;
		const justConnected = live && this.observedConnections.get(key) === false;
		this.observedConnections.set(key, live);
		const now = Date.now();
		const onlineAt = live ? now : this.onlineObservations.get(pickerKey);
		let lastActivityAt = previous?.lastActivityAt;
		for (const session of sessions ?? []) {
			const updatedAt = session.updatedAt.read(reader).getTime();
			if (Number.isFinite(updatedAt) && updatedAt >= 0 && (lastActivityAt === undefined || updatedAt > lastActivityAt)) {
				lastActivityAt = updatedAt;
			}
		}
		// Each connection replaces the server identity of the previous one, including a build it no longer advertises.
		const liveServer = live && initializeResult ? readCachedServer(initializeResult.serverInfo) : undefined;
		const server = liveServer ?? previous?.server;
		const serverBuild = liveServer ? readAgentHostBuild(initializeResult) : previous?.serverBuild;
		const next = {
			// A host's advertised path style does not identify its operating system.
			operatingSystem: operatingSystem ?? previous?.operatingSystem,
			...(resources?.architecture !== undefined || previous?.architecture !== undefined ? { architecture: resources?.architecture ?? previous?.architecture } : {}),
			...(resources?.cpuCount !== undefined || previous?.cpuCount !== undefined ? { cpuCount: resources?.cpuCount ?? previous?.cpuCount } : {}),
			...(resources?.memoryBytes !== undefined || previous?.memoryBytes !== undefined ? { memoryBytes: resources?.memoryBytes ?? previous?.memoryBytes } : {}),
			activeSessionCount: sessions?.filter(session => isActiveSessionStatus(session.status.read(reader))).length ?? previous?.activeSessionCount,
			observedSessionCount: sessions?.filter(session => session.status.read(reader) !== SessionStatus.Untitled).length ?? previous?.observedSessionCount,
			lastConnectedAt: justConnected ? now : previous?.lastConnectedAt,
			lastActivityAt,
			lastOnlineAt: onlineAt !== undefined && (previous?.lastOnlineAt === undefined || onlineAt - previous.lastOnlineAt >= lastOnlineWriteIntervalMs)
				? onlineAt : previous?.lastOnlineAt,
			...(server ? { server } : {}),
			...(serverBuild ? { serverBuild } : {}),
		};
		if (next.operatingSystem === undefined && next.architecture === undefined && next.cpuCount === undefined && next.memoryBytes === undefined && next.activeSessionCount === undefined && next.observedSessionCount === undefined && next.lastConnectedAt === undefined && next.lastActivityAt === undefined && next.lastOnlineAt === undefined && !server) {
			return {};
		}
		let metadata = previous;
		const observedChanged = !previous || previous.operatingSystem !== next.operatingSystem || previous.activeSessionCount !== next.activeSessionCount || previous.observedSessionCount !== next.observedSessionCount
			|| previous.architecture !== next.architecture || previous.cpuCount !== next.cpuCount || previous.memoryBytes !== next.memoryBytes
			|| previous.lastConnectedAt !== next.lastConnectedAt || previous.lastActivityAt !== next.lastActivityAt
			|| JSON.stringify(previous.server) !== JSON.stringify(server) || JSON.stringify(previous.serverBuild) !== JSON.stringify(serverBuild);
		if (observedChanged || previous.lastOnlineAt !== next.lastOnlineAt) {
			// A new online observation does not refresh retained system details.
			metadata = { ...next, observedAt: observedChanged ? now : previous.observedAt };
			this.storageService.store(key, metadata, StorageScope.PROFILE, StorageTarget.MACHINE);
		}
		return { metadata, metadataIsStale: !live || sessionListVersion === 0 };
	}

	private update(reader?: IReader): void {
		const sshEntries = readSSHRemoteAgentHostEntries(this.storageService);
		const distros = this.wslService.getCachedDistros();
		const tunnels = this.tunnelService.getCachedTunnels().filter(tunnel => !this.tunnelService.isTunnelDismissed(tunnel.tunnelId));
		const extensionHosts = this.extensionRemoteAgentHostsService.hosts.read(reader);
		const environments = this.environmentService.hosts.read(reader);
		const environmentsEnabled = this.enabled && this.environmentService.enabled;
		const shareable = environmentsEnabled ? this.remoteSharing.shareable.read(reader) : new Set<string>();
		const shares = environmentsEnabled ? this.remoteSharing.shares.read(reader) : new Map<string, IRemoteGitHubEnvironmentShare>();
		// Remotes this client shares as GitHub environments are already listed under their own kind.
		const sharedEnvironmentIds = environmentsEnabled ? this.remoteSharing.environmentIds.read(reader) : new Set<string>();
		const ownEnvironmentId = environmentsEnabled ? this.environmentService.ownEnvironmentId.read(reader) : undefined;
		for (const [id, target] of this.targets) {
			if (target.kind === 'environment' || target.kind === 'extension' || target.kind === 'devContainer') {
				this.targets.delete(id);
			}
		}
		const account = this.environmentService.accountKey;
		if (environmentsEnabled && account) {
			for (const host of environments) {
				if (host.kind === 'user-local' && host.id !== ownEnvironmentId && !sharedEnvironmentIds.has(host.id)) {
					const target = { kind: 'environment' as const, host, account };
					this.targets.set(this.getId(target), target);
				}
			}
		}
		// Extensions own their remotes, so users have not registered them, even when they connected them.
		for (const host of extensionHosts) {
			const target = { kind: 'extension' as const, host };
			this.targets.set(this.getId(target), target);
		}
		// Hosts are computed in every experiment arm, so the trigger below precedes any difference between the arms.
		const devContainerHosts = this.enabled ? this.devContainerService.environmentHosts.read(reader) : new Set<string>();
		const devContainersEnabled = this.enabled && areDevContainerEnvironmentsEnabled(this.configurationService);
		const localDevContainerHost = devContainerHosts.has(LocalDevContainerEnvironmentHost);
		if (localDevContainerHost) {
			// The Dev Containers section and its create action appear for this computer alone.
			logSettingExperimentTrigger(this.telemetryService, DevContainerEnvironmentsEnabledSettingId);
		}
		if (devContainersEnabled) {
			for (const environment of this.devContainerService.environments.read(reader)) {
				const target = { kind: 'devContainer' as const, environment };
				this.targets.set(this.getId(target), target);
			}
		}
		const providers = this.providersService.getProviders().filter(isAgentHostProvider);
		const providersByAddress = new Map(providers.map(provider => [provider.remoteAddress, provider]));
		const connectionStatuses = new Map(providers.map(provider => [provider.remoteAddress, provider.connectionStatus?.read(reader)]));
		const connectionErrors = new Map<string, string>();
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
			if (existing?.kind === 'ssh' && target.kind === 'ssh' && this.sshConfigAddresses?.has(id)) {
				this.targets.set(id, { ...target, entry: { ...target.entry, connection: existing.entry.connection } });
			} else if (existing?.kind !== 'tunnel' || existing.source !== 'discovered') {
				this.targets.set(id, target);
			}
			this.registered.add(id);
		}
		const remotes: ICustomizationRemote[] = [];
		for (const [id, target] of this.targets) {
			let name: string;
			let detail: string;
			let description: string | undefined;
			switch (target.kind) {
				case 'ssh':
					name = target.entry.name;
					detail = target.entry.connection.type === RemoteAgentHostEntryType.SSH
						? `${target.entry.connection.user ? `${target.entry.connection.user}@` : ''}${target.entry.connection.hostName}${target.entry.connection.port && target.entry.connection.port !== 22 ? `:${target.entry.connection.port}` : ''}` : id;
					break;
				case 'wsl':
					name = target.name;
					detail = target.distro;
					break;
				case 'tunnel':
					name = target.tunnel.name;
					detail = `${target.tunnel.tunnelId} (${target.tunnel.clusterId})`;
					break;
				case 'environment':
					name = target.host.displayName ?? target.host.name;
					detail = target.host.id;
					break;
				case 'extension':
					name = target.host.name;
					detail = target.host.address;
					break;
				case 'devContainer': {
					const sourceAddress = target.environment.sourceAddress;
					name = localize('remotes.devContainerName', "Dev Container");
					detail = sourceAddress === LocalDevContainerEnvironmentHost ? localize('remotes.thisComputer', "This Computer")
						: this.remoteAgentHostService.getDisplayNameOverride(sourceAddress) ?? providersByAddress.get(sourceAddress)?.label ?? sourceAddress;
					description = detail;
					break;
				}
			}
			const connectionStatus = connectionStatuses.get(id) ?? RemoteAgentHostConnectionStatus.disconnected;
			const failureKey = this.getPickerKey(target);
			if (RemoteAgentHostConnectionStatus.isConnected(connectionStatus)) {
				this.connectionFailures.delete(failureKey);
			}
			const lastConnectionError = connectionErrors.get(id) ?? this.connectionFailures.get(failureKey);
			const tunnelAuth = this._tunnelAuthenticationRequired.get();
			const requiresTunnelSignIn = target.kind === 'tunnel' && !!tunnelAuth && (!target.authProvider || target.authProvider === tunnelAuth)
				&& RemoteAgentHostConnectionStatus.isDisconnected(connectionStatus);
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
			const isDevContainerHost = (target.kind === 'ssh' || target.kind === 'wsl' || target.kind === 'tunnel') && devContainerHosts.has(id);
			if (isDevContainerHost) {
				logSettingExperimentTrigger(this.telemetryService, DevContainerEnvironmentsEnabledSettingId);
			}
			remotes.push({
				id, kind: target.kind, name, detail, canRemove, ...availability,
				...(requiresTunnelSignIn ? { requiresTunnelSignIn } : {}),
				...(target.kind === 'environment' ? {
					lastHeartbeatAt: target.host.lastHeartbeatAt, reportedSessionCount: target.host.reportedSessionCount,
				} : {}),
				...this.getMetadata(target, provider, connectionStatus, this.remoteAgentHostService.getConnection(id)?.initializeResult.read(reader), reader),
				...(target.kind === 'extension' ? { contributedBy: { extensionId: target.host.extensionId, displayName: target.host.extensionDisplayName } } : {}),
				...(description ? { description } : {}),
				...(isDevContainerHost && devContainersEnabled ? { canCreateDevContainer: true } : {}),
				...(target.kind === 'devContainer' ? { canDelete: true, ...(target.environment.sourceAddress !== LocalDevContainerEnvironmentHost ? { connectsWithHost: true } : {}) } : {}),
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
				...(getRemoteHostUpgradeMethod(connectionStatus, this.remoteAgentHostService.getConnection(id), this.productService, reader) ? { canUpdateServer: true } : {}),
				...(lastConnectionError ? { lastConnectionError } : {}),
			});
		}
		for (const id of this.settledAvailability.keys()) {
			if (!this.targets.has(id)) {
				this.settledAvailability.delete(id);
			}
			const failureKeys = new Set([...this.targets.values()].map(target => this.getPickerKey(target)));
			for (const key of this.connectionFailures.keys()) {
				if (!failureKeys.has(key)) {
					this.connectionFailures.delete(key);
				}
			}
		}
		const names = new Map<string, ICustomizationRemote[]>();
		const reservedNames = new Set(remotes.map(remote => remote.name.toLowerCase()));
		for (const remote of remotes) {
			const key = remote.name.trim().toLowerCase();
			const members = names.get(key) ?? [];
			members.push(remote);
			names.set(key, members);
		}
		const displayNames = new Map<string, string>();
		const usedNames = new Set<string>();
		for (const members of names.values()) {
			if (members.length < 2) {
				continue;
			}
			const multipleMethods = new Set(members.map(remote => remote.kind)).size > 1;
			for (const remote of members.sort((a, b) => a.id.localeCompare(b.id))) {
				const method = remote.kind === 'tunnel' ? localize('remotes.name.tunnel', "Dev Tunnel")
					: remote.kind === 'environment' ? localize('remotes.name.environment', "GitHub Environment") : remoteKindLabels[remote.kind];
				const base = multipleMethods ? localize('remotes.name.withMethod', "{0} ({1})", remote.name, method) : remote.name;
				let name = base;
				let suffix = 2;
				while (usedNames.has(name.toLowerCase()) || name !== remote.name && reservedNames.has(name.toLowerCase())) {
					name = localize('remotes.name.numbered', "{0} ({1})", base, suffix++);
				}
				displayNames.set(remote.id, name);
				usedNames.add(name.toLowerCase());
			}
		}
		transaction(tx => {
			this._environmentsEnabled.set(environmentsEnabled, tx);
			this._canCreateDevContainer.set(devContainersEnabled && (localDevContainerHost || remotes.some(remote => remote.canCreateDevContainer)), tx);
			this._remotes.set(remotes.map(remote => displayNames.has(remote.id) ? { ...remote, name: displayNames.get(remote.id)! } : remote)
				.sort((a, b) => remoteKinds.indexOf(a.kind) - remoteKinds.indexOf(b.kind) || a.name.localeCompare(b.name)), tx);
		});
		// Connection states of other remotes matter too, for example a Dev Container's host.
		const troubleshootingInputs = JSON.stringify([
			remotes.map(remote => [remote.id, remote.connectionStatus.kind]),
			[...devContainerHosts],
			this.tunnelDiscoverySucceeded, this.tunnelDiscoveryAuthProvider,
			[...this.targets.values()].flatMap(target => target.kind === 'tunnel' ? [[target.tunnel.tunnelId, target.source, target.tunnel.hostConnectionCount]] : []),
			this.installedDistros && [...this.installedDistros],
		]);
		if (troubleshootingInputs !== this.troubleshootingInputs) {
			this.troubleshootingInputs = troubleshootingInputs;
			this._onDidChangeTroubleshootingInfo.fire();
		}
	}
}
