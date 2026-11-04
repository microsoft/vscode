/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { status } from '../../../../base/browser/ui/aria/aria.js';
import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Categories } from '../../../../platform/action/common/actionCommonCategories.js';
import { Action2, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { IsSessionsWindowContext, LayoutModeContext, SplitLayoutContext } from '../../../common/contextkeys.js';
import { isEditorCommandsContext } from '../../../common/editor.js';
import { isWindowCommandContext } from '../../../common/windowCommandContext.js';
import { ChatContextKeys } from '../../chat/common/actions/chatContextKeys.js';
import { ChatWindowLayoutMode } from '../common/chatWindowLayout.js';
import { IChatWindow, IChatWindowService } from './chatWindow.js';

/** The category of chat window commands. */
export const ChatWindowCategory = localize2('chatWindowCategory', "Agents");

/** A layout mode as offered to the user. */
export interface IChatWindowLayoutModeChoice {
	readonly mode: ChatWindowLayoutMode;
	readonly id: string;
	readonly title: ILocalizedString;
	/** Its title in the Layout submenu. */
	readonly shortTitle: string;
	readonly icon: ThemeIcon;
}

/** The layout modes of a chat window, in the order they are offered. */
export const chatWindowLayoutModeChoices: readonly IChatWindowLayoutModeChoice[] = [{
	mode: ChatWindowLayoutMode.ChatOnly,
	id: 'workbench.action.chatWindow.showChatOnly',
	title: localize2('chatWindowLayoutChatOnly', "Show Chat Only"),
	shortTitle: localize('chatWindowLayoutChatOnly.short', "Chat Only"),
	icon: Codicon.layoutSidebarLeft,
}, {
	mode: ChatWindowLayoutMode.EditorOnly,
	id: 'workbench.action.chatWindow.showEditorOnly',
	title: localize2('chatWindowLayoutEditorOnly', "Show Editor Only"),
	shortTitle: localize('chatWindowLayoutEditorOnly.short', "Editor Only"),
	icon: Codicon.layoutSidebarRight,
}, {
	mode: ChatWindowLayoutMode.Stacked,
	id: 'workbench.action.chatWindow.showEditorAboveChat',
	title: localize2('chatWindowLayoutStacked', "Show Chat and Editor Stacked"),
	shortTitle: localize('chatWindowLayoutStacked.short', "Stacked"),
	icon: Codicon.splitVertical,
}, {
	mode: ChatWindowLayoutMode.SideBySide,
	id: 'workbench.action.chatWindow.showSideBySide',
	title: localize2('chatWindowLayoutSideBySide', "Show Chat and Editor Side by Side"),
	shortTitle: localize('chatWindowLayoutSideBySide.short', "Side by Side"),
	icon: Codicon.splitHorizontal,
}];

export const TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID = 'workbench.action.chatWindow.toggleChat';
export const TOGGLE_CHAT_WINDOW_EDITOR_COMMAND_ID = 'workbench.action.chatWindow.toggleEditor';
export const TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID = 'workbench.action.chatWindow.toggleArrangement';
export const TOGGLE_CHAT_WINDOW_CONVERSATION_COMMAND_ID = 'workbench.action.chatWindow.toggleConversation';

/**
 * The chat window a command acts on: the window of the editor group its arguments name, such as when it runs from the
 * title of a group of the window, or the window they name, such as when it runs from the Session Activity Bar of the
 * window, else the chat window that has focus.
 */
export function resolveChatWindow(accessor: ServicesAccessor, args: readonly unknown[]): IChatWindow | undefined {
	const chatWindowService = accessor.get(IChatWindowService);
	const context = args.find(isEditorCommandsContext);
	if (context) {
		const window = chatWindowService.windows.get().find(candidate => [candidate.mainPart, candidate.chatPart, candidate.terminalsPart.get()].some(part => part?.groups.some(group => group.id === context.groupId)));
		if (window) {
			return window;
		}
	}
	const windowContext = args.find(isWindowCommandContext);
	if (windowContext) {
		const window = chatWindowService.getWindow(windowContext.windowId);
		if (window) {
			return window;
		}
	}
	return chatWindowService.activeWindow;
}

/** In a window with layout modes, in the Agents window, while AI features are enabled: where the layout commands apply. */
export const ChatWindowLayoutCommandsContext = ContextKeyExpr.and(IsSessionsWindowContext, ChatContextKeys.enabled, LayoutModeContext)!;

/** Whether the chat shows: also true in windows without layout modes, as there is nothing to hide. */
export const ChatShownContext = LayoutModeContext.notEqualsTo(ChatWindowLayoutMode.EditorOnly);
/** Whether the editor parts show. */
export const EditorShownContext = LayoutModeContext.notEqualsTo(ChatWindowLayoutMode.ChatOnly);
/** Whether the chat and the editor parts are, or will next be, stacked. */
export const StackedContext = SplitLayoutContext.isEqualTo(ChatWindowLayoutMode.Stacked);

/** Shows `mode` in `window`, and announces the layout to screen readers. */
export function showChatWindowLayout(window: IChatWindow, mode: ChatWindowLayoutMode): void {
	if (window.layoutMode.get() === mode) {
		return;
	}
	window.setLayoutMode(mode);
	announceChatWindowLayout(mode);
}

/** Announces the layout a chat window shows now. */
function announceChatWindowLayout(mode: ChatWindowLayoutMode): void {
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
				category: ChatWindowCategory,
				icon: choice.icon,
				f1: true,
				precondition: ChatWindowLayoutCommandsContext,
				toggled: LayoutModeContext.isEqualTo(choice.mode),
			});
		}

		override run(accessor: ServicesAccessor, ...args: unknown[]): void {
			const window = resolveChatWindow(accessor, args);
			if (window) {
				showChatWindowLayout(window, choice.mode);
			}
		}
	});
}

