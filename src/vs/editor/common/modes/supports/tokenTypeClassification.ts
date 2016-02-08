/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import * as Modes from 'vs/editor/common/modes';
import {NullMode} from 'vs/editor/common/modes/nullMode';

export interface ITokenTypeClassificationSupportContribution {
	wordDefinition?: RegExp;
}

export class TokenTypeClassificationSupport implements Modes.IRichEditTokenTypeClassification {

	private _contribution: ITokenTypeClassificationSupportContribution;

	constructor(contribution: ITokenTypeClassificationSupportContribution) {
		this._contribution = contribution;
	}

	public getWordDefinition(): RegExp {
		if (typeof this._contribution.wordDefinition === 'undefined') {
			return NullMode.DEFAULT_WORD_REGEXP;
		}
		return this._contribution.wordDefinition;
	}
}
