/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { InitializeResult } from '../state/protocol/common/commands.js';
import type { AutomationEntry } from '../state/protocol/channels-automation/state.js';

/** Initialize presence flag for autonomous execution support, independent of feature enablement and per-definition operations. */
export const AgentHostAutonomousAutomationsCapabilityMetaKey = 'vscode.autonomousAutomations';
export const AgentHostAutomationHistoryCapabilityMetaKey = 'vscode.automationHistory';

const automationHistoryStateKey = 'vscode.automationHistoryState';

export type AgentHostAutomationHistoryState = 'retained' | 'deleting';

/** Whether Automation execution is independent of a client activation or migration handshake. */
export function supportsAgentHostAutonomousAutomations(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostAutonomousAutomationsCapabilityMetaKey] === true;
}

export function supportsAgentHostAutomationHistory(result: InitializeResult | undefined): boolean {
	return result?._meta?.[AgentHostAutomationHistoryCapabilityMetaKey] === true;
}

export function readAgentHostAutomationHistoryState(automation: AutomationEntry): AgentHostAutomationHistoryState | undefined {
	const state = automation._meta?.[automationHistoryStateKey];
	return state === 'retained' || state === 'deleting' ? state : undefined;
}

export function withAgentHostAutomationHistoryState(automation: AutomationEntry, state: AgentHostAutomationHistoryState): AutomationEntry {
	return { ...automation, _meta: { ...automation._meta, [automationHistoryStateKey]: state } };
}
