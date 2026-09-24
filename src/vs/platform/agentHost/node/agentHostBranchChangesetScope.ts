/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWorkingDirectoryKey, getWorkingDirectoryScopeId } from '../common/agentHostWorkingDirectories.js';
import { buildFolderChangesetOwnerUri, parseFolderChangesetOwnerUri } from '../common/changesetUri.js';
import { buildDefaultChatUri, isAhpChatChannel, parseChatUri, type URI as ProtocolURI } from '../common/state/sessionState.js';
import { AgentHostStateManager } from './agentHostStateManager.js';
import { getEffectiveWorkingDirectories } from './agentConfigurationService.js';

export interface IBranchChangesetScope {
	readonly ownerUri: ProtocolURI;
	readonly sessionUri: ProtocolURI;
	readonly sourceUri: ProtocolURI;
	readonly workingDirectories: readonly ProtocolURI[];
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
			sourceUri: buildDefaultChatUri(folderOwner.sessionUri),
			workingDirectories: [],
		};
	}
	const sessionUri = parseChatUri(ownerUri)?.session ?? ownerUri;
	const sourceUri = isAhpChatChannel(ownerUri) ? ownerUri : buildDefaultChatUri(sessionUri);
	return {
		ownerUri,
		sessionUri,
		sourceUri,
		workingDirectories: getEffectiveWorkingDirectories(stateManager, sourceUri) ?? [],
	};
}

function getScopeCandidates(stateManager: AgentHostStateManager, sessionUri: ProtocolURI): readonly ProtocolURI[] {
	const defaultChat = buildDefaultChatUri(sessionUri);
	return [
		defaultChat,
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
			sourceUri: buildDefaultChatUri(folderOwner.sessionUri),
			workingDirectories: [],
		};
	}

	const sessionUri = parseChatUri(sourceUri)?.session ?? sourceUri;
	const effectiveSource = isAhpChatChannel(sourceUri) ? sourceUri : buildDefaultChatUri(sessionUri);
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
	return undefined;
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
	const workingDirectory = scope.workingDirectories[0];
	if (isFolderOwner && workingDirectory === undefined) {
		// The folder scope no longer matches any chat; never fall back to the session folder.
		return { sessionUri: scope.sessionUri, sourceUri: scope.sourceUri, folderKey: undefined, isSessionFolder: false, workingDirectory: undefined };
	}
	const sessionWorkingDirectory = stateManager.getSessionState(scope.sessionUri)?.workingDirectories?.[0];
	const folderKey = workingDirectory === undefined ? undefined : getWorkingDirectoryKey(workingDirectory);
	return {
		sessionUri: scope.sessionUri,
		sourceUri: scope.sourceUri,
		folderKey,
		isSessionFolder: folderKey === undefined || (sessionWorkingDirectory !== undefined && folderKey === getWorkingDirectoryKey(sessionWorkingDirectory)),
		workingDirectory,
	};
}

/**
 * The chat whose checkout a folder's Agent Merge repairs run in: the chat that
 * turned Agent Merge on (`recordedChat`), else the default chat for the session
 * folder, else the first chat working in the folder. `undefined` when no chat
 * of the session works in the folder. The recorded chat is client-written, so
 * it is honored only for a chat of this session that works in the folder.
 */
export function resolveAgentMergeOwningChat(stateManager: AgentHostStateManager, session: ProtocolURI, folderKey: string, recordedChat: ProtocolURI | undefined): ProtocolURI | undefined {
	const state = stateManager.getSessionState(session);
	const defaultChat = buildDefaultChatUri(session);
	const worksInFolder = (chat: ProtocolURI) => {
		const workingDirectory = getEffectiveWorkingDirectories(stateManager, chat)?.[0];
		return workingDirectory !== undefined && getWorkingDirectoryKey(workingDirectory) === folderKey;
	};
	const isSessionChat = (chat: ProtocolURI) => chat === defaultChat || state?.chats.some(candidate => candidate.resource === chat) === true;
	if (recordedChat && isAhpChatChannel(recordedChat) && isSessionChat(recordedChat) && worksInFolder(recordedChat)) {
		return recordedChat;
	}
	const sessionWorkingDirectory = state?.workingDirectories?.[0];
	if (sessionWorkingDirectory !== undefined && folderKey === getWorkingDirectoryKey(sessionWorkingDirectory)) {
		return defaultChat;
	}
	for (const chat of [defaultChat, ...state?.chats.map(chat => chat.resource).filter(chat => chat !== defaultChat) ?? []]) {
		if (worksInFolder(chat)) {
			return chat;
		}
	}
	return undefined;
}
