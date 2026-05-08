/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Kanban column. Owns drag-over highlighting + the drop
 * routing logic that mirrors the original vanilla-JS implementation in
 * `TaskBoardPanel.ts`:
 *
 *   - ready -> in-progress     => dispatch the subtask.
 *   - done -> ready/in-progress (with confirm) => rerun.
 *   - failed -> ready/in-progress (with confirm) => rerun.
 *   - same column => no-op.
 *   - other transitions => silently ignored (undefined behaviour by design).
 */

import { useCallback, useState } from 'react';
import type { DragEvent } from 'react';
import { KanbanCard } from './KanbanCard';
import { postToHost } from './vscode';
import type { BoardTaskView, PersonaView, SubtaskState } from './protocol';

interface KanbanColumnProps {
	readonly title: string;
	readonly state: SubtaskState;
	readonly tasks: ReadonlyArray<BoardTaskView>;
	readonly personasById: Map<string, PersonaView>;
}

interface DropPayload {
	readonly taskId: string;
	readonly fromState: SubtaskState;
	readonly assignee: string;
}

export function KanbanColumn({ title, state, tasks, personasById }: KanbanColumnProps): JSX.Element {
	const [dragOver, setDragOver] = useState(false);

	const onDragOver = useCallback((ev: DragEvent<HTMLDivElement>): void => {
		ev.preventDefault();
		if (ev.dataTransfer) {
			ev.dataTransfer.dropEffect = 'move';
		}
		setDragOver(true);
	}, []);

	const onDragLeave = useCallback((ev: DragEvent<HTMLDivElement>): void => {
		// Only clear when leaving the column itself, not when crossing
		// between child tiles (the dragleave fires on every nested element
		// transition — we'd flicker without this guard).
		if (ev.currentTarget === ev.target) {
			setDragOver(false);
		}
	}, []);

	const onDrop = useCallback((ev: DragEvent<HTMLDivElement>): void => {
		ev.preventDefault();
		setDragOver(false);
		if (!ev.dataTransfer) {
			return;
		}
		let payload: DropPayload | undefined;
		try {
			payload = JSON.parse(ev.dataTransfer.getData('text/plain')) as DropPayload;
		} catch {
			return;
		}
		if (!payload || typeof payload.taskId !== 'string') {
			return;
		}
		const fromState = payload.fromState;
		const taskId = payload.taskId;
		if (fromState === state) {
			return;
		}
		if (fromState === 'ready' && state === 'in-progress') {
			postToHost({ type: 'dispatch', taskId });
			return;
		}
		if (fromState === 'done' && (state === 'ready' || state === 'in-progress')) {
			if (window.confirm('Re-run this subtask?')) {
				postToHost({ type: 'rerun', taskId });
			}
			return;
		}
		if (fromState === 'failed' && (state === 'ready' || state === 'in-progress')) {
			if (window.confirm('Retry this failed subtask?')) {
				postToHost({ type: 'rerun', taskId });
			}
			return;
		}
		// Other transitions intentionally fall through to no-op.
	}, [state]);

	return (
		<div
			className={`column${dragOver ? ' drag-over' : ''}`}
			data-state={state}
			onDragOver={onDragOver}
			onDragLeave={onDragLeave}
			onDrop={onDrop}
		>
			<div className="column-header">
				{title}
				<span className="column-count">{tasks.length}</span>
			</div>
			<div className="column-body">
				{tasks.map(task => (
					<KanbanCard key={task.id} task={task} persona={personasById.get(task.assignee)} />
				))}
			</div>
		</div>
	);
}
