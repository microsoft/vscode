/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { type SessionActiveClient } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';

/**
 * Snapshot the active-client info this client would dispatch via
 * `session/activeClientChanged` for a session it owns. Recomputed on
 * every read so the caller sees the latest customizations / tools.
 */
export type AgentHostActiveClientSnapshot = () => SessionActiveClient;

export const IAgentHostActiveClientRegistry = createDecorator<IAgentHostActiveClientRegistry>('agentHostActiveClientRegistry');

/**
 * Workbench-scoped registry that exposes each
 * {@link AgentHostSessionHandler}'s active-client snapshot — clientId,
 * client-side tools, customizations — to the sessions provider that
 * eagerly creates backend sessions on the new-chat view.
 *
 * The provider's `NewSession.eagerCreate` reads the snapshot here and
 * passes it to `connection.createSession`'s `activeClient` parameter,
 * letting the agent host establish the active client at the moment of
 * creation. Without this bridge, the handler would have to re-dispatch
 * `session/activeClientChanged` for every provisional session it
 * discovers post-hoc — which both adds plumbing and leaves a window
 * where the host has no active client for sessions the user is
 * actively configuring.
 *
 * Keyed by chat `sessionType` (the same identifier the chat sessions
 * service uses to route to a content provider). One registration per
 * session type at a time; the contribution that owns the handler also
 * owns the registration.
 */
export interface IAgentHostActiveClientRegistry {
	readonly _serviceBrand: undefined;

	/**
	 * Registers a snapshot getter for `sessionType`. Replaces any prior
	 * registration. Returns a disposable that removes the registration
	 * if it's still the current one for `sessionType`.
	 */
	register(sessionType: string, snapshot: AgentHostActiveClientSnapshot): IDisposable;

	/**
	 * Returns the active-client snapshot for `sessionType`, or
	 * `undefined` if no handler has registered one (e.g. the agent host
	 * isn't connected for this session type, or the contribution
	 * unregistered).
	 */
	get(sessionType: string): SessionActiveClient | undefined;
}

/** Exported for tests. Production code MUST use {@link IAgentHostActiveClientRegistry}. */
export class AgentHostActiveClientRegistry extends Disposable implements IAgentHostActiveClientRegistry {
	declare readonly _serviceBrand: undefined;

	private readonly _snapshots = new Map<string, AgentHostActiveClientSnapshot>();

	register(sessionType: string, snapshot: AgentHostActiveClientSnapshot): IDisposable {
		this._snapshots.set(sessionType, snapshot);
		return toDisposable(() => {
			if (this._snapshots.get(sessionType) === snapshot) {
				this._snapshots.delete(sessionType);
			}
		});
	}

	get(sessionType: string): SessionActiveClient | undefined {
		return this._snapshots.get(sessionType)?.();
	}
}

registerSingleton(IAgentHostActiveClientRegistry, AgentHostActiveClientRegistry, InstantiationType.Delayed);
