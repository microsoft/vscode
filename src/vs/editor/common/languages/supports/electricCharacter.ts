/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { distinct } from '../../../../base/common/arrays.js';
import { ScopedLineTokens, ignoreBracketsInToken } from '../supports.js';
import { BracketsUtils, RichEditBrackets } from './richEditBrackets.js';

/**
 * Interface used to support electric characters
 * @internal
 */
export interface IElectricAction {
	// The line will be indented at the same level of the line
	// which contains the matching given bracket type.
	matchOpenBracket: string;
}

export class BracketElectricCharacterSupport {

	private readonly _richEditBrackets: RichEditBrackets | null;

	constructor(richEditBrackets: RichEditBrackets | null) {
		this._richEditBrackets = richEditBrackets;
	}

	public getElectricCharacters(): string[] {
		const result: string[] = [];

		if (this._richEditBrackets) {
			for (const bracket of this._richEditBrackets.brackets) {
				for (const close of bracket.close) {
					const lastChar = close.charAt(close.length - 1);
					result.push(lastChar);
				}
			}
		}

		return distinct(result);
	}

	public onElectricCharacter(character: string, context: ScopedLineTokens, column: number): IElectricAction | null {
		if (!this._richEditBrackets || this._richEditBrackets.brackets.length === 0) {
			return null;
		}

		const tokenIndex = context.findTokenIndexAtOffset(column - 1);
		if (ignoreBracketsInToken(context.getStandardTokenType(tokenIndex))) {
			return null;
		}

		const reversedBracketRegex = this._richEditBrackets.reversedRegex;
		const text = context.getLineContent().substring(0, column - 1) + character;

		const r = BracketsUtils.findPrevBracketInRange(reversedBracketRegex, 1, text, 0, text.length);
		if (!r) {
			return null;
		}

		const bracketText = text.substring(r.startColumn - 1, r.endColumn - 1).toLowerCase();

		const isOpen = this._richEditBrackets.textIsOpenBracket[bracketText];
		if (isOpen) {
			return null;
		}

		const textBeforeBracket = context.getActualLineContentBefore(r.startColumn - 1);
		if (!/^\s*$/.test(textBeforeBracket)) {
			// There is other text on the line before the bracket
			return null;
		}

		return {
			matchOpenBracket: bracketText
		};
	}
}
