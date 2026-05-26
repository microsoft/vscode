/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// HACK: Export some chat-specific symbols from `terminalContrib/` that are depended upon elsewhere.
// These are soft layer breakers between `terminal/` and `terminalContrib/` but there are
// difficulties in removing the dependency. These are explicitly defined here to avoid an eslint
// line override.
export { MENU_CHAT_TERMINAL_TOOL_PROGRESS, TerminalChatContextKeys } from '../terminalContrib/chat/browser/terminalChat.js';
export { RunInTerminalTool } from '../terminalContrib/chatAgentTools/browser/tools/runInTerminalTool.js';
