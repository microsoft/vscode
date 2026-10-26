/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { toErrorMessage } from '../../../../base/common/errorMessage.js';
import { localize, localize2 } from '../../../../nls.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { IsSessionsWindowContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';
import { getChatCapabilities } from '../../../services/sessions/common/session.js';

/**
 * Re-applies the archived state of every archived chat in the unarchived
 * sessions, so the provider detaches those chats' folders from their session
 * workspace. Repairs sessions whose chats were archived before archiving
 * detached their folders.
 */
class UpdateSessionFoldersWithChatsAction extends Action2 {

	static readonly ID = 'sessions.updateSessionFoldersWithChats';

	constructor() {
		super({
			id: UpdateSessionFoldersWithChatsAction.ID,
			title: localize2('sessions.updateSessionFoldersWithChats', "Update Session Folders with Chats"),
			category: Categories.Developer,
			f1: true,
			precondition: ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const sessionsManagementService = accessor.get(ISessionsManagementService);
		const notificationService = accessor.get(INotificationService);
		const logService = accessor.get(ILogService);

		let updated = 0;
		let failed = 0;
		for (const session of sessionsManagementService.getSessions()) {
			if (session.isArchived.get()) {
				continue;
			}
			for (const chat of session.chats.get()) {
				if (!chat.isArchived.get() || !getChatCapabilities(chat, session, undefined).canArchive) {
					continue;
				}
				try {
					await sessionsManagementService.archiveChat(session, chat);
					updated++;
				} catch (error) {
					failed++;
					logService.error(`[UpdateSessionFoldersWithChats] Failed to update chat ${chat.resource.toString()}: ${toErrorMessage(error)}`);
				}
			}
		}

		if (failed) {
			notificationService.info(localize('sessions.updateSessionFoldersWithChats.partial', "Updated folders for {0} archived chat(s). {1} chat(s) could not be updated; see the log for details.", updated, failed));
		} else if (updated === 1) {
			notificationService.info(localize('sessions.updateSessionFoldersWithChats.doneOne', "Updated folders for 1 archived chat."));
		} else {
			notificationService.info(localize('sessions.updateSessionFoldersWithChats.done', "Updated folders for {0} archived chats.", updated));
		}
	}
}

registerAction2(UpdateSessionFoldersWithChatsAction);
