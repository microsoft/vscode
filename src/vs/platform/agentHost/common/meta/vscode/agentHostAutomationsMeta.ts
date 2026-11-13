/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';
import type { AutomationDefinition, AutomationEntry } from '../../state/protocol/channels-automation/state.js';
import type { Message } from '../../state/protocol/channels-chat/state.js';

/** Initialize presence flag for autonomous execution support, independent of feature enablement and per-definition operations. */
export const AgentHostAutonomousAutomationsCapabilityMetaKey = 'vscode.autonomousAutomations';

/** Initialize presence flag for retaining or deleting an Automation's run history when the Automation is removed. */
export const AgentHostAutomationHistoryCapabilityMetaKey = 'vscode.automationHistory';
export const AgentHostAutomationHistoryReceiptsCapabilityMetaKey = 'vscode.automationHistoryReceipts';
export const AgentHostAutomationHistoryDeletionStateCapabilityMetaKey = 'vscode.automationHistoryDeletionState';

/** Initialize presence flag, and definition flag, for sending every run's message in the session of the previous run. */
export const AgentHostAutomationContinueSessionCapabilityMetaKey = 'vscode.automationContinueSession';

const AgentHostAutomationHistoryStateMetaKey = 'vscode.automationHistoryState';
const AgentHostAutomationScheduleKindMetaKey = 'vscode.automationScheduleKind';
const AgentHostAutomationRunMessageMetaKey = 'vscode.automationRun';

/**
 * For a definition, whether each run sends its message in the session of the Automation's previous run instead of a new
 * session; for an initialize result, whether the host supports that.
 */
export function hasAgentHostAutomationContinueSession(owner: AutomationDefinition | InitializeResult | undefined): boolean {
	return owner?._meta?.[AgentHostAutomationContinueSessionCapabilityMetaKey] === true;
}

/** Sets or clears the continue-session choice while preserving unrelated metadata. */
export function withAgentHostAutomationContinueSession(meta: Record<string, unknown> | undefined, continueSession: boolean): Record<string, unknown> {
	const result = { ...meta };
	if (continueSession) {
		result[AgentHostAutomationContinueSessionCapabilityMetaKey] = true;
	} else {
		delete result[AgentHostAutomationContinueSessionCapabilityMetaKey];
	}
	return result;
}

/** Tags the message an Automation run sends, so the host can tell the run's turn from other turns of a shared chat. */
export function withAgentHostAutomationRunMessage(message: Message, run: string): Message {
	return { ...message, _meta: { ...message._meta, [AgentHostAutomationRunMessageMetaKey]: run } };
}

/** The Automation run that sent `message`, if any. */
export function readAgentHostAutomationRunMessage(message: Message): string | undefined {
	const run = message._meta?.[AgentHostAutomationRunMessageMetaKey];
	return typeof run === 'string' ? run : undefined;
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
