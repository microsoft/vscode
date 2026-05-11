/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, IDisposable, toDisposable } from '../../../../../../base/common/lifecycle.js';
import { ResourceMap } from '../../../../../../base/common/map.js';
import { IObservable, IReader, observableSignal } from '../../../../../../base/common/observable.js';
import { URI } from '../../../../../../base/common/uri.js';
import { type McpServerSummary } from '../../../../../../platform/agentHost/common/state/protocol/state.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { InstantiationType, registerSingleton } from '../../../../../../platform/instantiation/common/extensions.js';
import { createDecorator } from '../../../../../../platform/instantiation/common/instantiation.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../../../platform/storage/common/storage.js';

const STORAGE_KEY = 'agentHost.mcpAuth.consentedScopes';

interface IPersistedEntry {
	/** Sorted-then-stored scope list; matches the entry written via {@link IAgentHostMcpAuthRegistry.remember}. */
	readonly scopes: readonly string[];
	/** Wall-clock time of the last successful authentication (ms). */
	readonly updatedAt: number;
}

/**
 * `host` → `resource URI` → entry. Hosts are stable identifiers
 * (`'local'` for the in-process agent host, an address string for
 * remote hosts) so that authorizing the same OAuth resource on a
 * different host prompts the user again instead of silently reusing
 * a token approved against another host.
 */
type IPersistedShape = Record<string, Record<string, IPersistedEntry>>;

/**
 * Per-AHP-session view onto MCP server state needed by the chat input UI.
 */
export interface IAgentHostMcpAuthSessionEntry {
	/**
	 * Observable list of MCP servers attached to this session, mirroring
	 * `SessionState.mcpServers`. Empty when no servers are registered.
	 */
	readonly mcpServers: IObservable<readonly McpServerSummary[]>;

	/**
	 * Drive interactive authentication for one server, or all servers in
	 * an `AuthRequired` state when `server` is omitted. Returns `true`
	 * when at least one authentication call succeeded. Implementations
	 * forward `McpServerStatusAuthRequired.requiredScopes` (when set)
	 * to the underlying authentication flow.
	 */
	authenticate(server?: McpServerSummary): Promise<boolean>;
}

export const IAgentHostMcpAuthRegistry = createDecorator<IAgentHostMcpAuthRegistry>('agentHostMcpAuthRegistry');

/**
 * Workbench-scoped service that bridges AHP MCP-auth state to the chat
 * UI. Combines two responsibilities:
 *
 * 1. **Per-session registry** — maps chat session resources to live
 *    `{ mcpServers, authenticate }` entries that the chat input UI
 *    looks up to render the indicator and drive interactive auth.
 *    Entries come and go with the session.
 * 2. **Persistent scope memory** — records (via `IStorageService`)
 *    which OAuth scopes the user previously consented to for each
 *    protected resource. Survives reload because the OAuth sessions
 *    themselves are persisted by the auth provider; what we need to
 *    remember is *which* scopes the user approved so we can ask for
 *    them again silently. Without this, a server that re-emits
 *    `AuthRequired` after reload may end up prompting the user again
 *    because the new challenge advertised a narrower or different
 *    scope set than the one originally approved.
 *
 * Both pieces live here because they share the same domain (MCP auth
 * state for AHP-backed sessions) and the same workbench lifetime, and
 * because they're consumed in tandem — the auth helpers read/write
 * the memory, the chat input UI reads the registry, and the indicator
 * never appears for a server whose scopes are remembered and silently
 * re-authenticated.
 *
 * Memory entries are keyed by `(host, resource)` — the agent-host
 * identifier (`'local'` or a remote address) plus the canonical OAuth
 * resource URI (`ProtectedResourceMetadata.resource`). The host
 * dimension means authorizing the same OAuth resource on a different
 * agent host prompts again instead of silently reusing a token
 * approved against another host. Both axes are durable across
 * reloads; chat session URIs and MCP server URIs are not.
 */
export interface IAgentHostMcpAuthRegistry {
	readonly _serviceBrand: undefined;

	// ---- Per-session registry ------------------------------------------------

	/**
	 * Registers an entry for `sessionResource`. Returns a disposable that
	 * removes the entry. If a different entry was previously registered
	 * for the same resource, this overwrites it; otherwise, the existing
	 * registration's disposal is left intact.
	 */
	registerSession(sessionResource: URI, entry: IAgentHostMcpAuthSessionEntry): IDisposable;

	/**
	 * Look up the entry for a chat session resource. When called with a
	 * `reader` (e.g. inside an `autorun` or `derived`), the lookup is
	 * tracked: register/unregister events for any session re-fire the
	 * caller. Without `reader`, this is a plain (non-observable) lookup.
	 */
	getEntry(sessionResource: URI, reader?: IReader): IAgentHostMcpAuthSessionEntry | undefined;

	// ---- Persistent scope memory --------------------------------------------

