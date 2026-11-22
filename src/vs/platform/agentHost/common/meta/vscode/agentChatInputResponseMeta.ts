/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ChatInputCompletedAction } from '../../state/protocol/channels-chat/actions.js';

/** Who settled an input request. Only a person's own interaction with the request's UI is attributed. */
export type AgentChatInputResponseSource = 'human_response';

/** Provenance of an input-request completion. */
export interface IAgentChatInputResponseMeta {
	readonly responseSource?: AgentChatInputResponseSource;
}

/**
 * {@link ChatInputCompletedAction} has no declared `_meta` field. The action is carried verbatim through the
 * protocol as JSON, so an extra bag survives the round-trip.
 */
type ChatInputCompletedActionWithMeta = ChatInputCompletedAction & { _meta?: Record<string, unknown> };

const responseSourceKey = 'agentHost.inputResponseSource';

/** Reads client-supplied provenance from a completion. An absent or unknown value omits attribution, not the response. */
export function readAgentChatInputResponseMeta(action: ChatInputCompletedAction): IAgentChatInputResponseMeta {
	return (action as ChatInputCompletedActionWithMeta)._meta?.[responseSourceKey] === 'human_response' ? { responseSource: 'human_response' } : {};
}

/**
 * Returns a copy of `action` marked as a person's own response. Use it only where a person settled the request
 * through its UI: a completion that follows cancellation, disposal, an automatic reply, or defaults submitted on the
 * person's behalf has the same shape and must stay unmarked.
 */
export function withHumanChatInputResponse<T extends ChatInputCompletedAction>(action: T): T {
	return { ...action, _meta: { ...(action as ChatInputCompletedActionWithMeta)._meta, [responseSourceKey]: 'human_response' } };
}
