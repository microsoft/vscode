/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IEditorPosition, IPosition, IRange} from 'vs/editor/common/editorCommon';

export class Position implements IEditorPosition {

	public lineNumber: number;
	public column: number;

	constructor(lineNumber: number, column: number) {
		this.lineNumber = lineNumber;
		this.column = column;
	}

	public equals(other:IPosition): boolean {
		return Position.equals(this, other);
	}
	public static equals(a:IPosition, b:IPosition): boolean {
		if (!a && !b) {
			return true;
		}
		return (
			!!a &&
			!!b &&
			a.lineNumber === b.lineNumber &&
			a.column === b.column
		);
	}

	public isBefore(other:IPosition): boolean {
		return Position.isBefore(this, other);
	}
	public static isBefore(a:IPosition, b:IPosition): boolean {
		if (a.lineNumber < b.lineNumber) {
			return true;
		}
		if (b.lineNumber < a.lineNumber) {
			return false;
		}
		return a.column < b.column;
	}

	public isBeforeOrEqual(other:IPosition): boolean {
		return Position.isBeforeOrEqual(this, other);
	}
	public static isBeforeOrEqual(a:IPosition, b:IPosition): boolean {
		if (a.lineNumber < b.lineNumber) {
			return true;
		}
		if (b.lineNumber < a.lineNumber) {
			return false;
		}
		return a.column <= b.column;
	}

	public clone(): Position {
		return new Position(this.lineNumber, this.column);
	}

	public toString(): string {
		return '(' + this.lineNumber + ',' + this.column + ')';
	}

	// ---

	public static lift(pos:IPosition): IEditorPosition {
		return new Position(pos.lineNumber, pos.column);
	}

	public static isIPosition(obj: any): obj is IPosition {
		return (
			obj
			&& (typeof obj.lineNumber === 'number')
			&& (typeof obj.column === 'number')
		);
	}

	public static asEmptyRange(position:IPosition):IRange {
		return {
			startLineNumber: position.lineNumber,
			startColumn: position.column,
			endLineNumber: position.lineNumber,
			endColumn: position.column
		};
	}

	public static startPosition(range:IRange):IPosition {
		return {
			lineNumber: range.startLineNumber,
			column: range.startColumn
		};
	}

	public static endPosition(range:IRange):IPosition {
		return {
			lineNumber: range.endLineNumber,
			column: range.endColumn
		};
	}
}
