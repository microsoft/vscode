/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader, observableSignalFromEvent, observableValue } from '../../../../../base/common/observable.js';
import { isWindows, OperatingSystem, OS } from '../../../../../base/common/platform.js';
import { getComparisonKey } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IDiscoveredDevContainer } from '../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { addSSHRemoteAgentHostEntry, getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, readSSHRemoteAgentHostEntries, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService } from '../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ITunnelAgentHostService, ITunnelInfo, TUNNEL_ADDRESS_PREFIX, TUNNEL_MIN_PROTOCOL_VERSION } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IWSLRemoteAgentHostService, WSL_ADDRESS_PREFIX } from '../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { DevContainerAgentHostEnabledSettingId, IDevContainerAgentHostService } from '../../../../common/devContainerAgentHostService.js';
import { isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { reconnectRemoteHost, removeRemoteHost, renameRemoteHost } from './remoteHostOptions.js';

export const remoteKinds = ['ssh', 'wsl', 'tunnel', 'devContainer'] as const;
export type RemoteKind = typeof remoteKinds[number];

export const remoteKindLabels: Record<RemoteKind, string> = {
	ssh: localize('remotes.ssh', "SSH"),
	wsl: localize('remotes.wsl', "WSL"),
	tunnel: localize('remotes.tunnels', "Tunnels"),
	devContainer: localize('remotes.devContainers', "Dev Containers"),
};

export interface ICustomizationRemote {
	readonly id: string;
	readonly kind: RemoteKind;
	readonly name: string;
	readonly detail: string;
	readonly canRemove: boolean;
	readonly connectionStatus: RemoteAgentHostConnectionStatus;
	readonly unavailableReason?: string;
}

export interface IRemotesModel extends IDisposable {
	readonly remotes: IObservable<readonly ICustomizationRemote[]>;
	/** Returns the kinds that failed to refresh; diagnostic details are written to the log. */
	refresh(token: CancellationToken): Promise<readonly RemoteKind[]>;
	setConnected(id: string, connected: boolean): Promise<void>;
	rename(id: string): Promise<void>;
	remove(id: string): Promise<void>;
}

export function getVisibleRemoteKinds(operatingSystem: OperatingSystem): readonly RemoteKind[] {
	return operatingSystem === OperatingSystem.Windows ? ['wsl', 'ssh', 'tunnel'] : ['ssh', 'tunnel'];
}

type RemoteTarget =
	| { readonly kind: 'ssh'; readonly entry: IRemoteAgentHostEntry }
	| { readonly kind: 'wsl'; readonly distro: string; readonly name: string }
	| { readonly kind: 'tunnel'; readonly tunnel: ITunnelInfo; readonly authProvider?: 'github' | 'microsoft' }
	| { readonly kind: 'devContainer'; readonly container: IDiscoveredDevContainer; readonly workspaceUri?: URI };

export class RemotesModel extends Disposable implements IRemotesModel {
	private readonly targets = new Map<string, RemoteTarget>();
	private readonly registered = new Set<string>();
	private readonly _remotes = observableValue<readonly ICustomizationRemote[]>(this, []);
	readonly remotes = this._remotes;

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
	) {
		super();
		// Lazy services can publish providers while the initial cached state is being read.
		this.update();
		this._register(tunnelService.onDidChangeTunnels(() => this.update()));
		this._register(wslService.onDidChangeConnections(() => this.update()));
		this._register(devContainerService.onDidChangeAvailability(() => this.update()));
		const providersChanged = observableSignalFromEvent(this, providersService.onDidChangeProviders);
		this._register(autorun(reader => {
			providersChanged.read(reader);
			this.update(reader);
		}));
		this._register(remoteAgentHostService.onDidChangeConnections(() => this.update()));
		this._register(remoteAgentHostService.onDidChangeDisplayName(() => this.update()));
		this._register(storageService.onDidChangeValue(StorageScope.APPLICATION, undefined, this._store)(() => this.update()));
		this._register(configurationService.onDidChangeConfiguration(() => this.update()));
	}

	private get enabled(): boolean {
		return this.configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId) === true
			&& this.configurationService.getValue<boolean>('chat.disableAIFeatures') !== true;
	}

	async refresh(token: CancellationToken): Promise<readonly RemoteKind[]> {
		if (!this.enabled || token.isCancellationRequested) {
			return [];
		}
		const discover = async (kind: RemoteKind, task: () => Promise<readonly RemoteTarget[]>): Promise<RemoteKind | undefined> => {
			try {
				const targets = await task();
				if (!token.isCancellationRequested && !this._store.isDisposed && this.enabled) {
					for (const [id, target] of this.targets) {
						if (target.kind === kind) {
							this.targets.delete(id);
						}
					}
					for (const target of targets) {
						this.targets.set(this.getId(target), target);
					}
					this.update();
				}
			} catch (error) {
				if (!token.isCancellationRequested && !isCancellationError(error)) {
					this.logService.warn(`[Remotes] ${kind} discovery failed`, error);
					return kind;
				}
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
				return (await this.tunnelService.listTunnels({ silent: true, authProvider })).map(tunnel => ({ kind: 'tunnel', tunnel, authProvider }));
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
		}
		this.update();
	}

	async rename(id: string): Promise<void> {
		const remote = this._remotes.get().find(remote => remote.id === id);
		if (!remote || !this.enabled) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
		await renameRemoteHost(provider ?? { remoteAddress: id, label: remote.name }, this.quickInputService, this.remoteAgentHostService);
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
		if (target?.kind === 'devContainer' && target.workspaceUri) {
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

	async setConnected(id: string, connected: boolean): Promise<void> {
		const target = this.targets.get(id);
		if (!target || !this.enabled) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		if (connected) {
			await this.registerRemote(id);
		}
		const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
		try {
			if (connected) {
				const connectionStatus = provider?.connectionStatus?.get() ?? this.remoteAgentHostService.connections.find(connection => connection.address === id)?.status;
				if (RemoteAgentHostConnectionStatus.isConnected(connectionStatus)) {
					return;
				}
				if (provider) {
					await reconnectRemoteHost(provider, this.remoteAgentHostService);
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

	private getId(target: RemoteTarget): string {
		switch (target.kind) {
			case 'ssh': return getEntryAddress(target.entry);
			case 'wsl': return `${WSL_ADDRESS_PREFIX}${target.distro}`;
			case 'tunnel': return `${TUNNEL_ADDRESS_PREFIX}${target.tunnel.tunnelId}`;
			case 'devContainer': return `devcontainer:${target.workspaceUri ? getComparisonKey(target.workspaceUri) : target.container.id}`;
		}
	}

	private update(reader?: IReader): void {
		const sshEntries = readSSHRemoteAgentHostEntries(this.storageService);
		const distros = this.wslService.getCachedDistros();
		const tunnels = this.tunnelService.getCachedTunnels().filter(tunnel => !this.tunnelService.isTunnelDismissed(tunnel.tunnelId));
		const workspaces = this.devContainerService.getWorkspaces();
		const providers = this.providersService.getProviders().filter(isAgentHostProvider);
		const providersByAddress = new Map(providers.map(provider => [provider.remoteAddress, provider]));
		const connectionStatuses = new Map(providers.map(provider => [provider.remoteAddress, provider.connectionStatus?.read(reader)]));
		for (const connection of this.remoteAgentHostService.connections) {
			if (!connectionStatuses.get(connection.address)) {
				connectionStatuses.set(connection.address, connection.status);
			}
		}
		const registered: RemoteTarget[] = [
			...sshEntries.map((entry): RemoteTarget => ({ kind: 'ssh', entry })),
			...distros.map((distro): RemoteTarget => ({ kind: 'wsl', ...distro })),
			...tunnels.map((tunnel): RemoteTarget => ({
				kind: 'tunnel', authProvider: tunnel.authProvider,
				tunnel: { ...tunnel, tags: [], protocolVersion: tunnel.protocolVersion ?? TUNNEL_MIN_PROTOCOL_VERSION, hostConnectionCount: 0 },
			})),
			...workspaces.map((workspace): RemoteTarget => ({ kind: 'devContainer', workspaceUri: workspace.workspaceUri, container: { id: getComparisonKey(workspace.workspaceUri), name: workspace.name } })),
		];
		this.registered.clear();
		for (const target of registered) {
			const id = this.getId(target);
			this.targets.set(id, target);
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
				case 'devContainer':
					name = target.container.name;
					detail = target.workspaceUri?.fsPath ?? target.container.id;
					unavailableReason = !this.configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId)
						? localize('remotes.devContainersDisabled', "Dev Container agent hosts are disabled.")
						: !target.workspaceUri ? localize('remotes.devContainerNoSource', "This container has no local source folder. Attaching to it is not yet supported in the Agents window.") : undefined;
					break;
			}
			const provider = providersByAddress.get(id);
			name = this.remoteAgentHostService.getDisplayNameOverride(id) ?? provider?.label ?? name;
			const canRemove = this.registered.has(id) && (target.kind === 'devContainer' || !!provider && provider.canRemove !== false);
			remotes.push({ id, kind: target.kind, name, detail, canRemove, unavailableReason, connectionStatus: connectionStatuses.get(id) ?? RemoteAgentHostConnectionStatus.disconnected });
		}
		this._remotes.set(remotes.sort((a, b) => remoteKinds.indexOf(a.kind) - remoteKinds.indexOf(b.kind) || a.name.localeCompare(b.name)), undefined);
	}
}
