/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';
import { TextLength } from 'vs/editor/common/core/textLength';

export function rangeContainsPosition(range: Range, position: Position): boolean {
	if (position.lineNumber < range.startLineNumber || position.lineNumber > range.endLineNumber) {
		return false;
	}
	if (position.lineNumber === range.startLineNumber && position.column < range.startColumn) {
		return false;
	}
	if (position.lineNumber === range.endLineNumber && position.column >= range.endColumn) {
		return false;
	}
	return true;
}

export function lengthOfRange(range: Range): TextLength {
	if (range.startLineNumber === range.endLineNumber) {
		return new TextLength(0, range.endColumn - range.startColumn);
	} else {
		return new TextLength(range.endLineNumber - range.startLineNumber, range.endColumn - 1);
	}
}

export function lengthBetweenPositions(position1: Position, position2: Position): TextLength {
	if (position1.lineNumber === position2.lineNumber) {
		return new TextLength(0, position2.column - position1.column);
	} else {
		return new TextLength(position2.lineNumber - position1.lineNumber, position2.column - 1);
	}
}

export function addLength(position: Position, length: TextLength): Position {
	if (length.lineCount === 0) {
		return new Position(position.lineNumber, position.column + length.columnCount);
	} else {
		return new Position(position.lineNumber + length.lineCount, length.columnCount + 1);
	}
}

export function rangeIsBeforeOrTouching(range: Range, other: Range): boolean {
	return (
		range.endLineNumber < other.startLineNumber ||
		(range.endLineNumber === other.startLineNumber &&
			range.endColumn <= other.startColumn)
	);
}
