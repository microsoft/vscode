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
const AgentHostOneTimeRunMetaKey = 'vscode.oneTimeRun';

/** Existing chat that receives a scheduled chat. The host neither creates nor owns its session. */
export interface IAgentHostScheduledChatConversation {
	readonly session: string;
	readonly chat: string;
}

/** Marks a definition or run as a scheduled chat. */
export interface IAgentHostScheduledChat {
	readonly conversation?: IAgentHostScheduledChatConversation;
}

/** Whether the host can deliver scheduled chats into an existing chat. */
export function supportsAgentHostScheduledChatExistingConversation(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostScheduledChatExistingConversationCapabilityMetaKey] === true;
}

/** Reads the scheduled-chat marker; `null` when present but malformed. */
export function getAgentHostScheduledChat(value: { readonly _meta?: Record<string, unknown> } | undefined): IAgentHostScheduledChat | null | undefined {
	const marker = value?._meta?.[AgentHostScheduledChatMetaKey];
	if (marker === undefined) {
		return undefined;
	}
	if (marker === true) {
		return {};
	}
	const conversation = marker && typeof marker === 'object' ? (marker as { conversation?: unknown }).conversation : undefined;
	const { session, chat } = conversation && typeof conversation === 'object' ? conversation as Record<string, unknown> : {};
	return typeof session === 'string' && typeof chat === 'string' ? { conversation: { session, chat } } : null;
}

/** Sets or clears the scheduled-chat marker while preserving unrelated metadata. */
export function withAgentHostScheduledChat(meta: Record<string, unknown> | undefined, scheduledChat: IAgentHostScheduledChat | undefined): Record<string, unknown> {
	const result = { ...meta };
	if (scheduledChat) {
		result[AgentHostScheduledChatMetaKey] = scheduledChat.conversation ? { conversation: { ...scheduledChat.conversation } } : true;
	} else {
		delete result[AgentHostScheduledChatMetaKey];
	}
	return result;
}

/** Run that consumed a one-time automation's occurrence. */
export function getAgentHostOneTimeRun(automation: AutomationEntry): string | undefined {
	const run = automation._meta?.[AgentHostOneTimeRunMetaKey];
	return typeof run === 'string' ? run : undefined;
}

export function withAgentHostOneTimeRun(meta: Record<string, unknown> | undefined, run: string): Record<string, unknown> {
	return { ...meta, [AgentHostOneTimeRunMetaKey]: run };
}

/**
 * The protocol's automation session origin has no `_meta`, so VS Code hosts
 * and clients exchange scheduled-chat provenance as this extra member.
 */
interface IAgentHostAutomationSessionOrigin {
	readonly purpose?: 'scheduledChat';
}

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
