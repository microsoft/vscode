/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { autorun } from '../../../../base/common/observable.js';
import { URI } from '../../../../base/common/uri.js';
import { getWindowHost, ISessionHostService, SessionHostKind } from '../../../../workbench/services/sessions/browser/sessionHost.js';
import { ISessionsPartService } from '../../../../workbench/services/sessions/browser/sessionsPartService.js';
import { ISessionsService } from '../../../../workbench/contrib/sessions/browser/sessionsService.js';
import { IChat, ISession, ISideChatSelection } from '../../../../workbench/services/sessions/common/session.js';
import { ISendRequestOptions, ISessionsManagementService } from '../../../../workbench/contrib/sessions/common/sessionsManagement.js';

/**
 * Opens a new side chat beside its source chat, in the chat window that shows the source chat or else in the grid, before
 * sending the request.
 */
export async function openAndSendSideChat(
	sessionsManagementService: ISessionsManagementService,
	sessionsService: ISessionsService,
	sessionsPartService: ISessionsPartService,
	session: ISession,
	sideChat: IChat,
	sourceChat: URI,
	sourceInGrid: boolean,
	requestOptions: ISendRequestOptions,
): Promise<void> {
	const opening = sessionsService.openChat(session, sideChat.resource, { referenceChatResource: sourceChat });
	const navigationRequest = sessionsService.navigationRequest.get();
	await opening;
	if (sessionsService.navigationRequest.get() !== navigationRequest) {
		await sessionsManagementService.sendRequestInBackground(session, sideChat, requestOptions);
		return;
	}
	if (!sourceInGrid) {
		// A foreground send discards the main window's new-session draft and makes its slot follow the sent chat.
		await sessionsManagementService.sendRequestInBackground(session, sideChat, requestOptions);
		return;
	}
	sessionsPartService.getSessionView(session.sessionId)?.splitChatToSide(sideChat.resource);
	await sessionsManagementService.sendRequest(session, sideChat, requestOptions);
}

/**
 * Creates a side chat with source context by default, then opens and sends the request.
 * Sends in the background if the user navigated away from `sourceChat` meanwhile.
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
	includeSourceContext?: boolean,
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
		sideChat = await sessionsManagementService.createSideChatInSession(session, sourceChat, turnId, selection, includeSourceContext);
	} finally {
		navigationObserver.dispose();
	}
	if (navigated) {
		await sessionsManagementService.sendRequestInBackground(session, sideChat, requestOptions);
	} else {
		await openAndSendSideChat(sessionsManagementService, sessionsService, sessionsPartService, session, sideChat, sourceChat, inGrid, requestOptions);
	}
	return sideChat;
}
