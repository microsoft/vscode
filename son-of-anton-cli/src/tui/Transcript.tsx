/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import * as React from 'react';
import { ToolCard } from './ToolCard';
import type { TuiMessage } from './types';

interface TranscriptProps {
	messages: ReadonlyArray<TuiMessage>;
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
	const { messages } = props;
	return (
		<Box flexDirection="column" paddingX={1} flexGrow={1}>
			{messages.map((m) => (
				<MessageRow key={m.id} message={m} />
			))}
		</Box>
	);
}

function MessageRow({ message }: { message: TuiMessage }): JSX.Element {
	const glyph = ROLE_GLYPH[message.role];
	const color = ROLE_COLOR[message.role];
	const showSpinner = !!message.streaming && !message.text;

	return (
		<Box flexDirection="column" marginBottom={1}>
			<Box flexDirection="row">
				<Text color={color}>{glyph} </Text>
				{showSpinner ? (
					<Text color="gray">
						<Spinner type="dots" />
						{' streaming…'}
					</Text>
				) : (
					<Text>{message.text}</Text>
				)}
			</Box>
			{message.toolCalls && message.toolCalls.length > 0 ? (
				<Box flexDirection="column" paddingLeft={2} marginTop={0}>
					{message.toolCalls.map((tc, i) => (
						<ToolCard key={i} name={tc.name} input={tc.input} />
					))}
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
