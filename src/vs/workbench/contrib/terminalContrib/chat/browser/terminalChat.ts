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
	MakeRequest = 'workbench.action.terminal.chat.makeRequest',
	Cancel = 'workbench.action.terminal.chat.cancel',
	RunCommand = 'workbench.action.terminal.chat.runCommand',
	RunFirstCommand = 'workbench.action.terminal.chat.runFirstCommand',
	InsertCommand = 'workbench.action.terminal.chat.insertCommand',
	InsertFirstCommand = 'workbench.action.terminal.chat.insertFirstCommand',
	ViewInChat = 'workbench.action.terminal.chat.viewInChat',
	RerunRequest = 'workbench.action.terminal.chat.rerunRequest',
	ViewHiddenChatTerminals = 'workbench.action.terminal.chat.viewHiddenChatTerminals',
	OpenTerminalSettingsLink = 'workbench.action.terminal.chat.openTerminalSettingsLink',
	DisableSessionAutoApproval = 'workbench.action.terminal.chat.disableSessionAutoApproval',
	FocusMostRecentChatTerminalOutput = 'workbench.action.terminal.chat.focusMostRecentChatTerminalOutput',
	FocusMostRecentChatTerminal = 'workbench.action.terminal.chat.focusMostRecentChatTerminal',
	ToggleChatTerminalOutput = 'workbench.action.terminal.chat.toggleChatTerminalOutput',
	FocusChatInstanceAction = 'workbench.action.terminal.chat.focusChatInstance',
}

export const MENU_TERMINAL_CHAT_WIDGET_INPUT_SIDE_TOOLBAR = MenuId.for('terminalChatWidget');
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
	ChatHasTerminals = 'hasChatTerminals',
	ChatHasHiddenTerminals = 'hasHiddenChatTerminals',
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

	/** Has terminals created via chat */
	export const hasChatTerminals = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatHasTerminals, false, localize('terminalHasChatTerminals', "Whether there are any chat terminals."));

	/** Has hidden chat terminals */
	export const hasHiddenChatTerminals = new RawContextKey<boolean>(TerminalChatContextKeyStrings.ChatHasHiddenTerminals, false, localize('terminalHasHiddenChatTerminals', "Whether there are any hidden chat terminals."));
}
