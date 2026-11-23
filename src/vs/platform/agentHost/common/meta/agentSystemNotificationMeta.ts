/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export type { AgentFusionProgressStatus, IAgentSystemNotificationHookMeta, IAgentSystemNotificationMeta, IAgentWorkspaceTransitionRecord } from './vscode/agentSystemNotificationMeta.js';
export { AgentHookOutcome, AgentSystemNotificationKind, AgentSystemNotificationWorkspaceKind, AgentSystemNotificationSeverity, readAgentSystemNotificationMeta, toAgentSystemNotificationMeta, serializeAgentWorkspaceTransition, parseAgentWorkspaceTransition } from './vscode/agentSystemNotificationMeta.js';
