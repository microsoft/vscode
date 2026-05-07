/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * A subtask description as surfaced to the chat UI when the orchestrator
 * proposes a plan.
 */
export interface AgentPlanSubtask {
	readonly instruction: string;
	readonly assignee: string;
	readonly scopeFiles: readonly string[];
	readonly dependencies: readonly string[];
}

export interface AgentPlan {
	readonly subtasks: readonly AgentPlanSubtask[];
}

/**
 * Events the agent stack emits to the chat surface. Mirrors the public
 * semantics of OrchestratorAgent.handleChatRequest plus per-specialist
 * streaming so the webview can render plan/subtask cards alongside tokens.
 */
export type AgentEvent =
	| { type: 'plan-proposed'; plan: AgentPlan }
	| { type: 'subtask-started'; subtaskId: string; assignee: string; instruction: string }
	| { type: 'subtask-token'; subtaskId: string; token: string }
	| { type: 'subtask-completed'; subtaskId: string; assignee: string; summary: string }
	| { type: 'subtask-failed'; subtaskId: string; assignee: string; error: string }
	| { type: 'token'; token: string }
	| { type: 'final'; text: string }
	| { type: 'error'; message: string };
