/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IRange, Range } from './core/range.js';
import { ITextModel } from './model.js';

export class VirtualSpaceRangeExtraData {
	constructor(
		public readonly startLeftoverVisibleColumns: number,
		public readonly endLeftoverVisibleColumns: number,
	) { }
}

export function virtualSpaceRangeExtraData(model: ITextModel, range: IRange, clippedRange: Range): VirtualSpaceRangeExtraData | null {
	if (
		clippedRange.startLineNumber === range.startLineNumber
		&& clippedRange.startColumn === range.startColumn
		&& clippedRange.endLineNumber === range.endLineNumber
		&& clippedRange.endColumn === range.endColumn
	) {
		return null;
	}

	const initialStartLineNumber = range.startLineNumber;
	const initialStartColumn = range.startColumn;
	const initialEndLineNumber = range.endLineNumber;
	const initialEndColumn = range.endColumn;

	const startLineNumber = Math.floor((typeof initialStartLineNumber === 'number' && !isNaN(initialStartLineNumber)) ? initialStartLineNumber : 1);
	const startColumn = Math.floor((typeof initialStartColumn === 'number' && !isNaN(initialStartColumn)) ? initialStartColumn : 1);
	const endLineNumber = Math.floor((typeof initialEndLineNumber === 'number' && !isNaN(initialEndLineNumber)) ? initialEndLineNumber : 1);
	const endColumn = Math.floor((typeof initialEndColumn === 'number' && !isNaN(initialEndColumn)) ? initialEndColumn : 1);

	let startLeftover: number = 0;
	if (clippedRange.startLineNumber === startLineNumber && clippedRange.startColumn < startColumn) {
		startLeftover = startColumn - clippedRange.startColumn;
	}

	let endLeftover: number = 0;
	if (clippedRange.endLineNumber === endLineNumber && clippedRange.endColumn < endColumn) {
		endLeftover = endColumn - clippedRange.endColumn;
	}

	return {
		startLeftoverVisibleColumns: startLeftover,
		endLeftoverVisibleColumns: endLeftover,
	};
}

export function restoreVirtualSpaceRange(model: ITextModel, clippedRange: Range, extra: VirtualSpaceRangeExtraData): Range {
	const startLineNumber = clippedRange.startLineNumber;
	let startColumn = clippedRange.startColumn;
	if (extra.startLeftoverVisibleColumns > 0) {
		const maxStartColumn = model.getLineMaxColumn(startLineNumber);
		if (clippedRange.startColumn >= maxStartColumn) {
			startColumn = maxStartColumn + extra.startLeftoverVisibleColumns;
		}
	}

	const endLineNumber = clippedRange.endLineNumber;
	let endColumn = clippedRange.endColumn;
	if (extra.endLeftoverVisibleColumns > 0) {
		const maxEndColumn = model.getLineMaxColumn(endLineNumber);
		if (clippedRange.endColumn >= maxEndColumn) {
			endColumn = maxEndColumn + extra.endLeftoverVisibleColumns;
		}
	}

	return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
}

