/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatService } from '../../common/chatService.js';
import { IChatSessionItem, IChatSessionItemProvider, localChatSessionType } from '../../common/chatSessionsService.js';


export type ChatSessionItemWithProvider = IChatSessionItem & {
	readonly provider: IChatSessionItemProvider;
	relativeTime?: string;
	relativeTimeFullWord?: string;
	hideRelativeTime?: boolean;
};


// Helper function to create context overlay for session items
export function getSessionItemContextOverlay(
	session: IChatSessionItem,
	provider?: IChatSessionItemProvider,
	chatService?: IChatService,
	editorGroupsService?: IEditorGroupsService
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
): [string, any][] {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const overlay: [string, any][] = [];
	if (provider) {
		overlay.push([ChatContextKeys.agentSessionType.key, provider.chatSessionType]);
	}

	// Mark history items
	overlay.push([ChatContextKeys.isArchivedAgentSession.key, session.archived]);

	// Mark active sessions - check if session is currently open in editor or widget
	let isActiveSession = false;

	if (!session.archived && provider?.chatSessionType === localChatSessionType) {
		// Local non-history sessions are always active
		isActiveSession = true;
	} else if (session.archived && chatService && editorGroupsService) {
		isActiveSession = !!chatService.getSession(session.resource);
	}

	overlay.push([ChatContextKeys.isActiveAgentSession.key, isActiveSession]);

	return overlay;
}
