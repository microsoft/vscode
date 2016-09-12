/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {ILink} from 'vs/editor/common/modes';
import {CharCode} from 'vs/base/common/charCode';
import {CharacterClassifier} from 'vs/editor/common/core/characterClassifier';

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

const classifier = (function() {
	let result = new CharacterClassifier(CharacterClass.None);

	const FORCE_TERMINATION_CHARACTERS = ' \t<>\'\"、。｡､，．：；？！＠＃＄％＆＊‘“〈《「『【〔（［｛｢｣｝］）〕】』」》〉”’｀～…';
	for (let i = 0; i < FORCE_TERMINATION_CHARACTERS.length; i++) {
		result.set(FORCE_TERMINATION_CHARACTERS.charCodeAt(i), CharacterClass.ForceTermination);
	}

	const CANNOT_END_WITH_CHARACTERS = '.,;';
	for (let i = 0; i < CANNOT_END_WITH_CHARACTERS.length; i++) {
		result.set(CANNOT_END_WITH_CHARACTERS.charCodeAt(i), CharacterClass.CannotEndIn);
	}

	return result;
})();

class LinkComputer {

	private static _createLink(line:string, lineNumber:number, linkBeginIndex:number, linkEndIndex:number):ILink {
		// Do not allow to end link in certain characters...
		let lastIncludedCharIndex = linkEndIndex - 1;
		do {
			const chCode = line.charCodeAt(lastIncludedCharIndex);
			const chClass = classifier.get(chCode);
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
						case CharCode.OpenParen:
							hasOpenParens = true;
							chClass = CharacterClass.None;
							break;
						case CharCode.CloseParen:
							chClass = (hasOpenParens ? CharacterClass.None : CharacterClass.ForceTermination);
							break;
						case CharCode.OpenSquareBracket:
							hasOpenSquareBracket = true;
							chClass = CharacterClass.None;
							break;
						case CharCode.CloseSquareBracket:
							chClass = (hasOpenSquareBracket ? CharacterClass.None : CharacterClass.ForceTermination);
							break;
						case CharCode.OpenCurlyBrace:
							hasOpenCurlyBracket = true;
							chClass = CharacterClass.None;
							break;
						case CharCode.CloseCurlyBrace:
							chClass = (hasOpenCurlyBracket ? CharacterClass.None : CharacterClass.ForceTermination);
							break;
						default:
							chClass = classifier.get(chCode);
					}

					// Check if character terminates link
					if (chClass === CharacterClass.ForceTermination) {
						result.push(LinkComputer._createLink(line, i, linkBeginIndex, j));
						resetStateMachine = true;
					}
				} else if (state === END_STATE) {
					const chCode = line.charCodeAt(j);
					const chClass = classifier.get(chCode);

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
