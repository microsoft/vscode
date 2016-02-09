/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Modes from 'vs/editor/common/modes';
import {handleEvent, ignoreBracketsInToken} from 'vs/editor/common/modes/supports';
import Strings = require('vs/base/common/strings');
import {Range} from 'vs/editor/common/core/range';
import {IFoundBracket} from 'vs/editor/common/editorCommon';
import {Arrays} from 'vs/editor/common/core/arrays';

/**
 * Definition of documentation comments (e.g. Javadoc/JSdoc)
 */
export interface IDocComment {
	scope: string; // What tokens should be used to detect a doc comment (e.g. 'comment.documentation').
	open: string; // The string that starts a doc comment (e.g. '/**')
	lineStart: string; // The string that appears at the start of each line, except the first and last (e.g. ' * ').
	close?: string; // The string that appears on the last line and closes the doc comment (e.g. ' */').
}

export interface IBracketElectricCharacterContribution {
	brackets: Modes.IBracketPair[];
	docComment?: IDocComment;
	caseInsensitive?: boolean;
	embeddedElectricCharacters?: string[];
}

export class BracketElectricCharacterSupport implements Modes.IRichEditElectricCharacter {

	private _modeId: string;
	private contribution: IBracketElectricCharacterContribution;
	private brackets: Brackets;

	constructor(modeId: string, contribution: IBracketElectricCharacterContribution) {
		this._modeId = modeId;
		this.contribution = contribution;
		this.brackets = new Brackets(modeId, contribution.brackets, contribution.docComment, contribution.caseInsensitive);
	}

	public getElectricCharacters(): string[]{
		if (Array.isArray(this.contribution.embeddedElectricCharacters)) {
			return this.contribution.embeddedElectricCharacters.concat(this.brackets.getElectricCharacters());
		}
		return this.brackets.getElectricCharacters();
	}

	public onElectricCharacter(context:Modes.ILineContext, offset:number): Modes.IElectricAction {
		return handleEvent(context, offset, (nestedMode:Modes.IMode, context:Modes.ILineContext, offset:number) => {
			if (this._modeId === nestedMode.getId()) {
				return this.brackets.onElectricCharacter(context, offset);
			} else if (nestedMode.richEditSupport && nestedMode.richEditSupport.electricCharacter) {
				return nestedMode.richEditSupport.electricCharacter.onElectricCharacter(context, offset);
			} else {
				return null;
			}
		});
	}
}

interface ISimpleInternalBracket {
	open: string;
	close: string;
}

interface IInternalBrackets extends ISimpleInternalBracket {
	forwardRegex: RegExp;
	reversedRegex: RegExp;
}

interface ITextBracket {
	open: string;
	close: string;
	isOpen: boolean;
}

export class Brackets {

	private _modeId: string;
	private _brackets: IInternalBrackets[];
	private _bracketsForwardRegex: RegExp;
	private _bracketsReversedRegex: RegExp;
	private _text2Bracket: {[text:string]:ITextBracket;};
	private _docComment: IDocComment;

	constructor(modeId: string, brackets: Modes.IBracketPair[], docComment: IDocComment = null, caseInsensitive: boolean = false) {
		this._modeId = modeId;
		this._brackets = brackets.map((b) => {
			return {
				open: b.open,
				close: b.close,
				forwardRegex: getRegexForBracketPair({ open: b.open, close: b.close }),
				reversedRegex: getReversedRegexForBracketPair({ open: b.open, close: b.close })
			};
		});
		this._bracketsForwardRegex = getRegexForBrackets(this._brackets);
		this._bracketsReversedRegex = getReversedRegexForBrackets(this._brackets);
		this._text2Bracket = {};
		this._brackets.forEach((b) => {
			this._text2Bracket[b.open] = { open: b.open, close: b.close, isOpen: true };
			this._text2Bracket[b.close] = { open: b.open, close: b.close, isOpen: false };
		});
		this._docComment = docComment ? docComment : null;
	}

	public getElectricCharacters():string[] {
		var result: string[] = [];

		for (let i = 0, len = this._brackets.length; i < len; i++) {
			let bracketPair = this._brackets[i];
			let lastChar = bracketPair.close.charAt(bracketPair.close.length - 1);
			result.push(lastChar);
		}

		// Doc comments
		if (this._docComment){
			result.push(this._docComment.open.charAt(this._docComment.open.length - 1));
		}

		// Filter duplicate entries
		result = result.filter((item, pos, array) => {
			return array.indexOf(item) === pos;
		});

		return result;
	}

	public onElectricCharacter(context: Modes.ILineContext, offset: number): Modes.IElectricAction {
		if (context.getTokenCount() === 0) {
			return null;
		}

		return (this._onElectricCharacterDocComment(context, offset) ||
			this._onElectricCharacterStandardBrackets(context, offset));
	}

