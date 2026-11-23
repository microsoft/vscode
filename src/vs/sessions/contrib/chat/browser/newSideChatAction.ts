/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IQuickInputService } from '../../../../platform/quickinput/common/quickInput.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, IsTopRightEditorGroupContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatSideChatService } from '../../../../workbench/contrib/chat/common/chatSideChatService.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { SessionsCategories } from '../../../../workbench/contrib/sessions/common/categories.js';
import { SessionIsArchivedContext, SessionIsCreatedContext, SessionSupportsSideChatContext } from '../../../../workbench/contrib/sessions/common/contextkeys.js';
import { AgentsWindowMenus } from '../../../browser/agentsWindowMenus.js';

export const NEW_SIDE_CHAT_COMMAND_ID = 'workbench.action.agentSessions.newSideChat';

const newSideChatWhen = ContextKeyExpr.and(
	ChatContextKeys.enabled,
	IsSessionsWindowContext,
	IsAuxiliaryWindowContext.toNegated(),
	ChatContextKeys.sideChatsInSidePane,
	SessionSupportsSideChatContext,
	SessionIsCreatedContext,
	SessionIsArchivedContext.negate(),
);

// The Add Tab menu names what it adds, as its Browser and Canvas entries do; the Command Palette names the command.
MenuRegistry.appendMenuItems([AgentsWindowMenus.SessionsEditorTabsBarAddTab, AgentsWindowMenus.SessionsEmptyEditorGroupAddTab].map(id => ({
	id,
	item: {
		command: {
			id: NEW_SIDE_CHAT_COMMAND_ID,
			title: localize2('sideChatAddTab', "Side Chat"),
			icon: Codicon.commentDiscussion,
			precondition: newSideChatWhen,
		},
		group: 'navigation',
		order: 5,
		when: ContextKeyExpr.and(newSideChatWhen, IsTopRightEditorGroupContext),
	},
})));

/** Asks a side question about the grid's active chat, which opens a side chat in the side pane, as `/btw` does. */
registerAction2(class NewSideChatAction extends Action2 {
	constructor() {
		super({
			id: NEW_SIDE_CHAT_COMMAND_ID,
			title: localize2('newSideChat', "New Side Chat"),
			category: SessionsCategories.Sessions,
			icon: Codicon.commentDiscussion,
			f1: true,
			precondition: newSideChatWhen,
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsService = accessor.get(ISessionsService);
		const sideChatService = accessor.get(IChatSideChatService);
		const quickInputService = accessor.get(IQuickInputService);
		const notificationService = accessor.get(INotificationService);
		const chat = sessionsService.gridHost.chat.get();
		if (!chat) {
			return;
		}
		if (!sideChatService.canAskInSideChat(chat.resource)) {
			notificationService.info(localize('newSideChat.noTurn', "Send a message in this chat before starting a side chat."));
			return;
		}
		const query = (await quickInputService.input({
			title: localize('newSideChat.title', "New Side Chat"),
			prompt: localize('newSideChat.prompt', "Ask a side question about \"{0}\" without adding it to that chat.", chat.title.get() || localize('newSideChat.untitled', "Untitled Chat")),
			placeHolder: localize('newSideChat.placeholder', "Ask a side question"),
		}))?.trim();
		if (!query) {
			return;
		}
		try {
			await sideChatService.askInSideChat(chat.resource, query);
		} catch (error) {
			notificationService.error(localize('newSideChat.failed', "The side chat could not be started: {0}", toErrorMessage(error)));
		}
	}
});
