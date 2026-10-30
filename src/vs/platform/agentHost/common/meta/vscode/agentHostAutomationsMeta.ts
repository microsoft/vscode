/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../../state/protocol/common/commands.js';
import type { AutomationEntry } from '../../state/protocol/channels-automation/state.js';

/** Initialize presence flag for autonomous execution support, independent of feature enablement and per-definition operations. */
export const AgentHostAutonomousAutomationsCapabilityMetaKey = 'vscode.autonomousAutomations';

/** Initialize presence flag for retaining or deleting an Automation's run history when the Automation is removed. */
export const AgentHostAutomationHistoryCapabilityMetaKey = 'vscode.automationHistory';
export const AgentHostAutomationHistoryReceiptsCapabilityMetaKey = 'vscode.automationHistoryReceipts';
export const AgentHostAutomationHistoryDeletionStateCapabilityMetaKey = 'vscode.automationHistoryDeletionState';

const AgentHostAutomationHistoryStateMetaKey = 'vscode.automationHistoryState';

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
