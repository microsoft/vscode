/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Throttler } from '../../../../../../base/common/async.js';
import { Emitter } from '../../../../../../base/common/event.js';
import { Disposable } from '../../../../../../base/common/lifecycle.js';
import { Schemas } from '../../../../../../base/common/network.js';
import { getComparisonKey } from '../../../../../../base/common/resources.js';
import { URI } from '../../../../../../base/common/uri.js';
import { supportsAgentHostDevContainerFolderContainers } from '../../../../../../platform/agentHost/common/agentHostExtensionProtocol.js';
import { agentHostAuthority, toAgentHostUri } from '../../../../../../platform/agentHost/common/agentHostUri.js';
import { IAgentConnection } from '../../../../../../platform/agentHost/common/agentService.js';
import type { IDevContainerHostFolderContainer } from '../../../../../../platform/agentHost/common/devContainerAgentHost.js';
import { getEntryAddress, IRemoteAgentHostService, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId } from '../../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { DevContainerAgentHostEnabledSettingId, DevContainerDiscoveryEnabledSettingId, IDevContainerAgentHostConnector, isDevContainerDiscoveryEnabled, LocalDevContainerEnvironmentHost } from '../../../common/devContainerAgentHostService.js';

/** A folder's Dev Container found on this computer or on a connected SSH, Tunnel, or WSL host. */
export interface IDiscoveredDevContainerFolder {
	/** The source folder: a `file` URI on this computer, or the folder of the host's Agent Host connection. */
	readonly workspaceUri: URI;
	/** Address of the host, or {@link LocalDevContainerEnvironmentHost}. */
	readonly sourceAddress: string;
	readonly running: boolean;
}

interface IHostListing {
	/** The host's connection, so a new connection lists the host again; undefined for this computer. */
	readonly connection: IAgentConnection | undefined;
	/** The folders the last listing found, undefined until one succeeds or after one failed. */
	folders: readonly IDiscoveredDevContainerFolder[] | undefined;
	/** Increments with every listing, so only the latest one applies. */
	version: number;
}

/**
 * Lists the folder Dev Containers on this computer and on connected SSH, Tunnel, and WSL hosts whose Agent Host supports
 * it, while {@link isDevContainerDiscoveryEnabled}. A host is listed as it connects and on {@link refresh}; this computer on
 * {@link refresh}.
 */
export class DevContainerFolderDiscovery extends Disposable {
	private readonly _hosts = new Map<string, IHostListing>();
	private _folders: ReadonlyMap<string, IDiscoveredDevContainerFolder> = new Map();
	private _listedHosts: ReadonlySet<string> = new Set();
	private readonly _onDidChange = this._register(new Emitter<void>());
	/** Fires when {@link folders} or {@link listedHosts} changed. */
	readonly onDidChange = this._onDidChange.event;
	private readonly _refreshes = this._register(new Throttler());

	constructor(
		private readonly _currentConnector: () => IDevContainerAgentHostConnector | undefined,
		private readonly _remoteAgentHostService: IRemoteAgentHostService,
		private readonly _configurationService: IConfigurationService,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(this._remoteAgentHostService.onDidChangeConnections(() => this._reconcileHosts()));
		this._register(this._remoteAgentHostService.onDidChangeConfiguredEntries(() => this._reconcileHosts()));
		this._register(this._configurationService.onDidChangeConfiguration(e => {
			if ([DevContainerDiscoveryEnabledSettingId, DevContainerAgentHostEnabledSettingId, RemoteAgentHostsEnabledSettingId, 'chat.disableAIFeatures'].some(key => e.affectsConfiguration(key))) {
				void this.refresh();
			}
		}));
	}

	/** The listed folders by the comparison key of their URI. */
	get folders(): ReadonlyMap<string, IDiscoveredDevContainerFolder> {
		return this._folders;
	}

	/** Hosts, including {@link LocalDevContainerEnvironmentHost}, whose last listing succeeded, so their unlisted folders have no container. */
	get listedHosts(): ReadonlySet<string> {
		return this._listedHosts;
	}

