/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IPosition} from 'vs/editor/common/editorCommon';
import {IDeclarationSupport, ILineContext, IMode, IReference} from 'vs/editor/common/modes';
import {handleEvent, isLineToken} from 'vs/editor/common/modes/supports';

export interface IDeclarationContribution {
	tokens?: string[];
	findDeclaration: (resource: URI, position: IPosition) => TPromise<IReference>;
}
export class DeclarationSupport implements IDeclarationSupport {

	private _modeId: string;
	private contribution: IDeclarationContribution;

	/**
	 * Provide the token type postfixes for the tokens where a declaration can be found in the 'tokens' argument.
	 */
	constructor(modeId: string, contribution: IDeclarationContribution) {
		this._modeId = modeId;
		this.contribution = contribution;
	}

	public canFindDeclaration(context: ILineContext, offset:number):boolean {
		return handleEvent(context, offset, (nestedMode:IMode, context:ILineContext, offset:number) => {
			if (this._modeId === nestedMode.getId()) {
				return (!Array.isArray(this.contribution.tokens) ||
					this.contribution.tokens.length < 1 ||
					isLineToken(context, offset, this.contribution.tokens));
			} else if (nestedMode.declarationSupport) {
				return nestedMode.declarationSupport.canFindDeclaration(context, offset);
			} else {
				return false;
			}
		});
	}

	public findDeclaration(resource: URI, position: IPosition): TPromise<IReference>{
		return this.contribution.findDeclaration(resource, position);
	}
}
