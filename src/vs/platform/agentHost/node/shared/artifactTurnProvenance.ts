/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { hasKey } from '../../../../base/common/types.js';
import { readArtifactIntegrationRun, readArtifactIntegrationRunInitiator } from '../../common/meta/agentHostArtifactIntegrationMeta.js';
import { isAgentMergeMessage } from '../../common/meta/agentMergeMessageMeta.js';
import { readAgentMessageDelegationMeta } from '../../common/meta/agentMessageDelegationMeta.js';
import { ChatOriginKind, MessageKind, type ChatState, type Message } from '../../common/state/sessionState.js';
import type { AgentHostStateManager } from '../agentHostStateManager.js';

/** Who ultimately started a turn, after following delegated messages and spawned chats back to their source. */
export const enum ArtifactTurnInitiator {
	Person = 'person',
	ScheduledAutomation = 'scheduledAutomation',
	ArtifactAutomation = 'artifactAutomation',
	AgentMerge = 'agentMerge',
	/** The source could not be established, so the turn is treated as automated. */
	Unknown = 'unknown',
}

const MAX_PROVENANCE_DEPTH = 8;

/** The turn a chat's current turn ultimately acts for, and who started it. */
export interface IArtifactTurnSource {
	readonly initiator: ArtifactTurnInitiator;
	/** The chat and turn the chain ends at; absent when it could not be followed. */
	readonly chat?: string;
	readonly turnId?: string;
}

/** Resolves who started the chat's current turn, following delegated messages and spawned chats to their source. */
export function getArtifactTurnSource(stateManager: AgentHostStateManager, chat: string): IArtifactTurnSource {
	return resolveSource(stateManager, chat, stateManager.getActiveTurnId(chat), new Set());
}

/**
 * Whether a turn may run artifact actions, turn on automation, or remove recorded artifacts. Only turns that trace
 * back to a person or a scheduled automation may; anything else, including an unknown source, is refused.
 */
export function canChangeArtifactsInTurn(initiator: ArtifactTurnInitiator): boolean {
	return initiator === ArtifactTurnInitiator.Person || initiator === ArtifactTurnInitiator.ScheduledAutomation;
}

function resolveSource(stateManager: AgentHostStateManager, chat: string, turnId: string | undefined, visited: Set<string>): IArtifactTurnSource {
	const key = JSON.stringify([chat, turnId]);
	if (!turnId || visited.has(key) || visited.size >= MAX_PROVENANCE_DEPTH) {
		return { initiator: ArtifactTurnInitiator.Unknown };
	}
	visited.add(key);
	// A chat spawned by a tool call (such as a subagent) acts for the turn running that tool call, whatever its own message claims.
	const origin = stateManager.getChatOrigin(chat);
	if (origin?.kind === ChatOriginKind.Tool) {
		return resolveSource(stateManager, origin.chat, stateManager.getActiveTurnId(origin.chat), visited);
	}
	const message = findTurnMessage(stateManager.getChatState(chat), turnId);
	if (!message) {
		return { initiator: ArtifactTurnInitiator.Unknown };
	}
	const source = (initiator: ArtifactTurnInitiator): IArtifactTurnSource => ({ initiator, chat, turnId });
	switch (message.origin.kind) {
		case MessageKind.User:
			return source(ArtifactTurnInitiator.Person);
		case MessageKind.Automation:
			return source(ArtifactTurnInitiator.ScheduledAutomation);
		case MessageKind.SystemNotification:
			if (readArtifactIntegrationRun(message) !== undefined) {
				// A prompt action a person chose acts for them; runs without a recorded initiator count as automated.
				const runInitiator = readArtifactIntegrationRunInitiator(message);
				return source(runInitiator === 'user' ? ArtifactTurnInitiator.Person
					: runInitiator === 'agent' ? ArtifactTurnInitiator.Unknown
						: ArtifactTurnInitiator.ArtifactAutomation);
			}
			return source(isAgentMergeMessage(message) ? ArtifactTurnInitiator.AgentMerge : ArtifactTurnInitiator.Unknown);
		case MessageKind.Agent:
		case MessageKind.Tool: {
			// Delegated messages act for the turn that sent them.
			const delegation = readAgentMessageDelegationMeta(message);
			return delegation && hasKey(delegation, { sourceSession: true }) && delegation.sourceChat && delegation.sourceTurnId
				? resolveSource(stateManager, delegation.sourceChat, delegation.sourceTurnId, visited)
				: { initiator: ArtifactTurnInitiator.Unknown };
		}
		default:
			return { initiator: ArtifactTurnInitiator.Unknown };
	}
}

function findTurnMessage(state: ChatState | undefined, turnId: string): Message | undefined {
	return state?.activeTurn?.id === turnId ? state.activeTurn.message : state?.turns.find(turn => turn.id === turnId)?.message;
}
