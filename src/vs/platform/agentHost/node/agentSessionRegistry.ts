/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Limiter } from '../../../base/common/async.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { AgentProvider } from '../common/agent.js';
import { AgentSessionRegistrationSource, IAgentHostDatabase, IAgentHostDatabaseExternalUpdate, IAgentHostDatabaseRegisterOptions, IAgentHostDatabaseSessionsV2Exclusion, IAgentHostDatabaseSessionOptions } from './agentHostDatabase.js';

/** A session recorded in the orchestrator-owned {@link AgentSessionRegistry}. */
export interface IRegisteredSession {
	readonly session: URI;
	readonly provider: AgentProvider;
	/** Session creation time (ms since epoch) as first observed by the orchestrator. */
	readonly startTime: number;
	/** Most recent provider modification time observed by the orchestrator. */
	readonly modifiedTime: number;
	/** Whether the session was first discovered from the provider's native catalog. */
	readonly external: boolean;
	/** Durable registration source used to protect external provenance. */
	readonly source: AgentSessionRegistrationSource;
}

export interface IStoredRegisteredSession extends Omit<IRegisteredSession, 'external'> {
	readonly external: boolean | undefined;
}

export type RegisteredSessionMigration = (entry: IStoredRegisteredSession) => Promise<IRegisteredSession | undefined>;

/**
 * A durable, orchestrator-owned index of the sessions that exist, keyed by
 * session URI. Unlike the agents' `listSessions()` (which enumerates their own
 * SDK sessions/threads and maps them to session URIs via invariant I3), this
 * registry is authoritative on the AH side and does not depend on the agent
 * exposing a session whose SDK id equals the session id.
 *
 * Provider backfill markers are retained for compatibility/diagnostics.
 * AgentService starts native discovery at provider registration and reruns it
 * only when a provider reports a catalog/readiness change. Concurrent callers
 * in one host share a single in-flight pass per provider; concurrently running
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
 * Sessions passed to {@link tombstone} are durably tombstoned so a forced
 * or repeated native discovery pass — which re-reads a provider's catalog from
 * scratch — cannot register them. This covers both a session the user
 * explicitly deleted and one that must never be listed at all (e.g. a
 * throwaway chat surface, tombstoned at creation). Tombstones are cleared only
 * by an explicit {@link register} of the same session URI (i.e. an explicit
 * create/restore), never by backfill itself.
 */
export class AgentSessionRegistry extends Disposable {

	constructor(private readonly _database: IAgentHostDatabase) {
		super();
	}

	/** Records a session using source-aware provenance and tombstone behavior. */
	register(session: URI, sessionOptions: IAgentHostDatabaseSessionOptions, registerOptions: IAgentHostDatabaseRegisterOptions): Promise<boolean> {
		return this._database.registerRuntimeSession(session.toString(), sessionOptions, registerOptions);
	}

	/** Removes any registry entry for `session` without writing a tombstone. */
	async unregister(session: URI): Promise<void> {
		await this._database.unregisterRuntimeSession(session.toString());
	}

	/**
	 * Removes any registry entry for `session` (a true delete) and durably
	 * tombstones it so discovery cannot register it. Used both to delete a
	 * session the user explicitly removed and to keep a session that must never
	 * be listed (e.g. a throwaway chat surface) out of the registry entirely.
	 * No-op on the registry entry if absent; the tombstone is still written.
	 */
	async tombstone(session: URI): Promise<void> {
		await this._database.tombstoneAndUnregisterSession(session.toString());
	}

	/** Advances the durable last-observed provider modification time. */
	updateModifiedTime(session: URI, modifiedTime: number): Promise<boolean> {
		return this._database.updateSessionModifiedTime(session.toString(), modifiedTime);
	}

	/** Every registered session URI key without running legacy metadata migration. */
	async listSessionKeys(): Promise<ReadonlySet<string>> {
		return new Set((await this._database.listSessionV2Registrations()).map(entry => entry.session));
	}

	/** Current and legacy identity keys used only to deduplicate cooling-period discovery. */
	async listRuntimeCompatibleSessionKeys(): Promise<ReadonlySet<string>> {
		return new Set(await this._database.listRuntimeCompatibleSessionKeys());
	}

	/**
	 * Every current registry identity, in no particular order. Entries with
	 * unresolved provenance are passed through `migrate`, when provided.
	 */
	async list(migrate?: RegisteredSessionMigration): Promise<IRegisteredSession[]> {
		const entries: IStoredRegisteredSession[] = (await this._database.listSessionV2Registrations()).map(entry => ({
			session: URI.parse(entry.session),
			provider: entry.provider,
			startTime: entry.startTime,
			modifiedTime: entry.modifiedTime,
			external: entry.external,
			source: entry.source,
		}));
		const limiter = new Limiter<IRegisteredSession | undefined>(4);
		const migrations: readonly (IRegisteredSession | undefined)[] = migrate
			? await Promise.all(entries.map(entry => limiter.queue(() => migrate(entry))))
			: entries.map(() => undefined);
		const updates: IAgentHostDatabaseExternalUpdate[] = [];
		const result = entries.map((entry, index): IRegisteredSession => {
			const migrated = migrations[index];
			if (migrated) {
				updates.push({
					session: migrated.session.toString(),
					external: migrated.external,
				});
				return migrated;
			}
			if (entry.external === undefined) {
				throw new Error(`Session migration did not resolve registry entry ${entry.session.toString()}`);
			}
			return {
				...entry,
				external: entry.external,
			};
		});
		if (updates.length > 0) {
			await this._database.updateRuntimeSessionExternal(updates);
		}
		return result;
	}

