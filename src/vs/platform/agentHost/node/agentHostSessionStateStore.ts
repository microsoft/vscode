/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AsyncLocalStorage } from 'async_hooks';
import { Limiter, RunOnceScheduler, SequencerByKey } from '../../../base/common/async.js';
import { toErrorMessage } from '../../../base/common/errorMessage.js';
import { Disposable } from '../../../base/common/lifecycle.js';
import { getComparisonKey } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { ILogService } from '../../log/common/log.js';
import { deriveLegacyDefaultChat } from '../common/agentHostLegacyDefaultChat.js';
import { AH_META_IS_ARCHIVED_DB_KEY } from '../common/state/sessionState.js';
import { IAgentHostSessionStateStore, ISessionStateChatEntry, ISessionStateExclusive, ISessionStateFolderEntry, ISessionStateLegacyMetadata, ISessionStateMetadataReference, ISessionStatePatch, ISessionStateSnapshot, SessionStateDeletedError, SessionStateMirrorFlush, SessionStateReentrancyError, sessionStatePatch } from '../common/agentHostSessionStateStore.js';
import { ISessionDataService } from '../common/sessionDataService.js';
import { IAgentHostDatabase, type IAgentHostDatabaseCatalogSnapshotEntry } from './agentHostDatabase.js';
import type { IAgentHostSessionChatStateData, IAgentHostSessionChatStateFields, IAgentHostSessionStateImport, IAgentHostSessionStatePatch } from './agentHostSessionStateDatabase.js';
import { IMirrorReadPlan, isProjectedMirrorEntry, legacyMapWritePatch, legacyWriteEntry, MirrorReads, mergePatches, mirroredChatFields, mirrorEntryId, observedMirrorEntries, observeLegacyArchived, observeMirrorEntry, parseMirrorEntryId, patchFromMirror, patchMirrorEntries, planMirrorReads, renderLegacyMetadata, renderMirrorEntry, renderMirrorWrites, SESSION_STATE_VALUE_KEYS, SessionStateMirrorEntry, SessionStateModel } from './agentHostSessionStateMirror.js';
import { creationTimeChatStorageResource } from './agentHostStateManager.js';

/** Coalescing window of the old-format mirror writes. */
export const SESSION_STATE_MIRROR_FLUSH_DELAY = 250;

/** Version of the import that seeded a session's central state. */
const SESSION_STATE_IMPORT_VERSION = 1;
/** Databases other than the session's opened at once during an observation. */
const MIRROR_READ_CONCURRENCY = 4;
const PEER_CHATS_MIRROR_KEY = 'peerChats';

interface ISessionRecord {
	readonly session: URI;
	readonly key: string;
	readonly sequencerKey: string;
	model: SessionStateModel;
	/** What the old-format mirrors held when this build last wrote or observed them, by entry. */
	base: Map<string, string>;
	readonly dirty: Set<string>;
	readonly scheduler: RunOnceScheduler;
	snapshot: ISessionStateSnapshot | undefined;
	mirrorFailureLogged: boolean;
}

interface IImportedChat {
	readonly chat: string;
	readonly isDefault: boolean;
	readonly storage: string;
}

function serializeBase(base: ReadonlyMap<string, string>): string {
	return JSON.stringify({ v: 2, entries: Object.fromEntries([...base].sort(([a], [b]) => a.localeCompare(b))) });
}

function parseBase(payload: string | undefined): Map<string, string> {
	if (payload === undefined) {
		return new Map();
	}
	const parsed: { readonly entries?: unknown } | null = JSON.parse(payload);
	if (!parsed || !parsed.entries || typeof parsed.entries !== 'object') {
		throw new Error('Invalid session state merge base');
	}
	return new Map(Object.entries(parsed.entries).filter((entry): entry is [string, string] => typeof entry[1] === 'string'));
}

function toDatabasePatch(patch: ISessionStatePatch, markPayloadDirty: boolean): IAgentHostSessionStatePatch {
	return {
		values: patch.values,
		folders: patch.folders.map(folder => ({ folderKey: folder.folderKey, kind: folder.kind, value: folder.value, storageResource: folder.storage })),
		chats: patch.chats.map(chat => {
			const { storage, ...fields } = chat.fields;
			const databaseFields: IAgentHostSessionChatStateFields = { ...fields, ...(storage !== undefined ? { storageResource: storage } : {}) };
			return { chat: chat.chat, isDefault: chat.isDefault, fields: databaseFields };
		}),
		branchChangesets: patch.branchChangesets,
		markPayloadDirty,
	};
}

