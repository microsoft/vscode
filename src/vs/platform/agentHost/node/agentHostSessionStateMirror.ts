/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * The old format older builds read session state in: which session.db
 * metadata keys hold which central entry, how an entry is rendered into them,
 * and how an older build's edit there is read back. Keys are the frozen
 * on-disk format; renaming one breaks downgrades.
 */

import { META_CHANGESET_BRANCH, META_CHANGES_SUMMARY, getChatChangesSummaryMetadataKey, getScopedBranchChangesetMetadataKey } from '../common/agentHostChangesetService.js';
import { META_GIT_DATA_STATE, META_GIT_STATE, META_GITHUB_DATA_STATE, META_PENDING_RECORDED_PULL_REQUESTS, META_SOURCE_CONTROL_STATE } from '../common/agentHostGitStateService.js';
import { baseBranchFolderKey, type ISessionStateChatPatch, ISessionStateFolderPatch, ISessionStatePatch, SessionStateFolderKind, SessionStateTitleSource } from '../common/agentHostSessionStateStore.js';
import { AH_META_DEV_CONTAINER_WORKTREE_DB_KEY } from '../common/meta/agentDevContainerWorktreeMeta.js';
import { REMOTE_SESSION_ORIGIN_METADATA_KEY } from '../common/meta/agentRemoteSessionMeta.js';
import { SESSION_INITIATOR_METADATA_KEY } from '../common/meta/agentSessionInitiatorMeta.js';
import { AH_META_AUTO_ARCHIVED_AT_DB_KEY, AH_META_CREATED_BY_SESSION_DB_KEY, AH_META_DEFAULT_CHAT_IS_READ_DB_KEY, AH_META_EHCLI_ADOPTED_DB_KEY, AH_META_EHCLI_LAST_TURN_DB_KEY, AH_META_IS_ARCHIVED_DB_KEY, AH_META_IS_DONE_DB_KEY, AH_META_IS_READ_DB_KEY, AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY, AH_META_WORKSPACELESS_DB_KEY, SESSION_META_FOLDER_PICKER_KEY, SESSION_META_MULTI_ROOT_KEY } from '../common/state/sessionState.js';
import { hashBranchChangeset, type IAgentHostSessionChatState, type IAgentHostSessionState } from './agentHostSessionStateDatabase.js';
import { customChatTitleMetadataKey, customChatTitleSourceMetadataKey, SESSION_ARTIFACTS_KEY, SESSION_CUSTOM_TITLE_KEY, SESSION_CUSTOM_TITLE_SOURCE_KEY, SESSION_WORKING_DIRECTORIES_KEY } from './shared/persistSessionMetadata.js';

// ---- Registry --------------------------------------------------------------

export interface ISessionStateValueKey {
	readonly key: string;
	/** Whether the session catalog projects it, so a change must rebuild the catalog payload. */
	readonly projected: boolean;
}

/** Session-level values held centrally and mirrored to the session's session.db under the same key. */
export const SESSION_STATE_VALUE_KEYS: readonly ISessionStateValueKey[] = [
	{ key: 'configValues', projected: false },
	{ key: 'customizationEnablement', projected: false },
	{ key: AH_META_IS_ARCHIVED_DB_KEY, projected: true },
	{ key: AH_META_IS_READ_DB_KEY, projected: true },
	{ key: AH_META_AUTO_ARCHIVED_AT_DB_KEY, projected: false },
	{ key: AH_META_WORKSPACELESS_DB_KEY, projected: true },
	{ key: AH_META_WORKSPACE_CONVERSION_QUARANTINED_DB_KEY, projected: false },
	{ key: AH_META_CREATED_BY_SESSION_DB_KEY, projected: true },
	{ key: AH_META_EHCLI_ADOPTED_DB_KEY, projected: true },
	{ key: AH_META_EHCLI_LAST_TURN_DB_KEY, projected: false },
	{ key: SESSION_WORKING_DIRECTORIES_KEY, projected: true },
	{ key: 'agentHost.additionalWorktrees', projected: false },
	{ key: 'copilot.worktree.branchName', projected: false },
	{ key: 'copilot.worktree.path', projected: false },
	{ key: 'copilot.worktree.repositoryRoot', projected: true },
	{ key: 'copilot.worktree.symlinkPatterns', projected: false },
	{ key: 'copilot.worktree.symlinkSourceRoot', projected: false },
	{ key: 'copilot.worktree.creationFailure', projected: false },
	{ key: SESSION_ARTIFACTS_KEY, projected: true },
	{ key: META_SOURCE_CONTROL_STATE, projected: true },
	{ key: META_PENDING_RECORDED_PULL_REQUESTS, projected: false },
	{ key: META_CHANGES_SUMMARY, projected: true },
	{ key: REMOTE_SESSION_ORIGIN_METADATA_KEY, projected: true },
	{ key: SESSION_INITIATOR_METADATA_KEY, projected: true },
	{ key: AH_META_DEV_CONTAINER_WORKTREE_DB_KEY, projected: true },
	{ key: SESSION_META_MULTI_ROOT_KEY, projected: true },
	{ key: SESSION_META_FOLDER_PICKER_KEY, projected: true },
];

