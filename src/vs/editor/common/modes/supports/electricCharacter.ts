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

enum Lettercase { Unknown, Lowercase, Uppercase, Camelcase}

export class Brackets {

	private _modeId: string;
	private brackets: Modes.IBracketPair[];
	private docComment: IDocComment;
	private caseInsensitive: boolean;

	/**
	 * In case of case insensitive brackets, these assumptions must be met:
	 * - all standard brackets are passed as lowercase
	 * - the passed regular expressions already contain the /i flag
	 *
	 * Brackets defined in 'regexBrackets' are not used in the following methods:
	 * - stringIsBracket
	 *
	 */
	constructor(modeId: string, brackets: Modes.IBracketPair[], docComment: IDocComment = null, caseInsensitive: boolean = false) {
		this._modeId = modeId;
		this.brackets = brackets;
		this.docComment = docComment ? docComment : null;
		this.caseInsensitive = caseInsensitive ? caseInsensitive : false;
	}

	public getElectricCharacters():string[] {
		var result: string[] = [];

		// Plain brackets
		var bracketPair: Modes.IBracketPair;
		var length = this.brackets.length;
		for (var i = 0; i < length; i++) {
			bracketPair = this.brackets[i];
			if (bracketPair.isElectric) {
				var lastChar = bracketPair.close.charAt(bracketPair.close.length - 1);
				result.push(this.caseInsensitive ? lastChar.toLowerCase() : lastChar);
			}
		}

		// Doc comments
		if (this.docComment){
			result.push(this.docComment.open.charAt(this.docComment.open.length - 1));
		}

		// Add uppercase if needed
		if (this.caseInsensitive)
		{
			var oldLength = result.length;
			for (var i = 0; i < oldLength; ++i) {
				result.push(result[i].toUpperCase());
			}
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

	public stringIsBracket(text: string): boolean {
		var caseCorrectString = text;
		if (this.caseInsensitive) {
			caseCorrectString = text.toLowerCase();
		}

		var bracketPair: Modes.IBracketPair;
		for (var i = 0; i < this.brackets.length; i++) {
			bracketPair = this.brackets[i];
			if (caseCorrectString === bracketPair.open || caseCorrectString === bracketPair.close) {
				return true;
			}
		}
		return false;
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
	private static _findPrevBracketInToken(reversedBracketRegex:RegExp, lineNumber:number, lineText:string, currentTokenStart:number, currentTokenEnd:number): Range {
		// Because JS does not support backwards regex search, we search forwards in a reversed string with a reversed regex ;)
		let currentTokenReversedText = '';
		for (let index = currentTokenEnd - 1; index >= currentTokenStart; index--) {
			currentTokenReversedText += lineText.charAt(index);
		}

		return this._findPrevBracketInText(reversedBracketRegex, lineNumber, currentTokenReversedText, currentTokenStart);
	}

	// TODO: dup in textModelWithTokens
	private static _toFoundBracket(r:Range, text:string): IFoundBracket {
		if (!r) {
			return null;
		}

		// TODO@Alex: use mode's brackets
		switch (text) {
			case '(': return { range: r, open: '(', close: ')', isOpen: true };
			case ')': return { range: r, open: '(', close: ')', isOpen: false };
			case '[': return { range: r, open: '[', close: ']', isOpen: true };
			case ']': return { range: r, open: '[', close: ']', isOpen: false };
			case '{': return { range: r, open: '{', close: '}', isOpen: true };
			case '}': return { range: r, open: '{', close: '}', isOpen: false };
		}
		return null;
	}

	private _onElectricCharacterStandardBrackets(context: Modes.ILineContext, offset: number): Modes.IElectricAction {

		let reversedBracketRegex = /[\(\)\[\]\{\}]/; // TODO@Alex: use mode's brackets

		let lineText = context.getLineContent();
		let tokenIndex = context.findIndexOfOffset(offset);
		let tokenStart = context.getTokenStartIndex(tokenIndex);
		let tokenEnd = offset + 1;

		var firstNonWhitespaceIndex = Strings.firstNonWhitespaceIndex(context.getLineContent());
		if (firstNonWhitespaceIndex !== -1 && firstNonWhitespaceIndex < tokenStart) {
			return null;
		}

		if (!ignoreBracketsInToken(context.getTokenType(tokenIndex))) {
			let r = Brackets._findPrevBracketInToken(reversedBracketRegex, 1, lineText, tokenStart, tokenEnd);
			if (r) {
				let text = lineText.substring(r.startColumn - 1, r.endColumn - 1);
				let data = Brackets._toFoundBracket(r, text);
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
		if (!this.docComment || !this.docComment.close) {
			return null;
		}

		var line = context.getLineContent();
		var char: string = line[offset];

		// See if the right electric character was pressed
		if (char !== this.docComment.open.charAt(this.docComment.open.length - 1)) {
			return null;
		}

		// If this line already contains the closing tag, do nothing.
		if (line.indexOf(this.docComment.close, offset) >= 0) {
			return null;
		}

		// If we're not in a documentation comment, do nothing.
		var lastTokenIndex = context.findIndexOfOffset(offset);
		if (! this.containsTokenTypes(context.getTokenType(lastTokenIndex), this.docComment.scope)) {
			return null;
		}

		if (line.substring(context.getTokenStartIndex(lastTokenIndex), offset+1/* include electric char*/) !== this.docComment.open) {
			return null;
		}

		return { appendText: this.docComment.close};
	}

	private _detectLetercase(s: string): Lettercase {
		if (s.toLowerCase() === s) {
			return Lettercase.Lowercase;
		}
		if (s.toUpperCase() === s) {
			return Lettercase.Uppercase;
		}
		if (s.length > 1) {
			if (s.charAt(0).toUpperCase() === s.charAt(0) && s.charAt(1).toLowerCase() === s.charAt(1)) {
				return Lettercase.Camelcase;
			}
		}

		return Lettercase.Unknown;
	}

	private _changeLettercase(s: string, newCase: Lettercase): string {
		switch (newCase) {
			case Lettercase.Lowercase:
				return s.toLowerCase();
			case Lettercase.Uppercase:
				return s.toUpperCase();
			case Lettercase.Camelcase:
				var words = s.toLowerCase().split(' ');
				for (var i = 0; i < words.length; ++i) {
					words[i] = words[i].charAt(0).toUpperCase() + words[i].substr(1);
				}
				return words.join(' ');
			default:
				return s;
		}
	}
}
