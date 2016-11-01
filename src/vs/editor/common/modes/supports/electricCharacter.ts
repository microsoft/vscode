/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as strings from 'vs/base/common/strings';
import { ScopedLineTokens, ignoreBracketsInToken } from 'vs/editor/common/modes/supports';
import { BracketsUtils } from 'vs/editor/common/modes/supports/richEditBrackets';
import { RichEditBrackets } from 'vs/editor/common/modes/supports/richEditBrackets';
import { IAutoClosingPairConditional, IBracketElectricCharacterContribution, StandardAutoClosingPairConditional } from 'vs/editor/common/modes/languageConfiguration';

/**
 * Interface used to support electric characters
 * @internal
 */
export interface IElectricAction {
	// Only one of the following properties should be defined:

	// The line will be indented at the same level of the line
	// which contains the matching given bracket type.
	matchOpenBracket?: string;

	// The text will be appended after the electric character.
	appendText?: string;

	// The number of characters to advance the cursor, useful with appendText
	advanceCount?: number;
}

export class BracketElectricCharacterSupport {

	private readonly _richEditBrackets: RichEditBrackets;
	private readonly _complexAutoClosePairs: StandardAutoClosingPairConditional[];

	constructor(richEditBrackets: RichEditBrackets, autoClosePairs: IAutoClosingPairConditional[], contribution: IBracketElectricCharacterContribution) {
		contribution = contribution || {};
		this._richEditBrackets = richEditBrackets;
		this._complexAutoClosePairs = autoClosePairs.filter(pair => pair.open.length > 1 && !!pair.close).map(el => new StandardAutoClosingPairConditional(el));
		if (contribution.docComment) {
			// IDocComment is legacy, only partially supported
			this._complexAutoClosePairs.push(new StandardAutoClosingPairConditional({ open: contribution.docComment.open, close: contribution.docComment.close }));
		}
	}

	public getElectricCharacters(): string[] {
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

	public onElectricCharacter(context: ScopedLineTokens, offset: number): IElectricAction {
		if (context.getTokenCount() === 0) {
			return null;
		}

		return (this._onElectricAutoClose(context, offset) ||
			this._onElectricAutoIndent(context, offset));
	}

	private _onElectricAutoIndent(context: ScopedLineTokens, offset: number): IElectricAction {

		if (!this._richEditBrackets || this._richEditBrackets.brackets.length === 0) {
			return null;
		}

		let reversedBracketRegex = this._richEditBrackets.reversedRegex;

		let lineText = context.getLineContent();
		let tokenIndex = context.findTokenIndexAtOffset(offset);
		let tokenStart = context.getTokenStartOffset(tokenIndex);
		let tokenEnd = offset + 1;

		var firstNonWhitespaceIndex = strings.firstNonWhitespaceIndex(context.getLineContent());
		if (firstNonWhitespaceIndex !== -1 && firstNonWhitespaceIndex < tokenStart) {
			return null;
		}

		if (!ignoreBracketsInToken(context.getStandardTokenType(tokenIndex))) {
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

	private _onElectricAutoClose(context: ScopedLineTokens, offset: number): IElectricAction {

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
			let lastTokenIndex = context.findTokenIndexAtOffset(offset);
			if (line.substring(context.getTokenStartOffset(lastTokenIndex), offset + 1/* include electric char*/) !== pair.open) {
				continue;
			}

			// If we're in a scope listed in 'notIn', do nothing
			if (!pair.isOK(context.getStandardTokenType(lastTokenIndex))) {
				continue;
			}

			return { appendText: pair.close };
		}

	}
}
