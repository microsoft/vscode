/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text, useInput } from 'ink';
import * as React from 'react';
import { filterCommands, type SlashCommand } from './slashCommands';

interface ComposerProps {
	disabled: boolean;
	history: ReadonlyArray<string>;
	suggestions?: ReadonlyArray<string>;
	suggestionHighlight?: number;
	onCycleSuggestion?(): void;
	onSubmit(value: string): void;
}

/**
 * Multi-line capable composer for the chat TUI. Built directly on Ink's
 * `useInput` rather than `ink-text-input` so it can:
 *   - Render an inline slash-command palette while the buffer starts with `/`
 *   - Accept `\\` + Enter as an explicit newline (single-keystroke continuation)
 *   - Walk persistent REPL history with the up / down arrows
 *   - Tab-complete partial slash commands
 *
 * Paste detection (multiple newlines arriving within ~50ms) is deferred to a
 * later phase — terminal emulators differ enough that a robust implementation
 * needs more thought than a simple timer.
 */
export function Composer(props: ComposerProps): JSX.Element {
	const { disabled, history, onSubmit, suggestions, suggestionHighlight, onCycleSuggestion } = props;
	const [buffer, setBuffer] = React.useState('');
	const [cursor, setCursor] = React.useState(0);
	const [historyIndex, setHistoryIndex] = React.useState<number | null>(null);
	const [draft, setDraft] = React.useState('');

	const isSlash = buffer.startsWith('/') && !buffer.includes('\n');
	const palette: ReadonlyArray<SlashCommand> = isSlash ? filterCommands(buffer.split(/\s+/)[0]) : [];

	const reset = (): void => {
		setBuffer('');
		setCursor(0);
		setHistoryIndex(null);
		setDraft('');
	};

	const submit = (): void => {
		const value = buffer;
		if (!value.trim()) {
			return;
		}
		reset();
		onSubmit(value);
	};

	useInput((input, key) => {
		if (disabled) {
			return;
		}

		// Submit / continuation handling. A trailing backslash signals "I want
		// a newline instead of a submit" — popular among CLI agents because
		// terminals can't reliably distinguish Enter from Shift+Enter.
		if (key.return) {
			if (buffer.endsWith('\\')) {
				setBuffer(buffer.slice(0, -1) + '\n');
				setCursor(buffer.length);
				return;
			}
			// If the buffer is empty and a suggestion is highlighted, send it.
			// This is the keyboard-only path users walking suggestions expect.
			if (!buffer && suggestions && suggestions.length > 0 && typeof suggestionHighlight === 'number') {
				const picked = suggestions[suggestionHighlight];
				if (picked) {
					reset();
					onSubmit(picked);
					return;
				}
			}
			submit();
			return;
		}

		// History navigation. Only walk history when the cursor is on the
		// first line so users editing a multi-line draft don't lose work.
		if (key.upArrow && !buffer.includes('\n')) {
			if (history.length === 0) {
				return;
			}
			const nextIndex = historyIndex === null ? history.length - 1 : Math.max(0, historyIndex - 1);
			if (historyIndex === null) {
				setDraft(buffer);
			}
			setHistoryIndex(nextIndex);
			setBuffer(history[nextIndex]);
			setCursor(history[nextIndex].length);
			return;
		}
		if (key.downArrow && historyIndex !== null) {
			const nextIndex = historyIndex + 1;
			if (nextIndex >= history.length) {
				setHistoryIndex(null);
				setBuffer(draft);
				setCursor(draft.length);
			} else {
				setHistoryIndex(nextIndex);
				setBuffer(history[nextIndex]);
				setCursor(history[nextIndex].length);
			}
			return;
		}

		// Tab completion for slash commands.
		if (key.tab && palette.length > 0) {
			const longest = sharedPrefix(palette.map((c) => c.name));
			if (longest && longest.length > buffer.split(/\s+/)[0].length) {
				const rest = buffer.includes(' ') ? buffer.slice(buffer.indexOf(' ')) : '';
				const next = longest + rest;
				setBuffer(next);
				setCursor(next.length);
			}
			return;
		}

		// Tab on an empty buffer cycles through follow-up suggestions when
		// the parent has supplied any. The keyboard contract: Tab walks
		// suggestions, Enter sends the highlighted one.
		if (key.tab && !buffer && suggestions && suggestions.length > 0) {
			onCycleSuggestion?.();
			return;
		}

		if (key.backspace || key.delete) {
			if (cursor === 0) {
				return;
			}
			const next = buffer.slice(0, cursor - 1) + buffer.slice(cursor);
			setBuffer(next);
			setCursor(cursor - 1);
			return;
		}

		// Plain character insert. Filter control characters so accidental
		// keypresses (e.g. arrow keys on terminals that send escape sequences)
		// don't corrupt the buffer.
		if (input && !key.ctrl && !key.meta) {
			const next = buffer.slice(0, cursor) + input + buffer.slice(cursor);
			setBuffer(next);
			setCursor(cursor + input.length);
		}
	});

	const lines = buffer.length === 0 ? [''] : buffer.split('\n');

	return (
		<Box flexDirection="column">
			{palette.length > 0 ? <SlashPalette commands={palette} /> : null}
			<Box borderStyle="round" borderColor={disabled ? 'gray' : 'cyan'} paddingX={1} flexDirection="column">
				<Box flexDirection="row">
					<Text color={disabled ? 'gray' : 'cyan'}>{lines.length > 1 ? '┌ ' : '> '}</Text>
					<Text>
						{disabled ? <Text color="gray" dimColor>(awaiting reply…)</Text> : lines[0] || <Text color="gray" dimColor>message…   ·   end with \\ then Enter for newline   ·   Tab completes slash commands</Text>}
					</Text>
				</Box>
				{lines.slice(1).map((line, i) => (
					<Box key={i} flexDirection="row">
						<Text color={disabled ? 'gray' : 'cyan'}>{i === lines.length - 2 ? '└ ' : '│ '}</Text>
						<Text>{line}</Text>
					</Box>
				))}
			</Box>
		</Box>
	);
}

function SlashPalette({ commands }: { commands: ReadonlyArray<SlashCommand> }): JSX.Element {
	return (
		<Box borderStyle="round" borderColor="magenta" paddingX={1} flexDirection="column" marginBottom={0}>
			{commands.slice(0, 6).map((c) => (
				<Box key={c.name} flexDirection="row">
					<Text color="magenta">{c.name.padEnd(14)}</Text>
					<Text color="gray">{c.description}</Text>
				</Box>
			))}
			{commands.length > 6 ? <Text color="gray">  …{commands.length - 6} more — keep typing to filter.</Text> : null}
		</Box>
	);
}

function sharedPrefix(values: ReadonlyArray<string>): string {
	if (values.length === 0) {
		return '';
	}
	let prefix = values[0];
	for (let i = 1; i < values.length; i++) {
		while (!values[i].startsWith(prefix)) {
			prefix = prefix.slice(0, -1);
			if (!prefix) {
				return '';
			}
		}
	}
	return prefix;
}
