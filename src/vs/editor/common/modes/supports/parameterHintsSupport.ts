/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import URI from 'vs/base/common/uri';
import {TPromise} from 'vs/base/common/winjs.base';
import {IPosition} from 'vs/editor/common/editorCommon';
import {ILineContext, IMode, IParameterHints, IParameterHintsSupport} from 'vs/editor/common/modes';
import {handleEvent, isLineToken} from 'vs/editor/common/modes/supports';

export interface IParameterHintsContribution {
	triggerCharacters: string[];
	excludeTokens: string[];
	getParameterHints: (resource: URI, position: IPosition) => TPromise<IParameterHints>;
}

export class ParameterHintsSupport implements IParameterHintsSupport {

	private _modeId: string;
	private contribution: IParameterHintsContribution;

	constructor(modeId: string, contribution: IParameterHintsContribution) {
		this._modeId = modeId;
		this.contribution = contribution;
	}

	public getParameterHintsTriggerCharacters(): string[]
	{
		return this.contribution.triggerCharacters;
	}

	public shouldTriggerParameterHints(context: ILineContext, offset: number): boolean
	{
		return handleEvent(context, offset, (nestedMode:IMode, context:ILineContext, offset:number) => {
			if (this._modeId === nestedMode.getId()) {
				if (!Array.isArray(this.contribution.excludeTokens)) {
					return true;
				}
				if (this.contribution.excludeTokens.length === 1 && this.contribution.excludeTokens[0] === '*') {
					return false;
				}
				return !isLineToken(context, offset-1, this.contribution.excludeTokens);
			} else if (nestedMode.parameterHintsSupport) {
				return nestedMode.parameterHintsSupport.shouldTriggerParameterHints(context, offset);
			} else {
				return false;
			}
		});
	}
	public getParameterHints(resource: URI, position: IPosition): TPromise<IParameterHints> {
		return this.contribution.getParameterHints(resource, position);
	}
}
