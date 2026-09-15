/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';
import { IAgentHostGroup } from '../../../common/agentHostSessionsProvider.js';

/**
 * Connection status of a host surfaced in the host filter.
 */
export const enum AgentHostFilterConnectionStatus {
	Disconnected = 'disconnected',
	Connecting = 'connecting',
	Connected = 'connected',
}

/**
 * A single entry the user can scope the sessions list to. Usually one entry is
 * one host provider, but providers that declare an {@link IAgentHostGroup} fold
 * into one entry that scopes to all of their {@link providerIds}.
 */
export interface IAgentHostFilterEntry {
	/**
	 * Stable filter key: the {@link IAgentHostGroup.id} for a grouped entry,
	 * otherwise the {@link ISession.providerId} of the single host.
	 */
	readonly id: string;
	/**
	 * The provider ids this entry scopes the sessions list to. Exactly one
	 * for an ungrouped host; one per member for a grouped entry, which may be
	 * empty for a declared group whose members do not exist yet.
	 */
	readonly providerIds: readonly string[];
	/** Display name for the entry. */
	readonly label: string;
	/** Whether this entry collapses several providers declaring the same group. */
	readonly grouped: boolean;
	/**
	 * The raw host address (e.g. `localhost:4321`, `tunnel+abc123`), or
	 * `undefined` for a grouped entry, which has no single address.
	 */
	readonly address: string | undefined;
	/** Icon representing the entry. */
	readonly icon: ThemeIcon;
	/** Current connection status; the rollup of its members for a grouped entry. */
	readonly status: AgentHostFilterConnectionStatus;
	/**
	 * Whether the entry offers a manual connect/disconnect affordance. `false`
	 * for hosts that are connected implicitly (a cloud sandbox connects when
	 * one of its sessions is opened), where a connect button would be a
	 * control over nothing.
	 */
	readonly connectable: boolean;
}

export const IAgentHostFilterService = createDecorator<IAgentHostFilterService>('agentHostFilterService');

/**
 * Tracks the currently selected agent host used to scope the sessions list
 * and other workbench surfaces. The selection is always the {@link
 * IAgentHostFilterEntry.id} of a known entry, or `undefined` when no hosts
 * are known.
 */
export interface IAgentHostFilterService {
	readonly _serviceBrand: undefined;

	/** Fires when {@link selectedHostId} or {@link hosts} changes. */
	readonly onDidChange: Event<void>;

	/** Fires when {@link isDiscovering} changes. */
	readonly onDidChangeDiscovering: Event<void>;

	/** The currently selected entry id, or `undefined` when no hosts are known. */
	readonly selectedHostId: string | undefined;

	/**
	 * The currently selected entry, or `undefined` when nothing is selected
	 * (no hosts known, or on desktop where the filter is not surfaced). Read
	 * {@link IAgentHostFilterEntry.providerIds} to scope by provider — a
	 * grouped entry covers several.
	 */
	readonly selectedHost: IAgentHostFilterEntry | undefined;

	/** All known entries the user can switch between. */
	readonly hosts: readonly IAgentHostFilterEntry[];

	/**
	 * `true` while a host re-discovery operation is in flight (any
	 * registered discovery handler has not yet resolved). Used by the
	 * host filter UX to show a progress indicator.
	 */
	readonly isDiscovering: boolean;

	/**
	 * Update the selection. Ignored if `hostId` does not match a known
	 * entry.
	 */
	setSelectedHostId(hostId: string): void;

	/**
	 * Tear down any existing connection for the given entry and start a
	 * fresh connect attempt. No-op if the entry is unknown. A grouped entry
	 * fans out to every member.
	 */
	reconnect(hostId: string): void;

	/**
	 * Tear down the active connection for the given entry without forgetting
	 * it. No-op if the entry is unknown or already disconnected. A grouped
	 * entry fans out to every member.
	 */
	disconnect(hostId: string): void;

	/**
	 * Trigger every registered discovery handler and resolve once they
	 * have all settled. {@link isDiscovering} is `true` for the duration
	 * of the call. No-op when no handlers are registered.
	 */
	rediscover(): Promise<void>;

	/**
	 * Register a callback invoked when {@link rediscover} runs. Used by
	 * host providers (e.g. dev tunnels) to plug their own discovery
	 * routine into the shared host picker UX.
	 */
	registerDiscoveryHandler(handler: () => Promise<void>): IDisposable;

	/**
	 * Declare a host group that always has an entry, even while none of its
	 * member providers exist. Used by hosts whose members only appear once the
	 * user has sessions on them, so the place itself stays visible and
	 * selectable. Members fold into the declared entry as they register.
	 */
	registerHostGroup(group: IAgentHostGroup): IDisposable;
}
