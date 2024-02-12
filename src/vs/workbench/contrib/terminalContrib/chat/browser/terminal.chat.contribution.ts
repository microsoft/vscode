/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize2 } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { isDetachedTerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerActiveXtermAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { registerTerminalContribution } from 'vs/workbench/contrib/terminal/browser/terminalExtensions';
import { TerminalCommandId } from 'vs/workbench/contrib/terminal/common/terminal';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { TerminalChatController } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatController';

registerTerminalContribution(TerminalChatController.ID, TerminalChatController, false);

registerActiveXtermAction({
	id: TerminalCommandId.FocusChat,
	title: localize2('workbench.action.terminal.focusChat', 'Focus Chat'),
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.KeyI,
		when: ContextKeyExpr.and(TerminalContextKeys.chatFocused.negate(), TerminalContextKeys.focusInAny),
		weight: KeybindingWeight.WorkbenchContrib
	},
	f1: true,
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	),
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.chatWidget?.reveal();
	}
});

registerActiveXtermAction({
	id: TerminalCommandId.HideChat,
	title: localize2('workbench.action.terminal.hideChat', 'Hide Chat'),
	keybinding: {
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape],
		when: ContextKeyExpr.and(TerminalContextKeys.chatFocused, TerminalContextKeys.chatVisible),
		weight: KeybindingWeight.WorkbenchContrib
	},
	f1: true,
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
	),
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.chatWidget?.hide();
	}
});

registerActiveXtermAction({
	id: TerminalCommandId.MakeChatRequest,
	title: localize2('workbench.action.terminal.submitChat', 'Make Chat Request'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		// TerminalContextKeys.chatInputHasText
	),
	icon: Codicon.send,
	keybinding: {
		when: TerminalContextKeys.chatRequestActive.negate(),
		// TODO:
		// when: CTX_INLINE_CHAT_FOCUSED,
		weight: KeybindingWeight.EditorCore + 7,
		primary: KeyCode.Enter
	},
	menu: {
		id: MenuId.TerminalChat,
		group: 'main',
		order: 1,
		// when: TerminalContextKeys.chatSessionInProgress.negate(),
		// TODO:
		// when: CTX_INLINE_CHAT_HAS_ACTIVE_REQUEST.isEqualTo(false)
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.acceptInput();
	}
});

registerActiveXtermAction({
	id: TerminalCommandId.CancelChat,
	title: localize2('workbench.action.terminal.cancelChat', 'Cancel Chat'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		TerminalContextKeys.chatRequestActive,
	),
	icon: Codicon.debugStop,
	menu: {
		id: MenuId.ChatExecute,
		group: 'navigation',
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.chatWidget?.cancel();
	}
});
