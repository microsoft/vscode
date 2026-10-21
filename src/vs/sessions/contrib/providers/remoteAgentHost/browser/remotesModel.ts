/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { isCancellationError } from '../../../../../base/common/errors.js';
import { Disposable, IDisposable } from '../../../../../base/common/lifecycle.js';
import { IObservable, observableValue } from '../../../../../base/common/observable.js';
import { isWindows, OperatingSystem } from '../../../../../base/common/platform.js';
import { getComparisonKey, isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { IDiscoveredDevContainer } from '../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { addSSHRemoteAgentHostEntry, getEntryAddress, IRemoteAgentHostEntry, IRemoteAgentHostService, readSSHRemoteAgentHostEntries, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { ISSHRemoteAgentHostService } from '../../../../../platform/agentHost/common/sshRemoteAgentHost.js';
import { ITunnelAgentHostService, ITunnelInfo, TUNNEL_ADDRESS_PREFIX, TUNNEL_MIN_PROTOCOL_VERSION } from '../../../../../platform/agentHost/common/tunnelAgentHost.js';
import { IWSLRemoteAgentHostService, WSL_ADDRESS_PREFIX } from '../../../../../platform/agentHost/common/wslRemoteAgentHost.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { IStorageService, StorageScope } from '../../../../../platform/storage/common/storage.js';
import { DevContainerAgentHostEnabledSettingId, IDevContainerAgentHostService } from '../../../../common/devContainerAgentHostService.js';
import { isAgentHostProvider } from '../../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { removeRemoteHost } from './remoteHostOptions.js';

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
	readonly enabled: boolean;
	readonly unavailableReason?: string;
}

export interface IRemotesModel extends IDisposable {
	readonly remotes: IObservable<readonly ICustomizationRemote[]>;
	/** Returns the kinds that failed to refresh; diagnostic details are written to the log. */
	refresh(token: CancellationToken): Promise<readonly RemoteKind[]>;
	setEnabled(id: string, enabled: boolean): Promise<void>;
}

export function getVisibleRemoteKinds(operatingSystem: OperatingSystem): readonly RemoteKind[] {
	return operatingSystem === OperatingSystem.Windows ? ['wsl', 'ssh', 'tunnel', 'devContainer'] : ['ssh', 'tunnel', 'devContainer'];
}

type RemoteTarget =
	| { readonly kind: 'ssh'; readonly entry: IRemoteAgentHostEntry }
	| { readonly kind: 'wsl'; readonly distro: string; readonly name: string }
	| { readonly kind: 'tunnel'; readonly tunnel: ITunnelInfo; readonly authProvider?: 'github' | 'microsoft' }
	| { readonly kind: 'devContainer'; readonly container: IDiscoveredDevContainer; readonly workspaceUri?: URI };