/** Families of session-level values whose keys start with a prefix. */
export const SESSION_STATE_VALUE_KEY_PREFIXES: readonly ISessionStateValueKey[] = [
	{ key: 'missionControl.', projected: false },
];

const exactValueKeys = new Map(SESSION_STATE_VALUE_KEYS.map(entry => [entry.key, entry]));

/** The registry entry of a session-level value key, if it is one. */
export function getSessionStateValueKey(key: string): ISessionStateValueKey | undefined {
	return exactValueKeys.get(key) ?? SESSION_STATE_VALUE_KEY_PREFIXES.find(prefix => key.startsWith(prefix.key));
}

/** Read only at import: older builds' archive flag, read as `isArchived ?? isDone`. */
const LEGACY_IS_DONE_KEY = AH_META_IS_DONE_DB_KEY;
/** A peer's or a legacy-catalog default chat's visible working directories, in the db opened by the chat URI. */
export const CHAT_WORKING_DIRECTORIES_MIRROR_KEY = 'agentHost.chatWorkingDirectories';
export const BASE_BRANCH_MIRROR_KEY = 'agentHost.diffBaseBranch';

// ---- Entries ---------------------------------------------------------------

export type MirroredChatField = 'title' | 'titleSource' | 'isRead' | 'workingDirectories' | 'changes';

const MIRRORED_CHAT_FIELDS: readonly MirroredChatField[] = ['title', 'titleSource', 'isRead', 'workingDirectories', 'changes'];

/** One unit of the mirror: what is compared, merged and rewritten as a whole. */
export type SessionStateMirrorEntry =
	| { readonly kind: 'value'; readonly key: string }
	| { readonly kind: 'folder'; readonly folderKind: SessionStateFolderKind; readonly folderKey: string }
	| { readonly kind: 'chat'; readonly field: MirroredChatField; readonly chat: string }
	| { readonly kind: 'blob'; readonly scopeKey: string };

/** Stable identity of an entry, used in merge bases and dirty sets. */
export function mirrorEntryId(entry: SessionStateMirrorEntry): string {
	switch (entry.kind) {
		case 'value': return JSON.stringify(['value', entry.key]);
		case 'folder': return JSON.stringify(['folder', entry.folderKind, entry.folderKey]);
		case 'chat': return JSON.stringify(['chat', entry.field, entry.chat]);
		case 'blob': return JSON.stringify(['blob', entry.scopeKey]);
	}
}

export function parseMirrorEntryId(id: string): SessionStateMirrorEntry {
	const parts: unknown = JSON.parse(id);
	if (!Array.isArray(parts) || !parts.every(part => typeof part === 'string')) {
		throw new Error(`Invalid session state mirror entry ${id}`);
	}
	switch (parts[0]) {
		case 'value': return { kind: 'value', key: parts[1] };
		case 'folder': return { kind: 'folder', folderKind: parts[1] as SessionStateFolderKind, folderKey: parts[2] };
		case 'chat': return { kind: 'chat', field: parts[1] as MirroredChatField, chat: parts[2] };
		case 'blob': return { kind: 'blob', scopeKey: parts[1] };
	}
	throw new Error(`Invalid session state mirror entry ${id}`);
}

/** Whether a change of the entry must rebuild the session's catalog payload. */
export function isProjectedMirrorEntry(entry: SessionStateMirrorEntry): boolean {
	switch (entry.kind) {
		case 'value': return getSessionStateValueKey(entry.key)?.projected ?? false;
		case 'folder': return entry.folderKind !== 'baseBranch';
		case 'chat': return true;
		case 'blob': return false;
	}
}

/** Entries of a patch: the central changes the mirror has to follow. */
export function patchMirrorEntries(patch: ISessionStatePatch): SessionStateMirrorEntry[] {
	return [
		...Object.keys(patch.values).map((key): SessionStateMirrorEntry => ({ kind: 'value', key })),
		...patch.folders.map((folder): SessionStateMirrorEntry => ({ kind: 'folder', folderKind: folder.kind, folderKey: folder.folderKey })),
		...patch.chats.flatMap(chat => MIRRORED_CHAT_FIELDS.filter(field => chat.fields[field] !== undefined).map((field): SessionStateMirrorEntry => ({ kind: 'chat', field, chat: chat.chat }))),
		...patch.branchChangesets.map((blob): SessionStateMirrorEntry => ({ kind: 'blob', scopeKey: blob.scopeKey })),
	];
}

// ---- Central model ----------------------------------------------------------

function folderModelKey(kind: SessionStateFolderKind, folderKey: string): string {
	return `${kind}\n${folderKey}`;
}

