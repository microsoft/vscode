/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import {CursorMoveHelper} from 'vs/editor/common/controller/cursorMoveHelper';
import {Range} from 'vs/editor/common/core/range';
import {Selection} from 'vs/editor/common/core/selection';
import {ICommand, ICursorStateComputerData, IEditOperationBuilder, IEditorSelection, ITokenizedModel} from 'vs/editor/common/editorCommon';
import {getRawEnterActionAtPosition} from 'vs/editor/common/modes/supports/onEnter';

export interface IShiftCommandOpts {
	isUnshift: boolean;
	tabSize: number;
	oneIndent: string;
}

export class ShiftCommand implements ICommand {

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
	private _selection: IEditorSelection;
	private _selectionId: string;
	private _useLastEditRangeForCursorEndPosition: boolean;

	constructor(range: IEditorSelection, opts:IShiftCommandOpts) {
		this._opts = opts;
		this._selection = range;
		this._useLastEditRangeForCursorEndPosition = false;
	}

	public getEditOperations(model: ITokenizedModel, builder: IEditOperationBuilder): void {
		let startLine = this._selection.startLineNumber,
			endLine = this._selection.endLineNumber,
			_SPACE = ' '.charCodeAt(0);

		if (this._selection.endColumn === 1 && startLine !== endLine) {
			endLine = endLine - 1;
		}

		let lineNumber:number,
			tabSize = this._opts.tabSize,
			oneIndent = this._opts.oneIndent,
			shouldIndentEmptyLines = (startLine === endLine);

		// indents[i] represents i * oneIndent
		let indents: string[] = ['', oneIndent];

		// if indenting or outdenting on a whitespace only line
		if (this._selection.isEmpty()) {
			if (/^\s*$/.test(model.getLineContent(startLine))) {
				this._useLastEditRangeForCursorEndPosition = true;
			}
		}

		// keep track of previous line's "miss-alignment"
		let previousLineExtraSpaces = 0, extraSpaces = 0;
		for (lineNumber = startLine; lineNumber <= endLine; lineNumber++, previousLineExtraSpaces = extraSpaces) {
			extraSpaces = 0;
			let lineText = model.getLineContent(lineNumber);
			let indentationEndIndex = strings.firstNonWhitespaceIndex(lineText);

			if (this._opts.isUnshift && (lineText.length === 0 || indentationEndIndex === 0)) {
				// empty line or line with no leading whitespace => nothing to do
				continue;
			}

			if (!shouldIndentEmptyLines && !this._opts.isUnshift && lineText.length === 0) {
				// do not indent empty lines => nothing to do
				continue;
			}

			if (indentationEndIndex === -1) {
				// the entire line is whitespace
				indentationEndIndex = lineText.length;
			}

			if (lineNumber > 1) {
				let contentStartVisibleColumn = CursorMoveHelper.visibleColumnFromColumn2(lineText, indentationEndIndex + 1, tabSize);
				if (contentStartVisibleColumn % tabSize !== 0) {
					// The current line is "miss-aligned", so let's see if this is expected...
					// This can only happen when it has trailing commas in the indent
					let enterAction = getRawEnterActionAtPosition(model, lineNumber - 1, model.getLineMaxColumn(lineNumber - 1));
					if (enterAction) {
						extraSpaces = previousLineExtraSpaces;
						if (enterAction.appendText) {
							for (let j = 0, lenJ = enterAction.appendText.length; j < lenJ && extraSpaces < tabSize; j++) {
								if (enterAction.appendText.charCodeAt(j) === _SPACE) {
									extraSpaces++;
								} else {
									break;
								}
							}
						}
						if (enterAction.removeText) {
							extraSpaces = Math.max(0, extraSpaces - enterAction.removeText);
						}

						// Act as if `prefixSpaces` is not part of the indentation
						for (let j = 0; j < extraSpaces; j++) {
							if (indentationEndIndex === 0 || lineText.charCodeAt(indentationEndIndex - 1) !== _SPACE) {
								break;
							}
							indentationEndIndex--;
						}
					}
				}
			}


			if (this._opts.isUnshift && indentationEndIndex === 0) {
				// line with no leading whitespace => nothing to do
				continue;
			}

			let desiredIndentCount: number;
			if (this._opts.isUnshift) {
				desiredIndentCount = ShiftCommand.unshiftIndentCount(lineText, indentationEndIndex + 1, tabSize);
			} else {
				desiredIndentCount = ShiftCommand.shiftIndentCount(lineText, indentationEndIndex + 1, tabSize);
			}

			// Fill `indents`, as needed
			for (let j = indents.length; j <= desiredIndentCount; j++) {
				indents[j] = indents[j-1] + oneIndent;
			}

			builder.addEditOperation(new Range(lineNumber, 1, lineNumber, indentationEndIndex + 1), indents[desiredIndentCount]);
		}

		this._selectionId = builder.trackSelection(this._selection);
	}

	public computeCursorState(model: ITokenizedModel, helper: ICursorStateComputerData): IEditorSelection {
		if (this._useLastEditRangeForCursorEndPosition) {
			var lastOp = helper.getInverseEditOperations()[0];
			return new Selection(lastOp.range.endLineNumber, lastOp.range.endColumn, lastOp.range.endLineNumber, lastOp.range.endColumn);
		}
		return helper.getTrackedSelection(this._selectionId);
	}
}
