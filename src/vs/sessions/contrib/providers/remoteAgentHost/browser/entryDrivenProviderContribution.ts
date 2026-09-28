/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { type Event } from '../../../../../base/common/event.js';
import { Disposable, DisposableMap, DisposableStore, toDisposable } from '../../../../../base/common/lifecycle.js';
import { type IRemoteAgentHostEntry, IRemoteAgentHostService, RemoteAgentHostConnectionStatus, RemoteAgentHostEntryType, RemoteAgentHostsEnabledSettingId, getEntryAddress } from '../../../../../platform/agentHost/common/remoteAgentHostService.js';
import { type IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { type IInstantiationService } from '../../../../../platform/instantiation/common/instantiation.js';
import { type INotificationService } from '../../../../../platform/notification/common/notification.js';
import { type IAgentHostAutoConnect, type IAgentHostConnectProgress } from '../../../../common/agentHostSessionsProvider.js';
import { type ISessionsProvidersService } from '../../../../services/sessions/browser/sessionsProvidersService.js';
import { RemoteAgentHostSessionsProvider } from './remoteAgentHostSessionsProvider.js';
import { watchForIncompatibleNotifications } from './remoteHostOptions.js';

/** Options supplied by a remote-host kind when creating its sessions provider. */
export interface IEntryDrivenProviderOptions {
	readonly connectOnDemand?: () => Promise<void>;
	readonly disconnectOnDemand?: () => Promise<void>;
	readonly onDidReportConnectProgress?: Event<IAgentHostConnectProgress>;
	readonly autoConnect?: IAgentHostAutoConnect;
	readonly initialStatus?: RemoteAgentHostConnectionStatus;
	readonly preferenceKey?: string;
}

/**
 * Shared provider ownership for remote-host kinds whose providers correspond
 * directly to remote-host entries. Subclasses own their entry discovery and
 * on-demand connection behavior; this class owns only provider lifecycle.
 */
export abstract class EntryDrivenProviderContribution extends Disposable {

	protected readonly _providerStores = this._register(new DisposableMap<string, DisposableStore>());
	protected readonly _providerInstances = new Map<string, RemoteAgentHostSessionsProvider>();
	private readonly _wiredAddresses = new Set<string>();

	constructor(
		protected readonly _remoteAgentHostService: IRemoteAgentHostService,
		protected readonly _configurationService: IConfigurationService,
		protected readonly _instantiationService: IInstantiationService,
		protected readonly _sessionsProvidersService: ISessionsProvidersService,
		protected readonly _notificationService: INotificationService,
	) {
		super();
	}

	protected get _enabled(): boolean {
		return this._configurationService.getValue<boolean>(RemoteAgentHostsEnabledSettingId);
	}

	/** The entry kind this contribution owns when discovering configured entries. */
	protected abstract readonly _entryType: RemoteAgentHostEntryType;

	/** Supplies all entries owned by this contribution. */
	protected _getProviderEntries(): readonly IRemoteAgentHostEntry[] {
		if (!this._enabled) {
			return [];
		}
		return this._remoteAgentHostService.configuredEntries.filter(entry => entry.connection.type === this._entryType);
	}

	/** Supplies kind-specific on-demand behavior for an entry's provider. */
	protected abstract _getProviderOptions(entry: IRemoteAgentHostEntry): IEntryDrivenProviderOptions;

	protected _reconcile(): void {
		this._reconcileProviders();
		this._wireConnections();
		this._updateConnectionStatuses();
	}

	protected _reconcileProviders(): void {
		const entries = this._getProviderEntries();
		const desiredAddresses = new Set(entries.map(entry => getEntryAddress(entry)));

		for (const [address] of this._providerStores) {
			if (!desiredAddresses.has(address)) {
				this._providerStores.deleteAndDispose(address);
			}
		}

		for (const entry of entries) {
			const address = getEntryAddress(entry);
			const existing = this._providerInstances.get(address);
			if (existing && existing.label !== (entry.name || address)) {
				this._providerStores.deleteAndDispose(address);
			}
			if (!this._providerStores.has(address)) {
				this._createProvider(address, entry.name, this._getProviderOptions(entry));
			}
		}
	}

	protected _createProvider(address: string, name: string, options: IEntryDrivenProviderOptions): RemoteAgentHostSessionsProvider {
		const store = new DisposableStore();
		const provider = this._instantiationService.createInstance(
			RemoteAgentHostSessionsProvider, {
			address,
			name,
			connectOnDemand: options.connectOnDemand,
			disconnectOnDemand: options.disconnectOnDemand,
			onDidReportConnectProgress: options.onDidReportConnectProgress,
			autoConnect: options.autoConnect,
			preferenceKey: options.preferenceKey,
		});
		if (options.initialStatus !== undefined) {
			provider.setConnectionStatus(options.initialStatus);
		}
		store.add(provider);
		store.add(this._sessionsProvidersService.registerProvider(provider));
		store.add(watchForIncompatibleNotifications(provider, this._instantiationService, this._notificationService));
		this._providerInstances.set(address, provider);
		store.add(toDisposable(() => {
			this._providerInstances.delete(address);
			this._wiredAddresses.delete(address);
		}));
		this._providerStores.set(address, store);
		return provider;
	}

	private _wireConnections(): void {
		for (const [address, provider] of this._providerInstances) {
			const connectionInfo = this._remoteAgentHostService.connections.find(connection => connection.address === address);
			if (connectionInfo && RemoteAgentHostConnectionStatus.isConnected(connectionInfo.status)) {
				const connection = this._remoteAgentHostService.getConnection(address);
				if (connection) {
					provider.setConnection(connection, connectionInfo.defaultDirectory);
					this._wiredAddresses.add(address);
				}
			} else if (this._wiredAddresses.delete(address)) {
				provider.clearConnection();
			}
		}
	}

	private _updateConnectionStatuses(): void {
		for (const [address, provider] of this._providerInstances) {
			const connectionInfo = this._remoteAgentHostService.connections.find(connection => connection.address === address);
			if (connectionInfo) {
				provider.setConnectionStatus(connectionInfo.status);
			}
		}
	}
}
