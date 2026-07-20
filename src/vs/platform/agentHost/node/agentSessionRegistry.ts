/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IReference, toDisposable } from '../../../base/common/lifecycle.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { AgentProvider } from '../common/agentService.js';
import { ISessionDatabase, ISessionDataService } from '../common/sessionDataService.js';

/** A session recorded in the orchestrator-owned {@link AgentSessionRegistry}. */
export interface IRegisteredSession {
	readonly session: URI;
	readonly provider: AgentProvider;
	/** Session creation time (ms since epoch) as first observed by the orchestrator. */
	readonly startTime: number;
}

interface IPersistedRegistryEntry {
	readonly provider: AgentProvider;
	readonly startTime: number;
}

/** The persisted registry blob. */
interface IPersistedRegistry {
	readonly version: 1;
	/** Whether the one-time provider backfill has run for this host. */
	readonly backfilled: boolean;
	readonly sessions: Record<string, IPersistedRegistryEntry>;
}

/**
 * The reserved URI whose per-session database backs the registry index. Its
 * scheme (`agent-host-registry`) cannot collide with a real session URI, which
 * always carries a provider scheme (`copilot`/`claude`/`codex`/`copilotcli`).
 */
const REGISTRY_URI = URI.from({ scheme: 'agent-host-registry', path: '/sessions' });
const REGISTRY_METADATA_KEY = 'sessionRegistry';

/**
 * A durable, orchestrator-owned index of the sessions that exist, keyed by
 * session URI. Unlike the agents' `listSessions()` (which enumerates their own
 * SDK sessions/threads and maps them to session URIs via invariant I3), this
 * registry is authoritative on the AH side and does not depend on the agent
 * exposing a session whose SDK id equals the session id.
 *
 * Persisted as a single JSON blob in a reserved session database, with
 * serialized read-modify-write (mirroring the peer-chat catalog) so concurrent
 * register/unregister calls never clobber each other.
 *
 * Stage 1 (this component) is purely additive: it is populated alongside the
 * existing create/delete paths and validated against the live `listSessions`
 * output, but does NOT yet drive enumeration.
 */
export class AgentSessionRegistry extends Disposable {

	private _dbRef: IReference<ISessionDatabase> | undefined;
	/** In-memory mirror of the persisted index; the source of truth once loaded. */
	private _cache: Map<string, IPersistedRegistryEntry> | undefined;
	/** Whether the one-time provider backfill has run; part of the persisted blob. */
	private _backfilled = false;
	/** Serializes read-modify-write of the persisted blob. */
	private _writeChain: Promise<void> = Promise.resolve();
	private _loadPromise: Promise<Map<string, IPersistedRegistryEntry>> | undefined;

	constructor(
		private readonly _sessionDataService: ISessionDataService,
		private readonly _logService: ILogService,
	) {
		super();
		this._register(toDisposable(() => this._dbRef?.dispose()));
	}

	/** Record (or refresh) a session in the registry. Idempotent per session URI. */
	async register(session: URI, provider: AgentProvider, startTime: number): Promise<void> {
		await this._enqueueWrite(cache => {
			const key = session.toString();
			const existing = cache.get(key);
			// Preserve the first-observed startTime so a later re-register (e.g.
			// a reconnect issuing createSession again) never rewrites it.
			cache.set(key, { provider, startTime: existing?.startTime ?? startTime });
		});
	}

	/** Remove a session from the registry (true delete). No-op if absent. */
	async unregister(session: URI): Promise<void> {
		await this._enqueueWrite(cache => {
			cache.delete(session.toString());
		});
	}

	/** Every session currently recorded, in no particular order. */
	async list(): Promise<IRegisteredSession[]> {
		const cache = await this._load();
		const result: IRegisteredSession[] = [];
		for (const [key, entry] of cache) {
			result.push({ session: URI.parse(key), provider: entry.provider, startTime: entry.startTime });
		}
		return result;
	}

	/** Whether the registry has ever been populated (used to gate one-time backfill). */
	async isEmpty(): Promise<boolean> {
		return (await this._load()).size === 0;
	}

	/**
	 * Whether the one-time provider backfill has completed for this host. Gated
	 * by a persisted marker rather than emptiness so a registry that a
	 * `createSession` has already populated is still backfilled from the legacy
	 * provider enumeration exactly once.
	 */
	async isBackfilled(): Promise<boolean> {
		await this._load();
		return this._backfilled;
	}

	/** Records that the one-time provider backfill has completed. */
	async markBackfilled(): Promise<void> {
		await this._enqueueWrite(() => {
			this._backfilled = true;
		});
	}

	private _enqueueWrite(mutate: (cache: Map<string, IPersistedRegistryEntry>) => void): Promise<void> {
		const next = this._writeChain
			.catch(() => { /* a failed prior write must not block later ones */ })
			.then(async () => {
				const cache = await this._load();
				mutate(cache);
				await this._persist(cache);
			});
		this._writeChain = next.catch(() => { /* keep the chain alive */ });
		return next;
	}

	private _load(): Promise<Map<string, IPersistedRegistryEntry>> {
		if (this._cache) {
			return Promise.resolve(this._cache);
		}
		this._loadPromise ??= this._doLoad();
		return this._loadPromise;
	}

	private async _doLoad(): Promise<Map<string, IPersistedRegistryEntry>> {
		const cache = new Map<string, IPersistedRegistryEntry>();
		try {
			const raw = await this._db().getMetadata(REGISTRY_METADATA_KEY);
			if (raw !== undefined) {
				const parsed = JSON.parse(raw) as Partial<IPersistedRegistry>;
				if (parsed && typeof parsed === 'object') {
					this._backfilled = parsed.backfilled === true;
					const sessions = parsed.sessions;
					if (sessions && typeof sessions === 'object') {
						for (const [key, value] of Object.entries(sessions)) {
							const entry = value as Partial<IPersistedRegistryEntry>;
							if (entry && typeof entry.provider === 'string' && typeof entry.startTime === 'number') {
								cache.set(key, { provider: entry.provider, startTime: entry.startTime });
							}
						}
					}
				}
			}
		} catch (err) {
			this._logService.warn(`[AgentSessionRegistry] Failed to load registry; starting empty: ${err instanceof Error ? err.message : String(err)}`);
		}
		this._cache = cache;
		return cache;
	}

	private async _persist(cache: Map<string, IPersistedRegistryEntry>): Promise<void> {
		const sessions: Record<string, IPersistedRegistryEntry> = {};
		for (const [key, entry] of cache) {
			sessions[key] = entry;
		}
		const blob: IPersistedRegistry = { version: 1, backfilled: this._backfilled, sessions };
		try {
			await this._db().setMetadata(REGISTRY_METADATA_KEY, JSON.stringify(blob));
		} catch (err) {
			this._logService.warn(`[AgentSessionRegistry] Failed to persist registry: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	private _db(): ISessionDatabase {
		this._dbRef ??= this._sessionDataService.openDatabase(REGISTRY_URI);
		return this._dbRef.object;
	}
}
