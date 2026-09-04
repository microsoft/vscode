/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Limiter } from '../../../base/common/async.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import type { AgentHostCatalogDatabaseReference } from './agentHostCatalogSyncService.js';
import { ChatOrigin } from '../common/state/protocol/state.js';
import { isDefaultChatUri, parseRequiredSessionUriFromChatUri } from '../common/state/sessionState.js';
import { fromCatalogChatOrigin, toSerializableJsonValue } from './agentHostCatalogSourceResolver.js';
import { AGENT_HOST_CATALOG_CHILD_LIMIT } from './agentHostCatalogProjection.js';
import { IAgentHostDatabase } from './agentHostDatabase.js';

export const PEER_CHATS_METADATA_KEY = 'peerChats';
export const CHAT_PROVIDER_DATA_METADATA_KEY = 'agentHost.chatProviderData';
export const CHAT_ORIGIN_METADATA_KEY = 'agentHost.chatOrigin';
export const CHAT_INHERITED_TURN_METADATA_KEY = 'agentHost.chatInheritedTurnId';
const CHAT_METADATA_CONCURRENCY = 4;
const IMPORTED_PEER_CHAT_LIMIT = AGENT_HOST_CATALOG_CHILD_LIMIT - 1;

export interface IPersistedPeerChat {
	readonly uri: string;
	readonly providerData?: string;
	readonly origin?: ChatOrigin;
	readonly inheritedTurnId?: string;
}

interface IReplaceCentralOptions {
	readonly publishCompatibility?: boolean;
	readonly database?: AgentHostCatalogDatabaseReference;
	readonly previousEntries?: readonly IPersistedPeerChat[];
	readonly legacyMergeBase?: readonly IPersistedPeerChat[];
}

export class AgentHostPeerChatStore {

	private readonly _writes = new Map<string, Promise<void>>();
	private readonly _deletingSessions = new Map<string, number>();

	constructor(
		private readonly _database: IAgentHostDatabase,
		private readonly _sessionDataService: ISessionDataService,
		private readonly _logService: ILogService,
	) { }

	async tryRead(session: URI, repairLegacyMirror = true): Promise<IPersistedPeerChat[] | undefined> {
		return this._readCentral(session, repairLegacyMirror);
	}

	/** Imports membership changed by an older build, then returns central authority. */
	async reconcileLegacy(session: URI, database?: AgentHostCatalogDatabaseReference): Promise<IPersistedPeerChat[] | undefined> {
		let result: IPersistedPeerChat[] | undefined;
		await this._enqueue(session, async () => {
			while (true) {
				const catalog = await this._database.getSessionChatCatalog(session.toString());
				const legacyState = await this._tryReadLegacyPayload(session, false, database);
				const legacy = legacyState?.entries;
				if (!catalog) {
					if (legacy === undefined) {
						return;
					}
					const replaceResult = await this._replaceCentral(session, legacy, undefined, { database, legacyMergeBase: legacy });
					if (replaceResult === 'conflict') {
						continue;
					}
					if (replaceResult === 'sessionUnavailable') {
						return;
					}
					result = legacy;
					return;
				}
				const central = this._entriesFromCatalog(catalog.chats);
				if (catalog.legacyMirroredRevision !== catalog.revision) {
					const reconciled = await this._reconcileUnmirroredCatalog(session, database);
					result = reconciled.status === 'available' ? reconciled.entries : undefined;
					return;
				}
				if (legacy === undefined) {
					try {
						await this._publishCompatibilityState(session, central, catalog.revision, database);
					} catch (error) {
						this._logService.error(error, `[AgentHostPeerChatStore] Failed to publish peer-chat compatibility state for ${session.toString()}`);
					}
				}
				if (legacy !== undefined && catalog.legacyMirroredPayload === undefined) {
					if (!await this._database.markSessionChatCatalogLegacyMirrored(session.toString(), catalog.revision, JSON.stringify(legacy))) {
						continue;
					}
				}
				if (legacy !== undefined && legacyState?.raw !== catalog.legacyMirroredPayload) {
					const base = this._parseLegacyMirrorBase(session, catalog.legacyMirroredPayload);
					const merged = base === undefined ? legacy : this._mergeLegacyChanges(base, central, legacy);
					const replaceResult = await this._replaceCentral(session, merged, catalog.revision, { database, legacyMergeBase: legacy });
					if (replaceResult === 'conflict') {
						continue;
					}
					if (replaceResult === 'sessionUnavailable') {
						return;
					}
					result = merged;
					return;
				}
				const local = await this.readLocalChatMetadata(central);
				if (JSON.stringify(local) !== JSON.stringify(central)) {
					const replaceResult = await this._replaceCentral(session, local, catalog.revision, { database });
					if (replaceResult === 'conflict') {
						continue;
					}
					if (replaceResult === 'sessionUnavailable') {
						return;
					}
				}
				result = local;
				return;
			}
		});
		return result;
	}

