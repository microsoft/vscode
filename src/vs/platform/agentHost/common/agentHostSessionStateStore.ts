/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';
import { getWorkingDirectoryKey, getWorkingDirectoryScopeId } from './agentHostWorkingDirectories.js';
import type { IPersistedTurnRecord } from './sessionDataService.js';
import type { Message } from './state/sessionState.js';
import type { AgentProvider } from './agent.js';

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

/** The folders around a chat move, all as working directory URIs (index 0 = primary). */
export interface ISessionStateChatMoveFolders {
	/** The source session's folders. */
	readonly source: readonly string[];
	/** The target session's folders, after any folder the move adds to it. */
	readonly target: readonly string[];
	/** The folders the moved chat works in. */
	readonly chat: readonly string[];
	/** Whether the moved chat had its own folders in the source (else it inherited the source's). */
	readonly chatHadOwnFolders: boolean;
	/** The folders each chat that stays in the source works in (its default chat, which always stays for a peer move: the source's folders, unless it has its own). */
	readonly remaining: readonly (readonly string[])[];
}

/** A chat (with its private descendants) moving to another session, as the session state store commits it. */
export interface ISessionStateChatMove {
	readonly source: URI;
	readonly target: URI;
	readonly chat: URI;
	/** The visible chat of the target to place the moved chat after; `undefined` places it first. */
	readonly after: URI | undefined;
	/** The catalog revisions the move was validated against. */
	readonly expectedSourceCatalogRevision: number;
	readonly expectedTargetCatalogRevision: number;
	readonly folders: ISessionStateChatMoveFolders;
}

export type SessionStateChatMoveResult =
	| { readonly status: 'applied'; readonly moved: readonly string[]; readonly targetOrder: readonly string[] }
	| { readonly status: 'conflict' | 'notReady' | 'notImported' | 'missingSession' | 'tombstoned' | 'olderBuildEdits' };

/** Promotes a chat and its descendants into a new session (Block 4). */
export interface ISessionStateChatPromotion {
	readonly source: URI;
	/** The new session; it must not exist yet. */
	readonly target: URI;
	readonly chat: URI;
	readonly provider: AgentProvider;
	readonly startTime: number;
	/** The source's catalog revision the promotion was validated against. */
	readonly expectedSourceCatalogRevision: number;
	/** The new session's session-level values, keyed like {@link ISessionStateSnapshot.values}. */
	readonly values: Readonly<Record<string, string>>;
	/** The source's folders, the promoted chat's (the new session's) and those of the chats staying in the source. */
	readonly folders: Omit<ISessionStateChatMoveFolders, 'target'>;
}

export type SessionStateChatPromotionResult =
	| { readonly status: 'applied'; readonly moved: readonly string[] }
	| { readonly status: 'conflict' | 'notReady' | 'notImported' | 'missingSession' | 'tombstoned' | 'olderBuildEdits' };

/** One per-folder state row a chat move carries: re-keyed, or copied when the source keeps using the folder. */
export interface ISessionStateChatMoveFolder {
	readonly kind: SessionStateFolderKind;
	readonly sourceKey: string;
	readonly targetKey: string;
	readonly keepInSource: boolean;
}

/**
 * The per-folder state a moved chat takes along (Block 4): for each of its folders, the git and GitHub rows,
 * and the base branch of its folder scope. A row is re-keyed when no chat staying in the source uses the folder,
 * else copied. The moved chat always has its own folders in the target, so its base branch is keyed by their scope.
 * A row the target already has wins; the store applies that.
 */
export function chatMoveFolderTransfers(folders: ISessionStateChatMoveFolders): readonly ISessionStateChatMoveFolder[] {
	const key = (directory: string) => getWorkingDirectoryKey(directory);
	const remainingKeys = new Set(folders.remaining.flatMap(directories => directories.map(key)));
	const sourcePrimary = folders.source[0] === undefined ? undefined : key(folders.source[0]);
	const targetPrimary = folders.target[0] === undefined ? undefined : key(folders.target[0]);
	const transfers: ISessionStateChatMoveFolder[] = [];
	for (const directory of folders.chat) {
		const folder = key(directory);
		const keepInSource = remainingKeys.has(folder);
		const targetGitKey = folder === targetPrimary ? '' : folder;
		// The source's primary folder keeps its git state under the session folder key ('').
		transfers.push({ kind: 'git', sourceKey: folder === sourcePrimary ? '' : folder, targetKey: targetGitKey, keepInSource });
		if (folder === sourcePrimary) {
			transfers.push({ kind: 'git', sourceKey: folder, targetKey: targetGitKey, keepInSource });
		}
		transfers.push({ kind: 'github', sourceKey: folder, targetKey: folder, keepInSource });
	}
	if (folders.chat.length > 0) {
		const sourceScope = folders.chatHadOwnFolders ? getWorkingDirectoryScopeId(folders.chat) : '';
		// The session folder's base branch ('') is the default chat's: it stays while any chat stays.
		const sourceKept = sourceScope === ''
			? folders.remaining.length > 0
			: folders.remaining.some(directories => directories.length > 0 && getWorkingDirectoryScopeId(directories) === sourceScope);
		transfers.push({ kind: 'baseBranch', sourceKey: sourceScope, targetKey: getWorkingDirectoryScopeId(folders.chat), keepInSource: sourceKept });
	}
	return transfers;
}

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

