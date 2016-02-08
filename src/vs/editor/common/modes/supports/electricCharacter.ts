/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {Brackets} from 'vs/editor/common/modes/autoIndentation';
import * as Modes from 'vs/editor/common/modes';
import {handleEvent} from 'vs/editor/common/modes/supports';

export interface IBracketElectricCharacterContribution {
	brackets: Modes.IBracketPair[];
	regexBrackets?: Modes.IRegexBracketPair[];
	docComment?: Modes.IDocComment;
	caseInsensitive?: boolean;
	embeddedElectricCharacters?: string[];
}

export class BracketElectricCharacterSupport implements Modes.IRichEditElectricCharacter {

	private _modeId: string;
	private contribution: IBracketElectricCharacterContribution;
	private brackets: Brackets;

	constructor(modeId: string, contribution: IBracketElectricCharacterContribution) {
		this._modeId = modeId;
		this.contribution = contribution;
		this.brackets = new Brackets(contribution.brackets, contribution.regexBrackets,
			contribution.docComment, contribution.caseInsensitive);
	}

	public getElectricCharacters(): string[]{
		if (Array.isArray(this.contribution.embeddedElectricCharacters)) {
			return this.contribution.embeddedElectricCharacters.concat(this.brackets.getElectricCharacters());
		}
		return this.brackets.getElectricCharacters();
	}

	public onElectricCharacter(context:Modes.ILineContext, offset:number): Modes.IElectricAction {
		return handleEvent(context, offset, (nestedMode:Modes.IMode, context:Modes.ILineContext, offset:number) => {
			if (this._modeId === nestedMode.getId()) {
				return this.brackets.onElectricCharacter(context, offset);
			} else if (nestedMode.richEditSupport && nestedMode.richEditSupport.electricCharacter) {
				return nestedMode.richEditSupport.electricCharacter.onElectricCharacter(context, offset);
			} else {
				return null;
			}
		});
	}

	public onEnter(context: Modes.ILineContext, offset: number): Modes.IEnterAction {
		return handleEvent(context, offset, (nestedMode:Modes.IMode, context:Modes.ILineContext, offset:number) => {
			if (this._modeId === nestedMode.getId()) {
				return this.brackets.onEnter(context, offset);
			} else if (nestedMode.richEditSupport && nestedMode.richEditSupport.electricCharacter) {
				return nestedMode.richEditSupport.electricCharacter.onEnter(context, offset);
			} else {
				return null;
			}
		});
	}
}
