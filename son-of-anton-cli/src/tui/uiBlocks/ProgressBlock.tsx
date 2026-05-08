/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text } from 'ink';
import * as React from 'react';
import type { ProgressProps } from './types';

/**
 * Render a `progress` UI block as a vertical step list. `current` is the
 * zero-based index of the in-flight step; values < 0 mean "not started",
 * values >= steps.length mean "all done". Each step gets a glyph
 * appropriate to its state (✓ done, ◇ active, ○ pending).
 */
export function ProgressBlock(props: { props: ProgressProps }): JSX.Element {
	const { steps, current } = props.props;
	if (!Array.isArray(steps) || steps.length === 0) {
		return (
			<Box borderStyle="round" borderColor="red" paddingX={1}>
				<Text color="red">progress block: steps array is empty</Text>
			</Box>
		);
	}

	const safeCurrent = typeof current === 'number' ? current : -1;
	const allDone = safeCurrent >= steps.length;

	return (
		<Box borderStyle="round" borderColor="cyan" flexDirection="column" paddingX={1} marginY={0}>
			<Text color="cyan" bold>
				{allDone ? `Progress · all done (${steps.length}/${steps.length})` : `Progress (${Math.max(0, safeCurrent)}/${steps.length})`}
			</Text>
			{steps.map((step, i) => {
				const state = i < safeCurrent || allDone ? 'done' : i === safeCurrent ? 'active' : 'pending';
				const glyph = state === 'done' ? '✓' : state === 'active' ? '◇' : '○';
				const color = state === 'done' ? 'green' : state === 'active' ? 'cyan' : 'gray';
				return (
					<Box key={i} flexDirection="row">
						<Text color={color}>{`${glyph} `}</Text>
						<Text color={state === 'pending' ? 'gray' : 'white'} bold={state === 'active'}>
							{step}
						</Text>
					</Box>
				);
			})}
		</Box>
	);
}
