/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';

export const enum TerminalChatCommandId {
	Start = 'workbench.action.terminal.chat.start',
	Close = 'workbench.action.terminal.chat.close',
	Discard = 'workbench.action.terminal.chat.discard',
	MakeRequest = 'workbench.action.terminal.chat.makeRequest',
	Cancel = 'workbench.action.terminal.chat.cancel',
	RunCommand = 'workbench.action.terminal.chat.runCommand',
	RunFirstCommand = 'workbench.action.terminal.chat.runFirstCommand',
	InsertCommand = 'workbench.action.terminal.chat.insertCommand',
	InsertFirstCommand = 'workbench.action.terminal.chat.insertFirstCommand',
	ViewInChat = 'workbench.action.terminal.chat.viewInChat',
	PreviousFromHistory = 'workbench.action.terminal.chat.previousFromHistory',
	NextFromHistory = 'workbench.action.terminal.chat.nextFromHistory',
}

export const MENU_TERMINAL_CHAT_INPUT = MenuId.for('terminalChatInput');
export const MENU_TERMINAL_CHAT_WIDGET = MenuId.for('terminalChatWidget');
export const MENU_TERMINAL_CHAT_WIDGET_STATUS = MenuId.for('terminalChatWidget.status');
export const MENU_TERMINAL_CHAT_WIDGET_TOOLBAR = MenuId.for('terminalChatWidget.toolbar');

export const enum TerminalChatContextKeyStrings {
	ChatFocus = 'terminalChatFocus',
	ChatVisible = 'terminalChatVisible',
	ChatActiveRequest = 'terminalChatActiveRequest',
	ChatInputHasText = 'terminalChatInputHasText',
	ChatAgentRegistered = 'terminalChatAgentRegistered',
	ChatResponseEditorFocused = 'terminalChatResponseEditorFocused',
	ChatResponseContainsCodeBlock = 'terminalChatResponseContainsCodeBlock',
	ChatResponseContainsMultipleCodeBlocks = 'terminalChatResponseContainsMultipleCodeBlocks',
	ChatResponseSupportsIssueReporting = 'terminalChatResponseSupportsIssueReporting',
	ChatSessionResponseVote = 'terminalChatSessionResponseVote',
}


export namespace TerminalChatContextKeys {

	/** Whether the chat widget is focused */
	export const focused = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatFocus, false, localize('chatFocusedContextKey', "Whether the chat view is focused."));

	/** Whether the chat widget is visible */
	export const visible = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatVisible, false, localize('chatVisibleContextKey', "Whether the chat view is visible."));

	/** Whether there is an active chat request */
	export const requestActive = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatActiveRequest, false, localize('chatRequestActiveContextKey', "Whether there is an active chat request."));

	/** Whether the chat input has text */
	export const inputHasText = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatInputHasText, false, localize('chatInputHasTextContextKey', "Whether the chat input has text."));

	/** The chat response contains at least one code block */
	export const responseContainsCodeBlock = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatResponseContainsCodeBlock, false, localize('chatResponseContainsCodeBlockContextKey', "Whether the chat response contains a code block."));

	/** The chat response contains multiple code blocks */
	export const responseContainsMultipleCodeBlocks = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatResponseContainsMultipleCodeBlocks, false, localize('chatResponseContainsMultipleCodeBlocksContextKey', "Whether the chat response contains multiple code blocks."));

	/** A chat agent exists for the terminal location */
	export const hasChatAgent = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatAgentRegistered, false, localize('chatAgentRegisteredContextKey', "Whether a chat agent is registered for the terminal location."));
}
