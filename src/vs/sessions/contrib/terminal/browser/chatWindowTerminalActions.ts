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
import { ActiveEditorContext, LayoutModeContext, TerminalsPositionContext, TerminalsVisibleContext } from '../../../../workbench/common/contextkeys.js';
import { ChatWindowCategory, ChatWindowLayoutCommandsContext, resolveChatWindow } from '../../../../workbench/contrib/chatWindow/browser/chatWindowLayoutActions.js';
import { ChatWindowLayoutMode, ChatWindowTerminalPosition } from '../../../../workbench/contrib/chatWindow/common/chatWindowLayout.js';
import { terminalEditorId } from '../../../../workbench/contrib/terminal/browser/terminal.js';
import { Menus, SessionActivityBarGroup } from '../../../../workbench/contrib/sessions/browser/menus.js';
import { AgentsWindowMenus } from '../../../browser/agentsWindowMenus.js';
import { IChatWindowTerminalsService } from './chatWindowTerminals.js';

export const TOGGLE_CHAT_WINDOW_TERMINAL_COMMAND_ID = 'workbench.action.chatWindow.toggleTerminal';
export const ADD_CHAT_WINDOW_TERMINAL_COMMAND_ID = 'workbench.action.chatWindow.addTerminal';

/** The title of the terminals of a chat window, recognized by the editor that shows: a terminal. */
const TerminalEditorTitleContext = ContextKeyExpr.and(ChatWindowLayoutCommandsContext, ActiveEditorContext.isEqualTo(terminalEditorId));

// The terminals show in the chat window, as the panel shows them in the main window, with the keys of the panel and of
// the terminal, above the rules of the workbench for them, wherever the focus is in the chat window.
registerAction2(class ToggleChatWindowTerminalAction extends Action2 {
	constructor() {
		super({
			id: TOGGLE_CHAT_WINDOW_TERMINAL_COMMAND_ID,
			title: localize2('chatWindowToggleTerminal', "Toggle Terminal in Chat Window"),
			category: ChatWindowCategory,
			icon: Codicon.terminal,
			f1: true,
			precondition: ChatWindowLayoutCommandsContext,
			toggled: TerminalsVisibleContext,
			keybinding: [{
				primary: KeyMod.CtrlCmd | KeyCode.KeyJ,
				weight: KeybindingWeight.WorkbenchContrib + 10,
				when: ChatWindowLayoutCommandsContext,
			}, {
				primary: KeyMod.CtrlCmd | KeyCode.Backquote,
				mac: { primary: KeyMod.WinCtrl | KeyCode.Backquote },
				weight: KeybindingWeight.WorkbenchContrib + 10,
				when: ChatWindowLayoutCommandsContext,
			}],
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const window = resolveChatWindow(accessor, args);
		if (window) {
			await accessor.get(IChatWindowTerminalsService).toggle(window);
		}
	}
});

MenuRegistry.appendMenuItem(Menus.SessionActivityBar, {
	command: {
		id: TOGGLE_CHAT_WINDOW_TERMINAL_COMMAND_ID,
		title: localize2('chatWindowTerminal', "Terminal"),
		icon: Codicon.terminal,
		toggled: TerminalsVisibleContext,
	},
	group: SessionActivityBarGroup.Panel,
	order: 0,
	when: ChatWindowLayoutCommandsContext,
});

// The Add Tab entry for a terminal: it shows the terminals, or adds a terminal to those that show.
registerAction2(class AddChatWindowTerminalAction extends Action2 {
	constructor() {
		super({
			id: ADD_CHAT_WINDOW_TERMINAL_COMMAND_ID,
			title: localize2('chatWindowAddTerminal', "Terminal"),
			icon: Codicon.terminal,
			precondition: ChatWindowLayoutCommandsContext,
			menu: [AgentsWindowMenus.SessionsEditorTabsBarAddTab, AgentsWindowMenus.SessionsEmptyEditorGroupAddTab].map(id => ({
				id,
				group: 'navigation',
				order: 3,
				when: ChatWindowLayoutCommandsContext,
			})),
		});
	}

	override async run(accessor: ServicesAccessor, ...args: unknown[]): Promise<void> {
		const window = resolveChatWindow(accessor, args);
		if (window) {
			await accessor.get(IChatWindowTerminalsService).addTerminal(window);
		}
	}
});

/** The positions of the terminals, in the order they are offered. */
const terminalPositions: readonly { readonly position: ChatWindowTerminalPosition; readonly id: string; readonly title: string }[] = [
	{ position: ChatWindowTerminalPosition.FullWidth, id: 'workbench.action.chatWindow.terminalPosition.fullWidth', title: localize('chatWindowTerminalFullWidth', "Full Width") },
	{ position: ChatWindowTerminalPosition.UnderEditor, id: 'workbench.action.chatWindow.terminalPosition.underEditor', title: localize('chatWindowTerminalUnderEditor', "Under Editor") },
	{ position: ChatWindowTerminalPosition.UnderChat, id: 'workbench.action.chatWindow.terminalPosition.underChat', title: localize('chatWindowTerminalUnderChat', "Under Chat") },
];

export const ChatWindowTerminalPositionMenu = new MenuId('ChatWindowTerminalPosition');

// In the More Actions of the terminals and in the context menu of their tabs. Stacked, the terminals are always across
// the bottom: the chosen position applies again side by side.
for (const menu of [MenuId.EditorTitle, MenuId.EditorTitleContext]) {
	MenuRegistry.appendMenuItem(menu, {
		submenu: ChatWindowTerminalPositionMenu,
		title: localize('chatWindowTerminalPosition', "Terminal Position"),
		group: '9_chatWindow',
		order: 1,
		when: TerminalEditorTitleContext,
	});
}

for (const { position, id, title } of terminalPositions) {
	registerAction2(class extends Action2 {
		constructor() {
			super({
				id,
				title: { value: title, original: title },
				precondition: ContextKeyExpr.and(ChatWindowLayoutCommandsContext, LayoutModeContext.notEqualsTo(ChatWindowLayoutMode.Stacked)),
				toggled: TerminalsPositionContext.isEqualTo(position),
				menu: { id: ChatWindowTerminalPositionMenu, group: 'navigation', order: terminalPositions.findIndex(candidate => candidate.position === position) },
			});
		}

		override run(accessor: ServicesAccessor, ...args: unknown[]): void {
			// From the terminals' title, the editor title passes the resource of their editor first and the context of
			// their group after it, which names the window.
			resolveChatWindow(accessor, args)?.setTerminalPosition(position);
		}
	});
}
