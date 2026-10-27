/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus, SessionActivityBarGroup } from '../../../browser/menus.js';
import { registerLayoutButtons, SessionLayoutButton, sessionLayoutModeTitles } from '../../../browser/sessionLayoutButtons.js';
import { SessionActivityBarLayoutActionsContext } from '../../../common/contextkeys.js';
import { SessionsCategories } from '../../../common/categories.js';
import { SessionLayoutMode } from '../../../common/sessionGridLayout/sessionGridLayout.js';
import { CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID, ChatWindowContext, ChatWindowHasEditorAreaContext, ChatWindowHasSessionActivityBarContext, IChatWindow, IChatWindowService, SessionLayoutModeContext, SessionSplitLayoutContext } from '../../../services/chatWindow/browser/chatWindowService.js';

/** A layout mode as offered to the user. */
export interface IChatWindowLayoutModeChoice {
	readonly mode: SessionLayoutMode;
	readonly id: string;
	readonly title: ILocalizedString;
	/** Its title in the Layout submenu. */
	readonly shortTitle: string;
	readonly icon: ThemeIcon;
}

/** The layout modes of a chat window, in the order they are offered; the ids are those chat windows always used. */
export const chatWindowLayoutModeChoices: readonly IChatWindowLayoutModeChoice[] = [{
	mode: SessionLayoutMode.ChatOnly,
	id: 'sessions.chatWindow.showChatOnly',
	...sessionLayoutModeTitles[SessionLayoutMode.ChatOnly],
	icon: Codicon.layoutSidebarLeft,
}, {
	mode: SessionLayoutMode.EditorOnly,
	id: 'sessions.chatWindow.showEditorOnly',
	...sessionLayoutModeTitles[SessionLayoutMode.EditorOnly],
	icon: Codicon.layoutSidebarRight,
}, {
	mode: SessionLayoutMode.Stacked,
	id: 'sessions.chatWindow.showEditorAboveChat',
	...sessionLayoutModeTitles[SessionLayoutMode.Stacked],
	icon: Codicon.splitVertical,
}, {
	mode: SessionLayoutMode.SideBySide,
	id: 'sessions.chatWindow.showSideBySide',
	...sessionLayoutModeTitles[SessionLayoutMode.SideBySide],
	icon: Codicon.splitHorizontal,
}];

export const TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID = 'sessions.chatWindow.toggleChat';
export const TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID = 'sessions.chatWindow.toggleArrangement';
export const TOGGLE_CHAT_WINDOW_CONVERSATION_COMMAND_ID = 'sessions.chatWindow.toggleConversation';

/** In a chat window with an editor area, while AI features are enabled: where the layout actions apply. */
const ChatWindowLayoutContext = ContextKeyExpr.and(ChatContextKeys.enabled, ContextKeyExpr.has(ChatWindowContext.key), ChatWindowHasEditorAreaContext)!;

/**
 * The groups of {@link Menus.ChatWindowLayout}: the chat and the editor area as toggles, then how both show together, as in
 * the Layout menu of the main window. The modes are commands of their own (Command Palette), not entries of the menu.
 */
const ChatWindowLayoutMenuGroup = {
	panes: '1_panes',
	arrangement: '2_arrangement',
} as const;

/**
 * The chat window an action acts on: the one it was invoked from, by the handle its toolbar or strip passes, else the one
 * whose window is active, such as for a keybinding or the Command Palette.
 */
function getChatWindow(accessor: ServicesAccessor, context: unknown): IChatWindow | undefined {
	return accessor.get(IChatWindowService).resolveWindow(context);
}

/** Shows `mode` in `window`, and announces the layout to screen readers. */
export function showChatWindowLayout(window: IChatWindow, mode: SessionLayoutMode): void {
	if (!window.layouts.includes(mode) || window.layout.get() === mode) {
		return;
	}
	window.setLayout(mode);
	const choice = chatWindowLayoutModeChoices.find(candidate => candidate.mode === mode);
	if (choice) {
		status(localize('chatWindowLayoutChanged', "Layout: {0}", choice.title.value));
	}
}

for (const choice of chatWindowLayoutModeChoices) {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: choice.id,
				title: choice.title,
				category: SessionsCategories.Sessions,
				icon: choice.icon,
				f1: true,
				precondition: ChatWindowLayoutContext,
				toggled: SessionLayoutModeContext.isEqualTo(choice.mode),
			});
		}

		override run(accessor: ServicesAccessor, context?: unknown): void {
			const window = getChatWindow(accessor, context);
			if (window) {
				showChatWindowLayout(window, choice.mode);
			}
		}
	});
}

/** Shows or hides the chat or the editor area; the last one that shows cannot be hidden, and showing the other returns to how both last showed. */
function togglePane(window: IChatWindow, pane: 'chat' | 'editor'): void {
	const mode = window.layout.get();
	const hiddenMode = pane === 'chat' ? SessionLayoutMode.EditorOnly : SessionLayoutMode.ChatOnly;
	const aloneMode = pane === 'chat' ? SessionLayoutMode.ChatOnly : SessionLayoutMode.EditorOnly;
	if (mode === hiddenMode) {
		showChatWindowLayout(window, window.splitLayout.get());
	} else if (mode !== aloneMode) {
		showChatWindowLayout(window, hiddenMode);
	}
}

