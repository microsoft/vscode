/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { fromNow } from '../../../../../base/common/date.js';
import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatService } from '../../common/chatService.js';
import { IChatSessionItem, IChatSessionItemProvider } from '../../common/chatSessionsService.js';
import { ChatSessionUri } from '../../common/chatUri.js';
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

export function isChatSession(editor?: EditorInput): boolean {
	if (!(editor instanceof ChatEditorInput)) {
		return false;
	}

	if (editor.resource?.scheme !== 'vscode-chat-editor' && editor.resource?.scheme !== 'vscode-chat-session') {
		return false;
	}

	if (editor.options.ignoreInView) {
		return false;
	}

	return true;
}

/**
 * Returns chat session type from a URI, or 'local' if not specified or cannot be determined.
 */
export function getChatSessionType(editor: ChatEditorInput): string {
	if (!editor.resource) {
		return 'local';
	}

	const { scheme, query } = editor.resource;

	if (scheme === Schemas.vscodeChatSession) {
		const parsed = ChatSessionUri.parse(editor.resource);
		if (parsed) {
			return parsed.chatSessionType;
		}
	}

	const sessionTypeFromQuery = new URLSearchParams(query).get('chatSessionType');
	if (sessionTypeFromQuery) {
		return sessionTypeFromQuery;
	}

	// Default to 'local' for vscode-chat-editor scheme or when type cannot be determined
	return 'local';
}

/**
 * Find existing chat editors that have the same session URI (for external providers)
 */
export function findExistingChatEditorByUri(sessionUri: URI, sessionId: string, editorGroupsService: IEditorGroupsService): { editor: ChatEditorInput; groupId: number } | undefined {
	if (!sessionUri) {
		return undefined;
	}

	for (const group of editorGroupsService.groups) {
		for (const editor of group.editors) {
			if (editor instanceof ChatEditorInput && (editor.resource.toString() === sessionUri.toString() || editor.sessionId === sessionId)) {
				return { editor, groupId: group.id };
			}
		}
	}
	return undefined;
}

export function isLocalChatSessionItem(item: ChatSessionItemWithProvider): boolean {
	return item.provider.chatSessionType === 'local';
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

	if (!session.isHistory && provider?.chatSessionType === 'local') {
		// Local non-history sessions are always active
		isActiveSession = true;
	} else if (session.isHistory && chatWidgetService && chatService && editorGroupsService) {
		// Check if session is open in a chat widget
		const widget = chatWidgetService.getWidgetBySessionId(session.id);
		if (widget) {
			isActiveSession = true;
		} else {
			// Check if session is open in any editor
			for (const group of editorGroupsService.groups) {
				for (const editor of group.editors) {
					if (editor instanceof ChatEditorInput && editor.sessionId === session.id) {
						isActiveSession = true;
						break;
					}
				}
				if (isActiveSession) {
					break;
				}
			}
		}
	}

	overlay.push([ChatContextKeys.isActiveSession.key, isActiveSession]);

	return overlay;
}
