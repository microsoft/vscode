/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CharacterPair, IAutoClosingPair, IAutoClosingPairConditional, StandardAutoClosingPairConditional } from 'vs/editor/common/modes/languageConfiguration';
import { ScopedLineTokens } from 'vs/editor/common/modes/supports';

export class CharacterPairSupport {

	static readonly DEFAULT_AUTOCLOSE_BEFORE_LANGUAGE_DEFINED = ';:.,=}])> \n\t';
	static readonly DEFAULT_AUTOCLOSE_BEFORE_WHITESPACE = ' \n\t';

	private readonly _autoClosingPairs: StandardAutoClosingPairConditional[];
	private readonly _surroundingPairs: IAutoClosingPair[];
	private readonly _autoCloseBefore: string;

	constructor(config: { brackets?: CharacterPair[]; autoClosingPairs?: IAutoClosingPairConditional[], surroundingPairs?: IAutoClosingPair[], autoCloseBefore?: string }) {
		if (config.autoClosingPairs) {
			this._autoClosingPairs = config.autoClosingPairs.map(el => new StandardAutoClosingPairConditional(el));
		} else if (config.brackets) {
			this._autoClosingPairs = config.brackets.map(b => new StandardAutoClosingPairConditional({ open: b[0], close: b[1] }));
		} else {
			this._autoClosingPairs = [];
		}

		this._autoCloseBefore = typeof config.autoCloseBefore === 'string' ? config.autoCloseBefore : CharacterPairSupport.DEFAULT_AUTOCLOSE_BEFORE_LANGUAGE_DEFINED;

		this._surroundingPairs = config.surroundingPairs || this._autoClosingPairs;
	}

	public getAutoClosingPairs(): IAutoClosingPair[] {
		return this._autoClosingPairs;
	}

	public getAutoCloseBeforeSet(): string {
		return this._autoCloseBefore;
	}

	public shouldAutoClosePair(character: string, context: ScopedLineTokens, column: number): boolean {
		// Always complete on empty line
		if (context.getTokenCount() === 0) {
			return true;
		}

		let tokenIndex = context.findTokenIndexAtOffset(column - 2);
		let standardTokenType = context.getStandardTokenType(tokenIndex);

		for (const autoClosingPair of this._autoClosingPairs) {
			if (autoClosingPair.open === character) {
				return autoClosingPair.isOK(standardTokenType);
			}
		}

		return false;
	}

	public getSurroundingPairs(): IAutoClosingPair[] {
		return this._surroundingPairs;
	}
}
