/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
import { Position } from './position.js';
import { Range } from './range.js';

/**
 * Represents a non-negative length of text in terms of line and column count.
*/
export class TextLength {
	public static zero = new TextLength(0, 0);

	public static lengthDiffNonNegative(start: TextLength, end: TextLength): TextLength {
		if (end.isLessThan(start)) {
			return TextLength.zero;
		}
		if (start.lineCount === end.lineCount) {
			return new TextLength(0, end.columnCount - start.columnCount);
		} else {
			return new TextLength(end.lineCount - start.lineCount, end.columnCount);
		}
	}

	public static betweenPositions(position1: Position, position2: Position): TextLength {
		if (position1.lineNumber === position2.lineNumber) {
			return new TextLength(0, position2.column - position1.column);
		} else {
			return new TextLength(position2.lineNumber - position1.lineNumber, position2.column - 1);
		}
	}

	public static fromPosition(pos: Position): TextLength {
		return new TextLength(pos.lineNumber - 1, pos.column - 1);
	}

	public static ofRange(range: Range) {
		return TextLength.betweenPositions(range.getStartPosition(), range.getEndPosition());
	}

	public static ofText(text: string): TextLength {
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
		return new TextLength(line, column);
	}

	constructor(
		public readonly lineCount: number,
		public readonly columnCount: number
	) { }

	public isZero() {
		return this.lineCount === 0 && this.columnCount === 0;
	}

	public isLessThan(other: TextLength): boolean {
		if (this.lineCount !== other.lineCount) {
			return this.lineCount < other.lineCount;
		}
		return this.columnCount < other.columnCount;
	}

	public isGreaterThan(other: TextLength): boolean {
		if (this.lineCount !== other.lineCount) {
			return this.lineCount > other.lineCount;
		}
		return this.columnCount > other.columnCount;
	}

	public isGreaterThanOrEqualTo(other: TextLength): boolean {
		if (this.lineCount !== other.lineCount) {
			return this.lineCount > other.lineCount;
		}
		return this.columnCount >= other.columnCount;
	}

	public equals(other: TextLength): boolean {
		return this.lineCount === other.lineCount && this.columnCount === other.columnCount;
	}

	public compare(other: TextLength): number {
		if (this.lineCount !== other.lineCount) {
			return this.lineCount - other.lineCount;
		}
		return this.columnCount - other.columnCount;
	}

	public add(other: TextLength): TextLength {
		if (other.lineCount === 0) {
			return new TextLength(this.lineCount, this.columnCount + other.columnCount);
		} else {
			return new TextLength(this.lineCount + other.lineCount, other.columnCount);
		}
	}

	public createRange(startPosition: Position): Range {
		if (this.lineCount === 0) {
			return new Range(startPosition.lineNumber, startPosition.column, startPosition.lineNumber, startPosition.column + this.columnCount);
		} else {
			return new Range(startPosition.lineNumber, startPosition.column, startPosition.lineNumber + this.lineCount, this.columnCount + 1);
		}
	}

	public toRange(): Range {
		return new Range(1, 1, this.lineCount + 1, this.columnCount + 1);
	}

	public addToPosition(position: Position): Position {
		if (this.lineCount === 0) {
			return new Position(position.lineNumber, position.column + this.columnCount);
		} else {
			return new Position(position.lineNumber + this.lineCount, this.columnCount + 1);
		}
	}

	public addToRange(range: Range): Range {
		return Range.fromPositions(
			this.addToPosition(range.getStartPosition()),
			this.addToPosition(range.getEndPosition())
		);
	}

	toString() {
		return `${this.lineCount},${this.columnCount}`;
	}
}
