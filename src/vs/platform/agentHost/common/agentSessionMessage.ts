/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isEqual } from '../../../base/common/resources.js';
import { hasKey } from '../../../base/common/types.js';
import { URI } from '../../../base/common/uri.js';
import { readAgentMessageDelegationMeta, type IAgentMessageSessionDelegationMeta } from './meta/agentMessageDelegationMeta.js';
import { isHostNoticeTurn, MessageKind, PendingMessageKind, type AgentSelection, type ChatState, type Message, type PendingMessage } from './state/sessionState.js';

export type AgentSessionMessageState =
	| { readonly status: 'pending'; readonly kind: PendingMessageKind; readonly message: Message }
	| { readonly status: 'processing'; readonly message: Message }
	| { readonly status: 'completed'; readonly message: Message };

/** Lists pending steering once, preferring the mixed queue over its legacy mirror. */
export function getPendingSteeringMessages(state: Pick<ChatState, 'steeringMessage' | 'queuedMessages'>): readonly PendingMessage[] {
	const steering = state.queuedMessages?.filter(message => message.kind === PendingMessageKind.Steering) ?? [];
	const legacy = state.steeringMessage;
	return legacy && !state.queuedMessages?.some(message => message.id === legacy.id) ? [legacy, ...steering] : steering;
}

/**
 * The custom agent the chat's latest turn runs with. A turn applies the agent its message carries
 * and a message without one switches the chat to the default agent, so a message the host writes
 * for an existing chat carries this to keep the agent the chat is using. Host notices never reach
 * the provider, which keeps running the agent of the turn before them, so they are skipped.
 */
export function getLatestTurnAgent(state: Pick<ChatState, 'activeTurn' | 'turns'> | undefined): AgentSelection | undefined {
	if (state?.activeTurn && !isHostNoticeTurn(state.activeTurn)) {
		return state.activeTurn.message.agent;
	}
	return state?.turns.findLast(turn => !isHostNoticeTurn(turn))?.message.agent;
}

/** Origins whose messages keep the chat's agent; see {@link withLatestTurnAgent}. */
const inheritsLatestTurnAgent: ReadonlySet<MessageKind> = new Set([MessageKind.Agent, MessageKind.SystemNotification, MessageKind.Automation]);

/**
 * Gives a message that another agent, a system notification or an automation writes for an
 * existing chat the agent the chat runs with ({@link getLatestTurnAgent}), unless it names one.
 * User messages are returned unchanged: a user message without an agent switches the chat to the
 * default agent.
 */
export function withLatestTurnAgent(message: Message, state: Pick<ChatState, 'activeTurn' | 'turns'> | undefined): Message {
	if (message.agent || !inheritsLatestTurnAgent.has(message.origin.kind)) {
		return message;
	}
	const agent = getLatestTurnAgent(state);
	return agent ? { ...message, agent } : message;
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