/**
 * {@link IAgentHostSessionStateStore} over agent-host.db. Every operation on a
 * session runs in that session's exclusive section, shared with every other
 * user of the session's storage directory.
 */
export class AgentHostSessionStateStore extends Disposable implements IAgentHostSessionStateStore {
	declare readonly _serviceBrand: undefined;

	private readonly _records = new Map<string, ISessionRecord>();
	private readonly _sequencer = new SequencerByKey<string>();
	private readonly _held = new AsyncLocalStorage<ReadonlySet<string>>();
	private readonly _deleting = new Set<string>();

	constructor(
		private readonly _mirrorFlushDelay: number,
		@IAgentHostDatabase private readonly _database: IAgentHostDatabase,
		@ISessionDataService private readonly _sessionDataService: ISessionDataService,
		@ILogService private readonly _logService: ILogService,
	) {
		super();
		this._register({ dispose: () => this._records.forEach(record => record.scheduler.dispose()) });
	}

	// ---- Public API -----------------------------------------------------------

	async load(session: URI): Promise<ISessionStateSnapshot> {
		const sequencerKey = this._enter(session);
		const record = await this._sequencer.queue(sequencerKey, () => this._loadLocked(session, sequencerKey));
		return this._snapshot(record);
	}

	peek(session: URI): ISessionStateSnapshot | undefined {
		const record = this._records.get(session.toString());
		return record && this._snapshot(record);
	}

	write(session: URI, patch: ISessionStatePatch, flush: SessionStateMirrorFlush): Promise<number> {
		return this.runExclusive(session, exclusive => exclusive.write(patch, flush));
	}

	update(session: URI, key: string, updater: (previous: string | undefined) => string | null, flush: SessionStateMirrorFlush): Promise<number> {
		return this.runExclusive(session, exclusive => exclusive.write(sessionStatePatch({ values: { [key]: updater(exclusive.snapshot.values.get(key)) } }), flush));
	}

	runExclusive<T>(session: URI, task: (exclusive: ISessionStateExclusive) => Promise<T>): Promise<T> {
		const sequencerKey = this._enter(session);
		const held = new Set([...this._held.getStore() ?? [], sequencerKey]);
		return this._sequencer.queue(sequencerKey, () => this._held.run(held, async () => {
			const record = await this._loadLocked(session, sequencerKey);
			let immediate = false;
			const snapshot = () => this._snapshot(record);
			const exclusive: ISessionStateExclusive = {
				get snapshot() { return snapshot(); },
				write: async (patch, flush) => {
					const revision = await this._writeCentral(record, patch, true);
					if (flush === SessionStateMirrorFlush.Immediate) {
						immediate = true;
					} else if (!record.scheduler.isScheduled()) {
						record.scheduler.schedule();
					}
					return revision;
				},
				noteMirrored: (revision, entries) => this._noteMirrored(record, revision, entries),
			};
			const result = await task(exclusive);
			if (immediate) {
				record.scheduler.cancel();
				await this._flushLocked(record);
			} else if (!record.scheduler.isScheduled()) {
				await this._flushLocked(record);
			}
			return result;
		}));
	}

	async writeMetadata(session: URI, resource: URI, values: Readonly<Record<string, string | null>>, flush: SessionStateMirrorFlush): Promise<void> {
		const sequencerKey = this._enter(session);
		const held = new Set([...this._held.getStore() ?? [], sequencerKey]);
		await this._sequencer.queue(sequencerKey, () => this._held.run(held, async () => {
			const record = await this._loadLocked(session, sequencerKey);
			const isDefault = (chat: string) => record.model.chats.get(chat)?.isDefault ?? false;
			const patches: Partial<ISessionStatePatch>[] = [];
			const unowned: Record<string, string> = {};
			const unownedRemovals: string[] = [];
			let failure: unknown;
			for (const [key, value] of Object.entries(values)) {
				const mapPatch = resource.toString() === record.key ? legacyMapWritePatch(record.model, key, value) : undefined;
				if (mapPatch) {
					patches.push(mapPatch);
					continue;
				}
				const entry = legacyWriteEntry(record.model, record.key, resource.toString(), key);
				if (entry) {
					patches.push(patchFromMirror(record.model, entry, value === null ? undefined : { compare: value, content: value }, isDefault));
				} else if (value === null) {
					unownedRemovals.push(key);
				} else {
					unowned[key] = value;
				}
			}
			if (patches.length > 0) {
				await this._writeCentral(record, mergePatches(patches), true);
				if (flush === SessionStateMirrorFlush.Immediate) {
					record.scheduler.cancel();
					// Old-format readers still depend on the mirror, so an Immediate write reports its failure.
					failure = await this._flushLocked(record);
				} else if (!record.scheduler.isScheduled()) {
					record.scheduler.schedule();
				}
			}
			if (Object.keys(unowned).length > 0 || unownedRemovals.length > 0) {
				const reference = this._sessionDataService.openDatabase(resource);
				try {
					if (Object.keys(unowned).length > 0) {
						await reference.object.setMetadataValues(unowned);
					}
					if (unownedRemovals.length > 0) {
						await reference.object.deleteMetadata(unownedRemovals);
					}
				} finally {
					reference.dispose();
				}
			}
			if (failure) {
				throw failure;
			}
		}));
	}

