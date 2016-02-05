/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import Strings = require('vs/base/common/strings');
import Modes = require('vs/editor/common/modes');

enum Lettercase { Unknown, Lowercase, Uppercase, Camelcase}

export class Brackets {

	private brackets: Modes.IBracketPair[];
	private regexBrackets: Modes.IRegexBracketPair[];
	private docComment: Modes.IDocComment;
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
	constructor(brackets: Modes.IBracketPair[], regexBrackets: Modes.IRegexBracketPair[] = [], docComment: Modes.IDocComment = null,
		caseInsensitive: boolean = false) {
		this.brackets = brackets;
		this.regexBrackets = regexBrackets ? regexBrackets : [];
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

		// Regexp brackets (always electric)
		var regexBracketPair: Modes.IRegexBracketPair;
		length = this.regexBrackets.length;
		for (var i = 0; i < length; i++) {
			regexBracketPair = this.regexBrackets[i];
			if (regexBracketPair.openTrigger) {
				result.push( this.caseInsensitive ? regexBracketPair.openTrigger.toLowerCase() : regexBracketPair.openTrigger);
			}
			if (regexBracketPair.closeTrigger) {
				result.push( this.caseInsensitive ? regexBracketPair.closeTrigger.toLowerCase() : regexBracketPair.closeTrigger);
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

	public onEnter(context: Modes.ILineContext, offset: number): Modes.IEnterAction {
		if (context.getTokenCount() === 0) {
			return null;
		}

		return this._onEnterRegexBrackets(context, offset);
	}

	public onElectricCharacter(context: Modes.ILineContext, offset: number): Modes.IElectricAction {
		if (context.getTokenCount() === 0) {
			return null;
		}

		return (this._onElectricCharacterDocComment(context, offset) ||
			this._onElectricCharacterRegexBrackets(context, offset) ||
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

	private _onEnterRegexBrackets(context: Modes.ILineContext, offset: number): Modes.IEnterAction {
		// Handle regular expression brackets
		for (var i = 0; i < this.regexBrackets.length; ++i) {
			var regexBracket = this.regexBrackets[i];
			var line = context.getLineContent();

			if (this.caseInsensitive) {
				line = line.toLowerCase(); // Even with the /../i regexes we need this for the indexof below
			}

			// Check if an open bracket matches the line up to offset.
			var matchLine = line.substr(0, offset);
			var matches = matchLine.match(regexBracket.open);

			if (matches) {

				// The opening bracket matches. Check the closing one.
				if (regexBracket.closeComplete) {
					matchLine = line.substring(offset);
					var matchAfter = matches[0].replace(regexBracket.open, regexBracket.closeComplete);
					if (matchLine.indexOf(matchAfter) === 0) {
						return { indentAction: Modes.IndentAction.IndentOutdent };
					}
				}

				return { indentAction: Modes.IndentAction.Indent };
			}
		}

		return null;
	}

	private _onElectricCharacterStandardBrackets(context: Modes.ILineContext, offset: number): Modes.IElectricAction {
		var tokenIndex = context.findIndexOfOffset(offset);
		var tokenText = context.getTokenText(tokenIndex);
		var tokenType = context.getTokenType(tokenIndex);
		if (!this.stringIsBracket(tokenText)) {
			// This is not a brace type that we are aware of.
			// Keep in mind that tokenType above might be different than what this.tokenTypeFromString(tokenText)
			// returns, which could happen when using TextMate bundles.
			return null;
		}

		if (tokenIndex >= 0 && context.getTokenEndIndex(tokenIndex)-1 > offset) {
			// We're in the middle of a token, do not do anything
			return null;
		}

		var firstNonWhitespaceIndex = Strings.firstNonWhitespaceIndex(context.getLineContent());

		if (firstNonWhitespaceIndex !== -1 && firstNonWhitespaceIndex <= offset-tokenText.length) {
			return null;
		}

		return { matchBracketType: tokenType };
	}

	private _onElectricCharacterRegexBrackets(context: Modes.ILineContext, offset: number): Modes.IElectricAction {
		// Handle regular expression brackets
		var line = context.getLineContent();
		for (var i = 0; i < this.regexBrackets.length; ++i) {
			var regexBracket = this.regexBrackets[i];

			// Check if an open bracket matches the line up to offset.
			if (regexBracket.openTrigger && regexBracket.closeComplete &&
				(line.charAt(offset) === regexBracket.openTrigger ||
					(this.caseInsensitive && line.charAt(offset).toLowerCase() === regexBracket.openTrigger.toLowerCase()))) {

				var matchLine = line.substr(0, offset+1);
				var matches = matchLine.match(regexBracket.open);
				if (matches) {
					// Auto-complete with closing bracket.
					var finalText = matches[0].replace(regexBracket.open, regexBracket.closeComplete);
					if (regexBracket.matchCase) {
						finalText = this._changeLettercase(finalText, this._detectLetercase(matches[0]));
					}
					return { appendText: finalText };
				}
			}

			// Check if a close bracket matches the line up to offset.
			if (regexBracket.closeTrigger &&
					(line.charAt(offset) === regexBracket.closeTrigger ||
						(this.caseInsensitive && line.charAt(offset).toLowerCase() === regexBracket.closeTrigger.toLowerCase()))) {
				var matches = matchLine.match(regexBracket.close);
				if (matches) {
					// Auto-indent to the level of the opening bracket.
					var properCaseMatch = matches[0];
					if (this.caseInsensitive) {
						properCaseMatch = properCaseMatch.toLowerCase();
					}
					return { matchBracketType: properCaseMatch.replace(regexBracket.close, regexBracket.tokenType)};
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