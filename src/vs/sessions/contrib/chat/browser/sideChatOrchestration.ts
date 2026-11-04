/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun } from '../../../../base/common/observable.js';
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
	const opening = sessionsService.openChat(session, sideChat.resource);
	const navigationRequest = sessionsService.navigationRequest.get();
	await opening;
	if (sessionsService.navigationRequest.get() !== navigationRequest) {
		await sessionsManagementService.sendRequestInBackground(session, sideChat, requestOptions);
		return;
	}
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
	const navigationRequest = sessionsService.navigationRequest.get();
	const activeSession = sessionsService.activeSession.get();
	const activeChat = activeSession?.activeChat.get();
	let navigated = false;
	const navigationObserver = autorun(reader => {
		const currentSession = sessionsService.activeSession.read(reader);
		const currentChat = currentSession?.activeChat.read(reader);
		if (sessionsService.navigationRequest.read(reader) !== navigationRequest || currentSession !== activeSession || currentChat !== activeChat) {
			navigated = true;
		}
	});
	let sideChat: IChat;
	try {
		sideChat = await sessionsManagementService.createSideChatInSession(session, sourceChat, turnId, selection);
	} finally {
		navigationObserver.dispose();
	}
	if (navigated) {
		await sessionsManagementService.sendRequestInBackground(session, sideChat, requestOptions);
	} else {
		await openAndSendSideChat(sessionsManagementService, sessionsService, sessionsPartService, session, sideChat, requestOptions);
	}
	return sideChat;
}
