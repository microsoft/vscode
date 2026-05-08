/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text } from 'ink';
import * as React from 'react';

interface SuggestionsProps {
	suggestions: ReadonlyArray<string>;
	highlight: number;
}

/**
 * Tab-cyclable follow-up suggestions strip shown above the composer. The
 * highlighted suggestion is the one Enter would send if the user pressed
 * Tab instead of typing — the Composer owns the cycle / commit behaviour
 * via its own `useInput`.
 *
 * Suggestions arrive from one of two sources today:
 *   • LLM-emitted, parsed by `extractSuggestionsFromAssistantText` from the
 *     last assistant turn
 *   • Static fallback set when the LLM doesn't emit any
 *
 * Phase CLI4 (full) will add a small post-turn LLM call for richer
 * suggestions when the user opts into it via config.
 */
export function Suggestions(props: SuggestionsProps): JSX.Element | null {
	const { suggestions, highlight } = props;
	if (suggestions.length === 0) {
		return null;
	}
	return (
		<Box paddingX={1} marginTop={0} flexDirection="column">
			<Text color="gray">{'follow-ups · Tab to cycle · Enter on highlighted to send'}</Text>
			<Box flexDirection="row">
				{suggestions.map((s, i) => {
					const focused = i === highlight;
					return (
						<Box key={i} marginRight={2}>
							<Text color={focused ? 'cyan' : 'gray'} bold={focused}>
								{focused ? `‹ ${s} ›` : `  ${s}  `}
							</Text>
						</Box>
					);
				})}
			</Box>
		</Box>
	);
}

const STATIC_FALLBACKS: ReadonlyArray<string> = [
	'Show me the diff',
	'Run the tests',
	'Explain that further',
];

/**
 * Parse a sentinel block from the assistant's last reply of the form:
 *
 *   <<sota:suggestions>>
 *   ["Run tests", "Show diff", "What's next?"]
 *   <<sota:end>>
 *
 * Falls back to a curated static set when the agent didn't emit one. The
 * sentinel format is intentionally noisy so it survives round-tripping
 * through markdown renderers; future work will move the contract onto a
 * dedicated tool emission rather than a sentinel block (cleaner but
 * requires a core change + retraining the system prompts).
 */
export function extractSuggestionsFromAssistantText(text: string): ReadonlyArray<string> {
	const match = text.match(/<<sota:suggestions>>\s*([\s\S]*?)\s*<<sota:end>>/);
	if (!match) {
		return STATIC_FALLBACKS;
	}
	try {
		const parsed = JSON.parse(match[1]) as unknown;
		if (Array.isArray(parsed) && parsed.every((p) => typeof p === 'string')) {
			return (parsed as string[]).slice(0, 5);
		}
	} catch {
		// Fall through to fallbacks on malformed JSON.
	}
	return STATIC_FALLBACKS;
}

/**
 * Strip the sentinel block from the rendered assistant text so users don't
 * see the raw protocol. Called from the transcript pipeline before
 * rendering markdown.
 */
export function stripSuggestionsSentinel(text: string): string {
	return text.replace(/<<sota:suggestions>>[\s\S]*?<<sota:end>>\s*$/, '').trimEnd();
}
