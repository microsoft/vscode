/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { ThemeIcon } from '../../../../base/common/themables.js';
import { localize, localize2 } from '../../../../nls.js';
import { ILocalizedString } from '../../../../platform/action/common/action.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
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

/** A layout of chat windows, as chosen from the Command Palette or the split direction button of their title bar. */
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

/** In a chat window of its own that shows an editor: where its title bar shows the layout actions. */
const ChatWindowTitleBarLayoutContext = ContextKeyExpr.and(InChatWindowContext, ChatWindowHasEditorContext, ChatWindowDockedContext.negate());

// One button switches the direction in which the chat and the editor show together, to the other one. It is disabled
// while only one of them shows, keeping the direction they show in when both show again.
const ChatWindowBothShownContext = ContextKeyExpr.or(ChatWindowLayoutContext.isEqualTo(ChatWindowLayout.EditorAboveChat), ChatWindowLayoutContext.isEqualTo(ChatWindowLayout.SideBySide));
for (const [current, other] of [[ChatWindowLayout.EditorAboveChat, ChatWindowLayout.SideBySide], [ChatWindowLayout.SideBySide, ChatWindowLayout.EditorAboveChat]] as const) {
	const choice = chatWindowLayoutChoices.find(candidate => candidate.layout === other)!;
	MenuRegistry.appendMenuItem(Menus.TitleBarRightLayout, {
		command: { id: choice.id, title: choice.title, icon: choice.icon, precondition: ChatWindowBothShownContext },
		group: 'navigation',
		order: ChatWindowMenuOrder.titleBar.layout,
		when: ContextKeyExpr.and(ChatWindowTitleBarLayoutContext, ChatWindowSplitLayoutContext.isEqualTo(current)),
	});
}

// Docked, the Layout button of the header opens a menu that shows or hides the chat and the editor.
MenuRegistry.appendMenuItem(Menus.ChatWindowTitle, {
	submenu: Menus.ChatWindowDockedLayout,
	title: localize2('chatWindowLayout', "Layout"),
	icon: Codicon.layout,
	group: 'navigation',
	order: ChatWindowMenuOrder.header.layout,
	when: ContextKeyExpr.and(ChatWindowHasEditorContext, ChatWindowDockedContext),
});

/** A pane of a chat window that can be shown or hidden: the chat, or the editor. One of them always shows. */
interface IChatWindowPaneToggle {
	readonly id: string;
	readonly title: ILocalizedString;
	/** The title of its title bar button, which shows its icons rather than a check. */
	readonly toggleTitle: ILocalizedString;
	/** The icons of its title bar button, as those of the main window's side bar and side panel toggles. */
	readonly icon: ThemeIcon;
	readonly shownIcon: ThemeIcon;
	/** Its title bar button: on the left of the title bar, or on the right. */
	readonly titleBarMenu: MenuId;
	readonly titleBarOrder: number;
	/** The layout that shows only this pane: it cannot be hidden there, as the other pane is hidden. */
	readonly aloneLayout: ChatWindowLayout;
	/** The layout that hides this pane. */
	readonly hiddenLayout: ChatWindowLayout;
	readonly order: number;
}

const chatWindowPaneToggles: readonly IChatWindowPaneToggle[] = [{
	id: 'sessions.chatWindow.toggleChat',
	title: localize2('chatWindowShowChat', "Show Chat"),
	toggleTitle: localize2('chatWindowToggleChat', "Toggle Chat"),
	icon: Codicon.layoutSidebarLeftOff,
	shownIcon: Codicon.layoutSidebarLeft,
	titleBarMenu: Menus.TitleBarLeftLayout,
	titleBarOrder: 0,
	aloneLayout: ChatWindowLayout.ChatOnly,
	hiddenLayout: ChatWindowLayout.EditorOnly,
	order: 1,
}, {
	id: 'sessions.chatWindow.toggleEditor',
	title: localize2('chatWindowShowEditor', "Show Editor"),
	toggleTitle: localize2('chatWindowToggleEditor', "Toggle Editor"),
	icon: Codicon.layoutSidebarRightOff,
	shownIcon: Codicon.layoutSidebarRight,
	titleBarMenu: Menus.TitleBarRightLayout,
	titleBarOrder: ChatWindowMenuOrder.titleBar.editor,
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
					id: Menus.ChatWindowDockedLayout,
					group: 'navigation',
					order: toggle.order,
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
	MenuRegistry.appendMenuItem(toggle.titleBarMenu, {
		command: { id: toggle.id, title: toggle.toggleTitle, icon: toggle.icon, toggled: { condition: shown, icon: toggle.shownIcon }, precondition },
		group: 'navigation',
		order: toggle.titleBarOrder,
		when: ChatWindowTitleBarLayoutContext,
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

// What the button does, rather than a checked toggle: Dock in the title bar of a separate window, and Move to a Separate
// Window in the header of a docked one.
MenuRegistry.appendMenuItem(Menus.TitleBarRightLayout, {
	command: { id: TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID, title: localize2('dockChatWindow', "Dock in Main Window"), icon: Codicon.layoutSidebarRightDock },
	group: 'navigation',
	order: ChatWindowMenuOrder.titleBar.dock,
	when: ContextKeyExpr.and(InChatWindowContext, ChatWindowDockableContext, ChatWindowDockedContext.negate()),
});
MenuRegistry.appendMenuItem(Menus.ChatWindowTitle, {
	command: { id: TOGGLE_CHAT_WINDOW_DOCKED_COMMAND_ID, title: localize2('undockChatWindow', "Move to a Separate Window"), icon: Codicon.openInWindow },
	group: 'navigation',
	order: ChatWindowMenuOrder.header.dock,
	when: ChatWindowDockedContext,
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
