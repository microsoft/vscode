/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAction, toAction } from '../../../../base/common/actions.js';
import { localize } from '../../../../nls.js';
import { ICommandService } from '../../../../platform/commands/common/commands.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { INotificationService } from '../../../../platform/notification/common/notification.js';
import { NEW_CHAT_IN_SESSION_COMMAND_ID } from '../../../common/sessionCommands.js';
import { ISession } from '../../../services/sessions/common/session.js';

function canCreatePeer(session: ISession): boolean {
	const connection = session.remoteConnectionStatus?.get();
	return session.capabilities.get().supportsMultipleChats && !session.isArchived.get()
		&& !session.isQuickChat?.get() && !session.isExternal?.get() && !session.createdBySession?.get()
		&& (!connection || connection.kind === 'connected');
}

export function createProjectBoardPeerChatAction(
	getSession: () => ISession | undefined,
	commandService: ICommandService,
	logService: ILogService,
	notificationService: INotificationService,
): IAction | undefined {
	const session = getSession();
	if (!session || !canCreatePeer(session)) {
		return undefined;
	}
	return toAction({
		id: NEW_CHAT_IN_SESSION_COMMAND_ID,
		label: localize('projectBoard.newPeerChat', "New Chat in This Session"),
		run: async () => {
			const current = getSession();
			if (!current || !canCreatePeer(current)) {
				notificationService.warn(localize('projectBoard.peerChatUnavailable', "This session is no longer available for a new chat."));
				return;
			}
			try {
				await commandService.executeCommand(NEW_CHAT_IN_SESSION_COMMAND_ID, current);
			} catch (error) {
				logService.error('[ProjectBoard] Failed to create a peer chat', error);
				notificationService.error(localize('projectBoard.peerChatFailed', "The new chat could not be opened in this session."));
			}
		},
	});
}
