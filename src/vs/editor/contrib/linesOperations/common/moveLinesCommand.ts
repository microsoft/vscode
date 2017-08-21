/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder, ITokenizedModel } from 'vs/editor/common/editorCommon';
import { LanguageConfigurationRegistry, IIndentConverter } from 'vs/editor/common/modes/languageConfigurationRegistry';
import { ShiftCommand } from 'vs/editor/common/commands/shiftCommand';
import * as IndentUtil from 'vs/editor/contrib/indentation/common/indentUtils';
import { IndentAction } from 'vs/editor/common/modes/languageConfiguration';
import { IndentConsts } from 'vs/editor/common/modes/supports/indentRules';

export class MoveLinesCommand implements ICommand {

	private _selection: Selection;
	private _isMovingDown: boolean;
	private _autoIndent: boolean;

	private _selectionId: string;
	private _moveEndPositionDown: boolean;
	private _moveEndLineSelectionShrink: boolean;

	constructor(selection: Selection, isMovingDown: boolean, autoIndent: boolean) {
		this._selection = selection;
		this._isMovingDown = isMovingDown;
		this._autoIndent = autoIndent;
		this._moveEndLineSelectionShrink = false;
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
		let indentConverter = this.buildIndentConverter(tabSize);
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

				if (this.shouldAutoIndent(model, s)) {
					let movingLineMatchResult = this.matchEnterRule(model, indentConverter, tabSize, movingLineNumber, s.startLineNumber - 1);
					// if s.startLineNumber - 1 matches onEnter rule, we still honor that.
					if (movingLineMatchResult !== null) {
						let oldIndentation = strings.getLeadingWhitespace(model.getLineContent(movingLineNumber));
						let newSpaceCnt = movingLineMatchResult + IndentUtil.getSpaceCnt(oldIndentation, tabSize);
						let newIndentation = IndentUtil.generateIndent(newSpaceCnt, tabSize, insertSpaces);
						insertingText = newIndentation + this.trimLeft(movingLineText);
					} else {
						// no enter rule matches, let's check indentatin rules then.
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
								insertingText = newIndentation + this.trimLeft(movingLineText);
							}
						}
					}

					// add edit operations for moving line first to make sure it's executed after we make indentation change
					// to s.startLineNumber
					builder.addEditOperation(new Range(s.startLineNumber, 1, s.startLineNumber, 1), insertingText + '\n');

