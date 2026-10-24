/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr, ContextKeyExpression } from '../../../../platform/contextkey/common/contextkey.js';
import { ConfigurationScope, Extensions as ConfigurationExtensions, IConfigurationRegistry } from '../../../../platform/configuration/common/configurationRegistry.js';
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { EditorExtensions } from '../../../../workbench/common/editor.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { CHAT_WINDOWS_ENABLED_SETTING, CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID, ChatWindowContext, ChatWindowDockableContext, ChatWindowDockedContext, ChatWindowDockedResizedContext, ChatWindowHasEditorContext, ChatWindowLayout, ChatWindowLayoutContext, ChatWindowHasEditorAreaContext, ChatWindowSplitLayoutContext, ChatWindowTerminalPosition, ChatWindowTerminalPositionContext, IChatWindowService } from '../../../services/chatWindow/browser/chatWindowService.js';
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

/** A layout of chat windows, as chosen from the Command Palette or their Layout menu. */
interface IChatWindowLayoutChoice {
	readonly layout: ChatWindowLayout;
	readonly id: string;
	readonly title: ILocalizedString;
	readonly icon: ThemeIcon;
	/** When the layout can be chosen, in chat windows that show an editor. */
	readonly when?: ContextKeyExpression;
}

// Icons of the chat window's two panes, as a window of two halves: the chat on the left of the editor, side by side.
const chatWindowLayoutChoices: readonly IChatWindowLayoutChoice[] = [{
	layout: ChatWindowLayout.EditorAboveChat,
	id: 'sessions.chatWindow.showEditorAboveChat',
	title: localize2('chatWindowShowStacked', "Show Chat and Editor Stacked"),
	icon: Codicon.splitVertical,
}, {
	layout: ChatWindowLayout.SideBySide,
	id: 'sessions.chatWindow.showSideBySide',
	title: localize2('chatWindowShowSideBySide', "Show Chat and Editor Side by Side"),
	icon: Codicon.splitHorizontal,
	// Docked, the editor shows above the chat, which keeps to its input.
	when: ChatWindowDockedContext.negate(),
}, {
	layout: ChatWindowLayout.EditorOnly,
	id: 'sessions.chatWindow.showEditorOnly',
	title: localize2('chatWindowShowEditorOnly', "Show Editor Only"),
	icon: Codicon.layoutSidebarRight,
}, {
	layout: ChatWindowLayout.ChatOnly,
	id: 'sessions.chatWindow.showChatOnly',
	title: localize2('chatWindowShowChatOnly', "Show Chat Only"),
	icon: Codicon.layoutSidebarLeft,
}];

for (const choice of chatWindowLayoutChoices) {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: choice.id,
				title: choice.title,
				category: SessionsCategories.Sessions,
				icon: choice.icon,
				f1: true,
				precondition: ContextKeyExpr.and(InChatWindowContext, ChatWindowHasEditorContext, choice.when),
			});
		}

		override run(accessor: ServicesAccessor): void {
			accessor.get(IChatWindowService).getActiveWindow()?.setLayout(choice.layout);
		}
	});
}

// One Layout button, in the title bar of a chat window of its own and in the header of a docked one, opens a menu of
// what the chat window shows (the chat, the editor), how the two are arranged together, and where the window shows.
// Each of its actions also has a button there, hidden until the user shows it from the context menu of the buttons.
const ChatWindowLayoutMenuGroup = {
	panes: '1_panes',
	arrangement: '2_arrangement',
	terminal: '2_terminal',
	window: '3_window',
} as const;

const chatWindowLayoutMenu = { submenu: Menus.ChatWindowLayout, title: localize2('chatWindowLayout', "Layout"), icon: Codicon.layout, group: 'navigation' };
const ChatWindowHasLayoutMenuContext = ContextKeyExpr.or(ChatWindowHasEditorContext, ChatWindowDockableContext);
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
	readonly aloneLayout: ChatWindowLayout;
	/** The layout that hides this pane. */
	readonly hiddenLayout: ChatWindowLayout;
	readonly order: number;
}

