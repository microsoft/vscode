/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, ISideChatSelection } from '../../../services/sessions/common/session.js';
import { ISendRequestOptions, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/**
 * Activates `sideChat` through the normal sessions navigation flow, then
 * sends the request on it. Shared by every side-chat entry point (`/btw`,
 * response-selection) so they stay consistent about activating the chat
 * before sending the first message.
 */
export async function openAndSendSideChat(
	sessionsManagementService: ISessionsManagementService,
	sessionsService: ISessionsService,
	session: ISession,
	sideChat: IChat,
	requestOptions: ISendRequestOptions,
): Promise<void> {
	await sessionsService.openChat(session, sideChat.resource);
	await sessionsManagementService.sendRequest(session, sideChat, requestOptions);
}

/**
 * Creates a side chat branched from `turnId` in `sourceChat`, then opens and
 * sends the request on it via {@link openAndSendSideChat}.
 */
export async function createAndSendSideChat(
	sessionsManagementService: ISessionsManagementService,
	sessionsService: ISessionsService,
	session: ISession,
	sourceChat: URI,
	turnId: string,
	requestOptions: ISendRequestOptions,
	selection?: ISideChatSelection,
): Promise<IChat> {
	const sideChat = await sessionsManagementService.createSideChatInSession(session, sourceChat, turnId, selection);
	await openAndSendSideChat(sessionsManagementService, sessionsService, session, sideChat, requestOptions);
	return sideChat;
}