	legacyMetadata(session: URI, keys: readonly string[]): ISessionStateLegacyMetadata {
		const record = this._records.get(session.toString());
		if (!record) {
			throw new Error(`Session state of ${session.toString()} is not loaded`);
		}
		return renderLegacyMetadata(record.model, keys);
	}

	catalogMetadataReference(exclusive: ISessionStateExclusive): ISessionStateMetadataReference {
		const session = URI.parse(exclusive.snapshot.session);
		return {
			object: {
				getMetadataObject: async <T extends Record<string, unknown>>(keys: T) => {
					const rendered = this.legacyMetadata(session, Object.keys(keys));
					const values: Record<string, string | undefined> = { ...rendered.values, ...await this._readDatabase(session, rendered.unowned) };
					return values as { [K in keyof T]: string | undefined };
				},
			},
		};
	}

	async readWithoutImport(session: URI, keys: readonly string[]): Promise<ReadonlyMap<string, string>> {
		const key = session.toString();
		const record = this._records.get(key);
		let rendered: ISessionStateLegacyMetadata | undefined;
		if (record) {
			rendered = renderLegacyMetadata(record.model, keys);
		} else if (keys.every(entry => SESSION_STATE_VALUE_KEYS.some(value => value.key === entry))) {
			const central = (await this._database.readSessionStateValues([key], keys)).get(key);
			rendered = central?.imported ? { values: Object.fromEntries(central.values), unowned: [] } : undefined;
		} else {
			const state = await this._database.readSessionState(key);
			if (state) {
				const [catalog] = await this._database.readCatalogSnapshot([key]);
				rendered = renderLegacyMetadata(new SessionStateModel(state, catalog?.authorityVersion ?? 1), keys);
			}
		}
		const values = { ...rendered?.values, ...await this._readDatabase(session, rendered ? rendered.unowned : keys) };
		return new Map(Object.entries(values).filter((entry): entry is [string, string] => entry[1] !== undefined));
	}

	async readValuesWithoutImport(sessions: readonly URI[], keys: readonly string[]): Promise<ReadonlyMap<string, ReadonlyMap<string, string>>> {
		const central = await this._database.readSessionStateValues(sessions.map(session => session.toString()), keys);
		const result = new Map<string, ReadonlyMap<string, string>>();
		for (const session of sessions) {
			const key = session.toString();
			const record = this._records.get(key);
			const imported = central.get(key);
			result.set(key, record
				? this._values(record, keys)
				: imported?.imported ? imported.values : new Map(Object.entries(await this._readDatabase(session, keys)).filter((entry): entry is [string, string] => entry[1] !== undefined)));
		}
		return result;
	}

	/** Reads keys from an existing session.db; a missing database holds nothing and is not created. */
	private async _readDatabase(session: URI, keys: readonly string[]): Promise<Record<string, string | undefined>> {
		if (keys.length === 0) {
			return {};
		}
		const reference = await this._sessionDataService.tryOpenDatabase(session);
		if (!reference) {
			return {};
		}
		try {
			return await reference.object.getMetadataObject(Object.fromEntries(keys.map(key => [key, true])));
		} finally {
			reference.dispose();
		}
	}

