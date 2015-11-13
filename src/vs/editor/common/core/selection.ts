/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Range} from 'vs/editor/common/core/range';
import EditorCommon = require('vs/editor/common/editorCommon');

export class Selection extends Range implements EditorCommon.IEditorSelection {
	public selectionStartLineNumber: number;
	public selectionStartColumn: number;
	public positionLineNumber: number;
	public positionColumn: number;

	constructor(selectionStartLineNumber: number, selectionStartColumn: number, positionLineNumber: number, positionColumn: number) {
		this.selectionStartLineNumber = selectionStartLineNumber;
		this.selectionStartColumn = selectionStartColumn;
		this.positionLineNumber = positionLineNumber;
		this.positionColumn = positionColumn;
		super(selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn);
	}

	public clone(): EditorCommon.IEditorSelection {
		return new Selection(this.selectionStartLineNumber, this.selectionStartColumn, this.positionLineNumber, this.positionColumn);
	}

	public toString(): string {
		return '[' + this.selectionStartLineNumber + ',' + this.selectionStartColumn + ' -> ' + this.positionLineNumber + ',' + this.positionColumn + ']';
	}

	public equalsSelection(other: EditorCommon.ISelection): boolean {
		return (
			Selection.selectionsEqual(this, other)
		);
	}

	public getDirection(): EditorCommon.SelectionDirection {
		if (this.selectionStartLineNumber === this.startLineNumber && this.selectionStartColumn === this.startColumn) {
			return EditorCommon.SelectionDirection.LTR;
		}
		return EditorCommon.SelectionDirection.RTL;
	}

	public setEndPosition(endLineNumber: number, endColumn: number): EditorCommon.IEditorSelection {
		if (this.getDirection() === EditorCommon.SelectionDirection.LTR) {
			return new Selection(this.startLineNumber, this.startColumn, endLineNumber, endColumn);
		}
		return new Selection(endLineNumber, endColumn, this.startLineNumber, this.startColumn);
	}

	public setStartPosition(startLineNumber: number, startColumn: number): EditorCommon.IEditorSelection {
		if (this.getDirection() === EditorCommon.SelectionDirection.LTR) {
			return new Selection(startLineNumber, startColumn, this.endLineNumber, this.endColumn);
		}
		return new Selection(this.endLineNumber, this.endColumn, startLineNumber, startColumn);
	}

	// ----

	public static createSelection(selectionStartLineNumber: number, selectionStartColumn: number, positionLineNumber: number, positionColumn: number): EditorCommon.IEditorSelection {
		return new Selection(selectionStartLineNumber, selectionStartColumn, positionLineNumber, positionColumn);
	}

	public static liftSelection(sel:EditorCommon.ISelection): EditorCommon.IEditorSelection {
		return new Selection(sel.selectionStartLineNumber, sel.selectionStartColumn, sel.positionLineNumber, sel.positionColumn);
	}

	public static selectionsEqual(a:EditorCommon.ISelection, b:EditorCommon.ISelection): boolean {
		return (
			a.selectionStartLineNumber === b.selectionStartLineNumber &&
			a.selectionStartColumn === b.selectionStartColumn &&
			a.positionLineNumber === b.positionLineNumber &&
			a.positionColumn === b.positionColumn
		);
	}

	public static selectionsArrEqual(a:EditorCommon.ISelection[], b:EditorCommon.ISelection[]): boolean {
		if (a && !b || !a && b) {
			return false;
		}
		if (!a && !b) {
			return true;
		}
		if (a.length !== b.length) {
			return false;
		}
		for (var i = 0, len = a.length; i < len; i++) {
			if (!this.selectionsEqual(a[i], b[i])) {
				return false;
			}
		}
		return true;
	}

	public static isISelection(obj: any): boolean {
		return (
			obj
			&& (typeof obj.selectionStartLineNumber === 'number')
			&& (typeof obj.selectionStartColumn === 'number')
			&& (typeof obj.positionLineNumber === 'number')
			&& (typeof obj.positionColumn === 'number')
		);
	}

	public static createWithDirection(startLineNumber: number, startColumn: number, endLineNumber: number, endColumn: number, direction:EditorCommon.SelectionDirection): EditorCommon.IEditorSelection {

		if (direction === EditorCommon.SelectionDirection.LTR) {
			return new Selection(startLineNumber, startColumn, endLineNumber, endColumn);
		}

		return new Selection(endLineNumber, endColumn, startLineNumber, startColumn);
	}
}