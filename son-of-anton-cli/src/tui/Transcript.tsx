/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import * as React from 'react';
import { MarkdownText } from './MarkdownText';
import { TodoChecklist } from './TodoChecklist';
import { ToolCard } from './ToolCard';
import { UiBlock } from './uiBlocks/UiBlock';
import type { UiBlockResponse } from './uiBlocks/types';
import type { TuiMessage } from './types';

interface TranscriptProps {
	messages: ReadonlyArray<TuiMessage>;
	uiBlockState?: ReadonlyMap<string, { settled: boolean; value?: UiBlockResponse }>;
	onUiBlockResponse?(blockId: string, response: UiBlockResponse): void;
}

const ROLE_GLYPH: Record<TuiMessage['role'], string> = {
	user: '›',
	assistant: '◇',
	system: '∙',
};

const ROLE_COLOR: Record<TuiMessage['role'], string> = {
	user: 'cyan',
	assistant: 'magenta',
	system: 'gray',
};

/**
 * Scrollable transcript region. Ink does not virtualise — terminals handle
 * scrollback on their own — so rendering the full list per turn is cheap
 * enough for typical session lengths and avoids the complexity of a custom
 * windowing layer.
 */
export function Transcript(props: TranscriptProps): JSX.Element {
	const { messages, uiBlockState, onUiBlockResponse } = props;
	return (
		<Box flexDirection="column" paddingX={1} flexGrow={1}>
			{messages.map((m) => (
				<MessageRow
					key={m.id}
					message={m}
					uiBlockState={uiBlockState}
					onUiBlockResponse={onUiBlockResponse}
				/>
			))}
		</Box>
	);
}

interface MessageRowProps {
	message: TuiMessage;
	uiBlockState?: ReadonlyMap<string, { settled: boolean; value?: UiBlockResponse }>;
	onUiBlockResponse?(blockId: string, response: UiBlockResponse): void;
}

function MessageRow({ message, uiBlockState, onUiBlockResponse }: MessageRowProps): JSX.Element {
	const glyph = ROLE_GLYPH[message.role];
	const color = ROLE_COLOR[message.role];
	const showSpinner = !!message.streaming && !message.text;
	const hasMarkdown = message.role === 'assistant' && !message.streaming && message.text.length > 0;

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box flexDirection="row">
				<Text color={color}>{glyph} </Text>
				{showSpinner ? (
					<Text color="gray">
						<Spinner type="dots" />
						{' streaming…'}
					</Text>
				) : hasMarkdown ? (
					<MarkdownText>{message.text}</MarkdownText>
				) : (
					<Text>{message.text}</Text>
				)}
			</Box>
			{message.toolCalls && message.toolCalls.length > 0 ? (
				<Box flexDirection="column" paddingLeft={2} marginTop={0}>
					{message.toolCalls.map((tc, i) => {
						if (isUiBlockToolCall(tc)) {
							const blockId = extractBlockId(tc.input);
							const state = blockId ? uiBlockState?.get(blockId) : undefined;
							return (
								<UiBlock
									key={i}
									component={(tc.input as { component?: string }).component ?? ''}
									props={(tc.input as { props?: unknown }).props}
									blockId={blockId}
									state={state}
									onResponse={(response, id) => {
										if (id) {
											onUiBlockResponse?.(id, response);
										}
									}}
								/>
							);
						}
						const todos = extractTodoList(tc);
						if (todos) {
							return <TodoChecklist key={i} todos={todos} />;
						}
						return <ToolCard key={i} name={tc.name} input={tc.input} />;
					})}
				</Box>
			) : null}
			{message.error ? (
				<Box paddingLeft={2}>
					<Text color="red">! {message.error}</Text>
				</Box>
			) : null}
		</Box>
	);
}

function isUiBlockToolCall(tc: { name: string; input?: unknown }): boolean {
	return tc.name === 'emit_ui_block' && typeof tc.input === 'object' && tc.input !== null;
}

/**
 * Extract a validated todo list from a `todo_write` tool call. Returns
 * `null` for any other tool name OR when the input shape doesn't match
 * the expected `{ todos: TodoEntry[] }` schema — a malformed payload
 * falls through to the generic ToolCard rendering rather than rendering
 * a half-broken checklist.
 */
function extractTodoList(tc: { name: string; input?: unknown }): ReadonlyArray<{ id: string; text: string; status: 'pending' | 'in_progress' | 'completed' }> | null {
	if (tc.name !== 'todo_write' || typeof tc.input !== 'object' || tc.input === null) {
		return null;
	}
	const raw = (tc.input as { todos?: unknown }).todos;
	if (!Array.isArray(raw)) {
		return null;
	}
	const valid: Array<{ id: string; text: string; status: 'pending' | 'in_progress' | 'completed' }> = [];
	for (const item of raw) {
		if (!item || typeof item !== 'object') {
			continue;
		}
		const id = typeof (item as { id?: unknown }).id === 'string' ? (item as { id: string }).id : '';
		const text = typeof (item as { text?: unknown }).text === 'string' ? (item as { text: string }).text : '';
		const status = (item as { status?: unknown }).status;
		if (!id || !text || (status !== 'pending' && status !== 'in_progress' && status !== 'completed')) {
			continue;
		}
		valid.push({ id, text, status });
	}
	return valid.length > 0 ? valid : null;
}

/**
 * Extract a stable block id from the tool input for state-tracking. The
 * agent host (extensions/son-of-anton/src/chat/ChatPanel.ts) attaches a
 * `blockId` to its synthetic input; in the CLI we synthesise one from the
 * `component` + a stringified prop digest so re-renders match the same
 * block across redraws. Falls back to the raw `blockId` field when the
 * agent surface includes one.
 */
function extractBlockId(input: unknown): string | undefined {
	if (typeof input !== 'object' || input === null) {
		return undefined;
	}
	const fromInput = (input as { blockId?: unknown }).blockId;
	if (typeof fromInput === 'string') {
		return fromInput;
	}
	const obj = input as { component?: unknown; props?: unknown };
	if (typeof obj.component !== 'string') {
		return undefined;
	}
	try {
		const propsHash = JSON.stringify(obj.props ?? {});
		return `block-${obj.component}-${hashString(propsHash)}`;
	} catch {
		return undefined;
	}
}

/**
 * Tiny non-cryptographic hash so block ids derived from props stay stable
 * across renders without pulling in a hashing dep. djb2-style, more than
 * good enough for distinguishing prop sets.
 */
function hashString(value: string): string {
	let hash = 5381;
	for (let i = 0; i < value.length; i++) {
		hash = ((hash << 5) + hash) + value.charCodeAt(i);
	}
	return (hash >>> 0).toString(36);
}
