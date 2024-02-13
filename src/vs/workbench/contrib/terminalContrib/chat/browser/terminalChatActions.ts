/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Codicon } from 'vs/base/common/codicons';
import { KeyCode, KeyMod } from 'vs/base/common/keyCodes';
import { localize2 } from 'vs/nls';
import { ContextKeyExpr } from 'vs/platform/contextkey/common/contextkey';
import { KeybindingWeight } from 'vs/platform/keybinding/common/keybindingsRegistry';
import { TerminalSettingId } from 'vs/platform/terminal/common/terminal';
import { CTX_INLINE_CHAT_EMPTY, CTX_INLINE_CHAT_FOCUSED, CTX_INLINE_CHAT_RESPONSE_TYPES, InlineChatResponseTypes } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { isDetachedTerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerActiveXtermAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { MENU_TERMINAL_CHAT_INPUT, MENU_TERMINAL_CHAT_WIDGET, MENU_TERMINAL_CHAT_WIDGET_FEEDBACK, MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatCommandId } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChat';
import { TerminalChatController } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatController';

registerActiveXtermAction({
	id: TerminalChatCommandId.Focus,
	title: localize2('focusChat', 'Focus Chat'),
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
	id: TerminalChatCommandId.Hide,
	title: localize2('closeChat', 'Close Chat'),
	keybinding: {
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape],
		when: ContextKeyExpr.and(TerminalContextKeys.chatFocused, TerminalContextKeys.chatVisible),
		weight: KeybindingWeight.WorkbenchContrib
	},
	icon: Codicon.close,
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET,
		group: 'main',
		order: 2
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
	id: TerminalChatCommandId.AcceptCommand,
	title: localize2('acceptCommand', 'Accept Command'),
	shortTitle: localize2('accept', 'Accept'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalContextKeys.chatRequestActive.negate(),
		TerminalContextKeys.chatAgentRegistered,
		CTX_INLINE_CHAT_RESPONSE_TYPES.isEqualTo(InlineChatResponseTypes.Empty)
	),
	icon: Codicon.check,
	keybinding: {
		when: ContextKeyExpr.and(TerminalContextKeys.chatResponseEditorFocused, TerminalContextKeys.chatRequestActive.negate()),
		weight: KeybindingWeight.EditorCore + 7,
		primary: KeyMod.CtrlCmd | KeyCode.Enter,
	},
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 0,
		when: CTX_INLINE_CHAT_RESPONSE_TYPES.isEqualTo(InlineChatResponseTypes.Empty),
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.acceptCommand();
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.MakeRequest,
	title: localize2('makeChatRequest', 'Make Chat Request'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalContextKeys.chatRequestActive.negate(),
		TerminalContextKeys.chatAgentRegistered,
		CTX_INLINE_CHAT_EMPTY.negate()
	),
	icon: Codicon.send,
	keybinding: {
		when: ContextKeyExpr.and(CTX_INLINE_CHAT_FOCUSED, TerminalContextKeys.chatRequestActive.negate()),
		weight: KeybindingWeight.EditorCore + 7,
		primary: KeyCode.Enter
	},
	menu: {
		id: MENU_TERMINAL_CHAT_INPUT,
		group: 'main',
		order: 1,
		when: TerminalContextKeys.chatRequestActive.negate(),
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
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		TerminalContextKeys.chatRequestActive,
		TerminalContextKeys.chatAgentRegistered
	),
	icon: Codicon.debugStop,
	menu: {
		id: MENU_TERMINAL_CHAT_INPUT,
		group: 'main',
		when: TerminalContextKeys.chatRequestActive,
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.chatWidget?.cancel();
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.FeedbackHelpful,
	title: localize2('feedbackHelpful', 'Helpful'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		TerminalContextKeys.chatRequestActive,
	),
	// TODO: toggled: CTX_INLINE_CHAT_LAST_FEEDBACK.isEqualTo('helpful'),
	icon: Codicon.thumbsup,
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_FEEDBACK,
		group: 'inline',
		order: 1,
		// TODO: Fill in ctx
		// when: CTX_INLINE_CHAT_LAST_RESPONSE_TYPE.notEqualsTo(undefined),
	},
	run: (_xterm, _accessor, activeInstance) => {
		// TODO: Impl
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.FeedbackUnhelpful,
	title: localize2('feedbackUnhelpful', 'Unhelpful'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		TerminalContextKeys.chatRequestActive,
	),
	// TODO: toggled: CTX_INLINE_CHAT_LAST_FEEDBACK.isEqualTo('unhelpful'),
	icon: Codicon.thumbsdown,
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_FEEDBACK,
		group: 'inline',
		order: 2,
		// TODO: Fill in ctx
		// when: CTX_INLINE_CHAT_LAST_RESPONSE_TYPE.notEqualsTo(undefined),
	},
	run: (_xterm, _accessor, activeInstance) => {
		// TODO: Impl
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.FeedbackReportIssue,
	title: localize2('reportIssue', 'Report Issue'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		TerminalContextKeys.chatRequestActive,
	),
	// TODO: precondition: ContextKeyExpr.and(CTX_INLINE_CHAT_VISIBLE, CTX_INLINE_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.Empty)),
	icon: Codicon.report,
	menu: [/*{
		// TODO: Enable this
		id: MENU_TERMINAL_CHAT_WIDGET_FEEDBACK,
		when: ContextKeyExpr.and(CTX_TERMINAL_CHAT_SUPPORT_ISSUE_REPORTING, CTX_TERMINAL_CHAT_RESPONSE_TYPES.notEqualsTo(InlineChatResponseTypes.Empty)),
		group: '2_feedback',
		order: 3
	}, */{
			id: MENU_TERMINAL_CHAT_WIDGET,
			group: 'config',
			order: 3
		}],
	run: (_xterm, _accessor, activeInstance) => {
		// TODO: Impl
	}
});
