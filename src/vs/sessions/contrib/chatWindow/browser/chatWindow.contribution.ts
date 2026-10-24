/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { EditorExtensions } from '../../../../workbench/common/editor.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../browser/menus.js';
import { registerSessionLayoutModeActions, SessionLayoutMenuGroup, sessionLayoutModeChoices } from '../../../browser/sessionLayoutModeActions.js';
import { SessionsCategories } from '../../../common/categories.js';
import { SessionActivityBarLayoutActionsContext } from '../../../common/contextkeys.js';
import { CHAT_WINDOWS_ENABLED_SETTING, CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID, ChatWindowContext, ChatWindowDockableContext, ChatWindowDockedContext, ChatWindowDockedResizedContext, ChatWindowHasEditorContext, ChatWindowHasEditorAreaContext, ChatWindowTerminalPosition, ChatWindowTerminalPositionContext, ChatWindowTerminalRowContext, IChatWindowService } from '../../../services/chatWindow/browser/chatWindowService.js';
import { SessionLayoutMode, SessionLayoutModeContext, SessionSplitLayoutContext } from '../../../common/sessionLayoutMode.js';
import { ChatWindowChatEditor, ChatWindowChatInput } from './chatWindowEditor.js';
import { ChatWindowService } from './chatWindowService.js';
import './chatWindowActivityBar.js';
import './chatWindowChangesFileList.js';
import './openChatInWindow.js';

registerSingleton(IChatWindowService, ChatWindowService, InstantiationType.Delayed);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(ChatWindowChatEditor, ChatWindowChatEditor.ID, localize('chatWindowEditor', "Chat Window")),
	[new SyncDescriptor(ChatWindowChatInput)],
);

Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration).registerConfiguration({
	properties: {
		[CHAT_WINDOWS_ENABLED_SETTING]: {
			type: 'boolean',
			default: false,
			scope: ConfigurationScope.APPLICATION,
			tags: ['experimental'],
			description: localize('sessions.chatWindows.enabled', "Controls whether chats of the Agents window can be opened in windows of their own, and whether the chat windows that were open are restored at startup. Turning it off hides the actions that open chat windows; the chat windows that are open stay until closed."),
		},
	}
});

const TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID = 'sessions.chatWindow.toggleDocked';

/** Within a chat window: the kind is set, and not empty. Outside chat windows it is not set at all. */
const InChatWindowContext = ContextKeyExpr.has(ChatWindowContext.key);

/** Chat windows, like the chat, hide when AI features are disabled. */
const ChatWindowMenuContext = ChatContextKeys.enabled;

const TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID = 'sessions.chatWindow.toggleChat';
const TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID = 'sessions.chatWindow.toggleArrangement';

// The layout modes of chat windows, from the Command Palette, and the toggles of the Layout menu of a chat window with an
// editor: Show Chat, Show Editor, and Stacked. Docked, the editor shows above the chat, which keeps to its input: there is
// no side by side, so no Stacked toggle.
const CHAT_WINDOW_LAYOUT_MODE_COMMAND_IDS: Readonly<Record<SessionLayoutMode, string>> = {
	[SessionLayoutMode.ChatOnly]: 'sessions.chatWindow.showChatOnly',
	[SessionLayoutMode.EditorOnly]: 'sessions.chatWindow.showEditorOnly',
	[SessionLayoutMode.Stacked]: 'sessions.chatWindow.showEditorAboveChat',
	[SessionLayoutMode.SideBySide]: 'sessions.chatWindow.showSideBySide',
};
registerSessionLayoutModeActions({
	ids: CHAT_WINDOW_LAYOUT_MODE_COMMAND_IDS,
	toggleIds: { chat: TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID, editor: CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID, stacked: TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID },
	precondition: ContextKeyExpr.and(InChatWindowContext, ChatWindowHasEditorContext)!,
	available: mode => mode === SessionLayoutMode.SideBySide ? ChatWindowDockedContext.negate() : undefined,
	menuWhen: ContextKeyExpr.and(ChatWindowMenuContext, InChatWindowContext, ChatWindowHasEditorContext)!,
	current: accessor => {
		const window = accessor.get(IChatWindowService).getActiveWindow();
		return window && { mode: window.layout.get(), splitLayout: window.splitLayout.get() };
	},
	run: (accessor, mode) => accessor.get(IChatWindowService).getActiveWindow()?.setLayout(mode),
});

