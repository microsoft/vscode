/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
'use strict';

import {TPromise} from 'vs/base/common/winjs.base';
import {IInplaceReplaceSupport, IInplaceReplaceSupportResult} from 'vs/editor/common/modes';
import {IRange} from 'vs/editor/common/editorCommon';
import {IResourceService} from 'vs/editor/common/services/resourceService';
import URI from 'vs/base/common/uri';

export class BasicInplaceReplace {

	public static INSTANCE = new BasicInplaceReplace();

	public navigateValueSet(range1:IRange, text1:string, range2:IRange, text2:string, up:boolean): IInplaceReplaceSupportResult {

		if (range1 && text1) {
			let result = this.doNavigateValueSet(text1, up);
			if (result) {
				return {
					range: range1,
					value: result
				};
			}
		}

		if (range2 && text2) {
			let result = this.doNavigateValueSet(text2, up);
			if (result) {
				return {
					range: range2,
					value: result
				};
			}
		}

		return null;
	}

	private doNavigateValueSet(text:string, up:boolean): string {
		let numberResult = this.numberReplace(text, up);
		if (numberResult !== null) {
			return numberResult;
		}
		return this.textReplace(text, up);
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
		return this.valueSetsReplace(this._defaultValueSet, value, up);
	}

	private valueSetsReplace(valueSets:string[][], value:string, up:boolean):string {
		var result:string = null;
		for (let i = 0, len = valueSets.length; result === null && i < len; i++) {
			result = this.valueSetReplace(valueSets[i], value, up);
		}
		return result;
	}

	private valueSetReplace(valueSet:string[], value:string, up:boolean):string {
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

export interface IInplaceReplaceSupportCustomization {
	navigateValueSetFallback?: (resource: URI, range: IRange, up: boolean) => TPromise<IInplaceReplaceSupportResult>;
}

export class WorkerInplaceReplaceSupport implements IInplaceReplaceSupport {

	private resourceService: IResourceService;
	private _customization:IInplaceReplaceSupportCustomization;

	constructor(resourceService: IResourceService, customization: IInplaceReplaceSupportCustomization = null) {
		this._customization = customization;
		this.resourceService = resourceService;
	}

	public navigateValueSet(resource:URI, range:IRange, up:boolean):TPromise<IInplaceReplaceSupportResult> {
		let result = this.doNavigateValueSet(resource, range, up);
		if (result && result.value && result.range) {
			return TPromise.as(result);
		}
		if (this._customization && typeof this._customization.navigateValueSetFallback === 'function') {
			return this._customization.navigateValueSetFallback(resource, range, up);
		}
		return TPromise.as(null);
	}

	private doNavigateValueSet(resource:URI, range:IRange, up:boolean): IInplaceReplaceSupportResult {
		let model = this.resourceService.get(resource);
		if (range.startColumn === range.endColumn) {
			range.endColumn += 1;
		}

		let selectionText = model.getValueInRange(range);

		let	wordPos = model.getWordAtPosition({ lineNumber: range.startLineNumber, column: range.startColumn });
		let word: string = null;
		let wordRange: IRange = null;
		if (wordPos && wordPos.startColumn !== -1) {
			word = wordPos.word;
			wordRange = {
				startLineNumber: range.startLineNumber,
				endLineNumber: range.endLineNumber,
				startColumn: wordPos.startColumn,
				endColumn: wordPos.endColumn
			};
		}

		return BasicInplaceReplace.INSTANCE.navigateValueSet(range, selectionText, wordRange, word, up);
	}
}
