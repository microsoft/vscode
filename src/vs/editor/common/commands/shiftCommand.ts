/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Strings = require('vs/base/common/strings');
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import EditorCommon = require('vs/editor/common/editorCommon');
import {CursorMoveHelper} from 'vs/editor/common/controller/cursorMoveHelper';

export interface IShiftCommandOpts {
	isUnshift: boolean;
	tabSize: number;
	oneIndent: string;
}

export class ShiftCommand implements EditorCommon.ICommand {

	public static unshiftIndentCount(line:string, column:number, tabSize:number): number {
		// Determine the visible column where the content starts
		var contentStartVisibleColumn = CursorMoveHelper.visibleColumnFromColumn2(line, column, tabSize);

		var desiredTabStop = CursorMoveHelper.prevTabColumn(contentStartVisibleColumn, tabSize);

		// The `desiredTabStop` is a multiple of `tabSize` => determine the number of indents
		return desiredTabStop / tabSize;
	}

	public static shiftIndentCount(line:string, column:number, tabSize:number): number {
		// Determine the visible column where the content starts
		var contentStartVisibleColumn = CursorMoveHelper.visibleColumnFromColumn2(line, column, tabSize);

		var desiredTabStop = CursorMoveHelper.nextTabColumn(contentStartVisibleColumn, tabSize);

		// The `desiredTabStop` is a multiple of `tabSize` => determine the number of indents
		return desiredTabStop / tabSize;
	}

	private _opts: IShiftCommandOpts;
	private _selection: EditorCommon.IEditorSelection;
	private _selectionId: string;
	private _useLastEditRangeForCursorEndPosition: boolean;

	constructor(range: EditorCommon.IEditorSelection, opts:IShiftCommandOpts) {
		this._opts = opts;
		this._selection = range;
		this._useLastEditRangeForCursorEndPosition = false;
	}

	public getEditOperations(model: EditorCommon.ITokenizedModel, builder: EditorCommon.IEditOperationBuilder): void {
		var startLine = this._selection.startLineNumber,
			endLine = this._selection.endLineNumber;

		if (this._selection.endColumn === 1 && startLine !== endLine) {
			endLine = endLine - 1;
		}

		var lineNumber:number,
			tabSize = this._opts.tabSize,
			oneIndent = this._opts.oneIndent;

		// indents[i] represents i * oneIndent
		var indents: string[] = ['', oneIndent];

		// if indenting or outdenting on a whitespace only line
		if (this._selection.isEmpty()) {
			if (/^\s*$/.test(model.getLineContent(startLine))) {
				this._useLastEditRangeForCursorEndPosition = true;
			}
		}

		for (lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
			var lineText = model.getLineContent(lineNumber);
			var indentationEndIndex = Strings.firstNonWhitespaceIndex(lineText);

			if (this._opts.isUnshift) {
				if (lineText.length === 0 || indentationEndIndex === 0) {
					// empty line or line with no leading whitespace => nothing to do
					continue;
				}
			}

			if (indentationEndIndex === -1) {
				// the entire line is whitespace
				indentationEndIndex = lineText.length;
			}

			var desiredIndentCount: number;
			if (this._opts.isUnshift) {
				desiredIndentCount = ShiftCommand.unshiftIndentCount(lineText, indentationEndIndex + 1, tabSize);
			} else {
				desiredIndentCount = ShiftCommand.shiftIndentCount(lineText, indentationEndIndex + 1, tabSize);
			}

			// Fill `indents`, as needed
			for (var j = indents.length; j <= desiredIndentCount; j++) {
				indents[j] = indents[j-1] + oneIndent;
			}

			builder.addEditOperation(new Range(lineNumber, 1, lineNumber, indentationEndIndex + 1), indents[desiredIndentCount]);
		}

		this._selectionId = builder.trackSelection(this._selection);
	}

	public computeCursorState(model: EditorCommon.ITokenizedModel, helper: EditorCommon.ICursorStateComputerData): EditorCommon.IEditorSelection {
		if (this._useLastEditRangeForCursorEndPosition) {
			var lastOp = helper.getInverseEditOperations()[0];
			return new Selection(lastOp.range.endLineNumber, lastOp.range.endColumn, lastOp.range.endLineNumber, lastOp.range.endColumn);
		}
		return helper.getTrackedSelection(this._selectionId);
	}
}