/** Central session values of a session that has central state, and whether its old-format mirrors are current. */
export interface ISessionStateValuesPrefetchEntry {
	readonly values: ReadonlyMap<string, string>;
	readonly mirrored: boolean;
}

/** Central session values by session; `undefined` for a session without central state. Loaded sessions are absent. */
export type SessionStateValuesPrefetch = ReadonlyMap<string, ISessionStateValuesPrefetchEntry | undefined>;

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

/** A read-only, non-importing view of a session's old-format metadata (see {@link IAgentHostSessionStateStore.openMetadataWithoutImport}). */
export interface ISessionStateMetadataReader {
	getMetadata(key: string): Promise<string | undefined>;
	getMetadataObject<T extends Record<string, unknown>>(keys: T): Promise<{ [K in keyof T]: string | undefined }>;
}

/** Thrown for writes to a session whose deletion has begun. */
export class SessionStateDeletedError extends Error {
	constructor(session: string) {
		super(`Session state of ${session} is being deleted`);
	}
}

/** Thrown for a chat passed where a session is expected: a chat's state is kept by its session, never as a session's. */
export class SessionStateNotASessionError extends Error {
	constructor(resource: string, owner: string | undefined, kind: 'chat' | 'worktree record' = 'chat') {
		super(owner === undefined ? `${resource} is a ${kind}, not a session` : `${resource} is a ${kind} of ${owner}, not a session`);
	}
}

/** The part of a session's catalog row the store needs to import it. */
export interface ISessionStateKnownCatalog {
	readonly authorityVersion: 1 | 2;
	readonly header?: { readonly defaultChatUri?: string };
	/** The chats a normalized catalog records, with their recorded storage, when the caller read them. */
	readonly chats?: readonly { readonly chat: string; readonly storageResource?: string }[];
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
	/** The config values `chat` sets for itself (`ChatState.config`), read from its own database. */
	getChatConfig(session: URI, chat: URI): Promise<Record<string, unknown> | undefined>;
	/**
	 * Stores the config values `chat` sets for itself in its own database only:
	 * older builds never read them, so nothing is mirrored.
	 */
	setChatConfig(session: URI, chat: URI, values: Readonly<Record<string, unknown>>): Promise<void>;
	/**
	 * The database holding `chat`'s own rows (its checkpoint rows among them) and whether
	 * `chat` is the session's recorded default chat; `undefined` for a chat the central state
	 * does not know (yet), which is never taken for the default chat.
	 */
	storageOf(session: URI, chat: URI): Promise<{ readonly storage: URI; readonly isDefault: boolean } | undefined>;
}

/**
 * The single owner of session-level state, per-folder state and per-chat
 * summaries. agent-host.db holds them authoritatively; the store keeps the
 * old format older builds read in session.db (the mirror) and imports edits
 * those builds make there. Nothing else reads or writes these session.db keys.
 */
