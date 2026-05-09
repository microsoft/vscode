/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text } from 'ink';
import * as React from 'react';
import type { TuiSessionInfo } from './types';

interface StatusBarProps {
	session: TuiSessionInfo;
	busy: boolean;
	/** Cumulative session cost in USD. H11 — live cost meter. */
	cost?: number;
	/** Cumulative input + output token total for the session. */
	totalTokens?: number;
}

/**
 * Persistent status line at the bottom of the chat screen. Shows the
 * specialist, model, working directory (basename), git branch when known, an
 * inline busy indicator while a turn is streaming, and (H11) a live cost
 * meter that ticks up after every assistant turn. Kept deliberately compact
 * so it does not steal vertical space from the transcript.
 */
export function StatusBar(props: StatusBarProps): JSX.Element {
	const { session, busy, cost, totalTokens } = props;
	const cwdLabel = session.cwd.split('/').filter(Boolean).slice(-2).join('/') || session.cwd;
	const costLabel = formatCost(cost ?? 0);
	const tokenLabel = formatTokens(totalTokens ?? 0);

	return (
		<Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="row" justifyContent="space-between">
			<Box flexDirection="row">
				<Text color="cyan">@{session.specialist}</Text>
				<Text color="gray">{'  ·  '}</Text>
				<Text color="magenta">{session.model}</Text>
				<Text color="gray">{'  ·  '}</Text>
				<Text color="green">{costLabel}</Text>
				<Text color="gray">{` · ${tokenLabel}`}</Text>
			</Box>
			<Box flexDirection="row">
				{session.branch ? (
					<>
						<Text color="green">{session.branch}</Text>
						<Text color="gray">{'  ·  '}</Text>
					</>
				) : null}
				<Text color="gray">{cwdLabel}</Text>
				{busy ? (
					<>
						<Text color="gray">{'  ·  '}</Text>
						<Text color="yellow">thinking…</Text>
					</>
				) : null}
			</Box>
		</Box>
	);
}

function formatCost(cost: number): string {
	if (cost <= 0) {
		return '$0.00';
	}
	if (cost < 0.01) {
		return '<$0.01';
	}
	return `$${cost.toFixed(2)}`;
}

function formatTokens(tokens: number): string {
	if (tokens === 0) {
		return '0 tok';
	}
	if (tokens < 1000) {
		return `${tokens} tok`;
	}
	if (tokens < 1_000_000) {
		return `${(tokens / 1000).toFixed(1)}k tok`;
	}
	return `${(tokens / 1_000_000).toFixed(2)}M tok`;
}
