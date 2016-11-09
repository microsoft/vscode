/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { ScopedLineTokens } from 'vs/editor/common/modes/supports';
import { CharacterPair, IAutoClosingPair, IAutoClosingPairConditional, StandardAutoClosingPairConditional } from 'vs/editor/common/modes/languageConfiguration';

export class CharacterPairSupport {

	private readonly _autoClosingPairs: StandardAutoClosingPairConditional[];
	private readonly _surroundingPairs: IAutoClosingPair[];

	constructor(config: { brackets?: CharacterPair[]; autoClosingPairs?: IAutoClosingPairConditional[], surroundingPairs?: IAutoClosingPair[] }) {
		if (config.autoClosingPairs) {
			this._autoClosingPairs = config.autoClosingPairs.map(el => new StandardAutoClosingPairConditional(el));
		} else if (config.brackets) {
			this._autoClosingPairs = config.brackets.map(b => new StandardAutoClosingPairConditional({ open: b[0], close: b[1] }));
		} else {
			this._autoClosingPairs = [];
		}

		this._surroundingPairs = config.surroundingPairs || this._autoClosingPairs;
	}

	public getAutoClosingPairs(): IAutoClosingPair[] {
		return this._autoClosingPairs;
	}

	public shouldAutoClosePair(character: string, context: ScopedLineTokens, column: number): boolean {
		// Always complete on empty line
		if (context.getTokenCount() === 0) {
			return true;
		}

		let tokenIndex = context.findTokenIndexAtOffset(column - 2);
		let standardTokenType = context.getStandardTokenType(tokenIndex);

		for (let i = 0; i < this._autoClosingPairs.length; ++i) {
			let autoClosingPair = this._autoClosingPairs[i];

			if (autoClosingPair.open === character) {
				return autoClosingPair.isOK(standardTokenType);
			}
		}

		return true;
	}

	public getSurroundingPairs(): IAutoClosingPair[] {
		return this._surroundingPairs;
	}
}
