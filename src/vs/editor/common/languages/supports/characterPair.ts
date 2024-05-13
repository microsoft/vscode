/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IAutoClosingPair, StandardAutoClosingPairConditional, LanguageConfiguration } from 'vs/editor/common/languages/languageConfiguration';

export class CharacterPairSupport {

	static readonly DEFAULT_AUTOCLOSE_BEFORE_LANGUAGE_DEFINED_QUOTES = ';:.,=}])> \n\t';
	static readonly DEFAULT_AUTOCLOSE_BEFORE_LANGUAGE_DEFINED_BRACKETS = '\'"`;:.,=}])> \n\t';
	static readonly DEFAULT_AUTOCLOSE_BEFORE_WHITESPACE = ' \n\t';

	private readonly _autoClosingPairs: StandardAutoClosingPairConditional[];
	private readonly _surroundingPairs: IAutoClosingPair[];
	private readonly _autoCloseBeforeForQuotes: string;
	private readonly _autoCloseBeforeForBrackets: string;

	constructor(config: LanguageConfiguration) {
		if (config.autoClosingPairs) {
			this._autoClosingPairs = config.autoClosingPairs.map(el => new StandardAutoClosingPairConditional(el));
		} else if (config.brackets) {
			this._autoClosingPairs = config.brackets.map(b => new StandardAutoClosingPairConditional({ open: b[0], close: b[1] }));
		} else {
			this._autoClosingPairs = [];
		}

		if (config.__electricCharacterSupport && config.__electricCharacterSupport.docComment) {
			const docComment = config.__electricCharacterSupport.docComment;
			// IDocComment is legacy, only partially supported
			this._autoClosingPairs.push(new StandardAutoClosingPairConditional({ open: docComment.open, close: docComment.close || '' }));
		}

		this._autoCloseBeforeForQuotes = typeof config.autoCloseBefore === 'string' ? config.autoCloseBefore : CharacterPairSupport.DEFAULT_AUTOCLOSE_BEFORE_LANGUAGE_DEFINED_QUOTES;
		this._autoCloseBeforeForBrackets = typeof config.autoCloseBefore === 'string' ? config.autoCloseBefore : CharacterPairSupport.DEFAULT_AUTOCLOSE_BEFORE_LANGUAGE_DEFINED_BRACKETS;

		this._surroundingPairs = config.surroundingPairs || this._autoClosingPairs;
	}

	public getAutoClosingPairs(): StandardAutoClosingPairConditional[] {
		return this._autoClosingPairs;
	}

	public getAutoCloseBeforeSet(forQuotes: boolean): string {
		return (forQuotes ? this._autoCloseBeforeForQuotes : this._autoCloseBeforeForBrackets);
	}

	public getSurroundingPairs(): IAutoClosingPair[] {
		return this._surroundingPairs;
	}
}
