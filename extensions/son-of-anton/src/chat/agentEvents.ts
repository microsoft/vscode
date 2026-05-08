/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// WHY: AgentEvent lives under src/agents/ so BaseAgent / OrchestratorAgent can
// reference it without forming a cycle (chat/ already imports from agents/).
// This module preserves the original import path for chat-side consumers.
export { AgentEvent, AgentPlan, AgentPlanSubtask } from 'son-of-anton-core/agents/agentEvents';
