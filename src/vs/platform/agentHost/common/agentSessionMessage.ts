/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../base/common/resources.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { readAgentMessageDelegationMeta, type IAgentMessageSessionDelegationMeta } from './meta/agentMessageDelegationMeta.js';
import { PendingMessageKind, type ChatState, type Message, type PendingMessage } from './state/sessionState.js';

export type AgentSessionMessageState =
	| { readonly status: 'pending'; readonly kind: PendingMessageKind; readonly message: Message }
	| { readonly status: 'processing'; readonly message: Message }
	| { readonly status: 'completed'; readonly message: Message };

/** Includes both legacy-slot and independently submitted steering messages. */
export function getPendingSteeringMessages(state: Pick<ChatState, 'steeringMessage' | 'steeringMessages'>): readonly PendingMessage[] {
	return state.steeringMessage ? [state.steeringMessage, ...state.steeringMessages ?? []] : state.steeringMessages ?? [];
}

/** Finds an inter-session message wherever it currently lives in a chat. */
export function findAgentSessionMessage(state: ChatState | undefined, messageId: string): AgentSessionMessageState | undefined {
	if (!state) {
		return undefined;
	}
	const steering = getPendingSteeringMessages(state).find(message => message.id === messageId);
	if (steering) {
		return { status: 'pending', kind: PendingMessageKind.Steering, message: steering.message };
	}
	const queued = state.queuedMessages?.find(message => message.id === messageId);
	if (queued) {
		return { status: 'pending', kind: PendingMessageKind.Queued, message: queued.message };
	}
	if (readAgentSessionMessageId(state.activeTurn?.message) === messageId) {
		return { status: 'processing', message: state.activeTurn!.message };
	}
	const completed = state.turns.findLast(turn => readAgentSessionMessageId(turn.message) === messageId);
	return completed ? { status: 'completed', message: completed.message } : undefined;
}

/** Reads message identity from validated delegation metadata. */
export function readAgentSessionMessageId(message: Message | undefined): string | undefined {
	const delegation = message ? readAgentMessageDelegationMeta(message) : undefined;
	return delegation && hasKey(delegation, { sourceSession: true }) ? delegation.messageId : undefined;
}

/** Verifies that a message belongs to the calling source chat. */
export function readOwnedAgentSessionMessage(message: Message, messageId: string, sourceChat: URI | undefined): IAgentMessageSessionDelegationMeta | undefined {
	const delegation = readAgentMessageDelegationMeta(message);
	if (!sourceChat || !delegation || !hasKey(delegation, { sourceSession: true }) || delegation.messageId !== messageId || !delegation.sourceChat) {
		return undefined;
	}
	return isEqual(URI.parse(delegation.sourceChat), sourceChat) ? delegation : undefined;
}
