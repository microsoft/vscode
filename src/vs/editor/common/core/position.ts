/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import EditorCommon = require('vs/editor/common/editorCommon');

export class Position implements EditorCommon.IEditorPosition {

	public lineNumber: number;
	public column: number;

	constructor(lineNumber: number, column: number) {
		this.lineNumber = lineNumber;
		this.column = column;
	}

	public equals(other:EditorCommon.IPosition): boolean {
		return (!!other && this.lineNumber === other.lineNumber && this.column === other.column);
	}

	public isBefore(other:EditorCommon.IPosition): boolean {
		if (this.lineNumber < other.lineNumber) {
			return true;
		}
		if (other.lineNumber < this.lineNumber) {
			return false;
		}
		return this.column < other.column;
	}

	public isBeforeOrEqual(other:EditorCommon.IPosition): boolean {
		if (this.lineNumber < other.lineNumber) {
			return true;
		}
		if (other.lineNumber < this.lineNumber) {
			return false;
		}
		return this.column <= other.column;
	}

	public clone(): Position {
		return new Position(this.lineNumber, this.column);
	}

	public toString(): string {
		return '(' + this.lineNumber + ',' + this.column + ')';
	}

	// ---

	public static lift(pos:EditorCommon.IPosition): EditorCommon.IEditorPosition {
		return new Position(pos.lineNumber, pos.column);
	}

	public static isIPosition(obj: any): boolean {
		return (
			obj
			&& (typeof obj.lineNumber === 'number')
			&& (typeof obj.column === 'number')
		);
	}

	public static asEmptyRange(position:EditorCommon.IPosition):EditorCommon.IRange {
		return {
			startLineNumber: position.lineNumber,
			startColumn: position.column,
			endLineNumber: position.lineNumber,
			endColumn: position.column
		};
	}

	public static startPosition(range:EditorCommon.IRange):EditorCommon.IPosition {
		return {
			lineNumber: range.startLineNumber,
			column: range.startColumn
		};
	}

	public static endPosition(range:EditorCommon.IRange):EditorCommon.IPosition {
		return {
			lineNumber: range.endLineNumber,
			column: range.endColumn
		};
	}
}