registerAction2(class ToggleChatWindowChatAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID,
			title: localize2('chatWindowShowChat', "Show Chat"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(ChatWindowLayoutContext, SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.ChatOnly)),
			toggled: SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.EditorOnly),
			menu: { id: Menus.ChatWindowLayout, group: ChatWindowLayoutMenuGroup.panes, order: 1, when: ChatWindowLayoutContext },
		});
	}

	override run(accessor: ServicesAccessor, context?: unknown): void {
		const window = getChatWindow(accessor, context);
		if (window) {
			togglePane(window, 'chat');
		}
	}
});

registerAction2(class ToggleChatWindowEditorAction extends Action2 {
	constructor() {
		super({
			id: CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID,
			title: localize2('chatWindowShowEditor', "Show Editor"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(ChatWindowLayoutContext, SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.EditorOnly)),
			toggled: SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.ChatOnly),
			menu: { id: Menus.ChatWindowLayout, group: ChatWindowLayoutMenuGroup.panes, order: 2, when: ChatWindowLayoutContext },
		});
	}

	override run(accessor: ServicesAccessor, context?: unknown): void {
		const window = getChatWindow(accessor, context);
		if (window) {
			togglePane(window, 'editor');
		}
	}
});

registerAction2(class ToggleChatWindowArrangementAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID,
			title: localize2('chatWindowStacked', "Stacked"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ChatWindowLayoutContext,
			toggled: SessionSplitLayoutContext.isEqualTo(SessionLayoutMode.Stacked),
			menu: { id: Menus.ChatWindowLayout, group: ChatWindowLayoutMenuGroup.arrangement, order: 1, when: ChatWindowLayoutContext },
		});
	}

	override run(accessor: ServicesAccessor, context?: unknown): void {
		const window = getChatWindow(accessor, context);
		if (!window) {
			return;
		}
		// While only one of the chat and the editor area shows, this only sets how both show next.
		const next = window.splitLayout.get() === SessionLayoutMode.Stacked ? SessionLayoutMode.SideBySide : SessionLayoutMode.Stacked;
		const mode = window.layout.get();
		if (mode === SessionLayoutMode.Stacked || mode === SessionLayoutMode.SideBySide) {
			showChatWindowLayout(window, next);
		} else {
			window.setSplitLayout(next);
		}
	}
});

registerAction2(class ToggleChatWindowConversationAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CHAT_WINDOW_CONVERSATION_COMMAND_ID,
			title: localize2('chatWindowToggleConversation', "Toggle Chat Conversation"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(ChatWindowLayoutContext, SessionLayoutModeContext.isEqualTo(SessionLayoutMode.Stacked)),
		});
	}

	override run(accessor: ServicesAccessor, context?: unknown): void {
		getChatWindow(accessor, context)?.toggleConversation();
	}
});

// One entry point to the Layout menu of a chat window: in its title bar, or in its Session Activity Bar while the strip shows
// the layout actions, as the main window's does. The Layout menu ends the layout actions, after the buttons the user shows.
const ChatWindowStripLayoutContext = ContextKeyExpr.and(ChatWindowHasSessionActivityBarContext, SessionActivityBarLayoutActionsContext)!;
const ChatWindowTitleBarLayoutContext = ContextKeyExpr.or(ChatWindowHasSessionActivityBarContext.negate(), SessionActivityBarLayoutActionsContext.negate())!;
const CHAT_WINDOW_LAYOUT_MENU_ORDER = 100;
// The Layout menu, and the buttons of its actions that the user promoted, in every window shared with the main window's.
registerLayoutButtons({
	layoutMenu: Menus.ChatWindowLayout,
	layoutMenuTitles: chatWindowLayoutModeChoices.map(choice => ({ title: localize('chatWindowLayoutMenu', "Layout: {0}", choice.shortTitle), when: SessionLayoutModeContext.isEqualTo(choice.mode) })),
	buttonMenus: [
		{ menu: Menus.ChatWindowTitleBarLayout, group: 'navigation', order: 0, when: ChatWindowTitleBarLayoutContext },
		{ menu: Menus.SessionActivityBar, group: SessionActivityBarGroup.ChatWindowLayout, order: CHAT_WINDOW_LAYOUT_MENU_ORDER, when: ChatWindowStripLayoutContext },
	],
	when: ChatWindowLayoutContext,
	commandIds: {
		[SessionLayoutButton.Chat]: TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID,
		[SessionLayoutButton.Editor]: CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID,
		[SessionLayoutButton.Arrangement]: TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID,
	},
	state: {
		chatShown: SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.EditorOnly),
		editorShown: SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.ChatOnly),
		stacked: SessionSplitLayoutContext.isEqualTo(SessionLayoutMode.Stacked),
	},
});
