/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from '../../../../../base/common/codicons.js';
import { KeyCode, KeyMod } from '../../../../../base/common/keyCodes.js';
import { localize2 } from '../../../../../nls.js';
import { ContextKeyExpr } from '../../../../../platform/contextkey/common/contextkey.js';
import { KeybindingWeight } from '../../../../../platform/keybinding/common/keybindingsRegistry.js';
import { AbstractInlineChatAction } from '../../../inlineChat/browser/inlineChatActions.js';
import { CTX_INLINE_CHAT_EMPTY, CTX_INLINE_CHAT_FOCUSED } from '../../../inlineChat/common/inlineChat.js';
import { isDetachedTerminalInstance } from '../../../terminal/browser/terminal.js';
import { registerActiveXtermAction } from '../../../terminal/browser/terminalActions.js';
import { TerminalContextKeys } from '../../../terminal/common/terminalContextKey.js';
import { MENU_TERMINAL_CHAT_INPUT, MENU_TERMINAL_CHAT_WIDGET, MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatCommandId, TerminalChatContextKeys } from './terminalChat.js';
import { TerminalChatController } from './terminalChatController.js';

registerActiveXtermAction({
	id: TerminalChatCommandId.Start,
	title: localize2('startChat', 'Start in Terminal'),
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.KeyI,
		when: ContextKeyExpr.and(TerminalContextKeys.focusInAny),
		// HACK: Force weight to be higher than the extension contributed keybinding to override it until it gets replaced
		weight: KeybindingWeight.ExternalExtension + 1, // KeybindingWeight.WorkbenchContrib,
	},
	f1: true,
	category: AbstractInlineChatAction.category,
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.hasChatAgent
	),
	run: (_xterm, _accessor, activeInstance, opts?: unknown) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}

		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);

		if (opts) {
			opts = typeof opts === 'string' ? { query: opts } : opts;
			if (typeof opts === 'object' && opts !== null && 'query' in opts && typeof opts.query === 'string') {
				contr?.updateInput(opts.query, false);
				if (!('isPartialQuery' in opts && opts.isPartialQuery)) {
					contr?.acceptInput();
				}
			}

		}

		contr?.reveal();
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.Close,
	title: localize2('closeChat', 'Close Chat'),
	keybinding: {
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape],
		when: ContextKeyExpr.and(TerminalChatContextKeys.focused, TerminalChatContextKeys.visible),
		weight: KeybindingWeight.WorkbenchContrib,
	},
	icon: Codicon.close,
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET,
		group: 'navigation',
		order: 2
	},
	f1: true,
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.and(TerminalChatContextKeys.focused, TerminalChatContextKeys.visible)
	),
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.clear();
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.FocusResponse,
	title: localize2('focusTerminalResponse', 'Focus Terminal Response'),
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.DownArrow,
		when: TerminalChatContextKeys.focused,
		weight: KeybindingWeight.WorkbenchContrib,
	},
	f1: true,
	category: AbstractInlineChatAction.category,
	precondition: ContextKeyExpr.and(
		TerminalChatContextKeys.focused
	),
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.chatWidget?.inlineChatWidget.chatWidget.focusLastMessage();
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.FocusInput,
	title: localize2('focusTerminalInput', 'Focus Terminal Input'),
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.UpArrow,
		secondary: [KeyMod.CtrlCmd | KeyCode.KeyI],
		when: ContextKeyExpr.and(TerminalChatContextKeys.focused, CTX_INLINE_CHAT_FOCUSED.toNegated()),
		weight: KeybindingWeight.WorkbenchContrib,
	},
	f1: true,
	category: AbstractInlineChatAction.category,
	precondition: ContextKeyExpr.and(
		TerminalChatContextKeys.focused
	),
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.chatWidget?.focus();
	}
});


registerActiveXtermAction({
	id: TerminalChatCommandId.Discard,
	title: localize2('discard', 'Discard'),
	metadata: {
		description: localize2('discardDescription', 'Discards the terminal current chat response, hide the chat widget, and clear the chat input.')
	},
	icon: Codicon.discard,
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 2,
		when: ContextKeyExpr.and(TerminalChatContextKeys.focused, TerminalChatContextKeys.responseContainsCodeBlock)
	},
	f1: true,
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.focused,
		TerminalChatContextKeys.responseContainsCodeBlock
	),
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.clear();
	}
});


