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

				if (this._autoIndent) {
					virtualModel.getLineContent = (lineNumber) => {
						if (lineNumber === s.startLineNumber) {
							return model.getLineContent(movingLineNumber);
						} else {
							return model.getLineContent(lineNumber);
						}
					};
					let newIndentation = LanguageConfigurationRegistry.getGoodIndentForLine(virtualModel, model.getLanguageIdAtPosition(
						movingLineNumber, 1), s.startLineNumber, indentConverter);
					if (newIndentation !== null) {
						let oldIndentation = strings.getLeadingWhitespace(model.getLineContent(movingLineNumber));
						let newSpaceCnt = this.getSpaceCnt(newIndentation, tabSize);
						let oldSpaceCnt = this.getSpaceCnt(oldIndentation, tabSize);
						if (newSpaceCnt !== oldSpaceCnt) {
							let newIndentation = this.generateIndent(newSpaceCnt, tabSize, insertSpaces);
							insertingText = newIndentation + strings.ltrim(strings.ltrim(movingLineText), '\t');
						}
					}

					virtualModel.getLineContent = (lineNumber) => {
						if (lineNumber === s.startLineNumber) {
							return insertingText;
						} else if (lineNumber >= s.startLineNumber + 1 && lineNumber <= s.endLineNumber + 1) {
							return model.getLineContent(lineNumber - 1);
						} else {
							return model.getLineContent(lineNumber);
						}
					};

					let newIndentationForMovingBlock = LanguageConfigurationRegistry.getGoodIndentForLine(virtualModel, model.getLanguageIdAtPosition(
						movingLineNumber, 1), s.startLineNumber + 1, indentConverter);

					if (newIndentationForMovingBlock !== null) {
						let oldIndentation = strings.getLeadingWhitespace(model.getLineContent(s.startLineNumber));
						let newSpaceCnt = this.getSpaceCnt(newIndentationForMovingBlock, tabSize);
						let oldSpaceCnt = this.getSpaceCnt(oldIndentation, tabSize);
						if (newSpaceCnt !== oldSpaceCnt) {
							let spaceCntOffset = newSpaceCnt - oldSpaceCnt;

							for (let i = s.startLineNumber; i <= s.endLineNumber; i++) {
								let lineContent = model.getLineContent(i);
								let originalIndent = strings.getLeadingWhitespace(lineContent);
								let originalSpacesCnt = this.getSpaceCnt(originalIndent, tabSize);
								let newSpacesCnt = originalSpacesCnt + spaceCntOffset;
								let newIndent = this.generateIndent(newSpacesCnt, tabSize, insertSpaces);

								if (newIndent !== originalIndent) {
									builder.addEditOperation(new Range(i, 1, i, originalIndent.length + 1), newIndent);
								}
							}
						}
					}
				}
				builder.addEditOperation(new Range(s.startLineNumber, 1, s.startLineNumber, 1), insertingText + '\n');
			} else {
				movingLineNumber = s.startLineNumber - 1;
				movingLineText = model.getLineContent(movingLineNumber);

				// Delete line that needs to be moved
				builder.addEditOperation(new Range(movingLineNumber, 1, movingLineNumber + 1, 1), null);

				// Insert line that needs to be moved after
				builder.addEditOperation(new Range(s.endLineNumber, model.getLineMaxColumn(s.endLineNumber), s.endLineNumber, model.getLineMaxColumn(s.endLineNumber)), '\n' + movingLineText);

				if (this._autoIndent && (model.getLanguageIdAtPosition(s.startLineNumber, 1) === model.getLanguageIdAtPosition(s.endLineNumber, 1))) {
					virtualModel.getLineContent = (lineNumber: number) => {
						if (lineNumber === movingLineNumber) {
							return model.getLineContent(s.startLineNumber);
						} else {
							return model.getLineContent(lineNumber);
						}
					};
					let newIndentation = LanguageConfigurationRegistry.getGoodIndentForLine(virtualModel, model.getLanguageIdAtPosition(s.startLineNumber, 1), movingLineNumber, indentConverter);
					if (newIndentation !== null) {
						// adjust the indentation of the moving block
						let oldIndentation = strings.getLeadingWhitespace(model.getLineContent(s.startLineNumber));
						let newSpaceCnt = this.getSpaceCnt(newIndentation, tabSize);
						let oldSpaceCnt = this.getSpaceCnt(oldIndentation, tabSize);
						if (newSpaceCnt !== oldSpaceCnt) {
							let spaceCntOffset = newSpaceCnt - oldSpaceCnt;

							for (let i = s.startLineNumber; i <= s.endLineNumber; i++) {
								let lineContent = model.getLineContent(i);
								let originalIndent = strings.getLeadingWhitespace(lineContent);
								let originalSpacesCnt = this.getSpaceCnt(originalIndent, tabSize);
								let newSpacesCnt = originalSpacesCnt + spaceCntOffset;
								let newIndent = this.generateIndent(newSpacesCnt, tabSize, insertSpaces);

								if (newIndent !== originalIndent) {
									builder.addEditOperation(new Range(i, 1, i, originalIndent.length + 1), newIndent);
								}
							}
						}
					}
				}
			}
		}

		this._selectionId = builder.trackSelection(s);
	}

	private getSpaceCnt(str, tabSize) {
		let spacesCnt = 0;

		for (let i = 0; i < str.length; i++) {
			if (str.charAt(i) === '\t') {
				spacesCnt += tabSize;
			} else {
				spacesCnt++;
			}
		}

		return spacesCnt;
	}

	private generateIndent(spacesCnt: number, tabSize, insertSpaces) {
		spacesCnt = spacesCnt < 0 ? 0 : spacesCnt;

		let result = '';
		if (!insertSpaces) {
			let tabsCnt = Math.floor(spacesCnt / tabSize);
			spacesCnt = spacesCnt % tabSize;
			for (let i = 0; i < tabsCnt; i++) {
				result += '\t';
			}
		}

		for (let i = 0; i < spacesCnt; i++) {
			result += ' ';
		}

		return result;
	}

	public computeCursorState(model: ITokenizedModel, helper: ICursorStateComputerData): Selection {
		var result = helper.getTrackedSelection(this._selectionId);

		if (this._moveEndPositionDown) {
			result = result.setEndPosition(result.endLineNumber + 1, 1);
		}

		return result;
	}
}
