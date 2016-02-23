/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

'use strict';

import {Position} from 'vs/editor/common/core/position';
import {IEditorPosition, IEditorRange, IPosition, IRange} from 'vs/editor/common/editorCommon';

export class Range implements IEditorRange {

	public startLineNumber:number;
	public startColumn:number;
	public endLineNumber:number;
	public endColumn:number;

	constructor(startLineNumber:number, startColumn:number, endLineNumber:number, endColumn:number) {
		if ((startLineNumber > endLineNumber) || (startLineNumber === endLineNumber && startColumn > endColumn)) {
			this.startLineNumber = endLineNumber;
			this.startColumn = endColumn;
			this.endLineNumber = startLineNumber;
			this.endColumn = startColumn;
		} else {
			this.startLineNumber = startLineNumber;
			this.startColumn = startColumn;
			this.endLineNumber = endLineNumber;
			this.endColumn = endColumn;
		}
	}

	public isEmpty(): boolean {
		return Range.isEmpty(this);
	}

	public containsPosition(position:IPosition): boolean {
		return Range.containsPosition(this, position);
	}

	public containsRange(range:IRange): boolean {
		return Range.containsRange(this, range);
	}

	public plusRange(range:IRange): Range {
		return Range.plusRange(this, range);
	}

	public intersectRanges(range:IRange): Range {
		return Range.intersectRanges(this, range);
	}

	public equalsRange(other:IRange): boolean {
		return Range.equalsRange(this, other);
	}

	public getEndPosition(): IEditorPosition {
		return new Position(this.endLineNumber, this.endColumn);
	}

	public getStartPosition(): IEditorPosition {
		return new Position(this.startLineNumber, this.startColumn);
	}

	public cloneRange(): Range {
		return new Range(this.startLineNumber, this.startColumn, this.endLineNumber, this.endColumn);
	}

	public toString(): string {
		return '[' + this.startLineNumber + ',' + this.startColumn + ' -> ' + this.endLineNumber + ',' + this.endColumn + ']';
	}

	public setEndPosition(endLineNumber: number, endColumn: number): IEditorRange {
		return new Range(this.startLineNumber, this.startColumn, endLineNumber, endColumn);
	}

	public setStartPosition(startLineNumber: number, startColumn: number): IEditorRange {
		return new Range(startLineNumber, startColumn, this.endLineNumber, this.endColumn);
	}

	public collapseToStart():Range  {
		return new Range(this.startLineNumber, this.startColumn, this.startLineNumber, this.startColumn);
	}

	// ---

	public static lift(range:IRange): IEditorRange {
		if (!range) {
			return null;
		}
		return new Range(range.startLineNumber, range.startColumn, range.endLineNumber, range.endColumn);
	}

	public static isIRange(obj: any): obj is IRange {
		return (
			obj
			&& (typeof obj.startLineNumber === 'number')
			&& (typeof obj.startColumn === 'number')
			&& (typeof obj.endLineNumber === 'number')
			&& (typeof obj.endColumn === 'number')
		);
	}

	public static isEmpty(range:IRange): boolean {
		return (range.startLineNumber === range.endLineNumber && range.startColumn === range.endColumn);
	}

	public static containsPosition(range:IRange, position:IPosition): boolean {
		if (position.lineNumber < range.startLineNumber || position.lineNumber > range.endLineNumber) {
			return false;
		}
		if (position.lineNumber === range.startLineNumber && position.column < range.startColumn) {
			return false;
		}
		if (position.lineNumber === range.endLineNumber && position.column > range.endColumn) {
			return false;
		}
		return true;
	}

	public static containsRange(range:IRange, otherRange:IRange): boolean {
		if (otherRange.startLineNumber < range.startLineNumber || otherRange.endLineNumber < range.startLineNumber) {
			return false;
		}
		if (otherRange.startLineNumber > range.endLineNumber || otherRange.endLineNumber > range.endLineNumber) {
			return false;
		}
		if (otherRange.startLineNumber === range.startLineNumber && otherRange.startColumn < range.startColumn) {
			return false;
		}
		if (otherRange.endLineNumber === range.endLineNumber && otherRange.endColumn > range.endColumn) {
			return false;
		}
		return true;
	}

	public static areIntersectingOrTouching(a:IRange, b:IRange): boolean {
		// Check if `a` is before `b`
		if (a.endLineNumber < b.startLineNumber || (a.endLineNumber === b.startLineNumber && a.endColumn < b.startColumn)) {
			return false;
		}

		// Check if `b` is before `a`
		if (b.endLineNumber < a.startLineNumber || (b.endLineNumber === a.startLineNumber && b.endColumn < a.startColumn)) {
			return false;
		}

		// These ranges must intersect
		return true;
	}

