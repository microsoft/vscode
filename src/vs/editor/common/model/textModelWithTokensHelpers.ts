/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {NullMode} from 'vs/editor/common/modes/nullMode';
import Modes = require('vs/editor/common/modes');
import EditorCommon = require('vs/editor/common/editorCommon');
import {Arrays} from 'vs/editor/common/core/arrays';

export interface ITextSource {

	_lineIsTokenized(lineNumber:number): boolean;

	getLineContent(lineNumber:number): string;

	getLineCount(): number;

	getMode(): Modes.IMode;

	getModeAtPosition(lineNumber:number, column:number): Modes.IMode;

	_getLineModeTransitions(lineNumber:number): Modes.IModeTransition[];

	getLineTokens(lineNumber:number, inaccurateTokensAcceptable:boolean): EditorCommon.ILineTokens;
}

export interface INonWordTokenMap {
	[key:string]:boolean;
}

export class WordHelper {

	private static _safeGetWordDefinition(mode:Modes.IMode): RegExp {
		return (mode.richEditSupport ? mode.richEditSupport.wordDefinition : null);
	}

	public static ensureValidWordDefinition(wordDefinition?:RegExp): RegExp {
		var result: RegExp = NullMode.DEFAULT_WORD_REGEXP;

		if (wordDefinition && (wordDefinition instanceof RegExp)) {
			if (!wordDefinition.global) {
				var flags = 'g';
				if (wordDefinition.ignoreCase) {
					flags += 'i';
				}
				if (wordDefinition.multiline) {
					flags += 'm';
				}
				result = new RegExp(wordDefinition.source, flags);
			} else {
				result = wordDefinition;
			}
		}

		result.lastIndex = 0;

		return result;
	}

	public static massageWordDefinitionOf(mode:Modes.IMode): RegExp {
		return WordHelper.ensureValidWordDefinition(WordHelper._safeGetWordDefinition(mode));
	}

	public static getWords(textSource:ITextSource, lineNumber:number): EditorCommon.IWordRange[] {
		if (!textSource._lineIsTokenized(lineNumber)) {
			return WordHelper._getWordsInText(textSource.getLineContent(lineNumber), WordHelper.massageWordDefinitionOf(textSource.getMode()));
		}

		var r: EditorCommon.IWordRange[] = [],
			txt = textSource.getLineContent(lineNumber);

		if (txt.length > 0) {

			var modeTransitions = textSource._getLineModeTransitions(lineNumber),
				i:number,
				len:number,
				k:number,
				lenK:number,
				currentModeStartIndex: number,
				currentModeEndIndex: number,
				currentWordDefinition:RegExp,
				currentModeText: string,
				words: RegExpMatchArray,
				startWord: number,
				endWord: number,
				word: string;

			// Go through all the modes
			for (i = 0, currentModeStartIndex = 0, len = modeTransitions.length; i < len; i++) {
				currentWordDefinition = WordHelper.massageWordDefinitionOf(modeTransitions[i].mode);
				currentModeStartIndex = modeTransitions[i].startIndex;
				currentModeEndIndex = (i + 1 < len ? modeTransitions[i + 1].startIndex : txt.length);
				currentModeText = txt.substring(currentModeStartIndex, currentModeEndIndex);
				words = currentModeText.match(currentWordDefinition);

				if (!words) {
					continue;
				}

				endWord = 0;
				for (k = 0, lenK = words.length; k < lenK; k++) {
					word = words[k];
					if (word.length > 0) {
						startWord = currentModeText.indexOf(word, endWord);
						endWord = startWord + word.length;

						r.push({
							start: currentModeStartIndex + startWord,
							end: currentModeStartIndex + endWord
						});
					}
				}
			}
		}

		return r;
	}

	static _getWordsInText(text:string, wordDefinition:RegExp): EditorCommon.IWordRange[] {
		var words = text.match(wordDefinition) || [],
			k:number,
			startWord:number,
			endWord:number,
			startColumn:number,
			endColumn:number,
			word:string,
			r: EditorCommon.IWordRange[] = [];

		for (k = 0; k < words.length; k++) {
			word = words[k].trim();
			if (word.length > 0) {
				startWord = text.indexOf(word, endWord);
				endWord = startWord + word.length;

				startColumn = startWord;
				endColumn = endWord;

				r.push({
					start: startColumn,
					end: endColumn
				});
			}
		}

		return r;
	}

	private static _getWordAtColumn(txt:string, column:number, modeIndex: number, modeTransitions:Modes.IModeTransition[]): EditorCommon.IWordAtPosition {
		var modeStartIndex = modeTransitions[modeIndex].startIndex,
			modeEndIndex = (modeIndex + 1 < modeTransitions.length ? modeTransitions[modeIndex + 1].startIndex : txt.length),
			mode = modeTransitions[modeIndex].mode;

		return WordHelper._getWordAtText(
			column, WordHelper.massageWordDefinitionOf(mode),
			txt.substring(modeStartIndex, modeEndIndex), modeStartIndex
		);
	}

	public static getWordAtPosition(textSource:ITextSource, position:EditorCommon.IPosition): EditorCommon.IWordAtPosition {

		if (!textSource._lineIsTokenized(position.lineNumber)) {
			return WordHelper._getWordAtText(position.column, WordHelper.massageWordDefinitionOf(textSource.getMode()), textSource.getLineContent(position.lineNumber), 0);
		}

		var result: EditorCommon.IWordAtPosition = null;
		var txt = textSource.getLineContent(position.lineNumber),
			modeTransitions = textSource._getLineModeTransitions(position.lineNumber),
			columnIndex = position.column - 1,
			modeIndex = Arrays.findIndexInSegmentsArray(modeTransitions, columnIndex);

		result = WordHelper._getWordAtColumn(txt, position.column, modeIndex, modeTransitions);

		if (!result && modeIndex > 0 && modeTransitions[modeIndex].startIndex === columnIndex) {
			// The position is right at the beginning of `modeIndex`, so try looking at `modeIndex` - 1 too
			result = WordHelper._getWordAtColumn(txt, position.column, modeIndex - 1, modeTransitions);
		}

		return result;
	}

	static _getWordAtText(column:number, wordDefinition:RegExp, text:string, textOffset:number): EditorCommon.IWordAtPosition {

		// console.log('_getWordAtText: ', column, text, textOffset);

		var words = text.match(wordDefinition),
			k:number,
			startWord:number,
			endWord:number,
			startColumn:number,
			endColumn:number,
			word:string;

		if (words) {
			for (k = 0; k < words.length; k++) {
				word = words[k].trim();
				if (word.length > 0) {
					startWord = text.indexOf(word, endWord);
					endWord = startWord + word.length;

					startColumn = textOffset + startWord + 1;
					endColumn = textOffset + endWord + 1;

					if (startColumn <= column && column <= endColumn) {
						return {
							word: word,
							startColumn: startColumn,
							endColumn: endColumn
						};
					}
				}
			}
		}

		return null;
	}
}