const chatWindowPaneToggles: readonly IChatWindowPaneToggle[] = [{
	id: 'sessions.chatWindow.toggleChat',
	title: localize2('chatWindowShowChat', "Show Chat"),
	button: { title: localize2('chatWindowToggleChat', "Toggle Chat"), hideTooltip: localize('chatWindowHideChat', "Hide Chat"), icon: Codicon.layoutSidebarLeftOff, shownIcon: Codicon.layoutSidebarLeft },
	aloneLayout: ChatWindowLayout.ChatOnly,
	hiddenLayout: ChatWindowLayout.EditorOnly,
	order: 1,
}, {
	id: CHAT_WINDOW_TOGGLE_EDITOR_COMMAND_ID,
	title: localize2('chatWindowShowEditor', "Show Editor"),
	button: { title: localize2('chatWindowToggleEditor', "Toggle Editor"), hideTooltip: localize('chatWindowHideEditor', "Hide Editor"), icon: Codicon.layoutSidebarRightOff, shownIcon: Codicon.layoutSidebarRight },
	aloneLayout: ChatWindowLayout.EditorOnly,
	hiddenLayout: ChatWindowLayout.ChatOnly,
	order: 2,
}];

for (const toggle of chatWindowPaneToggles) {
	const shown = ChatWindowLayoutContext.notEqualsTo(toggle.hiddenLayout);
	// Shown alone, it cannot be hidden: show the other pane instead.
	const precondition = ContextKeyExpr.and(InChatWindowContext, ChatWindowHasEditorContext, ChatWindowLayoutContext.notEqualsTo(toggle.aloneLayout));
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: toggle.id,
				title: toggle.title,
				category: SessionsCategories.Sessions,
				f1: true,
				toggled: shown,
				precondition,
				menu: [{
					id: Menus.ChatWindowLayout,
					group: ChatWindowLayoutMenuGroup.panes,
					order: toggle.order,
					when: ContextKeyExpr.and(ChatWindowMenuContext, ChatWindowHasEditorContext),
				}],
			});
		}

		override run(accessor: ServicesAccessor): void {
			const window = accessor.get(IChatWindowService).getActiveWindow();
			if (!window) {
				return;
			}
			// Shown again, both show as they last showed together.
			window.setLayout(window.layout.get() === toggle.hiddenLayout ? window.splitLayout.get() : toggle.hiddenLayout);
		}
	});
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
// chat. One action switches between the two arrangements, named after the one it switches to, and is disabled while
// one of them is hidden. Its button, which the user can show, swaps its icon likewise.
const TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID = 'sessions.chatWindow.toggleArrangement';
const ChatWindowBothShownContext = ContextKeyExpr.or(ChatWindowLayoutContext.isEqualTo(ChatWindowLayout.EditorAboveChat), ChatWindowLayoutContext.isEqualTo(ChatWindowLayout.SideBySide));
const ChatWindowArrangementContext = ContextKeyExpr.and(ChatWindowMenuContext, InChatWindowContext, ChatWindowHasEditorContext, ChatWindowDockedContext.negate());
registerAction2(class ToggleChatWindowArrangementAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID,
			title: localize2('chatWindowToggleArrangement', "Toggle Stacked or Side by Side"),
			category: SessionsCategories.Sessions,
			f1: true,
			precondition: ContextKeyExpr.and(ChatWindowArrangementContext, ChatWindowBothShownContext),
		});
	}

	override run(accessor: ServicesAccessor): void {
		const window = accessor.get(IChatWindowService).getActiveWindow();
		window?.setLayout(window.splitLayout.get() === ChatWindowLayout.SideBySide ? ChatWindowLayout.EditorAboveChat : ChatWindowLayout.SideBySide);
	}
});

