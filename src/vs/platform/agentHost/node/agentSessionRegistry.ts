/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { AgentProvider } from '../common/agentService.js';
import { IAgentHostDatabase } from './agentHostDatabase.js';

/** A session recorded in the orchestrator-owned {@link AgentSessionRegistry}. */
export interface IRegisteredSession {
	readonly session: URI;
	readonly provider: AgentProvider;
	/** Session creation time (ms since epoch) as first observed by the orchestrator. */
	readonly startTime: number;
}

/**
 * A durable, orchestrator-owned index of the sessions that exist, keyed by
 * session URI. Unlike the agents' `listSessions()` (which enumerates their own
 * SDK sessions/threads and maps them to session URIs via invariant I3), this
 * registry is authoritative on the AH side and does not depend on the agent
 * exposing a session whose SDK id equals the session id.
 *
 * Stage 1 (this component) is purely additive: it is populated alongside the
 * existing create/delete paths and validated against the live `listSessions`
 * output, but does NOT yet drive enumeration.
 */
export class AgentSessionRegistry extends Disposable {

	constructor(private readonly _database: IAgentHostDatabase) { super(); }

	/** Record (or refresh) a session in the registry. Idempotent per session URI. */
	async register(session: URI, provider: AgentProvider, startTime: number): Promise<void> {
		await this._database.registerSession(session.toString(), provider, startTime);
	}

	/** Remove a session from the registry (true delete). No-op if absent. */
	async unregister(session: URI): Promise<void> {
		await this._database.unregisterSession(session.toString());
	}

	/** Every session currently recorded, in no particular order. */
	async list(): Promise<IRegisteredSession[]> {
		return (await this._database.listSessions()).map(entry => ({
			session: URI.parse(entry.session),
			provider: entry.provider,
			startTime: entry.startTime,
		}));
	}

	/** Whether the registry has ever been populated (used to gate one-time backfill). */
	async isEmpty(): Promise<boolean> {
		return this._database.isSessionRegistryEmpty();
	}

	/**
	 * Whether the one-time provider backfill has completed for this host. Gated
	 * by a persisted marker rather than emptiness so a registry that a
	 * `createSession` has already populated is still backfilled from the legacy
	 * provider enumeration exactly once.
	 */
	async isBackfilled(): Promise<boolean> {
		return this._database.isSessionRegistryBackfilled();
	}

	/** Records that the one-time provider backfill has completed. */
	async markBackfilled(): Promise<void> {
		await this._database.markSessionRegistryBackfilled();
	}
}
