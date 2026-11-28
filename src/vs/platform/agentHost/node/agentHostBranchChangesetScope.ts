/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { extUriBiasedIgnorePathCase } from '../../../base/common/resources.js';
import { URI } from '../../../base/common/uri.js';
import { getWorkingDirectoryKey, getWorkingDirectoryScopeId } from '../common/agentHostWorkingDirectories.js';
import { buildFolderChangesetOwnerUri, parseFolderChangesetOwnerUri } from '../common/changesetUri.js';
import { ChatOriginKind, isAhpChatChannel, readFolderScopeGitState, readSessionGitState, type ISessionGitState, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { readSessionRepositories } from '../common/meta/agentSessionRepositoriesMeta.js';
import { getEffectiveWorkingDirectories } from './agentConfigurationService.js';

export interface IBranchChangesetScope {
	readonly ownerUri: ProtocolURI;
	readonly sessionUri: ProtocolURI;
	/**
	 * The chat whose changes the scope has. For a folder-only scope (see {@link isFolderOnlyScope}), the chat that only
	 * provides the conversation: its Git state and recorded base branch are not the folder's.
	 */
	readonly sourceUri: ProtocolURI;
	readonly workingDirectories: readonly ProtocolURI[];
}

/**
 * Whether `scope` is one folder of the session that no chat works in alone, such as a folder of a project other than
 * the first, or a repository found in one: its Git state and base branch are the folder's own (see
 * {@link readSessionFolderScopeGitState}), not those of its {@link IBranchChangesetScope.sourceUri}, which only provides
 * the conversation. A chat's scope is the one its own folders resolve to.
 */
export function isFolderOnlyScope(stateManager: AgentHostStateManager, scope: IBranchChangesetScope): boolean {
	return scope.workingDirectories.length > 0
		&& parseFolderChangesetOwnerUri(scope.ownerUri) !== undefined
		&& resolveBranchChangesetScopeForSource(stateManager, scope.sourceUri).ownerUri !== scope.ownerUri;
}

export function resolveChangesetOwnerScope(stateManager: AgentHostStateManager, ownerUri: ProtocolURI): IBranchChangesetScope {
	const folderScope = resolveBranchChangesetScopeForOwner(stateManager, ownerUri);
	if (folderScope) {
		return folderScope;
	}

	const folderOwner = parseFolderChangesetOwnerUri(ownerUri);
	if (folderOwner) {
		return {
			ownerUri,
			sessionUri: folderOwner.sessionUri,
			sourceUri: defaultChatSource(stateManager, folderOwner.sessionUri),
			workingDirectories: [],
		};
	}
	const sessionUri = (isAhpChatChannel(ownerUri) ? stateManager.getChatOwner(ownerUri) : undefined) ?? ownerUri;
	const sourceUri = isAhpChatChannel(ownerUri) ? ownerUri : defaultChatSource(stateManager, sessionUri);
	return {
		ownerUri,
		sessionUri,
		sourceUri,
		workingDirectories: getEffectiveWorkingDirectories(stateManager, sourceUri) ?? [],
	};
}

/** A session's changes come from its default chat, or from the session itself while it records none. */
function defaultChatSource(stateManager: AgentHostStateManager, sessionUri: ProtocolURI): ProtocolURI {
	return stateManager.getDefaultChat(sessionUri) ?? sessionUri;
}

function getScopeCandidates(stateManager: AgentHostStateManager, sessionUri: ProtocolURI): readonly ProtocolURI[] {
	const defaultChat = stateManager.getDefaultChat(sessionUri);
	return [
		...(defaultChat !== undefined ? [defaultChat] : []),
		...stateManager.getSessionState(sessionUri)?.chats
			.map(chat => chat.resource)
			.filter(chat => chat !== defaultChat) ?? [],
	];
}

export function resolveBranchChangesetScopeForSource(stateManager: AgentHostStateManager, sourceUri: ProtocolURI): IBranchChangesetScope {
	const folderOwner = parseFolderChangesetOwnerUri(sourceUri);
	if (folderOwner) {
		return resolveBranchChangesetScopeForOwner(stateManager, sourceUri) ?? {
			ownerUri: sourceUri,
			sessionUri: folderOwner.sessionUri,
			sourceUri: defaultChatSource(stateManager, folderOwner.sessionUri),
			workingDirectories: [],
		};
	}

	const sessionUri = (isAhpChatChannel(sourceUri) ? stateManager.getChatOwner(sourceUri) : undefined) ?? sourceUri;
	const effectiveSource = isAhpChatChannel(sourceUri) ? sourceUri : defaultChatSource(stateManager, sessionUri);
	const workingDirectories = getEffectiveWorkingDirectories(stateManager, effectiveSource) ?? [];
	return {
		ownerUri: buildFolderChangesetOwnerUri(sessionUri, getWorkingDirectoryScopeId(workingDirectories)),
		sessionUri,
		sourceUri: effectiveSource,
		workingDirectories,
	};
}

export function resolveBranchChangesetScopeForOwner(stateManager: AgentHostStateManager, ownerUri: ProtocolURI): IBranchChangesetScope | undefined {
	const parsed = parseFolderChangesetOwnerUri(ownerUri);
	if (!parsed) {
		return undefined;
	}
	for (const candidate of getScopeCandidates(stateManager, parsed.sessionUri)) {
		const scope = resolveBranchChangesetScopeForSource(stateManager, candidate);
		if (scope.ownerUri === ownerUri) {
			return scope;
		}
	}
	// One folder of a session of several folders on its own, which no chat's folders match. A session of one folder has
	// no such scope: its folder's changes are its chats'.
	const sessionFolders = (stateManager.getSessionSummary(parsed.sessionUri)?.workingDirectories ?? []).filter(candidate => !stateManager.isScratchFolder(candidate));
	const folder = sessionFolders.length > 1 ? sessionFolders.find(candidate => getWorkingDirectoryScopeId([candidate]) === parsed.scopeId) : undefined;
	// Or a repository found inside one of its folders, which is its own folder for its changes
	const repository = folder ?? Object.values(readSessionRepositories(stateManager.getSessionState(parsed.sessionUri)?._meta) ?? {}).flat()
		.find(candidate => candidate.kind !== 'folder' && getWorkingDirectoryScopeId([candidate.root]) === parsed.scopeId)?.root;
	if (repository !== undefined) {
		return {
			ownerUri,
			sessionUri: parsed.sessionUri,
			sourceUri: defaultChatSource(stateManager, parsed.sessionUri),
			workingDirectories: [repository],
		};
	}
	return undefined;
}

/** What the changesets of an owner are computed from, and the key whose Git state refresh refreshes them. */
export interface IChangesetOwnerGitSource {
	/** The folders whose repositories the owner's changesets list; `undefined` until they are known. */
	readonly workingDirectories: readonly string[] | undefined;
	/** The session or chat whose Git state refresh refreshes the owner's changesets. */
	readonly refreshKey: ProtocolURI;
	/** The session the owner belongs to. */
	readonly sessionUri: ProtocolURI;
}

/**
 * What the changesets of `ownerUri` are computed from. A folder of a session on its own (a folder-only scope) lists its
 * own folder and is refreshed by the session's Git state refresh, which refreshes the changesets of each folder; a
 * folder owner that is a chat's scope is that chat's; any other owner is its `sourceUri` (by default itself).
 */
export function resolveChangesetOwnerGitSource(stateManager: AgentHostStateManager, ownerUri: ProtocolURI, sourceUri: ProtocolURI = ownerUri): IChangesetOwnerGitSource {
	if (parseFolderChangesetOwnerUri(ownerUri)) {
		const scope = resolveChangesetOwnerScope(stateManager, ownerUri);
		return {
			workingDirectories: scope.workingDirectories.length ? scope.workingDirectories : undefined,
			refreshKey: isFolderOnlyScope(stateManager, scope) ? scope.sessionUri : scope.sourceUri,
			sessionUri: scope.sessionUri,
		};
	}
	return {
		workingDirectories: getEffectiveWorkingDirectories(stateManager, sourceUri),
		refreshKey: sourceUri,
		sessionUri: resolveChangesetOwnerScope(stateManager, sourceUri).sessionUri,
	};
}

/**
 * The Git state of a folder-only scope (see {@link isFolderOnlyScope}): the session's for its first folder, and
 * otherwise the state recorded for the folder alone.
 */
export function readSessionFolderScopeGitState(stateManager: AgentHostStateManager, scope: IBranchChangesetScope): ISessionGitState | undefined {
	const meta = stateManager.getSessionState(scope.sessionUri)?._meta;
	return scope.workingDirectories[0] === stateManager.getSessionSummary(scope.sessionUri)?.workingDirectories?.[0]
		? readSessionGitState(meta)
		: readFolderScopeGitState(meta, getWorkingDirectoryScopeId(scope.workingDirectories));
}

/**
 * The base a folder's Branch Changes and pull request compare against, from its Git state: the full ref it records (such
 * as `refs/remotes/origin/main`), so that a stale or missing local branch of that name does not change them, else the
 * branch name.
 */
export function getDiffBaseBranch(gitState: ISessionGitState | undefined): string | undefined {
	return gitState?.baseBranchRef ?? gitState?.baseBranchName;
}

/** The folder whose GitHub and pull request state a session, chat or folder changeset owner uses. */
export interface IGitHubStateFolder {
	readonly sessionUri: ProtocolURI;
	/** The chat whose Git state describes the folder. */
	readonly sourceUri: ProtocolURI;
	/**
	 * Working-directory key of the folder, or `undefined` when the session has
	 * no working directories ({@link isSessionFolder} is `true`) or when a
	 * folder changeset owner no longer matches any chat (`false`).
	 */
	readonly folderKey: string | undefined;
	/** Whether the folder is the session's first folder, whose pull request Agent Merge and the pull request lifecycle follow. */
	readonly isSessionFolder: boolean;
	/** The folder's working directory, when known. */
	readonly workingDirectory: ProtocolURI | undefined;
}

/**
 * Resolves the folder whose GitHub state a session, chat channel or folder
 * changeset owner URI uses: the first folder of the chat, of the folder scope,
 * or of the session.
 */
export function resolveGitHubStateFolder(stateManager: AgentHostStateManager, uri: ProtocolURI): IGitHubStateFolder {
	const isFolderOwner = !!parseFolderChangesetOwnerUri(uri);
	const scope = isFolderOwner ? resolveChangesetOwnerScope(stateManager, uri) : resolveBranchChangesetScopeForSource(stateManager, uri);
	const sessionWorkingDirectory = stateManager.getSessionSummary(scope.sessionUri)?.workingDirectories?.[0];
	const workingDirectory = !isFolderOwner && !isAhpChatChannel(uri) ? sessionWorkingDirectory : scope.workingDirectories[0];
	if (isFolderOwner && workingDirectory === undefined) {
		// The folder scope no longer matches any chat; never fall back to the session folder.
		return { sessionUri: scope.sessionUri, sourceUri: scope.sourceUri, folderKey: undefined, isSessionFolder: false, workingDirectory: undefined };
	}
	const folderKey = workingDirectory === undefined ? undefined : getWorkingDirectoryKey(workingDirectory);
	return {
		sessionUri: scope.sessionUri,
		sourceUri: scope.sourceUri,
		folderKey,
		isSessionFolder: folderKey === undefined || (sessionWorkingDirectory !== undefined && folderKey === getWorkingDirectoryKey(sessionWorkingDirectory)),
		workingDirectory,
	};
}

function chatWorksInFolder(stateManager: AgentHostStateManager, chat: ProtocolURI, folderKey: string): boolean {
	const workingDirectory = getEffectiveWorkingDirectories(stateManager, chat)?.[0];
	return workingDirectory !== undefined && getWorkingDirectoryKey(workingDirectory) === folderKey;
}

/**
 * Whether `chat` is a chat channel of `session` whose first effective working
 * directory has `folderKey`. Vets client-supplied chat URIs before their state
 * is read on behalf of a folder.
 */
export function isSessionChatInFolder(stateManager: AgentHostStateManager, session: ProtocolURI, chat: ProtocolURI, folderKey: string): boolean {
	if (!isAhpChatChannel(chat)) {
		return false;
	}
	const isSessionChat = stateManager.isDefaultChat(session, chat)
		|| stateManager.getSessionState(session)?.chats.some(candidate => candidate.resource === chat) === true;
	return isSessionChat && chatWorksInFolder(stateManager, chat, folderKey);
}

/** The most folders and repositories of one session that have an Agent Merge of their own as folder-only scopes. */
export const MAX_FOLDER_ONLY_AGENT_MERGE_ROOTS = 16;

/**
 * The roots of a session's folder-only scopes (see {@link isFolderOnlyScope}) that have an Agent Merge and a pull
 * request of their own, by working-directory key: the session's folders other than its first when it has several, then
 * the repositories found in its folders, at most {@link MAX_FOLDER_ONLY_AGENT_MERGE_ROOTS}. Only those whose Git state
 * the session's refresh reads and records (see {@link readSessionFolderScopeGitState}), which are bounded on their own,
 * so each has the Git state its Agent Merge reads. A folder that a chat of the session works in first is that chat's
 * folder, and is not one of them.
 */
export function getFolderOnlyAgentMergeRoots(stateManager: AgentHostStateManager, session: ProtocolURI): ReadonlyMap<string, ProtocolURI> {
	const state = stateManager.getSessionState(session);
	const sessionFolders = (stateManager.getSessionSummary(session)?.workingDirectories ?? []).filter(folder => !stateManager.isScratchFolder(folder));
	const chatFolderKeys = new Set([
		...sessionFolders.slice(0, 1),
		...state?.chats.map(chat => chat.workingDirectories?.[0]).filter(directory => directory !== undefined) ?? [],
	].map(directory => getWorkingDirectoryKey(directory)));
	const candidates = [
		...(sessionFolders.length > 1 ? sessionFolders.slice(1) : []),
		...Object.values(readSessionRepositories(state?._meta) ?? {}).flat().filter(repository => repository.kind !== 'folder').map(repository => repository.root),
	];
	const meta = state?._meta;
	const roots = new Map<string, ProtocolURI>();
	for (const root of candidates) {
		const key = getWorkingDirectoryKey(root);
		if (!chatFolderKeys.has(key) && !roots.has(key) && readFolderScopeGitState(meta, getWorkingDirectoryScopeId([root])) !== undefined) {
			roots.set(key, root);
			if (roots.size === MAX_FOLDER_ONLY_AGENT_MERGE_ROOTS) {
				break;
			}
		}
	}
	return roots;
}

/** Whether one of the effective working directories of `chat` is `root` or contains it, so its turns can work in `root`. */
export function chatCoversFolder(stateManager: AgentHostStateManager, chat: ProtocolURI, root: ProtocolURI): boolean {
	const rootUri = URI.parse(root);
	return getEffectiveWorkingDirectories(stateManager, chat)?.some(directory => extUriBiasedIgnorePathCase.isEqualOrParent(rootUri, URI.parse(directory))) === true;
}

/**
 * The chat whose own settings Agent Merge elevates for a folder: the chat that
 * owns the folder's repairs ({@link resolveAgentMergeOwningChat}) unless that is
 * a subagent, else the
 * first chat with the folder among any of its working directories, in the
 * order the recorded chat, the default chat, then the session's other chats.
 * Chats spawned by a tool call are never chosen: their values are their
 * spawning chat's. `undefined` when no chat of the session has the folder.
 */
export function resolveAgentMergeElevatedChat(stateManager: AgentHostStateManager, session: ProtocolURI, folderKey: string, recordedChat: ProtocolURI | undefined): ProtocolURI | undefined {
	const owner = resolveAgentMergeOwningChat(stateManager, session, folderKey, recordedChat);
	if (owner !== undefined && stateManager.getChatOrigin(owner)?.kind !== ChatOriginKind.Tool) {
		return owner;
	}
	const state = stateManager.getSessionState(session);
	const defaultChat = stateManager.getDefaultChat(session);
	const isSessionChat = (chat: ProtocolURI) => chat === defaultChat || state?.chats.some(candidate => candidate.resource === chat) === true;
	const candidates = [
		...(recordedChat !== undefined && isAhpChatChannel(recordedChat) && isSessionChat(recordedChat) ? [recordedChat] : []),
		...(defaultChat !== undefined ? [defaultChat] : []),
		...state?.chats.map(chat => chat.resource) ?? [],
	];
	return candidates.find(chat => stateManager.getChatOrigin(chat)?.kind !== ChatOriginKind.Tool
		&& getEffectiveWorkingDirectories(stateManager, chat)?.some(directory => getWorkingDirectoryKey(directory) === folderKey));
}

/**
 * The chat whose checkout a folder's Agent Merge repairs run in: the chat that
 * turned Agent Merge on (`recordedChat`), else the default chat for the session
 * folder, else the first chat working in the folder. `undefined` when no chat
 * of the session works in the folder. The recorded chat is client-written, so
 * it is honored only for a chat of this session that works in the folder.
 *
 * A folder-only scope (see {@link getFolderOnlyAgentMergeRoots}) has no chat
 * working in it first: its repairs run in the recorded chat, else the default
 * chat, else the first chat, that has the folder among any of its working
 * directories, or a folder containing it.
 */
export function resolveAgentMergeOwningChat(stateManager: AgentHostStateManager, session: ProtocolURI, folderKey: string, recordedChat: ProtocolURI | undefined): ProtocolURI | undefined {
	const state = stateManager.getSessionState(session);
	const defaultChat = stateManager.getDefaultChat(session);
	const folderOnlyRoot = getFolderOnlyAgentMergeRoots(stateManager, session).get(folderKey);
	const worksInFolder = folderOnlyRoot !== undefined
		? (chat: ProtocolURI) => chatCoversFolder(stateManager, chat, folderOnlyRoot)
		: (chat: ProtocolURI) => chatWorksInFolder(stateManager, chat, folderKey);
	const isSessionChat = (chat: ProtocolURI) => isAhpChatChannel(chat) && (stateManager.isDefaultChat(session, chat) || state?.chats.some(candidate => candidate.resource === chat) === true);
	if (recordedChat && isSessionChat(recordedChat) && worksInFolder(recordedChat)) {
		return recordedChat;
	}
	if (defaultChat !== undefined && worksInFolder(defaultChat)) {
		return defaultChat;
	}
	for (const chat of [...(defaultChat !== undefined ? [defaultChat] : []), ...state?.chats.map(chat => chat.resource).filter(chat => chat !== defaultChat) ?? []]) {
		if (worksInFolder(chat)) {
			return chat;
		}
	}
	return undefined;
}
