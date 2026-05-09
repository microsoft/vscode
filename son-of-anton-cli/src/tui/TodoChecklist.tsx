/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text } from 'ink';
import * as React from 'react';

interface TodoEntry {
	readonly id: string;
	readonly text: string;
	readonly status: 'pending' | 'in_progress' | 'completed';
}

interface TodoChecklistProps {
	readonly todos: ReadonlyArray<TodoEntry>;
}

const STATUS_GLYPH: Record<TodoEntry['status'], string> = {
	pending: '○',
	in_progress: '◇',
	completed: '✓',
};

const STATUS_COLOR: Record<TodoEntry['status'], string> = {
	pending: 'gray',
	in_progress: 'cyan',
	completed: 'green',
};

/**
 * H13 — render a `todo_write` tool call as an inline checklist below the
 * assistant message, replacing the generic ToolCard treatment. Each item
 * carries a glyph reflecting its state (✓ done · ◇ active · ○ pending)
 * and the text it captures the work item with. Completed items are
 * dim-struck through to make progress legible at a glance.
 *
 * The checklist updates as the agent issues fresh `todo_write` calls
 * over the course of a tool-loop turn — the latest call's payload is
 * what surfaces here, since the model is required to emit the FULL list
 * each call (no partial updates).
 */
export function TodoChecklist(props: TodoChecklistProps): JSX.Element {
	const { todos } = props;
	const completed = todos.filter(t => t.status === 'completed').length;
	const inProgress = todos.filter(t => t.status === 'in_progress').length;
	const total = todos.length;

	return (
		<Box borderStyle="single" borderColor="cyan" flexDirection="column" paddingX={1} marginY={0}>
			<Box flexDirection="row">
				<Text color="cyan" bold>{'Todos'}</Text>
				<Text color="gray">{`  ${completed}/${total} done · ${inProgress} active`}</Text>
			</Box>
			<Box flexDirection="column" marginTop={0}>
				{todos.map((todo) => (
					<Box key={todo.id} flexDirection="row">
						<Text color={STATUS_COLOR[todo.status]}>{`${STATUS_GLYPH[todo.status]} `}</Text>
						<Text
							color={todo.status === 'pending' ? 'gray' : 'white'}
							strikethrough={todo.status === 'completed'}
							bold={todo.status === 'in_progress'}
						>
							{todo.text}
						</Text>
					</Box>
				))}
			</Box>
		</Box>
	);
}