// One Layout button, in the title bar of a chat window of its own and in the header of a docked one, opens the Layout
// menu of the window: what it shows (the chat, the editor), how the two are arranged together, and where the window
// shows. Each of its actions also has a button there, hidden until the user shows it from the context menu of the buttons.
const chatWindowLayoutMenu = { submenu: Menus.SessionLayout, title: localize2('chatWindowLayout', "Layout"), icon: Codicon.layout, group: 'navigation' };
// One entry point to the Layout menu: in the title bar, or in the Session Activity Bar while it shows its layout actions.
const ChatWindowHasLayoutMenuContext = ContextKeyExpr.and(ContextKeyExpr.or(ChatWindowHasEditorContext, ChatWindowDockableContext), SessionActivityBarLayoutActionsContext.negate());
// The Layout menu ends the layout actions, after the buttons the user chose to show.
const CHAT_WINDOW_LAYOUT_MENU_ORDER = 100;
MenuRegistry.appendMenuItem(Menus.ChatWindowTitleBarLayout, { ...chatWindowLayoutMenu, order: CHAT_WINDOW_LAYOUT_MENU_ORDER, when: ContextKeyExpr.and(ChatWindowMenuContext, InChatWindowContext, ChatWindowDockedContext.negate(), ChatWindowHasLayoutMenuContext) });
MenuRegistry.appendMenuItem(Menus.ChatWindowTitleLayout, { ...chatWindowLayoutMenu, order: CHAT_WINDOW_LAYOUT_MENU_ORDER, when: ContextKeyExpr.and(ChatWindowMenuContext, ChatWindowDockedContext, ChatWindowHasLayoutMenuContext) });

/** Where the button of a layout action shows: in the title bar of a chat window of its own, or the header of a docked one. */
const chatWindowLayoutButtonMenus = [
	{ menu: Menus.ChatWindowTitleBarLayout, when: ContextKeyExpr.and(ChatWindowMenuContext, InChatWindowContext, ChatWindowDockedContext.negate())! },
	{ menu: Menus.ChatWindowTitleLayout, when: ContextKeyExpr.and(ChatWindowMenuContext, ChatWindowDockedContext)! },
] as const;

/** A pane of a chat window that can be shown or hidden: the chat, or the editor. One of them always shows. */
interface IChatWindowPaneToggle {
	readonly id: string;
	readonly title: ILocalizedString;
	/** Its button, which swaps its icon rather than showing a check, as the main window's side bar toggle does. */
	readonly button: { readonly title: ILocalizedString; readonly hideTooltip: string; readonly icon: ThemeIcon; readonly shownIcon: ThemeIcon };
	/** The layout that shows only this pane: it cannot be hidden there, as the other pane is hidden. */
	readonly aloneLayout: SessionLayoutMode;
	/** The layout that hides this pane. */
	readonly hiddenLayout: SessionLayoutMode;
	readonly order: number;
}

const chatWindowPaneToggles: readonly IChatWindowPaneToggle[] = [{
	id: TOGGLE_CHAT_WINDOW_CHAT_COMMAND_ID,
	title: localize2('chatWindowShowChat', "Show Chat"),
	button: { title: localize2('chatWindowToggleChat', "Toggle Chat"), hideTooltip: localize('chatWindowHideChat', "Hide Chat"), icon: Codicon.layoutSidebarLeftOff, shownIcon: Codicon.layoutSidebarLeft },
	aloneLayout: SessionLayoutMode.ChatOnly,
	hiddenLayout: SessionLayoutMode.EditorOnly,
	order: 1,
}, {
	id: CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID,
	title: localize2('chatWindowShowEditor', "Show Editor"),
	button: { title: localize2('chatWindowToggleEditor', "Toggle Editor"), hideTooltip: localize('chatWindowHideEditor', "Hide Editor"), icon: Codicon.layoutSidebarRightOff, shownIcon: Codicon.layoutSidebarRight },
	aloneLayout: SessionLayoutMode.EditorOnly,
	hiddenLayout: SessionLayoutMode.ChatOnly,
	order: 2,
}];

for (const toggle of chatWindowPaneToggles) {
	const shown = SessionLayoutModeContext.notEqualsTo(toggle.hiddenLayout);
	// Shown alone, it cannot be hidden: show the other pane instead.
	const precondition = ContextKeyExpr.and(InChatWindowContext, ChatWindowHasEditorContext, SessionLayoutModeContext.notEqualsTo(toggle.aloneLayout));
	for (const { menu, when } of chatWindowLayoutButtonMenus) {
		MenuRegistry.appendMenuItem(menu, {
			command: {
				id: toggle.id,
				title: toggle.button.title,
				tooltip: toggle.title.value,
				icon: toggle.button.icon,
				toggled: { condition: shown, icon: toggle.button.shownIcon, tooltip: toggle.button.hideTooltip },
				precondition,
			},
			group: 'navigation',
			order: toggle.order,
			when: ContextKeyExpr.and(when, ChatWindowHasEditorContext),
			isHiddenByDefault: true,
		});
	}
}

