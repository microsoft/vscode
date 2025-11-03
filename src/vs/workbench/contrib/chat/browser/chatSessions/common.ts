/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fromNow } from '../../../../../base/common/date.js';
import { Schemas } from '../../../../../base/common/network.js';
import { isEqual } from '../../../../../base/common/resources.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroup, IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatService } from '../../common/chatService.js';
import { IChatSessionItem, IChatSessionItemProvider, localChatSessionType } from '../../common/chatSessionsService.js';
import { IChatWidgetService } from '../chat.js';
import { ChatEditorInput } from '../chatEditorInput.js';


export const NEW_CHAT_SESSION_ACTION_ID = 'workbench.action.chat.openNewSessionEditor';

export type ChatSessionItemWithProvider = IChatSessionItem & {
	readonly provider: IChatSessionItemProvider;
	isHistory?: boolean;
	relativeTime?: string;
	relativeTimeFullWord?: string;
	hideRelativeTime?: boolean;
	timing?: {
		startTime: number;
	};
};

export function isChatSession(schemes: readonly string[], editor?: EditorInput): boolean {
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

/**
 * Find existing chat editors that have the same session URI (for external providers)
 */
export function findExistingChatEditorByUri(sessionUri: URI, editorGroupsService: IEditorGroupsService): { editor: ChatEditorInput; group: IEditorGroup } | undefined {
	for (const group of editorGroupsService.groups) {
		for (const editor of group.editors) {
			if (editor instanceof ChatEditorInput && isEqual(editor.sessionResource, sessionUri)) {
				return { editor, group };
			}
		}
	}
	return undefined;
}

export function isLocalChatSessionItem(item: ChatSessionItemWithProvider): boolean {
	return item.provider.chatSessionType === localChatSessionType;
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
		// eslint-disable-next-line local/code-no-any-casts
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
export function processSessionsWithTimeGrouping(sessions: ChatSessionItemWithProvider[]): void {
	// Only process if we have sessions with timestamps
	if (sessions.some(session => session.timing?.startTime !== undefined)) {
		sortSessionsByTimestamp(sessions);
		applyTimeGrouping(sessions);
	}
}

// Helper function to create context overlay for session items
export function getSessionItemContextOverlay(
	session: ChatSessionItemWithProvider,
	provider?: IChatSessionItemProvider,
	chatWidgetService?: IChatWidgetService,
	chatService?: IChatService,
	editorGroupsService?: IEditorGroupsService
): [string, any][] {
	const overlay: [string, any][] = [];
	// Do not create an overaly for the show-history node
	if (session.id === 'show-history') {
		return overlay;
	}

	if (provider) {
		overlay.push([ChatContextKeys.sessionType.key, provider.chatSessionType]);
	}

	// Mark history items
	overlay.push([ChatContextKeys.isHistoryItem.key, session.isHistory]);

	// Mark active sessions - check if session is currently open in editor or widget
	let isActiveSession = false;

	if (!session.isHistory && provider?.chatSessionType === localChatSessionType) {
		// Local non-history sessions are always active
		isActiveSession = true;
	} else if (session.isHistory && chatWidgetService && chatService && editorGroupsService) {
		// Check if session is open in a chat widget
		const widget = chatWidgetService.getWidgetBySessionResource(session.resource);
		if (widget) {
			isActiveSession = true;
		} else {
			// Check if session is open in any editor
			isActiveSession = !!findExistingChatEditorByUri(session.resource, editorGroupsService);
		}
	}

	overlay.push([ChatContextKeys.isActiveSession.key, isActiveSession]);

	return overlay;
}