	async refreshFromMirror(session: URI, keys: readonly string[]): Promise<void> {
		const sequencerKey = this._enter(session);
		await this._sequencer.queue(sequencerKey, async () => {
			const record = await this._loadLocked(session, sequencerKey);
			const reads = await this._read(new Map<string, IMirrorReadPlan>([[record.key, { keys: new Set(keys), prefixes: new Set() }]]));
			const changes: Record<string, string | null> = {};
			for (const key of keys) {
				const entry: SessionStateMirrorEntry = { kind: 'value', key };
				const observed = observeMirrorEntry(record.key, record.model, entry, reads, () => false)?.content;
				if (observed !== renderMirrorEntry(record.model, entry)) {
					changes[key] = observed ?? null;
				}
				this._setBase(record, mirrorEntryId(entry), observed);
			}
			if (Object.keys(changes).length > 0) {
				await this._writeCentral(record, sessionStatePatch({ values: changes }), false);
			}
			await this._flushLocked(record);
		});
	}

	async readBranchChangeset(session: URI, scopeKey: string): Promise<string | undefined> {
		await this.load(session);
		return this._database.readBranchChangeset(session.toString(), scopeKey);
	}

	async whenIdle(session: URI | undefined): Promise<void> {
		const records = session ? [this._records.get(session.toString())].filter(record => record !== undefined) : [...this._records.values()];
		await Promise.all(records.map(record => {
			record.scheduler.cancel();
			return this._sequencer.queue(record.sequencerKey, () => this._flushLocked(record));
		}));
	}

	beginDeletion(session: URI): { readonly whenDrained: Promise<void>; dispose(): void } {
		const key = session.toString();
		this._deleting.add(key);
		return {
			whenDrained: this.whenIdle(session),
			dispose: () => {
				this._deleting.delete(key);
				this._forget(key);
			},
		};
	}

	async evict(session: URI): Promise<void> {
		await this.whenIdle(session);
		this._forget(session.toString());
	}

	// ---- Loading ----------------------------------------------------------------

	private _enter(session: URI): string {
		const sequencerKey = getComparisonKey(this._sessionDataService.getSessionDataDir(session));
		if (this._held.getStore()?.has(sequencerKey)) {
			throw new SessionStateReentrancyError(session.toString());
		}
		return sequencerKey;
	}

	private async _loadLocked(session: URI, sequencerKey: string): Promise<ISessionRecord> {
		const key = session.toString();
		const existing = this._records.get(key);
		if (existing) {
			return existing;
		}
		const [catalog] = await this._database.readCatalogSnapshot([key]);
		const authority = catalog?.authorityVersion ?? 1;
		let state = await this._database.readSessionState(key);
		let reads: MirrorReads | undefined;
		if (!state) {
			const chats = authority === 1 ? await this._legacyChats(session, catalog) : [];
			reads = await this._observe(key, chats, []);
			const result = await this._database.importSessionState(key, this._importData(key, chats, reads));
			if (result === 'tombstoned') {
				throw new Error(`Session ${key} was deleted`);
			}
			if (result === 'alreadyImported') {
				reads = undefined;
			}
			state = await this._database.readSessionState(key);
			if (!state) {
				throw new Error(`Session state of ${key} was not imported`);
			}
		}
		const record: ISessionRecord = {
			session,
			key,
			sequencerKey,
			model: new SessionStateModel(state, authority),
			base: parseBase(state.legacyMirrorBase),
			dirty: new Set(),
			scheduler: new RunOnceScheduler(() => this._scheduledFlush(record), this._mirrorFlushDelay),
			snapshot: undefined,
			mirrorFailureLogged: false,
		};
		try {
			await this._reconcileLocked(record, reads);
		} catch (error) {
			record.scheduler.dispose();
			throw error;
		}
		this._records.set(key, record);
		return record;
	}

	/** The chats of a legacy-catalog session, with their storage, as recorded centrally or in the old-format membership mirror. */
	private async _legacyChats(session: URI, catalog: IAgentHostDatabaseCatalogSnapshotEntry | undefined): Promise<IImportedChat[]> {
		const key = session.toString();
		// The cached catalog payload is never read: the recorded header, else the legacy derivation.
		const defaultChat = catalog?.header?.defaultChatUri ?? deriveLegacyDefaultChat(key);
		const peers = new Set((await this._database.getSessionChatCatalog(key))?.chats.map(chat => chat.chat) ?? []);
		// Without agent-host.db the membership mirror is the only record of the peers.
		for (const peer of await this._readMirroredPeers(session)) {
			peers.add(peer);
		}
		peers.delete(defaultChat);
		return [defaultChat, ...peers].map(chat => ({ chat, isDefault: chat === defaultChat, storage: creationTimeChatStorageResource(key, chat, defaultChat) }));
	}

