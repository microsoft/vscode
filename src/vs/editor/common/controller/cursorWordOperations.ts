/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { SingleCursorState, EditOperationResult, CursorConfiguration, ICursorSimpleModel } from 'vs/editor/common/controller/cursorCommon';
import { Position } from 'vs/editor/common/core/position';
import { CharCode } from 'vs/base/common/charCode';
import { CharacterClassifier } from 'vs/editor/common/core/characterClassifier';
import { SingleMoveOperationResult } from 'vs/editor/common/controller/cursorMoveOperations';
import { CursorChangeReason } from 'vs/editor/common/editorCommon';
import { DeleteOperations } from 'vs/editor/common/controller/cursorDeleteOperations';
import * as strings from 'vs/base/common/strings';
import { Range } from 'vs/editor/common/core/range';
import { ReplaceCommand } from 'vs/editor/common/commands/replaceCommand';

export interface IFindWordResult {
	/**
	 * The index where the word starts.
	 */
	start: number;
	/**
	 * The index where the word ends.
	 */
	end: number;
	/**
	 * The word type.
	 */
	wordType: WordType;
}

export const enum WordType {
	None = 0,
	Regular = 1,
	Separator = 2
}

const enum CharacterClass {
	Regular = 0,
	Whitespace = 1,
	WordSeparator = 2
}

export const enum WordNavigationType {
	WordStart = 0,
	WordEnd = 1
}

class WordCharacterClassifier extends CharacterClassifier<CharacterClass> {

	constructor(wordSeparators: string) {
		super(CharacterClass.Regular);

		for (let i = 0, len = wordSeparators.length; i < len; i++) {
			this.set(wordSeparators.charCodeAt(i), CharacterClass.WordSeparator);
		}

		this.set(CharCode.Space, CharacterClass.Whitespace);
		this.set(CharCode.Tab, CharacterClass.Whitespace);
	}

}

function once<R>(computeFn: (input: string) => R): (input: string) => R {
	let cache: { [key: string]: R; } = {}; // TODO@Alex unbounded cache
	return (input: string): R => {
		if (!cache.hasOwnProperty(input)) {
			cache[input] = computeFn(input);
		}
		return cache[input];
	};
}

let getMapForWordSeparators = once<WordCharacterClassifier>(
	(input) => new WordCharacterClassifier(input)
);

export class WordOperations {

	private static _createWord(lineContent: string, wordType: WordType, start: number, end: number): IFindWordResult {
		// console.log('WORD ==> ' + start + ' => ' + end + ':::: <<<' + lineContent.substring(start, end) + '>>>');
		return { start: start, end: end, wordType: wordType };
	}

	public static findPreviousWordOnLine(config: CursorConfiguration, model: ICursorSimpleModel, position: Position): IFindWordResult {
		let wordSeparators = getMapForWordSeparators(config.wordSeparators);
		let lineContent = model.getLineContent(position.lineNumber);
		return this._findPreviousWordOnLine(lineContent, wordSeparators, position);
	}

	private static _findPreviousWordOnLine(lineContent: string, wordSeparators: WordCharacterClassifier, position: Position): IFindWordResult {
		let wordType = WordType.None;
		for (let chIndex = position.column - 2; chIndex >= 0; chIndex--) {
			let chCode = lineContent.charCodeAt(chIndex);
			let chClass = wordSeparators.get(chCode);

			if (chClass === CharacterClass.Regular) {
				if (wordType === WordType.Separator) {
					return this._createWord(lineContent, wordType, chIndex + 1, this._findEndOfWord(lineContent, wordSeparators, wordType, chIndex + 1));
				}
				wordType = WordType.Regular;
			} else if (chClass === CharacterClass.WordSeparator) {
				if (wordType === WordType.Regular) {
					return this._createWord(lineContent, wordType, chIndex + 1, this._findEndOfWord(lineContent, wordSeparators, wordType, chIndex + 1));
				}
				wordType = WordType.Separator;
			} else if (chClass === CharacterClass.Whitespace) {
				if (wordType !== WordType.None) {
					return this._createWord(lineContent, wordType, chIndex + 1, this._findEndOfWord(lineContent, wordSeparators, wordType, chIndex + 1));
				}
			}
		}

		if (wordType !== WordType.None) {
			return this._createWord(lineContent, wordType, 0, this._findEndOfWord(lineContent, wordSeparators, wordType, 0));
		}

		return null;
	}