const chatWindowArrangementButtonOrder = chatWindowPaneToggles.length + 1;
for (const target of [ChatWindowLayout.SideBySide, ChatWindowLayout.EditorAboveChat] as const) {
	const choice = chatWindowLayoutChoices.find(candidate => candidate.layout === target)!;
	const title = target === ChatWindowLayout.SideBySide ? localize2('chatWindowShowSideBySideShort', "Show Side by Side") : localize2('chatWindowShowStackedShort', "Show Stacked");
	const command = { id: TOGGLE_CHAT_WINDOW_ARRANGEMENT_COMMAND_ID, title, icon: choice.icon, precondition: ChatWindowBothShownContext };
	const when = ContextKeyExpr.and(ChatWindowArrangementContext, ChatWindowSplitLayoutContext.notEqualsTo(target));
	MenuRegistry.appendMenuItem(Menus.ChatWindowLayout, { command, group: ChatWindowLayoutMenuGroup.arrangement, when });
	MenuRegistry.appendMenuItem(Menus.ChatWindowTitleBarLayout, { command, group: 'navigation', order: chatWindowArrangementButtonOrder, when, isHiddenByDefault: true });
}

// Where the terminal row shows, chosen like a radio group: below the chat and the editor area, below the editor area
// only, or below the chat only. Stacked, the chat is the bottom of the window, so below the chat is across the bottom.
const chatWindowTerminalPositionChoices: readonly { readonly position: ChatWindowTerminalPosition; readonly id: string; readonly title: ILocalizedString }[] = [{
	position: ChatWindowTerminalPosition.FullWidth,
	id: 'sessions.chatWindow.terminalPosition.fullWidth',
	title: localize2('chatWindowTerminalFullWidth', "Terminal Across Full Width"),
}, {
	position: ChatWindowTerminalPosition.UnderEditor,
	id: 'sessions.chatWindow.terminalPosition.underEditor',
	title: localize2('chatWindowTerminalUnderEditor', "Terminal Under Editor"),
}, {
	position: ChatWindowTerminalPosition.UnderChat,
	id: 'sessions.chatWindow.terminalPosition.underChat',
	title: localize2('chatWindowTerminalUnderChat', "Terminal Under Chat"),
}];
chatWindowTerminalPositionChoices.forEach((choice, index) => {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: choice.id,
				title: choice.title,
				category: SessionsCategories.Sessions,
				f1: true,
				precondition: ContextKeyExpr.and(InChatWindowContext, ChatWindowHasEditorAreaContext),
				toggled: ChatWindowTerminalPositionContext.isEqualTo(choice.position),
				menu: {
					id: Menus.ChatWindowLayout,
					group: ChatWindowLayoutMenuGroup.terminal,
					order: index,
					when: ContextKeyExpr.and(ChatWindowMenuContext, InChatWindowContext, ChatWindowHasEditorAreaContext),
				},
			});
		}

		override run(accessor: ServicesAccessor): void {
			accessor.get(IChatWindowService).getActiveWindow()?.setTerminalPosition(choice.position);
		}
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
MenuRegistry.appendMenuItem(Menus.ChatWindowLayout, {
	command: { id: TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID, title: localize2('dockChatWindow', "Dock to Main Window") },
	group: ChatWindowLayoutMenuGroup.window,
	when: ContextKeyExpr.and(ChatWindowMenuContext, ChatWindowDockableContext, ChatWindowDockedContext.negate()),
});
MenuRegistry.appendMenuItem(Menus.ChatWindowLayout, {
	command: { id: TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID, title: localize2('undockChatWindow', "Move to New Window") },
	group: ChatWindowLayoutMenuGroup.window,
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
				id: Menus.ChatWindowLayout,
				group: ChatWindowLayoutMenuGroup.window,
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
			precondition: ContextKeyExpr.and(InChatWindowContext, ChatWindowDockedContext.negate(), ChatWindowLayoutContext.isEqualTo(ChatWindowLayout.EditorAboveChat)),
		});
	}

	override run(accessor: ServicesAccessor): void {
		accessor.get(IChatWindowService).getActiveWindow()?.toggleConversation();
	}
});
