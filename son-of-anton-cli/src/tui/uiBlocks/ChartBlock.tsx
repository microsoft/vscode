/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text } from 'ink';
import * as React from 'react';
import type { ChartProps } from './types';

const MAX_BAR_WIDTH = 32;
const FULL_BLOCK = '█';
const PARTIAL_BLOCKS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'] as const;

/**
 * Render a `chart` UI block (v1 supports `type: 'bar'` only). Each value is
 * a horizontal bar made of unicode block characters; the longest value pins
 * to MAX_BAR_WIDTH and the rest are scaled relatively. Sub-cell precision
 * via `▏▎▍…▉` makes the bars feel less choppy than pure full-block bars.
 */
export function ChartBlock(props: { props: ChartProps }): JSX.Element {
	const { title, labels, values } = props.props;

	if (!Array.isArray(labels) || !Array.isArray(values) || labels.length !== values.length) {
		return (
			<Box borderStyle="round" borderColor="red" paddingX={1}>
				<Text color="red">chart block: labels and values must be parallel arrays</Text>
			</Box>
		);
	}

	const numericValues = values.map((v) => (typeof v === 'number' && Number.isFinite(v) ? v : 0));
	const max = numericValues.reduce((m, v) => Math.max(m, v), 0);
	const labelWidth = labels.reduce((w, l) => Math.max(w, l.length), 0);

	return (
		<Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginY={0}>
			{title ? (
				<Text color="cyan" bold>
					{title}
				</Text>
			) : null}
			{numericValues.map((v, i) => (
				<Box key={i} flexDirection="row">
					<Text color="gray">{labels[i].padEnd(labelWidth)} </Text>
					<Text color="cyan">{renderBar(v, max)}</Text>
					<Text color="gray">{` ${formatNumber(v)}`}</Text>
				</Box>
			))}
		</Box>
	);
}

function renderBar(value: number, max: number): string {
	if (max <= 0) {
		return '';
	}
	const ratio = Math.max(0, value / max);
	const length = ratio * MAX_BAR_WIDTH;
	const fullBlocks = Math.floor(length);
	const fraction = length - fullBlocks;
	const partialIndex = Math.round(fraction * (PARTIAL_BLOCKS.length - 1));
	return FULL_BLOCK.repeat(fullBlocks) + (PARTIAL_BLOCKS[partialIndex] ?? '');
}

function formatNumber(value: number): string {
	if (!Number.isFinite(value)) {
		return '—';
	}
	if (Number.isInteger(value)) {
		return value.toString();
	}
	return value.toFixed(2);
}