	private static _findEndOfWord(lineContent: string, wordSeparators: WordCharacterClassifier, wordType: WordType, startIndex: number): number {
		let len = lineContent.length;
		for (let chIndex = startIndex; chIndex < len; chIndex++) {
			let chCode = lineContent.charCodeAt(chIndex);
			let chClass = wordSeparators.get(chCode);

			if (chClass === CharacterClass.Whitespace) {
				return chIndex;
			}
			if (wordType === WordType.Regular && chClass === CharacterClass.WordSeparator) {
				return chIndex;
			}
			if (wordType === WordType.Separator && chClass === CharacterClass.Regular) {
				return chIndex;
			}
		}
		return len;
	}

	public static findNextWordOnLine(config: CursorConfiguration, model: ICursorSimpleModel, position: Position): IFindWordResult {
		let wordSeparators = getMapForWordSeparators(config.wordSeparators);
		let lineContent = model.getLineContent(position.lineNumber);
		return this._findNextWordOnLine(lineContent, wordSeparators, position);
	}

	private static _findNextWordOnLine(lineContent: string, wordSeparators: WordCharacterClassifier, position: Position): IFindWordResult {
		let wordType = WordType.None;
		let len = lineContent.length;

		for (let chIndex = position.column - 1; chIndex < len; chIndex++) {
			let chCode = lineContent.charCodeAt(chIndex);
			let chClass = wordSeparators.get(chCode);

			if (chClass === CharacterClass.Regular) {
				if (wordType === WordType.Separator) {
					return this._createWord(lineContent, wordType, this._findStartOfWord(lineContent, wordSeparators, wordType, chIndex - 1), chIndex);
				}
				wordType = WordType.Regular;
			} else if (chClass === CharacterClass.WordSeparator) {
				if (wordType === WordType.Regular) {
					return this._createWord(lineContent, wordType, this._findStartOfWord(lineContent, wordSeparators, wordType, chIndex - 1), chIndex);
				}
				wordType = WordType.Separator;
			} else if (chClass === CharacterClass.Whitespace) {
				if (wordType !== WordType.None) {
					return this._createWord(lineContent, wordType, this._findStartOfWord(lineContent, wordSeparators, wordType, chIndex - 1), chIndex);
				}
			}
		}

		if (wordType !== WordType.None) {
			return this._createWord(lineContent, wordType, this._findStartOfWord(lineContent, wordSeparators, wordType, len - 1), len);
		}

		return null;
	}

	private static _findStartOfWord(lineContent: string, wordSeparators: WordCharacterClassifier, wordType: WordType, startIndex: number): number {
		for (let chIndex = startIndex; chIndex >= 0; chIndex--) {
			let chCode = lineContent.charCodeAt(chIndex);
			let chClass = wordSeparators.get(chCode);

			if (chClass === CharacterClass.Whitespace) {
				return chIndex + 1;
			}
			if (wordType === WordType.Regular && chClass === CharacterClass.WordSeparator) {
				return chIndex + 1;
			}
			if (wordType === WordType.Separator && chClass === CharacterClass.Regular) {
				return chIndex + 1;
			}
		}
		return 0;
	}

	public static moveWordLeft(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, wordNavigationType: WordNavigationType): SingleMoveOperationResult {
		let position = cursor.position;
		let lineNumber = position.lineNumber;
		let column = position.column;

		if (column === 1) {
			if (lineNumber > 1) {
				lineNumber = lineNumber - 1;
				column = model.getLineMaxColumn(lineNumber);
			}
		}

		let prevWordOnLine = WordOperations.findPreviousWordOnLine(config, model, new Position(lineNumber, column));

		if (wordNavigationType === WordNavigationType.WordStart) {
			if (prevWordOnLine) {
				column = prevWordOnLine.start + 1;
			} else {
				column = 1;
			}
		} else {
			if (prevWordOnLine && column <= prevWordOnLine.end + 1) {
				prevWordOnLine = WordOperations.findPreviousWordOnLine(config, model, new Position(lineNumber, prevWordOnLine.start + 1));
			}
			if (prevWordOnLine) {
				column = prevWordOnLine.end + 1;
			} else {
				column = 1;
			}
		}

		return SingleMoveOperationResult.fromMove(cursor, inSelectionMode, lineNumber, column, 0, true, CursorChangeReason.Explicit);
	}

