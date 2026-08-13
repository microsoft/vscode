/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { AgentProvider } from '../common/agent.js';
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
 * Provider backfill is tracked durably *per provider* (see
 * {@link isProviderBackfilled} / {@link markProviderBackfilled}), so a provider
 * that registers or becomes enumerable after another provider's sweep already
 * completed still gets its own one-time sweep. Markers are written only after
 * a provider's own sweep succeeds, so a crash before that point just repeats
 * that provider's additive sweep. Concurrent callers in one host share a
 * single in-flight sweep per provider in `AgentService`; concurrently running
 * host processes are outside the supported database contract.
 *
 * The legacy global marker ({@link isBackfilled} / {@link markBackfilled}) is
 * retained only for reading databases written before per-provider tracking
 * existed. `AgentService` never writes it anymore: there is no reliable
 * in-process signal for "every provider that will ever register has now
 * registered" (provider registration is asynchronous and conditionally gated
 * outside this layer), so writing it early risks a downgrade to pre-per-provider
 * code silently skipping a provider (e.g. Codex) that only registers later.
 * `markBackfilled` remains callable for tests and any explicit migration
 * tooling, but nothing in the per-provider sweep invokes it automatically.
 *
 * Sessions removed via {@link unregister} are durably tombstoned so a forced
 * or repeated backfill sweep — which re-reads a provider's legacy chats from
 * scratch — cannot resurrect a session the user explicitly deleted. Tombstones
 * are cleared only by an explicit {@link register} of the same session URI
 * (i.e. an explicit create/restore), never by backfill itself.
 */
export class AgentSessionRegistry extends Disposable {

	constructor(private readonly _database: IAgentHostDatabase) { super(); }

	/**
	 * Record (or refresh) a session in the registry, clearing any tombstone
	 * for it. Idempotent per session URI. Reserved for genuinely *explicit*
	 * actions — a new {@link AgentService.createSession} — where reusing a
	 * previously-deleted URI is an intentional, user-driven action; see
	 * {@link registerIfNotTombstoned} for paths that revive a session found
	 * again rather than explicitly create one.
	 */
	async register(session: URI, provider: AgentProvider, startTime: number): Promise<void> {
		await this._database.registerSession(session.toString(), provider, startTime);
		await this._database.clearSessionTombstone(session.toString());
	}

	/**
	 * Registers `session` unless it is (or concurrently becomes) tombstoned,
	 * atomically — used by provider backfill and session restore, which
	 * *revive* a session the provider/database still reports rather than
	 * explicitly creating one. Unlike {@link register}, this never clears an
	 * existing tombstone: a session a user explicitly deleted stays deleted
	 * even if a repeated or forced backfill sweep, or a stale restore
	 * request (e.g. from a client re-subscribing to a now-deleted session
	 * URI), re-observes it. Returns whether the session was registered.
	 */
	async registerIfNotTombstoned(session: URI, provider: AgentProvider, startTime: number): Promise<boolean> {
		return this._database.registerSessionIfNotTombstoned(session.toString(), provider, startTime);
	}

	/** Remove a session from the registry (true delete) and tombstone it so backfill cannot resurrect it. No-op if absent. */
	async unregister(session: URI): Promise<void> {
		await this._database.tombstoneAndUnregisterSession(session.toString());
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
	 * @deprecated legacy global one-shot marker, retained for reading databases
	 * written before per-provider tracking existed; see
	 * {@link isProviderBackfilled} for the durable per-provider gate that
	 * drives backfill decisions.
	 */
	async isBackfilled(): Promise<boolean> {
		return this._database.isSessionRegistryBackfilled();
	}

	/**
	 * @deprecated legacy global one-shot marker; see {@link markProviderBackfilled}.
	 * Not invoked by the per-provider backfill sweep — see the class doc comment.
	 */
	async markBackfilled(): Promise<void> {
		await this._database.markSessionRegistryBackfilled();
	}

	/** Whether a specific provider's one-time backfill sweep has completed. */
	async isProviderBackfilled(provider: AgentProvider): Promise<boolean> {
		return this._database.isProviderBackfilled(provider);
	}

	/** Records a provider's backfill completion idempotently, after its sessions were registered. */
	async markProviderBackfilled(provider: AgentProvider): Promise<void> {
		await this._database.markProviderBackfilled(provider);
	}

	/** Whether `session` was explicitly deleted and must not be resurrected by backfill. */
	async isTombstoned(session: URI): Promise<boolean> {
		return this._database.isSessionTombstoned(session.toString());
	}

	/** Clears an explicit-deletion tombstone for `session` (used on explicit create/restore). */
	async clearTombstone(session: URI): Promise<void> {
		await this._database.clearSessionTombstone(session.toString());
	}
}