	private async _readMirroredPeers(session: URI): Promise<string[]> {
		const reference = await this._sessionDataService.tryOpenDatabase(session);
		if (!reference) {
			return [];
		}
		try {
			const raw = await reference.object.getMetadata(PEER_CHATS_MIRROR_KEY);
			const parsed: unknown = raw ? JSON.parse(raw) : [];
			return Array.isArray(parsed) ? parsed.flatMap((entry: { readonly uri?: unknown } | null) => typeof entry?.uri === 'string' ? [entry.uri] : []) : [];
		} catch (error) {
			this._logService.warn(`[AgentHostSessionStateStore] Ignoring malformed peer-chat mirror of ${session.toString()}: ${toErrorMessage(error)}`);
			return [];
		} finally {
			reference.dispose();
		}
	}

	private _importData(session: string, chats: readonly IImportedChat[], reads: MirrorReads): IAgentHostSessionStateImport {
		const isDefault = (chat: string) => chats.some(entry => entry.chat === chat && entry.isDefault);
		const observe = (entry: SessionStateMirrorEntry) => observeMirrorEntry(session, undefined, entry, reads, isDefault);
		const values: Record<string, string> = {};
		const folders: IAgentHostSessionStateImport['folders'][number][] = [];
		const branchChangesets: { scopeKey: string; diffs: string }[] = [];
		const base = new Map<string, string>();
		for (const entry of observedMirrorEntries(session, reads)) {
			const observed = observe(entry);
			if (!observed) {
				continue;
			}
			base.set(mirrorEntryId(entry), observed.compare);
			switch (entry.kind) {
				case 'value': values[entry.key] = observed.content; break;
				case 'folder': folders.push({ folderKey: entry.folderKey, kind: entry.folderKind, value: observed.content, storageResource: undefined }); break;
				case 'blob': branchChangesets.push({ scopeKey: entry.scopeKey, diffs: observed.content }); break;
			}
		}
		const archived = observeLegacyArchived(session, reads);
		if (archived !== undefined) {
			values[AH_META_IS_ARCHIVED_DB_KEY] = archived;
		}
		const importedChats = chats.map((chat): IAgentHostSessionChatStateData => {
			const patch = mergePatches(mirroredChatFields(chat.isDefault).map(field => {
				const entry: SessionStateMirrorEntry = { kind: 'chat', field, chat: chat.chat };
				const observed = observe(entry);
				if (observed) {
					base.set(mirrorEntryId(entry), observed.compare);
				}
				return patchFromMirror(undefined, entry, observed, isDefault);
			})).chats[0].fields;
			return {
				chat: chat.chat,
				isDefault: chat.isDefault,
				storageResource: chat.storage,
				title: patch.title ?? undefined,
				titleSource: patch.titleSource ?? undefined,
				isRead: patch.isRead ?? undefined,
				workingDirectories: patch.workingDirectories ?? undefined,
				launchWorkingDirectories: undefined,
				changes: patch.changes ?? undefined,
			};
		});
		return {
			importVersion: SESSION_STATE_IMPORT_VERSION,
			importedAt: Date.now(),
			values,
			folders,
			chats: importedChats,
			branchChangesets,
			legacyMirrorBase: serializeBase(base),
			launchDirsBackfilled: false,
			checkpoints: [],
			checkpointSequence: 0,
			checkpointRepositories: [],
		};
	}

	// ---- Reconciliation -------------------------------------------------------------

