/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// HACK: Export chat parts as it's only partially encapsulated within the contrib. This file only
// exists because including it into terminalContribExports would cause a circular dependency on
// startup
export { TerminalChatContextKeys } from '../terminalContrib/chat/browser/terminalChat.js';
export { TerminalChatController } from '../terminalContrib/chat/browser/terminalChatController.js';
