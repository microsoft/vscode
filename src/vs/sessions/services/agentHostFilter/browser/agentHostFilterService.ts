/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Emitter, Event } from '../../../../base/common/event.js';
import { Disposable, DisposableStore, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { autorun } from '../../../../base/common/observable.js';
import { isWeb } from '../../../../base/common/platform.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { IRemoteAgentHostService, RemoteAgentHostConnectionStatus } from '../../../../platform/agentHost/common/remoteAgentHostService.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { isAgentHostProvider, IAgentHostGroup, IAgentHostSessionsProvider } from '../../../common/agentHostSessionsProvider.js';
import { ISessionsProvidersService } from '../../sessions/browser/sessionsProvidersService.js';
import { AgentHostFilterConnectionStatus, IAgentHostFilterEntry, IAgentHostFilterService } from '../common/agentHostFilter.js';

const STORAGE_KEY = 'sessions.agentHostFilter.selectedProviderId';

function mapStatus(s: RemoteAgentHostConnectionStatus): AgentHostFilterConnectionStatus {
	switch (s.kind) {
		case 'connected': return AgentHostFilterConnectionStatus.Connected;
		case 'connecting': return AgentHostFilterConnectionStatus.Connecting;
		case 'reconnecting': return AgentHostFilterConnectionStatus.Connecting;
		case 'disconnected':
		case 'incompatible':
		default: return AgentHostFilterConnectionStatus.Disconnected;
	}
}

/**
 * Status of a grouped entry: the most "alive" state among its members, so a
 * group with one connected sandbox reads as connected rather than averaging
 * out to disconnected.
 */
function rollupStatus(statuses: readonly AgentHostFilterConnectionStatus[]): AgentHostFilterConnectionStatus {
	if (statuses.includes(AgentHostFilterConnectionStatus.Connected)) {
		return AgentHostFilterConnectionStatus.Connected;
	}
	if (statuses.includes(AgentHostFilterConnectionStatus.Connecting)) {
		return AgentHostFilterConnectionStatus.Connecting;
	}
	return AgentHostFilterConnectionStatus.Disconnected;
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

	private readonly _onDidChangeDiscovering = this._register(new Emitter<void>());
	readonly onDidChangeDiscovering: Event<void> = this._onDidChangeDiscovering.event;

	private _selectedHostId: string | undefined;
	/**
	 * `true` while {@link _selectedHostId} comes from the fallback rather than
	 * from the user. An automatic choice is provisional and can be replaced.
	 */
	private _selectionIsAutomatic = false;
	private _hosts: readonly IAgentHostFilterEntry[] = [];

	/**
	 * Discovery handlers contributed by host providers (e.g. dev tunnels).
	 * {@link rediscover} fans out to every handler and waits for them to
	 * settle.
	 */
	private readonly _discoveryHandlers = new Set<() => Promise<void>>();
	/**
	 * Number of in-flight {@link rediscover} calls. {@link isDiscovering}
	 * is `true` while this is non-zero. Tracked as a counter so concurrent
	 * calls don't race a flag back to `false`.
	 */
	private _discoveringCount = 0;

	/**
	 * Groups declared via {@link registerHostGroup}. Each always yields an
	 * entry, whether or not any member provider exists yet.
	 */
	private readonly _declaredGroups = new Map<string, IAgentHostGroup>();

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

		this._selectedHostId = this._storageService.get(STORAGE_KEY, StorageScope.PROFILE, undefined);

		this._rewatchProviders();
		this._register(this._sessionsProvidersService.onDidChangeProviders(() => this._rewatchProviders()));
	}

	get selectedHostId(): string | undefined {
		return this._selectedHostId;
	}

	get selectedHost(): IAgentHostFilterEntry | undefined {
		if (this._selectedHostId === undefined) {
			return undefined;
		}
		return this._hosts.find(h => h.id === this._selectedHostId);
	}

	get hosts(): readonly IAgentHostFilterEntry[] {
		return this._hosts;
	}

	get isDiscovering(): boolean {
		return this._discoveringCount > 0;
	}

	async rediscover(): Promise<void> {
		if (this._discoveryHandlers.size === 0) {
			return;
		}
		this._discoveringCount++;
		if (this._discoveringCount === 1) {
			this._onDidChangeDiscovering.fire();
		}
		try {
			await Promise.allSettled(
				[...this._discoveryHandlers].map(h => h().catch(() => { /* swallowed */ }))
			);
		} finally {
			this._discoveringCount--;
			if (this._discoveringCount === 0) {
				this._onDidChangeDiscovering.fire();
			}
		}
	}

	registerDiscoveryHandler(handler: () => Promise<void>): IDisposable {
		this._discoveryHandlers.add(handler);
		return toDisposable(() => this._discoveryHandlers.delete(handler));
	}

	registerHostGroup(group: IAgentHostGroup): IDisposable {
		this._declaredGroups.set(group.id, group);
		this._rewatchProviders();
		return toDisposable(() => {
			if (this._declaredGroups.delete(group.id) && !this._providerWatchers.isDisposed) {
				this._rewatchProviders();
			}
		});
	}

	setSelectedHostId(hostId: string): void {
		if (!this._hosts.some(h => h.id === hostId)) {
			return;
		}
		// Picking the entry the fallback already landed on still makes it the
		// user's choice, so run through even when the id is unchanged.
		const changed = hostId !== this._selectedHostId;
		this._selectedHostId = hostId;
		this._selectionIsAutomatic = false;
		this._persist(hostId);
		if (changed) {
			this._onDidChange.fire();
		}
	}

	reconnect(hostId: string): void {
		const host = this._hosts.find(h => h.id === hostId);
		if (!host) {
			return;
		}
		for (const providerId of host.providerIds) {
			const provider = this._sessionsProvidersService.getProvider(providerId);
			if (provider && isAgentHostProvider(provider) && provider.connect) {
				provider.connect().catch(() => { /* errors are surfaced by the provider */ });
				continue;
			}
			// Members always carry an address; only the collapsed entry lacks one.
			const address = provider && isAgentHostProvider(provider) ? provider.remoteAddress : host.address;
			if (address) {
				this._remoteAgentHostService.reconnect(address);
			}
		}
	}

	disconnect(hostId: string): void {
		const host = this._hosts.find(h => h.id === hostId);
		if (!host) {
			return;
		}
		for (const providerId of host.providerIds) {
			const provider = this._sessionsProvidersService.getProvider(providerId);
			if (provider && isAgentHostProvider(provider) && provider.disconnect) {
				provider.disconnect().catch(() => { /* errors are surfaced by the provider */ });
			}
		}
	}

	/**
	 * Resolve a selection against the live entry list. A selection made by the
	 * fallback is provisional and is replaced once a connectable entry shows
	 * up; an explicit user choice is always kept.
	 */
	private _validate(hostId: string | undefined): { readonly id: string | undefined; readonly automatic: boolean } {
		if (this._hosts.length === 0) {
			return { id: undefined, automatic: false };
		}
		const current = hostId === undefined ? undefined : this._hosts.find(h => h.id === hostId);
		if (current && (!this._selectionIsAutomatic || current.connectable)) {
			return { id: current.id, automatic: this._selectionIsAutomatic };
		}
		const connectable = this._hosts.find(h => h.connectable);
		return { id: (connectable ?? current ?? this._hosts[0]).id, automatic: true };
	}

	/**
	 * Subscribe to the current set of remote providers so that host list
	 * updates (registration/unregistration and status changes) are surfaced
	 * via {@link onDidChange}. One `autorun` reads every provider's
	 * `connectionStatus` observable and recomputes the entry list, folding
	 * providers that declare an {@link IAgentHostGroup} into a single entry.
	 */
	private _rewatchProviders(): void {
		this._providerWatchers.clear();

		const providers = this._sessionsProvidersService.getProviders().filter(isRemoteAgentHostProvider);

		this._providerWatchers.add(autorun(reader => {
			interface IMutableEntry {
				id: string;
				providerIds: string[];
				label: string;
				grouped: boolean;
				address: string | undefined;
				icon: ThemeIcon;
				status: AgentHostFilterConnectionStatus;
				connectable: boolean;
				order: number;
			}

			const grouped = new Map<string, IMutableEntry>();
			const entries: IMutableEntry[] = [];

			const groupEntry = (group: IAgentHostGroup): IMutableEntry => {
				let entry = grouped.get(group.id);
				if (!entry) {
					// Members roll their status in below; Disconnected is the
					// identity of that rollup, so an empty group reads as such.
					entry = {
						id: group.id,
						providerIds: [],
						label: group.label,
						grouped: true,
						address: undefined,
						icon: group.icon ?? Codicon.remote,
						status: AgentHostFilterConnectionStatus.Disconnected,
						connectable: group.connectable !== false,
						order: group.order ?? 0,
					};
					grouped.set(group.id, entry);
					entries.push(entry);
				}
				return entry;
			};

			// A declared group is a place the user can scope to whether or not
			// it currently holds anything, so it gets an entry up front.
			for (const group of this._declaredGroups.values()) {
				groupEntry(group);
			}

			for (const provider of providers) {
				const status = mapStatus(provider.connectionStatus!.read(reader));
				const group = provider.hostGroup;
				if (!group) {
					entries.push({
						id: provider.id,
						providerIds: [provider.id],
						label: provider.label,
						grouped: false,
						address: provider.remoteAddress,
						icon: provider.icon,
						status,
						connectable: true,
						order: 0,
					});
					continue;
				}
				const entry = groupEntry(group);
				entry.providerIds.push(provider.id);
				entry.status = rollupStatus([entry.status, status]);
			}

			entries.sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));

			this._applyHosts(entries.map(({ order, ...entry }) => entry));
		}));
	}

	private _applyHosts(hosts: readonly IAgentHostFilterEntry[]): void {
		const changed = hosts.length !== this._hosts.length
			|| hosts.some((h, i) => h.id !== this._hosts[i].id
				|| h.label !== this._hosts[i].label
				|| h.address !== this._hosts[i].address
				|| h.status !== this._hosts[i].status
				|| h.providerIds.length !== this._hosts[i].providerIds.length
				|| h.providerIds.some((p, j) => p !== this._hosts[i].providerIds[j]));

		this._hosts = hosts;

		const validated = isWeb ? this._validate(this._selectedHostId) : { id: undefined, automatic: false };
		const selectionChanged = validated.id !== this._selectedHostId;
		if (selectionChanged) {
			this._selectedHostId = validated.id;
		}
		this._selectionIsAutomatic = validated.automatic;

		if (changed || selectionChanged) {
			this._onDidChange.fire();
		}
	}

	/**
	 * Store an explicit user choice. Automatic selections are deliberately not
	 * stored, so a restart re-runs the fallback against the hosts of the day.
	 */
	private _persist(hostId: string): void {
		this._storageService.store(STORAGE_KEY, hostId, StorageScope.PROFILE, StorageTarget.USER);
	}
}

registerSingleton(IAgentHostFilterService, AgentHostFilterService, InstantiationType.Delayed);
