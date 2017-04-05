/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { CursorColumns } from 'vs/editor/common/controller/cursorCommon';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder, ITokenizedModel } from 'vs/editor/common/editorCommon';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { CharCode } from 'vs/base/common/charCode';

export interface IShiftCommandOpts {
	isUnshift: boolean;
	tabSize: number;
	oneIndent: string;
	useTabStops: boolean;
}

export class ShiftCommand implements ICommand {

	public static unshiftIndentCount(line: string, column: number, tabSize: number): number {
		// Determine the visible column where the content starts
		let contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(line, column, tabSize);

		let desiredTabStop = CursorColumns.prevTabStop(contentStartVisibleColumn, tabSize);

		// The `desiredTabStop` is a multiple of `tabSize` => determine the number of indents
		return desiredTabStop / tabSize;
	}

	public static shiftIndentCount(line: string, column: number, tabSize: number): number {
		// Determine the visible column where the content starts
		let contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(line, column, tabSize);

		let desiredTabStop = CursorColumns.nextTabStop(contentStartVisibleColumn, tabSize);

		// The `desiredTabStop` is a multiple of `tabSize` => determine the number of indents
		return desiredTabStop / tabSize;
	}

	private _opts: IShiftCommandOpts;
	private _selection: Selection;
	private _selectionId: string;
	private _useLastEditRangeForCursorEndPosition: boolean;

	constructor(range: Selection, opts: IShiftCommandOpts) {
		this._opts = opts;
		this._selection = range;
		this._useLastEditRangeForCursorEndPosition = false;
	}

	public getEditOperations(model: ITokenizedModel, builder: IEditOperationBuilder): void {
		const startLine = this._selection.startLineNumber;

		let endLine = this._selection.endLineNumber;
		if (this._selection.endColumn === 1 && startLine !== endLine) {
			endLine = endLine - 1;
		}

		const tabSize = this._opts.tabSize;
		const oneIndent = this._opts.oneIndent;
		const shouldIndentEmptyLines = (startLine === endLine);

		// if indenting or outdenting on a whitespace only line
		if (this._selection.isEmpty()) {
			if (/^\s*$/.test(model.getLineContent(startLine))) {
				this._useLastEditRangeForCursorEndPosition = true;
			}
		}

		if (this._opts.useTabStops) {
			// indents[i] represents i * oneIndent
			let indents: string[] = ['', oneIndent];

			// keep track of previous line's "miss-alignment"
			let previousLineExtraSpaces = 0, extraSpaces = 0;
			for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++ , previousLineExtraSpaces = extraSpaces) {
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
					let contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(lineText, indentationEndIndex + 1, tabSize);
					if (contentStartVisibleColumn % tabSize !== 0) {
						// The current line is "miss-aligned", so let's see if this is expected...
						// This can only happen when it has trailing commas in the indent
						let enterAction = LanguageConfigurationRegistry.getRawEnterActionAtPosition(model, lineNumber - 1, model.getLineMaxColumn(lineNumber - 1));
						if (enterAction) {
							extraSpaces = previousLineExtraSpaces;
							if (enterAction.appendText) {
								for (let j = 0, lenJ = enterAction.appendText.length; j < lenJ && extraSpaces < tabSize; j++) {
									if (enterAction.appendText.charCodeAt(j) === CharCode.Space) {
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
								if (indentationEndIndex === 0 || lineText.charCodeAt(indentationEndIndex - 1) !== CharCode.Space) {
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
					indents[j] = indents[j - 1] + oneIndent;
				}

				builder.addEditOperation(new Range(lineNumber, 1, lineNumber, indentationEndIndex + 1), indents[desiredIndentCount]);
			}
		} else {

			for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++) {
				const lineText = model.getLineContent(lineNumber);
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

				if (this._opts.isUnshift && indentationEndIndex === 0) {
					// line with no leading whitespace => nothing to do
					continue;
				}

				if (this._opts.isUnshift) {

					indentationEndIndex = Math.min(indentationEndIndex, tabSize);
					for (let i = 0; i < indentationEndIndex; i++) {
						const chr = lineText.charCodeAt(i);
						if (chr === CharCode.Tab) {
							indentationEndIndex = i + 1;
							break;
						}
					}

					builder.addEditOperation(new Range(lineNumber, 1, lineNumber, indentationEndIndex + 1), '');
				} else {
					builder.addEditOperation(new Range(lineNumber, 1, lineNumber, 1), oneIndent);
				}
			}
		}

		this._selectionId = builder.trackSelection(this._selection);
	}

	public computeCursorState(model: ITokenizedModel, helper: ICursorStateComputerData): Selection {
		if (this._useLastEditRangeForCursorEndPosition) {
			let lastOp = helper.getInverseEditOperations()[0];
			return new Selection(lastOp.range.endLineNumber, lastOp.range.endColumn, lastOp.range.endLineNumber, lastOp.range.endColumn);
		}
		return helper.getTrackedSelection(this._selectionId);
	}
}
