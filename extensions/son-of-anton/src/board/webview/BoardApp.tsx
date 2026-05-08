/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Top-level layout for the Task Board webview.
 *
 * Hosts the kanban grid + the embedded "Talk to the board" chat sidebar.
 * Subscribes to host snapshot pushes via window.message events. Re-fires
 * `refresh` on mount so the host pushes the current state immediately
 * (the host already does this on construction, but the React tree may
 * mount after that initial push if the bundle is still loading).
 */

import { useEffect, useMemo, useState } from 'react';
import { BoardRuntime } from './BoardRuntime';
import { BoardChat } from './BoardChat';
import { KanbanColumn } from './KanbanColumn';
import { useBoardActions } from './useBoardActions';
import { useBoardReadable } from './useBoardReadable';
import { postToHost } from './vscode';
import type { BoardSnapshotView, PersonaView, SubtaskState, HostToWebviewMessage } from './protocol';
import { boardStyles } from './styles';

interface BoardState {
	readonly conversationId: string | null;
	readonly conversationTitle: string;
	readonly snapshot: BoardSnapshotView | null;
	readonly personas: ReadonlyArray<PersonaView>;
}

const INITIAL_STATE: BoardState = {
	conversationId: null,
	conversationTitle: '',
	snapshot: null,
	personas: [],
};

const COLUMNS: ReadonlyArray<{ state: SubtaskState; title: string }> = [
	{ state: 'backlog', title: 'Backlog' },
	{ state: 'ready', title: 'Ready' },
	{ state: 'in-progress', title: 'In Progress' },
	{ state: 'done', title: 'Done' },
	{ state: 'failed', title: 'Failed' },
];

export function BoardApp(): JSX.Element {
	const [state, setState] = useState<BoardState>(INITIAL_STATE);

	useEffect(() => {
		const handler = (ev: MessageEvent): void => {
			const msg = ev.data as HostToWebviewMessage | undefined;
			if (!msg || msg.type !== 'snapshot') {
				return;
			}
			setState({
				conversationId: msg.conversationId,
				conversationTitle: msg.conversationTitle,
				snapshot: msg.snapshot,
				personas: msg.personas,
			});
		};
		window.addEventListener('message', handler);
		// Ask the host for the latest snapshot — covers the case where the
		// React mount happened after the host's initial pushSnapshot().
		postToHost({ type: 'refresh' });
		return () => window.removeEventListener('message', handler);
	}, []);

	return (
		<BoardRuntime>
			<style>{boardStyles}</style>
			<BoardInner state={state} />
		</BoardRuntime>
	);
}

interface BoardInnerProps {
	readonly state: BoardState;
}

/**
 * Inner component so the action / readable hooks live inside the
 * `<CopilotKit>` provider (they require the context).
 */
function BoardInner({ state }: BoardInnerProps): JSX.Element {
	const personasById = useMemo(() => {
		const map = new Map<string, PersonaView>();
		for (const p of state.personas) {
			map.set(p.id, p);
		}
		return map;
	}, [state.personas]);

	const assignees = useMemo(() => state.personas.map(p => p.id), [state.personas]);

	useBoardActions(assignees);
	useBoardReadable(state.snapshot, state.conversationTitle, state.personas);

	const buckets = useMemo(() => bucketize(state.snapshot), [state.snapshot]);

	const onRefresh = (): void => postToHost({ type: 'refresh' });

	const hasTasks = !!state.snapshot && state.snapshot.tasks.length > 0;

	return (
		<main className="shell">
			<header className="header">
				<h1>Task Board</h1>
				{state.conversationId && (
					<span className="conversation">conversation: {state.conversationTitle}</span>
				)}
				<span className="spacer" />
				<button type="button" onClick={onRefresh}>Refresh</button>
			</header>
			<div className="board-layout">
				{!hasTasks && (
					<section className="empty">
						No active plan. Send a request to <code>@anton</code> to generate one.
					</section>
				)}
				{hasTasks && (
					<section className="columns">
						{COLUMNS.map(col => (
							<KanbanColumn
								key={col.state}
								title={col.title}
								state={col.state}
								tasks={buckets[col.state]}
								personasById={personasById}
							/>
						))}
					</section>
				)}
				<BoardChat assignees={assignees} />
			</div>
		</main>
	);
}

function bucketize(snapshot: BoardSnapshotView | null): Record<SubtaskState, BoardSnapshotView['tasks'][number][]> {
	const buckets: Record<SubtaskState, BoardSnapshotView['tasks'][number][]> = {
		'backlog': [],
		'ready': [],
		'in-progress': [],
		'review': [],
		'done': [],
		'failed': [],
	};
	if (!snapshot) {
		return buckets;
	}
	for (const task of snapshot.tasks) {
		const bucket = buckets[task.state] ?? buckets.backlog;
		bucket.push(task);
	}
	// Review tiles ride along with in-progress visually — same merging the
	// vanilla JS surface did. The state badge on each tile still shows the
	// precise state, so the LLM sees the difference via the readable hook.
	buckets['in-progress'] = [...buckets['in-progress'], ...buckets['review']];
	return buckets;
}
