/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { getWorkingDirectoryScopeId } from './agentHostWorkingDirectories.js';
import type { IPersistedTurnRecord } from './sessionDataService.js';
import type { Message } from './state/sessionState.js';

export const IAgentHostSessionStateStore = createDecorator<IAgentHostSessionStateStore>('agentHostSessionStateStore');

/** When a write reaches the old-format mirrors older builds read from session.db. */
export const enum SessionStateMirrorFlush {
	/** Within the store's coalescing window, or at the next idle, eviction, deletion or shutdown. */
	Coalesced = 'coalesced',
	/** Before the write's exclusive section ends. */
	Immediate = 'immediate',
}

export type SessionStateTitleSource = 'user' | 'agent' | 'auto';

/** A chat's central values. `undefined` means nothing is recorded. */
export interface ISessionStateChatEntry {
	readonly isDefault: boolean;
	/** Recorded storage of the chat's own database. */
	readonly storage: string | undefined;
	readonly title: string | undefined;
	readonly titleSource: SessionStateTitleSource | undefined;
	/** The default chat's own read flag. */
	readonly isRead: boolean | undefined;
	/** Directories shown for the chat; `undefined` shows the session's. */
	readonly workingDirectories: readonly string[] | undefined;
	/** Directories the provider launches the chat in when its own storage has none. */
	readonly launchWorkingDirectories: readonly string[] | undefined;
	/** JSON of the chat's changes summary. */
	readonly changes: string | undefined;
	/** Whether the chat is the conversation adopted from the extension-host Copilot CLI; central only, never mirrored. */
	readonly ehcliAdopted: boolean | undefined;
	/** The last turn that existed when the chat was adopted; central only, never mirrored. */
	readonly ehcliLastMigratedTurn: string | undefined;
}

export interface ISessionStateFolderEntry {
	readonly git: string | undefined;
	readonly github: string | undefined;
	readonly baseBranch: string | undefined;
	/** Database older builds read the base branch from; `undefined` means the session's. */
	readonly baseBranchStorage: string | undefined;
}

/** Central session state of one session. */
export interface ISessionStateSnapshot {
	readonly session: string;
	/** Chat catalog authority: 1 = legacy peer-chat catalog, 2 = normalized catalog. */
	readonly authority: 1 | 2;
	readonly revision: number;
	/** Session-level values, by session.db metadata key. */
	readonly values: ReadonlyMap<string, string>;
	/** Per-folder state by folder key: `''` for the session folder, else an opaque key or scope id. */
	readonly folders: ReadonlyMap<string, ISessionStateFolderEntry>;
	/** Per-chat values of a legacy-catalog session, by chat URI. */
	readonly chats: ReadonlyMap<string, ISessionStateChatEntry>;
}

/**
 * The base-branch folder key of a chat's own database: the scope of the
 * chat's own working directories, or `''` (the session folder) when it has none or is the default chat.
 */
export function baseBranchFolderKey(chat: { readonly isDefault: boolean; readonly workingDirectories: readonly string[] | undefined } | undefined): string {
	return chat && !chat.isDefault && chat.workingDirectories?.length ? getWorkingDirectoryScopeId(chat.workingDirectories) : '';
}

/** The base branch recorded for the scope of `chat` (a chat URI, or the session when `undefined`), as the Branch Changes baseline. */
export function readSessionBaseBranch(snapshot: ISessionStateSnapshot, chat: string | undefined): string | undefined {
	const entry = chat === undefined ? undefined : snapshot.chats.get(chat);
	if (chat !== undefined && snapshot.authority === 1 && (!entry || (!entry.isDefault && !entry.workingDirectories?.length))) {
		// A peer without its own folders (or unknown to the catalog) never inherits the session's base branch.
		return undefined;
	}
	return snapshot.folders.get(baseBranchFolderKey(entry))?.baseBranch;
}

export type SessionStateChatField = keyof Omit<ISessionStateChatEntry, 'isDefault'>;

export interface ISessionStateChatPatch {
	readonly chat: string;
	readonly isDefault: boolean;
	/** Fields to change: omitted fields stay, `null` clears. */
	readonly fields: { readonly [K in SessionStateChatField]?: ISessionStateChatEntry[K] | null };
}

export type SessionStateFolderKind = 'git' | 'github' | 'baseBranch';

export interface ISessionStateFolderPatch {
	readonly folderKey: string;
	readonly kind: SessionStateFolderKind;
	readonly value: string | null;
	/** For `baseBranch`: the database older builds read it from; `null` for the session's. */
	readonly storage: string | null;
}

