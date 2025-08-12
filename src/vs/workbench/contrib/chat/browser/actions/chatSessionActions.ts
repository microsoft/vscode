/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IQuickInputService } from '../../../../../platform/quickinput/common/quickInput.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatService } from '../../common/chatService.js';

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

		const quickInputService = accessor.get(IQuickInputService);
		const chatService = accessor.get(IChatService);
		const notificationService = accessor.get(INotificationService);

		try {
			const result = await quickInputService.input({
				prompt: localize('renameSession.prompt', "Enter new name for chat session"),
				value: context.currentTitle,
				validateInput: async (value: string) => {
					if (!value || value.trim().length === 0) {
						return localize('renameSession.emptyName', "Name cannot be empty");
					}
					if (value.length > 100) {
						return localize('renameSession.nameTooLong', "Name is too long (maximum 100 characters)");
					}
					return undefined;
				}
			});

			if (result) {
				const newTitle = result.trim();
				await chatService.setChatSessionTitle(context.sessionId, newTitle);

				notificationService.info(
					localize('renameSession.success', "Chat session renamed to '{0}'", newTitle)
				);
			}
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
