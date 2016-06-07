/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {IAutoClosingPair, IAutoClosingPairConditional, ILineContext, IRichEditCharacterPair, CharacterPair} from 'vs/editor/common/modes';
import {handleEvent} from 'vs/editor/common/modes/supports';
import {LanguageConfigurationRegistryImpl} from 'vs/editor/common/modes/languageConfigurationRegistry';

export class CharacterPairSupport implements IRichEditCharacterPair {

	private _registry: LanguageConfigurationRegistryImpl;
	private _modeId: string;
	private _autoClosingPairs: IAutoClosingPairConditional[];
	private _surroundingPairs: IAutoClosingPair[];

	constructor(registry: LanguageConfigurationRegistryImpl, modeId: string, config: { brackets?: CharacterPair[]; autoClosingPairs?: IAutoClosingPairConditional[], surroundingPairs?: IAutoClosingPair[]}) {
		this._registry = registry;
		this._modeId = modeId;
		this._autoClosingPairs = config.autoClosingPairs;
		if (!this._autoClosingPairs) {
			this._autoClosingPairs = config.brackets ? config.brackets.map(b => ({ open: b[0], close: b[1] })) : [];
		}
		this._surroundingPairs = config.surroundingPairs || this._autoClosingPairs;
	}

	public getAutoClosingPairs(): IAutoClosingPair[] {
		return this._autoClosingPairs;
	}

	public shouldAutoClosePair(character:string, context:ILineContext, offset:number): boolean {
		return handleEvent(context, offset, (nestedModeId:string, context:ILineContext, offset:number) => {
			if (this._modeId === nestedModeId) {

				// Always complete on empty line
				if (context.getTokenCount() === 0) {
					return true;
				}

				var tokenIndex = context.findIndexOfOffset(offset - 1);
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

			let characterPairSupport = this._registry.getCharacterPairSupport(nestedModeId);
			if (characterPairSupport) {
				return characterPairSupport.shouldAutoClosePair(character, context, offset);
			}

			return null;
		});
	}

	public getSurroundingPairs(): IAutoClosingPair[]{
		return this._surroundingPairs;
	}
}
