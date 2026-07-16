/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Event } from '../../../../base/common/event.js';
import { IDisposable } from '../../../../base/common/lifecycle.js';
import { createDecorator } from '../../../../platform/instantiation/common/instantiation.js';

/**
 * Connection status of a host surfaced in the host filter.
 */
export const enum AgentHostFilterConnectionStatus {
	Disconnected = 'disconnected',
	Connecting = 'connecting',
	Connected = 'connected',
}

/**
 * A single host entry the user can scope the sessions list to.
 */
export interface IAgentHostFilterEntry {
	/** The {@link ISession.providerId} of the host — stable filter key. */
	readonly providerId: string;
	/** Display name for the host. */
	readonly label: string;
	/** The raw host address (e.g. `localhost:4321`, `tunnel+abc123`). */
	readonly address: string;
	/** Current connection status for this host. */
	readonly status: AgentHostFilterConnectionStatus;
}

export const IAgentHostFilterService = createDecorator<IAgentHostFilterService>('agentHostFilterService');

/**
 * Tracks the currently selected agent host used to scope the sessions list
 * and other workbench surfaces. The selection is always a valid
 * {@link ISession.providerId} of a known host, or `undefined` when no
 * hosts are known.
 */
export interface IAgentHostFilterService {
	readonly _serviceBrand: undefined;

	/** Fires when {@link selectedProviderId} or {@link hosts} changes. */
	readonly onDidChange: Event<void>;

	/** Fires when {@link isDiscovering} changes. */
	readonly onDidChangeDiscovering: Event<void>;

	/** The currently selected providerId, or `undefined` when no hosts are known. */
	readonly selectedProviderId: string | undefined;

	/** All known hosts the user can switch between. */
	readonly hosts: readonly IAgentHostFilterEntry[];

	/**
	 * `true` while a host re-discovery operation is in flight (any
	 * registered discovery handler has not yet resolved). Used by the
	 * host filter UX to show a progress indicator.
	 */
	readonly isDiscovering: boolean;

	/**
	 * Update the selection. Ignored if `providerId` does not match a
	 * known host.
	 */
	setSelectedProviderId(providerId: string): void;

	/**
	 * Tear down any existing connection for the given host and start a
	 * fresh connect attempt. No-op if the host is unknown.
	 */
	reconnect(providerId: string): void;

	/**
	 * Tear down the active connection for the given host without forgetting
	 * the entry. No-op if the host is unknown or already disconnected.
	 */
	disconnect(providerId: string): void;

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
}
