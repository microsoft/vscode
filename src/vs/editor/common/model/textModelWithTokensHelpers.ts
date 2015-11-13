/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {NullMode} from 'vs/editor/common/modes/nullMode';
import {Range} from 'vs/editor/common/core/range';
import Modes = require('vs/editor/common/modes');
import EditorCommon = require('vs/editor/common/editorCommon');
import {Arrays} from 'vs/editor/common/core/arrays';
import Errors = require('vs/base/common/errors');

export interface ITextSource {

	_lineIsTokenized(lineNumber:number): boolean;

	getLineContent(lineNumber:number): string;

	getLineCount(): number;

	getMode(): Modes.IMode;

	getModeAtPosition(lineNumber:number, column:number): Modes.IMode;

	_getLineModeTransitions(lineNumber:number): Modes.IModeTransition[];

	getLineTokens(lineNumber:number, inaccurateTokensAcceptable:boolean): EditorCommon.ILineTokens;
}

var getType = EditorCommon.LineTokensBinaryEncoding.getType;
var getBracket = EditorCommon.LineTokensBinaryEncoding.getBracket;
var getStartIndex = EditorCommon.LineTokensBinaryEncoding.getStartIndex;

export interface INonWordTokenMap {
	[key:string]:boolean;
}

export class WordHelper {

	private static _safeGetWordDefinition(mode:Modes.IMode): RegExp {
		var result: RegExp = null;

		if (mode.tokenTypeClassificationSupport) {
			try {
				result = mode.tokenTypeClassificationSupport.getWordDefinition();
			} catch(e) {
				Errors.onUnexpectedError(e);
			}
		}

		return result;
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

export class BracketsHelper {

	private static _sign(n:number): number {
		return n < 0 ? -1 : n > 0 ? 1 : 0;
	}

	private static _findMatchingBracketUp(textSource:ITextSource, type:string, lineNumber:number, tokenIndex:number, initialCount:number): Range {

		var i:number,
			end:number,
			j:number,
			count = initialCount;

		for (i = lineNumber; i >= 1; i--) {

			var lineTokens = textSource.getLineTokens(i, false),
				tokens = lineTokens.getBinaryEncodedTokens(),
				tokensMap = lineTokens.getBinaryEncodedTokensMap(),
				lineText = textSource.getLineContent(i);

			for (j = (i === lineNumber ? tokenIndex : tokens.length) - 1; j >= 0; j--) {
				if (getType(tokensMap, tokens[j]) === type) {
					count += BracketsHelper._sign(getBracket(tokens[j]));
					if (count === 0) {
						end = (j === tokens.length - 1 ? lineText.length : getStartIndex(tokens[j + 1]));
						return new Range(i, getStartIndex(tokens[j]) + 1, i, end + 1);
					}
				}
			}
		}
		return null;
	}

	private static _findMatchingBracketDown(textSource:ITextSource, type:string, lineNumber:number, tokenIndex:number, inaccurateResultAcceptable:boolean): { range:Range; isAccurate:boolean; } {

		var i:number,
			len:number,
			end:number,
			j:number,
			lenJ:number,
			count = 1;

		for (i = lineNumber, len = textSource.getLineCount(); i <= len; i++) {
			if (inaccurateResultAcceptable && !textSource._lineIsTokenized(i)) {
				return {
					range: null,
					isAccurate: false
				};
			}

			var lineTokens = textSource.getLineTokens(i, false),
				tokens = lineTokens.getBinaryEncodedTokens(),
				tokensMap = lineTokens.getBinaryEncodedTokensMap(),
				lineText = textSource.getLineContent(i);

			for (j = (i === lineNumber ? tokenIndex + 1 : 0), lenJ = tokens.length; j < lenJ; j++) {
				if (getType(tokensMap, tokens[j]) === type) {
					count += BracketsHelper._sign(getBracket(tokens[j]));
					if (count === 0) {
						end = (j === tokens.length - 1 ? lineText.length : getStartIndex(tokens[j + 1]));
						return {
							range: new Range(i, getStartIndex(tokens[j]) + 1, i, end + 1),
							isAccurate: true
						};
					}
				}
			}
		}

		return {
			range: null,
			isAccurate: true
		};
	}

	public static findMatchingBracketUp(textSource:ITextSource, tokenType:string, position:EditorCommon.IPosition): EditorCommon.IEditorRange {

		var i:number,
			len:number,
			end:number,
			columnIndex = position.column - 1,
			tokenIndex = -1,
			lineTokens = textSource.getLineTokens(position.lineNumber, false),
			tokens = lineTokens.getBinaryEncodedTokens(),
			lineText = textSource.getLineContent(position.lineNumber);

		for (i = 0, len = tokens.length; tokenIndex === -1 && i < len; i++) {
			end = i === len - 1 ? lineText.length : getStartIndex(tokens[i + 1]);

			if (getStartIndex(tokens[i]) <= columnIndex && columnIndex <= end) {
				tokenIndex = i;
			}
		}

		// Start looking one token after the bracket
		return BracketsHelper._findMatchingBracketUp(textSource, tokenType, position.lineNumber, tokenIndex + 1, 0);
	}

	public static matchBracket(textSource:ITextSource, position:EditorCommon.IPosition, inaccurateResultAcceptable:boolean): EditorCommon.IMatchBracketResult {
		if (inaccurateResultAcceptable && !textSource._lineIsTokenized(position.lineNumber)) {
			return {
				brackets: null,
				isAccurate: false
			};
		}

		var lineText = textSource.getLineContent(position.lineNumber),
			i:number,
			len:number;

		var result:EditorCommon.IMatchBracketResult = {
			brackets: null,
			isAccurate: true
		};

		if (lineText.length > 0) {
			var columnIndex = position.column - 1;
			var token:number;
			var end:number;

			var lineTokens = textSource.getLineTokens(position.lineNumber, false),
				tokens = lineTokens.getBinaryEncodedTokens(),
				tokensMap = lineTokens.getBinaryEncodedTokensMap(),
				tokenStartIndex:number,
				tokenBracket:number,
				tokenType:string;

			for (i = 0, len = tokens.length; result.brackets === null && i < len; i++) {
				token = tokens[i];
				tokenStartIndex = getStartIndex(token);
				tokenType = getType(tokensMap, token);
				tokenBracket = getBracket(token);

				end = i === len - 1 ? lineText.length : getStartIndex(tokens[i + 1]);

				if (tokenStartIndex <= columnIndex && columnIndex <= end) {
					if (tokenBracket < 0) {
						var upMatch = BracketsHelper._findMatchingBracketUp(textSource, tokenType, position.lineNumber, i, -1);
						if (upMatch) {
							result.brackets = [new Range(position.lineNumber, tokenStartIndex + 1, position.lineNumber, end + 1), upMatch];
						}
					}
					if (result.brackets === null && tokenBracket > 0) {
						var downMatch = BracketsHelper._findMatchingBracketDown(textSource, tokenType, position.lineNumber, i, inaccurateResultAcceptable);
						result.isAccurate = downMatch.isAccurate;
						if (downMatch.range) {
							result.brackets = [new Range(position.lineNumber, tokenStartIndex + 1, position.lineNumber, end + 1), downMatch.range];
						}
					}
				}
			}
		}
		return result;
	}
}