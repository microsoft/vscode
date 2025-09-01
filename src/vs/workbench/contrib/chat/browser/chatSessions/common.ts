/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { EditorInput } from '../../../../common/editor/editorInput.js';
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

export function getChatSessionType(editor: ChatEditorInput): string {
	// Check if the editor has an explicit chatSessionType in options
	if (editor.options.chatSessionType) {
		return editor.options.chatSessionType;
	}

	// For vscode-chat-session URIs, extract from authority
	if (editor.resource?.scheme === 'vscode-chat-session') {
		const parsed = ChatSessionUri.parse(editor.resource);
		if (parsed) {
			return parsed.chatSessionType;
		}
	}

	// Default to 'local' for vscode-chat-editor scheme or when type cannot be determined
	return 'local';
}
