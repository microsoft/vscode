/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { Range } from 'vs/editor/common/core/range';
import { Selection } from 'vs/editor/common/core/selection';
import { ICommand, ICursorStateComputerData, IEditOperationBuilder, ITokenizedModel } from 'vs/editor/common/editorCommon';
import { LanguageConfigurationRegistry } from 'vs/editor/common/modes/languageConfigurationRegistry';
import Strings = require('vs/base/common/strings');

export class MoveLinesCommand implements ICommand {

	private _selection: Selection;
	private _isMovingDown: boolean;

	private _selectionId: string;
	private _moveEndPositionDown: boolean;

	constructor(selection: Selection, isMovingDown: boolean) {
		this._selection = selection;
		this._isMovingDown = isMovingDown;
	}

	public static getBeginWhitespaces(string: string) {
		return string.match(/^\s*/)[0] || '';
	}

	public static replaceLine(model: ITokenizedModel, builder: IEditOperationBuilder, lineNumber: number, newText: string) {
		builder.addEditOperation(new Range(
			lineNumber, 1,
			lineNumber, model.getLineMaxColumn(lineNumber)
		), newText);
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

			const options = model.getOptions();
			let oneIndent = '	';
			if (options.insertSpaces) {
				oneIndent = Array(options.tabSize).join(' ');
			}

			let bracketsSupport = LanguageConfigurationRegistry.getBracketsSupport(model.getLanguageIdentifier().id);
			let brackets = [];
			if (bracketsSupport) {
				brackets = bracketsSupport.brackets;
			}

			if (this._isMovingDown) {
				movingLineNumber = s.endLineNumber + 1;
				movingLineText = model.getLineContent(movingLineNumber);

				let movingLineWhitespaces = MoveLinesCommand.getBeginWhitespaces(model.getLineContent(movingLineNumber));
				const firstLineWhitespaces = MoveLinesCommand.getBeginWhitespaces(model.getLineContent(s.startLineNumber));
				const lastLineWhitespaces = MoveLinesCommand.getBeginWhitespaces(model.getLineContent(s.endLineNumber));

				// If selection have the same indentation for the first and last line, apply an auto indent to the selected block
				if (firstLineWhitespaces.length === lastLineWhitespaces.length && movingLineText.length > 0) {
					for (var lineNumber = s.startLineNumber; lineNumber <= s.endLineNumber; ++lineNumber) {
						// If line end with language open bracket, use indentation of the next next line
						let newMovingWhitespaces = movingLineWhitespaces;

						const allOpenbrackets = Strings.escapeRegExpCharacters(brackets.map(x => x.open).reduce((x, y) => x + y, ''));

						if (movingLineText.match(new RegExp('[' + allOpenbrackets + ']\\s*$'))) {
							newMovingWhitespaces += oneIndent;
						}
						// Replace the current line whitespaces with the moving line whitespaces
						const lineText = model.getLineContent(lineNumber).replace(
							new RegExp('^' + firstLineWhitespaces), newMovingWhitespaces
						);
						MoveLinesCommand.replaceLine(model, builder, lineNumber, lineText);
					}
				}

				// Delete line that needs to be moved
				builder.addEditOperation(new Range(movingLineNumber - 1, model.getLineMaxColumn(movingLineNumber - 1), movingLineNumber, model.getLineMaxColumn(movingLineNumber)), null);

				// Insert line that needs to be moved before
				builder.addEditOperation(new Range(s.startLineNumber, 1, s.startLineNumber, 1), movingLineText + '\n');
			} else {
				movingLineNumber = s.startLineNumber - 1;
				movingLineText = model.getLineContent(movingLineNumber);

				let movingLineWhitespaces = MoveLinesCommand.getBeginWhitespaces(model.getLineContent(movingLineNumber));
				const firstLineWhitespaces = MoveLinesCommand.getBeginWhitespaces(model.getLineContent(s.startLineNumber));
				const lastLineWhitespaces = MoveLinesCommand.getBeginWhitespaces(model.getLineContent(s.endLineNumber));

				// If selection have the same indentation for the first and last line, apply an auto indent to the selected block
				if (firstLineWhitespaces.length === lastLineWhitespaces.length && movingLineText.length > 0) {
					for (var lineNumber = s.startLineNumber; lineNumber <= s.endLineNumber; ++lineNumber) {
						// If line start with language closing bracket, use indentation of the next next line
						const allClosingbrackets = Strings.escapeRegExpCharacters(brackets.map(x => x.close).reduce((x, y) => x + y, ''));
						let newMovingWhitespaces = movingLineWhitespaces;

						if (movingLineText.match(new RegExp('^\\s*[' + allClosingbrackets + ']'))) {
							newMovingWhitespaces += oneIndent;
						}
						// Replace the current line whitespaces with the moving line whitespaces
						const lineText = model.getLineContent(lineNumber).replace(
							new RegExp('^' + firstLineWhitespaces), newMovingWhitespaces
						);
						MoveLinesCommand.replaceLine(model, builder, lineNumber, lineText);
					}
				}

				// Delete line that needs to be moved
				builder.addEditOperation(new Range(movingLineNumber, 1, movingLineNumber + 1, 1), null);

				// Insert line that needs to be moved after
				builder.addEditOperation(new Range(s.endLineNumber, model.getLineMaxColumn(s.endLineNumber), s.endLineNumber, model.getLineMaxColumn(s.endLineNumber)), '\n' + movingLineText);
			}
		}

		this._selectionId = builder.trackSelection(s);
	}

	public computeCursorState(model: ITokenizedModel, helper: ICursorStateComputerData): Selection {
		var result = helper.getTrackedSelection(this._selectionId);

		if (this._moveEndPositionDown) {
			result = result.setEndPosition(result.endLineNumber + 1, 1);
		}

		return result;
	}
}

