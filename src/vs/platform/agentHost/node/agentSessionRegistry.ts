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
 * The registry drives Agent Host enumeration. Its one-time provider backfill is
 * restart-safe: individual registrations and the completion marker are
 * idempotent, and the marker is written only after the full sweep succeeds. A
 * crash or transient failure before that point simply repeats the additive
 * sweep. Concurrent callers in one host share a single in-flight sweep in
 * `AgentService`; concurrently running host processes are outside the supported
 * database contract.
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
	 * Whether the one-time provider backfill has completed. The persisted marker
	 * is independent of registry emptiness so concurrent normal registration
	 * cannot accidentally suppress migration.
	 */
	async isBackfilled(): Promise<boolean> {
		return this._database.isSessionRegistryBackfilled();
	}

	/** Records completion idempotently after every provider entry was registered. */
	async markBackfilled(): Promise<void> {
		await this._database.markSessionRegistryBackfilled();
	}
}
