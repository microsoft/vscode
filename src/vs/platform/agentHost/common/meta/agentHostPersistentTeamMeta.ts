/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isPlainRecord, parseAgentHostModelSelection } from '../agentHostModelSelection.js';
import type { IAgentHostPersistentTeamMember, IAgentHostPersistentTeamState, IAgentHostTeamTask } from '../agentHostPersistentTeam.js';
import { isAhpChatChannel, parseChatUri } from '../state/sessionState.js';

export const AgentHostPersistentTeamMetaKey = 'vscode.persistentTeam';
export const AgentHostPersistentTeamContinuationPrefix = 'vscode.persistentTeam.continuation.';

function isError(value: unknown): value is { code: string; message: string } {
	return isPlainRecord(value) && typeof value.code === 'string' && typeof value.message === 'string';
}

function isTeamTask(value: unknown, session: string, leadChat: string): value is IAgentHostTeamTask {
	if (!isPlainRecord(value) || typeof value.leadTurnId !== 'string' || !value.leadTurnId
		|| typeof value.state !== 'string' || !['working', 'waiting', 'reviewing', 'integrating', 'completed', 'blocked', 'cancelled'].includes(value.state)
		|| [value.leadPhase, value.requestedLeadPhase].some(phase => phase !== undefined && phase !== 'manager' && phase !== 'integration')
		|| !Array.isArray(value.assignments) || value.assignments.length > 2
		|| (value.error !== undefined && typeof value.error !== 'string')
		|| (value.leadEventId !== undefined && typeof value.leadEventId !== 'string')
		|| (value.assignmentReminderSent !== undefined && typeof value.assignmentReminderSent !== 'boolean')
		|| (value.reviewReminderSent !== undefined && typeof value.reviewReminderSent !== 'boolean')) {
		return false;
	}
	const roles = new Set<string>();
	const chats = new Set([leadChat]);
	return value.assignments.every(assignment => {
		if (!isPlainRecord(assignment) || (assignment.role !== 'worker' && assignment.role !== 'scout')
			|| typeof assignment.chat !== 'string' || parseChatUri(assignment.chat)?.session !== session
			|| roles.has(assignment.role) || chats.has(assignment.chat)
			|| typeof assignment.state !== 'string' || !['unassigned', 'queued', 'working', 'reported', 'blocked', 'removed'].includes(assignment.state)
			|| ['objective', 'deliverable', 'reviewFeedback', 'messageId', 'turnId', 'eventId', 'reportMessageId', 'error'].some(key => assignment[key] !== undefined && typeof assignment[key] !== 'string')
			|| (assignment.revision !== undefined && (typeof assignment.revision !== 'number' || !Number.isSafeInteger(assignment.revision) || assignment.revision < 1))
			|| (assignment.delivered !== undefined && typeof assignment.delivered !== 'boolean')
			|| (assignment.reviewed !== undefined && typeof assignment.reviewed !== 'boolean')
			|| (assignment.state === 'working' && !assignment.turnId)
			|| (assignment.state === 'queued' && !assignment.messageId)
			|| (assignment.state === 'reported' && (!assignment.turnId || !assignment.reportMessageId))) {
			return false;
		}
		roles.add(assignment.role);
		chats.add(assignment.chat);
		return true;
	});
}

/** Reads current role bindings, including the saved chat identities of the earlier prototype. */
export function readAgentHostPersistentTeamState(source: { readonly _meta?: Record<string, unknown> } | undefined): IAgentHostPersistentTeamState | undefined {
	const value = source?._meta?.[AgentHostPersistentTeamMetaKey];
	if (!isPlainRecord(value) || value.version !== 2
		|| typeof value.leadChat !== 'string' || !isAhpChatChannel(value.leadChat)
		|| typeof value.enabled !== 'boolean' || !Array.isArray(value.members)
		|| (value.state !== 'ready' && value.state !== 'unavailable' && value.state !== 'migrationRequired')
		|| (value.error !== undefined && !isError(value.error))) {
		return undefined;
	}
	const members: IAgentHostPersistentTeamMember[] = [];
	const session = parseChatUri(value.leadChat)?.session;
	if (!session) {
		return undefined;
	}
	if (value.task !== undefined && !isTeamTask(value.task, session, value.leadChat)) {
		return undefined;
	}
	const chats = new Set([value.leadChat]);
	const roles = new Set<string>();
	for (const member of value.members) {
		if (!isPlainRecord(member)) {
			return undefined;
		}
		// Previous generations stay in the ordinary chat catalog, not the current roster.
		if (member.availability === 'archived') {
			continue;
		}
		if ((member.role !== 'worker' && member.role !== 'scout')
			|| typeof member.chat !== 'string' || parseChatUri(member.chat)?.session !== session
			|| typeof member.enabled !== 'boolean' || (member.enabled && !value.enabled)
			|| chats.has(member.chat) || roles.has(member.role)
			|| (member.error !== undefined && !isError(member.error))) {
			return undefined;
		}
		try {
			members.push({
				role: member.role,
				chat: member.chat,
				enabled: member.enabled,
				model: parseAgentHostModelSelection(member.model),
				...(isError(member.error) ? { error: { code: member.error.code, message: member.error.message } } : {}),
			});
		} catch {
			return undefined;
		}
		chats.add(member.chat);
		roles.add(member.role);
	}
	return {
		version: 2,
		leadChat: value.leadChat,
		enabled: value.enabled,
		state: value.state === 'ready' ? 'ready' : 'unavailable',
		members,
		...(value.task !== undefined ? { task: value.task } : {}),
		...(isError(value.error) ? { error: { code: value.error.code, message: value.error.message } } : {}),
	};
}

export function toAgentHostPersistentTeamMeta(state: IAgentHostPersistentTeamState): Record<string, unknown> {
	return { [AgentHostPersistentTeamMetaKey]: state };
}
