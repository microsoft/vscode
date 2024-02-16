/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from 'vs/nls';
import { MenuId } from 'vs/platform/actions/common/actions';
import { RawContextKey } from 'vs/platform/contextkey/common/contextkey';

export const enum TerminalChatCommandId {
	Start = 'workbench.action.terminal.chat.start',
	Close = 'workbench.action.terminal.chat.close',
	Discard = 'workbench.action.terminal.chat.discard',
	MakeRequest = 'workbench.action.terminal.chat.makeRequest',
	Cancel = 'workbench.action.terminal.chat.cancel',
	FeedbackHelpful = 'workbench.action.terminal.chat.feedbackHelpful',
	FeedbackUnhelpful = 'workbench.action.terminal.chat.feedbackUnhelpful',
	FeedbackReportIssue = 'workbench.action.terminal.chat.feedbackReportIssue',
	RunCommand = 'workbench.action.terminal.chat.runCommand',
	InsertCommand = 'workbench.action.terminal.chat.insertCommand',
	ViewInChat = 'workbench.action.terminal.chat.viewInChat',
}

export const MENU_TERMINAL_CHAT_INPUT = MenuId.for('terminalChatInput');
export const MENU_TERMINAL_CHAT_WIDGET = MenuId.for('terminalChatWidget');
export const MENU_TERMINAL_CHAT_WIDGET_STATUS = MenuId.for('terminalChatWidget.status');
export const MENU_TERMINAL_CHAT_WIDGET_FEEDBACK = MenuId.for('terminalChatWidget.feedback');
export const MENU_TERMINAL_CHAT_WIDGET_TOOLBAR = MenuId.for('terminalChatWidget.toolbar');

export const enum TerminalChatContextKeyStrings {
	ChatFocus = 'terminalChatFocus',
	ChatVisible = 'terminalChatVisible',
	ChatActiveRequest = 'terminalChatActiveRequest',
	ChatInputHasText = 'terminalChatInputHasText',
	ChatAgentRegistered = 'terminalChatAgentRegistered',
	ChatResponseEditorFocused = 'terminalChatResponseEditorFocused',
	ChatResponseType = 'terminalChatResponseType',
	ChatResponseSupportsIssueReporting = 'terminalChatResponseSupportsIssueReporting',
	ChatSessionResponseVote = 'terminalChatSessionResponseVote',
}

export const enum TerminalChatResponseTypes {
	Message = 'message',
	TerminalCommand = 'terminalCommand'
}

export namespace TerminalChatContextKeys {

	/** Whether the chat widget is focused */
	export const chatFocused = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatFocus, false, localize('chatFocusedContextKey', "Whether the chat view is focused."));

	/** Whether the chat widget is visible */
	export const chatVisible = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatVisible, false, localize('chatVisibleContextKey', "Whether the chat view is visible."));

	/** Whether there is an active chat request */
	export const chatRequestActive = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatActiveRequest, false, localize('chatRequestActiveContextKey', "Whether there is an active chat request."));

	/** Whether the chat input has text */
	export const chatInputHasText = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatInputHasText, false, localize('chatInputHasTextContextKey', "Whether the chat input has text."));

	/** Whether the terminal chat agent has been registered */
	export const chatAgentRegistered = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatAgentRegistered, false, localize('chatAgentRegisteredContextKey', "Whether the terminal chat agent has been registered."));

	/** Whether the chat response editor is focused */
	export const chatResponseEditorFocused = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatResponseEditorFocused, false, localize('chatResponseEditorFocusedContextKey', "Whether the chat response editor is focused."));

	/** The type of chat response, if any */
	export const chatResponseType = new RawContextKey<TerminalChatResponseTypes | undefined>(TerminalChatContextKeyStrings.ChatResponseType, undefined, localize('chatResponseTypeContextKey', "The type of chat response, if any"));

	/** Whether the response supports issue reporting */
	export const chatResponseSupportsIssueReporting = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatResponseSupportsIssueReporting, false, localize('chatResponseSupportsIssueReportingContextKey', "Whether the response supports issue reporting"));

	/** The chat vote, if any for the response, if any */
	export const chatSessionResponseVote = new RawContextKey<string>(TerminalChatContextKeyStrings.ChatSessionResponseVote, undefined, { type: 'string', description: localize('interactiveSessionResponseVote', "When the response has been voted up, is set to 'up'. When voted down, is set to 'down'. Otherwise an empty string.") });
}
