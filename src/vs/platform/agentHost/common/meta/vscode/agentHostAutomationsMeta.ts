/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';
import type { AutomationDefinition, AutomationEntry } from '../../state/protocol/channels-automation/state.js';
import { SessionOriginKind, type AutomationSessionOrigin, type SessionOrigin } from '../../state/protocol/channels-session/state.js';
import { isUUID } from '../../../../../base/common/uuid.js';

/** Initialize presence flag for autonomous execution support, independent of feature enablement and per-definition operations. */
export const AgentHostAutonomousAutomationsCapabilityMetaKey = 'vscode.autonomousAutomations';

/** Initialize presence flag for retaining or deleting an Automation's run history when the Automation is removed. */
export const AgentHostAutomationHistoryCapabilityMetaKey = 'vscode.automationHistory';
export const AgentHostAutomationHistoryReceiptsCapabilityMetaKey = 'vscode.automationHistoryReceipts';
export const AgentHostAutomationHistoryDeletionStateCapabilityMetaKey = 'vscode.automationHistoryDeletionState';

const AgentHostAutomationHistoryStateMetaKey = 'vscode.automationHistoryState';
const AgentHostAutomationScheduleKindMetaKey = 'vscode.automationScheduleKind';
const AgentHostAutomationCreationIdMetaKey = 'vscode.automationCreationId';

/** Reads the client-owned handoff receipt without interpreting a host resource URI. */
export function getAgentHostAutomationCreationId(definition: AutomationDefinition): string | undefined {
	const id = definition._meta?.[AgentHostAutomationCreationIdMetaKey];
	return typeof id === 'string' && isUUID(id) ? id : undefined;
}

/** Preserves the handoff receipt across edits and reconnects. */
export function withAgentHostAutomationCreationId(meta: Record<string, unknown> | undefined, creationId: string): Record<string, unknown> {
	return { ...meta, [AgentHostAutomationCreationIdMetaKey]: creationId };
}

/** Reads the explicitly chosen CRON editing form without changing runtime schedule semantics. */
export function getAgentHostAutomationScheduleKind(definition: AutomationDefinition): 'cron' | undefined {
	return definition._meta?.[AgentHostAutomationScheduleKindMetaKey] === 'cron' ? 'cron' : undefined;
}

/** Sets or clears the chosen CRON editing form while preserving unrelated metadata. */
export function withAgentHostAutomationScheduleKind(meta: Record<string, unknown> | undefined, kind: 'cron' | undefined): Record<string, unknown> {
	const result = { ...meta };
	if (kind === undefined) {
		delete result[AgentHostAutomationScheduleKindMetaKey];
	} else {
		result[AgentHostAutomationScheduleKindMetaKey] = kind;
	}
	return result;
}

/** `retained` entries are inert owners of preserved run history; `deleting` entries have a history deletion in progress or pending retry. */
export type AgentHostAutomationHistoryState = 'retained' | 'deleting';

/** Whether Automation execution is independent of a client activation or migration handshake. */
export function supportsAgentHostAutonomousAutomations(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostAutonomousAutomationsCapabilityMetaKey] === true;
}

/** Whether the host can keep or delete an Automation's run history on removal. */
export function supportsAgentHostAutomationHistory(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostAutomationHistoryCapabilityMetaKey] === true;
}

/** Whether the host durably receipts history deletion until the client acknowledges it. */
export function supportsAgentHostAutomationHistoryReceipts(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostAutomationHistoryReceiptsCapabilityMetaKey] === true;
}

/** Whether the host distinguishes active and interrupted history deletion through the Remove operation. */
export function supportsAgentHostAutomationHistoryDeletionState(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostAutomationHistoryDeletionStateCapabilityMetaKey] === true;
}

/** Reads the namespaced history state of an Automation entry, ignoring unrecognized values. */
export function getAgentHostAutomationHistoryState(automation: AutomationEntry): AgentHostAutomationHistoryState | undefined {
	const state = automation._meta?.[AgentHostAutomationHistoryStateMetaKey];
	return state === 'retained' || state === 'deleting' ? state : undefined;
}

/** Returns a copy of meta with the history state set, preserving unrelated keys. */
export function withAgentHostAutomationHistoryState(meta: Record<string, unknown> | undefined, state: AgentHostAutomationHistoryState): Record<string, unknown> {
	return { ...meta, [AgentHostAutomationHistoryStateMetaKey]: state };
}

/** Initialize presence flag for scheduled chats that target an existing chat. */
export const AgentHostScheduledChatExistingConversationCapabilityMetaKey = 'vscode.scheduledChatExistingConversation';

