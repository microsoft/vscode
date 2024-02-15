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
import { CTX_INLINE_CHAT_EMPTY, CTX_INLINE_CHAT_FOCUSED } from 'vs/workbench/contrib/inlineChat/common/inlineChat';
import { isDetachedTerminalInstance } from 'vs/workbench/contrib/terminal/browser/terminal';
import { registerActiveXtermAction } from 'vs/workbench/contrib/terminal/browser/terminalActions';
import { TerminalChatResponseTypes, TerminalContextKeys } from 'vs/workbench/contrib/terminal/common/terminalContextKey';
import { MENU_TERMINAL_CHAT_INPUT, MENU_TERMINAL_CHAT_WIDGET, MENU_TERMINAL_CHAT_WIDGET_FEEDBACK, MENU_TERMINAL_CHAT_WIDGET_STATUS, TerminalChatCommandId } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChat';
import { TerminalChatController } from 'vs/workbench/contrib/terminalContrib/chat/browser/terminalChatController';

registerActiveXtermAction({
	id: TerminalChatCommandId.Start,
	title: localize2('startChat', 'Start Chat'),
	keybinding: {
		primary: KeyMod.CtrlCmd | KeyCode.KeyI,
		when: ContextKeyExpr.and(TerminalContextKeys.chatFocused.negate(), TerminalContextKeys.focusInAny),
		weight: KeybindingWeight.WorkbenchContrib,
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
		// TODO: Remove this before merging to main
		contr?.chatWidget?.setValue('list files');
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.Hide,
	title: localize2('closeChat', 'Close Chat'),
	keybinding: {
		primary: KeyCode.Escape,
		secondary: [KeyMod.Shift | KeyCode.Escape],
		when: ContextKeyExpr.and(TerminalContextKeys.chatFocused, TerminalContextKeys.chatVisible),
		weight: KeybindingWeight.WorkbenchContrib,
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
		contr?.clear();
	}
});




registerActiveXtermAction({
	id: TerminalChatCommandId.RunCommand,
	title: localize2('runCommand', 'Run Chat Command'),
	shortTitle: localize2('run', 'Run'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalContextKeys.chatRequestActive.negate(),
		TerminalContextKeys.chatAgentRegistered,
		TerminalContextKeys.chatResponseType.isEqualTo(TerminalChatResponseTypes.TerminalCommand)
	),
	icon: Codicon.check,
	keybinding: {
		when: TerminalContextKeys.chatRequestActive.negate(),
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.CtrlCmd | KeyCode.Enter,
	},
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 0,
		when: ContextKeyExpr.and(TerminalContextKeys.chatResponseType.isEqualTo(TerminalChatResponseTypes.TerminalCommand), TerminalContextKeys.chatRequestActive.negate()),
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
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalContextKeys.chatRequestActive.negate(),
		TerminalContextKeys.chatAgentRegistered,
		TerminalContextKeys.chatResponseType.isEqualTo(TerminalChatResponseTypes.TerminalCommand)
	),
	icon: Codicon.check,
	keybinding: {
		when: TerminalContextKeys.chatRequestActive.negate(),
		weight: KeybindingWeight.WorkbenchContrib,
		primary: KeyMod.Alt | KeyCode.Enter,
	},
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 1,
		when: ContextKeyExpr.and(TerminalContextKeys.chatResponseType.isEqualTo(TerminalChatResponseTypes.TerminalCommand), TerminalContextKeys.chatRequestActive.negate()),
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
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalContextKeys.chatRequestActive.negate(),
		TerminalContextKeys.chatAgentRegistered,
	),
	icon: Codicon.commentDiscussion,
	menu: [{
		id: MENU_TERMINAL_CHAT_WIDGET_STATUS,
		group: '0_main',
		order: 1,
		when: ContextKeyExpr.and(TerminalContextKeys.chatResponseType.isEqualTo(TerminalChatResponseTypes.Message), TerminalContextKeys.chatRequestActive.negate()),
	},
	{
		id: MENU_TERMINAL_CHAT_WIDGET,
		group: 'main',
		order: 1,
		when: ContextKeyExpr.and(CTX_INLINE_CHAT_EMPTY.negate(), TerminalContextKeys.chatResponseType.isEqualTo(TerminalChatResponseTypes.TerminalCommand), TerminalContextKeys.chatRequestActive.negate()),
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
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		ContextKeyExpr.or(TerminalContextKeys.processSupported, TerminalContextKeys.terminalHasBeenCreated),
		TerminalContextKeys.chatRequestActive.negate(),
		TerminalContextKeys.chatAgentRegistered,
		CTX_INLINE_CHAT_EMPTY.negate()
	),
	icon: Codicon.send,
	keybinding: {
		when: ContextKeyExpr.and(CTX_INLINE_CHAT_FOCUSED, TerminalContextKeys.chatRequestActive.negate()),
		weight: KeybindingWeight.WorkbenchContrib,
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
		contr?.cancel();
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.FeedbackHelpful,
	title: localize2('feedbackHelpful', 'Helpful'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		TerminalContextKeys.chatResponseType.notEqualsTo(undefined)
	),
	// TODO: toggled: CTX_INLINE_CHAT_LAST_FEEDBACK.isEqualTo('helpful'),
	icon: Codicon.thumbsup,
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_FEEDBACK,
		group: 'inline',
		order: 1,
		when: TerminalContextKeys.chatResponseType.notEqualsTo(undefined),
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.acceptFeedback(true);
	}
});

registerActiveXtermAction({
	id: TerminalChatCommandId.FeedbackUnhelpful,
	title: localize2('feedbackUnhelpful', 'Unhelpful'),
	precondition: ContextKeyExpr.and(
		ContextKeyExpr.has(`config.${TerminalSettingId.ExperimentalInlineChat}`),
		TerminalContextKeys.chatResponseType.notEqualsTo(undefined),
	),
	// TODO: toggled: CTX_INLINE_CHAT_LAST_FEEDBACK.isEqualTo('unhelpful'),
	icon: Codicon.thumbsdown,
	menu: {
		id: MENU_TERMINAL_CHAT_WIDGET_FEEDBACK,
		group: 'inline',
		order: 2,
		when: TerminalContextKeys.chatResponseType.notEqualsTo(undefined),
	},
	run: (_xterm, _accessor, activeInstance) => {
		if (isDetachedTerminalInstance(activeInstance)) {
			return;
		}
		const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		contr?.acceptFeedback(false);
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
		// if (isDetachedTerminalInstance(activeInstance)) {
		// 	return;
		// }
		// const contr = TerminalChatController.activeChatWidget || TerminalChatController.get(activeInstance);
		// contr?.acceptFeedback(true);
	}
});

