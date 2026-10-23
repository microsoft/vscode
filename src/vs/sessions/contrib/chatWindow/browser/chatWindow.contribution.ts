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
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../../workbench/common/contributions.js';
import { EditorExtensions } from '../../../../workbench/common/editor.js';
import { Menus } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { ChatWindowContext, ChatWindowDockableContext, ChatWindowDockedContext, ChatWindowHasEditorContext, ChatWindowLayout, ChatWindowLayoutContext, ChatWindowMenuOrder, IChatWindowService } from '../../../services/chatWindow/browser/chatWindowService.js';
import { ChatWindowChatEditor, ChatWindowChatInput } from './chatWindowEditor.js';
import { ChatWindowLayoutPickerContribution } from './chatWindowLayoutPicker.js';
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

/** A layout of chat windows, as chosen from their Layout button. */
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
	// The filled half is the pane that shows alone.
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

for (const [index, choice] of chatWindowLayoutChoices.entries()) {
	const available = ContextKeyExpr.and(InChatWindowContext, ChatWindowHasEditorContext, choice.when);
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: choice.id,
				title: choice.title,
				category: SessionsCategories.Sessions,
				icon: choice.icon,
				f1: true,
				precondition: available,
				toggled: ChatWindowLayoutContext.isEqualTo(choice.layout),
				menu: [{
					id: Menus.ChatWindowLayout,
					group: 'navigation',
					order: index,
					when: choice.when,
				}],
			});
		}

		override run(accessor: ServicesAccessor): void {
			accessor.get(IChatWindowService).getActiveWindow()?.setLayout(choice.layout);
		}
	});
}

// Layout, then Dock, end the title bar of a chat window, before Toggle Always on Top, and its header when docked, before
// Close. The Layout button opens a column of the icons of the layouts (see ChatWindowLayoutPickerContribution).
const chatWindowLayoutMenu = { submenu: Menus.ChatWindowLayout, title: localize2('chatWindowLayout', "Layout"), icon: Codicon.layout, group: 'navigation' };
MenuRegistry.appendMenuItem(Menus.TitleBarRightLayout, { ...chatWindowLayoutMenu, order: ChatWindowMenuOrder.titleBar.layout, when: ContextKeyExpr.and(InChatWindowContext, ChatWindowHasEditorContext) });
// Docked, the header toggles the chat and the editor instead: one of them always shows.
MenuRegistry.appendMenuItem(Menus.ChatWindowTitle, { ...chatWindowLayoutMenu, order: ChatWindowMenuOrder.header.layout, when: ContextKeyExpr.and(ChatWindowHasEditorContext, ChatWindowDockedContext.negate()) });

/** A pane of a docked chat window that its header shows or hides: the chat, or the editor. */
interface IChatWindowPaneToggle {
	readonly id: string;
	readonly title: ILocalizedString;
	readonly hideTitle: string;
	readonly icon: ThemeIcon;
	/** The layout that shows only this pane: it cannot be hidden there, as the other pane is hidden. */
	readonly aloneLayout: ChatWindowLayout;
	/** The layout that hides this pane. */
	readonly hiddenLayout: ChatWindowLayout;
	readonly order: number;
}

const chatWindowPaneToggles: readonly IChatWindowPaneToggle[] = [{
	id: 'sessions.chatWindow.toggleChat',
	title: localize2('chatWindowShowChat', "Show Chat"),
	hideTitle: localize('chatWindowHideChat', "Hide Chat"),
	icon: Codicon.commentDiscussion,
	aloneLayout: ChatWindowLayout.ChatOnly,
	hiddenLayout: ChatWindowLayout.EditorOnly,
	order: ChatWindowMenuOrder.header.layout,
}, {
	id: 'sessions.chatWindow.toggleEditor',
	title: localize2('chatWindowShowEditor', "Show Editor"),
	hideTitle: localize('chatWindowHideEditor', "Hide Editor"),
	icon: Codicon.file,
	aloneLayout: ChatWindowLayout.EditorOnly,
	hiddenLayout: ChatWindowLayout.ChatOnly,
	order: ChatWindowMenuOrder.header.layout + 0.5,
}];

for (const toggle of chatWindowPaneToggles) {
	const shown = ChatWindowLayoutContext.notEqualsTo(toggle.hiddenLayout);
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id: toggle.id,
				title: toggle.title,
				category: SessionsCategories.Sessions,
				icon: toggle.icon,
				f1: true,
				toggled: { condition: shown, title: toggle.hideTitle },
				// Shown alone, it cannot be hidden: show the other pane instead.
				precondition: ContextKeyExpr.and(InChatWindowContext, ChatWindowDockedContext, ChatWindowHasEditorContext, ChatWindowLayoutContext.notEqualsTo(toggle.aloneLayout)),
				menu: [{
					id: Menus.ChatWindowTitle,
					group: 'navigation',
					order: toggle.order,
					when: ContextKeyExpr.and(ChatWindowDockedContext, ChatWindowHasEditorContext),
				}],
			});
		}

		override run(accessor: ServicesAccessor): void {
			const window = accessor.get(IChatWindowService).getActiveWindow();
			if (!window?.docked) {
				return;
			}
			const layout = window.layout.get();
			window.setLayout(layout === toggle.hiddenLayout ? ChatWindowLayout.EditorAboveChat : toggle.hiddenLayout);
		}
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

registerWorkbenchContribution2(ChatWindowLayoutPickerContribution.ID, ChatWindowLayoutPickerContribution, WorkbenchPhase.BlockRestore);
