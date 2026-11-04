/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { isEqual } from '../../../../base/common/resources.js';
import { URI } from '../../../../base/common/uri.js';
import { localize2 } from '../../../../nls.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IsAuxiliaryWindowContext, IsSessionsWindowContext, LayoutModeContext } from '../../../../workbench/common/contextkeys.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { IChatWindowOpenOptions, IChatWindowService } from '../../../../workbench/contrib/chatWindow/browser/chatWindow.js';
import { resolveChatWindow } from '../../../../workbench/contrib/chatWindow/browser/chatWindowLayoutActions.js';
import { IEditorGroupsService } from '../../../../workbench/services/editor/common/editorGroupsService.js';
import { Menus, SessionHeaderMenus } from '../../../browser/menus.js';
import { IAgentWorkbenchLayoutService } from '../../../browser/workbench.js';
import { SessionsCategories } from '../../../common/categories.js';
import { SessionIsCreatedContext, SessionItemIsMultiSelectionContext } from '../../../common/contextkeys.js';
import { ISessionsService } from '../../../services/sessions/browser/sessionsService.js';
import { IChat, ISession } from '../../../services/sessions/common/session.js';
import { CHAT_WINDOWS_ENABLED_SETTING } from '../common/chatWindows.js';

export const OPEN_CHAT_IN_WINDOW_COMMAND_ID = 'sessions.chatWindow.openChat';
export const OPEN_SESSION_IN_WINDOW_COMMAND_ID = 'sessions.openInChatWindow';
export const OPEN_ACTIVE_CHAT_IN_WINDOW_COMMAND_ID = 'sessions.openActiveChatInChatWindow';
export const MOVE_CHAT_TO_MAIN_WINDOW_COMMAND_ID = 'sessions.chatWindow.moveToMainWindow';

/** Whether chats can be opened in windows of their own: the setting is on, and AI features are enabled. */
export const ChatWindowsEnabledContext = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.has(`config.${CHAT_WINDOWS_ENABLED_SETTING}`))!;

/** In the main window: a chat window opens chats from it, and shows its own chat. */
const InMainWindowContext = IsAuxiliaryWindowContext.toNegated();

/** In a chat window: a window of the Agents window with layout modes. */
const InChatWindowContext = ContextKeyExpr.and(IsSessionsWindowContext, IsAuxiliaryWindowContext, LayoutModeContext)!;

/**
 * Moves the chat `session` shows in the main window, or its main chat, to a chat window of its own: the main window then
 * shows the session it showed before, or a new session. The chat takes the editors it has open in the main window along,
 * to the main part beside it, but only while the main window shows that chat.
 */
export async function openChatInWindow(accessor: ServicesAccessor, session: ISession, chat?: URI, options?: IChatWindowOpenOptions): Promise<void> {
	const chatWindowService = accessor.get(IChatWindowService);
	const sessionsService = accessor.get(ISessionsService);
	const editorGroupsService = accessor.get(IEditorGroupsService);
	const layoutService = accessor.get(IAgentWorkbenchLayoutService);

	const shown = sessionsService.visibleSessions.get().find(candidate => candidate?.sessionId === session.sessionId && !candidate.scopedChatResource);
	const chatResource = chat ?? shown?.activeChat.get().resource;
	// The main window's editors are the chat's while the main window is laid out for it and shows it as its active chat.
	const mainActive = sessionsService.mainWindowActiveSession.get();
	const ownsEditors = mainActive?.sessionId === session.sessionId
		&& (!chatResource || isEqual(mainActive.activeChat.get().resource, chatResource));
	// The editors moving out empty the main window's editor part: that is not the user closing them, so the main window
	// keeps its side pane as it is, for the session it shows next, as when it switches sessions.
	const suppression = ownsEditors ? layoutService.suppressEditorPartAutoVisibility() : undefined;
	try {
		await chatWindowService.open(chatResource ?? session.resource, {
			...options,
			editors: { ...options?.editors, moveFrom: ownsEditors ? editorGroupsService.mainPart.groups : [] },
		});
	} finally {
		suppression?.dispose();
	}
}

