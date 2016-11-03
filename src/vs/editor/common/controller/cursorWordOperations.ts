/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { CursorMoveConfiguration, ICursorMoveHelperModel } from 'vs/editor/common/controller/cursorMoveHelper';
import { Position } from 'vs/editor/common/core/position';
import { CharCode } from 'vs/base/common/charCode';
import { CharacterClassifier } from 'vs/editor/common/core/characterClassifier';
import { MoveOperationResult } from 'vs/editor/common/controller/cursorMoveOperations';
import { CursorChangeReason } from 'vs/editor/common/editorCommon';
import { CursorModelState } from 'vs/editor/common/controller/oneCursor';

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

	public static findPreviousWordOnLine(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, position: Position): IFindWordResult {
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

	public static findNextWordOnLine(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, position: Position): IFindWordResult {
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

	public static moveWordLeft(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, cursor: CursorModelState, inSelectionMode: boolean, wordNavigationType: WordNavigationType): MoveOperationResult {
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

		return new MoveOperationResult(inSelectionMode, lineNumber, column, 0, true, CursorChangeReason.Explicit);
	}

	public static moveWordRight(config: CursorMoveConfiguration, model: ICursorMoveHelperModel, cursor: CursorModelState, inSelectionMode: boolean, wordNavigationType: WordNavigationType): MoveOperationResult {
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

		return new MoveOperationResult(inSelectionMode, lineNumber, column, 0, true, CursorChangeReason.Explicit);
	}
}
