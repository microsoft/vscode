/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { ModelSelection } from './state/sessionState.js';

export type AgentHostPersistentTeamRole = 'worker' | 'scout';
export type AgentHostTeamLeadPhase = 'manager' | 'integration';

export type AgentHostTeamWorkRequest =
	| { readonly action: 'assign'; readonly role: AgentHostPersistentTeamRole; readonly objective: string; readonly deliverable: string }
	| { readonly action: 'review'; readonly role: AgentHostPersistentTeamRole; readonly reportId: string; readonly accept: boolean; readonly feedback: string }
	| { readonly action: 'phase'; readonly phase: AgentHostTeamLeadPhase };

export interface IAgentHostTeamAssignment {
	readonly role: AgentHostPersistentTeamRole;
	readonly chat: string;
	readonly state: 'unassigned' | 'queued' | 'working' | 'reported' | 'blocked' | 'removed';
	readonly objective?: string;
	readonly deliverable?: string;
	readonly revision?: number;
	readonly messageId?: string;
	readonly turnId?: string;
	readonly eventId?: string;
	readonly reportMessageId?: string;
	readonly delivered?: boolean;
	readonly reviewed?: boolean;
	readonly reviewFeedback?: string;
	readonly error?: string;
}

/** References ordinary chat turns and queued reports, not a separate transcript. */
export interface IAgentHostTeamTask {
	readonly leadTurnId: string;
	readonly leadEventId?: string;
	readonly state: 'working' | 'waiting' | 'reviewing' | 'integrating' | 'completed' | 'blocked' | 'cancelled';
	readonly leadPhase?: AgentHostTeamLeadPhase;
	readonly requestedLeadPhase?: AgentHostTeamLeadPhase;
	readonly assignments: readonly IAgentHostTeamAssignment[];
	readonly assignmentReminderSent?: boolean;
	readonly reviewReminderSent?: boolean;
	readonly error?: string;
}

/** A durable role identity; activity and approvals come from its ordinary chat. */
export interface IAgentHostPersistentTeamMember {
	readonly role: AgentHostPersistentTeamRole;
	readonly chat: string;
	readonly enabled: boolean;
	readonly model: ModelSelection;
	readonly error?: { readonly code: string; readonly message: string };
}

/** Namespaced session metadata, also returned by the persistent-team extension commands. */
export interface IAgentHostPersistentTeamState {
	readonly version: 2;
	readonly leadChat: string;
	readonly enabled: boolean;
	readonly state: 'ready' | 'unavailable';
	readonly members: readonly IAgentHostPersistentTeamMember[];
	readonly task?: IAgentHostTeamTask;
	readonly error?: { readonly code: string; readonly message: string };
}

export interface IAgentHostPersistentTeamAddress {
	readonly session: string;
	readonly leadChat: string;
}

export interface IAgentHostPersistentTeamReset extends IAgentHostPersistentTeamAddress {
	readonly role: AgentHostPersistentTeamRole;
	readonly expectedMemberChat: string;
}