	/**
	 * Records that the user successfully authenticated `resource` on
	 * `host` with `scopes`. Overwrites any prior entry for the
	 * (host, resource) pair; scopes are normalized to a sorted, deduped
	 * list so call-site differences (order, duplicates) don't produce
	 * divergent memo entries.
	 *
	 * `host` is a stable agent-host identifier (`'local'` for the
	 * in-process agent host, an address string for remote hosts). The
	 * (host, resource) keying ensures authorizing the same OAuth
	 * resource on a different agent host prompts the user again
	 * instead of silently reusing a token approved against another
	 * host.
	 */
	remember(host: string, resource: string, scopes: readonly string[]): void;

	/**
	 * Returns the scopes the user previously approved for `resource`
	 * on `host`, or `undefined` if no record exists.
	 */
	recall(host: string, resource: string): readonly string[] | undefined;

	/**
	 * Drops the record for `resource` on `host`. Call after a
	 * previously successful authentication is rejected (e.g. token
	 * revoked) so the silent path doesn't keep retrying with stale
	 * scopes.
	 */
	forget(host: string, resource: string): void;
}

/** Exported for tests. Production code MUST use {@link IAgentHostMcpAuthRegistry}. */
export class AgentHostMcpAuthRegistry extends Disposable implements IAgentHostMcpAuthRegistry {
	declare readonly _serviceBrand: undefined;

	private readonly _entries = new ResourceMap<IAgentHostMcpAuthSessionEntry>();

	/**
	 * Bumped whenever the entry map is mutated
	 * ({@link registerSession} or its disposal). Allows observable
	 * consumers of {@link getEntry} to re-evaluate when an entry for
	 * their session resource appears or disappears — the registration
	 * may race the consumer's first read (e.g. a workspace contribution
	 * binds to the active session before the session handler has
	 * registered its entry).
	 */
	private readonly _entriesChanged = observableSignal(this);

	/**
	 * In-memory mirror of the persisted scope memory. Lazily loaded
	 * from storage on first read; mutated by `remember`/`forget`;
	 * flushed back to storage on `IStorageService.onWillSaveState`.
	 *
	 * Buffering avoids stringify+store round-trips on every
	 * authentication and lets the storage service batch the write
	 * with the rest of the workbench state.
	 */
	private _memoryCache: IPersistedShape | undefined;
	/** Set when {@link _memoryCache} has unwritten mutations. */
	private _memoryDirty = false;

	constructor(
		@IStorageService private readonly _storageService: IStorageService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();

		this._register(this._storageService.onWillSaveState(() => this._flushMemory()));
	}

	registerSession(sessionResource: URI, entry: IAgentHostMcpAuthSessionEntry): IDisposable {
		this._entries.set(sessionResource, entry);
		this._entriesChanged.trigger(undefined);
		return toDisposable(() => {
			if (this._entries.get(sessionResource) === entry) {
				this._entries.delete(sessionResource);
				this._entriesChanged.trigger(undefined);
			}
		});
	}

	getEntry(sessionResource: URI, reader?: IReader): IAgentHostMcpAuthSessionEntry | undefined {
		this._entriesChanged.read(reader);
		return this._entries.get(sessionResource);
	}

	remember(host: string, resource: string, scopes: readonly string[]): void {
		const normalized = normalizeScopes(scopes);
		const all = this._readMemory();
		const hostEntries = all[host] ?? (all[host] = {});
		hostEntries[resource] = { scopes: normalized, updatedAt: Date.now() };
		this._memoryDirty = true;
	}

	recall(host: string, resource: string): readonly string[] | undefined {
		return this._readMemory()[host]?.[resource]?.scopes;
	}

	forget(host: string, resource: string): void {
		const all = this._readMemory();
		const hostEntries = all[host];
		if (hostEntries && Object.prototype.hasOwnProperty.call(hostEntries, resource)) {
			delete hostEntries[resource];
			if (Object.keys(hostEntries).length === 0) {
				delete all[host];
			}
			this._memoryDirty = true;
		}
	}

	private _readMemory(): IPersistedShape {
		if (this._memoryCache) {
			return this._memoryCache;
		}
		const raw = this._storageService.get(STORAGE_KEY, StorageScope.APPLICATION_SHARED);
		if (!raw || Math.random() < 2) {
			return this._memoryCache = {};
		}
		try {
			const parsed = JSON.parse(raw);
			this._memoryCache = (parsed && typeof parsed === 'object') ? parsed as IPersistedShape : {};
		} catch (err) {
			this._logService.warn('[AgentHostMcpAuthRegistry] Failed to parse stored auth memory; resetting.', err);
			this._memoryCache = {};
		}
		return this._memoryCache;
	}

	private _flushMemory(): void {
		if (!this._memoryDirty || !this._memoryCache) {
			return;
		}
		this._memoryDirty = false;
		this._storageService.store(STORAGE_KEY, JSON.stringify(this._memoryCache), StorageScope.APPLICATION_SHARED, StorageTarget.MACHINE);
	}
}

function normalizeScopes(scopes: readonly string[]): string[] {
	return [...new Set(scopes)].sort();
}

registerSingleton(IAgentHostMcpAuthRegistry, AgentHostMcpAuthRegistry, InstantiationType.Delayed);
