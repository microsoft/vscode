/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import type { Tool, TodoEntry, TodoListMetadata, ToolDefinition, ToolExecutionResult } from './types';

const MAX_TODOS = 30;
const MAX_TEXT_LENGTH = 200;
const VALID_STATUSES: ReadonlyArray<TodoEntry['status']> = ['pending', 'in_progress', 'completed'];

/**
 * H13 — Claude-Code-style focus chain. Two factory-bound builtin tools that
 * give the LLM a persistent in-loop scratchpad for multi-step work:
 *
 *   • `todo_write` — replaces the active todo list with a fresh array. The
 *     full list must be passed every call (no partial updates) so list
 *     identity is the model's, not the harness's, and reorganisations are
 *     trivial. Each call attaches a `TodoListMetadata` object so chat
 *     surfaces can render the list as an inline checklist instead of an
 *     opaque tool card.
 *
 *   • `todo_read` — returns the current list as JSON so the agent can
 *     re-orient on it across tool-loop iterations without paying for a
 *     re-emission of the whole list in the assistant message.
 *
 * State scope: a single tool-loop invocation. Each call to
 * `buildTodoTools()` produces a fresh closure around an empty list. The
 * loop closes when the agent stops calling tools, at which point the host
 * can read out the final list via `getTodos()` for telemetry or surface
 * rendering. Cross-turn persistence (so a follow-up turn can resume work)
 * is a deliberate non-goal for v1 — the model should re-emit at the start
 * of any turn that wants to continue prior work.
 */
export const TODO_WRITE_DEFINITION: ToolDefinition = {
	name: 'todo_write',
	description: 'Replace the active todo list with a new array of items. Use to plan multi-step work upfront and to mark items as you progress (pending → in_progress → completed). PASS THE FULL LIST every call — partial updates aren\'t supported. Cap is 30 todos × 200 chars each. Status must be one of: pending | in_progress | completed.',
	inputSchema: {
		type: 'object',
		properties: {
			todos: {
				type: 'array',
				description: 'The complete todo list. Each item: { id: string (stable across calls), text: string (1 line), status: pending|in_progress|completed }.',
				items: {
					type: 'object',
				},
			},
		},
		required: ['todos'],
	},
	category: 'read',
};

export const TODO_READ_DEFINITION: ToolDefinition = {
	name: 'todo_read',
	description: 'Read the current todo list previously set by todo_write. Returns the list as JSON. Returns an empty list when no todos have been written yet.',
	inputSchema: {
		type: 'object',
		properties: {},
	},
	category: 'read',
};

/**
 * Construct a fresh pair of `todo_write` / `todo_read` tools backed by a
 * private todo list closure. The returned `getTodos()` accessor lets the
 * caller (typically `runToolLoop`) read the final state once the agent
 * has stopped iterating.
 */
export function buildTodoTools(): {
	readonly tools: ReadonlyArray<Tool>;
	getTodos(): ReadonlyArray<TodoEntry>;
} {
	let todos: TodoEntry[] = [];

	const writeTool: Tool = {
		definition: TODO_WRITE_DEFINITION,
		async execute(input: Record<string, unknown>): Promise<ToolExecutionResult> {
			const rawTodos = input['todos'];
			if (!Array.isArray(rawTodos)) {
				return { content: '`todos` must be an array.', isError: true };
			}
			if (rawTodos.length > MAX_TODOS) {
				return {
					content: `Too many todos (${rawTodos.length}). Cap is ${MAX_TODOS}. Trim the list before retrying.`,
					isError: true,
				};
			}
			const next: TodoEntry[] = [];
			const seenIds = new Set<string>();
			for (let i = 0; i < rawTodos.length; i++) {
				const item = rawTodos[i] as Record<string, unknown>;
				if (!item || typeof item !== 'object') {
					return { content: `todos[${i}] must be an object.`, isError: true };
				}
				const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `T${i + 1}`;
				if (seenIds.has(id)) {
					return { content: `Duplicate todo id "${id}". Each id must be unique within the list.`, isError: true };
				}
				seenIds.add(id);
				const text = typeof item.text === 'string' ? item.text.trim() : '';
				if (!text) {
					return { content: `todos[${i}].text is required and must be a non-empty string.`, isError: true };
				}
				if (text.length > MAX_TEXT_LENGTH) {
					return { content: `todos[${i}].text exceeds ${MAX_TEXT_LENGTH} chars. Keep entries to one line.`, isError: true };
				}
				const rawStatus = String(item.status ?? 'pending') as TodoEntry['status'];
				if (!VALID_STATUSES.includes(rawStatus)) {
					return {
						content: `todos[${i}].status "${rawStatus}" not recognised. Must be one of: ${VALID_STATUSES.join(', ')}.`,
						isError: true,
					};
				}
				next.push({ id, text, status: rawStatus });
			}
			todos = next;
			const completed = todos.filter(t => t.status === 'completed').length;
			const inProgress = todos.filter(t => t.status === 'in_progress').length;
			const summary = `Updated todo list: ${completed} done · ${inProgress} in progress · ${todos.length - completed - inProgress} pending.`;
			const metadata: TodoListMetadata = { kind: 'todo-list', todos: todos.map(t => ({ ...t })) };
			return { content: summary, metadata };
		},
	};

	const readTool: Tool = {
		definition: TODO_READ_DEFINITION,
		async execute(): Promise<ToolExecutionResult> {
			return { content: JSON.stringify(todos) };
		},
	};

	return {
		tools: [writeTool, readTool],
		getTodos: () => todos,
	};
}
