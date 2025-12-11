/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { MarshalledId } from '../../../../../base/common/marshallingIds.js';
import { localize } from '../../../../../nls.js';
import { Action2, MenuId, MenuRegistry } from '../../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { IDialogService } from '../../../../../platform/dialogs/common/dialogs.js';
import { ServicesAccessor } from '../../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../../platform/log/common/log.js';
import { ChatContextKeys } from '../../common/chatContextKeys.js';
import { IChatService } from '../../common/chatService.js';
import { IChatSessionItem, IChatSessionsService, localChatSessionType } from '../../common/chatSessionsService.js';
import { CHAT_CATEGORY } from './chatActions.js';

export interface IMarshalledChatSessionContext {
	readonly $mid: MarshalledId.ChatSessionContext;
	readonly session: IChatSessionItem;
}

export function isMarshalledChatSessionContext(thing: unknown): thing is IMarshalledChatSessionContext {
	if (typeof thing === 'object' && thing !== null) {
		const candidate = thing as IMarshalledChatSessionContext;
		return candidate.$mid === MarshalledId.ChatSessionContext && typeof candidate.session === 'object' && candidate.session !== null;
	}

	return false;
}

/**
 * Action to delete a chat session from history
 */
export class DeleteChatSessionAction extends Action2 {
	static readonly id = 'workbench.action.chat.deleteSession';

	constructor() {
		super({
			id: DeleteChatSessionAction.id,
			title: localize('deleteSession', "Delete"),
			f1: false,
			category: CHAT_CATEGORY,
			icon: Codicon.x,
		});
	}

	async run(accessor: ServicesAccessor, context?: IMarshalledChatSessionContext): Promise<void> {
		if (!context) {
			return;
		}

		// Handle marshalled context from menu actions
		const chatService = accessor.get(IChatService);
		const dialogService = accessor.get(IDialogService);
		const logService = accessor.get(ILogService);
		const chatSessionsService = accessor.get(IChatSessionsService);

		try {
			// Show confirmation dialog
			const result = await dialogService.confirm({
				message: localize('deleteSession.confirm', "Are you sure you want to delete this chat session?"),
				detail: localize('deleteSession.detail', "This action cannot be undone."),
				primaryButton: localize('deleteSession.delete', "Delete"),
				type: 'warning'
			});

			if (result.confirmed) {
				await chatService.removeHistoryEntry(context.session.resource);
				// Notify the local sessions provider that items have changed
				chatSessionsService.notifySessionItemsChanged(localChatSessionType);
			}
		} catch (error) {
			logService.error('Failed to delete chat session', error instanceof Error ? error.message : String(error));
		}
	}
}

// Register delete menu item - only show for non-active sessions (history items)
MenuRegistry.appendMenuItem(MenuId.AgentSessionsContext, {
	command: {
		id: DeleteChatSessionAction.id,
		title: localize('deleteSession', "Delete"),
		icon: Codicon.x
	},
	group: 'inline',
	order: 2,
	when: ContextKeyExpr.and(
		ChatContextKeys.isArchivedAgentSession.isEqualTo(true),
		ChatContextKeys.isActiveAgentSession.isEqualTo(false)
	)
});