registerActiveXtermAction({
	id: TerminalChatCommandId.RunCommand,
	title: localize2('runCommand', 'Run Chat Command'),
	shortTitle: localize2('run', 'Run'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.requestActive.negate(),
		TerminalChatContextKeys.responseContainsCodeBlock,
		TerminalChatContextKeys.responseContainsMultipleCodeBlocks.negate()
	),
	icon: Codicon.play,
	keybinding: {
		when: TerminalChatContextKeys.requestActive.negate(),
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.CtrlCmd | KeyCode.Enter,
	},
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 0,
		when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsCodeBlock, TerminalChatContextKeys.responseContainsMultipleCodeBlocks.negate(), TerminalChatContextKeys.requestActive.negate())
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.acceptCommand(true);
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.RunFirstCommand,
	title: localize2('runFirstCommand', 'Run First Chat Command'),
	shortTitle: localize2('runFirst', 'Run First'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.requestActive.negate(),
		TerminalChatContextKeys.responseContainsMultipleCodeBlocks
	),
	icon: Codicon.play,
	keybinding: {
		when: TerminalChatContextKeys.requestActive.negate(),
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.CtrlCmd | KeyCode.Enter,
	},
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 0,
		when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsMultipleCodeBlocks, TerminalChatContextKeys.requestActive.negate())
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.acceptCommand(true);
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.InsertCommand,
	title: localize2('insertCommand', 'Insert Chat Command'),
	shortTitle: localize2('insert', 'Insert'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.requestActive.negate(),
		TerminalChatContextKeys.responseContainsCodeBlock,
		TerminalChatContextKeys.responseContainsMultipleCodeBlocks.negate()
	),
	keybinding: {
		when: TerminalChatContextKeys.requestActive.negate(),
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.Alt | KeyCode.Enter,
		secondary: [KeyMod.CtrlCmd | KeyCode.Enter | KeyMod.Alt]
	},
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 1,
		when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsCodeBlock, TerminalChatContextKeys.responseContainsMultipleCodeBlocks.negate(), TerminalChatContextKeys.requestActive.negate())
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.acceptCommand(false);
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.InsertFirstCommand,
	title: localize2('insertFirstCommand', 'Insert First Chat Command'),
	shortTitle: localize2('insertFirst', 'Insert First'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.requestActive.negate(),
		TerminalChatContextKeys.responseContainsMultipleCodeBlocks
	),
	keybinding: {
		when: TerminalChatContextKeys.requestActive.negate(),
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.Alt | KeyCode.Enter,
		secondary: [KeyMod.CtrlCmd | KeyCode.Enter | KeyMod.Alt]
	},
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 1,
		when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsMultipleCodeBlocks, TerminalChatContextKeys.requestActive.negate())
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.acceptCommand(false);
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.ViewInChat,
	title: localize2('viewInChat', 'View in Chat'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.requestActive.negate(),
	),
	icon: Codicon.commentDiscussion,
	menu: [{
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 1,
		when: ContextKeyExpr.and(TerminalChatContextKeys.responseContainsCodeBlock, TerminalChatContextKeys.requestActive.negate()),
	},
	{
		id: MENU_TERMINAL_CHAT_WIDGET,
		group: 'navigation',
		order: 1,
		when: ContextKeyExpr.and(CTX_INLINE_CHAT_EMPTY.negate(), TerminalChatContextKeys.responseContainsCodeBlock, TerminalChatContextKeys.requestActive.negate()),
	}],
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.viewInChat();
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.MakeRequest,
	title: localize2('makeChatRequest', 'Make Chat Request'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalChatContextKeys.requestActive.negate(),
		CTX_INLINE_CHAT_EMPTY.negate()
	),
	icon: Codicon.send,
	keybinding: {
		when: ContextKeyExpr.and(TerminalChatContextKeys.focused, TerminalChatContextKeys.requestActive.negate()),
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyCode.Enter
	},
	menu: {
		id: MENU_TERMINAL_CHAT_INPUT,
		group: 'navigation',
		order: 1,
		when: TerminalChatContextKeys.requestActive.negate(),
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
	id: TerminalChatCommandId.Cancel,
	title: localize2('cancelChat', 'Cancel Chat'),
	precondition: ContextKeyExpr.and(
		TerminalChatContextKeys.requestActive,
	),
	icon: Codicon.debugStop,
	menu: {
		id: MENU_TERMINAL_CHAT_INPUT,
		group: 'navigation',
		when: TerminalChatContextKeys.requestActive,
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.cancel();
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.PreviousFromHistory,
	title: localize2('previousFromHitory', 'Previous From History'),
	precondition: TerminalChatContextKeys.focused,
	keybinding: {
		when: TerminalChatContextKeys.focused,
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyCode.UpArrow,
	},

	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.populateHistory(true);
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.NextFromHistory,
	title: localize2('nextFromHitory', 'Next From History'),
	precondition: TerminalChatContextKeys.focused,
	keybinding: {
		when: TerminalChatContextKeys.focused,
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyCode.DownArrow,
	},

	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.populateHistory(false);
	}
});
