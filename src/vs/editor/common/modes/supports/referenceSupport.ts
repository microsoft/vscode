/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import * as Modes from 'vs/editor/common/modes';
import EditorCommon = require('vs/editor/common/editorCommon');
import URI from 'vs/base/common/uri';
import {handleEvent, isLineToken} from 'vs/editor/common/modes/supports';

export interface IReferenceContribution {
	tokens: string[];
	findReferences: (resource: URI, position: EditorCommon.IPosition, includeDeclaration: boolean) => TPromise<Modes.IReference[]>;
}

export class ReferenceSupport implements Modes.IReferenceSupport {

	private _modeId: string;
	private contribution: IReferenceContribution;

	/**
	 * Provide the token type postfixes for the tokens where a reference can be found in the 'tokens' argument.
	 */
	constructor(modeId: string, contribution: IReferenceContribution) {
		this._modeId = modeId;
		this.contribution = contribution;
	}

	public canFindReferences(context: Modes.ILineContext, offset:number):boolean {
		return handleEvent(context, offset, (nestedMode:Modes.IMode, context:Modes.ILineContext, offset:number) => {
			if (this._modeId === nestedMode.getId()) {
				return (!Array.isArray(this.contribution.tokens) ||
					this.contribution.tokens.length < 1 ||
					isLineToken(context, offset, this.contribution.tokens));
			} else if (nestedMode.referenceSupport) {
				return nestedMode.referenceSupport.canFindReferences(context, offset);
			} else {
				return false;
			}
		});
	}

	public findReferences(resource: URI, position: EditorCommon.IPosition, includeDeclaration: boolean): TPromise<Modes.IReference[]> {
		return this.contribution.findReferences(resource, position, includeDeclaration);
	}
}
