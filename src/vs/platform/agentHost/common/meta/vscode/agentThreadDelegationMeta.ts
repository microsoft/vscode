/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { isObject } from '../../../../../base/common/types.js';

const THREAD_DELEGATION_META_KEY = 'vscode.threadDelegation';

export interface IAgentThreadDelegationParticipant {
	readonly id: string;
	readonly name: string;
	readonly mention: string;
	readonly agentUri?: string;
	readonly primary: boolean;
}

export interface IAgentThreadDelegationTarget {
	readonly id: string;
	readonly name: string;
	readonly mention: string;
	readonly sessionResource: string;
}

export interface IAgentThreadDelegationMetadata {
	readonly threadId: string;
	readonly threadName: string;
	readonly participants: readonly IAgentThreadDelegationParticipant[];
	readonly primaryParticipantId: string;
	readonly threads: readonly IAgentThreadDelegationTarget[];
}

interface IHasThreadDelegationMeta {
	readonly _meta?: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return isObject(value);
}

export function createAgentThreadDelegationMeta(metadata: IAgentThreadDelegationMetadata): Record<string, unknown> {
	return { [THREAD_DELEGATION_META_KEY]: metadata };
}

export function readAgentThreadDelegationMeta(source: IHasThreadDelegationMeta): IAgentThreadDelegationMetadata | undefined {
	const value = source._meta?.[THREAD_DELEGATION_META_KEY];
	if (!isRecord(value)
		|| typeof value.threadId !== 'string'
		|| typeof value.threadName !== 'string'
		|| typeof value.primaryParticipantId !== 'string'
		|| !Array.isArray(value.participants)
		|| !Array.isArray(value.threads)) {
		return undefined;
	}
	const participants = value.participants.filter((participant: unknown): participant is IAgentThreadDelegationParticipant =>
		isRecord(participant)
		&& typeof participant.id === 'string'
		&& typeof participant.name === 'string'
		&& typeof participant.mention === 'string'
		&& (participant.agentUri === undefined || typeof participant.agentUri === 'string')
		&& typeof participant.primary === 'boolean'
	);
	const threads = value.threads.filter((thread: unknown): thread is IAgentThreadDelegationTarget =>
		isRecord(thread)
		&& typeof thread.id === 'string'
		&& typeof thread.name === 'string'
		&& typeof thread.mention === 'string'
		&& typeof thread.sessionResource === 'string'
	);
	if (participants.length !== value.participants.length || threads.length !== value.threads.length) {
		return undefined;
	}
	return {
		threadId: value.threadId,
		threadName: value.threadName,
		participants,
		primaryParticipantId: value.primaryParticipantId,
		threads,
	};
}
