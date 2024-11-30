/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IPosition, Position } from './core/position.js';
import { IRange, Range } from './core/range.js';
import { ITextModel } from './model.js';
import { ICursorSimpleModel } from './cursorCommon.js';

export function validVirtualSpacePosition(originalPosition: IPosition, validPosition: Position): Position {
	// If validation clipped the column, we are in virtual space and the original position
	// was a valid virtual space position
	return (
		originalPosition.lineNumber === validPosition.lineNumber && originalPosition.column >= validPosition.column
			? Position.lift(originalPosition)
			: validPosition
	);
}

export function calcLeftoverVisibleColumns(position: IPosition, validPosition: Position): number {
	return (
		position.lineNumber === validPosition.lineNumber && position.column > validPosition.column
			? position.column - validPosition.column
			: 0
	);
}

export class PositionTripple {
	constructor(
		public validPosition: Position,
		public readonly leftoverVisibleColumns: number,
	) { }

	public static fromModelPosition(model: ICursorSimpleModel, position: Position): PositionTripple {
		// As far as I can tell, during normal editing the line numbers are always valid.
		// However some unit tests use values out of range. To be on the safe side, I'm patching it here.
		const lineNumberIsValid = position.lineNumber >= 1 && position.lineNumber <= model.getLineCount();
		const maxColumn = lineNumberIsValid ? model.getLineMaxColumn(position.lineNumber) : 1;
		if (position.column > maxColumn) {
			return new PositionTripple(new Position(position.lineNumber, maxColumn), position.column - maxColumn);
		}
		return new PositionTripple(position, 0);
	}

	public static fromValidatedPosition(position: IPosition, validPosition: Position): PositionTripple {
		return new PositionTripple(validPosition, calcLeftoverVisibleColumns(position, validPosition));
	}
}


export class VirtualSpaceRangeExtraData {
	constructor(
		public readonly startLeftoverVisibleColumns: number,
		public readonly endLeftoverVisibleColumns: number,
	) { }

	public restore(model: ITextModel, clippedRange: Range): Range {
		const startLineNumber = clippedRange.startLineNumber;
		let startColumn = clippedRange.startColumn;
		if (this.startLeftoverVisibleColumns > 0) {
			const maxStartColumn = model.getLineMaxColumn(startLineNumber);
			if (clippedRange.startColumn >= maxStartColumn) {
				startColumn = maxStartColumn + this.startLeftoverVisibleColumns;
			}
		}

		const endLineNumber = clippedRange.endLineNumber;
		let endColumn = clippedRange.endColumn;
		if (this.endLeftoverVisibleColumns > 0) {
			const maxEndColumn = model.getLineMaxColumn(endLineNumber);
			if (clippedRange.endColumn >= maxEndColumn) {
				endColumn = maxEndColumn + this.endLeftoverVisibleColumns;
			}
		}

		return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
	}
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

	return new VirtualSpaceRangeExtraData(startLeftover, endLeftover);
}

