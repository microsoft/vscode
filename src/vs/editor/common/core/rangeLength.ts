/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Position } from 'vs/editor/common/core/position';
import { Range } from 'vs/editor/common/core/range';

/**
 * Represents a non-negative length of text in terms of line and column count.
*/
export class RangeLength {
	public static zero = new RangeLength(0, 0);

	public static lengthDiffNonNegative(start: RangeLength, end: RangeLength): RangeLength {
		if (end.isLessThan(start)) {
			return RangeLength.zero;
		}
		if (start.lineCount === end.lineCount) {
			return new RangeLength(0, end.columnCount - start.columnCount);
		} else {
			return new RangeLength(end.lineCount - start.lineCount, end.columnCount);
		}
	}

	public static betweenPositions(position1: Position, position2: Position): RangeLength {
		if (position1.lineNumber === position2.lineNumber) {
			return new RangeLength(0, position2.column - position1.column);
		} else {
			return new RangeLength(position2.lineNumber - position1.lineNumber, position2.column - 1);
		}
	}

	public static ofRange(range: Range) {
		return RangeLength.betweenPositions(range.getStartPosition(), range.getEndPosition());
	}

	public static ofText(text: string): RangeLength {
		let line = 0;
		let column = 0;
		for (const c of text) {
			if (c === '\n') {
				line++;
				column = 0;
			} else {
				column++;
			}
		}
		return new RangeLength(line, column);
	}

	constructor(
		public readonly lineCount: number,
		public readonly columnCount: number
	) { }

	public isZero() {
		return this.lineCount === 0 && this.columnCount === 0;
	}

	public isLessThan(other: RangeLength): boolean {
		if (this.lineCount !== other.lineCount) {
			return this.lineCount < other.lineCount;
		}
		return this.columnCount < other.columnCount;
	}

	public isGreaterThan(other: RangeLength): boolean {
		if (this.lineCount !== other.lineCount) {
			return this.lineCount > other.lineCount;
		}
		return this.columnCount > other.columnCount;
	}

	public equals(other: RangeLength): boolean {
		return this.lineCount === other.lineCount && this.columnCount === other.columnCount;
	}

	public compare(other: RangeLength): number {
		if (this.lineCount !== other.lineCount) {
			return this.lineCount - other.lineCount;
		}
		return this.columnCount - other.columnCount;
	}

	public add(other: RangeLength): RangeLength {
		if (other.lineCount === 0) {
			return new RangeLength(this.lineCount, this.columnCount + other.columnCount);
		} else {
			return new RangeLength(this.lineCount + other.lineCount, other.columnCount);
		}
	}

	public createRange(startPosition: Position): Range {
		if (this.lineCount === 0) {
			return new Range(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column + this.columnCount);
		} else {
			return new Range(startPosition.lineNumber, startPosition.column, startPosition.lineNumber + this.lineCount, this.columnCount + 1);
		}
	}

	public addToPosition(position: Position): Position {
		if (this.lineCount === 0) {
			return new Position(position.lineNumber, position.column + this.columnCount);
		} else {
			return new Position(position.lineNumber + this.lineCount, this.columnCount + 1);
		}
	}

	toString() {
		return `${this.lineCount},${this.columnCount}`;
	}
}
