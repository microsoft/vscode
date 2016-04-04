/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import {Range} from 'vs/editor/common/core/range';
import {IRichEditBracket} from 'vs/editor/common/editorCommon';
import * as modes from 'vs/editor/common/modes';

interface ISimpleInternalBracket {
	open: string;
	close: string;
}

export class RichEditBrackets implements modes.IRichEditBrackets {

	public brackets: IRichEditBracket[];
	public forwardRegex: RegExp;
	public reversedRegex: RegExp;
	public maxBracketLength: number;
	public textIsBracket: {[text:string]:IRichEditBracket;};
	public textIsOpenBracket: {[text:string]:boolean;};

	constructor(modeId: string, brackets: modes.CharacterPair[]) {
		this.brackets = brackets.map((b) => {
			return {
				modeId: modeId,
				open: b[0],
				close: b[1],
				forwardRegex: getRegexForBracketPair({ open: b[0], close: b[1] }),
				reversedRegex: getReversedRegexForBracketPair({ open: b[0], close: b[1] })
			};
		});
		this.forwardRegex = getRegexForBrackets(this.brackets);
		this.reversedRegex = getReversedRegexForBrackets(this.brackets);

		this.textIsBracket = {};
		this.textIsOpenBracket = {};
		this.maxBracketLength = 0;
		this.brackets.forEach((b) => {
			this.textIsBracket[b.open] = b;
			this.textIsBracket[b.close] = b;
			this.textIsOpenBracket[b.open] = true;
			this.textIsOpenBracket[b.close] = false;
			this.maxBracketLength = Math.max(this.maxBracketLength, b.open.length);
			this.maxBracketLength = Math.max(this.maxBracketLength, b.close.length);
		});
	}
}

function once<T, R>(keyFn:(input:T)=>string, computeFn:(input:T)=>R):(input:T)=>R {
	let cache: {[key:string]:R;} = {};
	return (input:T):R => {
		let key = keyFn(input);
		if (!cache.hasOwnProperty(key)) {
			cache[key] = computeFn(input);
		}
		return cache[key];
	};
}

var getRegexForBracketPair = once<ISimpleInternalBracket,RegExp>(
	(input) => `${input.open};${input.close}`,
	(input) => {
		return createOrRegex([input.open, input.close]);
	}
);

var getReversedRegexForBracketPair = once<ISimpleInternalBracket,RegExp>(
	(input) => `${input.open};${input.close}`,
	(input) => {
		return createOrRegex([toReversedString(input.open), toReversedString(input.close)]);
	}
);

var getRegexForBrackets = once<ISimpleInternalBracket[],RegExp>(
	(input) => input.map(b => `${b.open};${b.close}`).join(';'),
	(input) => {
		let pieces: string[] = [];
		input.forEach((b) => {
			pieces.push(b.open);
			pieces.push(b.close);
		});
		return createOrRegex(pieces);
	}
);

var getReversedRegexForBrackets = once<ISimpleInternalBracket[],RegExp>(
	(input) => input.map(b => `${b.open};${b.close}`).join(';'),
	(input) => {
		let pieces: string[] = [];
		input.forEach((b) => {
			pieces.push(toReversedString(b.open));
			pieces.push(toReversedString(b.close));
		});
		return createOrRegex(pieces);
	}
);

function createOrRegex(pieces:string[]): RegExp {
	let regexStr = `(${pieces.map(strings.escapeRegExpCharacters).join(')|(')})`;
	return strings.createRegExp(regexStr, true, false, false, false);
}

function toReversedString(str:string): string {
	let reversedStr = '';
	for (let i = str.length - 1; i >= 0; i--) {
		reversedStr += str.charAt(i);
	}
	return reversedStr;
}

export class BracketsUtils {

	private static _findPrevBracketInText(reversedBracketRegex:RegExp, lineNumber:number, reversedText:string, offset:number): Range {
		let m = reversedText.match(reversedBracketRegex);

		if (!m) {
			return null;
		}

		let matchOffset = reversedText.length - m.index;
		let matchLength = m[0].length;
		let absoluteMatchOffset = offset + matchOffset;

		return new Range(lineNumber, absoluteMatchOffset - matchLength + 1, lineNumber, absoluteMatchOffset + 1);
	}

	public static findPrevBracketInToken(reversedBracketRegex:RegExp, lineNumber:number, lineText:string, currentTokenStart:number, currentTokenEnd:number): Range {
		// Because JS does not support backwards regex search, we search forwards in a reversed string with a reversed regex ;)
		let currentTokenReversedText = '';
		for (let index = currentTokenEnd - 1; index >= currentTokenStart; index--) {
			currentTokenReversedText += lineText.charAt(index);
		}

		return this._findPrevBracketInText(reversedBracketRegex, lineNumber, currentTokenReversedText, currentTokenStart);
	}

	public static findNextBracketInText(bracketRegex:RegExp, lineNumber:number, text:string, offset:number): Range {
		let m = text.match(bracketRegex);

		if (!m) {
			return null;
		}

		let matchOffset = m.index;
		let matchLength = m[0].length;
		let absoluteMatchOffset = offset + matchOffset;

		return new Range(lineNumber, absoluteMatchOffset + 1, lineNumber, absoluteMatchOffset + 1 + matchLength);
	}

	public static findNextBracketInToken(bracketRegex:RegExp, lineNumber:number, lineText:string, currentTokenStart:number, currentTokenEnd:number): Range {
		let currentTokenText = lineText.substring(currentTokenStart, currentTokenEnd);

		return this.findNextBracketInText(bracketRegex, lineNumber, currentTokenText, currentTokenStart);
	}

}