	/**
	 * Imports older builds' edits of the mirrors and marks stale mirrors dirty:
	 * per entry, a mirror that differs from the merge base was edited after this
	 * build last wrote it, so it wins; otherwise central state wins.
	 */
	private async _reconcileLocked(record: ISessionRecord, observedReads: MirrorReads | undefined): Promise<void> {
		const model = record.model;
		const chats = model.authority === 1 ? [...model.chats.values()].map(chat => ({ chat: chat.chat, isDefault: chat.isDefault })) : [];
		const baseBranchStorages = [...model.folders.values()].flatMap(folder => folder.kind === 'baseBranch' && folder.storage !== undefined ? [folder.storage] : []);
		const reads = observedReads ?? await this._observe(record.key, chats, baseBranchStorages);
		const isDefault = (chat: string) => model.chats.get(chat)?.isDefault ?? false;
		const entries = new Map<string, SessionStateMirrorEntry>();
		for (const entry of [...model.entries(), ...observedMirrorEntries(record.key, reads), ...[...record.base.keys()].map(parseMirrorEntryId)]) {
			if (entry.kind !== 'chat' || model.authority === 1) {
				entries.set(mirrorEntryId(entry), entry);
			}
		}
		const patches: Partial<ISessionStatePatch>[] = [];
		const base = new Map(record.base);
		for (const [id, entry] of entries) {
			const observed = observeMirrorEntry(record.key, model, entry, reads, isDefault);
			if (observed?.compare !== record.base.get(id)) {
				patches.push(patchFromMirror(model, entry, observed, isDefault));
				if (observed) {
					base.set(id, observed.compare);
				} else {
					base.delete(id);
				}
			} else if (renderMirrorEntry(model, entry) !== observed?.compare) {
				record.dirty.add(id);
			}
		}
		if (patches.length > 0) {
			const revision = await this._writeCentral(record, mergePatches(patches), false);
			record.base = base;
			await this._database.recordSessionStateLegacyMirrorPayload(record.key, revision, serializeBase(base));
		}
		await this._flushLocked(record);
	}

	private async _observe(session: string, chats: readonly { readonly chat: string; readonly isDefault: boolean }[], baseBranchStorages: readonly string[]): Promise<MirrorReads> {
		return this._read(planMirrorReads(session, chats, baseBranchStorages));
	}

	/** Reads planned keys from existing databases only; a missing database holds nothing. */
	private async _read(plans: ReadonlyMap<string, IMirrorReadPlan>): Promise<MirrorReads> {
		const limiter = new Limiter<readonly [string, Record<string, string | undefined>]>(MIRROR_READ_CONCURRENCY);
		const results = await Promise.all([...plans].map(([resource, plan]) => limiter.queue(async () => {
			const reference = await this._sessionDataService.tryOpenDatabase(URI.parse(resource));
			if (!reference) {
				return [resource, {}] as const;
			}
			try {
				const values: Record<string, string | undefined> = await reference.object.getMetadataObject(Object.fromEntries([...plan.keys].map(key => [key, true])));
				for (const prefix of plan.prefixes) {
					Object.assign(values, await reference.object.getMetadataByPrefix(prefix));
				}
				return [resource, values] as const;
			} finally {
				reference.dispose();
			}
		})));
		limiter.dispose();
		return new Map(results);
	}

	// ---- Writing ----------------------------------------------------------------------

	/** Writes central state first. Mirror entries the patch changes become dirty when `markDirty`. */
	private async _writeCentral(record: ISessionRecord, patch: ISessionStatePatch, markDirty: boolean): Promise<number> {
		if (this._deleting.has(record.key)) {
			throw new SessionStateDeletedError(record.key);
		}
		const entries = patchMirrorEntries(patch);
		const databasePatch = toDatabasePatch(patch, entries.some(isProjectedMirrorEntry));
		let result = await this._database.writeSessionState(record.key, record.model.revision, databasePatch);
		if (result.status === 'conflict') {
			// Only an external repair of the same database can move the revision.
			const state = await this._database.readSessionState(record.key);
			if (state) {
				record.model = new SessionStateModel(state, record.model.authority);
			}
			result = await this._database.writeSessionState(record.key, record.model.revision, databasePatch);
		}
		if (result.status !== 'applied') {
			throw new Error(`Cannot write the session state of ${record.key}: ${result.status}`);
		}
		record.model.apply(patch, result.revision);
		record.snapshot = undefined;
		if (markDirty) {
			for (const entry of entries) {
				if (entry.kind !== 'chat' || record.model.authority === 1) {
					record.dirty.add(mirrorEntryId(entry));
				}
			}
		}
		return result.revision;
	}

	private _noteMirrored(record: ISessionRecord, revision: number, entries: readonly string[]): void {
		for (const id of entries) {
			const entry = parseMirrorEntryId(id);
			if (record.model.entryRevision(entry) <= revision) {
				record.dirty.delete(id);
				this._setBase(record, id, renderMirrorEntry(record.model, entry));
			}
		}
	}

