/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../workbench/common/editor.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { agentSessionContainsResource, editingEntriesContainResource } from '../../../../workbench/contrib/chat/browser/sessionResourceMatching.js';
import { IChatSessionFileChange, IChatSessionFileChange2, isIChatSessionFileChange2 } from '../../../../workbench/contrib/chat/common/chatSessionsService.js';

/**
 * Find the session that contains the given resource by checking editing sessions and agent sessions.
 */
export function getSessionForResource(
	resourceUri: URI,
	chatEditingService: IChatEditingService,
	agentSessionsService: IAgentSessionsService,
): URI | undefined {
	for (const editingSession of chatEditingService.editingSessionsObs.get()) {
		if (editingEntriesContainResource(editingSession.entries.get(), resourceUri)) {
			return editingSession.chatSessionResource;
		}
	}

	for (const session of agentSessionsService.model.sessions) {
		if (agentSessionContainsResource(session, resourceUri)) {
			return session.resource;
		}
	}

	return undefined;
}

export type AgentFeedbackSessionChange = IChatSessionFileChange | IChatSessionFileChange2;

export function changeMatchesResource(change: AgentFeedbackSessionChange, resourceUri: URI): boolean {
	if (isIChatSessionFileChange2(change)) {
		return change.uri.fsPath === resourceUri.fsPath
			|| change.modifiedUri?.fsPath === resourceUri.fsPath
			|| change.originalUri?.fsPath === resourceUri.fsPath;
	}

	return change.modifiedUri.fsPath === resourceUri.fsPath
		|| change.originalUri?.fsPath === resourceUri.fsPath;
}

export function getSessionChangeForResource(
	sessionResource: URI | undefined,
	resourceUri: URI,
	agentSessionsService: IAgentSessionsService,
): AgentFeedbackSessionChange | undefined {
	if (!sessionResource) {
		return undefined;
	}

	const changes = agentSessionsService.getSession(sessionResource)?.changes;
	if (!(changes instanceof Array)) {
		return undefined;
	}

	return changes.find(change => changeMatchesResource(change, resourceUri));
}

export function getActiveResourceCandidates(input: Parameters<typeof EditorResourceAccessor.getOriginalUri>[0]): URI[] {
	const result: URI[] = [];
	const resources = EditorResourceAccessor.getOriginalUri(input, { supportSideBySide: SideBySideEditor.BOTH });
	if (!resources) {
		return result;
	}

	if (URI.isUri(resources)) {
		result.push(resources);
		return result;
	}

	if (resources.secondary) {
		result.push(resources.secondary);
	}
	if (resources.primary) {
		result.push(resources.primary);
	}

	return result;
}
