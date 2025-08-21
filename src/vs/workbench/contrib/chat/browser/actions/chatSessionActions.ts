/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { IChatService } from '../../common/chatService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import Severity from '../../../../../base/common/severity.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { ChatEditorInput } from '../chatEditorInput.js';

export interface IChatSessionContext {
	sessionId: string;
	sessionType: 'editor' | 'widget';
	currentTitle: string;
	editorInput?: any;
	editorGroup?: any;
	widget?: any;
}

interface IMarshalledChatSessionContext {
	$mid: MarshalledId.ChatSessionContext;
	session: {
		id: string;
		label: string;
		editor?: ChatEditorInput;
		widget?: any;
		sessionType?: 'editor' | 'widget';
	};
}

function isMarshalledChatSessionContext(obj: unknown): obj is IMarshalledChatSessionContext {
	return !!obj &&
		typeof obj === 'object' &&
		'$mid' in obj &&
		(obj as any).$mid === MarshalledId.ChatSessionContext &&
		'session' in obj;
}

export class RenameChatSessionAction extends Action2 {
	static readonly id = 'workbench.action.chat.renameSession';

	constructor() {
		super({
			id: RenameChatSessionAction.id,
			title: localize('renameSession', "Rename"),
			f1: false,
			category: 'Chat',
			keybinding: {
				weight: KeybindingWeight.WorkbenchContrib,
				primary: KeyCode.F2,
				when: ContextKeyExpr.equals('focusedView', 'workbench.view.chat.sessions.local')
			}
		});
	}

	async run(accessor: ServicesAccessor, context?: IChatSessionContext | IMarshalledChatSessionContext): Promise<void> {
		if (!context) {
			return;
		}

		// Handle marshalled context from menu actions
		let sessionContext: IChatSessionContext;
		if (isMarshalledChatSessionContext(context)) {
			const session = context.session;
			// Extract actual session ID based on session type
			let actualSessionId: string | undefined;
			const currentTitle = session.label;

			// For local sessions, we need to extract the actual session ID from editor or widget
			if (session.sessionType === 'editor' && session.editor instanceof ChatEditorInput) {
				actualSessionId = session.editor.sessionId;
			} else if (session.sessionType === 'widget' && session.widget) {
				actualSessionId = session.widget.viewModel?.model.sessionId;
			} else {
				// Fall back to using the session ID directly
				actualSessionId = session.id;
			}

			if (!actualSessionId) {
				return; // Can't proceed without a session ID
			}

			sessionContext = {
				sessionId: actualSessionId,
				sessionType: session.sessionType || 'editor',
				currentTitle: currentTitle,
				editorInput: session.editor,
				widget: session.widget
			};
		} else {
			sessionContext = context;
		}

		const chatSessionsService = accessor.get(IChatSessionsService);
		const logService = accessor.get(ILogService);
		const chatService = accessor.get(IChatService);

		try {
			// Find the chat sessions view and trigger inline rename mode
			// This is similar to how file renaming works in the explorer
			await chatSessionsService.setEditableSession(sessionContext.sessionId, {
				validationMessage: (value: string) => {
					if (!value || value.trim().length === 0) {
						return { content: localize('renameSession.emptyName', "Name cannot be empty"), severity: Severity.Error };
					}
					if (value.length > 100) {
						return { content: localize('renameSession.nameTooLong', "Name is too long (maximum 100 characters)"), severity: Severity.Error };
					}
					return null;
				},
				placeholder: localize('renameSession.placeholder', "Enter new name for chat session"),
				startingValue: sessionContext.currentTitle,
				onFinish: async (value: string, success: boolean) => {
					if (success && value && value.trim() !== sessionContext.currentTitle) {
						try {
							const newTitle = value.trim();
							chatService.setChatSessionTitle(sessionContext.sessionId, newTitle);
						} catch (error) {
							logService.error(
								localize('renameSession.error', "Failed to rename chat session: {0}",
									(error instanceof Error ? error.message : String(error)))
							);
						}
					}
					await chatSessionsService.setEditableSession(sessionContext.sessionId, null);
				}
			});
		} catch (error) {
			logService.error('Failed to rename chat session', error instanceof Error ? error.message : String(error));
		}
	}
}

// Register the menu item - only show for local chat sessions that are not history items
MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: RenameChatSessionAction.id,
		title: localize('renameSession', "Rename")
	},
	group: 'context',
	order: 1,
	when: ContextKeyExpr.and(
		ChatContextKeys.sessionType.isEqualTo('local'),
		ChatContextKeys.isHistoryItem.isEqualTo(false)
	)
});
