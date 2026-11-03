/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { CancellationError, isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader, observableSignalFromEvent, observableValue, transaction } from '../../../../../base/common/observable.js';
import { isWindows, OperatingSystem, OS } from '../../../../../base/common/platform.js';
import { getComparisonKey } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IDiscoveredDevContainer } from '../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { cloudSandboxAddress } from '../../../../../platform/agentHost/common/cloudSandboxAgentHost.js';
import { IMissionControlAvailabilityService, IMissionControlEnvironmentService, IMissionControlHost } from '../../../../../platform/agentHost/common/missionControlEnvironment.js';
import { addSSHRemoteAgentHostEntry, getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, IRemoteAgentHostSSHConnection, readSSHRemoteAgentHostEntries, removeSSHRemoteAgentHostEntry, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { computeSSHConnectionKey, ISSHRemoteAgentHostService } from '../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { isTunnelHosted, ITunnelAgentHostService, ITunnelInfo, TUNNEL_ADDRESS_PREFIX, TUNNEL_MIN_PROTOCOL_VERSION, TunnelAuthenticationRequiredError } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IWSLRemoteAgentHostService, WSL_ADDRESS_PREFIX } from '../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IRemoteAgentHostLocationPreferenceService } from '../../../../../platform/agentHost/common/remoteAgentHostLocationPreference.js';
import { IClipboardService } from '../../../../../platform/clipboard/common/clipboardService.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IProductService } from '../../../../../platform/product/common/productService.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IProgress, IProgressService } from '../../../../../platform/progress/common/progress.js';
import { IRemoteTunnelService, TunnelStatus } from '../../../../../platform/remoteTunnel/common/remoteTunnel.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { DevContainerAgentHostEnabledSettingId, IDevContainerAgentHostService } from '../../../../common/devContainerAgentHostService.js';
import { IAgentHostSessionsProvider, isAgentHostProvider, isRemoteSessionCreationEnvironment } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { changeRemoteAgentHostLocationPreference, confirmTunnelDeletion, disconnectSSHEntry, reconnectRemoteHost, removeRemoteHost, renameRemoteHost, sshConnectionKey, upgradeRemoteHost } from './remoteHostOptions.js';
import { getRemoteAgentHostPickerKey, RemoteAgentHostPickerVisibility } from './remoteAgentHostPickerVisibility.js';

export const remoteKinds = ['ssh', 'wsl', 'tunnel', 'environment', 'devContainer'] as const;
export type RemoteKind = typeof remoteKinds[number];

export const remoteKindLabels: Record<RemoteKind, string> = {
	ssh: localize('remotes.ssh', "SSH"),
	wsl: localize('remotes.wsl', "WSL"),
	tunnel: localize('remotes.tunnels', "Dev Tunnels"),
	environment: localize('remotes.environments', "GitHub Environments"),
	devContainer: localize('remotes.devContainers', "Dev Containers"),
};

export interface ICustomizationRemote {
	readonly id: string;
	readonly kind: RemoteKind;
	readonly name: string;
	readonly detail: string;
	readonly canRemove: boolean;
	readonly canDelete?: boolean;
	readonly connectionStatus: RemoteAgentHostConnectionStatus;
	readonly lastConnectionError?: string;
	readonly unavailableReason?: string;
	readonly hidden?: boolean;
	readonly pickerUnavailableReason?: string;
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
	changePreferredAgentLocation(id: string): Promise<void>;
	updateServer(id: string): Promise<void>;
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
	| { readonly kind: 'wsl'; readonly distro: string; readonly name: string }
	| { readonly kind: 'tunnel'; readonly tunnel: ITunnelInfo; readonly authProvider?: 'github' | 'microsoft'; readonly source: 'discovered' | 'cached' }
	| { readonly kind: 'environment'; readonly host: IMissionControlHost; readonly account: string }
	| { readonly kind: 'devContainer'; readonly container: IDiscoveredDevContainer; readonly workspaceUri?: URI };

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
	private sshConfigAddresses: ReadonlySet<string> | undefined;
	private sshDiscoveryVersion = 0;

