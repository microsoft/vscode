/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationTokenSource } from '../../../../base/common/cancellation.js';
import { Disposable, IDisposable, toDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { IAgentHostConnectionsService, isDefaultChatLinkId } from '../../../../platform/agentHost/common/agentHostConnectionsService.js';
import { parseOpenSessionLinkTurnId } from '../../../../platform/agentHost/common/openSessionLink.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { ILogService } from '../../../../platform/log/common/log.js';
import { IChatWidgetService } from '../../../../workbench/contrib/chat/browser/chat.js';
import { revealChatRequest } from '../../../../workbench/contrib/chat/browser/widget/chatRequestReveal.js';
import { IChatWindow, IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { ISession } from '../../../../workbench/services/sessions/common/session.js';
import { isChatWindowChatGone } from '../../../../workbench/contrib/sessions/browser/chatEditor/sessionChatOpening.js';
import { CHAT_WINDOWS_ENABLED_SETTING } from '../../chatWindow/common/chatWindows.js';

/** The chat window a link was activated in, and the chat of it the user activated it in. */
export interface IChatWindowLinkSource {
	readonly window: IChatWindow;
	readonly chat: URI;
}

/**
 * The link source of the chat window a link was activated in, while chat windows are on. The window's active chat is the
 * one the link was activated in: read it as the link is activated, as it can change while the link resolves.
 */
export function getChatWindowLinkSource(window: IChatWindow | undefined, configurationService: IConfigurationService): IChatWindowLinkSource | undefined {
	if (!window || !configurationService.getValue<boolean>(CHAT_WINDOWS_ENABLED_SETTING)) {
		return undefined;
	}
	return { window, chat: window.chat.get() };
}

/**
 * The chat a link names in `session`: the chat of its chat id, or the main chat without one, or when the id names the
 * session's advertised default chat, as an opaque id or the chat's resource.
 */
export async function resolveLinkedChat(connectionsService: IAgentHostConnectionsService, session: ISession, chatId: string | undefined): Promise<URI> {
	if (chatId) {
		const resolution = connectionsService.resolveSessionResource(session.resource);
		if (!resolution || !await isDefaultChatLinkId(resolution.connection, resolution.backendSession, chatId)) {
			return session.resource.with({ fragment: chatId });
		}
	}
	return session.mainChat.get().resource;
}

/**
 * Opens a chat of a link in the chat window the link was activated in, as a tab of the chat it was activated in, or beside
 * it when opened to the side. A chat that another chat window shows is revealed there, and one the main window's grid shows
 * moves into this window. Returns false, for the main window to open it, when the chat window would end the chat, as it
 * does an archived or gone one, or cannot resolve it, as it cannot a chat of a session that still loads.
 */
export async function openLinkedChatInChatWindow(chatWindowService: IChatWindowService, source: IChatWindowLinkSource, session: ISession, chatResource: URI, openToSide: boolean): Promise<boolean> {
	if (isChatWindowChatGone(session, chatResource, undefined)) {
		return false;
	}
	return !!await chatWindowService.open(chatResource, { window: source.window, exactChat: true, ...(openToSide ? { beside: source.chat } : { tabOf: source.chat }) });
}

/**
 * Scrolls the opened chat of a link to the request its `turn` names, until the returned disposable cancels it. A turn
 * the chat no longer shows, for example after its history was cleared, leaves the chat where it opened.
 */
export function revealLinkedTurn(chatWidgetService: IChatWidgetService, logService: ILogService, link: URI | string, chatResource: URI): IDisposable {
	const turnId = parseOpenSessionLinkTurnId(link);
	if (!turnId) {
		return Disposable.None;
	}
	const cancellation = new CancellationTokenSource();
	void revealChatRequest(chatWidgetService, () => chatWidgetService.getWidgetBySessionResource(chatResource), turnId, cancellation.token).then(revealed => {
		if (!revealed && !cancellation.token.isCancellationRequested) {
			logService.trace(`[ChatLinkRouting] The linked request ${turnId} did not appear in ${chatResource.toString()}`);
		}
	});
	return toDisposable(() => cancellation.dispose(true));
}
