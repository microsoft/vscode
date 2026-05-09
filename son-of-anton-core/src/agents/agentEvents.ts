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
 * Cline-style chat mode. `'plan'` pins the orchestrator into "design only,
 * no tool calls" — it produces a plan and stops; `'act'` is the default and
 * lets the orchestrator dispatch subtasks once a plan is approved.
 */
export type ChatMode = 'plan' | 'act';

/**
 * Events the agent stack emits to the chat surface. Mirrors the public
 * semantics of OrchestratorAgent.handleChatRequest plus per-specialist
 * streaming so the webview can render plan/subtask cards alongside tokens.
 *
 * `mode` is optional and only meaningful on system-message style transitions
 * (e.g. `/plan`, `/act` slash commands) — it's surfaced so callers can
 * decorate the rendered system bubble or update related UI affordances.
 */
export type AgentEvent =
	| { type: 'plan-proposed'; plan: AgentPlan; mode?: ChatMode }
	| { type: 'subtask-ready'; subtaskId: string; assignee: string; mode?: ChatMode }
	| { type: 'subtask-started'; subtaskId: string; assignee: string; instruction: string; mode?: ChatMode }
	| { type: 'subtask-token'; subtaskId: string; token: string; mode?: ChatMode }
	| { type: 'subtask-completed'; subtaskId: string; assignee: string; summary: string; mode?: ChatMode }
	| { type: 'subtask-failed'; subtaskId: string; assignee: string; error: string; mode?: ChatMode }
	| { type: 'subtask-reassigned'; subtaskId: string; from: string; to: string; mode?: ChatMode }
	| { type: 'subtask-blocked'; subtaskId: string; assignee: string; reason: string; mode?: ChatMode }
	| { type: 'token'; token: string; mode?: ChatMode }
	| { type: 'final'; text: string; mode?: ChatMode }
	| { type: 'error'; message: string; mode?: ChatMode }
	/**
	 * Generative-UI block emitted by the LLM via the `emit_ui_block` builtin
	 * tool. Each block is rendered inline by the chat surface using the
	 * webview-side renderer registry, keyed on `component`. `blockId` is a
	 * stable host-generated id used for response routing and freezing the
	 * block once the user has responded. `subtaskId`, when present, scopes
	 * the block to a specialist subtask card; otherwise it is appended to
	 * the orchestrator's main assistant body.
	 */
	| { type: 'ui-block'; component: string; props: Record<string, unknown>; blockId: string; subtaskId?: string; mode?: ChatMode }
	/**
	 * Tool-call event emitted from the agentic specialist path
	 * (`BaseAgent.runAgenticTurn`). Mirrors the shape of the LlmClient's
	 * `tool-call` stream event so chat surfaces can render an inline
	 * tool card identical to the direct-chat-turn path. `id` is the
	 * tool_use id from Anthropic; `status` reflects whether the tool
	 * has run yet (`'running'`) or has returned (`'done'` / `'error'`).
	 * `output` carries the truncated text result once the tool finishes.
	 */
	| { type: 'tool-call'; id: string; name: string; input: Record<string, unknown>; status: 'running' | 'done' | 'error'; output?: string; mode?: ChatMode };
