/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fromNow } from '../../../../../base/common/date.js';
import { Schemas } from '../../../../../base/common/network.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatService } from '../../common/chatService.js';
import { IChatSessionItem, IChatSessionItemProvider, localChatSessionType } from '../../common/chatSessionsService.js';
import { ChatEditorInput } from '../chatEditorInput.js';


export const NEW_CHAT_SESSION_ACTION_ID = 'workbench.action.chat.openNewSessionEditor';

export type ChatSessionItemWithProvider = IChatSessionItem & {
	readonly provider: IChatSessionItemProvider;
	relativeTime?: string;
	relativeTimeFullWord?: string;
	hideRelativeTime?: boolean;
};

export function isChatSession(schemes: readonly string[], editor?: EditorInput): editor is ChatEditorInput {
	if (!(editor instanceof ChatEditorInput)) {
		return false;
	}

	if (!schemes.includes(editor.resource?.scheme) && editor.resource?.scheme !== Schemas.vscodeLocalChatSession && editor.resource?.scheme !== Schemas.vscodeChatEditor) {
		return false;
	}

	if (editor.options.ignoreInView) {
		return false;
	}

	return true;
}

// Helper function to update relative time for chat sessions (similar to timeline)
function updateRelativeTime(item: ChatSessionItemWithProvider, lastRelativeTime: string | undefined): string | undefined {
	if (item.timing?.startTime) {
		item.relativeTime = fromNow(item.timing.startTime);
		item.relativeTimeFullWord = fromNow(item.timing.startTime, false, true);
		if (lastRelativeTime === undefined || item.relativeTime !== lastRelativeTime) {
			lastRelativeTime = item.relativeTime;
			item.hideRelativeTime = false;
		} else {
			item.hideRelativeTime = true;
		}
	} else {
		// Clear timestamp properties if no timestamp
		item.relativeTime = undefined;
		item.relativeTimeFullWord = undefined;
		item.hideRelativeTime = false;
	}

	return lastRelativeTime;
}

// Helper function to extract timestamp from session item
export function extractTimestamp(item: IChatSessionItem): number | undefined {
	// Use timing.startTime if available from the API
	if (item.timing?.startTime) {
		return item.timing.startTime;
	}

	// For other items, timestamp might already be set
	if ('timestamp' in item) {
		// eslint-disable-next-line local/code-no-any-casts, @typescript-eslint/no-explicit-any
		return (item as any).timestamp;
	}

	return undefined;
}

// Helper function to sort sessions by timestamp (newest first)
function sortSessionsByTimestamp(sessions: ChatSessionItemWithProvider[]): void {
	sessions.sort((a, b) => {
		const aTime = a.timing?.startTime ?? 0;
		const bTime = b.timing?.startTime ?? 0;
		return bTime - aTime; // newest first
	});
}

// Helper function to apply time grouping to a list of sessions
function applyTimeGrouping(sessions: ChatSessionItemWithProvider[]): void {
	let lastRelativeTime: string | undefined;
	sessions.forEach(session => {
		lastRelativeTime = updateRelativeTime(session, lastRelativeTime);
	});
}

// Helper function to process session items with timestamps, sorting, and grouping
export function processSessionsWithTimeGrouping(sessions: ChatSessionItemWithProvider[]): ChatSessionItemWithProvider[] {
	const sessionsTemp = [...sessions];
	// Only process if we have sessions with timestamps
	if (sessions.some(session => session.timing?.startTime !== undefined)) {
		sortSessionsByTimestamp(sessionsTemp);
		applyTimeGrouping(sessionsTemp);
	}
	return sessionsTemp;
}

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
