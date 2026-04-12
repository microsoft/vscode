/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { localize } from '../../../../../nls.js';
import { MenuId } from '../../../../../platform/actions/common/actions.js';
import { RawContextKey } from '../../../../../platform/contextkey/common/contextkey.js';
export var TerminalChatCommandId;
(function (TerminalChatCommandId) {
    TerminalChatCommandId["Start"] = "workbench.action.terminal.chat.start";
    TerminalChatCommandId["Close"] = "workbench.action.terminal.chat.close";
    TerminalChatCommandId["MakeRequest"] = "workbench.action.terminal.chat.makeRequest";
    TerminalChatCommandId["Cancel"] = "workbench.action.terminal.chat.cancel";
    TerminalChatCommandId["RunCommand"] = "workbench.action.terminal.chat.runCommand";
    TerminalChatCommandId["RunFirstCommand"] = "workbench.action.terminal.chat.runFirstCommand";
    TerminalChatCommandId["InsertCommand"] = "workbench.action.terminal.chat.insertCommand";
    TerminalChatCommandId["InsertFirstCommand"] = "workbench.action.terminal.chat.insertFirstCommand";
    TerminalChatCommandId["ViewInChat"] = "workbench.action.terminal.chat.viewInChat";
    TerminalChatCommandId["RerunRequest"] = "workbench.action.terminal.chat.rerunRequest";
    TerminalChatCommandId["ViewHiddenChatTerminals"] = "workbench.action.terminal.chat.viewHiddenChatTerminals";
    TerminalChatCommandId["OpenTerminalSettingsLink"] = "workbench.action.terminal.chat.openTerminalSettingsLink";
    TerminalChatCommandId["DisableSessionAutoApproval"] = "workbench.action.terminal.chat.disableSessionAutoApproval";
    TerminalChatCommandId["FocusMostRecentChatTerminalOutput"] = "workbench.action.terminal.chat.focusMostRecentChatTerminalOutput";
    TerminalChatCommandId["FocusMostRecentChatTerminal"] = "workbench.action.terminal.chat.focusMostRecentChatTerminal";
    TerminalChatCommandId["ToggleChatTerminalOutput"] = "workbench.action.terminal.chat.toggleChatTerminalOutput";
    TerminalChatCommandId["FocusChatInstanceAction"] = "workbench.action.terminal.chat.focusChatInstance";
    TerminalChatCommandId["ContinueInBackground"] = "workbench.action.terminal.chat.continueInBackground";
})(TerminalChatCommandId || (TerminalChatCommandId = {}));
export const MENU_TERMINAL_CHAT_WIDGET_INPUT_SIDE_TOOLBAR = MenuId.for('terminalChatWidget');
export const MENU_TERMINAL_CHAT_WIDGET_STATUS = MenuId.for('terminalChatWidget.status');
export const MENU_TERMINAL_CHAT_WIDGET_TOOLBAR = MenuId.for('terminalChatWidget.toolbar');
export var TerminalChatContextKeyStrings;
(function (TerminalChatContextKeyStrings) {
    TerminalChatContextKeyStrings["ChatFocus"] = "terminalChatFocus";
    TerminalChatContextKeyStrings["ChatVisible"] = "terminalChatVisible";
    TerminalChatContextKeyStrings["ChatActiveRequest"] = "terminalChatActiveRequest";
    TerminalChatContextKeyStrings["ChatInputHasText"] = "terminalChatInputHasText";
    TerminalChatContextKeyStrings["ChatAgentRegistered"] = "terminalChatAgentRegistered";
    TerminalChatContextKeyStrings["ChatResponseEditorFocused"] = "terminalChatResponseEditorFocused";
    TerminalChatContextKeyStrings["ChatResponseContainsCodeBlock"] = "terminalChatResponseContainsCodeBlock";
    TerminalChatContextKeyStrings["ChatResponseContainsMultipleCodeBlocks"] = "terminalChatResponseContainsMultipleCodeBlocks";
    TerminalChatContextKeyStrings["ChatResponseSupportsIssueReporting"] = "terminalChatResponseSupportsIssueReporting";
    TerminalChatContextKeyStrings["ChatSessionResponseVote"] = "terminalChatSessionResponseVote";
    TerminalChatContextKeyStrings["ChatHasTerminals"] = "hasChatTerminals";
    TerminalChatContextKeyStrings["ChatHasHiddenTerminals"] = "hasHiddenChatTerminals";
})(TerminalChatContextKeyStrings || (TerminalChatContextKeyStrings = {}));
export var TerminalChatContextKeys;
(function (TerminalChatContextKeys) {
    /** Whether the chat widget is focused */
    TerminalChatContextKeys.focused = new RawContextKey("terminalChatFocus" /* TerminalChatContextKeyStrings.ChatFocus */, false, localize('chatFocusedContextKey', "Whether the chat view is focused."));
    /** Whether the chat widget is visible */
    TerminalChatContextKeys.visible = new RawContextKey("terminalChatVisible" /* TerminalChatContextKeyStrings.ChatVisible */, false, localize('chatVisibleContextKey', "Whether the chat view is visible."));
    /** Whether there is an active chat request */
    TerminalChatContextKeys.requestActive = new RawContextKey("terminalChatActiveRequest" /* TerminalChatContextKeyStrings.ChatActiveRequest */, false, localize('chatRequestActiveContextKey', "Whether there is an active chat request."));
    /** Whether the chat input has text */
    TerminalChatContextKeys.inputHasText = new RawContextKey("terminalChatInputHasText" /* TerminalChatContextKeyStrings.ChatInputHasText */, false, localize('chatInputHasTextContextKey', "Whether the chat input has text."));
    /** The chat response contains at least one code block */
    TerminalChatContextKeys.responseContainsCodeBlock = new RawContextKey("terminalChatResponseContainsCodeBlock" /* TerminalChatContextKeyStrings.ChatResponseContainsCodeBlock */, false, localize('chatResponseContainsCodeBlockContextKey', "Whether the chat response contains a code block."));
    /** The chat response contains multiple code blocks */
    TerminalChatContextKeys.responseContainsMultipleCodeBlocks = new RawContextKey("terminalChatResponseContainsMultipleCodeBlocks" /* TerminalChatContextKeyStrings.ChatResponseContainsMultipleCodeBlocks */, false, localize('chatResponseContainsMultipleCodeBlocksContextKey', "Whether the chat response contains multiple code blocks."));
    /** A chat agent exists for the terminal location */
    TerminalChatContextKeys.hasChatAgent = new RawContextKey("terminalChatAgentRegistered" /* TerminalChatContextKeyStrings.ChatAgentRegistered */, false, localize('chatAgentRegisteredContextKey', "Whether a chat agent is registered for the terminal location."));
    /** Has terminals created via chat */
    TerminalChatContextKeys.hasChatTerminals = new RawContextKey("hasChatTerminals" /* TerminalChatContextKeyStrings.ChatHasTerminals */, false, localize('terminalHasChatTerminals', "Whether there are any chat terminals."));
    /** Has hidden chat terminals */
    TerminalChatContextKeys.hasHiddenChatTerminals = new RawContextKey("hasHiddenChatTerminals" /* TerminalChatContextKeyStrings.ChatHasHiddenTerminals */, false, localize('terminalHasHiddenChatTerminals', "Whether there are any hidden chat terminals."));
})(TerminalChatContextKeys || (TerminalChatContextKeys = {}));
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidGVybWluYWxDaGF0LmpzIiwic291cmNlUm9vdCI6ImZpbGU6Ly8vaG9tZS9hL3dlYmNvZGUuaG9zdC92c2NvZGUvc3JjLyIsInNvdXJjZXMiOlsidnMvd29ya2JlbmNoL2NvbnRyaWIvdGVybWluYWxDb250cmliL2NoYXQvYnJvd3Nlci90ZXJtaW5hbENoYXQudHMiXSwibmFtZXMiOltdLCJtYXBwaW5ncyI6IkFBQUE7OztnR0FHZ0c7QUFFaEcsT0FBTyxFQUFFLFFBQVEsRUFBRSxNQUFNLHVCQUF1QixDQUFDO0FBQ2pELE9BQU8sRUFBRSxNQUFNLEVBQUUsTUFBTSxtREFBbUQsQ0FBQztBQUMzRSxPQUFPLEVBQUUsYUFBYSxFQUFFLE1BQU0seURBQXlELENBQUM7QUFFeEYsTUFBTSxDQUFOLElBQWtCLHFCQW1CakI7QUFuQkQsV0FBa0IscUJBQXFCO0lBQ3RDLHVFQUE4QyxDQUFBO0lBQzlDLHVFQUE4QyxDQUFBO0lBQzlDLG1GQUEwRCxDQUFBO0lBQzFELHlFQUFnRCxDQUFBO0lBQ2hELGlGQUF3RCxDQUFBO0lBQ3hELDJGQUFrRSxDQUFBO0lBQ2xFLHVGQUE4RCxDQUFBO0lBQzlELGlHQUF3RSxDQUFBO0lBQ3hFLGlGQUF3RCxDQUFBO0lBQ3hELHFGQUE0RCxDQUFBO0lBQzVELDJHQUFrRixDQUFBO0lBQ2xGLDZHQUFvRixDQUFBO0lBQ3BGLGlIQUF3RixDQUFBO0lBQ3hGLCtIQUFzRyxDQUFBO0lBQ3RHLG1IQUEwRixDQUFBO0lBQzFGLDZHQUFvRixDQUFBO0lBQ3BGLHFHQUE0RSxDQUFBO0lBQzVFLHFHQUE0RSxDQUFBO0FBQzdFLENBQUMsRUFuQmlCLHFCQUFxQixLQUFyQixxQkFBcUIsUUFtQnRDO0FBRUQsTUFBTSxDQUFDLE1BQU0sNENBQTRDLEdBQUcsTUFBTSxDQUFDLEdBQUcsQ0FBQyxvQkFBb0IsQ0FBQyxDQUFDO0FBQzdGLE1BQU0sQ0FBQyxNQUFNLGdDQUFnQyxHQUFHLE1BQU0sQ0FBQyxHQUFHLENBQUMsMkJBQTJCLENBQUMsQ0FBQztBQUN4RixNQUFNLENBQUMsTUFBTSxpQ0FBaUMsR0FBRyxNQUFNLENBQUMsR0FBRyxDQUFDLDRCQUE0QixDQUFDLENBQUM7QUFFMUYsTUFBTSxDQUFOLElBQWtCLDZCQWFqQjtBQWJELFdBQWtCLDZCQUE2QjtJQUM5QyxnRUFBK0IsQ0FBQTtJQUMvQixvRUFBbUMsQ0FBQTtJQUNuQyxnRkFBK0MsQ0FBQTtJQUMvQyw4RUFBNkMsQ0FBQTtJQUM3QyxvRkFBbUQsQ0FBQTtJQUNuRCxnR0FBK0QsQ0FBQTtJQUMvRCx3R0FBdUUsQ0FBQTtJQUN2RSwwSEFBeUYsQ0FBQTtJQUN6RixrSEFBaUYsQ0FBQTtJQUNqRiw0RkFBMkQsQ0FBQTtJQUMzRCxzRUFBcUMsQ0FBQTtJQUNyQyxrRkFBaUQsQ0FBQTtBQUNsRCxDQUFDLEVBYmlCLDZCQUE2QixLQUE3Qiw2QkFBNkIsUUFhOUM7QUFHRCxNQUFNLEtBQVcsdUJBQXVCLENBNEJ2QztBQTVCRCxXQUFpQix1QkFBdUI7SUFFdkMseUNBQXlDO0lBQzVCLCtCQUFPLEdBQUcsSUFBSSxhQUFhLG9FQUFtRCxLQUFLLEVBQUUsUUFBUSxDQUFDLHVCQUF1QixFQUFFLG1DQUFtQyxDQUFDLENBQUMsQ0FBQztJQUUxSyx5Q0FBeUM7SUFDNUIsK0JBQU8sR0FBRyxJQUFJLGFBQWEsd0VBQXFELEtBQUssRUFBRSxRQUFRLENBQUMsdUJBQXVCLEVBQUUsbUNBQW1DLENBQUMsQ0FBQyxDQUFDO0lBRTVLLDhDQUE4QztJQUNqQyxxQ0FBYSxHQUFHLElBQUksYUFBYSxvRkFBMkQsS0FBSyxFQUFFLFFBQVEsQ0FBQyw2QkFBNkIsRUFBRSwwQ0FBMEMsQ0FBQyxDQUFDLENBQUM7SUFFck0sc0NBQXNDO0lBQ3pCLG9DQUFZLEdBQUcsSUFBSSxhQUFhLGtGQUEwRCxLQUFLLEVBQUUsUUFBUSxDQUFDLDRCQUE0QixFQUFFLGtDQUFrQyxDQUFDLENBQUMsQ0FBQztJQUUxTCx5REFBeUQ7SUFDNUMsaURBQXlCLEdBQUcsSUFBSSxhQUFhLDRHQUF1RSxLQUFLLEVBQUUsUUFBUSxDQUFDLHlDQUF5QyxFQUFFLGtEQUFrRCxDQUFDLENBQUMsQ0FBQztJQUVqUCxzREFBc0Q7SUFDekMsMERBQWtDLEdBQUcsSUFBSSxhQUFhLDhIQUFnRixLQUFLLEVBQUUsUUFBUSxDQUFDLGtEQUFrRCxFQUFFLDBEQUEwRCxDQUFDLENBQUMsQ0FBQztJQUVwUixvREFBb0Q7SUFDdkMsb0NBQVksR0FBRyxJQUFJLGFBQWEsd0ZBQTZELEtBQUssRUFBRSxRQUFRLENBQUMsK0JBQStCLEVBQUUsK0RBQStELENBQUMsQ0FBQyxDQUFDO0lBRTdOLHFDQUFxQztJQUN4Qix3Q0FBZ0IsR0FBRyxJQUFJLGFBQWEsMEVBQTBELEtBQUssRUFBRSxRQUFRLENBQUMsMEJBQTBCLEVBQUUsdUNBQXVDLENBQUMsQ0FBQyxDQUFDO0lBRWpNLGdDQUFnQztJQUNuQiw4Q0FBc0IsR0FBRyxJQUFJLGFBQWEsc0ZBQWdFLEtBQUssRUFBRSxRQUFRLENBQUMsZ0NBQWdDLEVBQUUsOENBQThDLENBQUMsQ0FBQyxDQUFDO0FBQzNOLENBQUMsRUE1QmdCLHVCQUF1QixLQUF2Qix1QkFBdUIsUUE0QnZDIn0=