	constructor(
		private readonly discoverDevContainers: (token: CancellationToken) => Promise<readonly IDiscoveredDevContainer[]>,
		@ISSHRemoteAgentHostService private readonly sshService: ISSHRemoteAgentHostService,
		@IWSLRemoteAgentHostService private readonly wslService: IWSLRemoteAgentHostService,
		@ITunnelAgentHostService private readonly tunnelService: ITunnelAgentHostService,
		@IDevContainerAgentHostService private readonly devContainerService: IDevContainerAgentHostService,
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
	) {
		super();
		this.pickerVisibility = this._register(new RemoteAgentHostPickerVisibility(storageService));
		// Lazy services can publish providers while the initial cached state is being read.
		this.update();
		this._register(tunnelService.onDidChangeTunnels(() => this.update()));
		this._register(wslService.onDidChangeConnections(() => this.update()));
		this._register(devContainerService.onDidChangeAvailability(() => this.update()));
		const providersChanged = observableSignalFromEvent(this, providersService.onDidChangeProviders);
		this._register(autorun(reader => {
			providersChanged.read(reader);
			environmentAvailabilityService.available.read(reader);
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
		const discover = async (kind: RemoteKind, task: () => Promise<readonly RemoteTarget[]>): Promise<RemoteKind | undefined> => {
			const tunnelDiscoveryVersion = this.tunnelDiscoveryVersion;
			const sshDiscoveryVersion = this.sshDiscoveryVersion;
			progress?.report({ kind, refreshing: true });
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
					if (kind === 'tunnel') {
						this._tunnelAuthenticationRequired.set(undefined, undefined);
					}
					this.update();
				}
			} catch (error) {
				if (!token.isCancellationRequested && !isCancellationError(error)) {
					if (kind === 'ssh' && !this._store.isDisposed) {
						this.sshConfigAddresses = undefined;
						this.update();
					}
					if (kind === 'tunnel' && !this._store.isDisposed && this.enabled) {
						this._tunnelAuthenticationRequired.set(error instanceof TunnelAuthenticationRequiredError ? error.authProvider : undefined, undefined);
					}
					this.logService.warn(`[Remotes] ${kind} discovery failed`, error);
					failed = true;
					return kind;
				}
			} finally {
				progress?.report({ kind, refreshing: false, failed });
			}
			return undefined;
		};
		const errors = await Promise.all([
			discover('ssh', async () => (await this.sshService.listSSHConfigHosts()).map(host => ({
				kind: 'ssh',
				entry: { name: host, connection: { type: RemoteAgentHostEntryType.SSH, address: `ssh:${host}`, hostName: host, sshConfigHost: host } },
			}))),
			discover('wsl', async () => isWindows ? (await this.wslService.listDistros()).map(distro => ({ kind: 'wsl', distro: distro.name, name: distro.name })) : []),
			discover('tunnel', async () => {
				const authProvider = await this.tunnelService.getAuthProvider({ silent: true });
				return (await this.tunnelService.listTunnels({ silent: true, authProvider })).map(tunnel => ({ kind: 'tunnel', tunnel, authProvider, source: 'discovered' }));
			}),
			discover('environment', async () => {
				if (this.environmentService.enabled) {
					await this.environmentService.refresh(token);
				}
				return [];
			}),
			discover('devContainer', async () => getVisibleRemoteKinds(OS).includes('devContainer') && this.configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId)
				? (await this.discoverDevContainers(token)).map(container => ({
					kind: 'devContainer',
					container,
					workspaceUri: container.workspaceFolder ? URI.file(container.workspaceFolder) : undefined,
				})) : []),
		]);
		return errors.filter((error): error is RemoteKind => error !== undefined);
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
		const row = this._remotes.get().find(remote => remote.id === id);
		if (row?.unavailableReason) {
			throw new Error(row.unavailableReason);
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
			case 'devContainer':
				if (target.workspaceUri) {
					this.devContainerService.addWorkspace(target.workspaceUri, target.container.name);
				}
				break;
			case 'environment':
				break;
		}
		this.update();
	}

	async copyAddress(id: string): Promise<void> {
		if (!this.enabled || this._store.isDisposed || !this.targets.has(id)) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		await this.clipboardService.writeText(id);
	}