/** Indexed view of a session's central state, in runtime spelling. */
export class SessionStateModel {
	readonly values = new Map<string, { readonly value: string | undefined; readonly revision: number }>();
	readonly folders = new Map<string, { readonly kind: SessionStateFolderKind; readonly folderKey: string; readonly value: string | undefined; readonly storage: string | undefined; readonly revision: number }>();
	readonly chats = new Map<string, IAgentHostSessionChatState>();
	readonly blobs = new Map<string, { readonly contentHash: string; readonly revision: number }>();
	revision: number;
	legacyMirroredRevision: number;

	constructor(state: IAgentHostSessionState, readonly authority: 1 | 2) {
		this.revision = state.header.revision;
		this.legacyMirroredRevision = state.header.legacyMirroredRevision;
		for (const value of state.values) {
			this.values.set(value.key, value);
		}
		for (const folder of state.folders) {
			this.folders.set(folderModelKey(folder.kind, folder.folderKey), { kind: folder.kind, folderKey: folder.folderKey, value: folder.value, storage: folder.storageResource, revision: folder.revision });
		}
		for (const chat of state.chats) {
			this.chats.set(chat.chat, chat);
		}
		for (const blob of state.branchChangesets) {
			this.blobs.set(blob.scopeKey, blob);
		}
	}

	folder(kind: SessionStateFolderKind, folderKey: string) {
		return this.folders.get(folderModelKey(kind, folderKey));
	}

	/** Applies a patch that was written centrally at `revision`. */
	apply(patch: ISessionStatePatch, revision: number): void {
		this.revision = revision;
		for (const [key, value] of Object.entries(patch.values)) {
			this.values.set(key, { value: value ?? undefined, revision });
		}
		for (const folder of patch.folders) {
			this.folders.set(folderModelKey(folder.kind, folder.folderKey), { kind: folder.kind, folderKey: folder.folderKey, value: folder.value ?? undefined, storage: folder.storage ?? undefined, revision });
		}
		for (const chat of patch.chats) {
			this.chats.set(chat.chat, applyChatPatch(this.chats.get(chat.chat), chat, revision));
		}
		for (const blob of patch.branchChangesets) {
			if (blob.diffs === null) {
				this.blobs.delete(blob.scopeKey);
			} else {
				const contentHash = hashBranchChangeset(blob.diffs);
				if (this.blobs.get(blob.scopeKey)?.contentHash !== contentHash) {
					this.blobs.set(blob.scopeKey, { contentHash, revision });
				}
			}
		}
	}

	/** Central revision of an entry; `0` when it has no central row. */
	entryRevision(entry: SessionStateMirrorEntry): number {
		switch (entry.kind) {
			case 'value': return this.values.get(entry.key)?.revision ?? 0;
			case 'folder': return this.folder(entry.folderKind, entry.folderKey)?.revision ?? 0;
			case 'chat': return this.chats.get(entry.chat)?.revision ?? 0;
			case 'blob': return this.blobs.get(entry.scopeKey)?.revision ?? 0;
		}
	}

	/** Every entry with a central row. Chat entries exist for legacy-catalog sessions only. */
	entries(): SessionStateMirrorEntry[] {
		return [
			...[...this.values.keys()].map((key): SessionStateMirrorEntry => ({ kind: 'value', key })),
			...[...this.folders.values()].map((folder): SessionStateMirrorEntry => ({ kind: 'folder', folderKind: folder.kind, folderKey: folder.folderKey })),
			...(this.authority === 1 ? [...this.chats.values()].flatMap(chat => mirroredChatFields(chat.isDefault).map((field): SessionStateMirrorEntry => ({ kind: 'chat', field, chat: chat.chat }))) : []),
			...[...this.blobs.keys()].map((scopeKey): SessionStateMirrorEntry => ({ kind: 'blob', scopeKey })),
		];
	}
}

/** Chat fields mirrored for a chat: the read flag only for the default chat (peers' is membership). */
export function mirroredChatFields(isDefault: boolean): readonly MirroredChatField[] {
	return isDefault ? MIRRORED_CHAT_FIELDS : MIRRORED_CHAT_FIELDS.filter(field => field !== 'isRead');
}

function applyChatPatch(current: IAgentHostSessionChatState | undefined, patch: ISessionStateChatPatch, revision: number): IAgentHostSessionChatState {
	const pick = <K extends keyof ISessionStateChatPatch['fields']>(field: K, existing: NonNullable<ISessionStateChatPatch['fields'][K]> | undefined): NonNullable<ISessionStateChatPatch['fields'][K]> | undefined => {
		const value = patch.fields[field];
		return value === undefined ? existing : value ?? undefined;
	};
	return {
		chat: patch.chat,
		isDefault: patch.isDefault,
		storageResource: pick('storage', current?.storageResource),
		title: pick('title', current?.title),
		titleSource: pick('titleSource', current?.titleSource),
		isRead: pick('isRead', current?.isRead),
		workingDirectories: pick('workingDirectories', current?.workingDirectories),
		launchWorkingDirectories: pick('launchWorkingDirectories', current?.launchWorkingDirectories),
		changes: pick('changes', current?.changes),
		revision,
	};
}

