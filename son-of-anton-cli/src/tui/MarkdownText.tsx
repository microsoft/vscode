/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Text } from 'ink';
import * as React from 'react';

/**
 * Markdown renderer for the Ink transcript. Wraps `marked` + `marked-terminal`
 * to produce ANSI strings, then injects those into Ink's `<Text>` (Ink passes
 * raw ANSI through to the TTY untouched, so colour escapes survive).
 *
 * Marked is loaded lazily on first render so cold-start of the CLI doesn't
 * pay the parser cost when the user is just running `sota --version`. The
 * renderer instance itself is cached at module scope — `marked-terminal`
 * builds a non-trivial style table, and re-creating it per turn would be
 * wasteful.
 *
 * Streaming caveat: while a token is half-streamed in (e.g. an unclosed code
 * fence), `marked` may produce malformed output. We catch + fall back to the
 * raw text in that case so the user never sees a parser stack trace mid-turn.
 */
export interface MarkdownTextProps {
	readonly children: string;
}

interface MarkedLike {
	parse(input: string): string;
	setOptions(options: Record<string, unknown>): void;
}

let cachedRenderer: { marked: MarkedLike } | null = null;

function getRenderer(): MarkedLike {
	if (cachedRenderer) {
		return cachedRenderer.marked;
	}
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const markedModule = require('marked') as { marked: MarkedLike } | MarkedLike;
	const marked: MarkedLike = 'marked' in markedModule ? (markedModule as { marked: MarkedLike }).marked : (markedModule as MarkedLike);
	// eslint-disable-next-line @typescript-eslint/no-require-imports
	const terminalRendererModule = require('marked-terminal') as { default?: new (opts: Record<string, unknown>) => unknown };
	const TerminalRenderer = terminalRendererModule.default ?? (terminalRendererModule as unknown as new (opts: Record<string, unknown>) => unknown);
	marked.setOptions({
		// Renderer carries syntax-highlighting via the bundled `cli-highlight`
		// dependency, plus theme-friendly colour choices that pop on both
		// light and dark terminal backgrounds.
		renderer: new TerminalRenderer({
			width: Math.min(120, process.stdout.columns ?? 80),
			reflowText: true,
			tab: 2,
		}),
	});
	cachedRenderer = { marked };
	return marked;
}

export function MarkdownText(props: MarkdownTextProps): JSX.Element {
	const { children } = props;
	const rendered = React.useMemo(() => {
		if (!children) {
			return '';
		}
		try {
			const marked = getRenderer();
			const result = marked.parse(children);
			// `marked-terminal` ends every block with a trailing newline; trim
			// it so the Ink `<Text>` doesn't add a blank line per assistant
			// turn.
			return result.replace(/\n+$/, '');
		} catch {
			return children;
		}
	}, [children]);

	return <Text>{rendered}</Text>;
}