export interface IAgentHostSessionStateStore {
	readonly _serviceBrand: undefined;
	/** Per-chat drafts and persisted turns. */
	readonly chatRows: IAgentHostChatRowStore;
	/**
	 * Loads the session's central state: imports it from session.db once when
	 * there is none, and on the first load in this process imports older builds'
	 * mirror edits and repairs stale mirrors. Never called by listing or startup.
	 */
	load(session: URI): Promise<ISessionStateSnapshot>;
	/** Like {@link load}, for callers that already read the session's catalog row (`undefined` = no row) and want to avoid a second read. */
	loadWithCatalog(session: URI, catalog: ISessionStateKnownCatalog | undefined): Promise<ISessionStateSnapshot>;
	/**
	 * Records the default chat of a session the host has just minted, before any catalog records it:
	 * its import takes this chat as the default chat, rather than the legacy derivation, when its
	 * catalog has no header yet. In memory only; ignored once the session is imported.
	 */
	noteCreatedSession(session: URI, defaultChat: URI): void;
	/**
	 * Re-reads the catalog authority of a loaded session after its chat catalog was normalized. A session loaded while its
	 * catalog was a legacy one would otherwise keep mirroring its chat fields the legacy way.
	 */
	noteCatalogNormalized(session: URI): Promise<void>;
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
	readWithoutImport(session: URI, keys: readonly string[], prefetch?: SessionStateValuesPrefetch): Promise<ReadonlyMap<string, string>>;
	/**
	 * The base branch recorded for the folder scope of `chat` (the session's when `undefined`), as
	 * {@link readSessionBaseBranch} reads it, without importing: from central state when the session was
	 * imported, else what the scope's own database holds. Never creates storage.
	 */
	readBaseBranchWithoutImport(session: URI, chat: string | undefined): Promise<string | undefined>;
	/**
	 * A reader of a session's old-format metadata for code that reads a session database's keys, without
	 * importing: {@link readWithoutImport} for every read. `undefined` when the session has neither central
	 * state nor a session database, as `ISessionDataService.tryOpenDatabase` reports a missing database.
	 */
	openMetadataWithoutImport(session: URI): Promise<ISessionStateMetadataReader | undefined>;
	/**
	 * One central read of the session values of `sessions`, for {@link readWithoutImport} to reuse, so a page
	 * of sessions costs one agent-host.db query and at most one session.db read per session. Never imports.
	 */
	prefetchWithoutImport(sessions: readonly URI[]): Promise<SessionStateValuesPrefetch>;
	/** {@link readWithoutImport} of session values for many sessions, with one central read for all of them. */
	readValuesWithoutImport(sessions: readonly URI[], keys: readonly string[]): Promise<ReadonlyMap<string, ReadonlyMap<string, string>>>;
	/** Imports session values a provider wrote to session.db itself; differing mirror values win. */
	refreshFromMirror(session: URI, keys: readonly string[]): Promise<void>;
	/**
	 * Forgets a non-default chat that is being deleted: removes its central rows
	 * and its row copies in the session database (drafts, local and failed
	 * turns). Its own storage is deleted by the caller.
	 */
	deleteChat(session: URI, chat: URI): Promise<void>;
	/**
	 * Moves a chat and its private descendants to another session (Block 4). Holds both sessions, then commits the
	 * catalog move and the chats' central state (their chat rows, pinned to the chat's folders, and the per-folder
	 * state of {@link chatMoveFolderTransfers}) in one agent-host.db transaction, and refreshes both loaded states.
	 * Writes nothing to either session's old-format mirrors: older builds see the move through the catalog.
	 */
	moveChat(move: ISessionStateChatMove): Promise<SessionStateChatMoveResult>;

	/**
	 * Moves a session whose only visible chat is its default chat under another session (Block 4, VS Code-internal):
	 * like {@link moveChat} for that chat, which becomes a peer of the target keeping the source's database as its
	 * storage, and the source session ends in the same transaction (its registration, catalog and central state;
	 * never its data). The source's loaded state is dropped.
	 */
	moveSession(move: ISessionStateChatMove): Promise<SessionStateChatMoveResult>;

	/**
	 * Promotes a chat and its private descendants into a new session (Block 4). Holds the source and the new
	 * session, then registers the new session and commits its catalog, its imported central state (the promoted chat
	 * as its default chat, pinned to its folders, the given session values, and the per-folder state of
	 * {@link chatMoveFolderTransfers} into the chat's folders) and the source's change in one agent-host.db
	 * transaction, and refreshes the source's loaded state. The new session loads on first use.
	 */
	promoteChat(promotion: ISessionStateChatPromotion): Promise<SessionStateChatPromotionResult>;
	/**
	 * Writes pending mirrors of `session`. Without a session, first waits for every operation already queued (so no
	 * write a caller started is still in flight), then writes every pending mirror: what shutdown waits for.
	 */
	whenIdle(session: URI | undefined): Promise<void>;
	/** Writes pending mirrors and refuses further writes until disposed. */
	beginDeletion(session: URI): { readonly whenDrained: Promise<void>; dispose(): void };
	/** Writes pending mirrors and forgets the loaded state. */
	evict(session: URI): Promise<void>;
}