export class RemotesModel extends Disposable implements IRemotesModel {
	private readonly targets = new Map<string, RemoteTarget>();
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
	) {
		super();
		// Lazy services can publish providers while the initial cached state is being read.
		this.update();
		this._register(tunnelService.onDidChangeTunnels(() => this.update()));
		this._register(wslService.onDidChangeConnections(() => this.update()));
		this._register(devContainerService.onDidChangeAvailability(() => this.update()));
		this._register(providersService.onDidChangeProviders(() => this.update()));
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
			discover('devContainer', async () => this.configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId)
				? (await this.discoverDevContainers(token)).map(container => ({
					kind: 'devContainer',
					container,
					workspaceUri: container.workspaceFolder ? URI.file(container.workspaceFolder) : undefined,
				})) : []),
		]);
		return errors.filter((error): error is RemoteKind => error !== undefined);
	}

	async setEnabled(id: string, enabled: boolean): Promise<void> {
		const target = this.targets.get(id);
		if (!target || !this.enabled) {
			throw new Error(localize('remotes.unavailable', "This remote is no longer available."));
		}
		const row = this._remotes.get().find(remote => remote.id === id);
		if (row?.unavailableReason) {
			throw new Error(row.unavailableReason);
		}
		if (row?.enabled === enabled) {
			return;
		}
		if (!enabled) {
			if (target.kind === 'devContainer' && target.workspaceUri) {
				await this.devContainerService.removeWorkspace(target.workspaceUri);
			} else {
				const provider = this.providersService.getProviders().filter(isAgentHostProvider).find(provider => provider.remoteAddress === id);
				if (!provider) {
					throw new Error(localize('remotes.providerUnavailable', "The remote is not ready to be removed. Try again."));
				}
				await removeRemoteHost(provider, this.remoteAgentHostService, this.configurationService);
			}
		} else {
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
		}
		this.update();
	}

	private getId(target: RemoteTarget): string {
		switch (target.kind) {
			case 'ssh': return getEntryAddress(target.entry);
			case 'wsl': return `${WSL_ADDRESS_PREFIX}${target.distro}`;
			case 'tunnel': return `${TUNNEL_ADDRESS_PREFIX}${target.tunnel.tunnelId}`;
			case 'devContainer': return `devcontainer:${target.workspaceUri ? getComparisonKey(target.workspaceUri) : target.container.id}`;
		}
	}

	private update(): void {
		const sshEntries = readSSHRemoteAgentHostEntries(this.storageService);
		const distros = this.wslService.getCachedDistros();
		const tunnels = this.tunnelService.getCachedTunnels();
		const workspaces = this.devContainerService.getWorkspaces();
		const registered: RemoteTarget[] = [
			...sshEntries.map((entry): RemoteTarget => ({ kind: 'ssh', entry })),
			...distros.map((distro): RemoteTarget => ({ kind: 'wsl', ...distro })),
			...tunnels.map((tunnel): RemoteTarget => ({
				kind: 'tunnel', authProvider: tunnel.authProvider,
				tunnel: { ...tunnel, tags: [], protocolVersion: tunnel.protocolVersion ?? TUNNEL_MIN_PROTOCOL_VERSION, hostConnectionCount: 0 },
			})),
			...workspaces.map((workspace): RemoteTarget => ({ kind: 'devContainer', workspaceUri: workspace.workspaceUri, container: { id: getComparisonKey(workspace.workspaceUri), name: workspace.name } })),
		];
		for (const target of registered) {
			this.targets.set(this.getId(target), target);
		}
		const remotes: ICustomizationRemote[] = [];
		for (const [id, target] of this.targets) {
			let name: string;
			let detail: string;
			let enabled: boolean;
			let unavailableReason: string | undefined;
			switch (target.kind) {
				case 'ssh':
					name = target.entry.name;
					detail = target.entry.connection.type === RemoteAgentHostEntryType.SSH ? target.entry.connection.hostName : id;
					enabled = sshEntries.some(entry => getEntryAddress(entry) === id);
					break;
				case 'wsl':
					name = target.name;
					detail = target.distro;
					enabled = distros.some(distro => distro.distro === target.distro);
					break;
				case 'tunnel':
					name = target.tunnel.name;
					detail = target.tunnel.tunnelId;
					enabled = tunnels.some(tunnel => tunnel.tunnelId === target.tunnel.tunnelId) && !this.tunnelService.isTunnelDismissed(target.tunnel.tunnelId);
					break;
				case 'devContainer':
					name = target.container.name;
					detail = target.workspaceUri?.fsPath ?? target.container.id;
					enabled = !!target.workspaceUri && workspaces.some(workspace => isEqual(workspace.workspaceUri, target.workspaceUri));
					unavailableReason = !this.configurationService.getValue<boolean>(DevContainerAgentHostEnabledSettingId)
						? localize('remotes.devContainersDisabled', "Dev Container agent hosts are disabled.")
						: !target.workspaceUri ? localize('remotes.devContainerNoSource', "This container has no local source folder. Attaching to it is not yet supported in the Agents window.") : undefined;
					break;
			}
			remotes.push({ id, kind: target.kind, name, detail, enabled, unavailableReason });
		}
		this._remotes.set(remotes.sort((a, b) => remoteKinds.indexOf(a.kind) - remoteKinds.indexOf(b.kind) || a.name.localeCompare(b.name)), undefined);
	}
}
