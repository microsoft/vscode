/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { EditorResourceAccessor, SideBySideEditor } from '../../../../workbench/common/editor.js';
import { IChatEditingService } from '../../../../workbench/contrib/chat/common/editing/chatEditingService.js';
import { IAgentSessionsService } from '../../../../workbench/contrib/chat/browser/agentSessions/agentSessionsService.js';
import { agentSessionContainsResource, editingEntriesContainResource } from '../../../../workbench/contrib/chat/browser/sessionResourceMatching.js';

export interface ISessionResourceMatch {
	readonly sessionResource: URI;
	readonly resourceUri: URI;
}

/**
 * Find the session that contains the given resource by checking editing sessions and agent sessions.
 */
export function getSessionForResource(
	resourceUri: URI,
	chatEditingService: IChatEditingService,
	agentSessionsService: IAgentSessionsService,
): ISessionResourceMatch | undefined {
	for (const editingSession of chatEditingService.editingSessionsObs.get()) {
		if (editingEntriesContainResource(editingSession.entries.get(), resourceUri)) {
			return { sessionResource: editingSession.chatSessionResource, resourceUri };
		}
	}

	for (const session of agentSessionsService.model.sessions) {
		if (agentSessionContainsResource(session, resourceUri)) {
			return { sessionResource: session.resource, resourceUri };
		}
	}

	return undefined;
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
