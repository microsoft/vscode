/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as strings from 'vs/base/common/strings';
import { ShiftCommand } from 'vs/editor/common/commands/shiftCommand';
import { EditorAutoIndentStrategy } from 'vs/editor/common/config/editorOptions';
import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder } from 'vs/editor/common/editorCommon';
import { ITextModel } from 'vs/editor/common/model';
import { CompleteEnterAction, IndentAction } from 'vs/editor/common/languages/languageConfiguration';
import { ILanguageConfigurationService } from 'vs/editor/common/languages/languageConfigurationRegistry';
import { IndentConsts } from 'vs/editor/common/languages/supports/indentRules';
import * as indentUtils from 'vs/editor/contrib/indentation/common/indentUtils';
import { getGoodIndentForLine, getIndentMetadata, IIndentConverter, IVirtualModel } from 'vs/editor/common/languages/autoIndent';
import { getEnterAction } from 'vs/editor/common/languages/enterAction';

export class MoveLinesCommand implements ICommand {

	private readonly _selection: Selection;
	private readonly _isMovingDown: boolean;
	private readonly _autoIndent: EditorAutoIndentStrategy;

	private _selectionId: string | null;
	private _moveEndPositionDown?: boolean;
	private _moveEndLineSelectionShrink: boolean;

	constructor(
		selection: Selection,
		isMovingDown: boolean,
		autoIndent: EditorAutoIndentStrategy,
		@ILanguageConfigurationService private readonly _languageConfigurationService: ILanguageConfigurationService
	) {
		this._selection = selection;
		this._isMovingDown = isMovingDown;
		this._autoIndent = autoIndent;
		this._selectionId = null;
		this._moveEndLineSelectionShrink = false;
	}

