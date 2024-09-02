/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This is a one-off/safe import, to expose to outside contfibs as in general we don't want them
// to touch terminalContrib either.
// eslint-disable-next-line local/code-import-patterns
export { TerminalChatController } from '../../terminalContrib/chat/browser/terminalChatController.js';
// eslint-disable-next-line local/code-import-patterns
export { TerminalChatContextKeys } from '../../terminalContrib/chat/browser/terminalChat.js';
