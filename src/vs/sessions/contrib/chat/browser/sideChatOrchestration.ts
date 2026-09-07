/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { URI } from '../../../../base/common/uri.js';
import { ISessionsPartService } from '../../../services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession, ISideChatSelection } from '../../../services/sessions/common/session.js';
import { ISendRequestOptions, ISessionsManagementService } from '../../../services/sessions/common/sessionsManagement.js';

/** Activates a new side chat in its own group before sending the request. */
export async function openAndSendSideChat(
	sessionsManagementService: ISessionsManagementService,
	sessionsService: ISessionsService,
	sessionsPartService: ISessionsPartService,
	session: ISession,
	sideChat: IChat,
	requestOptions: ISendRequestOptions,
): Promise<void> {
	await sessionsService.openChat(session, sideChat.resource);
	sessionsPartService.getSessionView(session.sessionId)?.splitChatToSide(sideChat.resource);
	await sessionsManagementService.sendRequest(session, sideChat, requestOptions);
}

/**
 * Creates a side chat branched from `turnId` in `sourceChat`, then opens and
 * sends the request on it via {@link openAndSendSideChat}.
 */
export async function createAndSendSideChat(
	sessionsManagementService: ISessionsManagementService,
	sessionsService: ISessionsService,
	sessionsPartService: ISessionsPartService,
	session: ISession,
	sourceChat: URI,
	turnId: string,
	requestOptions: ISendRequestOptions,
	selection?: ISideChatSelection,
): Promise<IChat> {
	const sideChat = await sessionsManagementService.createSideChatInSession(session, sourceChat, turnId, selection);
	await openAndSendSideChat(sessionsManagementService, sessionsService, sessionsPartService, session, sideChat, requestOptions);
	return sideChat;
}