	public getEditOperations(model: ITextModel, builder: IEditOperationBuilder): void {

		const getLanguageId = () => {
			return model.getLanguageId();
		};
		const getLanguageIdAtPosition = (lineNumber: number, column: number) => {
			return model.getLanguageIdAtPosition(lineNumber, column);
		};

		const modelLineCount = model.getLineCount();

		if (this._isMovingDown && this._selection.endLineNumber === modelLineCount) {
			this._selectionId = builder.trackSelection(this._selection);
			return;
		}
		if (!this._isMovingDown && this._selection.startLineNumber === 1) {
			this._selectionId = builder.trackSelection(this._selection);
			return;
		}

		this._moveEndPositionDown = false;
		let s = this._selection;

		if (s.startLineNumber < s.endLineNumber && s.endColumn === 1) {
			this._moveEndPositionDown = true;
			s = s.setEndPosition(s.endLineNumber - 1, model.getLineMaxColumn(s.endLineNumber - 1));
		}

		const { tabSize, indentSize, insertSpaces } = model.getOptions();
		const indentConverter = this.buildIndentConverter(tabSize, indentSize, insertSpaces);

		if (s.startLineNumber === s.endLineNumber && model.getLineMaxColumn(s.startLineNumber) === 1) {
			// Current line is empty
			const lineNumber = s.startLineNumber;
			const otherLineNumber = (this._isMovingDown ? lineNumber + 1 : lineNumber - 1);

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

			let movingLineNumber: number;
			let movingLineText: string;

			if (this._isMovingDown) {
				movingLineNumber = s.endLineNumber + 1;
				movingLineText = model.getLineContent(movingLineNumber);
				// Delete line that needs to be moved
				builder.addEditOperation(new Range(movingLineNumber - 1, model.getLineMaxColumn(movingLineNumber - 1), movingLineNumber, model.getLineMaxColumn(movingLineNumber)), null);

				let insertingText = movingLineText;

				if (this.shouldAutoIndent(model, s)) {
					const movingLineMatchResult = this.matchEnterRule(model, indentConverter, tabSize, movingLineNumber, s.startLineNumber - 1);
					// if s.startLineNumber - 1 matches onEnter rule, we still honor that.
					if (movingLineMatchResult !== null) {
						const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(movingLineNumber));
						const newSpaceCnt = movingLineMatchResult + indentUtils.getSpaceCnt(oldIndentation, tabSize);
						const newIndentation = indentUtils.generateIndent(newSpaceCnt, tabSize, insertSpaces);
						insertingText = newIndentation + this.trimStart(movingLineText);
					} else {
						// no enter rule matches, let's check indentatin rules then.
						const virtualModel: IVirtualModel = {
							tokenization: {
								getLineTokens: (lineNumber: number) => {
									if (lineNumber === s.startLineNumber) {
										return model.tokenization.getLineTokens(movingLineNumber);
									} else {
										return model.tokenization.getLineTokens(lineNumber);
									}
								},
								getLanguageId,
								getLanguageIdAtPosition,
							},
							getLineContent: (lineNumber: number) => {
								if (lineNumber === s.startLineNumber) {
									return model.getLineContent(movingLineNumber);
								} else {
									return model.getLineContent(lineNumber);
								}
							},
						};
						const indentOfMovingLine = getGoodIndentForLine(
							this._autoIndent,
							virtualModel,
							model.getLanguageIdAtPosition(movingLineNumber, 1),
							s.startLineNumber,
							indentConverter,
							this._languageConfigurationService
						);
						if (indentOfMovingLine !== null) {
							const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(movingLineNumber));
							const newSpaceCnt = indentUtils.getSpaceCnt(indentOfMovingLine, tabSize);
							const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);
							if (newSpaceCnt !== oldSpaceCnt) {
								const newIndentation = indentUtils.generateIndent(newSpaceCnt, tabSize, insertSpaces);
								insertingText = newIndentation + this.trimStart(movingLineText);
							}
						}
					}

					// add edit operations for moving line first to make sure it's executed after we make indentation change
					// to s.startLineNumber
					builder.addEditOperation(new Range(s.startLineNumber, 1, s.startLineNumber, 1), insertingText + '\n');

					const ret = this.matchEnterRuleMovingDown(model, indentConverter, tabSize, s.startLineNumber, movingLineNumber, insertingText);

					// check if the line being moved before matches onEnter rules, if so let's adjust the indentation by onEnter rules.
					if (ret !== null) {
						if (ret !== 0) {
							this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, ret);
						}
					} else {
						// it doesn't match onEnter rules, let's check indentation rules then.
						const virtualModel: IVirtualModel = {
							tokenization: {
								getLineTokens: (lineNumber: number) => {
									if (lineNumber === s.startLineNumber) {
										// TODO@aiday-mar: the tokens here don't correspond exactly to the corresponding content (after indentation adjustment), have to fix this.
										return model.tokenization.getLineTokens(movingLineNumber);
									} else if (lineNumber >= s.startLineNumber + 1 && lineNumber <= s.endLineNumber + 1) {
										return model.tokenization.getLineTokens(lineNumber - 1);
									} else {
										return model.tokenization.getLineTokens(lineNumber);
									}
								},
								getLanguageId,
								getLanguageIdAtPosition,
							},
							getLineContent: (lineNumber: number) => {
								if (lineNumber === s.startLineNumber) {
									return insertingText;
								} else if (lineNumber >= s.startLineNumber + 1 && lineNumber <= s.endLineNumber + 1) {
									return model.getLineContent(lineNumber - 1);
								} else {
									return model.getLineContent(lineNumber);
								}
							},
						};

						const newIndentatOfMovingBlock = getGoodIndentForLine(
							this._autoIndent,
							virtualModel,
							model.getLanguageIdAtPosition(movingLineNumber, 1),
							s.startLineNumber + 1,
							indentConverter,
							this._languageConfigurationService
						);

						if (newIndentatOfMovingBlock !== null) {
							const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(s.startLineNumber));
							const newSpaceCnt = indentUtils.getSpaceCnt(newIndentatOfMovingBlock, tabSize);
							const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);
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
					const virtualModel: IVirtualModel = {
						tokenization: {
							getLineTokens: (lineNumber: number) => {
								if (lineNumber === movingLineNumber) {
									return model.tokenization.getLineTokens(s.startLineNumber);
								} else {
									return model.tokenization.getLineTokens(lineNumber);
								}
							},
							getLanguageId,
							getLanguageIdAtPosition,
						},
						getLineContent: (lineNumber: number) => {
							if (lineNumber === movingLineNumber) {
								return model.getLineContent(s.startLineNumber);
							} else {
								return model.getLineContent(lineNumber);
							}
						},
					};

