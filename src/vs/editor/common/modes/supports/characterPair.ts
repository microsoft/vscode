/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import { IAutoClosingPair, IAutoClosingPairConditional, CharacterPair } from 'vs/editor/common/modes';
import { ScopedLineTokens } from 'vs/editor/common/modes/supports';

export class CharacterPairSupport {

	private readonly _autoClosingPairs: IAutoClosingPairConditional[];
	private readonly _surroundingPairs: IAutoClosingPair[];

	constructor(config: { brackets?: CharacterPair[]; autoClosingPairs?: IAutoClosingPairConditional[], surroundingPairs?: IAutoClosingPair[] }) {
		this._autoClosingPairs = config.autoClosingPairs;
		if (!this._autoClosingPairs) {
			this._autoClosingPairs = config.brackets ? config.brackets.map(b => ({ open: b[0], close: b[1] })) : [];
		}
		this._surroundingPairs = config.surroundingPairs || this._autoClosingPairs;
	}

	public getAutoClosingPairs(): IAutoClosingPair[] {
		return this._autoClosingPairs;
	}

	public shouldAutoClosePair(character: string, context: ScopedLineTokens, offset: number): boolean {
		// Always complete on empty line
		if (context.getTokenCount() === 0) {
			return true;
		}

		var tokenIndex = context.findTokenIndexAtOffset(offset - 1);
		var tokenType = context.getTokenType(tokenIndex);

		for (var i = 0; i < this._autoClosingPairs.length; ++i) {
			if (this._autoClosingPairs[i].open === character) {
				if (this._autoClosingPairs[i].notIn) {
					for (var notInIndex = 0; notInIndex < this._autoClosingPairs[i].notIn.length; ++notInIndex) {
						if (tokenType.indexOf(this._autoClosingPairs[i].notIn[notInIndex]) > -1) {
							return false;
						}
					}
				}
				break;
			}
		}

		return true;
	}

	public getSurroundingPairs(): IAutoClosingPair[] {
		return this._surroundingPairs;
	}
}
