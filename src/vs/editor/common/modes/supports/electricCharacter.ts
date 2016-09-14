/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import * as modes from 'vs/editor/common/modes';
import {handleEvent, ignoreBracketsInToken} from 'vs/editor/common/modes/supports';
import {BracketsUtils} from 'vs/editor/common/modes/supports/richEditBrackets';
import {LanguageConfigurationRegistryImpl} from 'vs/editor/common/modes/languageConfigurationRegistry';

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
	embeddedElectricCharacters?: string[];
}

export class BracketElectricCharacterSupport implements modes.IRichEditElectricCharacter {

	private _registry: LanguageConfigurationRegistryImpl;
	private _modeId: string;
	private contribution: IBracketElectricCharacterContribution;
	private brackets: Brackets;

	constructor(registry:LanguageConfigurationRegistryImpl, modeId: string, brackets: modes.IRichEditBrackets, autoClosePairs: modes.IAutoClosingPairConditional[], contribution: IBracketElectricCharacterContribution) {
		this._registry = registry;
		this._modeId = modeId;
		this.contribution = contribution || {};
		this.brackets = new Brackets(modeId, brackets, autoClosePairs, this.contribution.docComment);
	}

	public getElectricCharacters(): string[]{
		if (Array.isArray(this.contribution.embeddedElectricCharacters)) {
			return this.contribution.embeddedElectricCharacters.concat(this.brackets.getElectricCharacters());
		}
		return this.brackets.getElectricCharacters();
	}

	public onElectricCharacter(context:modes.ILineContext, offset:number): modes.IElectricAction {
		return handleEvent(context, offset, (nestedModeId:string, context:modes.ILineContext, offset:number) => {
			if (this._modeId === nestedModeId) {
				return this.brackets.onElectricCharacter(context, offset);
			}
			let electricCharacterSupport = this._registry.getElectricCharacterSupport(nestedModeId);
			if (electricCharacterSupport) {
				return electricCharacterSupport.onElectricCharacter(context, offset);
			}
			return null;
		});
	}
}



export class Brackets {

	private _modeId: string;
	private _richEditBrackets: modes.IRichEditBrackets;
	private _complexAutoClosePairs: modes.IAutoClosingPairConditional[];

	constructor(modeId: string, richEditBrackets: modes.IRichEditBrackets, autoClosePairs: modes.IAutoClosingPairConditional[], docComment?: IDocComment) {
		this._modeId = modeId;
		this._richEditBrackets = richEditBrackets;
		this._complexAutoClosePairs = autoClosePairs.filter(pair => pair.open.length > 1 && !!pair.close);
		if (docComment) {
			// IDocComment is legacy, only partially supported
			this._complexAutoClosePairs.push({ open: docComment.open, close: docComment.close });
		}
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

		// auto close
		for (let pair of this._complexAutoClosePairs) {
			result.push(pair.open.charAt(pair.open.length - 1));
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

		return (this._onElectricAutoClose(context, offset) ||
			this._onElectricAutoIndent(context, offset));
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

	private _onElectricAutoIndent(context: modes.ILineContext, offset: number): modes.IElectricAction {

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
				text = text.toLowerCase();

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

	private _onElectricAutoClose(context: modes.ILineContext, offset: number): modes.IElectricAction {

		if (!this._complexAutoClosePairs.length) {
			return null;
		}

		var line = context.getLineContent();
		var char: string = line[offset];

		for (let i = 0; i < this._complexAutoClosePairs.length; i++) {
			let pair = this._complexAutoClosePairs[i];

			// See if the right electric character was pressed
			if (char !== pair.open.charAt(pair.open.length - 1)) {
				continue;
			}

			// If this line already contains the closing tag, do nothing.
			if (line.indexOf(pair.close, offset) >= 0) {
				continue;
			}

			// check if the full open bracket matches
			let lastTokenIndex = context.findIndexOfOffset(offset);
			if (line.substring(context.getTokenStartIndex(lastTokenIndex), offset+1/* include electric char*/) !== pair.open) {
				continue;
			}

			// If we're in a scope listen in 'notIn', do nothing
			if (pair.notIn) {
				let tokenType = context.getTokenType(lastTokenIndex);
				if (pair.notIn.some(scope => this.containsTokenTypes(tokenType, scope))) {
					continue;
				}
			}

			return { appendText: pair.close};
		}

	}
}
