/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder, ITokenizedModel } from 'vs/editor/common/editorCommon';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { ShiftCommand } from 'vs/editor/common/commands/shiftCommand';
import * as IndentUtil from 'vs/editor/contrib/indentation/common/indentUtils';

export class MoveLinesCommand implements ICommand {

	private _selection: Selection;
	private _isMovingDown: boolean;
	private _autoIndent: boolean;

	private _selectionId: string;
	private _moveEndPositionDown: boolean;

	constructor(selection: Selection, isMovingDown: boolean, autoIndent: boolean) {
		this._selection = selection;
		this._isMovingDown = isMovingDown;
		this._autoIndent = autoIndent;
	}

	public getEditOperations(model: ITokenizedModel, builder: IEditOperationBuilder): void {

		var modelLineCount = model.getLineCount();

		if (this._isMovingDown && this._selection.endLineNumber === modelLineCount) {
			return;
		}
		if (!this._isMovingDown && this._selection.startLineNumber === 1) {
			return;
		}

		this._moveEndPositionDown = false;
		var s = this._selection;

		if (s.startLineNumber < s.endLineNumber && s.endColumn === 1) {
			this._moveEndPositionDown = true;
			s = s.setEndPosition(s.endLineNumber - 1, model.getLineMaxColumn(s.endLineNumber - 1));
		}

		let tabSize = model.getOptions().tabSize;
		let insertSpaces = model.getOptions().insertSpaces;
		let indentConverter = {
			shiftIndent: (indentation) => {
				let desiredIndentCount = ShiftCommand.shiftIndentCount(indentation, indentation.length + 1, tabSize);
				let newIndentation = '';
				for (let i = 0; i < desiredIndentCount; i++) {
					newIndentation += '\t';
				}

				return newIndentation;
			},
			unshiftIndent: (indentation) => {
				let desiredIndentCount = ShiftCommand.unshiftIndentCount(indentation, indentation.length + 1, tabSize);
				let newIndentation = '';
				for (let i = 0; i < desiredIndentCount; i++) {
					newIndentation += '\t';
				}

				return newIndentation;
			}
		};
		let virtualModel = {
			getLineTokens: (lineNumber: number) => {
				return model.getLineTokens(lineNumber);
			},
			getLanguageIdentifier: () => {
				return model.getLanguageIdentifier();
			},
			getLanguageIdAtPosition: (lineNumber: number, column: number) => {
				return model.getLanguageIdAtPosition(lineNumber, column);
			},
			getLineContent: null
		};

		if (s.startLineNumber === s.endLineNumber && model.getLineMaxColumn(s.startLineNumber) === 1) {
			// Current line is empty
			var lineNumber = s.startLineNumber;
			var otherLineNumber = (this._isMovingDown ? lineNumber + 1 : lineNumber - 1);

			if (model.getLineMaxColumn(otherLineNumber) === 1) {
				// Other line number is empty too, so no editing is needed
				// Add a no-op to force running by the model
				builder.addEditOperation(new Range(1, 1, 1, 1), null);
			} else {
				// Type content from other line number on line number
				builder.addEditOperation(new Range(lineNumber, 1, lineNumber, 1), model.getLineContent(otherLineNumber));

				// Remove content from other line number
				builder.addEditOperation(new Range(otherLineNumber, 1, otherLineNumber, model.getLineMaxColumn(otherLineNumber)), null);
			}
			// Track selection at the other line number
			s = new Selection(otherLineNumber, 1, otherLineNumber, 1);

		} else {

			var movingLineNumber: number,
				movingLineText: string;

			if (this._isMovingDown) {
				movingLineNumber = s.endLineNumber + 1;
				movingLineText = model.getLineContent(movingLineNumber);
				// Delete line that needs to be moved
				builder.addEditOperation(new Range(movingLineNumber - 1, model.getLineMaxColumn(movingLineNumber - 1), movingLineNumber, model.getLineMaxColumn(movingLineNumber)), null);

				let insertingText = movingLineText;
				// Insert line that needs to be moved before

				if (this.isAutoIndent(model, s)) {
					virtualModel.getLineContent = (lineNumber) => {
						if (lineNumber === s.startLineNumber) {
							return model.getLineContent(movingLineNumber);
						} else {
							return model.getLineContent(lineNumber);
						}
					};
					let indentOfMovingLine = LanguageConfigurationRegistry.getGoodIndentForLine(virtualModel, model.getLanguageIdAtPosition(
						movingLineNumber, 1), s.startLineNumber, indentConverter);
					if (indentOfMovingLine !== null) {
						let oldIndentation = strings.getLeadingWhitespace(model.getLineContent(movingLineNumber));
						let newSpaceCnt = IndentUtil.getSpaceCnt(indentOfMovingLine, tabSize);
						let oldSpaceCnt = IndentUtil.getSpaceCnt(oldIndentation, tabSize);
						if (newSpaceCnt !== oldSpaceCnt) {
							let newIndentation = IndentUtil.generateIndent(newSpaceCnt, tabSize, insertSpaces);
							insertingText = newIndentation + strings.ltrim(strings.ltrim(movingLineText), '\t');
						}
					}

					// add edit operations for moving line first to make sure it's executed after we make indentation change
					// to s.startLineNumber
					builder.addEditOperation(new Range(s.startLineNumber, 1, s.startLineNumber, 1), insertingText + '\n');

					virtualModel.getLineContent = (lineNumber) => {
						if (lineNumber === s.startLineNumber) {
							return insertingText;
						} else if (lineNumber >= s.startLineNumber + 1 && lineNumber <= s.endLineNumber + 1) {
							return model.getLineContent(lineNumber - 1);
						} else {
							return model.getLineContent(lineNumber);
						}
					};

					let newIndentatOfMovingBlock = LanguageConfigurationRegistry.getGoodIndentForLine(virtualModel, model.getLanguageIdAtPosition(
						movingLineNumber, 1), s.startLineNumber + 1, indentConverter);

					if (newIndentatOfMovingBlock !== null) {
						const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(s.startLineNumber));
						const newSpaceCnt = IndentUtil.getSpaceCnt(newIndentatOfMovingBlock, tabSize);
						const oldSpaceCnt = IndentUtil.getSpaceCnt(oldIndentation, tabSize);
						if (newSpaceCnt !== oldSpaceCnt) {
							const spaceCntOffset = newSpaceCnt - oldSpaceCnt;

							this.getIndentEditsOfMovingBlock(model, builder, s.startLineNumber, s.endLineNumber, tabSize, insertSpaces, spaceCntOffset);
						}
					}
				} else {
					builder.addEditOperation(new Range(s.startLineNumber, 1, s.startLineNumber, 1), insertingText + '\n');
				}
			} else {
				movingLineNumber = s.startLineNumber - 1;
				movingLineText = model.getLineContent(movingLineNumber);

				// Delete line that needs to be moved
				builder.addEditOperation(new Range(movingLineNumber, 1, movingLineNumber + 1, 1), null);

				// Insert line that needs to be moved after
				builder.addEditOperation(new Range(s.endLineNumber, model.getLineMaxColumn(s.endLineNumber), s.endLineNumber, model.getLineMaxColumn(s.endLineNumber)), '\n' + movingLineText);

				if (this.isAutoIndent(model, s)) {
					virtualModel.getLineContent = (lineNumber: number) => {
						if (lineNumber === movingLineNumber) {
							return model.getLineContent(s.startLineNumber);
						} else {
							return model.getLineContent(lineNumber);
						}
					};

					let indentOfFirstLine = LanguageConfigurationRegistry.getGoodIndentForLine(virtualModel, model.getLanguageIdAtPosition(s.startLineNumber, 1), movingLineNumber, indentConverter);
					if (indentOfFirstLine !== null) {
						// adjust the indentation of the moving block
						let oldIndent = strings.getLeadingWhitespace(model.getLineContent(s.startLineNumber));
						let newSpaceCnt = IndentUtil.getSpaceCnt(indentOfFirstLine, tabSize);
						let oldSpaceCnt = IndentUtil.getSpaceCnt(oldIndent, tabSize);
						if (newSpaceCnt !== oldSpaceCnt) {
							let spaceCntOffset = newSpaceCnt - oldSpaceCnt;

							this.getIndentEditsOfMovingBlock(model, builder, s.startLineNumber, s.endLineNumber, tabSize, insertSpaces, spaceCntOffset);
						}
					}
				}
			}
		}

