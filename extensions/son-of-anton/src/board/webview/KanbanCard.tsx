/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
/**
 * @fileoverview Single tile (card) on the kanban board. Ports the existing
 * vanilla-JS `renderTile` function from TaskBoardPanel.ts to React JSX.
 * Drag/drop uses the native HTML5 API — no react-dnd dependency.
 */

import { useCallback } from 'react';
import type { DragEvent } from 'react';
import { postToHost } from './vscode';
import type { BoardTaskView, PersonaView } from './protocol';

interface KanbanCardProps {
	readonly task: BoardTaskView;
	readonly persona: PersonaView | undefined;
}

const FALLBACK_PERSONA: PersonaView = {
	id: 'unknown',
	monogram: '?',
	accent: 'var(--vscode-descriptionForeground)',
	tagline: '',
};

const TRUNCATE_AT = 80;

export function KanbanCard({ task, persona }: KanbanCardProps): JSX.Element {
	const p = persona ?? FALLBACK_PERSONA;
	const idShort = task.id.split('-').slice(-2).join('-');
	const truncatedInstruction = task.instruction.length > TRUNCATE_AT
		? task.instruction.slice(0, TRUNCATE_AT - 1) + '…'
		: task.instruction;

	const onDragStart = useCallback((ev: DragEvent<HTMLDivElement>): void => {
		ev.currentTarget.classList.add('dragging');
		if (ev.dataTransfer) {
			ev.dataTransfer.effectAllowed = 'move';
			ev.dataTransfer.setData('text/plain', JSON.stringify({
				taskId: task.id,
				fromState: task.state,
				assignee: task.assignee,
			}));
		}
	}, [task.id, task.state, task.assignee]);

	const onDragEnd = useCallback((ev: DragEvent<HTMLDivElement>): void => {
		ev.currentTarget.classList.remove('dragging');
	}, []);

	const onClick = useCallback((): void => {
		postToHost({ type: 'reveal', taskId: task.id });
	}, [task.id]);

	const tooltipParts = [task.instruction];
	if (task.scopeFiles.length > 0) {
		tooltipParts.push('Files: ' + task.scopeFiles.join(', '));
	}
	if (task.tokenUsage) {
		tooltipParts.push(`Tokens: ${task.tokenUsage.input} in / ${task.tokenUsage.output} out`);
	}

	const visibleScope = task.scopeFiles.slice(0, 3);
	const hiddenScopeCount = Math.max(0, task.scopeFiles.length - visibleScope.length);

	return (
		<div
			className="tile"
			draggable
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onClick={onClick}
			data-task-id={task.id}
			data-state={task.state}
			data-assignee={task.assignee}
			style={{ borderLeftColor: p.accent }}
			title={tooltipParts.join('\n')}
		>
			<div className="tile-row">
				<span className="tile-id">{idShort}</span>
				<span className={`tile-status-pill ${task.state}`} style={{ marginLeft: 'auto' }}>{task.state}</span>
			</div>
			<div className="tile-instruction">{truncatedInstruction}</div>
			<div className="tile-assignee">
				<span className="avatar" style={{ background: p.accent }}>{p.monogram}</span>
				<span className="tile-name">@{task.assignee}</span>
			</div>
			{task.scopeFiles.length > 0 && (
				<div className="chips">
					{visibleScope.map(file => (
						<span key={file} className="chip" title={file}>{file}</span>
					))}
					{hiddenScopeCount > 0 && (
						<span className="chip">+{hiddenScopeCount} more</span>
					)}
				</div>
			)}
			{task.dependencies.length > 0 && (
				<div className="chips">
					<span className="chip dep">
						{'→ ' + task.dependencies.map(d => d.split('-').slice(-2).join('-')).join(', ')}
					</span>
				</div>
			)}
			{task.summary && <div className="tile-summary">{task.summary}</div>}
		</div>
	);
}
