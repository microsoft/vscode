/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Box, Text } from 'ink';
import * as React from 'react';
import type { TableProps } from './types';

const MAX_CELL_LENGTH = 40;
const MIN_COLUMN_WIDTH = 4;

/**
 * Render a `table` UI block as an ASCII grid. Column widths are computed
 * from the wider of header / cell content (capped at MAX_CELL_LENGTH so a
 * single long cell doesn't blow the layout). Content longer than the cap
 * is truncated with an ellipsis so the table stays readable in the
 * terminal.
 */
export function TableBlock(props: { props: TableProps }): JSX.Element {
	const { caption, columns, rows } = props.props;
	if (!Array.isArray(columns) || columns.length === 0) {
		return (
			<Box borderStyle="round" borderColor="red" paddingX={1}>
				<Text color="red">table block: missing columns</Text>
			</Box>
		);
	}

	const cells = rows.map((row) => columns.map((col) => formatCell(row[col])));

	const widths = columns.map((col, i) => {
		const headerLen = col.length;
		const maxBodyLen = cells.reduce((max, r) => Math.max(max, r[i].length), 0);
		return Math.min(MAX_CELL_LENGTH, Math.max(MIN_COLUMN_WIDTH, headerLen, maxBodyLen));
	});

	return (
		<Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1} marginY={0}>
			{caption ? (
				<Text color="cyan" bold>
					{caption}
				</Text>
			) : null}
			<Text color="gray">{renderRow(columns, widths, true)}</Text>
			<Text color="gray">{renderSeparator(widths)}</Text>
			{cells.map((row, i) => (
				<Text key={i}>{renderRow(row, widths, false)}</Text>
			))}
		</Box>
	);
}

function formatCell(value: unknown): string {
	if (value === null || value === undefined) {
		return '';
	}
	if (typeof value === 'string') {
		return truncate(value, MAX_CELL_LENGTH);
	}
	if (typeof value === 'number' || typeof value === 'boolean') {
		return String(value);
	}
	return truncate(JSON.stringify(value), MAX_CELL_LENGTH);
}

function truncate(value: string, max: number): string {
	if (value.length <= max) {
		return value;
	}
	return `${value.slice(0, max - 1)}…`;
}

function renderRow(values: ReadonlyArray<string>, widths: ReadonlyArray<number>, isHeader: boolean): string {
	const padded = values.map((v, i) => v.padEnd(widths[i] ?? v.length));
	const joined = padded.join('  ');
	return isHeader ? joined.toUpperCase() : joined;
}

function renderSeparator(widths: ReadonlyArray<number>): string {
	return widths.map((w) => '─'.repeat(w)).join('  ');
}