// ---- Old format ---------------------------------------------------------------

/** A metadata key of a database: the session's, or one opened by a chat URI or recorded storage. */
export interface IMirrorTarget {
	readonly resource: string;
	readonly key: string;
}

/** Keys whose value is one JSON map of per-folder entries. */
type MirrorMapKey = typeof META_GIT_DATA_STATE | typeof META_GITHUB_DATA_STATE;

type EntryLocation =
	| { readonly kind: 'key'; readonly targets: readonly IMirrorTarget[] }
	| { readonly kind: 'map'; readonly target: IMirrorTarget; readonly mapKey: MirrorMapKey; readonly entryKey: string };

/** Where an entry lives in the old format. The first target is the one older builds read. */
function entryLocation(session: string, model: SessionStateModel | undefined, entry: SessionStateMirrorEntry, isDefaultChat: (chat: string) => boolean): EntryLocation {
	switch (entry.kind) {
		case 'value': return { kind: 'key', targets: [{ resource: session, key: entry.key }] };
		case 'folder': return folderLocation(session, model, entry.folderKind, entry.folderKey);
		case 'chat': return { kind: 'key', targets: chatTargets(session, entry.chat, entry.field, isDefaultChat(entry.chat)) };
		case 'blob': return { kind: 'key', targets: [{ resource: session, key: entry.scopeKey === '' ? META_CHANGESET_BRANCH : getScopedBranchChangesetMetadataKey(entry.scopeKey) }] };
	}
}

function folderLocation(session: string, model: SessionStateModel | undefined, kind: SessionStateFolderKind, folderKey: string): EntryLocation {
	switch (kind) {
		case 'git':
			return folderKey === ''
				? { kind: 'key', targets: [{ resource: session, key: META_GIT_STATE }] }
				: { kind: 'map', target: { resource: session, key: META_GIT_DATA_STATE }, mapKey: META_GIT_DATA_STATE, entryKey: folderKey };
		case 'github':
			return { kind: 'map', target: { resource: session, key: META_GITHUB_DATA_STATE }, mapKey: META_GITHUB_DATA_STATE, entryKey: folderKey };
		case 'baseBranch':
			return { kind: 'key', targets: [{ resource: model?.folder('baseBranch', folderKey)?.storage ?? session, key: BASE_BRANCH_MIRROR_KEY }] };
	}
}

function chatTargets(session: string, chat: string, field: MirroredChatField, isDefault: boolean): IMirrorTarget[] {
	const sessionKey = (key: string): IMirrorTarget => ({ resource: session, key });
	switch (field) {
		case 'title':
			return isDefault
				? [sessionKey(SESSION_CUSTOM_TITLE_KEY), sessionKey(customChatTitleMetadataKey(chat))]
				: [sessionKey(customChatTitleMetadataKey(chat)), { resource: chat, key: SESSION_CUSTOM_TITLE_KEY }];
		case 'titleSource':
			return isDefault
				? [sessionKey(SESSION_CUSTOM_TITLE_SOURCE_KEY), sessionKey(customChatTitleSourceMetadataKey(chat))]
				: [sessionKey(customChatTitleSourceMetadataKey(chat)), { resource: chat, key: SESSION_CUSTOM_TITLE_SOURCE_KEY }];
		case 'isRead':
			return [sessionKey(AH_META_DEFAULT_CHAT_IS_READ_DB_KEY)];
		case 'workingDirectories':
			// Older builds open the chat's database by its URI, also for a legacy-catalog default chat.
			return [{ resource: chat, key: CHAT_WORKING_DIRECTORIES_MIRROR_KEY }];
		case 'changes':
			return [sessionKey(getChatChangesSummaryMetadataKey(chat))];
	}
}

/** The old-format value of an entry; `undefined` means the key is absent. */
export function renderMirrorEntry(model: SessionStateModel, entry: SessionStateMirrorEntry): string | undefined {
	switch (entry.kind) {
		case 'value': return model.values.get(entry.key)?.value;
		case 'folder': return model.folder(entry.folderKind, entry.folderKey)?.value;
		case 'blob': return model.blobs.get(entry.scopeKey)?.contentHash;
		case 'chat': {
			const chat = model.chats.get(entry.chat);
			if (!chat) {
				return undefined;
			}
			switch (entry.field) {
				case 'title': return chat.title;
				case 'titleSource': return chat.titleSource;
				case 'isRead': return chat.isRead === undefined ? undefined : chat.isRead ? 'true' : '';
				case 'workingDirectories': return chat.workingDirectories === undefined ? undefined : JSON.stringify(chat.workingDirectories);
				case 'changes': return chat.changes;
			}
		}
	}
}

