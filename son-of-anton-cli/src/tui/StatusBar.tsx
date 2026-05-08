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
}

/**
 * Persistent status line at the bottom of the chat screen. Shows the
 * specialist, model, working directory (basename), git branch when known, and
 * an inline busy indicator while a turn is streaming. Kept deliberately
 * compact so it does not steal vertical space from the transcript.
 */
export function StatusBar(props: StatusBarProps): JSX.Element {
	const { session, busy } = props;
	const cwdLabel = session.cwd.split('/').filter(Boolean).slice(-2).join('/') || session.cwd;

	return (
		<Box borderStyle="single" borderColor="gray" paddingX={1} flexDirection="row" justifyContent="space-between">
			<Box flexDirection="row">
				<Text color="cyan">@{session.specialist}</Text>
				<Text color="gray">{'  ·  '}</Text>
				<Text color="magenta">{session.model}</Text>
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
