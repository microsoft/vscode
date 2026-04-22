/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isWeb } from '../../../../base/common/platform.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { isAgentHostProvider, IAgentHostSessionsProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../../services/sessions/browser/sessionsProvidersService.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry, IAgentHostFilterService } from '../common/agentHostFilter.js';

const STORAGE_KEY = 'sessions.agentHostFilter.selectedProviderId';

function mapStatus(s: RemoteAgentHostConnectionStatus): AgentHostFilterConnectionStatus {
	switch (s) {
		case RemoteAgentHostConnectionStatus.Connected: return AgentHostFilterConnectionStatus.Connected;
		case RemoteAgentHostConnectionStatus.Connecting: return AgentHostFilterConnectionStatus.Connecting;
		case RemoteAgentHostConnectionStatus.Disconnected:
		default: return AgentHostFilterConnectionStatus.Disconnected;
	}
}

/**
 * Returns `true` if the given provider is a remote agent host provider that
 * exposes a connection status and a remote address — i.e. the providers that
 * the host filter combo is responsible for surfacing.
 */
function isRemoteAgentHostProvider(provider: unknown): provider is IAgentHostSessionsProvider & { readonly remoteAddress: string } {
	if (!provider || typeof provider !== 'object' || !('id' in provider)) {
		return false;
	}
	const p = provider as IAgentHostSessionsProvider;
	return isAgentHostProvider(p) && p.connectionStatus !== undefined && typeof p.remoteAddress === 'string';
}

export class AgentHostFilterService extends Disposable implements IAgentHostFilterService {

	declare readonly _serviceBrand: undefined;

	private readonly _onDidChange = this._register(new Emitter<void>());
	readonly onDidChange: Event<void> = this._onDidChange.event;

	private _selectedProviderId: string | undefined;
	private _hosts: readonly IAgentHostFilterEntry[] = [];

	/**
	 * Subscriptions to the `connectionStatus` observable of every currently
	 * registered remote provider. Rebuilt whenever the set of providers
	 * changes so we always observe the live set.
	 */
	private readonly _providerWatchers = this._register(new DisposableStore());

	constructor(
		@ISessionsProvidersService private readonly _sessionsProvidersService: ISessionsProvidersService,
		@IRemoteAgentHostService private readonly _remoteAgentHostService: IRemoteAgentHostService,
		@IStorageService private readonly _storageService: IStorageService,
	) {
		super();

		this._selectedProviderId = this._storageService.get(STORAGE_KEY, StorageScope.PROFILE, undefined);

		this._rewatchProviders();
		this._register(this._sessionsProvidersService.onDidChangeProviders(() => this._rewatchProviders()));
	}

	get selectedProviderId(): string | undefined {
		return this._selectedProviderId;
	}

	get hosts(): readonly IAgentHostFilterEntry[] {
		return this._hosts;
	}

	setSelectedProviderId(providerId: string): void {
		if (!this._hosts.some(h => h.providerId === providerId)) {
			return;
		}
		if (providerId === this._selectedProviderId) {
			return;
		}
		this._selectedProviderId = providerId;
		this._persist();
		this._onDidChange.fire();
	}

	reconnect(providerId: string): void {
		const provider = this._sessionsProvidersService.getProvider(providerId);
		if (provider && isAgentHostProvider(provider) && provider.connect) {
			provider.connect().catch(() => { /* errors are surfaced by the provider */ });
			return;
		}
		const host = this._hosts.find(h => h.providerId === providerId);
		if (!host) {
			return;
		}
		this._remoteAgentHostService.reconnect(host.address);
	}

	disconnect(providerId: string): void {
		const provider = this._sessionsProvidersService.getProvider(providerId);
		if (provider && isAgentHostProvider(provider) && provider.disconnect) {
			provider.disconnect().catch(() => { /* errors are surfaced by the provider */ });
		}
	}

	private _validate(providerId: string | undefined): string | undefined {
		if (providerId !== undefined && this._hosts.some(h => h.providerId === providerId)) {
			return providerId;
		}
		return this._hosts.length > 0 ? this._hosts[0].providerId : undefined;
	}

	/**
	 * Subscribe to the current set of remote providers so that host list
	 * updates (registration/unregistration and status changes) are surfaced
	 * via {@link onDidChange}. One `autorun` reads every provider's
	 * `connectionStatus` observable and recomputes the host list.
	 */
	private _rewatchProviders(): void {
		this._providerWatchers.clear();

		const providers = this._sessionsProvidersService.getProviders().filter(isRemoteAgentHostProvider);

		this._providerWatchers.add(autorun(reader => {
			const hosts: IAgentHostFilterEntry[] = providers.map(provider => ({
				providerId: provider.id,
				label: provider.label,
				address: provider.remoteAddress,
				status: mapStatus(provider.connectionStatus!.read(reader)),
			})).sort((a, b) => a.label.localeCompare(b.label));

			this._applyHosts(hosts);
		}));
	}

	private _applyHosts(hosts: readonly IAgentHostFilterEntry[]): void {
		const changed = hosts.length !== this._hosts.length
			|| hosts.some((h, i) => h.providerId !== this._hosts[i].providerId
				|| h.label !== this._hosts[i].label
				|| h.address !== this._hosts[i].address
				|| h.status !== this._hosts[i].status);

		this._hosts = hosts;

		const validated = isWeb ? this._validate(this._selectedProviderId) : undefined;
		const selectionChanged = validated !== this._selectedProviderId;
		if (selectionChanged) {
			this._selectedProviderId = validated;
			this._persist();
		}

		if (changed || selectionChanged) {
			this._onDidChange.fire();
		}
	}

	private _persist(): void {
		if (this._selectedProviderId === undefined) {
			this._storageService.remove(STORAGE_KEY, StorageScope.PROFILE);
		} else {
			this._storageService.store(STORAGE_KEY, this._selectedProviderId, StorageScope.PROFILE, StorageTarget.USER);
		}
	}
}

registerSingleton(IAgentHostFilterService, AgentHostFilterService, InstantiationType.Delayed);
