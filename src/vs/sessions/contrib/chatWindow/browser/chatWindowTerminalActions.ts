/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../base/common/keyCodes.js';
import { localize, localize2 } from '../../../../nls.js';
import { Action2, MenuId, MenuRegistry, registerAction2 } from '../../../../platform/actions/common/actions.js';
import { ContextKeyExpr } from '../../../../platform/contextkey/common/contextkey.js';
import { ServicesAccessor } from '../../../../platform/instantiation/common/instantiation.js';
import { KeybindingWeight } from '../../../../platform/keybinding/common/keybindingsRegistry.js';
import { isEditorCommandsContext } from '../../../../workbench/common/editor.js';
import { ChatContextKeys } from '../../../../workbench/contrib/chat/common/actions/chatContextKeys.js';
import { Menus, SessionActivityBarGroup } from '../../../browser/menus.js';
import { SessionsCategories } from '../../../common/categories.js';
import { SessionLayoutMode, SessionTerminalPosition } from '../../../common/sessionGridLayout/sessionGridLayout.js';
import { CHAT_WINDOW_TOGGLE_EDITOR_KEY_COMMAND_ID, CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID, ChatWindowHasEditorAreaContext, ChatWindowTerminalPositionContext, ChatWindowTerminalRowContext, ChatWindowTerminalShownContext, IChatWindowService, isChatWindowHandle, SessionLayoutModeContext } from '../../../services/chatWindow/browser/chatWindowService.js';
import { showChatWindowLayout } from './chatWindowLayoutActions.js';

/** In a chat window with an editor area, while AI features are enabled: where its terminals are. */
const ChatWindowTerminalsContext = ContextKeyExpr.and(ChatContextKeys.enabled, ChatWindowHasEditorAreaContext)!;

export const CHAT_WINDOW_ADD_TERMINAL_COMMAND_ID = 'sessions.chatWindow.addTerminal';

// The terminals show in the chat window, as the panel shows them in the main window, with the keys of the panel and of
// the terminal, above the rules of the workbench for them, wherever the focus is in the chat window.
registerAction2(class ToggleChatWindowTerminalAction extends Action2 {
	constructor() {
		super({
			id: CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID,
			title: localize2('chatWindowToggleTerminal', "Toggle Terminal in Chat Window"),
			category: SessionsCategories.Sessions,
			icon: Codicon.terminal,
			f1: true,
			precondition: ChatWindowTerminalsContext,
			toggled: ChatWindowTerminalShownContext,
			keybinding: [{
				primary: KeyMod.CtrlCmd | KeyCode.KeyJ,
				weight: KeybindingWeight.WorkbenchContrib + 10,
				when: ChatWindowTerminalsContext,
			}, {
				primary: KeyMod.CtrlCmd | KeyCode.Backquote,
				mac: { primary: KeyMod.WinCtrl | KeyCode.Backquote },
				weight: KeybindingWeight.WorkbenchContrib + 10,
				when: ChatWindowTerminalsContext,
			}],
		});
	}

	override async run(accessor: ServicesAccessor, context?: unknown): Promise<void> {
		const window = accessor.get(IChatWindowService).resolveWindow(context);
		if (window) {
			const shown = window.terminalShown.get();
			await window.setTerminalShown(!shown, { focus: !shown });
		}
	}
});

// The key of the side panel, which toggles the side panel of the main window, toggles the editor area of the chat window.
registerAction2(class ToggleChatWindowEditorByKeyAction extends Action2 {
	constructor() {
		super({
			id: CHAT_WINDOW_TOGGLE_EDITOR_KEY_COMMAND_ID,
			title: localize2('chatWindowToggleEditorByKey', "Toggle Editor in Chat Window"),
			category: SessionsCategories.Sessions,
			f1: false,
			precondition: ChatWindowTerminalsContext,
			keybinding: {
				primary: KeyMod.CtrlCmd | KeyMod.Alt | KeyCode.KeyB,
				weight: KeybindingWeight.SessionsContrib + 10,
				when: ChatWindowTerminalsContext,
			},
		});
	}

	override run(accessor: ServicesAccessor, context?: unknown): void {
		const window = accessor.get(IChatWindowService).resolveWindow(context);
		if (window?.editorArea) {
			// Hiding the editor area leaves the chat, so the window is never empty; showing it brings back the layout it had.
			if (window.layout.get() === SessionLayoutMode.ChatOnly) {
				window.showEditor();
			} else {
				showChatWindowLayout(window, SessionLayoutMode.ChatOnly);
			}
		}
	}
});

