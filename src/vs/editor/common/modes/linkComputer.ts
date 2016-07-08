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

// State machine for http:// or https:// or file://
const STATE_MAP:{[ch:string]:number}[] = [];
const START_STATE = 1;
const END_STATE = 12;
const ACCEPT_STATE = 13;

STATE_MAP[1] = { 'h': 2, 'H': 2, 'f': 6, 'F': 6 };
STATE_MAP[2] = { 't': 3, 'T': 3 };
STATE_MAP[3] = { 't': 4, 'T': 4 };
STATE_MAP[4] = { 'p': 5, 'P': 5 };
STATE_MAP[5] = { 's': 9, 'S': 9, ':': 10 };
STATE_MAP[6] = { 'i': 7, 'I': 7 };
STATE_MAP[7] = { 'l': 8, 'L': 8 };
STATE_MAP[8] = { 'e': 9, 'E': 9 };
STATE_MAP[9] = { ':': 10 };
STATE_MAP[10] = { '/': 11 };
STATE_MAP[11] = { '/': END_STATE };

enum CharacterClass {
	None = 0,
	ForceTermination = 1,
	CannotEndIn = 2
}

const _openParens = '('.charCodeAt(0);
const _closeParens = ')'.charCodeAt(0);
const _openSquareBracket = '['.charCodeAt(0);
const _closeSquareBracket = ']'.charCodeAt(0);
const _openCurlyBracket = '{'.charCodeAt(0);
const _closeCurlyBracket = '}'.charCodeAt(0);

class CharacterClassifier {

	/**
	 * Maintain a compact (fully initialized ASCII map for quickly classifying ASCII characters - used more often in code).
	 */
	private _asciiMap: CharacterClass[];

	/**
	 * The entire map (sparse array).
	 */
	private _map: CharacterClass[];

	constructor() {
		const FORCE_TERMINATION_CHARACTERS = ' \t<>\'\"、。｡､，．：；？！＠＃＄％＆＊‘“〈《「『【〔（［｛｢｣｝］）〕】』」》〉”’｀～…';
		const CANNOT_END_WITH_CHARACTERS = '.,;';

		this._asciiMap = [];
		for (let i = 0; i < 256; i++) {
			this._asciiMap[i] = CharacterClass.None;
		}

		this._map = [];

		for (let i = 0; i < FORCE_TERMINATION_CHARACTERS.length; i++) {
			this._set(FORCE_TERMINATION_CHARACTERS.charCodeAt(i), CharacterClass.ForceTermination);
		}

		for (let i = 0; i < CANNOT_END_WITH_CHARACTERS.length; i++) {
			this._set(CANNOT_END_WITH_CHARACTERS.charCodeAt(i), CharacterClass.CannotEndIn);
		}
	}

	private _set(charCode:number, charClass:CharacterClass): void {
		if (charCode < 256) {
			this._asciiMap[charCode] = charClass;
		}
		this._map[charCode] = charClass;
	}

	public classify(charCode:number): CharacterClass {
		if (charCode < 256) {
			return this._asciiMap[charCode];
		}

		let charClass = this._map[charCode];
		if (charClass) {
			return charClass;
		}

		return CharacterClass.None;
	}
}

const characterClassifier = new CharacterClassifier();

class LinkComputer {

	private static _createLink(line:string, lineNumber:number, linkBeginIndex:number, linkEndIndex:number):ILink {
		// Do not allow to end link in certain characters...
		let lastIncludedCharIndex = linkEndIndex - 1;
		do {
			const chCode = line.charCodeAt(lastIncludedCharIndex);
			const chClass = characterClassifier.classify(chCode);
			if (chClass !== CharacterClass.CannotEndIn) {
				break;
			}
			lastIncludedCharIndex--;
		} while (lastIncludedCharIndex > linkBeginIndex);

		return {
			range: {
				startLineNumber: lineNumber,
				startColumn: linkBeginIndex + 1,
				endLineNumber: lineNumber,
				endColumn: lastIncludedCharIndex + 2
			},
			url: line.substring(linkBeginIndex, lastIncludedCharIndex + 1)
		};
	}

	public static computeLinks(model:ILinkComputerTarget):ILink[] {
		let result:ILink[] = [];
		for (let i = 1, lineCount = model.getLineCount(); i <= lineCount; i++) {
			const line = model.getLineContent(i);
			const len = line.length;

			let j = 0;
			let linkBeginIndex = 0;
			let state = START_STATE;
			let hasOpenParens = false;
			let hasOpenSquareBracket = false;
			let hasOpenCurlyBracket = false;

			while (j < len) {

				let resetStateMachine = false;

				if (state === ACCEPT_STATE) {
					const chCode = line.charCodeAt(j);
					let chClass:CharacterClass;
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
							chClass = characterClassifier.classify(chCode);
					}

					// Check if character terminates link
					if (chClass === CharacterClass.ForceTermination) {
						result.push(LinkComputer._createLink(line, i, linkBeginIndex, j));
						resetStateMachine = true;
					}
				} else if (state === END_STATE) {
					const chCode = line.charCodeAt(j);
					const chClass = characterClassifier.classify(chCode);

					// Check if character terminates link
					if (chClass === CharacterClass.ForceTermination) {
						resetStateMachine = true;
					} else {
						state = ACCEPT_STATE;
					}
				} else {
					const ch = line.charAt(j);
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
