/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharCode } from '../../../base/common/charCode.js';
import * as strings from '../../../base/common/strings.js';
import { CursorColumns } from '../core/cursorColumns.js';
import { Range } from '../core/range.js';
import { Selection, SelectionDirection } from '../core/selection.js';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from '../editorCommon.js';
import { ITextModel } from '../model.js';
import { EditorAutoIndentStrategy } from '../config/editorOptions.js';
import { getEnterAction } from '../languages/enterAction.js';
import { ILanguageConfigurationService } from '../languages/languageConfigurationRegistry.js';

export interface IShiftCommandOpts {
	isUnshift: boolean;
	tabSize: number;
	indentSize: number;
	insertSpaces: boolean;
	useTabStops: boolean;
	autoIndent: EditorAutoIndentStrategy;
}

const repeatCache: { [str: string]: string[] } = Object.create(null);
function cachedStringRepeat(str: string, count: number): string {
	if (count <= 0) {
		return '';
	}
	if (!repeatCache[str]) {
		repeatCache[str] = ['', str];
	}
	const cache = repeatCache[str];
	for (let i = cache.length; i <= count; i++) {
		cache[i] = cache[i - 1] + str;
	}
	return cache[count];
}

export class ShiftCommand implements ICommand {

	public static unshiftIndent(line: string, column: number, tabSize: number, indentSize: number, insertSpaces: boolean): string {
		// Determine the visible column where the content starts
		const contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(line, column, tabSize);

		if (insertSpaces) {
			const indent = cachedStringRepeat(' ', indentSize);
			const desiredTabStop = CursorColumns.prevIndentTabStop(contentStartVisibleColumn, indentSize);
			const indentCount = desiredTabStop / indentSize; // will be an integer
			return cachedStringRepeat(indent, indentCount);
		} else {
			const indent = '\t';
			const desiredTabStop = CursorColumns.prevRenderTabStop(contentStartVisibleColumn, tabSize);
			const indentCount = desiredTabStop / tabSize; // will be an integer
			return cachedStringRepeat(indent, indentCount);
		}
	}

	public static shiftIndent(line: string, column: number, tabSize: number, indentSize: number, insertSpaces: boolean): string {
		// Determine the visible column where the content starts
		const contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(line, column, tabSize);

		if (insertSpaces) {
			const indent = cachedStringRepeat(' ', indentSize);
			const desiredTabStop = CursorColumns.nextIndentTabStop(contentStartVisibleColumn, indentSize);
			const indentCount = desiredTabStop / indentSize; // will be an integer
			return cachedStringRepeat(indent, indentCount);
		} else {
			const indent = '\t';
			const desiredTabStop = CursorColumns.nextRenderTabStop(contentStartVisibleColumn, tabSize);
			const indentCount = desiredTabStop / tabSize; // will be an integer
			return cachedStringRepeat(indent, indentCount);
		}
	}

	private readonly _opts: IShiftCommandOpts;
	private readonly _selection: Selection;
	private _selectionId: string | null;
	private _useLastEditRangeForCursorEndPosition: boolean;
	private _selectionStartColumnStaysPut: boolean;

	constructor(
		range: Selection,
		opts: IShiftCommandOpts,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService
	) {
		this._opts = opts;
		this._selection = range;
		this._selectionId = null;
		this._useLastEditRangeForCursorEndPosition = false;
		this._selectionStartColumnStaysPut = false;
	}

