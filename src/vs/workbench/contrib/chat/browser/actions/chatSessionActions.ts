/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { KeyCode } from '../../../../../base/common/keyCodes.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { INotificationService } from '../../../../../platform/notification/common/notification.js';
import { IChatService } from '../../common/chatService.js';
import { IChatWidgetService } from '../chat.js';
import { IEditorService } from '../../../../services/editor/common/editorService.js';
import { IViewsService } from '../../../../services/views/common/viewsService.js';

export interface IChatSessionContext {
	sessionId: string;
	sessionType: 'editor' | 'widget';
	currentTitle: string;
	editorInput?: any;
	editorGroup?: any;
	widget?: any;
}

export class RenameChatSessionAction extends Action2 {
	static readonly ID = 'workbench.action.chat.renameSession';

	constructor() {
		super({
			id: RenameChatSessionAction.ID,
			title: localize('renameSession', "Rename"),
			f1: true,
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

		const dialogService = accessor.get(IDialogService);
		const chatService = accessor.get(IChatService);
		const notificationService = accessor.get(INotificationService);

		try {
			const result = await dialogService.input({
				prompt: localize('renameSession.prompt', "Enter new name for chat session"),
				value: context.currentTitle,
				validateInput: (value: string) => {
					if (!value || value.trim().length === 0) {
						return localize('renameSession.emptyName', "Name cannot be empty");
					}
					if (value.length > 100) {
						return localize('renameSession.nameTooLong', "Name is too long (maximum 100 characters)");
					}
					return null;
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
				localize('renameSession.error', "Failed to rename chat session: {0}", error.message || error)
			);
		}
	}
}

// Register the action
MenuRegistry.appendMenuItem(MenuId.ChatSessionsMenu, {
	command: {
		id: RenameChatSessionAction.ID,
		title: localize('renameSession', "Rename")
	},
	group: '1_modification',
	order: 1,
	when: ContextKeyExpr.true()
});