	public static intersectRanges(a:IRange, b:IRange): Range {
		var resultStartLineNumber = a.startLineNumber,
			resultStartColumn = a.startColumn,
			resultEndLineNumber = a.endLineNumber,
			resultEndColumn = a.endColumn,
			otherStartLineNumber = b.startLineNumber,
			otherStartColumn = b.startColumn,
			otherEndLineNumber = b.endLineNumber,
			otherEndColumn = b.endColumn;

		if (resultStartLineNumber < otherStartLineNumber) {
			resultStartLineNumber = otherStartLineNumber;
			resultStartColumn = otherStartColumn;
		} else if (resultStartLineNumber === otherStartLineNumber) {
			resultStartColumn = Math.max(resultStartColumn, otherStartColumn);
		}

		if (resultEndLineNumber > otherEndLineNumber) {
			resultEndLineNumber = otherEndLineNumber;
			resultEndColumn = otherEndColumn;
		} else if (resultEndLineNumber === otherEndLineNumber) {
			resultEndColumn = Math.min(resultEndColumn, otherEndColumn);
		}

		// Check if selection is now empty
		if (resultStartLineNumber > resultEndLineNumber) {
			return null;
		}
		if (resultStartLineNumber === resultEndLineNumber && resultStartColumn > resultEndColumn) {
			return null;
		}
		return new Range(resultStartLineNumber, resultStartColumn, resultEndLineNumber, resultEndColumn);
	}

	public static plusRange(a:IRange, b:IRange): Range {
		var startLineNumber:number, startColumn:number, endLineNumber:number, endColumn:number;
		if (b.startLineNumber < a.startLineNumber) {
			startLineNumber = b.startLineNumber;
			startColumn = b.startColumn;
		} else if (b.startLineNumber === a.startLineNumber) {
			startLineNumber = b.startLineNumber;
			startColumn = Math.min(b.startColumn, a.startColumn);
		} else {
			startLineNumber = a.startLineNumber;
			startColumn = a.startColumn;
		}

		if (b.endLineNumber > a.endLineNumber) {
			endLineNumber = b.endLineNumber;
			endColumn = b.endColumn;
		} else if (b.endLineNumber === a.endLineNumber) {
			endLineNumber = b.endLineNumber;
			endColumn = Math.max(b.endColumn, a.endColumn);
		} else {
			endLineNumber = a.endLineNumber;
			endColumn = a.endColumn;
		}

		return new Range(startLineNumber, startColumn, endLineNumber, endColumn);
	}

	public static equalsRange(a:IRange, b:IRange): boolean {
		return (
			!!a &&
			!!b &&
			a.startLineNumber === b.startLineNumber &&
			a.startColumn === b.startColumn &&
			a.endLineNumber === b.endLineNumber &&
			a.endColumn === b.endColumn
		);
	}

	/**
	 * A function that compares ranges, useful for sorting ranges
	 * It will first compare ranges on the startPosition and then on the endPosition
	 */
	public static compareRangesUsingStarts(a:IRange, b:IRange): number {
		if (a.startLineNumber === b.startLineNumber) {
			if (a.startColumn === b.startColumn) {
				if (a.endLineNumber === b.endLineNumber) {
					return a.endColumn - b.endColumn;
				}
				return a.endLineNumber - b.endLineNumber;
			}
			return a.startColumn - b.startColumn;
		}
		return a.startLineNumber - b.startLineNumber;
	}

	/**
	 * A function that compares ranges, useful for sorting ranges
	 * It will first compare ranges on the endPosition and then on the startPosition
	 */
	public static compareRangesUsingEnds(a:IRange, b:IRange): number {
		if (a.endLineNumber === b.endLineNumber) {
			if (a.endColumn === b.endColumn) {
				if (a.startLineNumber === b.startLineNumber) {
					return a.startColumn - b.startColumn;
				}
				return a.startLineNumber - b.startLineNumber;
			}
			return a.endColumn - b.endColumn;
		}
		return a.endLineNumber - b.endLineNumber;
	}

	public static spansMultipleLines(range:IRange):boolean {
		return range.endLineNumber > range.startLineNumber;
	}

	public static hashCode(range:IRange):number {
		return (range.startLineNumber * 17) + (range.startColumn * 23) + (range.endLineNumber * 29) + (range.endColumn * 37);
	}

	public static collapseToStart(range:IRange):IRange  {
		return {
			startLineNumber: range.startLineNumber,
			startColumn: range.startColumn,
			endLineNumber: range.startLineNumber,
			endColumn: range.startColumn
		};
	}

}