	async changePreferredAgentLocation(id: string): Promise<void> {
		const remote = this._remotes.get().find(remote => remote.id === id);
		if (!this.enabled || this._store.isDisposed || !remote) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		const target = this.targets.get(id);
		if (target?.kind !== 'tunnel' && target?.kind !== 'ssh') {
			throw new Error(localize('remotes.locationUnavailable', "Preferred agent location can only be changed for SSH hosts and tunnels here."));
		}
		const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
		await changeRemoteAgentHostLocationPreference({
			preferenceKey: provider?.remoteLocationPreferenceKey ?? this.getLocationPreferenceKey(target),
			hostLabel: remote.name,
			productName: this.productService.nameShort,
			provider,
			dialogService: this.dialogService,
			locationPreferenceService: this.locationPreferenceService,
			notificationService: this.notificationService,
			remoteAgentHostService: this.remoteAgentHostService,
			progressService: this.progressService,
		});
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
				message: localize('remotes.deleteEnvironmentConfirmation', "Are you sure you want to delete environment '{0}'?", remote.name),
				detail: localize('remotes.deleteEnvironmentDetail', "This removes the environment registration and disconnects this client. Files on the machine will not be deleted. The environment may reappear if its owning application registers it again."),
				primaryButton: localize('remotes.deleteEnvironmentButton', "&&Delete"),
			});
			if (!confirmed) {
				return;
			}
			if (this._store.isDisposed || !this.enabled) {
				throw new CancellationError();
			}
			this.checkEnvironment(target);
			await this.environmentService.delete(target.host.id, CancellationToken.None);
			return;
		} else if (target?.kind === 'devContainer' && target.workspaceUri) {
			await this.devContainerService.removeWorkspace(target.workspaceUri);
		} else {
			const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
			if (!provider) {
				throw new Error(localize('remotes.providerUnavailable', "The remote is not ready to be removed. Try again."));
			}
			await removeRemoteHost(provider, this.remoteAgentHostService, this.configurationService);
		}
		this.targets.delete(id);
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
		await this.tunnelService.deleteTunnel(current.tunnel, current.authProvider);
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
			message: localize('remotes.deleteSSHConfirmation', "Are you sure you want to delete saved SSH connection '{0}'?", remote?.name ?? id),
			detail: localize('remotes.deleteSSHDetail', "This forgets the saved connection and disconnects this client. Your SSH configuration and files on the remote machine will not be deleted."),
			primaryButton: localize('remotes.deleteSSHButton', "&&Delete"),
		});
		if (!confirmed) {
			return;
		}
		const current = await this.checkSSHHostDeletion(id);
		if (sshConnectionKey(current) !== sshConnectionKey(connection)) {
			throw new CancellationError();
		}
		removeSSHRemoteAgentHostEntry(this.storageService, id);
		this.sshDiscoveryVersion++;
		try {
			await disconnectSSHEntry(current, this.remoteAgentHostService, this.sshService);
		} finally {
			this.targets.delete(id);
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
			throw new Error(localize('remotes.tunnelDeleteUnsupported', "Deleting tunnels is not supported by this application."));
		}
		if (!this.remoteTunnelStatus) {
			throw new Error(localize('remotes.tunnelStatusUnavailable', "Tunnel hosting status is not available yet. Try again."));
		}
		if (isTunnelHosted(this.remoteTunnelStatus.type === 'connected' ? this.remoteTunnelStatus.info : undefined, tunnel)) {
			throw new Error(localize('remotes.tunnelDeleteHosted', "This application is currently hosting this tunnel. Stop hosting it before deleting it."));
		}
	}

	async setConnected(id: string, connected: boolean): Promise<void> {
		const target = this.targets.get(id);
		if (!target || !this.enabled) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		if (target.kind === 'environment') {
			this.checkEnvironment(target);
		} else if (connected) {
			await this.registerRemote(id);
		}
		const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
		try {
			if (connected) {
				const connectionStatus = provider?.connectionStatus?.get() ?? this.remoteAgentHostService.connections.find(connection => connection.address === id)?.status;
				if (RemoteAgentHostConnectionStatus.isConnected(connectionStatus)) {
					return;
				}
				const unavailableReason = this._remotes.get().find(remote => remote.id === id)?.unavailableReason;
				if (unavailableReason) {
					throw new Error(unavailableReason);
				}
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
			case 'devContainer': return `devcontainer:${target.workspaceUri ? getComparisonKey(target.workspaceUri) : target.container.id}`;
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
		const reason = this.getPickerUnavailableReason(target, provider, this.pickerVisibility.isHidden(key));
		if (reason) {
			throw new Error(reason);
		}
		this.pickerVisibility.setHidden(key, hidden);
	}

	private getPickerUnavailableReason(target: RemoteTarget, provider: IAgentHostSessionsProvider | undefined, hidden: boolean, reader?: IReader): string | undefined {
		if (target.kind === 'environment' && target.host.status !== 'online') {
			return localize('remotes.pickerOffline', "Available in the picker when the owning application is online.");
		}
		if (!provider) {
			return target.kind !== 'environment' && !this.registered.has(this.getId(target))
				? localize('remotes.pickerConnectFirst', "Connect once to add this remote to the picker.")
				: localize('remotes.pickerNotReady', "This remote is not ready for the picker. Try refreshing.");
		}
		if (!isRemoteSessionCreationEnvironment(provider)) {
			return localize('remotes.pickerUnsupported', "This remote does not support a separate entry in the Environment picker.");
		}
		if (provider.isAvailableInEnvironmentPicker?.read(reader) === false || !hidden && provider.isVisibleInEnvironmentPicker?.read(reader) === false) {
			return localize('remotes.pickerUnavailable', "This remote is currently unavailable in the picker.");
		}
		return undefined;
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

	private update(reader?: IReader): void {
		const sshEntries = readSSHRemoteAgentHostEntries(this.storageService);
		const distros = this.wslService.getCachedDistros();
		const tunnels = this.tunnelService.getCachedTunnels().filter(tunnel => !this.tunnelService.isTunnelDismissed(tunnel.tunnelId));
		const workspaces = this.devContainerService.getWorkspaces();
		const environments = this.environmentService.hosts.read(reader);
		const environmentsEnabled = this.enabled && this.environmentService.enabled;
		for (const [id, target] of this.targets) {
			if (target.kind === 'environment') {
				this.targets.delete(id);
			}
		}
		const account = this.environmentService.accountKey;
		if (environmentsEnabled && account) {
			for (const host of environments) {
				if (host.kind === 'user-local') {
					const target = { kind: 'environment' as const, host, account };
					this.targets.set(this.getId(target), target);
				}
			}
		}
		const providers = this.providersService.getProviders().filter(isAgentHostProvider);
		const providersByAddress = new Map(providers.map(provider => [provider.remoteAddress, provider]));
		const connectionStatuses = new Map(providers.map(provider => [provider.remoteAddress, provider.connectionStatus?.read(reader)]));
		const connectionErrors = new Map<string, string>();
		for (const connection of this.remoteAgentHostService.connections) {
			if (!connectionStatuses.get(connection.address)) {
				connectionStatuses.set(connection.address, connection.status);
			}
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
			...workspaces.map((workspace): RemoteTarget => ({ kind: 'devContainer', workspaceUri: workspace.workspaceUri, container: { id: getComparisonKey(workspace.workspaceUri), name: workspace.name } })),
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
			let unavailableReason: string | undefined;
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
					unavailableReason = target.host.status !== 'online'
						? localize('remotes.environmentOffline', "This environment is not online. Start its owning application before connecting.") : undefined;
					break;
				case 'devContainer':
					name = target.container.name;
					detail = target.workspaceUri?.fsPath ?? target.container.id;
					unavailableReason = !this.configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId)
						? localize('remotes.devContainersDisabled', "Dev Container agent hosts are disabled.")
						: !target.workspaceUri ? localize('remotes.devContainerNoSource', "This container has no local source folder. Attaching to it is not yet supported in the Agents window.") : undefined;
					break;
			}
			const provider = providersByAddress.get(id);
			if (target.kind !== 'environment') {
				name = this.remoteAgentHostService.getDisplayNameOverride(id) ?? (target.kind === 'tunnel' ? name : provider?.label ?? name);
			}
			const canRemove = target.kind === 'environment' || this.registered.has(id) && (target.kind === 'devContainer' || !!provider && provider.canRemove !== false);
			const hidden = this.pickerVisibility.isHidden(this.getPickerKey(target), reader);
			remotes.push({
				id, kind: target.kind, name, detail, canRemove, unavailableReason,
				...(target.kind === 'tunnel' ? {
					canDelete: this.tunnelService.canDeleteTunnels && !!this.remoteTunnelStatus
						&& !isTunnelHosted(this.remoteTunnelStatus.type === 'connected' ? this.remoteTunnelStatus.info : undefined, target.tunnel),
				} : {}),
				...(target.kind === 'ssh' ? {
					canDelete: this.registered.has(id) && target.entry.connection.type === RemoteAgentHostEntryType.SSH && !this.isSSHHostConfigured(target.entry.connection),
				} : {}),
				hidden, pickerUnavailableReason: this.getPickerUnavailableReason(target, provider, hidden, reader),
				connectionStatus: connectionStatuses.get(id) ?? RemoteAgentHostConnectionStatus.disconnected,
				...(connectionErrors.has(id) ? { lastConnectionError: connectionErrors.get(id) } : {}),
			});
		}
		transaction(tx => {
			this._environmentsEnabled.set(environmentsEnabled, tx);
			this._remotes.set(remotes.sort((a, b) => remoteKinds.indexOf(a.kind) - remoteKinds.indexOf(b.kind) || a.name.localeCompare(b.name)), tx);
		});
	}
}
