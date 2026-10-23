/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';

/** Initialize capability: the host owns a Chatpad (`vscode/getChatpad`, `vscode/appendToChatpad`). */
export const AgentHostChatpadCapabilityMetaKey = 'vscode.chatpad';

/**
 * Session type flag, in `createSession` `_meta` and in the session's `_meta`: the session is the host's Chatpad
 * chat. The host types its session as the Chatpad in place of a session without a workspace.
 */
export const AgentHostChatpadSessionMetaKey = 'vscode.chatpadSession';

/** Whether the host owns a Chatpad. */
export function supportsAgentHostChatpad(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostChatpadCapabilityMetaKey] === true;
}

/** Whether `createSession` or session metadata is the Chatpad chat's; anything but `true` means it isn't. */
export function readChatpadSessionMeta(meta: Record<string, unknown> | undefined): boolean {
	return meta?.[AgentHostChatpadSessionMetaKey] === true;
}

/** Returns `createSession` or session metadata typed as the Chatpad chat's. */
export function withChatpadSessionMeta(meta: Record<string, unknown> | undefined): Record<string, unknown> {
	return { ...meta, [AgentHostChatpadSessionMetaKey]: true };
}