		this._selectionId = builder.trackSelection(s);
	}

	private isAutoIndent(model: ITokenizedModel, selection: Selection) {
		return this._autoIndent && (model.getLanguageIdAtPosition(selection.startLineNumber, 1) === model.getLanguageIdAtPosition(selection.endLineNumber, 1));
	}

	private getIndentEditsOfMovingBlock(model: ITokenizedModel, builder: IEditOperationBuilder, startLineNumber: number, endLineNumber: number, tabSize: number, insertSpaces: boolean, offset: number) {
		for (let i = startLineNumber; i <= endLineNumber; i++) {
			let lineContent = model.getLineContent(i);
			let originalIndent = strings.getLeadingWhitespace(lineContent);
			let originalSpacesCnt = IndentUtil.getSpaceCnt(originalIndent, tabSize);
			let newSpacesCnt = originalSpacesCnt + offset;
			let newIndent = IndentUtil.generateIndent(newSpacesCnt, tabSize, insertSpaces);

			if (newIndent !== originalIndent) {
				builder.addEditOperation(new Range(i, 1, i, originalIndent.length + 1), newIndent);
			}
		}
	}

	public computeCursorState(model: ITokenizedModel, helper: ICursorStateComputerData): Selection {
		var result = helper.getTrackedSelection(this._selectionId);

		if (this._moveEndPositionDown) {
			result = result.setEndPosition(result.endLineNumber + 1, 1);
		}

		return result;
	}
}