	/** Returns the session registered under `session`, or `undefined` when it is unknown. */
	async get(session: URI, migrate?: RegisteredSessionMigration): Promise<IRegisteredSession | undefined> {
		const stored = await this._database.getSessionV2Registration(session.toString());
		if (!stored) {
			return undefined;
		}
		const entry: IStoredRegisteredSession = {
			session: URI.parse(stored.session),
			provider: stored.provider,
			startTime: stored.startTime,
			modifiedTime: stored.modifiedTime,
			external: stored.external,
			source: stored.source,
		};
		const migrated = await migrate?.(entry);
		if (migrated) {
			await this._database.updateRuntimeSessionExternal([{ session: migrated.session.toString(), external: migrated.external }]);
			return migrated;
		}
		if (entry.external === undefined) {
			throw new Error(`Session migration did not resolve registry entry ${entry.session.toString()}`);
		}
		return {
			...entry,
			external: entry.external,
		};
	}

	/** Whether the registry has ever been populated. Retained for compatibility. */
	async isEmpty(): Promise<boolean> {
		return this._database.isSessionV2RegistryEmpty();
	}

	/**
	 * @deprecated legacy global one-shot marker, retained for reading databases
	 * written before per-provider tracking existed; see
	 * {@link isProviderBackfilled} for per-provider discovery diagnostics.
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

	/** Whether a specific provider has completed native discovery at least once. */
	async isProviderBackfilled(provider: AgentProvider): Promise<boolean> {
		return this._database.isProviderBackfilled(provider);
	}

	/** Records a provider-native discovery pass idempotently. */
	async markProviderBackfilled(provider: AgentProvider): Promise<void> {
		await this._database.markProviderBackfilled(provider);
	}

	/** Whether a provider completed the current registry projection backfill. */
	async isSessionsV2Backfilled(provider: AgentProvider, projectionVersion: number): Promise<boolean> {
		return this._database.isSessionsV2Backfilled(provider, projectionVersion);
	}

	/** Records completion of a provider's current registry projection backfill. */
	async markSessionsV2Backfilled(provider: AgentProvider, projectionVersion: number): Promise<void> {
		await this._database.markSessionsV2Backfilled(provider, projectionVersion);
	}

	/** Durably excludes a non-deleted session from the current v2 catalog. */
	async markSessionsV2Excluded(exclusion: IAgentHostDatabaseSessionsV2Exclusion): Promise<void> {
		await this._database.markSessionsV2Excluded(exclusion);
	}

	async markSessionsV2ExcludedBatch(exclusions: readonly IAgentHostDatabaseSessionsV2Exclusion[]): Promise<void> {
		if (this._database.markSessionsV2ExcludedBatch) {
			await this._database.markSessionsV2ExcludedBatch(exclusions);
		} else {
			await Promise.all(exclusions.map(exclusion => this._database.markSessionsV2Excluded(exclusion)));
		}
	}

	/** Reads a durable current-v2 exclusion for one session. */
	getSessionsV2Exclusion(provider: AgentProvider, session: URI): Promise<IAgentHostDatabaseSessionsV2Exclusion | undefined> {
		return this._database.getSessionsV2Exclusion(provider, session.toString());
	}

	/** Lists durable current-v2 exclusions for one provider. */
	listSessionsV2Exclusions(provider: AgentProvider): Promise<readonly IAgentHostDatabaseSessionsV2Exclusion[]> {
		return this._database.listSessionsV2Exclusions(provider);
	}

	/** Clears a durable current-v2 exclusion when the session becomes eligible. */
	async clearSessionsV2Exclusion(provider: AgentProvider, session: URI): Promise<void> {
		await this._database.clearSessionsV2Exclusion(provider, session.toString());
	}

	/** Whether `session` was explicitly deleted and must not be resurrected by backfill. */
	async isTombstoned(session: URI): Promise<boolean> {
		return this._database.isSessionTombstoned(session.toString());
	}

	/** Clears an explicit-deletion tombstone for `session` (used on explicit create/restore). */
	async clearTombstone(session: URI): Promise<void> {
		await this._database.clearSessionTombstone(session.toString());
	}

	/** Maintains the host-owned index of Agent-Merge-enabled sessions. */
	async setAgentMergeEnabled(session: URI, enabled: boolean): Promise<void> {
		await this._database.setSessionAgentMergeEnabled(session.toString(), enabled);
	}

	/** Session URIs the index marks Agent-Merge-enabled, without opening any session database. */
	async listAgentMergeEnabled(): Promise<readonly URI[]> {
		const sessions = await this._database.listAgentMergeEnabledSessions();
		return sessions.map(session => URI.parse(session));
	}
}