	/** Lists this computer and every connected host again. Concurrent calls share the next listing. */
	refresh(): Promise<void> {
		return this._refreshes.queue(async () => {
			if (!this._reconcileHosts(false)) {
				return;
			}
			await Promise.all([
				this._list(LocalDevContainerEnvironmentHost, undefined),
				...[...this._connectedHosts()].map(([address, connection]) => this._list(address, connection)),
			]);
		});
	}

	/** Forgets hosts that disconnected and, unless `listConnected` is false, lists those that connected. Returns whether discovery is enabled. */
	private _reconcileHosts(listConnected = true): boolean {
		if (!isDevContainerDiscoveryEnabled(this._configurationService)) {
			if (this._hosts.size) {
				this._hosts.clear();
				this._publish();
			}
			return false;
		}
		const connected = this._connectedHosts();
		let changed = false;
		for (const [address, listing] of this._hosts) {
			if (address !== LocalDevContainerEnvironmentHost && connected.get(address) !== listing.connection) {
				this._hosts.delete(address);
				changed = true;
			}
		}
		if (changed) {
			this._publish();
		}
		if (listConnected) {
			for (const [address, connection] of connected) {
				if (!this._hosts.has(address)) {
					void this._list(address, connection);
				}
			}
		}
		return true;
	}

	private _connectedHosts(): Map<string, IAgentConnection> {
		const hosts = new Map<string, IAgentConnection>();
		for (const entry of this._remoteAgentHostService.configuredEntries) {
			if (entry.connection.type !== RemoteAgentHostEntryType.SSH && entry.connection.type !== RemoteAgentHostEntryType.Tunnel && entry.connection.type !== RemoteAgentHostEntryType.WSL) {
				continue;
			}
			const address = getEntryAddress(entry);
			const connection = this._remoteAgentHostService.getConnection(address);
			if (connection?.devContainerService?.listFolderContainers && supportsAgentHostDevContainerFolderContainers(connection.initializeResult.get())) {
				hosts.set(address, connection);
			}
		}
		return hosts;
	}

	private async _list(address: string, connection: IAgentConnection | undefined): Promise<void> {
		const request = connection ? connection.devContainerService?.listFolderContainers?.() : this._currentConnector()?.listLocalFolderContainers?.();
		if (!request) {
			return;
		}
		let listing = this._hosts.get(address);
		if (!listing || listing.connection !== connection) {
			listing = { connection, folders: undefined, version: 0 };
			this._hosts.set(address, listing);
		}
		const current = listing;
		const version = ++current.version;
		const isCurrent = () => !this._store.isDisposed && this._hosts.get(address) === current && current.version === version;
		let containers: readonly IDevContainerHostFolderContainer[];
		try {
			containers = await request;
		} catch (error) {
			if (isCurrent()) {
				this._logService.warn(`[DevContainerFolderDiscovery] Failed to list the folder Dev Containers on ${address}`, error);
				current.folders = undefined;
				this._publish();
			}
			return;
		}
		if (!isCurrent()) {
			return;
		}
		current.folders = containers.flatMap(container => {
			const folder = URI.parse(container.folder);
			if (folder.scheme !== Schemas.file) {
				return [];
			}
			// eslint-disable-next-line local/code-agent-host-uri-mapping -- names a host folder as its connection's provider does, before connecting its container
			const workspaceUri = connection ? toAgentHostUri(folder, agentHostAuthority(address)) : folder;
			return [{ workspaceUri, sourceAddress: address, running: container.running }];
		});
		this._publish();
	}

	private _publish(): void {
		const folders = new Map<string, IDiscoveredDevContainerFolder>();
		const listedHosts = new Set<string>();
		for (const [address, listing] of this._hosts) {
			if (listing.folders) {
				listedHosts.add(address);
				for (const folder of listing.folders) {
					folders.set(getComparisonKey(folder.workspaceUri), folder);
				}
			}
		}
		this._folders = folders;
		this._listedHosts = listedHosts;
		this._onDidChange.fire();
	}
}