function isTitleSource(value: string): value is SessionStateTitleSource {
	return value === 'user' || value === 'agent' || value === 'auto';
}

function parseDirectories(value: string): readonly string[] | undefined {
	const parsed: unknown = JSON.parse(value);
	return Array.isArray(parsed) && parsed.every(entry => typeof entry === 'string') ? parsed : undefined;
}

/**
 * The central change that adopts an observed old-format value. Blobs are
 * observed by hash; `content` carries the blob itself.
 */
export function patchFromMirror(model: SessionStateModel | undefined, entry: SessionStateMirrorEntry, observed: IObservedEntry | undefined, isDefaultChat: (chat: string) => boolean): Partial<ISessionStatePatch> {
	const raw = observed?.content;
	switch (entry.kind) {
		case 'value':
			return { values: { [entry.key]: raw ?? null } };
		case 'folder': {
			const folder: ISessionStateFolderPatch = { folderKey: entry.folderKey, kind: entry.folderKind, value: raw ?? null, storage: model?.folder(entry.folderKind, entry.folderKey)?.storage ?? null };
			return { folders: [folder] };
		}
		case 'blob':
			return { branchChangesets: [{ scopeKey: entry.scopeKey, diffs: raw ?? null }] };
		case 'chat': {
			const fields: ISessionStateChatPatch['fields'] = (() => {
				switch (entry.field) {
					case 'title': return { title: raw ?? null };
					case 'titleSource': return { titleSource: raw !== undefined && isTitleSource(raw) ? raw : null };
					case 'isRead': return { isRead: raw === undefined ? null : raw === 'true' };
					case 'workingDirectories': return { workingDirectories: raw ? parseDirectories(raw) ?? null : null };
					case 'changes': return { changes: raw ?? null };
				}
			})();
			return { chats: [{ chat: entry.chat, isDefault: isDefaultChat(entry.chat), fields }] };
		}
	}
}

/** Concatenates partial patches; later ones win per entry. */
export function mergePatches(parts: readonly Partial<ISessionStatePatch>[]): ISessionStatePatch {
	const values: Record<string, string | null> = {};
	const folders = new Map<string, ISessionStateFolderPatch>();
	const chats = new Map<string, ISessionStateChatPatch>();
	const blobs = new Map<string, { readonly scopeKey: string; readonly diffs: string | null }>();
	for (const part of parts) {
		Object.assign(values, part.values);
		for (const folder of part.folders ?? []) {
			folders.set(folderModelKey(folder.kind, folder.folderKey), folder);
		}
		for (const chat of part.chats ?? []) {
			const existing = chats.get(chat.chat);
			chats.set(chat.chat, { chat: chat.chat, isDefault: chat.isDefault, fields: { ...existing?.fields, ...chat.fields } });
		}
		for (const blob of part.branchChangesets ?? []) {
			blobs.set(blob.scopeKey, blob);
		}
	}
	return { values, folders: [...folders.values()], chats: [...chats.values()], branchChangesets: [...blobs.values()] };
}

// ---- Observation ---------------------------------------------------------------

/** An observed old-format value: `compare` is what merge bases record (a hash for blobs). */
export interface IObservedEntry {
	readonly compare: string;
	readonly content: string;
}

/** Reads of one database for an observation. */
export interface IMirrorReadPlan {
	readonly keys: Set<string>;
	readonly prefixes: Set<string>;
}

/** What older builds hold for a session, by database and key. */
export type MirrorReads = ReadonlyMap<string, Readonly<Record<string, string | undefined>>>;

/**
 * The reads that observe every entry older builds can have written for the
 * session: registered values and prefixes, folder maps, blobs, and the given
 * chats' keys (legacy-catalog sessions only) and base-branch databases.
 */
export function planMirrorReads(session: string, chats: readonly { readonly chat: string; readonly isDefault: boolean }[], baseBranchStorages: readonly string[]): Map<string, IMirrorReadPlan> {
	const plans = new Map<string, IMirrorReadPlan>();
	const plan = (resource: string) => {
		let result = plans.get(resource);
		if (!result) {
			result = { keys: new Set(), prefixes: new Set() };
			plans.set(resource, result);
		}
		return result;
	};
	const sessionPlan = plan(session);
	for (const entry of SESSION_STATE_VALUE_KEYS) {
		sessionPlan.keys.add(entry.key);
	}
	for (const prefix of SESSION_STATE_VALUE_KEY_PREFIXES) {
		sessionPlan.prefixes.add(prefix.key);
	}
	for (const key of [LEGACY_IS_DONE_KEY, META_GIT_STATE, META_GIT_DATA_STATE, META_GITHUB_DATA_STATE, BASE_BRANCH_MIRROR_KEY]) {
		sessionPlan.keys.add(key);
	}
	sessionPlan.prefixes.add(META_CHANGESET_BRANCH);
	const isDefault = new Map(chats.map(chat => [chat.chat, chat.isDefault]));
	for (const chat of chats) {
		if (!chat.isDefault) {
			plan(chat.chat).keys.add(BASE_BRANCH_MIRROR_KEY);
		}
		for (const field of mirroredChatFields(chat.isDefault)) {
			const location = entryLocation(session, undefined, { kind: 'chat', field, chat: chat.chat }, entry => isDefault.get(entry) ?? false);
			if (location.kind === 'key') {
				for (const target of location.targets) {
					plan(target.resource).keys.add(target.key);
				}
			}
		}
	}
	for (const storage of baseBranchStorages) {
		plan(storage).keys.add(BASE_BRANCH_MIRROR_KEY);
	}
	return plans;
}

