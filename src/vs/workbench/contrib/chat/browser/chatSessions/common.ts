/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';
import { IEditorGroupsService } from '../../../../services/editor/common/editorGroupsService.js';
import { IChatSessionItem, IChatSessionItemProvider } from '../../common/chatSessionsService.js';
import { ChatSessionUri } from '../../common/chatUri.js';
import { ChatEditorInput } from '../chatEditorInput.js';

export type ChatSessionItemWithProvider = IChatSessionItem & {
	readonly provider: IChatSessionItemProvider;
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
