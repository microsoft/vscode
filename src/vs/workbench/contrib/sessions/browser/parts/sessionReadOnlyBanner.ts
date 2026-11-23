/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IReader } from '../../../../../base/common/observable.js';
import { ChatSessionArchiveActionWording } from '../../../../../platform/chat/common/sessionArchiveActions.js';
import { ICommandService } from '../../../../../platform/commands/common/commands.js';
import { getArchivedChatReadOnlyBannerContent, IChatReadOnlyBannerContent } from '../../../chat/browser/widget/chatReadOnlyBanner.js';
import { UNARCHIVE_CHAT_COMMAND_ID, UNARCHIVE_SESSION_COMMAND_ID } from '../../common/sessionCommands.js';
import { IChat, ISession } from '../../../../services/sessions/common/session.js';

/**
 * The banner for a chat that is read-only because it is archived: either its
 * whole session is archived, which restores as a whole, or the chat itself is
 * an archived nested chat, which restores on its own. Returns `undefined` when
 * neither is archived.
 */
export function getArchivedChatBannerContent(session: ISession, chat: IChat, wording: ChatSessionArchiveActionWording, commandService: ICommandService, reader: IReader | undefined): IChatReadOnlyBannerContent | undefined {
	const sessionArchived = session.isArchived.read(reader);
	if (!sessionArchived && !chat.isArchived.read(reader)) {
		return undefined;
	}
	return getArchivedChatReadOnlyBannerContent(wording, () => sessionArchived
		? commandService.executeCommand<void>(UNARCHIVE_SESSION_COMMAND_ID, session)
		: commandService.executeCommand<void>(UNARCHIVE_CHAT_COMMAND_ID, { session, chat }));
}