	private containsTokenTypes(fullTokenSpec: string, tokensToLookFor: string): boolean {
		var array = tokensToLookFor.split('.');
		for (var i = 0; i < array.length; ++i) {
			if (fullTokenSpec.indexOf(array[i]) < 0) {
				return false;
			}
		}
		return true;
	}

	private _onElectricCharacterStandardBrackets(context: Modes.ILineContext, offset: number): Modes.IElectricAction {

		if (this._brackets.length === 0) {
			return null;
		}

		let reversedBracketRegex = this._bracketsReversedRegex;

		let lineText = context.getLineContent();
		let tokenIndex = context.findIndexOfOffset(offset);
		let tokenStart = context.getTokenStartIndex(tokenIndex);
		let tokenEnd = offset + 1;

		var firstNonWhitespaceIndex = Strings.firstNonWhitespaceIndex(context.getLineContent());
		if (firstNonWhitespaceIndex !== -1 && firstNonWhitespaceIndex < tokenStart) {
			return null;
		}

		if (!ignoreBracketsInToken(context.getTokenType(tokenIndex))) {
			let r = BracketsUtils.findPrevBracketInToken(reversedBracketRegex, 1, lineText, tokenStart, tokenEnd);
			if (r) {
				let text = lineText.substring(r.startColumn - 1, r.endColumn - 1);
				let data = this._text2Bracket[text];
				if (!data.isOpen) {
					return {
						matchOpenBracket: {
							modeId: this._modeId,
							open: data.open,
							close: data.close
						}
					}
				}
			}
		}

		return null;
	}

	private _onElectricCharacterDocComment(context: Modes.ILineContext, offset: number): Modes.IElectricAction {
		// We only auto-close, so do nothing if there is no closing part.
		if (!this._docComment || !this._docComment.close) {
			return null;
		}

		var line = context.getLineContent();
		var char: string = line[offset];

		// See if the right electric character was pressed
		if (char !== this._docComment.open.charAt(this._docComment.open.length - 1)) {
			return null;
		}

		// If this line already contains the closing tag, do nothing.
		if (line.indexOf(this._docComment.close, offset) >= 0) {
			return null;
		}

		// If we're not in a documentation comment, do nothing.
		var lastTokenIndex = context.findIndexOfOffset(offset);
		if (! this.containsTokenTypes(context.getTokenType(lastTokenIndex), this._docComment.scope)) {
			return null;
		}

		if (line.substring(context.getTokenStartIndex(lastTokenIndex), offset+1/* include electric char*/) !== this._docComment.open) {
			return null;
		}

		return { appendText: this._docComment.close};
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
	}
}

// TODO: dup in textModelWithTokens
var getRegexForBracketPair = once<ISimpleInternalBracket,RegExp>(
	(input) => `${input.open};${input.close}`,
	(input) => {
		return createOrRegex([input.open, input.close]);
	}
);

// TODO: dup in textModelWithTokens
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
	let regexStr = `(${pieces.map(Strings.escapeRegExpCharacters).join(')|(')})`;
	return Strings.createRegExp(regexStr, true, false, false, false);
}

// TODO: dup in textModelWithTokens
function toReversedString(str:string): string {
	let reversedStr = '';
	for (let i = str.length - 1; i >= 0; i--) {
		reversedStr += str.charAt(i);
	}
	return reversedStr;
}

export class BracketsUtils {

	// TODO: dup in textModelWithTokens
	private static _findPrevBracketInText(reversedBracketRegex:RegExp, lineNumber:number, reversedText:string, offset:number): Range {
		let m = reversedText.match(reversedBracketRegex);

		if (!m) {
			return null;
		}

		let matchOffset = reversedText.length - 1 - m.index;
		let matchLength = m[0].length;
		let absoluteMatchOffset = offset + matchOffset;

		return new Range(lineNumber, absoluteMatchOffset + 1, lineNumber, absoluteMatchOffset + 1 + matchLength);
	}

	// TODO: dup in textModelWithTokens
	public static findPrevBracketInToken(reversedBracketRegex:RegExp, lineNumber:number, lineText:string, currentTokenStart:number, currentTokenEnd:number): Range {
		// Because JS does not support backwards regex search, we search forwards in a reversed string with a reversed regex ;)
		let currentTokenReversedText = '';
		for (let index = currentTokenEnd - 1; index >= currentTokenStart; index--) {
			currentTokenReversedText += lineText.charAt(index);
		}

		return this._findPrevBracketInText(reversedBracketRegex, lineNumber, currentTokenReversedText, currentTokenStart);
	}

}
