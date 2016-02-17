/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IInplaceReplaceSupport, IInplaceReplaceSupportResult} from 'vs/editor/common/modes';
import {ITokenizedModel, IRange} from 'vs/editor/common/editorCommon';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import URI from 'vs/base/common/uri';

export interface IReplaceSupportHelper {
	valueSetReplace(valueSet: string[], value: string, up: boolean): string;
	valueSetsReplace(valueSets: string[][], value: string, up: boolean): string;
}
class ReplaceSupportHelperImpl implements IReplaceSupportHelper {

	public valueSetsReplace(valueSets:string[][], value:string, up:boolean):string {
		var result:string = null;
		for (let i = 0, len = valueSets.length; result === null && i < len; i++) {
			result = this.valueSetReplace(valueSets[i], value, up);
		}
		return result;
	}

	public valueSetReplace(valueSet:string[], value:string, up:boolean):string {
		var idx = valueSet.indexOf(value);
		if(idx >= 0) {
			idx += up ? +1 : -1;
			if(idx < 0) {
				idx = valueSet.length - 1;
			} else {
				idx %= valueSet.length;
			}
			return valueSet[idx];
		}
		return null;
	}

}

export var ReplaceSupport: IReplaceSupportHelper = new ReplaceSupportHelperImpl();

function isFunction(something) {
	return typeof something === 'function';
}

export interface IInplaceReplaceSupportCustomization {
	textReplace?: (value: string, up: boolean) => string;
	navigateValueSetFallback?: (resource: URI, range: IRange, up: boolean) => TPromise<IInplaceReplaceSupportResult>;
}

export class AbstractInplaceReplaceSupport implements IInplaceReplaceSupport {

	private defaults: {
		textReplace: boolean;
		navigateValueSetFallback: boolean;
	};
	private customization:IInplaceReplaceSupportCustomization;

	constructor(customization: IInplaceReplaceSupportCustomization = null) {
		this.defaults = {
			textReplace: !customization || !isFunction(customization.textReplace),
			navigateValueSetFallback: !customization || !isFunction(customization.navigateValueSetFallback)
		};
		this.customization = customization;
	}

	public navigateValueSet(resource:URI, range:IRange, up:boolean):TPromise<IInplaceReplaceSupportResult> {
		var result = this.doNavigateValueSet(resource, range, up, true);
		if (result && result.value && result.range) {
			return TPromise.as(result);
		}
		if (this.defaults.navigateValueSetFallback) {
			return TPromise.as(null);
		}
		return this.customization.navigateValueSetFallback(resource, range, up);
	}

	private doNavigateValueSet(resource:URI, range:IRange, up:boolean, selection:boolean):IInplaceReplaceSupportResult {

		var model = this.getModel(resource),
			result:IInplaceReplaceSupportResult = { range:null, value: null },
			text:string;

		if(selection) {
			// Replace selection
			if(range.startColumn === range.endColumn) {
				range.endColumn += 1;
			}
			text = model.getValueInRange(range);
			result.range = range;
		} else {
			// Replace word
			var position = { lineNumber: range.startLineNumber, column: range.startColumn };
			var	wordPos = model.getWordAtPosition(position);

			if(!wordPos || wordPos.startColumn === -1) {
				return null;
			}
			text = wordPos.word;
			result.range = { startLineNumber : range.startLineNumber, endLineNumber: range.endLineNumber, startColumn: wordPos.startColumn, endColumn: wordPos.endColumn };
		}

		// Try to replace numbers or text
		var numberResult = this.numberReplace(text, up);
		if(numberResult !== null) {
			result.value = numberResult;
		} else {
			var textResult = this.textReplace(text, up);
			if(textResult !== null) {
				result.value = textResult;
			} else if(selection) {
				return this.doNavigateValueSet(resource, range, up, false);
			}
		}
		return result;
	}

	private numberReplace(value:string, up:boolean):string {
		var precision = Math.pow(10, value.length - (value.lastIndexOf('.') + 1)),
			n1 = Number(value),
			n2 = parseFloat(value);

		if(!isNaN(n1) && !isNaN(n2) && n1 === n2) {

			if(n1 === 0 && !up) {
				return null; // don't do negative
//			} else if(n1 === 9 && up) {
//				return null; // don't insert 10 into a number
			} else {
				n1 = Math.floor(n1 * precision);
				n1 += up ? precision : -precision;
				return String(n1 / precision);
			}
		}

		return null;
	}

	private _defaultValueSet: string[][] = [
		['true', 'false'],
		['True', 'False'],
		['Private', 'Public', 'Friend', 'ReadOnly', 'Partial', 'Protected', 'WriteOnly'],
		['public', 'protected', 'private'],
	];

	private textReplace(value:string, up:boolean):string {
		if (this.defaults.textReplace) {
			return ReplaceSupport.valueSetsReplace(this._defaultValueSet, value, up);
		}
		return this.customization.textReplace(value, up)
			|| ReplaceSupport.valueSetsReplace(this._defaultValueSet, value, up);
	}

	protected getModel(resource:URI): ITokenizedModel {
		throw new Error('Not implemented');
	}
}

export class WorkerInplaceReplaceSupport extends AbstractInplaceReplaceSupport {

	private resourceService: IResourceService;

	constructor(resourceService: IResourceService, customization: IInplaceReplaceSupportCustomization = null) {
		super(customization);
		this.resourceService = resourceService;
	}

	protected getModel(resource:URI): ITokenizedModel {
		return this.resourceService.get(resource);
	}
}
