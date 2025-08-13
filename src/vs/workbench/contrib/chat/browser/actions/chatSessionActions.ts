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
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatService } from '../../common/chatService.js';
import { IChatSessionsService } from '../../common/chatSessionsService.js';

export interface IChatSessionContext {
	sessionId: string;
	sessionType: 'editor' | 'widget';
	currentTitle: string;
	editorInput?: any;
	editorGroup?: any;
	widget?: any;
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

	async run(accessor: ServicesAccessor, context?: IChatSessionContext): Promise<void> {
		if (!context) {
			return;
		}

		const chatSessionsService = accessor.get(IChatSessionsService);
		const notificationService = accessor.get(INotificationService);
		const chatService = accessor.get(IChatService);

		try {
			// Find the chat sessions view and trigger inline rename mode
			// This is similar to how file renaming works in the explorer
			await chatSessionsService.setEditableSession(context.sessionId, {
				validationMessage: (value: string) => {
					if (!value || value.trim().length === 0) {
						return { content: localize('renameSession.emptyName', "Name cannot be empty"), severity: 1 /* Error */ };
					}
					if (value.length > 100) {
						return { content: localize('renameSession.nameTooLong', "Name is too long (maximum 100 characters)"), severity: 1 /* Error */ };
					}
					return null;
				},
				placeholder: localize('renameSession.placeholder', "Enter new name for chat session"),
				startingValue: context.currentTitle,
				onFinish: async (value: string, success: boolean) => {
					if (success && value && value.trim() !== context.currentTitle) {
						try {
							const newTitle = value.trim();
							await chatService.setChatSessionTitle(context.sessionId, newTitle);

							notificationService.info(
								localize('renameSession.success', "Chat session renamed to '{0}'", newTitle)
							);
						} catch (error) {
							notificationService.error(
								localize('renameSession.error', "Failed to rename chat session: {0}",
									(error instanceof Error ? error.message : String(error)))
							);
						}
					}
					await chatSessionsService.setEditableSession(context.sessionId, null);
				}
			});
		} catch (error) {
			notificationService.error(
				localize('renameSession.error', "Failed to rename chat session: {0}",
					(error instanceof Error ? error.message : String(error)))
			);
		}
	}
}

// Register the menu item - only show for local chat sessions
MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: RenameChatSessionAction.id,
		title: localize('renameSession', "Rename")
	},
	group: '1_modification',
	order: 1,
	when: ContextKeyExpr.true() // Will be filtered by context menu handler
});