function readMap(reads: MirrorReads, target: IMirrorTarget): Record<string, unknown> | undefined {
	const raw = reads.get(target.resource)?.[target.key];
	if (raw === undefined) {
		return undefined;
	}
	try {
		const parsed: unknown = JSON.parse(raw);
		return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
	} catch {
		return {};
	}
}

/** The observed old-format value of an entry; `undefined` when older builds hold none. */
export function observeMirrorEntry(session: string, model: SessionStateModel | undefined, entry: SessionStateMirrorEntry, reads: MirrorReads, isDefaultChat: (chat: string) => boolean): IObservedEntry | undefined {
	const location = entryLocation(session, model, entry, isDefaultChat);
	if (location.kind === 'map') {
		const value = readMap(reads, location.target)?.[location.entryKey];
		if (value === undefined) {
			return undefined;
		}
		const content = JSON.stringify(value);
		return { compare: content, content };
	}
	// Older builds write a peer's title to both keys; the session's is what they list.
	const content = location.targets.map(target => reads.get(target.resource)?.[target.key]).find(value => value !== undefined);
	// Older builds write '' for "no directories of its own", which reads like an absent key.
	if (content === undefined || (entry.kind === 'chat' && entry.field === 'workingDirectories' && content === '')) {
		return undefined;
	}
	return { compare: entry.kind === 'blob' ? hashBranchChangeset(content) : content, content };
}

/** Every entry an observation found a value for, besides the given chats' entries. */
export function observedMirrorEntries(session: string, reads: MirrorReads): SessionStateMirrorEntry[] {
	const sessionReads = reads.get(session) ?? {};
	const entries: SessionStateMirrorEntry[] = [];
	for (const [key, value] of Object.entries(sessionReads)) {
		if (value === undefined) {
			continue;
		}
		if (getSessionStateValueKey(key)) {
			entries.push({ kind: 'value', key });
		} else if (key === META_GIT_STATE) {
			entries.push({ kind: 'folder', folderKind: 'git', folderKey: '' });
		} else if (key === BASE_BRANCH_MIRROR_KEY) {
			entries.push({ kind: 'folder', folderKind: 'baseBranch', folderKey: '' });
		} else if (key === META_CHANGESET_BRANCH) {
			entries.push({ kind: 'blob', scopeKey: '' });
		} else if (key.startsWith(`${META_CHANGESET_BRANCH}.`)) {
			entries.push({ kind: 'blob', scopeKey: key.slice(META_CHANGESET_BRANCH.length + 1) });
		}
	}
	for (const folderKey of Object.keys(readMap(reads, { resource: session, key: META_GIT_DATA_STATE }) ?? {})) {
		entries.push({ kind: 'folder', folderKind: 'git', folderKey });
	}
	for (const folderKey of Object.keys(readMap(reads, { resource: session, key: META_GITHUB_DATA_STATE }) ?? {})) {
		entries.push({ kind: 'folder', folderKind: 'github', folderKey });
	}
	return entries;
}

/** Older builds' archive flag when only the legacy key holds it. */
export function observeLegacyArchived(session: string, reads: MirrorReads): string | undefined {
	const sessionReads = reads.get(session) ?? {};
	return sessionReads[AH_META_IS_ARCHIVED_DB_KEY] ?? sessionReads[LEGACY_IS_DONE_KEY];
}

/** The branch-changes blob a session.db key of the old format holds, or `undefined` when the key is not one. */
function legacyBlobEntry(key: string): SessionStateMirrorEntry | undefined {
	if (key === META_CHANGESET_BRANCH) {
		return { kind: 'blob', scopeKey: '' };
	}
	const prefix = `${META_CHANGESET_BRANCH}.`;
	return key.startsWith(prefix) ? { kind: 'blob', scopeKey: key.slice(prefix.length) } : undefined;
}

function mapFolderKind(mapKey: MirrorMapKey): SessionStateFolderKind {
	return mapKey === META_GIT_DATA_STATE ? 'git' : 'github';
}