registerAction2(class OpenSessionInChatWindowAction extends Action2 {
	constructor() {
		super({
			id: OPEN_SESSION_IN_WINDOW_COMMAND_ID,
			title: localize2('openSessionInNewWindow', "Open in New Window"),
			icon: Codicon.openInWindow,
			precondition: ChatWindowsEnabledContext,
			menu: [{
				id: Menus.SessionItemContextMenu,
				// Right after Open to the Side.
				group: '0_pin',
				order: 1.5,
				when: ContextKeyExpr.and(ChatWindowsEnabledContext, IsSessionsWindowContext, SessionItemIsMultiSelectionContext.negate()),
			}, ...SessionHeaderMenus.map(id => ({
				id,
				// Before Close.
				group: 'secondary/4_pin',
				order: 14,
				when: ContextKeyExpr.and(ChatWindowsEnabledContext, IsSessionsWindowContext, SessionIsCreatedContext, InMainWindowContext),
			}))],
		});
	}

	override async run(accessor: ServicesAccessor, context?: ISession | ISession[]): Promise<void> {
		const session = Array.isArray(context) ? context[0] : context;
		if (session) {
			await openChatInWindow(accessor, session);
		}
	}
});

registerAction2(class OpenChatInChatWindowAction extends Action2 {
	constructor() {
		super({
			id: OPEN_CHAT_IN_WINDOW_COMMAND_ID,
			title: localize2('openChatInNewWindow', "Open in New Window"),
			icon: Codicon.openInWindow,
			precondition: ChatWindowsEnabledContext,
			menu: [{
				id: Menus.SessionChatItemContext,
				group: '0_window',
				order: 1,
				when: ContextKeyExpr.and(ChatWindowsEnabledContext, IsSessionsWindowContext, ContextKeyExpr.has('sessionChatItem.isUntitled').negate()),
			}],
		});
	}

	override async run(accessor: ServicesAccessor, context?: { readonly session: ISession; readonly chat: IChat }): Promise<void> {
		if (context) {
			await openChatInWindow(accessor, context.session, context.chat.resource);
		}
	}
});

registerAction2(class OpenActiveChatInChatWindowAction extends Action2 {
	constructor() {
		super({
			id: OPEN_ACTIVE_CHAT_IN_WINDOW_COMMAND_ID,
			title: localize2('openActiveChatInNewWindow', "Open Chat in New Window"),
			category: SessionsCategories.Sessions,
			icon: Codicon.openInWindow,
			f1: true,
			precondition: ContextKeyExpr.and(ChatWindowsEnabledContext, IsSessionsWindowContext, SessionIsCreatedContext, InMainWindowContext),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const session = accessor.get(ISessionsService).mainWindowActiveSession.get();
		if (session) {
			await openChatInWindow(accessor, session);
		}
	}
});

registerAction2(class MoveChatToMainWindowAction extends Action2 {
	constructor() {
		super({
			id: MOVE_CHAT_TO_MAIN_WINDOW_COMMAND_ID,
			title: localize2('moveChatToMainWindow', "Move to Main Window"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(ChatContextKeys.enabled, InChatWindowContext),
			menu: SessionHeaderMenus.map(id => ({
				id,
				// Before Close.
				group: 'secondary/4_pin',
				order: 14,
				when: ContextKeyExpr.and(ChatContextKeys.enabled, InChatWindowContext),
			})),
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const chatWindowService = accessor.get(IChatWindowService);
		// The window it is run from, such as by a control of a window that does not have focus yet, else the focused one.
		const window = resolveChatWindow(accessor, args);
		if (window) {
			await chatWindowService.moveToMainWindow(window);
		}
	}
});
