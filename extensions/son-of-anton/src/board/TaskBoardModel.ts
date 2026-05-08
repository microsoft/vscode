/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';

/**
 * Lifecycle state of a single subtask as rendered on the kanban board.
 *
 * - `backlog` — created but at least one dependency is still incomplete.
 * - `ready`   — all dependencies are done; awaiting dispatch by the orchestrator.
 * - `in-progress` — a specialist is actively running the subtask.
 * - `review`  — specialist returned a result but the orchestrator hasn't yet
 *               folded it into the aggregate (rarely surfaces today; reserved
 *               for the review-agent gating step in `executeSubtask`).
 * - `done`    — subtask finished successfully.
 * - `failed`  — subtask failed terminally (dependency failure, agent error, etc.).
 */
export type SubtaskState =
	| 'backlog'
	| 'ready'
	| 'in-progress'
	| 'review'
	| 'done'
	| 'failed';

/**
 * One tile on the board. Mirrors a subset of `Subtask` from
 * `agents/types.ts` plus board-specific bookkeeping (timestamps, summary,
 * token usage). Kept separate from `Subtask` so the model can reflect
 * reassignment / mutation without leaking back into the active execution
 * plan unless the orchestrator opts in.
 */
export interface BoardTask {
	readonly id: string;
	readonly instruction: string;
	assignee: string;
	scopeFiles: ReadonlyArray<string>;
	dependencies: ReadonlyArray<string>;
	state: SubtaskState;
	startedAt?: number;
	finishedAt?: number;
	summary?: string;
	tokenUsage?: { input: number; output: number };
}

/**
 * Snapshot of the board for a single conversation. Returned by
 * `getSnapshot` and broadcast on every change so consumers can diff.
 */
export interface BoardSnapshot {
	readonly conversationId: string;
	readonly tasks: ReadonlyArray<BoardTask>;
	readonly createdAt: number;
}

interface BoardEntry {
	readonly conversationId: string;
	readonly createdAt: number;
	tasks: BoardTask[];
}

/**
 * Pure (no DOM, no postMessage) state model for the task board. Owns the
 * per-conversation tile list, recomputes derived state when dependencies
 * resolve, and fires `onDidChangeBoard` whenever the snapshot changes so
 * the webview can re-render.
 *
 * The orchestrator's `plan-proposed` event seeds the model via `setPlan`;
 * `subtask-started` / `subtask-completed` / `subtask-failed` events feed
 * into `updateTask`. The model is conversation-scoped — each
 * `setPlan(conversationId, ...)` replaces only that conversation's entry.
 */
export class TaskBoardModel implements vscode.Disposable {
	private readonly _onDidChangeBoard = new vscode.EventEmitter<{ conversationId: string }>();
	readonly onDidChangeBoard: vscode.Event<{ conversationId: string }> = this._onDidChangeBoard.event;

	private readonly boards = new Map<string, BoardEntry>();

	/**
	 * Replace the entire plan for a conversation. Called when a fresh
	 * `plan-proposed` event arrives. Each subtask starts in `backlog` and is
	 * promoted to `ready` by `recomputeStates`.
	 */
	setPlan(conversationId: string, tasks: BoardTask[]): void {
		this.boards.set(conversationId, {
			conversationId,
			createdAt: Date.now(),
			tasks: tasks.map(t => ({ ...t })),
		});
		this.recomputeStates(conversationId);
		this._onDidChangeBoard.fire({ conversationId });
	}

	/**
	 * Apply a partial patch to a single tile. Triggers a recompute so any
	 * downstream `backlog` tasks get promoted to `ready` when their dep
	 * finishes.
	 */
	updateTask(conversationId: string, taskId: string, patch: Partial<BoardTask>): void {
		const board = this.boards.get(conversationId);
		if (!board) {
			return;
		}
		const idx = board.tasks.findIndex(t => t.id === taskId);
		if (idx === -1) {
			return;
		}
		const existing = board.tasks[idx];
		// Spread order preserves the immutable `id` and `instruction` even if
		// a caller accidentally passes them in the patch.
		board.tasks[idx] = {
			...existing,
			...patch,
			id: existing.id,
			instruction: existing.instruction,
		};
		this.recomputeStates(conversationId);
		this._onDidChangeBoard.fire({ conversationId });
	}

	/**
	 * Reassign a tile to a different specialist. Skips the no-op case so we
	 * don't fire spurious change events when the user drops a tile back onto
	 * its own lane.
	 */
	reassign(conversationId: string, taskId: string, newAssignee: string): void {
		const board = this.boards.get(conversationId);
		if (!board) {
			return;
		}
		const task = board.tasks.find(t => t.id === taskId);
		if (!task || task.assignee === newAssignee) {
			return;
		}
		task.assignee = newAssignee;
		this._onDidChangeBoard.fire({ conversationId });
	}

	/**
	 * Get the current snapshot for a conversation. Returns a defensively-
	 * cloned copy so callers can't mutate internal state.
	 */
	getSnapshot(conversationId: string): BoardSnapshot | undefined {
		const board = this.boards.get(conversationId);
		if (!board) {
			return undefined;
		}
		return {
			conversationId: board.conversationId,
			createdAt: board.createdAt,
			tasks: board.tasks.map(t => ({ ...t })),
		};
	}

	/**
	 * Promote tiles in `backlog` whose dependencies are all `done` to
	 * `ready`. Conversely, demote tiles back to `backlog` if a previously-
	 * ready dependency was reassigned/restarted and is no longer done. Does
	 * not touch terminal states (`done`, `failed`) or in-flight states
	 * (`in-progress`, `review`).
	 */
	recomputeStates(conversationId: string): void {
		const board = this.boards.get(conversationId);
		if (!board) {
			return;
		}
		const taskById = new Map(board.tasks.map(t => [t.id, t]));
		for (const task of board.tasks) {
			if (task.state === 'done' || task.state === 'failed' || task.state === 'in-progress' || task.state === 'review') {
				continue;
			}
			const allDepsDone = task.dependencies.every(depId => {
				const dep = taskById.get(depId);
				return !!dep && dep.state === 'done';
			});
			task.state = allDepsDone ? 'ready' : 'backlog';
		}
	}

	/**
	 * Subtasks whose dependencies are met and that aren't already running.
	 * Returned in insertion order — the orchestrator fans these out
	 * concurrently, so caller-side ordering is informational rather than
	 * semantic.
	 */
	getReadyTasks(conversationId: string): ReadonlyArray<BoardTask> {
		const board = this.boards.get(conversationId);
		if (!board) {
			return [];
		}
		return board.tasks.filter(t => t.state === 'ready').map(t => ({ ...t }));
	}

	dispose(): void {
		this._onDidChangeBoard.dispose();
		this.boards.clear();
	}
}