	public static moveWordRight(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, wordNavigationType: WordNavigationType): SingleMoveOperationResult {
		let position = cursor.position;
		let lineNumber = position.lineNumber;
		let column = position.column;

		if (column === model.getLineMaxColumn(lineNumber)) {
			if (lineNumber < model.getLineCount()) {
				lineNumber = lineNumber + 1;
				column = 1;
			}
		}

		let nextWordOnLine = WordOperations.findNextWordOnLine(config, model, new Position(lineNumber, column));

		if (wordNavigationType === WordNavigationType.WordEnd) {
			if (nextWordOnLine) {
				column = nextWordOnLine.end + 1;
			} else {
				column = model.getLineMaxColumn(lineNumber);
			}
		} else {
			if (nextWordOnLine && column >= nextWordOnLine.start + 1) {
				nextWordOnLine = WordOperations.findNextWordOnLine(config, model, new Position(lineNumber, nextWordOnLine.end + 1));
			}
			if (nextWordOnLine) {
				column = nextWordOnLine.start + 1;
			} else {
				column = model.getLineMaxColumn(lineNumber);
			}
		}

		return SingleMoveOperationResult.fromMove(cursor, inSelectionMode, lineNumber, column, 0, true, CursorChangeReason.Explicit);
	}

	private static _deleteWordLeftWhitespace(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState): EditOperationResult {
		let position = cursor.position;
		let lineContent = model.getLineContent(position.lineNumber);
		let startIndex = position.column - 2;
		let lastNonWhitespace = strings.lastNonWhitespaceIndex(lineContent, startIndex);
		if (lastNonWhitespace + 1 < startIndex) {
			let deleteRange = new Range(position.lineNumber, lastNonWhitespace + 2, position.lineNumber, position.column);
			return new EditOperationResult(new ReplaceCommand(deleteRange, ''), {
				shouldPushStackElementBefore: false,
				shouldPushStackElementAfter: false
			});
		}
		return null;
	}

	public static deleteWordLeft(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, whitespaceHeuristics: boolean, wordNavigationType: WordNavigationType): EditOperationResult {
		let r = DeleteOperations.autoClosingPairDelete(config, model, cursor);
		if (r) {
			// This was a case for an auto-closing pair delete
			return r;
		}

		let selection = cursor.selection;

		if (selection.isEmpty()) {
			let position = cursor.position;

			let lineNumber = position.lineNumber;
			let column = position.column;

			if (lineNumber === 1 && column === 1) {
				// Ignore deleting at beginning of file
				return null;
			}

			if (whitespaceHeuristics) {
				let r = this._deleteWordLeftWhitespace(config, model, cursor);
				if (r) {
					return r;
				}
			}

			let prevWordOnLine = WordOperations.findPreviousWordOnLine(config, model, position);

			if (wordNavigationType === WordNavigationType.WordStart) {
				if (prevWordOnLine) {
					column = prevWordOnLine.start + 1;
				} else {
					column = 1;
				}
			} else {
				if (prevWordOnLine && column <= prevWordOnLine.end + 1) {
					prevWordOnLine = WordOperations.findPreviousWordOnLine(config, model, new Position(lineNumber, prevWordOnLine.start + 1));
				}
				if (prevWordOnLine) {
					column = prevWordOnLine.end + 1;
				} else {
					column = 1;
				}
			}

			let deleteSelection = new Range(lineNumber, column, lineNumber, position.column);
			if (!deleteSelection.isEmpty()) {
				return new EditOperationResult(new ReplaceCommand(deleteSelection, ''), {
					shouldPushStackElementBefore: false,
					shouldPushStackElementAfter: false
				});
			}
		}

		return DeleteOperations.deleteLeft(config, model, cursor);
	}

	private static _findFirstNonWhitespaceChar(str: string, startIndex: number): number {
		let len = str.length;
		for (let chIndex = startIndex; chIndex < len; chIndex++) {
			let ch = str.charAt(chIndex);
			if (ch !== ' ' && ch !== '\t') {
				return chIndex;
			}
		}
		return len;
	}

	private static _deleteWordRightWhitespace(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState): EditOperationResult {
		let position = cursor.position;
		let lineContent = model.getLineContent(position.lineNumber);
		let startIndex = position.column - 1;
		let firstNonWhitespace = this._findFirstNonWhitespaceChar(lineContent, startIndex);
		if (startIndex + 1 < firstNonWhitespace) {
			// bingo
			let deleteRange = new Range(position.lineNumber, position.column, position.lineNumber, firstNonWhitespace + 1);
			return new EditOperationResult(new ReplaceCommand(deleteRange, ''), {
				shouldPushStackElementBefore: false,
				shouldPushStackElementAfter: false
			});
		}
		return null;
	}

