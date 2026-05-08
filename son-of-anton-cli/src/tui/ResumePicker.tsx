/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text, useInput } from 'ink';
import * as React from 'react';
import type { CliConversationSummary } from '../persistence/ConversationStore';

interface ResumePickerProps {
	conversations: ReadonlyArray<CliConversationSummary>;
	onSelect(summary: CliConversationSummary): void;
	onCancel(): void;
}

const PAGE = 8;

/**
 * Vertical picker overlay shown when the user runs `/resume`. Up / down to
 * highlight, Enter to load, Esc to dismiss. Page size is bounded so the
 * picker stays compact even when the user has dozens of conversations
 * archived; the scroll window slides as the highlight moves.
 */
export function ResumePicker(props: ResumePickerProps): JSX.Element {
	const { conversations, onSelect, onCancel } = props;
	const [index, setIndex] = React.useState(0);

	useInput((_input, key) => {
		if (key.escape) {
			onCancel();
			return;
		}
		if (key.upArrow) {
			setIndex((i) => Math.max(0, i - 1));
			return;
		}
		if (key.downArrow) {
			setIndex((i) => Math.min(conversations.length - 1, i + 1));
			return;
		}
		if (key.return) {
			const summary = conversations[index];
			if (summary) {
				onSelect(summary);
			}
		}
	});

	const start = Math.max(0, Math.min(index - Math.floor(PAGE / 2), conversations.length - PAGE));
	const window = conversations.slice(start, start + PAGE);

	return (
		<Box borderStyle="round" borderColor="magenta" flexDirection="column" paddingX={1} marginY={1}>
			<Text color="magenta" bold>
				Resume conversation
			</Text>
			<Text color="gray">↑↓ to choose · Enter to load · Esc to cancel</Text>
			<Box flexDirection="column" marginTop={1}>
				{window.map((c, i) => {
					const realIndex = start + i;
					const selected = realIndex === index;
					const ago = relativeAgo(c.updatedAt);
					return (
						<Box key={c.id} flexDirection="row">
							<Text color={selected ? 'cyan' : 'gray'}>{selected ? '› ' : '  '}</Text>
							<Box flexDirection="column">
								<Text color={selected ? 'white' : 'gray'} bold={selected}>
									{c.title}
								</Text>
								<Text color="gray">
									{`${ago} · ${c.messageCount} msg · @${c.specialist} · ${c.model}`}
								</Text>
							</Box>
						</Box>
					);
				})}
			</Box>
			{conversations.length > window.length ? (
				<Text color="gray">{`${index + 1} / ${conversations.length}`}</Text>
			) : null}
		</Box>
	);
}

function relativeAgo(timestamp: number): string {
	const diff = Date.now() - timestamp;
	const minutes = Math.floor(diff / 60_000);
	if (minutes < 1) {
		return 'just now';
	}
	if (minutes < 60) {
		return `${minutes}m ago`;
	}
	const hours = Math.floor(minutes / 60);
	if (hours < 24) {
		return `${hours}h ago`;
	}
	const days = Math.floor(hours / 24);
	if (days < 30) {
		return `${days}d ago`;
	}
	return new Date(timestamp).toISOString().slice(0, 10);
}