MenuRegistry.appendMenuItem(Menus.SessionActivityBar, {
	command: {
		id: CHAT_WINDOW_TOGGLE_TERMINAL_COMMAND_ID,
		title: localize2('chatWindowTerminal', "Terminal"),
		icon: Codicon.terminal,
		toggled: ChatWindowTerminalShownContext,
	},
	group: SessionActivityBarGroup.Panel,
	order: 0,
	when: ChatWindowTerminalsContext,
});

// The Add Tab entry for a terminal: it shows the terminals, or adds a terminal to those that show.
registerAction2(class AddChatWindowTerminalAction extends Action2 {
	constructor() {
		super({
			id: CHAT_WINDOW_ADD_TERMINAL_COMMAND_ID,
			title: localize2('chatWindowAddTerminal', "Terminal"),
			icon: Codicon.terminal,
			precondition: ChatWindowTerminalsContext,
			menu: [Menus.SessionsEditorTabsBarAddTab, Menus.SessionsEmptyEditorGroupAddTab].map(id => ({
				id,
				group: 'navigation',
				order: 3,
				when: ChatWindowTerminalsContext,
			})),
		});
	}

	override async run(accessor: ServicesAccessor, context?: unknown): Promise<void> {
		await accessor.get(IChatWindowService).resolveWindow(context)?.addTerminal();
	}
});

/** The positions of the terminals, in the order they are offered. */
const terminalPositions: readonly { readonly position: SessionTerminalPosition; readonly id: string; readonly title: string }[] = [
	{ position: SessionTerminalPosition.FullWidth, id: 'sessions.chatWindow.terminalPosition.fullWidth', title: localize('chatWindowTerminalFullWidth', "Full Width") },
	{ position: SessionTerminalPosition.UnderEditor, id: 'sessions.chatWindow.terminalPosition.underEditor', title: localize('chatWindowTerminalUnderEditor', "Under Editor") },
	{ position: SessionTerminalPosition.UnderChat, id: 'sessions.chatWindow.terminalPosition.underChat', title: localize('chatWindowTerminalUnderChat', "Under Chat") },
];

export const ChatWindowTerminalPositionMenu = new MenuId('SessionsChatWindowTerminalPosition');

// In the More Actions of the terminals and the context menu of their tabs. Stacked, the terminals are always across the bottom: the chosen position
// applies again side by side.
MenuRegistry.appendMenuItem(MenuId.EditorTitle, {
	submenu: ChatWindowTerminalPositionMenu,
	title: localize('chatWindowTerminalPosition', "Terminal Position"),
	group: '9_chatWindow',
	order: 1,
	when: ContextKeyExpr.and(ChatWindowTerminalsContext, ChatWindowTerminalRowContext),
});
// And in the context menu of a terminal's tab.
MenuRegistry.appendMenuItem(MenuId.EditorTitleContext, {
	submenu: ChatWindowTerminalPositionMenu,
	title: localize('chatWindowTerminalPosition', "Terminal Position"),
	group: '9_chatWindow',
	order: 1,
	when: ContextKeyExpr.and(ChatWindowTerminalsContext, ChatWindowTerminalRowContext),
});

for (const { position, id, title } of terminalPositions) {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id,
				title: { value: title, original: title },
				precondition: ContextKeyExpr.and(ChatWindowTerminalsContext, SessionLayoutModeContext.notEqualsTo(SessionLayoutMode.Stacked)),
				toggled: ChatWindowTerminalPositionContext.isEqualTo(position),
				menu: { id: ChatWindowTerminalPositionMenu, group: 'navigation', order: terminalPositions.findIndex(candidate => candidate.position === position) },
			});
		}

		override run(accessor: ServicesAccessor, ...args: unknown[]): void {
			// From the More Actions of the terminals, the editor title passes the resource of their editor first and the
			// context of their group after it, which names the window.
			const context = args.find(arg => isChatWindowHandle(arg) || isEditorCommandsContext(arg));
			accessor.get(IChatWindowService).resolveWindow(context)?.setTerminalPosition(position);
		}
	});
}

/** Names this module, which registers chat window actions, in the list of the chat window contribution; see `chatWindowContributions`. */
export const chatWindowTerminalActionsContribution = 'chatWindowTerminalActions';