export interface ISessionStatePatch {
	/** `null` deletes a value. */
	readonly values: Readonly<Record<string, string | null>>;
	readonly folders: readonly ISessionStateFolderPatch[];
	readonly chats: readonly ISessionStateChatPatch[];
}

/** Builds a {@link ISessionStatePatch}, leaving omitted parts empty. */
export function sessionStatePatch(patch: Partial<ISessionStatePatch>): ISessionStatePatch {
	return {
		values: patch.values ?? {},
		folders: patch.folders ?? [],
		chats: patch.chats ?? [],
	};
}

/** The session's state inside {@link IAgentHostSessionStateStore.runExclusive}. Only this object may touch the session. */
export interface ISessionStateExclusive {
	readonly snapshot: ISessionStateSnapshot;
	/** Writes central state first; returns the new revision. */
	write(patch: ISessionStatePatch, flush: SessionStateMirrorFlush): Promise<number>;
	/**
	 * Records mirror entries the caller wrote to session.db itself, in the old
	 * format, for central `revision`, so the store neither rewrites them nor
	 * mistakes them for an older build's edit.
	 */
	noteMirrored(revision: number, entries: readonly string[]): void;
	/**
	 * Adopts old-format session values the caller is about to write to session.db
	 * itself (keys the store does not own are ignored). Returns the revision and
	 * the entries the raw write leaves exactly as the store would render them,
	 * to pass to {@link noteMirrored} once the write succeeded. Does not mark the
	 * catalog payload dirty: the caller is itself synchronizing the catalog.
	 */
	writeLegacyMetadata(values: Readonly<Record<string, string | null>>, flush: SessionStateMirrorFlush): Promise<{ readonly revision: number; readonly entries: readonly string[] }>;
}

/** Old-format session.db values rendered from central state. */
export interface ISessionStateLegacyMetadata {
	/** Values of the requested keys the store owns; `undefined` when absent. */
	readonly values: Readonly<Record<string, string | undefined>>;
	/** Requested keys the store does not own; callers read them from session.db as before. */
	readonly unowned: readonly string[];
}

/** Metadata reads in the old format, the shape the session catalog projection consumes. */
export interface ISessionStateMetadataReference {
	readonly object: {
		getMetadataObject<T extends Record<string, unknown>>(keys: T): Promise<{ [K in keyof T]: string | undefined }>;
	};
}

/** Thrown when the store is called for a session whose exclusive section the caller holds. */
export class SessionStateReentrancyError extends Error {
	constructor(session: string) {
		super(`Session state of ${session} is already held by this exclusive section`);
	}
}

/** Thrown for writes to a session whose deletion has begun. */
export class SessionStateDeletedError extends Error {
	constructor(session: string) {
		super(`Session state of ${session} is being deleted`);
	}
}

/**
 * The single owner of session-level state, per-folder state and per-chat
 * summaries. agent-host.db holds them authoritatively; the store keeps the
 * old format older builds read in session.db (the mirror) and imports edits
 * those builds make there. Nothing else reads or writes these session.db keys.
 */
/** The part of a session's catalog row the store needs to import it. */
export interface ISessionStateKnownCatalog {
	readonly authorityVersion: 1 | 2;
	readonly header?: { readonly defaultChatUri?: string };
}

/**
 * Per-chat rows: drafts and host-persisted (local and failed) turns. A chat's
 * rows live in the chat's own database, the authority; rows of a chat whose
 * storage is not the session database are mirrored into the session database
 * for older builds. Reads never create a database and never touch the mirror.
 */
export interface IAgentHostChatRowStore {
	getDraft(session: URI, chat: URI): Promise<Message | undefined>;
	setDraft(session: URI, chat: URI, draft: Message | undefined): Promise<void>;
	/** The persisted turns of `chat`, ordered by `seq`. */
	getPersistedTurns(session: URI, chat: URI): Promise<Array<IPersistedTurnRecord & { seq: number }>>;
	/** Persists `record` for `record.chatUri`. */
	insertPersistedTurn(session: URI, record: IPersistedTurnRecord): Promise<void>;
	deletePersistedTurns(session: URI, chat: URI, turnIds: readonly string[]): Promise<void>;
}

/** Where one chat's checkpoint row of a turn lives. */
export interface IAgentHostCheckpointEntry {
	readonly chat: URI;
	readonly turnId: string;
	/** The database holding the chat's checkpoint row. */
	readonly storage: URI;
	readonly ref: string;
}

/**
 * The session-wide index of turn checkpoints: which chat's database holds the
 * checkpoint row of a turn, the checkpoint number counter and the repositories
 * holding checkpoint refs. The rows themselves live in the chats' databases.
 */