const AgentHostScheduledChatMetaKey = 'vscode.scheduledChat';
const AgentHostScheduledChatConversationMetaKey = 'vscode.scheduledChatConversation';
const AgentHostOneTimeReceiptsMetaKey = 'vscode.oneTimeReceipts';

/** Existing chat that receives a scheduled chat. The host neither creates nor owns its session. */
export interface IAgentHostScheduledChatConversation {
	readonly session: string;
	readonly chat: string;
}

/** Host-owned one-time receipts, retained after run history is pruned. */
export interface IAgentHostOneTimeReceipts {
	/** Run that consumed the one-time occurrence. */
	readonly run?: string;
	/** When the run's message was accepted for dispatch. */
	readonly dispatchedAt?: string;
	/** When the run positively failed before its message was submitted. */
	readonly dispatchRejectedAt?: string;
}

/** Whether the host can deliver scheduled chats into an existing chat. */
export function supportsAgentHostScheduledChatExistingConversation(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostScheduledChatExistingConversationCapabilityMetaKey] === true;
}

/** Whether a definition or run is a VS Code scheduled chat rather than an ordinary automation. */
export function isAgentHostScheduledChat(value: { readonly _meta?: Record<string, unknown> } | undefined): boolean {
	return value?._meta?.[AgentHostScheduledChatMetaKey] === true;
}

/** Sets or clears the scheduled-chat marker while preserving unrelated metadata. */
export function withAgentHostScheduledChat(meta: Record<string, unknown> | undefined, scheduledChat: boolean): Record<string, unknown> {
	const result = { ...meta };
	if (scheduledChat) {
		result[AgentHostScheduledChatMetaKey] = true;
	} else {
		delete result[AgentHostScheduledChatMetaKey];
	}
	return result;
}

export function getAgentHostScheduledChatConversation(definition: AutomationDefinition): IAgentHostScheduledChatConversation | undefined {
	const value = definition._meta?.[AgentHostScheduledChatConversationMetaKey];
	if (!value || typeof value !== 'object') {
		return undefined;
	}
	const { session, chat } = value as Record<string, unknown>;
	return typeof session === 'string' && typeof chat === 'string' ? { session, chat } : undefined;
}

/** Sets or clears the existing-chat target while preserving unrelated metadata. */
export function withAgentHostScheduledChatConversation(meta: Record<string, unknown> | undefined, conversation: IAgentHostScheduledChatConversation | undefined): Record<string, unknown> {
	const result = { ...meta };
	if (conversation) {
		result[AgentHostScheduledChatConversationMetaKey] = { session: conversation.session, chat: conversation.chat };
	} else {
		delete result[AgentHostScheduledChatConversationMetaKey];
	}
	return result;
}

export function getAgentHostOneTimeReceipts(automation: AutomationEntry): IAgentHostOneTimeReceipts {
	const value = automation._meta?.[AgentHostOneTimeReceiptsMetaKey];
	if (!value || typeof value !== 'object') {
		return {};
	}
	const { run, dispatchedAt, dispatchRejectedAt } = value as Record<string, unknown>;
	return {
		...(typeof run === 'string' ? { run } : {}),
		...(typeof dispatchedAt === 'string' ? { dispatchedAt } : {}),
		...(typeof dispatchRejectedAt === 'string' ? { dispatchRejectedAt } : {}),
	};
}

export function withAgentHostOneTimeReceipts(meta: Record<string, unknown> | undefined, receipts: IAgentHostOneTimeReceipts): Record<string, unknown> {
	return { ...meta, [AgentHostOneTimeReceiptsMetaKey]: { ...receipts } };
}

/**
 * Automation session origin carrying VS Code's scheduled-chat provenance.
 * The protocol's automation session origin has no `_meta`, so VS Code hosts and clients
 * exchange this extra member directly.
 */
export interface IAgentHostAutomationSessionOrigin {
	readonly purpose?: 'scheduledChat';
}

/** Creates an automation session origin, marking scheduled chats for VS Code clients. */
export function agentHostAutomationSessionOrigin(automation: string, run: string, scheduledChat: boolean): AutomationSessionOrigin {
	const origin: AutomationSessionOrigin & IAgentHostAutomationSessionOrigin = {
		kind: SessionOriginKind.Automation,
		automation,
		run,
		...(scheduledChat ? { purpose: 'scheduledChat' as const } : {}),
	};
	return origin;
}

export function isAgentHostScheduledChatOrigin(origin: SessionOrigin | undefined): boolean {
	return origin?.kind === SessionOriginKind.Automation && (origin as IAgentHostAutomationSessionOrigin).purpose === 'scheduledChat';
}
