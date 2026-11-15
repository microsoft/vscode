/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type { ITerminalChatSurfaceMeta, IEditorInlineChatSurfaceMeta, IChatSurfaceMeta } from './vscode/agentChatSurfaceMeta.js';
export { VSCODE_CHAT_SURFACE_META_KEY, readChatSurfaceMeta, withChatSurfaceMeta, createTerminalChatInstruction, createEditorInlineChatInstruction } from './vscode/agentChatSurfaceMeta.js';