	private async _readCentral(session: URI, repairLegacyMirror: boolean): Promise<IPersistedPeerChat[] | undefined> {
		const catalog = await this._database.getSessionChatCatalog(session.toString());
		if (!catalog) {
			return undefined;
		}
		if (repairLegacyMirror && catalog.legacyMirroredRevision !== catalog.revision) {
			void this._enqueueLegacyMirror(session).catch(error => {
				this._logService.error(error, `[AgentHostPeerChatStore] Failed to repair legacy peer-chat membership for ${session.toString()}`);
			});
		}
		return this._entriesFromCatalog(catalog.chats);
	}

	/**
	 * Compatibility-only read used to import membership written by older builds.
	 * Missing or malformed data returns `undefined`; `[]` is an explicit empty sentinel.
	 */
	async tryReadLegacy(session: URI, batched = false, database?: AgentHostCatalogDatabaseReference): Promise<IPersistedPeerChat[] | undefined> {
		return (await this._tryReadLegacyPayload(session, batched, database))?.entries;
	}

	private async _tryReadLegacyPayload(session: URI, batched = false, database?: AgentHostCatalogDatabaseReference): Promise<{ readonly raw: string; readonly entries: IPersistedPeerChat[] } | undefined> {
		const ref = database ?? await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return undefined;
		}
		try {
			const raw = batched
				? (await ref.object.getMetadataObject({ [PEER_CHATS_METADATA_KEY]: true }))[PEER_CHATS_METADATA_KEY]
				: await ref.object.getMetadata(PEER_CHATS_METADATA_KEY);
			if (raw === undefined) {
				return undefined;
			}
			return { raw, entries: this._parse(session, raw, IMPORTED_PEER_CHAT_LIMIT) };
		} catch (error) {
			this._logService.warn(`[AgentService] Ignoring malformed peer-chat catalog for ${session.toString()}: ${toErrorMessage(error)}`);
			return undefined;
		} finally {
			if (!database) {
				ref.dispose();
			}
		}
	}

	async find(session: URI, chat: URI): Promise<IPersistedPeerChat | undefined> {
		const entries = await this.tryRead(session);
		return entries?.find(entry => entry.uri === chat.toString());
	}

	replace(session: URI, entries: readonly IPersistedPeerChat[]): Promise<void> {
		return this._enqueueWrite(session, () => [...entries]);
	}

	replaceForMigration(session: URI, entries: readonly IPersistedPeerChat[]): Promise<void> {
		return this._enqueue(session, async () => {
			const sessionKey = session.toString();
			if (await this._database.getSessionChatCatalog(sessionKey)) {
				return;
			}
			const result = await this._database.replaceSessionChatCatalog(sessionKey, this._catalogRows(entries), undefined);
			if (result.status === 'applied') {
				await this._database.recordSessionChatCatalogLegacyMirrorPayload(sessionKey, result.revision, JSON.stringify(entries));
			}
		});
	}

	upsert(session: URI, chat: URI, providerData: string | undefined, origin?: ChatOrigin, inheritedTurnId?: string): Promise<void> {
		const chatUri = chat.toString();
		return this._enqueueWrite(session, entries => {
			const existing = entries.find(entry => entry.uri === chatUri);
			const effectiveOrigin = origin ?? existing?.origin;
			const effectiveInheritedTurnId = inheritedTurnId ?? existing?.inheritedTurnId;
			const next = entries.filter(entry => entry.uri !== chatUri);
			next.push({
				uri: chatUri,
				...(providerData !== undefined ? { providerData } : {}),
				...(effectiveOrigin !== undefined ? { origin: effectiveOrigin } : {}),
				...(effectiveInheritedTurnId !== undefined ? { inheritedTurnId: effectiveInheritedTurnId } : {}),
			});
			return next;
		});
	}

	remove(session: URI, chat: URI): Promise<void> {
		const chatUri = chat.toString();
		return this._enqueueWrite(session, entries => entries.filter(entry => entry.uri !== chatUri));
	}

	async beginSessionDeletion(session: URI): Promise<void> {
		const key = session.toString();
		this._deletingSessions.set(key, (this._deletingSessions.get(key) ?? 0) + 1);
		await this._writes.get(key)?.catch(() => { });
	}

	endSessionDeletion(session: URI): void {
		const key = session.toString();
		const count = this._deletingSessions.get(key);
		if (count === undefined || count <= 1) {
			this._deletingSessions.delete(key);
		} else {
			this._deletingSessions.set(key, count - 1);
		}
	}

	async readLocalChatMetadata(entries: readonly IPersistedPeerChat[]): Promise<IPersistedPeerChat[]> {
		const limiter = new Limiter<IPersistedPeerChat>(CHAT_METADATA_CONCURRENCY);
		return Promise.all(entries.map(entry => limiter.queue(async () => {
			try {
				return await this._readChatMetadata(entry);
			} catch (error) {
				this._logService.warn(`[AgentHostPeerChatStore] Failed to read chat-local metadata for ${entry.uri}: ${toErrorMessage(error)}`);
				return entry;
			}
		})));
	}

	private _enqueueWrite(session: URI, mutate: (entries: IPersistedPeerChat[]) => IPersistedPeerChat[]): Promise<void> {
		return this._enqueue(session, () => this._applyWrite(session, mutate));
	}

	private _enqueue(session: URI, operation: () => Promise<void>): Promise<void> {
		const key = session.toString();
		if (this._deletingSessions.has(key)) {
			return Promise.resolve();
		}
		const previous = this._writes.get(key) ?? Promise.resolve();
		const next = previous
			.catch(() => { /* a failed prior write must not block later ones */ })
			.then(operation);
		const clear = () => {
			if (this._writes.get(key) === tracked) {
				this._writes.delete(key);
			}
		};
		const tracked = next.then(clear, error => {
			clear();
			throw error;
		});
		this._writes.set(key, tracked);
		return tracked;
	}

	private async _applyWrite(session: URI, mutate: (entries: IPersistedPeerChat[]) => IPersistedPeerChat[]): Promise<void> {
		while (true) {
			let catalog = await this._database.getSessionChatCatalog(session.toString());
			let reconciledEntries: IPersistedPeerChat[] | undefined;
			if (catalog && catalog.legacyMirroredRevision !== catalog.revision) {
				const reconciled = await this._reconcileUnmirroredCatalog(session);
				if (reconciled.status === 'sessionUnavailable') {
					return;
				}
				if (reconciled.status === 'missingCatalog') {
					continue;
				}
				catalog = await this._database.getSessionChatCatalog(session.toString());
				if (!catalog || catalog.revision !== reconciled.revision) {
					continue;
				}
				reconciledEntries = reconciled.entries;
			}
			const central = catalog ? this._entriesFromCatalog(catalog.chats) : undefined;
			const legacyState = reconciledEntries ? undefined : await this._tryReadLegacyPayload(session);
			const legacy = legacyState?.entries;
			if (catalog && legacy !== undefined && catalog.legacyMirroredRevision === catalog.revision && catalog.legacyMirroredPayload === undefined) {
				if (!await this._database.markSessionChatCatalogLegacyMirrored(session.toString(), catalog.revision, JSON.stringify(legacy))) {
					continue;
				}
			}
			const legacyIsCurrentMirror = central !== undefined
				&& catalog?.legacyMirroredPayload !== undefined
				&& legacyState?.raw === catalog.legacyMirroredPayload
				&& catalog.legacyMirroredPayload === JSON.stringify(central);
			const base = catalog && legacy !== undefined && !legacyIsCurrentMirror
				? this._parseLegacyMirrorBase(session, catalog.legacyMirroredPayload)
				: undefined;
			const current = reconciledEntries
				?? (base && central && legacy ? this._mergeLegacyChanges(base, central, legacy) : undefined)
				?? (legacyIsCurrentMirror ? central : legacy)
				?? central
				?? [];
			const updated = this._parse(session, JSON.stringify(mutate(current)));
			const result = await this._replaceCentral(session, updated, catalog?.revision, {
				previousEntries: legacyIsCurrentMirror ? central : undefined,
				legacyMergeBase: legacy !== undefined && !legacyIsCurrentMirror ? legacy : undefined,
			});
			if (result !== 'conflict') {
				return;
			}
		}
	}

	private async _replaceCentral(session: URI, updated: readonly IPersistedPeerChat[], expectedRevision: number | undefined, options: IReplaceCentralOptions = {}): Promise<'applied' | 'conflict' | 'sessionUnavailable'> {
		const result = await this._database.replaceSessionChatCatalog(session.toString(), this._catalogRows(updated), expectedRevision);
		if (result.status !== 'applied') {
			if (result.status !== 'conflict') {
				this._logService.trace(`[AgentHostPeerChatStore] Ignoring chat catalog write for unavailable session ${session.toString()}: ${result.status}`);
			}
			return result.status === 'conflict' ? 'conflict' : 'sessionUnavailable';
		}
		if (options.legacyMergeBase && !await this._database.recordSessionChatCatalogLegacyMirrorPayload(session.toString(), result.revision, JSON.stringify(options.legacyMergeBase))) {
			return 'conflict';
		}
		if (options.publishCompatibility !== false) {
			try {
				await this._publishCompatibilityState(session, updated, result.revision, options.database, options.previousEntries);
			} catch (error) {
				this._logService.error(error, `[AgentHostPeerChatStore] Failed to publish peer-chat compatibility state for ${session.toString()}`);
			}
		}
		return 'applied';
	}

	private _catalogRows(entries: readonly IPersistedPeerChat[]): Array<{
		readonly chat: string;
		readonly order: number;
		readonly providerData?: string;
		readonly origin?: string;
		readonly inheritedTurnId?: string;
	}> {
		return entries.map((entry, order) => ({
			chat: entry.uri,
			order,
			...(entry.providerData !== undefined ? { providerData: entry.providerData } : {}),
			...(entry.origin !== undefined ? { origin: this._stringifyOrigin(entry.origin) } : {}),
			...(entry.inheritedTurnId !== undefined ? { inheritedTurnId: entry.inheritedTurnId } : {}),
		}));
	}

	private async _publishCompatibilityState(session: URI, initialEntries: readonly IPersistedPeerChat[], initialRevision: number, database?: AgentHostCatalogDatabaseReference, initialPreviousEntries?: readonly IPersistedPeerChat[]): Promise<void> {
		let entries = initialEntries;
		let revision = initialRevision;
		let previousEntries = initialPreviousEntries;
		while (true) {
			const limiter = new Limiter<void>(CHAT_METADATA_CONCURRENCY);
			const previousByUri = previousEntries && new Map(previousEntries.map(entry => [entry.uri, entry]));
			const changedEntries = previousByUri
				? entries.filter(entry => JSON.stringify(previousByUri.get(entry.uri)) !== JSON.stringify(entry))
				: entries;
			await Promise.all(changedEntries.map(entry => limiter.queue(() => this._writeChatMetadata(entry))));
			const current = await this._database.getSessionChatCatalog(session.toString());
			if (!current) {
				return;
			}
			if (current.revision !== revision) {
				previousEntries = entries;
				entries = this._entriesFromCatalog(current.chats);
				revision = current.revision;
				continue;
			}
			if (await this._writeLegacyMirror(session, entries, revision, database)) {
				return;
			}
			const superseding = await this._database.getSessionChatCatalog(session.toString());
			if (!superseding) {
				return;
			}
			previousEntries = entries;
			entries = this._entriesFromCatalog(superseding.chats);
			revision = superseding.revision;
		}
	}

	private _enqueueLegacyMirror(session: URI): Promise<void> {
		return this._enqueue(session, async () => {
			await this._reconcileUnmirroredCatalog(session);
		});
	}

	private async _reconcileUnmirroredCatalog(session: URI, database?: AgentHostCatalogDatabaseReference): Promise<
		| { readonly status: 'available'; readonly entries: IPersistedPeerChat[]; readonly revision: number }
		| { readonly status: 'missingCatalog' }
		| { readonly status: 'sessionUnavailable' }
	> {
		while (true) {
			const catalog = await this._database.getSessionChatCatalog(session.toString());
			if (!catalog) {
				return { status: 'missingCatalog' };
			}
			const central = this._entriesFromCatalog(catalog.chats);
			if (catalog.legacyMirroredRevision === catalog.revision) {
				return { status: 'available', entries: central, revision: catalog.revision };
			}
			const legacyPayload = database ? await this._tryReadLegacyPayload(session, true, database) : undefined;
			const legacyState = database
				? { databaseExists: true, ...legacyPayload, entries: legacyPayload?.entries }
				: await this._tryReadLegacyState(session);
			if (!legacyState.databaseExists) {
				return { status: 'available', entries: central, revision: catalog.revision };
			}
			const legacy = legacyState.entries;
			const base = this._parseLegacyMirrorBase(session, catalog.legacyMirroredPayload);
			if (legacy !== undefined && base !== undefined && legacyState.raw !== catalog.legacyMirroredPayload && JSON.stringify(legacy) !== JSON.stringify(base)) {
				const merged = this._mergeLegacyChanges(base, central, legacy);
				const replaceResult = await this._replaceCentral(session, merged, catalog.revision, { publishCompatibility: false, legacyMergeBase: legacy });
				if (replaceResult === 'conflict') {
					continue;
				}
				if (replaceResult === 'sessionUnavailable') {
					return { status: 'sessionUnavailable' };
				}
				const revision = catalog.revision + 1;
				try {
					await this._publishCompatibilityState(session, merged, revision, database);
				} catch (error) {
					this._logService.error(error, `[AgentHostPeerChatStore] Failed to publish peer-chat compatibility state for ${session.toString()}`);
				}
				return { status: 'available', entries: merged, revision };
			}
			try {
				await this._publishCompatibilityState(session, central, catalog.revision, database);
			} catch (error) {
				this._logService.error(error, `[AgentHostPeerChatStore] Failed to publish peer-chat compatibility state for ${session.toString()}`);
			}
			return { status: 'available', entries: central, revision: catalog.revision };
		}
	}

	private async _writeLegacyMirror(session: URI, entries: readonly IPersistedPeerChat[], revision: number, database?: AgentHostCatalogDatabaseReference): Promise<boolean> {
		const payload = JSON.stringify(entries);
		const ref = database ?? this._sessionDataService.openDatabase(session);
		try {
			await ref.object.setMetadata(PEER_CHATS_METADATA_KEY, payload);
		} finally {
			if (!database) {
				ref.dispose();
			}
		}
		return this._database.markSessionChatCatalogLegacyMirrored(session.toString(), revision, payload);
	}

	private async _tryReadLegacyState(session: URI): Promise<{ readonly databaseExists: boolean; readonly raw?: string; readonly entries: IPersistedPeerChat[] | undefined }> {
		const ref = await this._sessionDataService.tryOpenDatabase(session);
		if (!ref) {
			return { databaseExists: false, entries: undefined };
		}
		try {
			const raw = await ref.object.getMetadata(PEER_CHATS_METADATA_KEY);
			return {
				databaseExists: true,
				...(raw === undefined ? {} : { raw }),
				entries: raw === undefined ? undefined : this._parse(session, raw, IMPORTED_PEER_CHAT_LIMIT),
			};
		} catch (error) {
			this._logService.warn(`[AgentService] Ignoring malformed peer-chat catalog for ${session.toString()}: ${toErrorMessage(error)}`);
			return { databaseExists: true, entries: undefined };
		} finally {
			ref.dispose();
		}
	}

	private _parseLegacyMirrorBase(session: URI, payload: string | undefined): IPersistedPeerChat[] | undefined {
		if (payload === undefined) {
			return undefined;
		}
		try {
			return this._parse(session, payload);
		} catch (error) {
			this._logService.warn(`[AgentHostPeerChatStore] Ignoring malformed legacy mirror base for ${session.toString()}: ${toErrorMessage(error)}`);
			return undefined;
		}
	}

	private _mergeLegacyChanges(base: readonly IPersistedPeerChat[], central: readonly IPersistedPeerChat[], legacy: readonly IPersistedPeerChat[]): IPersistedPeerChat[] {
		const baseByUri = new Map(base.map(entry => [entry.uri, entry]));
		const centralByUri = new Map(central.map(entry => [entry.uri, entry]));
		const legacyUris = new Set(legacy.map(entry => entry.uri));
		const merged: IPersistedPeerChat[] = [];
		for (const legacyEntry of legacy) {
			const baseEntry = baseByUri.get(legacyEntry.uri);
			const centralEntry = centralByUri.get(legacyEntry.uri);
			if (!baseEntry || JSON.stringify(legacyEntry) !== JSON.stringify(baseEntry)) {
				merged.push(legacyEntry);
			} else if (centralEntry) {
				merged.push(centralEntry);
			}
		}
		for (const centralEntry of central) {
			if (!baseByUri.has(centralEntry.uri) && !legacyUris.has(centralEntry.uri)) {
				merged.push(centralEntry);
			}
		}
		return merged;
	}

	private async _readChatMetadata(entry: IPersistedPeerChat): Promise<IPersistedPeerChat> {
		const ref = await this._sessionDataService.tryOpenDatabase(URI.parse(entry.uri));
		if (!ref) {
			return entry;
		}
		try {
			const metadata = await ref.object.getMetadataObject({
				[CHAT_PROVIDER_DATA_METADATA_KEY]: true,
				[CHAT_ORIGIN_METADATA_KEY]: true,
				[CHAT_INHERITED_TURN_METADATA_KEY]: true,
			});
			const origin = metadata[CHAT_ORIGIN_METADATA_KEY]
				? this._parseOrigin(metadata[CHAT_ORIGIN_METADATA_KEY])
				: metadata[CHAT_ORIGIN_METADATA_KEY] === '' ? undefined : entry.origin;
			return {
				uri: entry.uri,
				...(metadata[CHAT_PROVIDER_DATA_METADATA_KEY] !== undefined
					? metadata[CHAT_PROVIDER_DATA_METADATA_KEY] ? { providerData: metadata[CHAT_PROVIDER_DATA_METADATA_KEY] } : {}
					: entry.providerData !== undefined ? { providerData: entry.providerData } : {}),
				...(origin !== undefined ? { origin } : {}),
				...(metadata[CHAT_INHERITED_TURN_METADATA_KEY] !== undefined
					? metadata[CHAT_INHERITED_TURN_METADATA_KEY] ? { inheritedTurnId: metadata[CHAT_INHERITED_TURN_METADATA_KEY] } : {}
					: entry.inheritedTurnId !== undefined ? { inheritedTurnId: entry.inheritedTurnId } : {}),
			};
		} finally {
			ref.dispose();
		}
	}

	private async _writeChatMetadata(entry: IPersistedPeerChat): Promise<void> {
		const ref = this._sessionDataService.openDatabase(URI.parse(entry.uri));
		try {
			await ref.object.setMetadataValues({
				[CHAT_PROVIDER_DATA_METADATA_KEY]: entry.providerData ?? '',
				[CHAT_ORIGIN_METADATA_KEY]: entry.origin === undefined ? '' : this._stringifyOrigin(entry.origin),
				[CHAT_INHERITED_TURN_METADATA_KEY]: entry.inheritedTurnId ?? '',
			});
		} finally {
			ref.dispose();
		}
	}

	private _parseOrigin(raw: string): ChatOrigin | undefined {
		const parsed: unknown = JSON.parse(raw);
		return fromCatalogChatOrigin(toSerializableJsonValue(parsed));
	}

	private _stringifyOrigin(origin: ChatOrigin): string {
		const value = toSerializableJsonValue(origin);
		if (value === undefined) {
			throw new Error('Chat origin is not JSON-serializable');
		}
		return JSON.stringify(value);
	}

	private _entriesFromCatalog(chats: readonly {
		readonly chat: string;
		readonly providerData?: string;
		readonly origin?: string;
		readonly inheritedTurnId?: string;
	}[]): IPersistedPeerChat[] {
		return chats.map(chat => ({
			uri: chat.chat,
			...(chat.providerData !== undefined ? { providerData: chat.providerData } : {}),
			...(chat.origin !== undefined ? { origin: this._parseOrigin(chat.origin) } : {}),
			...(chat.inheritedTurnId !== undefined ? { inheritedTurnId: chat.inheritedTurnId } : {}),
		}));
	}

	private _parse(session: URI, raw: string, maximumEntries?: number): IPersistedPeerChat[] {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) {
			throw new Error('expected an array');
		}
		if (maximumEntries !== undefined && parsed.length > maximumEntries) {
			throw new Error(`legacy peer-chat catalog exceeds the ${maximumEntries} entry limit`);
		}
		const entryCount = parsed.length;
		const sessionKey = session.toString();
		const seen = new Set<string>();
		const result: IPersistedPeerChat[] = [];
		for (let index = 0; index < entryCount; index++) {
			const value = parsed[index];
			if (!isRecord(value) || typeof value.uri !== 'string') {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with no chat URI`);
				continue;
			}
			if (seen.has(value.uri)) {
				this._logService.warn(`[AgentService] Skipping duplicate peer-chat catalog entry ${index}`);
				continue;
			}
			let owner: string;
			try {
				owner = parseRequiredSessionUriFromChatUri(value.uri);
			} catch (error) {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with invalid chat URI: ${toErrorMessage(error)}`);
				continue;
			}
			if (owner !== sessionKey || isDefaultChatUri(value.uri)) {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} that is not owned by ${sessionKey}`);
				continue;
			}
			if (value.providerData !== undefined && typeof value.providerData !== 'string') {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with invalid provider data`);
				continue;
			}
			if (value.inheritedTurnId !== undefined && typeof value.inheritedTurnId !== 'string') {
				this._logService.warn(`[AgentService] Skipping peer-chat catalog entry ${index} with invalid inherited turn id`);
				continue;
			}
			const originValue = toSerializableJsonValue(value.origin);
			const origin = fromCatalogChatOrigin(originValue);
			if (value.origin !== undefined && !origin) {
				this._logService.warn(`[AgentService] Dropping invalid origin from peer-chat catalog entry ${index}`);
			}
			seen.add(value.uri);
			result.push({
				uri: value.uri,
				...(typeof value.providerData === 'string' ? { providerData: value.providerData } : {}),
				...(origin ? { origin } : {}),
				...(typeof value.inheritedTurnId === 'string' ? { inheritedTurnId: value.inheritedTurnId } : {}),
			});
		}
		return result;
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null;
}
