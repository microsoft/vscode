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
import { SyncDescriptor } from '../../../../platform/instantiation/common/descriptors.js';
import { InstantiationType, registerSingleton } from '../../../../platform/instantiation/common/extensions.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { Registry } from '../../../../platform/registry/common/platform.js';
import { EditorPaneDescriptor, IEditorPaneRegistry } from '../../../../workbench/browser/editor.js';
import { EditorExtensions } from '../../../../workbench/common/editor.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { ChatWindowContext, ChatWindowDockableContext, ChatWindowDockedContext, ChatWindowHasEditorContext, ChatWindowLayout, ChatWindowLayoutContext, ChatWindowMenuOrder, ChatWindowSplitLayoutContext, IChatWindowService } from '../../../services/chatWindow/browser/chatWindowService.js';
import { ChatWindowChatEditor, ChatWindowChatInput } from './chatWindowEditor.js';
import { ChatWindowService } from './chatWindowService.js';
import './openChatInWindow.js';

registerSingleton(IChatWindowService, ChatWindowService, InstantiationType.Delayed);

Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(ChatWindowChatEditor, ChatWindowChatEditor.ID, localize('chatWindowEditor', "Chat Window")),
	[new SyncDescriptor(ChatWindowChatInput)],
);

const TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID = 'sessions.chatWindow.toggleDocked';

/** Within a chat window: the kind is set, and not empty. Outside chat windows it is not set at all. */
const InChatWindowContext = ContextKeyExpr.has(ChatWindowContext.key);

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
	title: localize2('chatWindowShowEditorAboveChat', "Show Editor Above Chat"),
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
	window: '3_window',
} as const;

const chatWindowLayoutMenu = { submenu: Menus.ChatWindowLayout, title: localize2('chatWindowLayout', "Layout"), icon: Codicon.layout, group: 'navigation' };
const ChatWindowHasLayoutMenuContext = ContextKeyExpr.or(ChatWindowHasEditorContext, ChatWindowDockableContext);
MenuRegistry.appendMenuItem(Menus.ChatWindowTitleBar, { ...chatWindowLayoutMenu, order: ChatWindowMenuOrder.layout, when: ContextKeyExpr.and(InChatWindowContext, ChatWindowDockedContext.negate(), ChatWindowHasLayoutMenuContext) });
MenuRegistry.appendMenuItem(Menus.ChatWindowTitle, { ...chatWindowLayoutMenu, order: ChatWindowMenuOrder.layout, when: ContextKeyExpr.and(ChatWindowDockedContext, ChatWindowHasLayoutMenuContext) });

/** Where the button of a layout action shows: in the title bar of a chat window of its own, or the header of a docked one. */
const chatWindowLayoutButtonMenus = [
	{ menu: Menus.ChatWindowTitleBar, when: ContextKeyExpr.and(InChatWindowContext, ChatWindowDockedContext.negate())! },
	{ menu: Menus.ChatWindowTitle, when: ChatWindowDockedContext },
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
	id: 'sessions.chatWindow.toggleEditor',
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
					when: ChatWindowHasEditorContext,
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
			order: ChatWindowMenuOrder.layoutActions + toggle.order,
			when: ContextKeyExpr.and(when, ChatWindowHasEditorContext),
			isHiddenByDefault: true,
		});
	}
}

// How the chat and the editor show together, in a chat window of its own: docked, the editor always shows above the
// chat. Checked as they last showed together, and disabled while one of them is hidden.
const ChatWindowBothShownContext = ContextKeyExpr.or(ChatWindowLayoutContext.isEqualTo(ChatWindowLayout.EditorAboveChat), ChatWindowLayoutContext.isEqualTo(ChatWindowLayout.SideBySide));
const chatWindowArrangements = [
	{ layout: ChatWindowLayout.EditorAboveChat, title: localize2('chatWindowEditorAboveChat', "Editor Above Chat") },
	{ layout: ChatWindowLayout.SideBySide, title: localize2('chatWindowSideBySide', "Chat and Editor Side by Side") },
] as const;
const chatWindowArrangementButtonsOrder = ChatWindowMenuOrder.layoutActions + chatWindowPaneToggles.length + 1;
for (const [index, arrangement] of chatWindowArrangements.entries()) {
	const choice = chatWindowLayoutChoices.find(candidate => candidate.layout === arrangement.layout)!;
	MenuRegistry.appendMenuItem(Menus.ChatWindowLayout, {
		command: { id: choice.id, title: arrangement.title, toggled: ChatWindowSplitLayoutContext.isEqualTo(arrangement.layout), precondition: ChatWindowBothShownContext },
		group: ChatWindowLayoutMenuGroup.arrangement,
		order: index,
		when: ContextKeyExpr.and(ChatWindowHasEditorContext, ChatWindowDockedContext.negate()),
	});
	// Its button is disabled while the chat and the editor show as it arranges them.
	MenuRegistry.appendMenuItem(Menus.ChatWindowTitleBar, {
		command: { id: choice.id, title: arrangement.title, icon: choice.icon, precondition: ContextKeyExpr.and(ChatWindowBothShownContext, ChatWindowLayoutContext.notEqualsTo(arrangement.layout)) },
		group: 'navigation',
		order: chatWindowArrangementButtonsOrder + index,
		when: ContextKeyExpr.and(InChatWindowContext, ChatWindowHasEditorContext, ChatWindowDockedContext.negate()),
		isHiddenByDefault: true,
	});
}

registerAction2(class ToggleChatWindowDockedAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID,
			title: localize2('toggleDockChatWindow', "Toggle Dock in Main Window"),
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

// What the item does, rather than a checked toggle: Dock in a separate window, and Move to a Separate Window docked.
MenuRegistry.appendMenuItem(Menus.ChatWindowLayout, {
	command: { id: TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID, title: localize2('dockChatWindow', "Dock in Main Window") },
	group: ChatWindowLayoutMenuGroup.window,
	when: ContextKeyExpr.and(ChatWindowDockableContext, ChatWindowDockedContext.negate()),
});
MenuRegistry.appendMenuItem(Menus.ChatWindowLayout, {
	command: { id: TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID, title: localize2('undockChatWindow', "Move to a Separate Window") },
	group: ChatWindowLayoutMenuGroup.window,
	when: ChatWindowDockedContext,
});
const chatWindowDockButtonOrder = chatWindowArrangementButtonsOrder + chatWindowArrangements.length;
MenuRegistry.appendMenuItem(Menus.ChatWindowTitleBar, {
	command: { id: TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID, title: localize2('dockChatWindow', "Dock in Main Window"), icon: Codicon.layoutSidebarRightDock },
	group: 'navigation',
	order: chatWindowDockButtonOrder,
	when: ContextKeyExpr.and(InChatWindowContext, ChatWindowDockableContext, ChatWindowDockedContext.negate()),
	isHiddenByDefault: true,
});
MenuRegistry.appendMenuItem(Menus.ChatWindowTitle, {
	command: { id: TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID, title: localize2('undockChatWindow', "Move to a Separate Window"), icon: Codicon.openInWindow },
	group: 'navigation',
	order: chatWindowDockButtonOrder,
	when: ChatWindowDockedContext,
	isHiddenByDefault: true,
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
