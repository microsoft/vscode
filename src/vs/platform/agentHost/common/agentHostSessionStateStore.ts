/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../base/common/uri.js';
import { createDecorator } from '../../instantiation/common/instantiation.js';

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
	/** `null` removes a branch-changes blob. */
	readonly branchChangesets: readonly { readonly scopeKey: string; readonly diffs: string | null }[];
}

/** Builds a {@link ISessionStatePatch}, leaving omitted parts empty. */
export function sessionStatePatch(patch: Partial<ISessionStatePatch>): ISessionStatePatch {
	return {
		values: patch.values ?? {},
		folders: patch.folders ?? [],
		chats: patch.chats ?? [],
		branchChangesets: patch.branchChangesets ?? [],
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
export interface IAgentHostSessionStateStore {
	readonly _serviceBrand: undefined;
	/**
	 * Loads the session's central state: imports it from session.db once when
	 * there is none, and on the first load in this process imports older builds'
	 * mirror edits and repairs stale mirrors. Never called by listing or startup.
	 */
	load(session: URI): Promise<ISessionStateSnapshot>;
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
	/** Reads one branch-changes blob; `''` is the session folder's. */
	readBranchChangeset(session: URI, scopeKey: string): Promise<string | undefined>;
	/** Writes pending mirrors of `session`, or of every session. */
	whenIdle(session: URI | undefined): Promise<void>;
	/** Writes pending mirrors and refuses further writes until disposed. */
	beginDeletion(session: URI): { readonly whenDrained: Promise<void>; dispose(): void };
	/** Writes pending mirrors and forgets the loaded state. */
	evict(session: URI): Promise<void>;
}