					const ret = this.matchEnterRule(model, indentConverter, tabSize, s.startLineNumber, s.startLineNumber - 2);
					// check if s.startLineNumber - 2 matches onEnter rules, if so adjust the moving block by onEnter rules.
					if (ret !== null) {
						if (ret !== 0) {
							this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, ret);
						}
					} else {
						// it doesn't match any onEnter rule, let's check indentation rules then.
						const indentOfFirstLine = getGoodIndentForLine(
							this._autoIndent,
							virtualModel,
							model.getLanguageIdAtPosition(s.startLineNumber, 1),
							movingLineNumber,
							indentConverter,
							this._languageConfigurationService
						);
						if (indentOfFirstLine !== null) {
							// adjust the indentation of the moving block
							const oldIndent = strings.getLeadingWhitespace(model.getLineContent(s.startLineNumber));
							const newSpaceCnt = indentUtils.getSpaceCnt(indentOfFirstLine, tabSize);
							const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndent, tabSize);
							if (newSpaceCnt !== oldSpaceCnt) {
								const spaceCntOffset = newSpaceCnt - oldSpaceCnt;

								this.getIndentEditsOfMovingBlock(model, builder, s, tabSize, insertSpaces, spaceCntOffset);
							}
						}
					}
				}
			}
		}

		this._selectionId = builder.trackSelection(s);
	}

	private buildIndentConverter(tabSize: number, indentSize: number, insertSpaces: boolean): IIndentConverter {
		return {
			shiftIndent: (indentation) => {
				return ShiftCommand.shiftIndent(indentation, indentation.length + 1, tabSize, indentSize, insertSpaces);
			},
			unshiftIndent: (indentation) => {
				return ShiftCommand.unshiftIndent(indentation, indentation.length + 1, tabSize, indentSize, insertSpaces);
			}
		};
	}

	private parseEnterResult(model: ITextModel, indentConverter: IIndentConverter, tabSize: number, line: number, enter: CompleteEnterAction | null) {
		if (enter) {
			let enterPrefix = enter.indentation;

			if (enter.indentAction === IndentAction.None) {
				enterPrefix = enter.indentation + enter.appendText;
			} else if (enter.indentAction === IndentAction.Indent) {
				enterPrefix = enter.indentation + enter.appendText;
			} else if (enter.indentAction === IndentAction.IndentOutdent) {
				enterPrefix = enter.indentation;
			} else if (enter.indentAction === IndentAction.Outdent) {
				enterPrefix = indentConverter.unshiftIndent(enter.indentation) + enter.appendText;
			}
			const movingLineText = model.getLineContent(line);
			if (this.trimStart(movingLineText).indexOf(this.trimStart(enterPrefix)) >= 0) {
				const oldIndentation = strings.getLeadingWhitespace(model.getLineContent(line));
				let newIndentation = strings.getLeadingWhitespace(enterPrefix);
				const indentMetadataOfMovelingLine = getIndentMetadata(model, line, this._languageConfigurationService);
				if (indentMetadataOfMovelingLine !== null && indentMetadataOfMovelingLine & IndentConsts.DECREASE_MASK) {
					newIndentation = indentConverter.unshiftIndent(newIndentation);
				}
				const newSpaceCnt = indentUtils.getSpaceCnt(newIndentation, tabSize);
				const oldSpaceCnt = indentUtils.getSpaceCnt(oldIndentation, tabSize);
				return newSpaceCnt - oldSpaceCnt;
			}
		}

		return null;
	}

	/**
	 *
	 * @param model
	 * @param indentConverter
	 * @param tabSize
	 * @param line the line moving down
	 * @param futureAboveLineNumber the line which will be at the `line` position
	 * @param futureAboveLineText
	 */
	private matchEnterRuleMovingDown(model: ITextModel, indentConverter: IIndentConverter, tabSize: number, line: number, futureAboveLineNumber: number, futureAboveLineText: string) {
		if (strings.lastNonWhitespaceIndex(futureAboveLineText) >= 0) {
			// break
			const maxColumn = model.getLineMaxColumn(futureAboveLineNumber);
			const enter = getEnterAction(this._autoIndent, model, new Range(futureAboveLineNumber, maxColumn, futureAboveLineNumber, maxColumn), this._languageConfigurationService);
			return this.parseEnterResult(model, indentConverter, tabSize, line, enter);
		} else {
			// go upwards, starting from `line - 1`
			let validPrecedingLine = line - 1;
			while (validPrecedingLine >= 1) {
				const lineContent = model.getLineContent(validPrecedingLine);
				const nonWhitespaceIdx = strings.lastNonWhitespaceIndex(lineContent);

				if (nonWhitespaceIdx >= 0) {
					break;
				}

				validPrecedingLine--;
			}

			if (validPrecedingLine < 1 || line > model.getLineCount()) {
				return null;
			}

			const maxColumn = model.getLineMaxColumn(validPrecedingLine);
			const enter = getEnterAction(this._autoIndent, model, new Range(validPrecedingLine, maxColumn, validPrecedingLine, maxColumn), this._languageConfigurationService);
			return this.parseEnterResult(model, indentConverter, tabSize, line, enter);
		}
	}

	private matchEnterRule(model: ITextModel, indentConverter: IIndentConverter, tabSize: number, line: number, oneLineAbove: number, previousLineText?: string) {
		let validPrecedingLine = oneLineAbove;
		while (validPrecedingLine >= 1) {
			// ship empty lines as empty lines just inherit indentation
			let lineContent;
			if (validPrecedingLine === oneLineAbove && previousLineText !== undefined) {
				lineContent = previousLineText;
			} else {
				lineContent = model.getLineContent(validPrecedingLine);
			}

			const nonWhitespaceIdx = strings.lastNonWhitespaceIndex(lineContent);
			if (nonWhitespaceIdx >= 0) {
				break;
			}
			validPrecedingLine--;
		}

		if (validPrecedingLine < 1 || line > model.getLineCount()) {
			return null;
		}

		const maxColumn = model.getLineMaxColumn(validPrecedingLine);
		const enter = getEnterAction(this._autoIndent, model, new Range(validPrecedingLine, maxColumn, validPrecedingLine, maxColumn), this._languageConfigurationService);
		return this.parseEnterResult(model, indentConverter, tabSize, line, enter);
	}

	private trimStart(str: string) {
		return str.replace(/^\s+/, '');
	}

	private shouldAutoIndent(model: ITextModel, selection: Selection) {
		if (this._autoIndent < EditorAutoIndentStrategy.Full) {
			return false;
		}
		// if it's not easy to tokenize, we stop auto indent.
		if (!model.tokenization.isCheapToTokenize(selection.startLineNumber)) {
			return false;
		}
		const languageAtSelectionStart = model.getLanguageIdAtPosition(selection.startLineNumber, 1);
		const languageAtSelectionEnd = model.getLanguageIdAtPosition(selection.endLineNumber, 1);

		if (languageAtSelectionStart !== languageAtSelectionEnd) {
			return false;
		}

		if (this._languageConfigurationService.getLanguageConfiguration(languageAtSelectionStart).indentRulesSupport === null) {
			return false;
		}

		return true;
	}

	private getIndentEditsOfMovingBlock(model: ITextModel, builder: IEditOperationBuilder, s: Selection, tabSize: number, insertSpaces: boolean, offset: number) {
		for (let i = s.startLineNumber; i <= s.endLineNumber; i++) {
			const lineContent = model.getLineContent(i);
			const originalIndent = strings.getLeadingWhitespace(lineContent);
			const originalSpacesCnt = indentUtils.getSpaceCnt(originalIndent, tabSize);
			const newSpacesCnt = originalSpacesCnt + offset;
			const newIndent = indentUtils.generateIndent(newSpacesCnt, tabSize, insertSpaces);

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

	public computeCursorState(model: ITextModel, helper: ICursorStateComputerData): Selection {
		let result = helper.getTrackedSelection(this._selectionId!);

		if (this._moveEndPositionDown) {
			result = result.setEndPosition(result.endLineNumber + 1, 1);
		}

		if (this._moveEndLineSelectionShrink && result.startLineNumber < result.endLineNumber) {
			result = result.setEndPosition(result.endLineNumber, 2);
		}

		return result;
	}
}
