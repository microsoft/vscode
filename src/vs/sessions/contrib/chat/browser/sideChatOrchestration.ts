/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, ISideChatSelection } from '../../../services/sessions/common/session.js';
import { ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/**
 * Activates `sideChat` through the normal sessions navigation flow, then
 * sends `query` on it. Shared by every side-chat entry point (`/btw`,
 * response-selection) so they stay consistent about activating the chat
 * before sending the first message.
 */
export async function openAndSendSideChat(
	sessionsManagementService: ISessionsManagementService,
	sessionsService: ISessionsService,
	session: ISession,
	sideChat: IChat,
	query: string,
): Promise<void> {
	await sessionsService.openChat(session, sideChat.resource);
	await sessionsManagementService.sendRequest(session, sideChat, { query });
}

/**
 * Creates a side chat branched from `turnId` in `sourceChat`, then opens and
 * sends `query` on it via {@link openAndSendSideChat}.
 */
export async function createAndSendSideChat(
	sessionsManagementService: ISessionsManagementService,
	sessionsService: ISessionsService,
	session: ISession,
	sourceChat: URI,
	turnId: string,
	query: string,
	selection?: ISideChatSelection,
): Promise<IChat> {
	const sideChat = await sessionsManagementService.createSideChatInSession(session, sourceChat, turnId, selection);
	await openAndSendSideChat(sessionsManagementService, sessionsService, session, sideChat, query);
	return sideChat;
}