					let ret = this.matchEnterRule(model, indentConverter, tabSize, s.startLineNumber, s.startLineNumber, insertingText);
					// check if the line being moved before matches onEnter rules, if so let's adjust the indentation by onEnter rules.
					if (ret !== null) {
						if (ret !== 0) {
							this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, ret);
						}
					} else {
						// it doesn't match onEnter rules, let's check indentation rules then.
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

								this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, spaceCntOffset);
							}
						}
					}
				} else {
					// Insert line that needs to be moved before
					builder.addEditOperation(new Range(s.startLineNumber, 1, s.startLineNumber, 1), insertingText + '\n');
				}
			} else {
				movingLineNumber = s.startLineNumber - 1;
				movingLineText = model.getLineContent(movingLineNumber);

				// Delete line that needs to be moved
				builder.addEditOperation(new Range(movingLineNumber, 1, movingLineNumber + 1, 1), null);

				// Insert line that needs to be moved after
				builder.addEditOperation(new Range(s.endLineNumber, model.getLineMaxColumn(s.endLineNumber), s.endLineNumber, model.getLineMaxColumn(s.endLineNumber)), '\n' + movingLineText);

				if (this.shouldAutoIndent(model, s)) {
					virtualModel.getLineContent = (lineNumber: number) => {
						if (lineNumber === movingLineNumber) {
							return model.getLineContent(s.startLineNumber);
						} else {
							return model.getLineContent(lineNumber);
						}
					};

					let ret = this.matchEnterRule(model, indentConverter, tabSize, s.startLineNumber, s.startLineNumber - 2);
					// check if s.startLineNumber - 2 matches onEnter rules, if so adjust the moving block by onEnter rules.
					if (ret !== null) {
						if (ret !== 0) {
							this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, ret);
						}
					} else {
						// it doesn't match any onEnter rule, let's check indentation rules then.
						let indentOfFirstLine = LanguageConfigurationRegistry.getGoodIndentForLine(virtualModel, model.getLanguageIdAtPosition(s.startLineNumber, 1), movingLineNumber, indentConverter);
						if (indentOfFirstLine !== null) {
							// adjust the indentation of the moving block
							let oldIndent = strings.getLeadingWhitespace(model.getLineContent(s.startLineNumber));
							let newSpaceCnt = IndentUtil.getSpaceCnt(indentOfFirstLine, tabSize);
							let oldSpaceCnt = IndentUtil.getSpaceCnt(oldIndent, tabSize);
							if (newSpaceCnt !== oldSpaceCnt) {
								let spaceCntOffset = newSpaceCnt - oldSpaceCnt;

								this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, spaceCntOffset);
							}
						}
					}
				}
			}
		}

		this._selectionId = builder.trackSelection(s);
	}

	private buildIndentConverter(tabSize: number): IIndentConverter {
		return {
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
	}

	private matchEnterRule(model: ITokenizedModel, indentConverter: IIndentConverter, tabSize: number, line: number, oneLineAbove: number, oneLineAboveText?: string) {
		let validPrecedingLine = oneLineAbove;
		while (validPrecedingLine >= 1) {
			// ship empty lines as empty lines just inherit indentation
			let lineContent;
			if (validPrecedingLine === oneLineAbove && oneLineAboveText !== undefined) {
				lineContent = oneLineAboveText;
			} else {
				lineContent = model.getLineContent(validPrecedingLine);
			}

			let nonWhitespaceIdx = strings.lastNonWhitespaceIndex(lineContent);
			if (nonWhitespaceIdx >= 0) {
				break;
			}
			validPrecedingLine--;
		}

		if (validPrecedingLine < 1 || line > model.getLineCount()) {
			return null;
		}

		let maxColumn = model.getLineMaxColumn(validPrecedingLine);
		let enter = LanguageConfigurationRegistry.getEnterAction(model, new Range(validPrecedingLine, maxColumn, validPrecedingLine, maxColumn));

		if (enter) {
			let enterPrefix = enter.indentation;
			let enterAction = enter.enterAction;

			if (enterAction.indentAction === IndentAction.None) {
				enterPrefix = enter.indentation + enterAction.appendText;
			} else if (enterAction.indentAction === IndentAction.Indent) {
				enterPrefix = enter.indentation + enterAction.appendText;
			} else if (enterAction.indentAction === IndentAction.IndentOutdent) {
				enterPrefix = enter.indentation;
			} else if (enterAction.indentAction === IndentAction.Outdent) {
				enterPrefix = indentConverter.unshiftIndent(enter.indentation) + enterAction.appendText;
			}
			let movingLineText = model.getLineContent(line);
			if (this.trimLeft(movingLineText).indexOf(this.trimLeft(enterPrefix)) >= 0) {
				let oldIndentation = strings.getLeadingWhitespace(model.getLineContent(line));
				let newIndentation = strings.getLeadingWhitespace(enterPrefix);
				let indentMetadataOfMovelingLine = LanguageConfigurationRegistry.getIndentMetadata(model, line);
				if (indentMetadataOfMovelingLine & IndentConsts.DECREASE_MASK) {
					newIndentation = indentConverter.unshiftIndent(newIndentation);
				}
				let newSpaceCnt = IndentUtil.getSpaceCnt(newIndentation, tabSize);
				let oldSpaceCnt = IndentUtil.getSpaceCnt(oldIndentation, tabSize);
				return newSpaceCnt - oldSpaceCnt;
			}
		}

		return null;
	}

	private trimLeft(str: string) {
		return str.replace(/^\s+/, '');
	}

	private shouldAutoIndent(model: ITokenizedModel, selection: Selection) {
		if (!this._autoIndent) {
			return false;
		}
		// if it's not easy to tokenize, we stop auto indent.
		if (!model.isCheapToTokenize(selection.startLineNumber)) {
			return false;
		}
		let languageAtSelectionStart = model.getLanguageIdAtPosition(selection.startLineNumber, 1);
		let languageAtSelectionEnd = model.getLanguageIdAtPosition(selection.endLineNumber, 1);

		if (languageAtSelectionStart !== languageAtSelectionEnd) {
			return false;
		}

		if (LanguageConfigurationRegistry.getIndentRulesSupport(languageAtSelectionStart) === null) {
			return false;
		}

		return true;
	}

	private getIndentEditsOfMovingBlock(model: ITokenizedModel, builder: IEditOperationBuilder, s: Selection, tabSize: number, insertSpaces: boolean, offset: number) {
		for (let i = s.startLineNumber; i <= s.endLineNumber; i++) {
			let lineContent = model.getLineContent(i);
			let originalIndent = strings.getLeadingWhitespace(lineContent);
			let originalSpacesCnt = IndentUtil.getSpaceCnt(originalIndent, tabSize);
			let newSpacesCnt = originalSpacesCnt + offset;
			let newIndent = IndentUtil.generateIndent(newSpacesCnt, tabSize, insertSpaces);

			if (newIndent !== originalIndent) {
				builder.addEditOperation(new Range(i, 1, i, originalIndent.length + 1), newIndent);

				if (i === s.endLineNumber && s.endColumn <= originalIndent.length + 1 && newIndent === '') {
					// as users select part of the original indent white spaces
					// when we adjust the indentation of endLine, we should adjust the cursor position as well.
					this._moveEndLineSelectionShrink = true;
				}
			}

		}
	}

	public computeCursorState(model: ITokenizedModel, helper: ICursorStateComputerData): Selection {
		var result = helper.getTrackedSelection(this._selectionId);

		if (this._moveEndPositionDown) {
			result = result.setEndPosition(result.endLineNumber + 1, 1);
		}

		if (this._moveEndLineSelectionShrink && result.startLineNumber < result.endLineNumber) {
			result = result.setEndPosition(result.endLineNumber, 2);
		}

		return result;
	}
}
