/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import * as modes from 'vs/editor/common/modes';
import {handleEvent, ignoreBracketsInToken} from 'vs/editor/common/modes/supports';
import {BracketsUtils} from 'vs/editor/common/modes/supports/richEditBrackets';

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
	docComment?: IDocComment;
	caseInsensitive?: boolean;
	embeddedElectricCharacters?: string[];
}

export class BracketElectricCharacterSupport implements modes.IRichEditElectricCharacter {

	private _modeId: string;
	private contribution: IBracketElectricCharacterContribution;
	private brackets: Brackets;

	constructor(modeId: string, brackets: modes.IRichEditBrackets, contribution: IBracketElectricCharacterContribution) {
		this._modeId = modeId;
		this.contribution = contribution || {};
		this.brackets = new Brackets(modeId, brackets, this.contribution.docComment, this.contribution.caseInsensitive);
	}

	public getElectricCharacters(): string[]{
		if (Array.isArray(this.contribution.embeddedElectricCharacters)) {
			return this.contribution.embeddedElectricCharacters.concat(this.brackets.getElectricCharacters());
		}
		return this.brackets.getElectricCharacters();
	}

	public onElectricCharacter(context:modes.ILineContext, offset:number): modes.IElectricAction {
		return handleEvent(context, offset, (nestedMode:modes.IMode, context:modes.ILineContext, offset:number) => {
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



export class Brackets {

	private _modeId: string;
	private _richEditBrackets: modes.IRichEditBrackets;
	private _docComment: IDocComment;

	constructor(modeId: string, richEditBrackets: modes.IRichEditBrackets, docComment: IDocComment = null, caseInsensitive: boolean = false) {
		this._modeId = modeId;
		this._richEditBrackets = richEditBrackets;
		this._docComment = docComment ? docComment : null;
	}

	public getElectricCharacters():string[] {
		var result: string[] = [];

		if (this._richEditBrackets) {
			for (let i = 0, len = this._richEditBrackets.brackets.length; i < len; i++) {
				let bracketPair = this._richEditBrackets.brackets[i];
				let lastChar = bracketPair.close.charAt(bracketPair.close.length - 1);
				result.push(lastChar);
			}
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

	public onElectricCharacter(context: modes.ILineContext, offset: number): modes.IElectricAction {
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

	private _onElectricCharacterStandardBrackets(context: modes.ILineContext, offset: number): modes.IElectricAction {

		if (!this._richEditBrackets || this._richEditBrackets.brackets.length === 0) {
			return null;
		}

		let reversedBracketRegex = this._richEditBrackets.reversedRegex;

		let lineText = context.getLineContent();
		let tokenIndex = context.findIndexOfOffset(offset);
		let tokenStart = context.getTokenStartIndex(tokenIndex);
		let tokenEnd = offset + 1;

		var firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(context.getLineContent());
		if (firstNonWhitespaceIndex !== -1 && firstNonWhitespaceIndex < tokenStart) {
			return null;
		}

		if (!ignoreBracketsInToken(context.getTokenType(tokenIndex))) {
			let r = BracketsUtils.findPrevBracketInToken(reversedBracketRegex, 1, lineText, tokenStart, tokenEnd);
			if (r) {
				let text = lineText.substring(r.startColumn - 1, r.endColumn - 1);
				let isOpen = this._richEditBrackets.textIsOpenBracket[text];
				if (!isOpen) {
					return {
						matchOpenBracket: text
					};
				}
			}
		}

		return null;
	}

	private _onElectricCharacterDocComment(context: modes.ILineContext, offset: number): modes.IElectricAction {
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