/** Shows or hides the chat or the editor parts; the last one that shows cannot be hidden, and showing the other returns to how both last showed. */
function togglePane(window: IChatWindow, pane: 'chat' | 'editor'): void {
	const mode = window.layoutMode.get();
	const hiddenMode = pane === 'chat' ? ChatWindowLayoutMode.EditorOnly : ChatWindowLayoutMode.ChatOnly;
	const aloneMode = pane === 'chat' ? ChatWindowLayoutMode.ChatOnly : ChatWindowLayoutMode.EditorOnly;
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
			category: ChatWindowCategory,
			f1: true,
			precondition: ContextKeyExpr.and(ChatWindowLayoutCommandsContext, LayoutModeContext.notEqualsTo(ChatWindowLayoutMode.ChatOnly)),
			toggled: ChatShownContext,
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const window = resolveChatWindow(accessor, args);
		if (window) {
			togglePane(window, 'chat');
		}
	}
});

registerAction2(class ToggleChatWindowEditorAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CHAT_WINDOW_EDITOR_COMMAND_ID,
			title: localize2('chatWindowShowEditor', "Show Editor"),
			category: ChatWindowCategory,
			f1: true,
			precondition: ContextKeyExpr.and(ChatWindowLayoutCommandsContext, LayoutModeContext.notEqualsTo(ChatWindowLayoutMode.EditorOnly)),
			toggled: EditorShownContext,
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const window = resolveChatWindow(accessor, args);
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
			category: ChatWindowCategory,
			f1: true,
			precondition: ChatWindowLayoutCommandsContext,
			toggled: StackedContext,
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		const window = resolveChatWindow(accessor, args);
		if (!window) {
			return;
		}
		// While only one of the chat and the editor parts shows, this only sets how both show next.
		const next = window.splitLayout.get() === ChatWindowLayoutMode.Stacked ? ChatWindowLayoutMode.SideBySide : ChatWindowLayoutMode.Stacked;
		const mode = window.layoutMode.get();
		if (mode === ChatWindowLayoutMode.Stacked || mode === ChatWindowLayoutMode.SideBySide) {
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
			category: ChatWindowCategory,
			f1: true,
			precondition: ContextKeyExpr.and(ChatWindowLayoutCommandsContext, LayoutModeContext.isEqualTo(ChatWindowLayoutMode.Stacked)),
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		resolveChatWindow(accessor, args)?.toggleConversation();
	}
});

/**
 * What the side panel's command does in a chat window, whichever key the user gives it: as it toggles the side panel of
 * the main window, it hides the main part of the window, leaving the chat, so that the window is never empty, and shows it
 * again as it showed with the chat.
 */
export function toggleChatWindowEditorAsSidePanel(window: IChatWindow): void {
	if (window.layoutMode.get() === ChatWindowLayoutMode.ChatOnly) {
		window.showEditor();
		announceChatWindowLayout(window.layoutMode.get());
	} else {
		showChatWindowLayout(window, ChatWindowLayoutMode.ChatOnly);
	}
}

export const RESET_CHAT_WINDOW_LAYOUT_COMMAND_ID = 'workbench.action.chatWindow.resetLayout';

// Lays out the chat window it runs in as it first opens: neither other chat windows nor the main window change.
registerAction2(class ResetChatWindowLayoutAction extends Action2 {
	constructor() {
		super({
			id: RESET_CHAT_WINDOW_LAYOUT_COMMAND_ID,
			title: localize2('chatWindowResetLayout', "Reset Chat Window Layout"),
			category: Categories.Developer,
			f1: true,
			precondition: ChatWindowLayoutCommandsContext,
		});
	}

	override run(accessor: ServicesAccessor, ...args: unknown[]): void {
		resolveChatWindow(accessor, args)?.resetLayout();
	}
});
