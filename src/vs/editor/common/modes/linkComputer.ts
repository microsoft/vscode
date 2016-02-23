/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ILink} from 'vs/editor/common/modes';

export interface ILinkComputerTarget {
	getLineCount(): number;
	getLineContent(lineNumber:number): string;
}

// State machine for http:// or https://
var STATE_MAP:{[ch:string]:number}[] = [], START_STATE = 1, END_STATE = 9, ACCEPT_STATE = 10;
STATE_MAP[1] = { 'h': 2, 'H': 2 };
STATE_MAP[2] = { 't': 3, 'T': 3 };
STATE_MAP[3] = { 't': 4, 'T': 4 };
STATE_MAP[4] = { 'p': 5, 'P': 5 };
STATE_MAP[5] = { 's': 6, 'S': 6, ':': 7 };
STATE_MAP[6] = { ':': 7 };
STATE_MAP[7] = { '/': 8 };
STATE_MAP[8] = { '/': 9 };

enum CharacterClass {
	None = 0,
	ForceTermination = 1,
	CannotEndIn = 2
}

var getCharacterClasses = (function() {
	var FORCE_TERMINATION_CHARACTERS = ' \t<>\'\"';
	var CANNOT_END_WITH_CHARACTERS = '.,;';
	var _cachedResult: CharacterClass[] = null;

	var findLargestCharCode = (str:string):number => {
		var r = 0;
		for (var i = 0, len = str.length; i < len; i++) {
			r = Math.max(r, str.charCodeAt(i));
		}
		return r;
	};

	var set = (str:string, toWhat:CharacterClass): void => {
		for (var i = 0, len = str.length; i < len; i++) {
			_cachedResult[str.charCodeAt(i)] = toWhat;
		}
	};

	return function(): CharacterClass[] {
		if (_cachedResult === null) {
			// Find cachedResult size
			var largestCharCode = Math.max(
				findLargestCharCode(FORCE_TERMINATION_CHARACTERS),
				findLargestCharCode(CANNOT_END_WITH_CHARACTERS)
			);

			// Initialize cachedResult
			_cachedResult = [];
			for (var i = 0; i < largestCharCode; i++) {
				_cachedResult[i] = CharacterClass.None;
			}

			// Fill in cachedResult
			set(FORCE_TERMINATION_CHARACTERS, CharacterClass.ForceTermination);
			set(CANNOT_END_WITH_CHARACTERS, CharacterClass.CannotEndIn);
		}

		return _cachedResult;
	};
})();

let _openParens = '('.charCodeAt(0);
let _closeParens = ')'.charCodeAt(0);
let _openSquareBracket = '['.charCodeAt(0);
let _closeSquareBracket = ']'.charCodeAt(0);
let _openCurlyBracket = '{'.charCodeAt(0);
let _closeCurlyBracket = '}'.charCodeAt(0);

class LinkComputer {

	private static _createLink(line:string, lineNumber:number, linkBeginIndex:number, linkEndIndex:number):ILink {
		return {
			range: {
				startLineNumber: lineNumber,
				startColumn: linkBeginIndex + 1,
				endLineNumber: lineNumber,
				endColumn: linkEndIndex + 1
			},
			url: line.substring(linkBeginIndex, linkEndIndex)
		};
	}

	public static computeLinks(model:ILinkComputerTarget):ILink[] {

		var i:number,
			lineCount:number,
			result:ILink[] = [];

		var line:string,
			j:number,
			lastIncludedCharIndex:number,
			len:number,
			characterClasses = getCharacterClasses(),
			characterClassesLength = characterClasses.length,
			linkBeginIndex:number,
			state:number,
			ch:string,
			chCode:number,
			chClass:CharacterClass,
			resetStateMachine:boolean,
			hasOpenParens:boolean,
			hasOpenSquareBracket:boolean,
			hasOpenCurlyBracket:boolean;

		for (i = 1, lineCount = model.getLineCount(); i <= lineCount; i++) {
			line = model.getLineContent(i);
			j = 0;
			len = line.length;
			linkBeginIndex = 0;
			state = START_STATE;
			hasOpenParens = false;
			hasOpenSquareBracket = false;
			hasOpenCurlyBracket = false;

			while (j < len) {
				ch = line.charAt(j);
				chCode = line.charCodeAt(j);
				resetStateMachine = false;

				if (state === ACCEPT_STATE) {

					switch (chCode) {
						case _openParens:
							hasOpenParens = true;
							chClass = CharacterClass.None;
							break;
						case _closeParens:
							chClass = (hasOpenParens ? CharacterClass.None : CharacterClass.ForceTermination);
							break;
						case _openSquareBracket:
							hasOpenSquareBracket = true;
							chClass = CharacterClass.None;
							break;
						case _closeSquareBracket:
							chClass = (hasOpenSquareBracket ? CharacterClass.None : CharacterClass.ForceTermination);
							break;
						case _openCurlyBracket:
							hasOpenCurlyBracket = true;
							chClass = CharacterClass.None;
							break;
						case _closeCurlyBracket:
							chClass = (hasOpenCurlyBracket ? CharacterClass.None : CharacterClass.ForceTermination);
							break;
						default:
							chClass = (chCode < characterClassesLength ? characterClasses[chCode] : CharacterClass.None);
					}

					// Check if character terminates link
					if (chClass === CharacterClass.ForceTermination) {

						// Do not allow to end link in certain characters...
						lastIncludedCharIndex = j - 1;
						do {
							chCode = line.charCodeAt(lastIncludedCharIndex);
							chClass = (chCode < characterClassesLength ? characterClasses[chCode] : CharacterClass.None);
							if (chClass !== CharacterClass.CannotEndIn) {
								break;
							}
							lastIncludedCharIndex--;
						} while (lastIncludedCharIndex > linkBeginIndex);

						result.push(LinkComputer._createLink(line, i, linkBeginIndex, lastIncludedCharIndex + 1));
						resetStateMachine = true;
					}
				} else if (state === END_STATE) {
					chClass = (chCode < characterClassesLength ? characterClasses[chCode] : CharacterClass.None);

					// Check if character terminates link
					if (chClass === CharacterClass.ForceTermination) {
						resetStateMachine = true;
					} else {
						state = ACCEPT_STATE;
					}
				} else {
					if (STATE_MAP[state].hasOwnProperty(ch)) {
						state = STATE_MAP[state][ch];
					} else {
						resetStateMachine = true;
					}
				}

				if (resetStateMachine) {
					state = START_STATE;
					hasOpenParens = false;
					hasOpenSquareBracket = false;
					hasOpenCurlyBracket = false;

					// Record where the link started
					linkBeginIndex = j + 1;
				}

				j++;
			}

			if (state === ACCEPT_STATE) {
				result.push(LinkComputer._createLink(line, i, linkBeginIndex, len));
			}

		}

		return result;
	}
}

/**
 * Returns an array of all links contains in the provided
 * document. *Note* that this operation is computational
 * expensive and should not run in the UI thread.
 */
export function computeLinks(model:ILinkComputerTarget):ILink[] {
	if (!model || typeof model.getLineCount !== 'function' || typeof model.getLineContent !== 'function') {
		// Unknown caller!
		return [];
	}
	return LinkComputer.computeLinks(model);
}