/** Folder entries a map key holds, with their folder keys: every folder of its kind except the session folder's own git key. */
function mapEntries(model: SessionStateModel, kind: SessionStateFolderKind): [string, string][] {
	return [...model.folders.values()]
		.filter(folder => folder.kind === kind && (kind === 'github' || folder.folderKey !== ''))
		.map(folder => [mirrorEntryId({ kind: 'folder', folderKind: kind, folderKey: folder.folderKey }), folder.folderKey]);
}

/** The old-format JSON map of a folder map key, from central state. */
function renderFolderMap(model: SessionStateModel, kind: SessionStateFolderKind): Record<string, unknown> {
	const map: Record<string, unknown> = {};
	for (const folder of model.folders.values()) {
		if (folder.kind === kind && (kind === 'github' || folder.folderKey !== '') && folder.value !== undefined) {
			map[folder.folderKey] = JSON.parse(folder.value);
		}
	}
	return map;
}

/** Session.db keys of a legacy-catalog chat, by key prefix. */
const LEGACY_CHAT_KEY_FIELDS: readonly (readonly [string, MirroredChatField])[] = [
	['customChatTitle:', 'title'],
	['customChatTitleSource:', 'titleSource'],
	[`${META_CHANGES_SUMMARY}:`, 'changes'],
];

/** The central entry a session.db key of the old format holds, `'map'` for a folder map, or `undefined` when the store does not own it. */
function legacyKeyEntry(model: SessionStateModel, key: string): SessionStateMirrorEntry | MirrorMapKey | 'retired' | undefined {
	if (getSessionStateValueKey(key)) {
		return { kind: 'value', key };
	}
	switch (key) {
		case LEGACY_IS_DONE_KEY: return 'retired';
		case META_GIT_STATE: return { kind: 'folder', folderKind: 'git', folderKey: '' };
		case META_GIT_DATA_STATE: return META_GIT_DATA_STATE;
		case META_GITHUB_DATA_STATE: return META_GITHUB_DATA_STATE;
		case BASE_BRANCH_MIRROR_KEY: return { kind: 'folder', folderKind: 'baseBranch', folderKey: '' };
	}
	const blob = legacyBlobEntry(key);
	if (blob) {
		return blob;
	}
	if (model.authority !== 1) {
		return undefined;
	}
	const defaultChat = [...model.chats.values()].find(chat => chat.isDefault)?.chat;
	switch (key) {
		case SESSION_CUSTOM_TITLE_KEY: return defaultChat === undefined ? undefined : { kind: 'chat', field: 'title', chat: defaultChat };
		case SESSION_CUSTOM_TITLE_SOURCE_KEY: return defaultChat === undefined ? undefined : { kind: 'chat', field: 'titleSource', chat: defaultChat };
		case AH_META_DEFAULT_CHAT_IS_READ_DB_KEY: return defaultChat === undefined ? undefined : { kind: 'chat', field: 'isRead', chat: defaultChat };
	}
	for (const [prefix, field] of LEGACY_CHAT_KEY_FIELDS) {
		const chat = key.startsWith(prefix) ? key.slice(prefix.length) : undefined;
		// Chats the store has no row of (e.g. private chats) keep their keys in session.db.
		if (chat !== undefined && model.chats.has(chat)) {
			return { kind: 'chat', field, chat };
		}
	}
	return undefined;
}

/**
 * The folder patches a write of a whole folder map key (`agentHost.gitData`,
 * `agentHost.githubData`) to the session database makes: every folder of the map
 * is set, and every central folder of its kind that the map no longer holds is removed.
 * `undefined` when `key` is not a folder map key.
 */
export function legacyMapWritePatch(model: SessionStateModel, key: string, value: string | null): Partial<ISessionStatePatch> | undefined {
	if (key !== META_GIT_DATA_STATE && key !== META_GITHUB_DATA_STATE) {
		return undefined;
	}
	const kind = mapFolderKind(key);
	const map = value === null ? {} : (() => {
		try {
			const parsed: unknown = JSON.parse(value);
			return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {};
		} catch {
			return {};
		}
	})();
	const folders: ISessionStateFolderPatch[] = Object.entries(map)
		.map(([folderKey, entry]) => ({ folderKey, kind, value: JSON.stringify(entry), storage: model.folder(kind, folderKey)?.storage ?? null }))
		// A refresh that leaves a folder as it is writes nothing.
		.filter(folder => model.folder(kind, folder.folderKey)?.value !== folder.value);
	for (const [, folderKey] of mapEntries(model, kind)) {
		if (!Object.prototype.hasOwnProperty.call(map, folderKey)) {
			folders.push({ folderKey, kind, value: null, storage: model.folder(kind, folderKey)?.storage ?? null });
		}
	}
	return { folders };
}

/**
 * The central entry that a write of `key` to the database opened by `resource`
 * changes, or `undefined` when the store does not own that key there.
 */