	private _setBase(record: ISessionRecord, id: string, value: string | undefined): void {
		if (value === undefined) {
			record.base.delete(id);
		} else {
			record.base.set(id, value);
		}
	}

	private _scheduledFlush(record: ISessionRecord): void {
		// The timer was armed inside an exclusive section; the flush runs in its own.
		this._held.exit(() => this._sequencer.queue(record.sequencerKey, () => this._flushLocked(record))).catch(error => {
			this._logService.error(error, `[AgentHostSessionStateStore] Failed to write the session state mirrors of ${record.key}`);
		});
	}

	/** Writes the dirty entries' old format, then acknowledges the revision once nothing is dirty. */
	/** Resolves to the first mirror write failure of this flush, which stays dirty and is retried. */
	private async _flushLocked(record: ISessionRecord): Promise<unknown> {
		let failure: unknown;
		if (record.dirty.size > 0) {
			const entries = [...record.dirty].map(parseMirrorEntryId);
			const blobs = new Map<string, string | undefined>();
			for (const entry of entries) {
				if (entry.kind === 'blob') {
					blobs.set(entry.scopeKey, await this._database.readBranchChangeset(record.key, entry.scopeKey));
				}
			}
			const isDefault = (chat: string) => record.model.chats.get(chat)?.isDefault ?? false;
			const writes = renderMirrorWrites(record.key, record.model, entries, isDefault, scopeKey => blobs.get(scopeKey));
			for (const [resource, write] of writes) {
				const reference = this._sessionDataService.openDatabase(URI.parse(resource));
				try {
					await reference.object.applyMetadataChanges(write.set, write.remove);
					for (const id of write.entries) {
						record.dirty.delete(id);
						this._setBase(record, id, write.written.get(id));
					}
				} catch (error) {
					failure ??= error;
					if (!record.mirrorFailureLogged) {
						record.mirrorFailureLogged = true;
						this._logService.error(error, `[AgentHostSessionStateStore] Failed to write session state mirrors of ${record.key} to ${resource}`);
					}
				} finally {
					reference.dispose();
				}
			}
		}
		const model = record.model;
		if (record.dirty.size > 0) {
			await this._database.recordSessionStateLegacyMirrorPayload(record.key, model.revision, serializeBase(record.base));
		} else if (model.legacyMirroredRevision < model.revision) {
			if (await this._database.markSessionStateLegacyMirrored(record.key, model.revision, serializeBase(record.base))) {
				model.legacyMirroredRevision = model.revision;
			}
		}
		return failure;
	}

	// ---- Snapshots -----------------------------------------------------------------------

	private _forget(key: string): void {
		const record = this._records.get(key);
		if (record) {
			record.scheduler.dispose();
			this._records.delete(key);
		}
	}

	private _values(record: ISessionRecord, keys: readonly string[]): ReadonlyMap<string, string> {
		const values = new Map<string, string>();
		for (const key of keys) {
			const value = record.model.values.get(key)?.value;
			if (value !== undefined) {
				values.set(key, value);
			}
		}
		return values;
	}

	private _snapshot(record: ISessionRecord): ISessionStateSnapshot {
		if (record.snapshot) {
			return record.snapshot;
		}
		const model = record.model;
		const values = new Map<string, string>();
		for (const [key, entry] of model.values) {
			if (entry.value !== undefined) {
				values.set(key, entry.value);
			}
		}
		const folders = new Map<string, ISessionStateFolderEntry>();
		for (const folder of model.folders.values()) {
			const current = folders.get(folder.folderKey) ?? { git: undefined, github: undefined, baseBranch: undefined, baseBranchStorage: undefined };
			folders.set(folder.folderKey, folder.kind === 'baseBranch'
				? { ...current, baseBranch: folder.value, baseBranchStorage: folder.storage }
				: { ...current, [folder.kind]: folder.value });
		}
		const chats = new Map<string, ISessionStateChatEntry>();
		for (const chat of model.chats.values()) {
			chats.set(chat.chat, {
				isDefault: chat.isDefault,
				storage: chat.storageResource,
				title: chat.title,
				titleSource: chat.titleSource,
				isRead: chat.isRead,
				workingDirectories: chat.workingDirectories,
				launchWorkingDirectories: chat.launchWorkingDirectories,
				changes: chat.changes,
			});
		}
		record.snapshot = { session: record.key, authority: model.authority, revision: model.revision, values, folders, chats };
		return record.snapshot;
	}
}