	public static deleteWordRight(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, whitespaceHeuristics: boolean, wordNavigationType: WordNavigationType): EditOperationResult {

		let selection = cursor.selection;

		if (selection.isEmpty()) {
			let position = cursor.position;

			let lineNumber = position.lineNumber;
			let column = position.column;

			let lineCount = model.getLineCount();
			let maxColumn = model.getLineMaxColumn(lineNumber);
			if (lineNumber === lineCount && column === maxColumn) {
				// Ignore deleting at end of file
				return null;
			}

			if (whitespaceHeuristics) {
				let r = this._deleteWordRightWhitespace(config, model, cursor);
				if (r) {
					return r;
				}
			}

			let nextWordOnLine = WordOperations.findNextWordOnLine(config, model, position);

			if (wordNavigationType === WordNavigationType.WordEnd) {
				if (nextWordOnLine) {
					column = nextWordOnLine.end + 1;
				} else {
					if (column < maxColumn || lineNumber === lineCount) {
						column = maxColumn;
					} else {
						lineNumber++;
						nextWordOnLine = WordOperations.findNextWordOnLine(config, model, new Position(lineNumber, 1));
						if (nextWordOnLine) {
							column = nextWordOnLine.start + 1;
						} else {
							column = model.getLineMaxColumn(lineNumber);
						}
					}
				}
			} else {
				if (nextWordOnLine && column >= nextWordOnLine.start + 1) {
					nextWordOnLine = WordOperations.findNextWordOnLine(config, model, new Position(lineNumber, nextWordOnLine.end + 1));
				}
				if (nextWordOnLine) {
					column = nextWordOnLine.start + 1;
				} else {
					if (column < maxColumn || lineNumber === lineCount) {
						column = maxColumn;
					} else {
						lineNumber++;
						nextWordOnLine = WordOperations.findNextWordOnLine(config, model, new Position(lineNumber, 1));
						if (nextWordOnLine) {
							column = nextWordOnLine.start + 1;
						} else {
							column = model.getLineMaxColumn(lineNumber);
						}
					}
				}
			}

			let deleteSelection = new Range(lineNumber, column, position.lineNumber, position.column);
			if (!deleteSelection.isEmpty()) {
				return new EditOperationResult(new ReplaceCommand(deleteSelection, ''), {
					shouldPushStackElementBefore: false,
					shouldPushStackElementAfter: false
				});
			}
		}

		// fall back to normal deleteRight behavior
		return DeleteOperations.deleteRight(config, model, cursor);
	}

	public static word(config: CursorConfiguration, model: ICursorSimpleModel, cursor: SingleCursorState, inSelectionMode: boolean, position: Position): SingleMoveOperationResult {
		let prevWord = WordOperations.findPreviousWordOnLine(config, model, position);
		let isInPrevWord = (prevWord && prevWord.wordType === WordType.Regular && prevWord.start < position.column - 1 && position.column - 1 <= prevWord.end);
		let nextWord = WordOperations.findNextWordOnLine(config, model, position);
		let isInNextWord = (nextWord && nextWord.wordType === WordType.Regular && nextWord.start < position.column - 1 && position.column - 1 <= nextWord.end);

		if (!inSelectionMode || !cursor.hasSelection()) {

			let startColumn: number;
			let endColumn: number;

			if (isInPrevWord) {
				startColumn = prevWord.start + 1;
				endColumn = prevWord.end + 1;
			} else if (isInNextWord) {
				startColumn = nextWord.start + 1;
				endColumn = nextWord.end + 1;
			} else {
				if (prevWord) {
					startColumn = prevWord.end + 1;
				} else {
					startColumn = 1;
				}
				if (nextWord) {
					endColumn = nextWord.start + 1;
				} else {
					endColumn = model.getLineMaxColumn(position.lineNumber);
				}
			}

			return new SingleMoveOperationResult(
				new SingleCursorState(
					new Range(position.lineNumber, startColumn, position.lineNumber, endColumn), 0,
					new Position(position.lineNumber, endColumn), 0
				),
				false,
				CursorChangeReason.Explicit
			);
		}

		let startColumn: number;
		let endColumn: number;

		if (isInPrevWord) {
			startColumn = prevWord.start + 1;
			endColumn = prevWord.end + 1;
		} else if (isInNextWord) {
			startColumn = nextWord.start + 1;
			endColumn = nextWord.end + 1;
		} else {
			startColumn = position.column;
			endColumn = position.column;
		}

		let lineNumber = position.lineNumber;
		let column: number;
		if (position.isBeforeOrEqual(cursor.selectionStart.getStartPosition())) {
			column = startColumn;
			let possiblePosition = new Position(lineNumber, column);
			if (cursor.selectionStart.containsPosition(possiblePosition)) {
				column = cursor.selectionStart.endColumn;
			}
		} else {
			column = endColumn;
			let possiblePosition = new Position(lineNumber, column);
			if (cursor.selectionStart.containsPosition(possiblePosition)) {
				column = cursor.selectionStart.startColumn;
			}
		}

		return SingleMoveOperationResult.fromMove(cursor, cursor.hasSelection(), lineNumber, column, 0, false, CursorChangeReason.Explicit);
	}
}