export function legacyWriteEntry(model: SessionStateModel, session: string, resource: string, key: string): SessionStateMirrorEntry | undefined {
	if (resource === session) {
		const entry = legacyKeyEntry(model, key);
		return typeof entry === 'object' ? entry : undefined;
	}
	const chat = model.authority === 1 ? model.chats.get(resource) : undefined;
	if (!chat) {
		return undefined;
	}
	switch (key) {
		case SESSION_CUSTOM_TITLE_KEY: return chat.isDefault ? undefined : { kind: 'chat', field: 'title', chat: resource };
		case SESSION_CUSTOM_TITLE_SOURCE_KEY: return chat.isDefault ? undefined : { kind: 'chat', field: 'titleSource', chat: resource };
		case CHAT_WORKING_DIRECTORIES_MIRROR_KEY: return { kind: 'chat', field: 'workingDirectories', chat: resource };
		case BASE_BRANCH_MIRROR_KEY: return chat.isDefault || !chat.workingDirectories?.length ? undefined : { kind: 'folder', folderKind: 'baseBranch', folderKey: baseBranchFolderKey(chat) };
	}
	return undefined;
}

/** Old-format session.db values rendered from central state, and the requested keys the store does not own. */
export interface ILegacyMetadata {
	readonly values: Record<string, string | undefined>;
	readonly unowned: readonly string[];
}

/**
 * What session.db would hold for `keys` if every mirror were current. Branch
 * blobs are not rendered (they are read lazily); keys the store does not own
 * are listed in `unowned` for the caller to read from the database.
 */
export function renderLegacyMetadata(model: SessionStateModel, keys: readonly string[]): ILegacyMetadata {
	const values: Record<string, string | undefined> = {};
	const unowned: string[] = [];
	for (const key of keys) {
		const entry = legacyKeyEntry(model, key);
		if (entry === undefined) {
			unowned.push(key);
		} else if (entry === 'retired' || (typeof entry === 'object' && entry.kind === 'blob')) {
			values[key] = undefined;
		} else if (entry === META_GIT_DATA_STATE || entry === META_GITHUB_DATA_STATE) {
			const map = renderFolderMap(model, mapFolderKind(entry));
			values[key] = Object.keys(map).length > 0 || mapEntries(model, mapFolderKind(entry)).length > 0 ? JSON.stringify(map) : undefined;
		} else {
			values[key] = renderMirrorEntry(model, entry);
		}
	}
	return { values, unowned };
}

// ---- Writing -----------------------------------------------------------------

/** Old-format changes of one database. */
export interface IMirrorWrite {
	readonly set: Record<string, string>;
	readonly remove: string[];
	/** Entries this write makes current. */
	readonly entries: string[];
	/** Old-format value per entry once written, for the merge base. */
	readonly written: Map<string, string | undefined>;
}

/**
 * Renders `entries` into per-database writes. An entry of a folder map
 * rewrites the whole map from central state, so every entry of that map
 * becomes current.
 */
export function renderMirrorWrites(session: string, model: SessionStateModel, entries: readonly SessionStateMirrorEntry[], isDefaultChat: (chat: string) => boolean, blobContent: (scopeKey: string) => string | undefined): Map<string, IMirrorWrite> {
	const writes = new Map<string, IMirrorWrite>();
	const write = (resource: string) => {
		let result = writes.get(resource);
		if (!result) {
			result = { set: {}, remove: [], entries: [], written: new Map() };
			writes.set(resource, result);
		}
		return result;
	};
	const renderedMaps = new Set<MirrorMapKey>();
	for (const entry of entries) {
		const id = mirrorEntryId(entry);
		const location = entryLocation(session, model, entry, isDefaultChat);
		if (location.kind === 'map') {
			if (renderedMaps.has(location.mapKey)) {
				continue;
			}
			renderedMaps.add(location.mapKey);
			const kind = mapFolderKind(location.mapKey);
			const map = renderFolderMap(model, kind);
			const target = write(location.target.resource);
			const folderKeys = new Map(mapEntries(model, kind));
			for (const other of entries) {
				if (other.kind === 'folder' && other.folderKind === kind && (kind === 'github' || other.folderKey !== '')) {
					folderKeys.set(mirrorEntryId(other), other.folderKey);
				}
			}
			for (const [folderEntry, folderKey] of folderKeys) {
				target.entries.push(folderEntry);
				target.written.set(folderEntry, map[folderKey] === undefined ? undefined : JSON.stringify(map[folderKey]));
			}
			target.set[location.target.key] = JSON.stringify(map);
			continue;
		}
		const rendered = entry.kind === 'blob' ? blobContent(entry.scopeKey) : renderMirrorEntry(model, entry);
		const compare = entry.kind === 'blob' ? renderMirrorEntry(model, entry) : rendered;
		for (const target of location.targets) {
			const targetWrite = write(target.resource);
			if (rendered === undefined) {
				targetWrite.remove.push(target.key);
			} else {
				targetWrite.set[target.key] = rendered;
			}
		}
		const primary = write(location.targets[0].resource);
		primary.entries.push(id);
		primary.written.set(id, compare);
	}
	return writes;
}