export interface IAgentHostCheckpointIndex {
	/** Allocates the next checkpoint number of the session, above `observedMax` and every number handed out before. */
	allocate(session: URI, observedMax: number): Promise<number>;
	/** Indexes the checkpoint row of `turnId` in `chat`'s database `storage` and records `repositoryRoot`. */
	record(session: URI, chat: URI, turnId: string, storage: URI, ref: string, repositoryRoot: URI | undefined): Promise<void>;
	/**
	 * The checkpoint row of `turnId`: `chat`'s own, else when the turn id is shared by chats (a fork
	 * inherits its source's turn ids) the only one, the one all chats agree on or the default chat's.
	 */
	resolve(session: URI, turnId: string, chat: URI | undefined): Promise<IAgentHostCheckpointEntry | undefined>;
	forget(session: URI, chat: URI, turnIds: readonly string[]): Promise<void>;
	/** Repositories that hold checkpoint refs of the session. */
	repositories(session: URI): Promise<readonly URI[]>;
	/** The session's default chat, or `undefined` when none is recorded. */
	defaultChat(session: URI): Promise<URI | undefined>;
	/** The storage of `chat` as recorded in the session state; `storage` is the session itself for the default chat. */
	storageOf(session: URI, chat: URI): Promise<{ readonly storage: URI; readonly isDefault: boolean }>;
}

export interface IAgentHostSessionStateStore {
	readonly _serviceBrand: undefined;
	/** Per-chat drafts and persisted turns. */
	readonly chatRows: IAgentHostChatRowStore;
	/** Index of the turn checkpoints of every chat. */
	readonly checkpoints: IAgentHostCheckpointIndex;
	/**
	 * Loads the session's central state: imports it from session.db once when
	 * there is none, and on the first load in this process imports older builds'
	 * mirror edits and repairs stale mirrors. Never called by listing or startup.
	 */
	load(session: URI): Promise<ISessionStateSnapshot>;
	/** Like {@link load}, for callers that already read the session's catalog row (`undefined` = no row) and want to avoid a second read. */
	loadWithCatalog(session: URI, catalog: ISessionStateKnownCatalog | undefined): Promise<ISessionStateSnapshot>;
	/** The loaded state, without loading. */
	peek(session: URI): ISessionStateSnapshot | undefined;
	write(session: URI, patch: ISessionStatePatch, flush: SessionStateMirrorFlush): Promise<number>;
	/** Replaces one session value from its previous value; `null` deletes it. */
	update(session: URI, key: string, updater: (previous: string | undefined) => string | null, flush: SessionStateMirrorFlush): Promise<number>;
	/**
	 * Writes old-format metadata keys of the database opened by `resource`:
	 * keys the store owns change central state (the mirror follows), the rest
	 * go to that database. `null` removes a key.
	 */
	writeMetadata(session: URI, resource: URI, values: Readonly<Record<string, string | null>>, flush: SessionStateMirrorFlush): Promise<void>;
	/** Runs `task` with the loaded session held exclusively. The task must not call the store for the same session. */
	runExclusive<T>(session: URI, task: (exclusive: ISessionStateExclusive) => Promise<T>): Promise<T>;
	/**
	 * What session.db would hold for `keys` if every mirror were current, from
	 * the loaded state. Lets readers keep their old-format parsing while the
	 * source is central. The session must be loaded.
	 */
	legacyMetadata(session: URI, keys: readonly string[]): ISessionStateLegacyMetadata;
	/**
	 * Old-format reads for the session catalog projection inside an exclusive
	 * section: owned keys from central state, other keys from session.db.
	 */
	catalogMetadataReference(exclusive: ISessionStateExclusive): ISessionStateMetadataReference;
	/**
	 * Reads old-format keys without importing: rendered from central state when
	 * the session was imported, else what session.db holds. Never imports and
	 * never creates storage; for listings and sweeps.
	 */
	readWithoutImport(session: URI, keys: readonly string[]): Promise<ReadonlyMap<string, string>>;
	/** {@link readWithoutImport} of session values for many sessions, with one central read for all of them. */
	readValuesWithoutImport(sessions: readonly URI[], keys: readonly string[]): Promise<ReadonlyMap<string, ReadonlyMap<string, string>>>;
	/** Imports session values a provider wrote to session.db itself; differing mirror values win. */
	refreshFromMirror(session: URI, keys: readonly string[]): Promise<void>;
	/** Writes pending mirrors of `session`, or of every session. */
	whenIdle(session: URI | undefined): Promise<void>;
	/** Writes pending mirrors and refuses further writes until disposed. */
	beginDeletion(session: URI): { readonly whenDrained: Promise<void>; dispose(): void };
	/** Writes pending mirrors and forgets the loaded state. */
	evict(session: URI): Promise<void>;
}
