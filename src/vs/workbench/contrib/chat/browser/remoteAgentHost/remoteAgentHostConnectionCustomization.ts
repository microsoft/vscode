/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from '../../../../../base/common/cancellation.js';
import { DisposableStore, IDisposable, toDisposable } from '../../../../../base/common/lifecycle.js';
import { URI } from '../../../../../base/common/uri.js';
import { IAgentConnection } from '../../../../../platform/agentHost/common/agentService.js';
import { createDecorator } from '../../../../../platform/instantiation/common/instantiation.js';
import { IAgentHostAuthenticateRequest } from '../agentSessions/agentHost/agentHostAuth.js';

/** Optional startup preparation for a selected workspace, returning a replacement host directory when needed. */
export type RemoteAgentHostSessionPreparation = (selection: URI | undefined, token: CancellationToken) => Promise<URI | undefined>;

/**
 * Per-connection behavior a specific remote-agent-host kind can inject into the otherwise
 * host-agnostic remote-agent-host contribution. Connections with no customization are unaffected.
 */
export interface IRemoteAgentHostConnectionCustomization {
	/**
	 * Transform the outgoing `authenticate` request before it is sent. Must fail closed: throw rather
	 * than forward a value that does not meet the host's contract. Omit to forward it unchanged.
	 */
	readonly authenticate?: (request: IAgentHostAuthenticateRequest) => Promise<IAgentHostAuthenticateRequest>;

	/**
	 * The backend session URI scheme for an agent provider when it differs from the provider itself.
	 * Return `undefined` to keep scheme == provider.
	 */
	readonly backendSessionScheme?: (provider: string) => string | undefined;

	/** Creates connection-scoped startup preparation, invoked only for new sessions after authentication. */
	readonly createSessionPreparation?: (connection: IAgentConnection, store: DisposableStore) => RemoteAgentHostSessionPreparation;
}

/** Builds a {@link IRemoteAgentHostConnectionCustomization} for a concrete connection address. */
export type RemoteAgentHostConnectionCustomizationFactory = (address: string) => IRemoteAgentHostConnectionCustomization;

export const IRemoteAgentHostConnectionCustomizationService = createDecorator<IRemoteAgentHostConnectionCustomizationService>('remoteAgentHostConnectionCustomizationService');

/**
 * Registry that lets a host-kind contribution (e.g. cloud sandbox) inject per-connection behavior
 * into the generic remote-agent-host contribution, keyed by an address matcher. Inversion of
 * control: the generic contribution *consults* this registry, the specific contribution *populates*
 * it — so no host-specific dependency leaks into the shared code path.
 */
export interface IRemoteAgentHostConnectionCustomizationService {
	readonly _serviceBrand: undefined;

	/**
	 * Register a customization for every connection address matched by {@link match}. The
	 * {@link factory} is invoked per address so the customization can close over address-derived
	 * state (e.g. the sandbox environment id).
	 */
	register(match: (address: string) => boolean, factory: RemoteAgentHostConnectionCustomizationFactory): IDisposable;

	/** The customization for a connection address, or `undefined` when none is registered. */
	get(address: string): IRemoteAgentHostConnectionCustomization | undefined;
}

export class RemoteAgentHostConnectionCustomizationService implements IRemoteAgentHostConnectionCustomizationService {
	declare readonly _serviceBrand: undefined;

	private readonly _entries = new Set<{ readonly match: (address: string) => boolean; readonly factory: RemoteAgentHostConnectionCustomizationFactory }>();

	register(match: (address: string) => boolean, factory: RemoteAgentHostConnectionCustomizationFactory): IDisposable {
		const entry = { match, factory };
		this._entries.add(entry);
		return toDisposable(() => this._entries.delete(entry));
	}

	get(address: string): IRemoteAgentHostConnectionCustomization | undefined {
		for (const entry of this._entries) {
			if (entry.match(address)) {
				return entry.factory(address);
			}
		}
		return undefined;
	}
}
