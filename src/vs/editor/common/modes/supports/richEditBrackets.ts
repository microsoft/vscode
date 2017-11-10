/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { Range } from 'vs/editor/common/core/range';
import { CharacterPair } from 'vs/editor/common/modes/languageConfiguration';
import { LanguageIdentifier } from 'vs/editor/common/modes';

interface ISimpleInternalBracket {
	open: string;
	close: string;
}

export class RichEditBracket {
	_richEditBracketBrand: void;

	readonly languageIdentifier: LanguageIdentifier;
	readonly open: string;
	readonly close: string;
	readonly forwardRegex: RegExp;
	readonly reversedRegex: RegExp;

	constructor(languageIdentifier: LanguageIdentifier, open: string, close: string, forwardRegex: RegExp, reversedRegex: RegExp) {
		this.languageIdentifier = languageIdentifier;
		this.open = open;
		this.close = close;
		this.forwardRegex = forwardRegex;
		this.reversedRegex = reversedRegex;
	}
}

export class RichEditBrackets {
	_richEditBracketsBrand: void;

	public readonly brackets: RichEditBracket[];
	public readonly forwardRegex: RegExp;
	public readonly reversedRegex: RegExp;
	public readonly maxBracketLength: number;
	public readonly textIsBracket: { [text: string]: RichEditBracket; };
	public readonly textIsOpenBracket: { [text: string]: boolean; };

	constructor(languageIdentifier: LanguageIdentifier, brackets: CharacterPair[]) {
		this.brackets = brackets.map((b) => {
			return new RichEditBracket(
				languageIdentifier,
				b[0],
				b[1],
				getRegexForBracketPair({ open: b[0], close: b[1] }),
				getReversedRegexForBracketPair({ open: b[0], close: b[1] })
			);
		});
		this.forwardRegex = getRegexForBrackets(this.brackets);
		this.reversedRegex = getReversedRegexForBrackets(this.brackets);

		this.textIsBracket = {};
		this.textIsOpenBracket = {};

		let maxBracketLength = 0;
		this.brackets.forEach((b) => {
			this.textIsBracket[b.open.toLowerCase()] = b;
			this.textIsBracket[b.close.toLowerCase()] = b;
			this.textIsOpenBracket[b.open.toLowerCase()] = true;
			this.textIsOpenBracket[b.close.toLowerCase()] = false;
			maxBracketLength = Math.max(maxBracketLength, b.open.length);
			maxBracketLength = Math.max(maxBracketLength, b.close.length);
		});
		this.maxBracketLength = maxBracketLength;
	}
}

function once<T, R>(keyFn: (input: T) => string, computeFn: (input: T) => R): (input: T) => R {
	let cache: { [key: string]: R; } = {};
	return (input: T): R => {
		let key = keyFn(input);
		if (!cache.hasOwnProperty(key)) {
			cache[key] = computeFn(input);
		}
		return cache[key];
	};
}

var getRegexForBracketPair = once<ISimpleInternalBracket, RegExp>(
	(input) => `${input.open};${input.close}`,
	(input) => {
		return createOrRegex([input.open, input.close]);
	}
);

var getReversedRegexForBracketPair = once<ISimpleInternalBracket, RegExp>(
	(input) => `${input.open};${input.close}`,
	(input) => {
		return createOrRegex([toReversedString(input.open), toReversedString(input.close)]);
	}
);

var getRegexForBrackets = once<ISimpleInternalBracket[], RegExp>(
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

var getReversedRegexForBrackets = once<ISimpleInternalBracket[], RegExp>(
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

function createOrRegex(pieces: string[]): RegExp {
	let regexStr = `(${pieces.map(strings.escapeRegExpCharacters).join(')|(')})`;
	return strings.createRegExp(regexStr, true);
}

let toReversedString = (function () {

	function reverse(str: string): string {
		let reversedStr = '';
		for (let i = str.length - 1; i >= 0; i--) {
			reversedStr += str.charAt(i);
		}
		return reversedStr;
	}

	let lastInput: string = null;
	let lastOutput: string = null;
	return function toReversedString(str: string): string {
		if (lastInput !== str) {
			lastInput = str;
			lastOutput = reverse(lastInput);
		}
		return lastOutput;
	};
})();

export class BracketsUtils {

	private static _findPrevBracketInText(reversedBracketRegex: RegExp, lineNumber: number, reversedText: string, offset: number): Range {
		let m = reversedText.match(reversedBracketRegex);

		if (!m) {
			return null;
		}

		let matchOffset = reversedText.length - m.index;
		let matchLength = m[0].length;
		let absoluteMatchOffset = offset + matchOffset;

		return new Range(lineNumber, absoluteMatchOffset - matchLength + 1, lineNumber, absoluteMatchOffset + 1);
	}

	public static findPrevBracketInToken(reversedBracketRegex: RegExp, lineNumber: number, lineText: string, currentTokenStart: number, currentTokenEnd: number): Range {
		// Because JS does not support backwards regex search, we search forwards in a reversed string with a reversed regex ;)
		let reversedLineText = toReversedString(lineText);
		let reversedTokenText = reversedLineText.substring(lineText.length - currentTokenEnd, lineText.length - currentTokenStart);

		return this._findPrevBracketInText(reversedBracketRegex, lineNumber, reversedTokenText, currentTokenStart);
	}

	public static findNextBracketInText(bracketRegex: RegExp, lineNumber: number, text: string, offset: number): Range {
		let m = text.match(bracketRegex);

		if (!m) {
			return null;
		}

		let matchOffset = m.index;
		let matchLength = m[0].length;
		let absoluteMatchOffset = offset + matchOffset;

		return new Range(lineNumber, absoluteMatchOffset + 1, lineNumber, absoluteMatchOffset + 1 + matchLength);
	}

	public static findNextBracketInToken(bracketRegex: RegExp, lineNumber: number, lineText: string, currentTokenStart: number, currentTokenEnd: number): Range {
		let currentTokenText = lineText.substring(currentTokenStart, currentTokenEnd);

		return this.findNextBracketInText(bracketRegex, lineNumber, currentTokenText, currentTokenStart);
	}

}