	private _addEditOperation(builder: IEditOperationBuilder, range: Range, text: string) {
		if (this._useLastEditRangeForCursorEndPosition) {
			builder.addTrackedEditOperation(range, text);
		} else {
			builder.addEditOperation(range, text);
		}
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {
		const startLine = this._selection.startLineNumber;

		let endLine = this._selection.endLineNumber;
		if (this._selection.endColumn === 1 && startLine !== endLine) {
			endLine = endLine - 1;
		}

		const { tabSize, indentSize, insertSpaces } = this._opts;
		const shouldIndentEmptyLines = (startLine === endLine);

		if (this._opts.useTabStops) {
			// if indenting or outdenting on a whitespace only line
			if (this._selection.isEmpty()) {
				if (/^\s*$/.test(model.getLineContent(startLine))) {
					this._useLastEditRangeForCursorEndPosition = true;
				}
			}

			// keep track of previous line's "miss-alignment"
			let previousLineExtraSpaces = 0, extraSpaces = 0;
			for (let lineNumber = startLine; lineNumber <= endLine; lineNumber++, previousLineExtraSpaces = extraSpaces) {
				extraSpaces = 0;
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

				if (lineNumber > 1) {
					const contentStartVisibleColumn = CursorColumns.visibleColumnFromColumn(lineText, indentationEndIndex + 1, tabSize);
					if (contentStartVisibleColumn % indentSize !== 0) {
						// The current line is "miss-aligned", so let's see if this is expected...
						// This can only happen when it has trailing commas in the indent
						if (model.tokenization.isCheapToTokenize(lineNumber - 1)) {
							const enterAction = getEnterAction(this._opts.autoIndent, model, new Range(lineNumber - 1, model.getLineMaxColumn(lineNumber - 1), lineNumber - 1, model.getLineMaxColumn(lineNumber - 1)), this._languageConfigurationService);
							if (enterAction) {
								extraSpaces = previousLineExtraSpaces;
								if (enterAction.appendText) {
									for (let j = 0, lenJ = enterAction.appendText.length; j < lenJ && extraSpaces < indentSize; j++) {
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
				}


				if (this._opts.isUnshift && indentationEndIndex === 0) {
					// line with no leading whitespace => nothing to do
					continue;
				}

				let desiredIndent: string;
				if (this._opts.isUnshift) {
					desiredIndent = ShiftCommand.unshiftIndent(lineText, indentationEndIndex + 1, tabSize, indentSize, insertSpaces);
				} else {
					desiredIndent = ShiftCommand.shiftIndent(lineText, indentationEndIndex + 1, tabSize, indentSize, insertSpaces);
				}

				this._addEditOperation(builder, new Range(lineNumber, 1, lineNumber, indentationEndIndex + 1), desiredIndent);
				if (lineNumber === startLine && !this._selection.isEmpty()) {
					// Force the startColumn to stay put because we're inserting after it
					this._selectionStartColumnStaysPut = (this._selection.startColumn <= indentationEndIndex + 1);
				}
			}
		} else {

			// if indenting or outdenting on a whitespace only line
			if (!this._opts.isUnshift && this._selection.isEmpty() && model.getLineLength(startLine) === 0) {
				this._useLastEditRangeForCursorEndPosition = true;
			}

			const oneIndent = (insertSpaces ? cachedStringRepeat(' ', indentSize) : '\t');

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

					indentationEndIndex = Math.min(indentationEndIndex, indentSize);
					for (let i = 0; i < indentationEndIndex; i++) {
						const chr = lineText.charCodeAt(i);
						if (chr === CharCode.Tab) {
							indentationEndIndex = i + 1;
							break;
						}
					}

					this._addEditOperation(builder, new Range(lineNumber, 1, lineNumber, indentationEndIndex + 1), '');
				} else {
					this._addEditOperation(builder, new Range(lineNumber, 1, lineNumber, 1), oneIndent);
					if (lineNumber === startLine && !this._selection.isEmpty()) {
						// Force the startColumn to stay put because we're inserting after it
						this._selectionStartColumnStaysPut = (this._selection.startColumn === 1);
					}
				}
			}
		}

		this._selectionId = builder.trackSelection(this._selection);
	}

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		if (this._useLastEditRangeForCursorEndPosition) {
			const lastOp = helper.getInverseEditOperations()[0];
			return new Selection(lastOp.range.endLineNumber, lastOp.range.endColumn, lastOp.range.endLineNumber, lastOp.range.endColumn);
		}
		const result = helper.getTrackedSelection(this._selectionId!);

		if (this._selectionStartColumnStaysPut) {
			// The selection start should not move
			const initialStartColumn = this._selection.startColumn;
			const resultStartColumn = result.startColumn;
			if (resultStartColumn <= initialStartColumn) {
				return result;
			}

			if (result.getDirection() === SelectionDirection.LTR) {
				return new Selection(result.startLineNumber, initialStartColumn, result.endLineNumber, result.endColumn);
			}
			return new Selection(result.endLineNumber, result.endColumn, result.startLineNumber, initialStartColumn);
		}

		return result;
	}
}
