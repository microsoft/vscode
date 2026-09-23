/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { getWorkingDirectoryScopeId } from '../common/agentHostWorkingDirectories.js';
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