// How the chat and the editor show together, in a chat window of its own: docked, the editor always shows above the
// chat. The Stacked toggle of the Layout menu switches between the two arrangements; its button, which the user can
// show, is named after the arrangement it switches to and swaps its icon likewise.
const ChatWindowBothShownContext = ContextKeyExpr.or(SessionLayoutModeContext.isEqualTo(SessionLayoutMode.Stacked), SessionLayoutModeContext.isEqualTo(SessionLayoutMode.SideBySide));
const ChatWindowArrangementContext = ContextKeyExpr.and(ChatWindowMenuContext, InChatWindowContext, ChatWindowHasEditorContext, ChatWindowDockedContext.negate());
const chatWindowArrangementButtonOrder = chatWindowPaneToggles.length + 1;
for (const target of [SessionLayoutMode.SideBySide, SessionLayoutMode.Stacked] as const) {
	const choice = sessionLayoutModeChoices.find(candidate => candidate.mode === target)!;
	const title = target === SessionLayoutMode.SideBySide ? localize2('chatWindowShowSideBySideShort', "Show Side by Side") : localize2('chatWindowShowStackedShort', "Show Stacked");
	const command = { id: TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID, title, icon: choice.icon, precondition: ChatWindowBothShownContext };
	const when = ContextKeyExpr.and(ChatWindowArrangementContext, SessionSplitLayoutContext.notEqualsTo(target));
	MenuRegistry.appendMenuItem(Menus.ChatWindowTitleBarLayout, { command, group: 'navigation', order: chatWindowArrangementButtonOrder, when, isHiddenByDefault: true });
}

// Where the terminal row shows, chosen like a radio group: below the chat and the editor area, below the editor area
// only, or below the chat only. Stacked, the chat is the bottom of the window, so below the chat is across the bottom.
// Chosen from the Terminal Position menu in the More Actions menu of the row, as the panel's position is from the panel.
const chatWindowTerminalPositionChoices: readonly { readonly position: ChatWindowTerminalPosition; readonly id: string; readonly title: ILocalizedString; readonly shortTitle: string }[] = [{
	position: ChatWindowTerminalPosition.FullWidth,
	id: 'sessions.chatWindow.terminalPosition.fullWidth',
	title: localize2('chatWindowTerminalFullWidth', "Terminal Across Full Width"),
	shortTitle: localize('chatWindowTerminalFullWidthShort', "Across Full Width"),
}, {
	position: ChatWindowTerminalPosition.UnderEditor,
	id: 'sessions.chatWindow.terminalPosition.underEditor',
	title: localize2('chatWindowTerminalUnderEditor', "Terminal Under Editor"),
	shortTitle: localize('chatWindowTerminalUnderEditorShort', "Under Editor"),
}, {
	position: ChatWindowTerminalPosition.UnderChat,
	id: 'sessions.chatWindow.terminalPosition.underChat',
	title: localize2('chatWindowTerminalUnderChat', "Terminal Under Chat"),
	shortTitle: localize('chatWindowTerminalUnderChatShort', "Under Chat"),
}];
const ChatWindowTerminalRowMenuContext = ContextKeyExpr.and(ChatWindowMenuContext, ChatWindowTerminalRowContext, ChatWindowHasEditorAreaContext);
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	submenu: Menus.ChatWindowTerminalPosition,
	title: localize('chatWindowTerminalPosition', "Terminal Position"),
	group: '9_chatWindowTerminalPosition',
	when: ChatWindowTerminalRowMenuContext,
});
chatWindowTerminalPositionChoices.forEach((choice, index) => {
	const toggled = ChatWindowTerminalPositionContext.isEqualTo(choice.position);
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: choice.id,
				title: choice.title,
				category: SessionsCategories.Sessions,
				f1: true,
				precondition: ContextKeyExpr.and(InChatWindowContext, ChatWindowHasEditorAreaContext),
				toggled,
			});
		}

		override run(accessor: ServicesAccessor, context?: { groupId?: number }): void {
			// From the menu of a row, its own window, which is not necessarily the active chat window.
			const chatWindowService = accessor.get(IChatWindowService);
			const window = context?.groupId === undefined
				? chatWindowService.getActiveWindow()
				: chatWindowService.windows.get().find(candidate => candidate.terminalGroup.get()?.id === context.groupId);
			window?.setTerminalPosition(choice.position);
		}
	});
	MenuRegistry.appendMenuItem(Menus.ChatWindowTerminalPosition, {
		command: { id: choice.id, title: choice.shortTitle, toggled },
		group: 'navigation',
		order: index,
		when: ChatWindowTerminalRowMenuContext,
	});
});

registerAction2(class ToggleChatWindowDockedAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID,
			title: localize2('toggleDockChatWindow', "Toggle Dock to Main Window"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(InChatWindowContext, ChatWindowDockableContext),
		});
	}

	override async run(accessor: ServicesAccessor): Promise<void> {
		const chatWindowService = accessor.get(IChatWindowService);
		const window = chatWindowService.getActiveWindow();
		if (window) {
			await chatWindowService.setDocked(window, !window.docked);
		}
	}
});

// What the item does, rather than a checked toggle: Dock to Main Window in a window of its own, and Move to New Window docked.
MenuRegistry.appendMenuItem(Menus.SessionLayout, {
	command: { id: TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID, title: localize2('dockChatWindow', "Dock to Main Window") },
	group: SessionLayoutMenuGroup.window,
	when: ContextKeyExpr.and(ChatWindowMenuContext, ChatWindowDockableContext, ChatWindowDockedContext.negate()),
});
MenuRegistry.appendMenuItem(Menus.SessionLayout, {
	command: { id: TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID, title: localize2('undockChatWindow', "Move to New Window") },
	group: SessionLayoutMenuGroup.window,
	when: ContextKeyExpr.and(ChatWindowMenuContext, ChatWindowDockedContext),
});
const chatWindowDockButtonOrder = chatWindowArrangementButtonOrder + 1;
MenuRegistry.appendMenuItem(Menus.ChatWindowTitleBarLayout, {
	command: { id: TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID, title: localize2('dockChatWindow', "Dock to Main Window"), icon: Codicon.layoutSidebarRightDock },
	group: 'navigation',
	order: chatWindowDockButtonOrder,
	when: ContextKeyExpr.and(ChatWindowMenuContext, InChatWindowContext, ChatWindowDockableContext, ChatWindowDockedContext.negate()),
	isHiddenByDefault: true,
});
MenuRegistry.appendMenuItem(Menus.ChatWindowTitleLayout, {
	command: { id: TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID, title: localize2('undockChatWindow', "Move to New Window"), icon: Codicon.openInWindow },
	group: 'navigation',
	order: chatWindowDockButtonOrder,
	when: ContextKeyExpr.and(ChatWindowMenuContext, ChatWindowDockedContext),
	isHiddenByDefault: true,
});

// Docked: back to the size it opens with by default, after the user resized it.
registerAction2(class ResetChatWindowDockedSizeAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatWindow.resetDockedSize',
			title: localize2('chatWindowResetDockedSize', "Reset Size"),
			category: SessionsCategories.Sessions,
			icon: Codicon.screenNormal,
			f1: true,
			precondition: ContextKeyExpr.and(InChatWindowContext, ChatWindowDockedContext, ChatWindowDockedResizedContext),
			menu: [{
				id: Menus.SessionLayout,
				group: SessionLayoutMenuGroup.window,
				order: 1,
				when: ContextKeyExpr.and(ChatWindowMenuContext, ChatWindowDockedContext),
			}, {
				id: Menus.ChatWindowTitleLayout,
				group: 'navigation',
				order: chatWindowDockButtonOrder + 1,
				when: ContextKeyExpr.and(ChatWindowMenuContext, ChatWindowDockedContext),
				isHiddenByDefault: true,
			}],
		});
	}

	override run(accessor: ServicesAccessor): void {
		const window = accessor.get(IChatWindowService).getActiveWindow();
		if (window?.docked) {
			window.resetSize();
		}
	}
});

// The keyboard's way to do what dragging the chat all the way down below the editor, or back up, does.
registerAction2(class ToggleChatWindowConversationAction extends Action2 {
	constructor() {
		super({
			id: 'sessions.chatWindow.toggleConversation',
			title: localize2('chatWindowToggleConversation', "Toggle Chat Conversation Below Editor"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(InChatWindowContext, ChatWindowDockedContext.negate(), SessionLayoutModeContext.isEqualTo(SessionLayoutMode.Stacked)),
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(IChatWindowService).getActiveWindow()?.toggleConversation();
	}
});
