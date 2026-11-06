/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { getWindowHost, ISessionHostService, SessionHostKind } from '../../../services/sessions/browser/sessionHost.js';
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
 * sends the request on it via {@link openAndSendSideChat}, or sends it in the
 * background when the user navigated away from `sourceChat` meanwhile: the
 * window that shows it shows another chat, or none shows it any more.
 */
export async function createAndSendSideChat(
	sessionsManagementService: ISessionsManagementService,
	sessionsService: ISessionsService,
	sessionsPartService: ISessionsPartService,
	sessionHostService: ISessionHostService,
	session: ISession,
	sourceChat: URI,
	turnId: string,
	requestOptions: ISendRequestOptions,
	selection?: ISideChatSelection,
): Promise<IChat> {
	const sourceHost = sessionHostService.getHostOfChat(sourceChat);
	const windowHost = sourceHost && getWindowHost(sourceHost);
	// Navigation in the grid concerns a chat the grid shows only.
	const inGrid = windowHost?.kind === SessionHostKind.MainWindow;
	const navigationRequest = sessionsService.navigationRequest.get();
	const shownSession = windowHost?.session.get();
	const shownChat = windowHost?.chat.get();
	let navigated = !windowHost;
	const navigationObserver = autorun(reader => {
		if (!windowHost
			|| (inGrid && sessionsService.navigationRequest.read(reader) !== navigationRequest)
			|| windowHost.session.read(reader) !== shownSession
			|| windowHost.chat.read(reader) !== shownChat
			|| !sessionHostService.isShown(sourceChat, reader)) {
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
